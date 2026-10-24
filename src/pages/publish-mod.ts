import '../main'
import { getGithubToken } from '../auth'
import { allowedBranches } from '../config'

const form = document.getElementById('publishForm') as HTMLFormElement
const urlInput = document.getElementById('modUrl') as HTMLInputElement
const branchSelect = document.getElementById('branch') as HTMLSelectElement
const sourceInput = document.getElementById('source') as HTMLInputElement
const log = document.getElementById('log') as HTMLDivElement

function start() {
    fillBranchSelectWithOptions()
    hookFormSubmit()
}
start()

function fillBranchSelectWithOptions() {
    for (const branch of allowedBranches) {
        const option = document.createElement('option')
        option.value = branch
        option.textContent = branch
        branchSelect.append(option)
    }
    branchSelect.value = allowedBranches[0]
}

function hookFormSubmit() {
    form.onsubmit = async event => {
        event.preventDefault()

        const modUrl = urlInput.value.trim()
        const branch = branchSelect.value
        const source = sourceInput.value.trim()
        if (!modUrl) return

        const token = await getGithubToken()
        if (!token) {
            appendLog('not logged in: log in with github first', 'err')
            return
        }

        const isOk = await verifyModPublishRequest({ githubAccessToken: token, modUrl, branch, source })
        if (!isOk) return

        const requestBody = { githubAccessToken: token, modUrl, branch, source }
        await submit(requestBody)
    }
}

function appendLog(text: string, cls?: 'ok' | 'err') {
    const span = document.createElement('span')
    if (cls) span.className = cls
    span.textContent = text
    log.append(span, '\n')
    log.scrollTop = log.scrollHeight
}

async function submit(args: ModPublishRequestArgs) {
    try {
        const resp = await fetch('/mod-publish-request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(args),
        })
        if (!resp.ok) {
            appendLog(`${resp.status} ${resp.statusText}: ${await resp.text()}`, 'err')
            return
        }
        appendLog(`publish request sent: ${args.modUrl} (${args.branch})`, 'ok')
    } catch (e) {
        appendLog(String(e), 'err')
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
