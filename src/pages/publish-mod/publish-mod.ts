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
import { getCCModJsonFileFromUnzippedModArchive, unzipModArchive } from '../../ccmoddb/zip'
import type { LocalizedString, PkgCCMod } from 'ccmoddb/build/src/types'
import { getUserInfo, isUserAdmin } from '../../user-info'
import { getErrorMessage } from '../../error-msg'
import { ccmodCheck } from '../../ccmoddb/ccmod-check'
import { PASS_SYM } from '../../colors-and-symbols'
import {
    ccmodModPublishCheck,
    getPermissionsToActOnModPublishRequest,
    hasRequestPendingAlready,
} from '../../ccmoddb/mod-publish-request'
import {
    fetchModPublishRequests,
    githubAssetDownload,
    sendModPublishRequestAction,
    submitModPublishRequest,
} from '../../server-endpoints'
import type {
    ModPublishRequest,
    ModPublishRequestActionType,
    ModPublishRequestActPermissions,
    ModPublishRequestsRecord,
} from '../../ccmoddb/mod-publish-request'
import { branches } from '../../ccmoddb/branch'
import type { Unzipped } from 'fflate'

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
let requests: ModPublishRequestsRecord = {}

async function updateFormVisibility() {
    const loggedIn = await isLoggedIn()
    publishLayout.classList.toggle('logged-out', !loggedIn)
}

async function check(): Promise<boolean> {
    const modUrl = urlInput.value.trim()
    if (!modUrl) return false
    let source = sourceInput.value?.trim() ?? ''

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
    let unzipped: Unzipped
    let ccmodText: string
    try {
        unzipped = await unzipModArchive(modArchive)
        ;({ ccmodText, source } = getCCModJsonFileFromUnzippedModArchive(unzipped, isCCMod, source))
    } catch (e) {
        con.append('[error]', getErrorMessage(e))
        return false
    }

    sourceInput.value = source

    ccmodPreviewEditor.setText(ccmodText)

    const branch = getCurrentlySelectedBranch()
    let ccmod: PkgCCMod
    try {
        const res = await ccmodCheck({
            ccmodText,
            branch,
            log: text => con.append('[info]', text),
        })
        ccmod = res.ccmod
    } catch (e) {
        con.append('[error]', 'error while checking ccmod', getErrorMessage(e))
        return false
    }

    if (hasRequestPendingAlready(requests, branch.getName(), ccmod.id)) {
        con.append('[error]', 'a request with the same mod id is already pending!')
        return false
    }

    const token = await getGithubToken()
    if (!token) return false

    try {
        const userInfo = await getUserInfo(token, githubUserInfoCache, 'github_user')
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

    publishButton.disabled = true

    con.append('[info]', 'sending publish request...')

    const branch = getCurrentlySelectedBranch()
    const source = sourceInput.value?.trim() ?? ''

    try {
        if (!currentCCMod) throw new Error('currentCCMod undefined somehow?')
        await submitModPublishRequest({
            token,
            modId: currentCCMod.id,
            url: modUrl,
            branch: branch.getName(),
            source,
        })
    } catch (e) {
        con.append('[error]', 'server error:', getErrorMessage(e))
        return
    }

    con.append('[info]', `submitted succesfully!`)

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
function createRequestsMessage(text: string): HTMLElement {
    const message = document.createElement('span')
    message.className = 'requests-message'
    message.textContent = text
    return message
}

async function fetchModPublishRequestsAndUpdateUi() {
    try {
        requests = await fetchModPublishRequests()
    } catch (e) {
        con.append('[error]', 'failed to fetch mod publish requests', getErrorMessage(e))
        requestsContainer.replaceChildren(createRequestsMessage('failed to load publish requests'))
        return
    }
    updateRequetsUi()
}

function updateRequetsUi() {
    const requestsArray = Object.values(requests)
    requestsArray.sort((a, b) => b.submitDate - a.submitDate)

    if (requestsArray.length == 0) {
        requestsContainer.replaceChildren(createRequestsMessage('no publish requests pending'))
        return
    }

    const branchPermissions: Record<string, ModPublishRequestActPermissions> = {}
    const tokenPromise = getGithubToken()
    const userInfoPromise = tokenPromise.then(token =>
        token ? getUserInfo(token, githubUserInfoCache, 'github_user') : undefined
    )
    const getBranchPermissions = async (request: ModPublishRequest) => {
        const token = await tokenPromise
        const userInfo = await userInfoPromise

        return (branchPermissions[request.branchName] ??= getPermissionsToActOnModPublishRequest({
            request,
            userInfo,
            isAdmin: token ? await isUserAdmin(token, branches[request.branchName], githubRepoInfoCache) : false,
        }))
    }

    requestsContainer.replaceChildren(...requestsArray.map(req => createRequestCard(req, getBranchPermissions(req))))
}

function createRequestCard(
    request: ModPublishRequest,
    branchPermissionsPromise: Promise<ModPublishRequestActPermissions>
): HTMLElement {
    const card = document.createElement('div')
    card.className = 'request-card'

    const content = document.createElement('div')
    content.className = 'request-card-content'

    const title = document.createElement('strong')
    title.className = 'request-card-title'
    title.textContent = getLocalizedString(request.ccmod.title) ?? request.ccmod.id

    const header = document.createElement('span')
    header.className = 'request-card-header'
    header.append(title, createVersionInfo(request.ccmod.version!, request.oldVersion))
    content.append(header)

    const meta = document.createElement('span')
    meta.className = 'request-card-meta'
    meta.append(
        'submitted by ' + request.userName,
        ' · ' + request.branchName.split('/').pop(),
        ' · ' + formatRequestDate(request.submitDate)
    )
    content.append(meta)

    const icons = document.createElement('div')
    icons.className = 'request-card-icons'
    icons.append(createModIcon(request), createAuthorGithubAvatar(request))

    const top = document.createElement('div')
    top.className = 'request-card-top'
    top.append(icons, content)

    card.append(top)

    const repo = request.ccmod.repository
    if (repo) card.append(createLabeledLink('repo', repo))

    card.append(createLabeledLink('archive', request.modUrl))

    card.append(createActionButtons(request, branchPermissionsPromise))

    return card
}

function createModIcon(request: ModPublishRequest): HTMLImageElement {
    const DEFAULT_MOD_ICON_URL = '/default-mod-icon.png'

    const img = document.createElement('img')
    img.className = 'request-card-icon'
    img.src = request.modIconUrl || DEFAULT_MOD_ICON_URL
    img.alt = (getLocalizedString(request.ccmod.title) ?? request.ccmod.id) + ' icon'
    img.loading = 'lazy'
    img.decoding = 'async'

    img.onerror = () => {
        img.onerror = null
        img.src = DEFAULT_MOD_ICON_URL
    }

    return img
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

function createActionButtons(
    request: ModPublishRequest,
    branchPermissionsPromise: Promise<ModPublishRequestActPermissions>
): HTMLElement {
    const actions = document.createElement('div')
    actions.className = 'request-card-actions'

    function createActionButton(type: ModPublishRequestActionType) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'request-card-action ' + 'request-card-' + type
        button.title = type
        button.setAttribute('aria-label', type)
        button.innerHTML = `<svg class="request-card-action-icon" aria-hidden="true"><use href="${type}-icon.svg#icon"></use></svg>`
        button.dataset.modId = request.ccmod.id

        button.onclick = () => onModPublishRequestAction(request, type)

        button.disabled = true
        branchPermissionsPromise.then(perms => (button.disabled = !perms?.[type]))

        actions.append(button)
    }

    createActionButton('accept')
    createActionButton('reject')

    return actions
}

function createAuthorGithubAvatar(request: ModPublishRequest): HTMLImageElement {
    const img = document.createElement('img')
    img.className = 'githubAvatar'
    img.src = request.userAvatarUrl
    img.alt = request.userName + ' avatar'
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

async function onModPublishRequestAction(request: ModPublishRequest, actionType: ModPublishRequestActionType) {
    const token = await getGithubToken()
    if (!token) {
        con.append('[error]', 'invalid token')
        return
    }

    try {
        const res = await sendModPublishRequestAction({ requestId: request.requestId, token, actionType })
        if (res.success) {
            requests = res.requests
        } else {
            con.append('[error]', res.testResults.text)
            con.append('[error]', 'ccmoddb test status code:', res.testResults.exitCode)
        }
    } catch (e) {
        con.append('[error]', 'server error:', getErrorMessage(e))
    }
    updateRequetsUi()
}
