import '../../main'
import type { PackageDB, PkgCCMod } from 'ccmoddb/build/src/types'
import { branches } from '../../ccmoddb/branch'
import { CCModChecker } from 'ccmoddb/build/tests/ccmod-check'
import { expect, test } from '../../ccmoddb/test-functions'
import { dbSelect, Editor, Console, fillDbSelectWithOptions, getCurrentlySelectedDbName } from '../../ui-common'
import { extractCCMod, type ExtractCcmodError } from '../../ccmoddb/zip'

const consoleMount = document.getElementById('console-output') as HTMLDivElement
const inputMount = document.getElementById('input-code') as HTMLDivElement
const uploadBtn = document.getElementById('upload-btn') as HTMLButtonElement
const fileInput = document.getElementById('file-input') as HTMLInputElement

const inputEditor = new Editor({
    mount: inputMount,
    editable: true,
    changeTimer: 100,
    onChanged: () => {
        runModCheck(con, inputEditor.getText())
    },
})
const con = new Console(consoleMount)
con.hookWindowConsole()

const EXTRACT_ERROR_MESSAGES: Record<ExtractCcmodError, string> = {
    'ccmod-json-not-found': 'no ccmod.json found',
    'ccmod-json-not-at-top-level': 'ccmod.json must be at the top level of the archive',
}

uploadBtn.addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    if (!file) return
    fileInput.value = ''
    const data = new Uint8Array(await file.arrayBuffer())

    if (file.name.endsWith('.zip') || file.name.endsWith('.ccmod')) {
        const isCCMod = file.name.endsWith('.ccmod')
        const result = extractCCMod(data, isCCMod)
        if (!result.ok) {
            con.append(`[ui] \x1b[31m\u2717 ${EXTRACT_ERROR_MESSAGES[result.error]} in ${file.name}\x1b[0m`)
            return
        }
        inputEditor.setText(result.ccmod.text)
        con.append(`[ui] loaded ${file.name} (${file.size} bytes): ${result.ccmod.path}`)
    } else {
        inputEditor.setText(new TextDecoder().decode(data))
        con.append(`[ui] loaded ${file.name} (${file.size} bytes)`)
    }
})

dbSelect.addEventListener('change', () => runModCheck(con, inputEditor.getText()))

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
