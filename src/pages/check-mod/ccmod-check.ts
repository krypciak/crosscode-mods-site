import type { PackageDB, PkgCCMod } from 'ccmoddb/build/src/types'
import { branches } from '../../ccmoddb/branch'
import type { Console } from '../../ui-common'
import { CCModChecker } from 'ccmoddb/build/tests/ccmod-check'
import { Tester } from '../../ccmoddb/test-functions'
import { FAIL_SYM, PASS_SYM } from '../../colors-and-symbols'

async function getDatabases(dbName: string): Promise<PackageDB[]> {
    const branch = branches[dbName]
    if (!branch) throw new Error()
    return branch.getDbs()
}

export async function runModCheck(
    con: Console | undefined,
    input: string,
    dbName: string,
    standalonePrint: boolean = true,
    silent: boolean = false
) {
    if (!input) {
        con?.append('[error]', 'no input provided')
        return
    }

    let ccmod: PkgCCMod
    try {
        ccmod = JSON.parse(input) as PkgCCMod
    } catch (e) {
        con?.append('[error]', 'invalid ccmod.json JSON:', (e as Error).message)
        return
    }
    if (standalonePrint) con?.clear()
    const databases = await getDatabases(dbName)
    const tester = new Tester(silent)
    const ccmodChecker = new CCModChecker(databases, tester.test, tester.expect)
    if (standalonePrint) con?.append('[info]', `running (${new Date().toLocaleString()})...`)

    ccmodChecker.testMetadataCCMod(ccmod)

    if (tester.failCount == 0) {
        con?.append('[info]', PASS_SYM, 'success')
    } else {
        con?.append('[error]', FAIL_SYM, 'tests failed!')
    }
    return tester
}
