import '../../main'
import { dbSelect, Editor, Console, fillDbSelectWithOptions, getCurrentlySelectedBranch } from '../../ui-common'
import { getCCModJsonFileFromUnzippedModArchive, unzipModArchive } from '../../ccmoddb/zip'
import { FAIL_SYM, PASS_SYM } from '../../colors-and-symbols'
import { ccmodCheck } from '../../ccmoddb/ccmod-check'
import { getErrorMessage } from '../../error-msg'

const consoleMount = document.getElementById('console-output') as HTMLDivElement
const inputMount = document.getElementById('input-code') as HTMLDivElement
const uploadBtn = document.getElementById('upload-btn') as HTMLButtonElement
const fileInput = document.getElementById('file-input') as HTMLInputElement

async function runCheck() {
    con.clear()
    con.append('[info]', `running (${new Date().toLocaleString()})...`)
    const branch = getCurrentlySelectedBranch()
    try {
        await ccmodCheck({
            ccmodText: inputEditor.getText(),
            branch,
            log: text => con.append('[info]', text),
        })
        con.append('[info]', PASS_SYM, ' ccmod.json valid!')
    } catch (e) {
        con.append('[error]', FAIL_SYM, ' ccmod.json error:', getErrorMessage(e))
    }
}

const inputEditor = new Editor({
    mount: inputMount,
    editable: true,
    changeTimer: 100,
    onChanged: runCheck,
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
            const unzipped = await unzipModArchive(modArchive)
            const { ccmodText } = getCCModJsonFileFromUnzippedModArchive(unzipped, isCCMod)
            inputEditor.setText(ccmodText)
            con.append('[info]', `loaded ${file.name} (${file.size} bytes)`)
        } catch (e) {
            const errorMsg = getErrorMessage(e)
            con.append('[error]', `${FAIL_SYM} ${errorMsg} in ${file.name}`)
        }
    } else {
        inputEditor.setText(new TextDecoder().decode(modArchive))
        con.append('[info]', `loaded ${file.name} (${file.size} bytes)`)
    }
})

dbSelect.addEventListener('change', runCheck)

fillDbSelectWithOptions()
