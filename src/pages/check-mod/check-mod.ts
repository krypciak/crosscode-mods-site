import '../../main'
import { dbSelect, Editor, Console, fillDbSelectWithOptions, getCurrentlySelectedBranch } from '../../ui-common'
import { extractCCMod } from '../../ccmoddb/zip'
import { FAIL_SYM } from '../../colors-and-symbols'
import { runModCheck as runCCModCheck } from './ccmod-check'

const consoleMount = document.getElementById('console-output') as HTMLDivElement
const inputMount = document.getElementById('input-code') as HTMLDivElement
const uploadBtn = document.getElementById('upload-btn') as HTMLButtonElement
const fileInput = document.getElementById('file-input') as HTMLInputElement

function runCheck() {
    runCCModCheck(con, inputEditor.getText(), getCurrentlySelectedBranch())
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

dbSelect.addEventListener('change', runCheck)

fillDbSelectWithOptions()
