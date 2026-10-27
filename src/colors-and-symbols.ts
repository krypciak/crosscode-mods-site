export const RESET = '\x1b[0m'
export const BOLD = '\x1b[1m'
export const DIM = '\x1b[2m'

export const RED = '\x1b[31m'
export const GREEN = '\x1b[32m'
export const YELLOW = '\x1b[33m'
export const BLUE = '\x1b[34m'

export function c(code: string, text: string): string {
    return code + text + RESET
}

export const PASS_SYM = c(GREEN, '\u2713')
export const FAIL_SYM = c(RED, '\u2717')
