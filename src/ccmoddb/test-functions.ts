import type { CCModChecker } from 'ccmoddb/build/tests/ccmod-check'

const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const RED = '\x1b[31m'
const GREEN = '\x1b[32m'

function c(code: string, text: string): string {
    return code + text + RESET
}

const PASS_SYM = '\u2713'
const FAIL_SYM = '\u2717'

function print(str: string) {
    console.log(str)
}

export const test: ConstructorParameters<typeof CCModChecker>[1] = (name, func) => {
    let success: boolean = true
    let errorMessage: string | undefined
    try {
        func()
    } catch (e) {
        success = false
        if (typeof e == 'object' && e && 'message' in e && typeof e.message == 'string') {
            errorMessage ??= e.message
        }
    } finally {
        print(`  ${success ? c(GREEN, PASS_SYM) : c(RED, FAIL_SYM)} ${name}${c(DIM, ' >')}${c(BOLD, ` ${name}`)}`)
        if (errorMessage) {
            print(`${errorMessage}`)
        }
    }
}

export const expect: ConstructorParameters<typeof CCModChecker>[2] = (value, error) => {
    return {
        toBeFalse() {
            if (value !== false) throw new Error(error)
        },
        toBeTrue() {
            if (value !== true) throw new Error(error)
        },
        toBeTruthy() {
            if (!value) throw new Error(error)
        },
    }
}
