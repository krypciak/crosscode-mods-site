import type { CCModChecker } from 'ccmoddb/build/tests/ccmod-check'
import { BOLD, c, DIM, FAIL_SYM, PASS_SYM } from '../colors-and-symbols'
import { getErrorMessage } from '../error-msg'

export class Tester {
    successCount = 0
    failCount = 0

    constructor(private print: (text: string) => void = text => console.log(text)) {}

    resetTesterStats() {
        this.successCount = 0
        this.failCount = 0
    }

    test: ConstructorParameters<typeof CCModChecker>[1] = (name, func) => {
        let success: boolean = true
        let errorMessage: string | undefined
        try {
            func()
            this.successCount++
        } catch (e) {
            success = false
            this.failCount++
            errorMessage ??= getErrorMessage(e)
        } finally {
            this.print(`  ${success ? PASS_SYM : FAIL_SYM} ${name}${c(DIM, ' >')}${c(BOLD, ` ${name}`)}`)
            if (errorMessage) {
                this.print(`${errorMessage}`)
            }
        }
    }

    expect: ConstructorParameters<typeof CCModChecker>[2] = (value, error) => {
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
}
