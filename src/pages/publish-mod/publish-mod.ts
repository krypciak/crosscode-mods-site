import '../../main'
import './publish-mod-style.css'
import { getGithubToken, isLoggedIn } from '../../auth'
import {
    Console,
    dbSelect,
    Editor,
    fillDbSelectWithOptions,
    getCurrentlySelectedBranch,
    githubRepoInfoCache,
    githubUserInfoCache,
} from '../../ui-common'
import { extractCCMod, type ExtractedCcmod } from '../../ccmoddb/zip'
import type { LocalizedString, PkgCCMod } from 'ccmoddb/build/src/types'
import { getUserInfo, isUserAdmin } from '../../user-info'
import { getErrorMessage } from '../../error-msg'
import { ccmodCheck } from '../../ccmoddb/ccmod-check'
import { PASS_SYM } from '../../colors-and-symbols'
import { ccmodModPublishCheck, getPermissionsToActOnModPublishRequest } from '../../ccmoddb/mod-publish-request'
import { fetchModPublishRequests, githubAssetDownload, submitModPublishRequest } from '../../server-endpoints'
import type { ModPublishRequest, ModPublishRequestActPermissions } from '../../ccmoddb/mod-publish-request'
import { branches } from '../../ccmoddb/branch'

const form = document.getElementById('publish-form') as HTMLFormElement
const publishLayout = document.querySelector<HTMLDivElement>('.publish-layout')!
const urlInput = document.getElementById('mod-url') as HTMLInputElement
const sourceInput = document.getElementById('source') as HTMLInputElement
const consoleMount = document.getElementById('console-output') as HTMLDivElement
const ccmodPreviewMount = document.getElementById('ccmod-preview') as HTMLDivElement
const requestsContainer = document.getElementById('requests-container') as HTMLDivElement

const checkButton = document.getElementById('check-button') as HTMLInputElement
const publishButton = document.getElementById('publish-button') as HTMLInputElement

fillDbSelectWithOptions()
hookButtons()

updateFormVisibility()

const ccmodPreviewEditor = new Editor({
    mount: ccmodPreviewMount,
    editable: false,
})

const con = new Console(consoleMount)
con.hookWindowConsole()

fetchModPublishRequestsAndUpdateUi()

let currentCCMod: PkgCCMod | undefined
let requests: ModPublishRequest[] = []

async function updateFormVisibility() {
    const loggedIn = await isLoggedIn()
    publishLayout.classList.toggle('logged-out', !loggedIn)
}

async function check(): Promise<boolean> {
    const modUrl = urlInput.value.trim()
    if (!modUrl) return false
    const source = sourceInput.value?.trim() ?? ''

    con.clear()
    con.append('[info]', 'downloading', `"${modUrl}"`)
    let modArchive: Uint8Array
    try {
        new URL(modUrl)
        modArchive = await githubAssetDownload(modUrl)
    } catch (e) {
        con.append('[error]', 'invalid url!', getErrorMessage(e))
        return false
    }
    con.append('[info]', 'downloaded')

    const isCCMod = modUrl.endsWith('.ccmod')
    let result: ExtractedCcmod
    try {
        result = extractCCMod(modArchive, isCCMod, source)
    } catch (e) {
        con.append('[error]', getErrorMessage(e))
        return false
    }

    ccmodPreviewEditor.setText(result.text)

    const branch = getCurrentlySelectedBranch()
    let ccmod: PkgCCMod
    try {
        const res = await ccmodCheck({
            ccmodText: result.text,
            branch,
            log: text => con.append('[info]', text),
        })
        ccmod = res.ccmod
    } catch (e) {
        con.append('[error]', 'error while checking ccmod', e)
        return false
    }

    if (requests.find(request => request.ccmod.id == ccmod.id)) {
        con.append('[error]', 'a request with the same mod id is already pending!')
        return false
    }

    const token = await getGithubToken()
    if (!token) return false

    try {
        const userInfo = await getUserInfo(token, githubUserInfoCache)
        if (!userInfo) throw new Error('user info fetch failed, invalid github token?')

        const isAdmin = await isUserAdmin(token, branch, githubRepoInfoCache)
        await ccmodModPublishCheck({ ccmod, branch, userInfo, isAdmin })
    } catch (e) {
        con.append('[error]', getErrorMessage(e))
        return false
    }

    con.append('[info]', PASS_SYM, 'all checks passed!')

    currentCCMod = ccmod
    return true
}

async function publish(): Promise<void> {
    const modUrl = urlInput.value.trim()

    const token = await getGithubToken()
    if (!token) return

    con.append('[info]', 'publish')

    const branch = getCurrentlySelectedBranch()
    const source = sourceInput.value?.trim() ?? ''

    try {
        if (!currentCCMod) throw new Error('currentCCMod undefined somehow?')
        await submitModPublishRequest({ token, modId: currentCCMod.id, url: modUrl, branch: branch.getName(), source })
    } catch (e) {
        con.append('[error]', getErrorMessage(e))
        return
    }

    con.append('[info]', `submitted!`)

    await fetchModPublishRequestsAndUpdateUi()
}

function hookButtons() {
    const onChange = () => {
        publishButton.disabled = true
    }
    urlInput.addEventListener('change', onChange)
    sourceInput.addEventListener('change', onChange)
    dbSelect.addEventListener('change', onChange)

    checkButton.onclick = async () => {
        const success = await check()

        publishButton.disabled = !success
        if (!success) return
    }
    publishButton.onclick = publish
    form.onsubmit = () => false
}

/* requests sidebar */
async function fetchModPublishRequestsAndUpdateUi() {
    function createRequestsMessage(text: string): HTMLElement {
        const message = document.createElement('span')
        message.className = 'requests-message'
        message.textContent = text
        return message
    }

    try {
        const requestsRecord = await fetchModPublishRequests()
        requests = Object.values(requestsRecord).sort((a, b) => b.submitDate - a.submitDate)
    } catch (e) {
        con.append('[error]', 'failed to fetch mod publish requests', getErrorMessage(e))
        requestsContainer.replaceChildren(createRequestsMessage('failed to load publish requests'))
        return
    }

    if (requests.length == 0) {
        requestsContainer.replaceChildren(createRequestsMessage('no publish requests pending'))
        return
    }

    const branchPermissions: Record<string, ModPublishRequestActPermissions> = {}
    const tokenPromise = getGithubToken()
    const userInfoPromise = tokenPromise.then(token => (token ? getUserInfo(token, githubUserInfoCache) : undefined))
    const getBranchPermissions = async (request: ModPublishRequest) => {
        const token = await tokenPromise
        const userInfo = await userInfoPromise

        return (branchPermissions[request.branchName] ??= getPermissionsToActOnModPublishRequest({
            request,
            userInfo,
            isAdmin: token ? await isUserAdmin(token, branches[request.branchName], githubRepoInfoCache) : false,
        }))
    }

    requestsContainer.replaceChildren(...requests.map(req => createRequestCard(req, getBranchPermissions(req))))
}

function createRequestCard(
    request: ModPublishRequest,
    branchPermissionsPromise: Promise<ModPublishRequestActPermissions>
): HTMLElement {
    const card = document.createElement('div')
    card.className = 'request-card'

    const title = document.createElement('strong')
    title.className = 'request-card-title'
    title.textContent = getLocalizedString(request.ccmod.title) ?? request.ccmod.id

    const header = document.createElement('span')
    header.className = 'request-card-header'
    header.append(title, createVersionInfo(request.ccmod.version!, request.oldVersion))
    card.append(header)

    const meta = document.createElement('span')
    meta.className = 'request-card-meta'
    meta.append(
        createAuthorGithubAvatar(request),
        'by ' + request.user,
        '· ' + request.branchName.split('/').pop(),
        '· ' + formatRequestDate(request.submitDate)
    )
    card.append(meta)

    const repo = request.ccmod.repository
    if (repo) card.append(createLabeledLink('repo', repo))

    card.append(createLabeledLink('archive', request.modUrl))

    card.append(createActionButtons(request, branchPermissionsPromise))

    return card
}

function createVersionInfo(newVersion: string, oldVersion: string | undefined): HTMLElement {
    const version = document.createElement('span')
    version.className = 'request-card-version'

    if (!oldVersion) {
        const label = document.createElement('span')
        label.className = 'request-card-version-new'
        label.textContent = 'new'

        version.append(label, ' ', newVersion)
    } else {
        version.append(oldVersion)

        const arrow = document.createElement('span')
        arrow.className = 'request-card-version-arrow'
        arrow.textContent = '\u2192'
        version.append(' ', arrow, ' ', newVersion)
    }

    return version
}

const ACCEPT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>`
const REJECT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>`
function createActionButtons(
    request: ModPublishRequest,
    branchPermissionsPromise: Promise<ModPublishRequestActPermissions>
): HTMLElement {
    const actions = document.createElement('div')
    actions.className = 'request-card-actions'

    function createActionButton(type: 'accept' | 'reject', icon: string, onclick: () => unknown) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'request-card-action ' + 'request-card-' + type
        button.title = type
        button.setAttribute('aria-label', type)
        button.innerHTML = icon
        button.dataset.modId = request.ccmod.id

        button.onclick = onclick

        button.disabled = true
        branchPermissionsPromise.then(perms => (button.disabled = !perms?.[type]))

        actions.append(button)
    }

    createActionButton('accept', ACCEPT_ICON, () => onModPublishRequestAccept(request))
    createActionButton('reject', REJECT_ICON, () => onModPublishRequestReject(request))

    return actions
}

function createAuthorGithubAvatar(request: ModPublishRequest): HTMLImageElement {
    const img = document.createElement('img')
    img.className = 'githubAvatar'
    img.src = request.userAvatarUrl
    img.alt = request.user + ' avatar'
    img.loading = 'lazy'
    img.decoding = 'async'
    return img
}

function createLabeledLink(label: string, url: string): HTMLElement {
    const row = document.createElement('span')
    row.className = 'request-card-link-row'

    const labelElement = document.createElement('span')
    labelElement.className = 'request-card-link-label'
    labelElement.textContent = label + ':'

    row.append(labelElement, createExternalLink(url))
    return row
}

function createExternalLink(url: string): HTMLAnchorElement {
    const link = document.createElement('a')
    link.className = 'request-card-url'
    link.href = url
    link.target = '_blank'
    link.rel = 'noreferrer'
    link.textContent = url
    return link
}

function formatRequestDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

function getLocalizedString(value: LocalizedString | undefined): string | undefined {
    if (value == undefined) return
    if (typeof value == 'string') return value
    return value['en_US'] ?? Object.values(value)[0]
}

async function onModPublishRequestAccept(request: ModPublishRequest) {
    console.log('accept', request)
}

async function onModPublishRequestReject(request: ModPublishRequest) {
    console.log('reject', request)
}
