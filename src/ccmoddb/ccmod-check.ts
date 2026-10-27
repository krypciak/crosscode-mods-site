import type { Branch } from './branch'
import type { PkgCCMod } from 'ccmoddb/build/src/types'
import { CCModChecker } from 'ccmoddb/build/tests/ccmod-check'
import { Tester } from '../ccmoddb/test-functions'
import { getErrorMessage } from '../error-msg'

export async function ccmodCheck({
    ccmodText,
    branch,
    log = () => {},
}: {
    ccmodText: string
    branch: Branch
    log?: (text: string) => void
}) {
    if (!ccmodText) throw new Error('no input provided')

    let ccmod: PkgCCMod
    try {
        ccmod = JSON.parse(ccmodText) as PkgCCMod
        if (!ccmod || typeof ccmod !== 'object') throw new Error('result is not an object')
    } catch (e) {
        throw new Error('ccmod.json syntax error: ' + getErrorMessage(e))
    }

    const databases = await branch.getDbs()
    const tester = new Tester(log)
    const ccmodChecker = new CCModChecker(databases, tester.test, tester.expect)

    ccmodChecker.testMetadataCCMod(ccmod)

    if (tester.failCount > 0) {
        throw new Error('ccmod.json tests failed!')
    }

    return { ccmod }
}
