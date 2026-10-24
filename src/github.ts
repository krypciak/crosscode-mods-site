import type { Endpoints } from '@octokit/types'
import { githubClientId } from './config'
import { setOAuthState, setPkceChallenge, takePkceVerifier, verifyOAuthState } from './oauth-security'

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

export type GithubUserInfo = Endpoints['GET /user']['response']['data']

type StoredAuthData = { acquiredAt: number } & GithubTokenRequestSuccess

export async function fetchUserInfo(token: string): Promise<GithubUserInfo> {
    const resp = await fetch('https://api.github.com/user', {
        method: 'GET',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
    })
    if (!resp.ok) throw new Error(resp.status + ' ' + resp.statusText)

    const json = await resp.json()
    return json
}

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
    return JSON.parse(str) as StoredAuthData
}

export async function checkForGithubCallback() {
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
    } finally {
        refreshPromise = undefined
    }
}

export async function updateGithubLinks() {
    const githubLoginLogoutLink = document.getElementById('githubLoginLogoutLink') as HTMLLinkElement

    const loggedIn = await isLoggedIn()

    if (loggedIn) {
        githubLoginLogoutLink.innerHTML = 'Logout'
        githubLoginLogoutLink.href = '#'
        githubLoginLogoutLink.onclick = event => {
            event.preventDefault()
            logoutGithub()
            void updateGithubLinks()
        }
    } else {
        const state = setOAuthState()
        const codeChallenge = await setPkceChallenge()

        githubLoginLogoutLink.href =
            `https://github.com/login/oauth/authorize` +
            `?client_id=${githubClientId}` +
            `&state=${state}` +
            `&code_challenge=${codeChallenge}` +
            `&code_challenge_method=S256`
    }
}

export async function isLoggedIn() {
    return (await getAuthData()) !== undefined
}
function logoutGithub() {
    localStorage.removeItem(authStorageKey)
}
