import type { ModPublishRequestActionType, ModPublishRequestsRecord } from './ccmoddb/mod-publish-request'

export async function fetchUltimateCrosscodeTypedefsZip(): Promise<Uint8Array> {
    const resp = await fetch('/ultimate-crosscode-typedefs.zip')
    const data = await resp.bytes()
    return data
}

export interface GithubTokenRequestSuccess {
    access_token: string
    expires_in: number
    refresh_token: string
    refresh_token_expires_in: number
    token_type: 'bearer'
    scope: string
}
export type GithubTokenRequest =
    | {
          error: string
          error_description: string
      }
    | GithubTokenRequestSuccess

export async function fetchProxiedAccessToken(body: BodyInit): Promise<GithubTokenRequest> {
    const headers: HeadersInit = { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }
    const resp = await fetch('/access_token', { method: 'POST', headers, body })
    if (!resp.ok) throw new Error(resp.status + ' ' + resp.statusText)

    const json = (await resp.json()) as GithubTokenRequest
    return json
}

export async function githubAssetDownload(url: string): Promise<Uint8Array> {
    const requestUrl = '/gh?url=' + encodeURIComponent(url)
    const resp = await fetch(requestUrl)

    if (!resp.ok) throw new Error(`Download failed: ${resp.status} ${resp.statusText}`)

    const buf = await resp.arrayBuffer()
    return new Uint8Array(buf)
}

export async function submitModPublishRequest(args: {
    token: string
    modId: string
    url: string
    branch: string
    source: string
}) {
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
}

export async function fetchModPublishRequests(): Promise<ModPublishRequestsRecord> {
    const resp = await fetch('/mod-publish-request', { method: 'GET' })
    if (!resp.ok) throw new Error(`Download failed: ${resp.status} ${resp.statusText}`)

    const json: ModPublishRequestsRecord = await resp.json()
    return json
}

export async function sendModPublishRequestAction(args: {
    token: string
    requestId: number
    actionType: ModPublishRequestActionType
}): Promise<ModPublishRequestsRecord> {
    const resp = await fetch('/mod-publish-request-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
    })
    if (!resp.ok) throw new Error(`Download failed: ${resp.status} ${resp.statusText}`)

    const json: ModPublishRequestsRecord = await resp.json()
    return json
}
