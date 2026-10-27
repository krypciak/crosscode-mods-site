import '../../main'
import { Editor, Console } from '../../ui-common'
import { FAIL_SYM } from '../../colors-and-symbols'
import { unzipSync } from 'fflate'
import { KeyValueHttpCache } from '../../cache'
import { sha256 } from '../../sha'

const consoleMount = document.getElementById('console-output') as HTMLDivElement
const inputMount = document.getElementById('input-code') as HTMLDivElement
const outputMount = document.getElementById('output-code') as HTMLDivElement
const uploadBtn = document.getElementById('upload-btn') as HTMLButtonElement
const fileInput = document.getElementById('file-input') as HTMLInputElement
const downloadBtn = document.getElementById('download-btn') as HTMLButtonElement
const runBtn = document.getElementById('run-btn') as HTMLButtonElement

const cache = new KeyValueHttpCache('format-code-cache')
const lebabCodeCacheKey = 'lebabCode'
const inputCodeCacheKey = 'inputCode'

const inputEditor = new Editor({
    mount: inputMount,
    editable: true,
    changeTimer: 100,
    language: 'javascript',
    onChanged() {
        void cache.set(inputCodeCacheKey, inputEditor.getText())
    },
})
cache.get(inputCodeCacheKey).then(text => inputEditor.setText(text ?? ''))

const outputEditor = new Editor({
    mount: outputMount,
    editable: false,
    language: 'javascript',
})

const con = new Console(consoleMount)
con.hookWindowConsole()

uploadBtn.addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    if (!file) return
    fileInput.value = ''
    try {
        const text = await file.text()
        inputEditor.setText(text)
    } catch (e) {
        const errorMsg = typeof e == 'object' && e && 'message' in e && typeof e.message == 'string' ? e.message : ''
        con.append('[error]', `${FAIL_SYM} ${errorMsg} in ${file.name}`)
    }
})

downloadBtn.addEventListener('click', () => {
    const text = outputEditor.getText()
    if (!text) {
        con.append('[info]', 'nothing to download')
        return
    }
    const blob = new Blob([text], { type: 'text/javascript' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'game.compiled.typed.js'
    a.click()
    URL.revokeObjectURL(a.href)
    con.append('[info]', 'download started')
})

runBtn.addEventListener('click', () => run())

async function getInputCodeCacheKey(code: string): Promise<string> {
    return lebabCodeCacheKey + '_' + sha256(code)
}

async function getInputCode(inputCode: string, hash: string) {
    const cachedCode = await cache.get(hash)
    if (cachedCode) {
        return { inputCode: cachedCode, runPrettierAndLebab: false }
    }

    return { inputCode, runPrettierAndLebab: true }
}

async function fetchUltimateCrosscodeTypedefsZip() {
    const resp = await fetch('/ultimate-crosscode-typedefs.zip')
    const data = await resp.bytes()
    return data
}

async function getTypedefsFiles(): Promise<Record<string, string>> {
    const zipData = await fetchUltimateCrosscodeTypedefsZip()
    const binFiles = unzipSync(zipData)

    const files = Object.fromEntries(
        Object.entries(binFiles)
            .filter(([f]) => !f.endsWith('/') && (f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.json')))
            .map(([path, bin]) => [path.substring(path.indexOf('/') + 1), new TextDecoder().decode(bin)])
    )
    return files
}

async function run() {
    runBtn.disabled = true
    try {
        const inputCodeFromEditor = inputEditor.getText()
        const inputCodeFromEditorHash = await getInputCodeCacheKey(inputCodeFromEditor)

        const [{ inputCode, runPrettierAndLebab }, typedefsFiles] = await Promise.all([
            getInputCode(inputCodeFromEditor, inputCodeFromEditorHash),
            getTypedefsFiles(),
        ])
        if (!inputCode) {
            con.append('[info]', 'no input provided')
            return
        }
        con.append('[info]', 'running...')
        if (runPrettierAndLebab) con.append('[info]', 'this make take a while!')

        const { runTypedefsInserter } = await import('crosscode-typedef-inserter/src/index')
        const { outputCode, typedStats } = await runTypedefsInserter({
            code: inputCode,
            runPrettierAndLebab,
            typedefsFiles,
            onPartialCodeTransform: async (code, stage) => {
                if (stage == 'postLebab') {
                    void cache.set(inputCodeFromEditorHash, code)
                }
                // outputEditor.setText(code)
            },
        })

        con.append('[info]', typedStats.toString())

        outputEditor.setText(outputCode)
        con.append('[info]', 'done')
    } finally {
        runBtn.disabled = false
    }
}
