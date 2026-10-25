import '../../main'
import { addLogoutListener, getGithubToken, isLoggedIn } from '../../auth'
import { Console, fillDbSelectWithOptions, getCurrentlySelectedDbName } from '../../ui-common'

const form = document.getElementById('publish-form') as HTMLFormElement
const urlInput = document.getElementById('modUrl') as HTMLInputElement
const sourceInput = document.getElementById('source') as HTMLInputElement
const consoleMount = document.getElementById('console-output') as HTMLDivElement

fillDbSelectWithOptions()
hookFormSubmit()

updateFormVisibility()
addLogoutListener(() => updateFormVisibility())

const con = new Console(consoleMount)
con.hookWindowConsole()

async function updateFormVisibility() {
    const loggedIn = await isLoggedIn()

    const notice = document.getElementById('login-notice') as HTMLHeadingElement
    notice.hidden = loggedIn
    form.hidden = !loggedIn
}

function hookFormSubmit() {
    form.onsubmit = async event => {
        event.preventDefault()

        const modUrl = urlInput.value.trim()
        const branch = getCurrentlySelectedDbName()
        const source = sourceInput.value.trim()
        if (!modUrl) return

        const token = await getGithubToken()
        if (!token) {
            con.append('not logged in: log in with github first', 'err')
            return
        }

        const isOk = await verifyModPublishRequest({ githubAccessToken: token, modUrl, branch, source })
        if (!isOk) return

        const requestBody = { githubAccessToken: token, modUrl, branch, source }
        await submit(requestBody)
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
            con.append(`${resp.status} ${resp.statusText}: ${await resp.text()}`, 'err')
            return
        }
        con.append(`publish request sent: ${args.modUrl} (${args.branch})`, 'ok')
    } catch (e) {
        con.append(String(e), 'err')
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
