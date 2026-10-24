import { githubClientId } from './config'
import { takePkceVerifier, verifyOAuthState } from './auth-security'
import { userCacheKey } from './user-info'

interface GithubTokenRequestSuccess {
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

type StoredAuthData = { acquiredAt: number } & GithubTokenRequestSuccess

async function requestAccessTokenAndStore(
    config: { code: string; code_verifier: string } | { refresh_token: string }
): Promise<GithubTokenRequestSuccess> {
    const body = new URLSearchParams({
        client_id: githubClientId,
        ...('code' in config
            ? { code: config.code, code_verifier: config.code_verifier }
            : { grant_type: 'refresh_token', refresh_token: config.refresh_token }),
    })

    const headers: HeadersInit = { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }

    const resp = await fetch('/access_token', { method: 'POST', headers, body })
    if (!resp.ok) throw new Error(resp.status + ' ' + resp.statusText)

    const json: GithubTokenRequest = await resp.json()

    if ('error' in json) throw new Error(json.error + ' ' + json.error_description)

    storeAuthData({ acquiredAt: Date.now() / 1000, ...json })

    return json
}

const authStorageKey = 'auth'
async function storeAuthData(tokenData: StoredAuthData) {
    localStorage.setItem(authStorageKey, JSON.stringify(tokenData))
}
async function getAuthData(): Promise<StoredAuthData | undefined> {
    const str = localStorage.getItem(authStorageKey)
    if (!str) return
    try {
        return JSON.parse(str) as StoredAuthData
    } catch (e) {
        console.error(e)
    }
}

export async function checkForGithubCallback() {
    try {
        const params = new URLSearchParams(window.location.search)

        if (params.get('code')) {
            verifyOAuthState(params)

            const code = params.get('code')!
            const codeVerifier = takePkceVerifier()

            await requestAccessTokenAndStore({ code, code_verifier: codeVerifier })

            window.location.href = '/'
        } else if (params.get('error')) {
            verifyOAuthState(params)

            const error = params.get('error')
            const errorDescription = params.get('error_description')
            console.error(error, errorDescription)
            throw new Error(error + ' ' + errorDescription)
        }
    } catch (e) {
        console.error(e)
    }
}

let refreshPromise: Promise<GithubTokenRequestSuccess> | undefined
export async function getGithubToken(): Promise<string | undefined> {
    const now = Date.now() / 1000
    const data = await getAuthData()
    if (!data) return undefined

    if (data.acquiredAt + data.expires_in > now) return data.access_token
    // token expired

    if (data.acquiredAt + data.refresh_token_expires_in <= now) {
        // refresh token expired
        return undefined
    }

    try {
        refreshPromise ??= requestAccessTokenAndStore({ refresh_token: data.refresh_token })
        const res = await refreshPromise
        return res.access_token
    } catch (e) {
        console.error(e)
    } finally {
        refreshPromise = undefined
    }
}

export async function isLoggedIn() {
    return (await getAuthData()) !== undefined
}

export function logoutGithub() {
    localStorage.removeItem(authStorageKey)
    localStorage.removeItem(userCacheKey)
}
