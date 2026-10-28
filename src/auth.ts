import { githubClientId } from './config'
import { takePkceVerifier, verifyOAuthState } from './auth-security'
import { KeyValueStoreLocalStorage } from './cache'
import { fetchProxiedAccessToken, type GithubTokenRequestSuccess } from './server-endpoints'

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

    const json = await fetchProxiedAccessToken(body)

    if ('error' in json) throw new Error(json.error + ' ' + json.error_description)

    authStorage.set('auth', { acquiredAt: Date.now() / 1000, ...json })

    return json
}

const authStorage = new KeyValueStoreLocalStorage<'auth', StoredAuthData>(Infinity)

export async function checkForGithubCallback() {
    try {
        const params = new URLSearchParams(window.location.search)

        if (params.get('code')) {
            verifyOAuthState(params)

            const code = params.get('code')!
            const codeVerifier = takePkceVerifier()

            await requestAccessTokenAndStore({ code, code_verifier: codeVerifier })

            window.location.href = '/publish-mod'
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
    const data = authStorage.get('auth')
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
    return authStorage.get('auth') !== undefined
}

export function logoutGithub() {
    for (const func of logoutListeners) func()
}

const logoutListeners: (() => void)[] = []
export function addLogoutListener(func: () => void) {
    logoutListeners.push(func)
}

addLogoutListener(() => authStorage.clear())
