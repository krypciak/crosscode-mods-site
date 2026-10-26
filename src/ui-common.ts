import { branches } from './ccmoddb/branch'
import { EditorView, basicSetup } from 'codemirror'
import { Range, EditorState, StateEffect, StateField, type Extension } from '@codemirror/state'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'
import { Decoration, type DecorationSet } from '@codemirror/view'
import { c, RED, YELLOW } from './colors-and-symbols'
import { javascript } from '@codemirror/lang-javascript'

export const dbSelect = document.getElementById('db-select') as HTMLSelectElement

export function getCurrentlySelectedDbName(): string {
    return dbSelect.value
}

export function fillDbSelectWithOptions() {
    for (let i = dbSelect.options.length - 1; i >= 0; i--) dbSelect.options.remove(i)

    for (const branch in branches) {
        const option = document.createElement('option')
        option.value = branch
        option.textContent = branch
        dbSelect.append(option)
    }
    dbSelect.value = Object.keys(branches)[0]
}

export class Editor {
    view: EditorView

    constructor({
        mount: parent,
        editable,
        doc = '',
        onChanged = () => {},
        changeTimer = 0,
        extensions = [],
        language = 'json',
    }: {
        mount: HTMLElement
        editable: boolean
        doc?: string
        onChanged?: () => void
        changeTimer?: number
        extensions?: Extension[]
        language?: 'json' | 'javascript'
    }) {
        let autoRunTimer: NodeJS.Timeout
        this.view = new EditorView({
            state: EditorState.create({
                doc,
                extensions: [
                    basicSetup,
                    ...[language == 'javascript' ? [javascript()] : language == 'json' ? [json()] : []],
                    oneDark,
                    EditorState.readOnly.of(!editable),
                    EditorView.theme({
                        '&': { height: '100%' },
                        '.cm-scroller': { overflow: 'auto' },
                    }),
                    EditorView.updateListener.of(update => {
                        if (update.docChanged) {
                            clearTimeout(autoRunTimer)
                            autoRunTimer = setTimeout(() => onChanged(), changeTimer)
                        }
                    }),
                    ...extensions,
                ],
            }),
            parent,
        })
    }

    setText(text: string) {
        this.view.dispatch({
            changes: { from: 0, to: this.view.state.doc.length, insert: text },
        })
    }

    getText(): string {
        return this.view.state.doc.toString().trim()
    }
}

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

export class Console {
    private editor: Editor

    private addConsoleDecorations = StateEffect.define<Range<Decoration>[]>()

    constructor(mount: HTMLDivElement) {
        this.editor = new Editor({ mount, editable: false })

        const self = this

        const consoleDecorations = StateField.define<DecorationSet>({
            create: () => Decoration.none,
            update(deco, tr) {
                deco = deco.map(tr.changes)
                for (const e of tr.effects) {
                    if (e.is(self.addConsoleDecorations)) {
                        deco = deco.update({ add: e.value, sort: true })
                    }
                }
                return deco
            },
            provide: f => EditorView.decorations.from(f),
        })

        this.editor.view.dispatch({
            effects: StateEffect.appendConfig.of(consoleDecorations),
        })
    }

    clear() {
        this.editor.view.dispatch({
            changes: { from: 0, to: this.editor.view.state.doc.length, insert: '' },
        })
    }

    append(level: '[info]' | '[warn]' | '[error]', ...args: any[]) {
        const levelText = c(level == '[warn]' ? YELLOW : level == '[error]' ? RED : '', level)

        const line =
            levelText +
            ' ' +
            args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ') +
            '\n'
        const from = this.editor.view.state.doc.length
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

        this.editor.view.dispatch({
            changes: { from, insert },
            effects: decorations.length > 0 ? this.addConsoleDecorations.of(decorations) : [],
        })
        const scroller = this.editor.view.dom.querySelector('.cm-scroller')
        if (scroller) scroller.scrollTop = scroller.scrollHeight
    }

    hookWindowConsole() {
        const origLog = console.log
        const origWarn = console.warn
        const origError = console.error
        console.log = (...args: any[]) => {
            origLog(...args)
            this.append('[info]', ...args)
        }
        console.warn = (...args: any[]) => {
            origWarn(...args)
            this.append('[warn]', ...args)
        }
        console.error = (...args: any[]) => {
            origError(...args)
            this.append('[error]', ...args)
        }

        window.addEventListener('error', e => this.append('[error]', '[exception]', e.message))
        window.addEventListener('unhandledrejection', e =>
            this.append('[error]', '[unhandled promise]', String(e.reason))
        )
    }
}
