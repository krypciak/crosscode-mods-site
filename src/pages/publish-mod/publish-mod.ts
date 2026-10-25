import '../../main'
import { addLogoutListener, getGithubToken, isLoggedIn } from '../../auth'
import { Console, fillDbSelectWithOptions, getCurrentlySelectedDbName } from '../../ui-common'
import { githubAssetDownload } from '../../github-download'
import { extractCCMod, type ExtractedCcmod } from '../../ccmoddb/zip'

const loggedInDiv = document.getElementById('show-only-when-logged-in') as HTMLDivElement
const urlInput = document.getElementById('mod-url') as HTMLInputElement
const sourceInput = document.getElementById('source') as HTMLInputElement
const consoleMount = document.getElementById('console-output') as HTMLDivElement

const checkButton = document.getElementById('check-button') as HTMLButtonElement
const publishButton = document.getElementById('publish-button') as HTMLButtonElement

fillDbSelectWithOptions()
hookButtons()

updateFormVisibility()
addLogoutListener(() => updateFormVisibility())

const con = new Console(consoleMount)
con.hookWindowConsole()

async function updateFormVisibility() {
    const loggedIn = await isLoggedIn()

    const notice = document.getElementById('login-notice') as HTMLHeadingElement
    notice.hidden = loggedIn
    loggedInDiv.hidden = !loggedIn
}

async function check(): Promise<boolean> {
    const modUrl = urlInput.value.trim()
    const branch = getCurrentlySelectedDbName()
    const source = sourceInput.value.trim()
    if (!modUrl) return false

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
        result = extractCCMod(modArchive, isCCMod)
    } catch (e) {}

    return true
}

function hookButtons() {
    checkButton.onclick = async () => {
        await check()

        // const isOk = await verifyModPublishRequest({ githubAccessToken: token, modUrl, branch, source })
        // if (!isOk) return
        //
        // const requestBody = { githubAccessToken: token, modUrl, branch, source }
        // await submit(requestBody)
    }

    publishButton.onclick = async () => {
        const token = await getGithubToken()
        if (!token) return

        if (!(await check())) return
        con.append('[info]', 'publish')
    }
}

async function submit(args: ModPublishRequestArgs) {
    try {
        const resp = await fetch('/mod-publish-request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(args),
        })
        if (!resp.ok) {
            con.append('[error]', `${resp.status} ${resp.statusText}: ${await resp.text()}`, 'err')
            return
        }
        con.append('[info]', `publish request sent: ${args.modUrl} (${args.branch})`)
    } catch (e) {
        con.append('[error]', String(e))
    }
}

interface ModPublishRequestArgs {
    githubAccessToken: string
    modUrl: string
    branch: string
    source: string
}

async function verifyModPublishRequest(request: ModPublishRequestArgs): Promise<boolean> {
    return true
}
