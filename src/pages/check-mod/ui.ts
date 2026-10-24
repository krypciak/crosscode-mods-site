import { EditorView, basicSetup } from 'codemirror'
import { EditorState, Range, StateEffect, StateField, type Extension } from '@codemirror/state'
import { Decoration, type DecorationSet } from '@codemirror/view'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'
import { extractCCMod, type ExtractCcmodError } from '../../ccmoddb/zip'
import { runModCheck } from './check-mod'

// this is vibe coded af

const consoleMount = document.querySelector<HTMLDivElement>('#console-output')!
const inputMount = document.querySelector<HTMLDivElement>('#input-code')!
const uploadBtn = document.querySelector<HTMLButtonElement>('#upload-btn')!
const fileInput = document.querySelector<HTMLInputElement>('#file-input')!

function createEditor(
    parent: HTMLElement,
    editable: boolean,
    doc: string = '',
    extensions: Extension[] = []
): EditorView {
    return new EditorView({
        state: EditorState.create({
            doc,
            extensions: [
                basicSetup,
                json(),
                oneDark,
                EditorState.readOnly.of(!editable),
                EditorView.theme({
                    '&': { height: '100%' },
                    '.cm-scroller': { overflow: 'auto' },
                }),
                ...extensions,
            ],
        }),
        parent,
    })
}

let autoRunTimer: ReturnType<typeof setTimeout> | undefined
const inputEditor = createEditor(inputMount, true, '', [
    EditorView.updateListener.of(update => {
        if (update.docChanged) {
            clearTimeout(autoRunTimer)
            autoRunTimer = setTimeout(() => runModCheck(), 500)
        }
    }),
])
const consoleEditor = createEditor(consoleMount, false)

const addConsoleDecorations = StateEffect.define<Range<Decoration>[]>()
const consoleDecorations = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(deco, tr) {
        deco = deco.map(tr.changes)
        for (const e of tr.effects) {
            if (e.is(addConsoleDecorations)) {
                deco = deco.update({ add: e.value, sort: true })
            }
        }
        return deco
    },
    provide: f => EditorView.decorations.from(f),
})

consoleEditor.dispatch({
    effects: StateEffect.appendConfig.of(consoleDecorations),
})

interface Style {
    color?: string
    fontWeight?: string
    opacity?: number
}

interface Segment {
    text: string
    style: Style
}

const ANSI_COLORS: Record<number, string> = {
    30: '#abb2bf',
    31: '#e06c75',
    32: '#98c379',
    33: '#e5c07b',
    34: '#61afef',
    35: '#c678dd',
    36: '#56b6c2',
    37: '#abb2bf',
}

function styleToCss(style: Style): string {
    const parts: string[] = []
    if (style.color) parts.push(`color:${style.color}`)
    if (style.fontWeight) parts.push(`font-weight:${style.fontWeight}`)
    if (style.opacity !== undefined) parts.push(`opacity:${style.opacity}`)
    return parts.join(';')
}

function parseAnsi(str: string): Segment[] {
    const segments: Segment[] = []
    let style: Style = {}
    let last = 0
    let match: RegExpExecArray | null
    const ansiRe = /\x1b\[([0-9;]*)m/g
    while ((match = ansiRe.exec(str))) {
        if (match.index > last) segments.push({ text: str.slice(last, match.index), style: { ...style } })
        const codes = match[1] ? match[1].split(';').map(Number) : [0]
        for (const code of codes) {
            if (code === 0) style = {}
            else if (code === 1) style.fontWeight = 'bold'
            else if (code === 2) style.opacity = 0.65
            else if (code in ANSI_COLORS) style.color = ANSI_COLORS[code]
        }
        last = match.index + match[0].length
    }
    if (last < str.length) segments.push({ text: str.slice(last), style: { ...style } })
    return segments
}

export function clearConsole() {
    consoleEditor.dispatch({
        changes: { from: 0, to: consoleEditor.state.doc.length, insert: '' },
    })
}

export function appendConsole(...args: any[]) {
    const line = args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ') + '\n'
    const from = consoleEditor.state.doc.length
    const segments = parseAnsi(line)
    const insert = segments.map(s => s.text).join('')
    if (!insert) return

    const decorations: Range<Decoration>[] = []
    let offset = from
    for (const seg of segments) {
        if (Object.keys(seg.style).length > 0) {
            decorations.push(
                Decoration.mark({ attributes: { style: styleToCss(seg.style) } }).range(
                    offset,
                    offset + seg.text.length
                )
            )
        }
        offset += seg.text.length
    }

    consoleEditor.dispatch({
        changes: { from, insert },
        effects: decorations.length > 0 ? addConsoleDecorations.of(decorations) : [],
    })
    const scroller = consoleEditor.dom.querySelector('.cm-scroller')
    if (scroller) scroller.scrollTop = scroller.scrollHeight
}

const origLog = console.log
const origWarn = console.warn
const origError = console.error
console.log = (...args: any[]) => {
    origLog(...args)
    appendConsole('[log]', ...args)
}
console.warn = (...args: any[]) => {
    origWarn(...args)
    appendConsole('[warn]', ...args)
}
console.error = (...args: any[]) => {
    origError(...args)
    appendConsole('[error]', ...args)
}

window.addEventListener('error', e => appendConsole('[exception]', e.message))
window.addEventListener('unhandledrejection', e => appendConsole('[unhandled promise]', String(e.reason)))

function setInputText(text: string) {
    inputEditor.dispatch({
        changes: { from: 0, to: inputEditor.state.doc.length, insert: text },
    })
}

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
            appendConsole(`[ui] \x1b[31m\u2717 ${EXTRACT_ERROR_MESSAGES[result.error]} in ${file.name}\x1b[0m`)
            return
        }
        setInputText(result.ccmod.text)
        appendConsole(`[ui] loaded ${file.name} (${file.size} bytes): ${result.ccmod.path}`)
    } else {
        setInputText(new TextDecoder().decode(data))
        appendConsole(`[ui] loaded ${file.name} (${file.size} bytes)`)
    }
})

export function getCodeInputString() {
    return inputEditor.state.doc.toString().trim()
}

export function getDatabaseMode(): 'stable' | 'testing' {
    return document.querySelector<HTMLSelectElement>('#db-select')!.value as 'stable' | 'testing'
}

document.querySelector<HTMLSelectElement>('#db-select')!.addEventListener('change', () => runModCheck())
