import '../../main'
import { addLogoutListener, getGithubToken, isLoggedIn } from '../../auth'
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
import type { PkgCCMod } from 'ccmoddb/build/src/types'
import { getUserInfo, isUserAdmin } from '../../user-info'
import { getErrorMessage } from '../../error-msg'
import { ccmodCheck } from '../../ccmoddb/ccmod-check'
import { PASS_SYM } from '../../colors-and-symbols'
import { ccmodModPublishCheck } from '../../ccmoddb/mod-publish-check'
import { fetchModPublishRequests, githubAssetDownload, submitModPublishRequest } from '../../server-endpoints'

const form = document.getElementById('publish-form') as HTMLFormElement
const loggedInDiv = document.getElementById('show-only-when-logged-in') as HTMLDivElement
const urlInput = document.getElementById('mod-url') as HTMLInputElement
const sourceInput = document.getElementById('source') as HTMLInputElement
const consoleMount = document.getElementById('console-output') as HTMLDivElement
const ccmodPreviewMount = document.getElementById('ccmod-preview') as HTMLDivElement

const checkButton = document.getElementById('check-button') as HTMLInputElement
const publishButton = document.getElementById('publish-button') as HTMLInputElement

fillDbSelectWithOptions()
hookButtons()

updateFormVisibility()
addLogoutListener(() => updateFormVisibility())

publishButton.disabled = true

const ccmodPreviewEditor = new Editor({
    mount: ccmodPreviewMount,
    editable: false,
})

const con = new Console(consoleMount)
con.hookWindowConsole()

fetchModPublishRequestsAndUpdateUi()

async function fetchModPublishRequestsAndUpdateUi() {
    const requestsRecord = await fetchModPublishRequests()
    const requests = Object.values(requestsRecord).sort((a, b) => b.submitDate - a.submitDate)

    console.log(requests)
}

async function updateFormVisibility() {
    const loggedIn = await isLoggedIn()

    const notice = document.getElementById('login-notice') as HTMLHeadingElement
    notice.hidden = loggedIn
    loggedInDiv.hidden = !loggedIn
    loggedInDiv.style.display = loggedIn ? '' : 'none'
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
        await submitModPublishRequest({ token, url: modUrl, branch: branch.getName(), source })
    } catch (e) {
        con.append('[error]', getErrorMessage(e))
        return
    }

    con.append('[info]', `submitted!`)

    await fetchModPublishRequestsAndUpdateUi()
}

function hookButtons() {
    urlInput.addEventListener('change', () => (publishButton.disabled = true))
    sourceInput.addEventListener('change', () => (publishButton.disabled = true))
    dbSelect.addEventListener('change', () => (publishButton.disabled = true))

    checkButton.onclick = async () => {
        const success = await check()

        publishButton.disabled = !success
        if (!success) return
    }

    publishButton.onclick = publish
    form.onsubmit = () => false
}
