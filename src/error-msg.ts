export function getErrorMessage(e: unknown): string {
    return typeof e == 'object' && e && 'message' in e && typeof e.message == 'string' ? e.message : ''
}
