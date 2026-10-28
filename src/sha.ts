export async function sha256(message: string | Uint8Array<ArrayBuffer>) {
    const data = typeof message == 'string' ? new TextEncoder().encode(message) : message
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}
