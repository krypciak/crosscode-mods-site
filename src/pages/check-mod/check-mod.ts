import '../../main'
import './check-mod-ui'
import type { PackageDB, PkgCCMod } from 'ccmoddb/build/src/types'
import { branches } from '../../ccmoddb/branch'
import { CCModChecker } from 'ccmoddb/build/tests/ccmod-check'
import { expect, test } from '../../ccmoddb/test-functions'
import { Console, fillDbSelectWithOptions, getCurrentlySelectedDbName } from '../../ui-common'

fillDbSelectWithOptions()

async function getDatabases(dbName: string): Promise<PackageDB[]> {
    const branch = branches[dbName]
    if (!branch) throw new Error()
    return branch.getDbs()
}

export async function runModCheck(con: Console, input: string) {
    if (!input) {
        con.append('[ui] no input provided')
        return
    }

    let ccmod: PkgCCMod
    try {
        ccmod = JSON.parse(input) as PkgCCMod
    } catch (e) {
        con.append('[ui] invalid JSON:', (e as Error).message)
        return
    }
    con.clear()
    const databases = await getDatabases(getCurrentlySelectedDbName())
    const ccmodChecker = new CCModChecker(databases, test, expect)
    con.append(`[ui] running (${new Date().toLocaleString()})...`)
    ccmodChecker.testMetadataCCMod(ccmod)
    con.append('[ui] done')
}
