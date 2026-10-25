import '../../main'
import type { PackageDB, PkgCCMod } from 'ccmoddb/build/src/types'
import { branches } from '../../ccmoddb/branch'
import { CCModChecker } from 'ccmoddb/build/tests/ccmod-check'
import { expect, FAIL_SYM, test } from '../../ccmoddb/test-functions'
import { dbSelect, Editor, Console, fillDbSelectWithOptions, getCurrentlySelectedDbName } from '../../ui-common'
import { extractCCMod } from '../../ccmoddb/zip'

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

uploadBtn.addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    if (!file) return
    fileInput.value = ''
    const modArchive = new Uint8Array(await file.arrayBuffer())

    if (file.name.endsWith('.zip') || file.name.endsWith('.ccmod')) {
        const isCCMod = file.name.endsWith('.ccmod')

        try {
            const ccmod = extractCCMod(modArchive, isCCMod)
            inputEditor.setText(ccmod.text)
            con.append('[info]', `loaded ${file.name} (${file.size} bytes): ${ccmod.path}`)
        } catch (e) {
            const errorMsg =
                typeof e == 'object' && e && 'message' in e && typeof e.message == 'string' ? e.message : ''
            con.append('[error]', `${FAIL_SYM} ${errorMsg} in ${file.name}`)
        }
    } else {
        inputEditor.setText(new TextDecoder().decode(modArchive))
        con.append('[info]', `loaded ${file.name} (${file.size} bytes)`)
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
        con.append('[error]', 'no input provided')
        return
    }

    let ccmod: PkgCCMod
    try {
        ccmod = JSON.parse(input) as PkgCCMod
    } catch (e) {
        con.append('[error]', 'invalid JSON:', (e as Error).message)
        return
    }
    con.clear()
    const databases = await getDatabases(getCurrentlySelectedDbName())
    const ccmodChecker = new CCModChecker(databases, test, expect)
    con.append('[info]', `running (${new Date().toLocaleString()})...`)
    ccmodChecker.testMetadataCCMod(ccmod)
    con.append('[info]', 'done')
}
