import type { PackageDB, PkgCCMod } from 'ccmoddb/build/src/types'
import '../../main'
import './ui'
import { appendConsole, clearConsole, getCodeInputString, getCurrentlySelectedDatabaseName } from './ui'
import { branches } from '../../ccmoddb/branch'
import { CCModChecker } from 'ccmoddb/build/tests/ccmod-check'
import { expect, test } from '../../ccmoddb/test-functions'

async function getDatabases(dbName: string): Promise<PackageDB[]> {
    const branch = branches[dbName]
    if (!branch) throw new Error()
    return branch.getDbs()
}

export async function runModCheck() {
    const input = getCodeInputString()
    if (!input) {
        appendConsole('[ui] no input provided')
        return
    }

    let ccmod: PkgCCMod
    try {
        ccmod = JSON.parse(input) as PkgCCMod
    } catch (e) {
        appendConsole('[ui] invalid JSON:', (e as Error).message)
        return
    }
    clearConsole()
    const databases = await getDatabases(getCurrentlySelectedDatabaseName())
    const ccmodChecker = new CCModChecker(databases, test, expect)
    appendConsole(`[ui] running (${new Date().toLocaleString()})...`)
    ccmodChecker.testMetadataCCMod(ccmod)
    appendConsole('[ui] done')
}
