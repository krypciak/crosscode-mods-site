/* csrf prevention */
const stateSessionKey = 'oauth_state'

function createOAuthState(): string {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)

    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

export function setOAuthState() {
    const state = createOAuthState()
    sessionStorage.setItem(stateSessionKey, state)
    return state
}

export function verifyOAuthState(params: URLSearchParams) {
    const returnedState = params.get('state')
    const storedState = sessionStorage.getItem(stateSessionKey)

    if (returnedState) sessionStorage.removeItem(stateSessionKey)

    if (!returnedState || returnedState !== storedState) {
        throw new Error('OAuth state mismatch (possible CSRF or stale login link)')
    }
}

/* pkce */
