import '../../main'
import { addLogoutListener, getGithubToken, isLoggedIn } from '../../auth'
import { Console, dbSelect, fillDbSelectWithOptions, getCurrentlySelectedDbName } from '../../ui-common'
import { githubAssetDownload } from '../../github-download'
import { extractCCMod, type ExtractedCcmod } from '../../ccmoddb/zip'
import { runModCheck } from '../check-mod/ccmod-check'

const form = document.getElementById('publish-form') as HTMLFormElement
const loggedInDiv = document.getElementById('show-only-when-logged-in') as HTMLDivElement
const urlInput = document.getElementById('mod-url') as HTMLInputElement
const sourceInput = document.getElementById('source') as HTMLInputElement
const consoleMount = document.getElementById('console-output') as HTMLDivElement

const checkButton = document.getElementById('check-button') as HTMLInputElement
const publishButton = document.getElementById('publish-button') as HTMLInputElement

fillDbSelectWithOptions()
hookButtons()

updateFormVisibility()
addLogoutListener(() => updateFormVisibility())

publishButton.disabled = true

const con = new Console(consoleMount)
con.hookWindowConsole()

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
        con.append('[error]', 'invalid url!', e)
        return false
    }
    con.append('[info]', 'downloaded')

    const isCCMod = modUrl.endsWith('.ccmod')
    let result: ExtractedCcmod
    try {
        result = extractCCMod(modArchive, isCCMod, source)
    } catch (e) {
        const errorMsg = typeof e == 'object' && e && 'message' in e && typeof e.message == 'string' ? e.message : ''
        con.append('[error]', errorMsg)
        return false
    }

    try {
        const stats = await runModCheck(con, result.text, getCurrentlySelectedDbName(), false)
        const success = stats?.failCount == 0

        return success
    } catch (e) {
        con.append('[error]', 'error while checking ccmod', e)
        return false
    }
}

async function publish() {
    const modUrl = urlInput.value.trim()

    const token = await getGithubToken()
    if (!token) return

    con.append('[info]', 'publish')

    const branch = getCurrentlySelectedDbName()
    const source = sourceInput.value?.trim() ?? ''

    const submitSuccess = await submit({ token, url: modUrl, branch, source })
    if (!submitSuccess) return

    con.append('[info]', `submitted!`)
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

async function submit(args: { token: string; url: string; branch: string; source: string }): Promise<boolean> {
    try {
        const resp = await fetch('/mod-publish-request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(args),
        })
        if (!resp.ok) {
            if (resp.status == 502 || resp.status == 404) {
                throw new Error('the server is probably down?')
            }
            throw new Error(`${resp.status} ${resp.statusText} ${await resp.text()}`)
        }
        return true
    } catch (e) {
        const errorMsg = typeof e == 'object' && e && 'message' in e && typeof e.message == 'string' ? e.message : ''
        con.append('[error]', errorMsg)
        return false
    }
}
