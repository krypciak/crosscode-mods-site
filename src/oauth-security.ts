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
const verifierSessionKey = 'oauth_code_verifier'

function base64UrlEncode(bytes: Uint8Array): string {
    let str = ''
    for (const byte of bytes) str += String.fromCharCode(byte)
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function setPkceChallenge(): Promise<string> {
    const verifierBytes = new Uint8Array(32)
    crypto.getRandomValues(verifierBytes)
    const verifier = base64UrlEncode(verifierBytes)

    sessionStorage.setItem(verifierSessionKey, verifier)

    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
    return base64UrlEncode(new Uint8Array(digest))
}

/** consumes the stored verifier (single use) */
export function takePkceVerifier(): string {
    const verifier = sessionStorage.getItem(verifierSessionKey)
    sessionStorage.removeItem(verifierSessionKey)
    if (!verifier) {
        throw new Error('missing PKCE code_verifier (no login flow started in this tab?)')
    }
    return verifier
}
