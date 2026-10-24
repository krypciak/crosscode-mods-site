import { unzipSync } from 'fflate'

export interface ExtractedCcmod {
    path: string
    text: string
}

export type ExtractCcmodError = 'ccmod-json-not-found' | 'ccmod-json-not-at-top-level'

export type ExtractCcmodResult = { ok: true; ccmod: ExtractedCcmod } | { ok: false; error: ExtractCcmodError }

export function extractCCMod(data: Uint8Array, isCCMod: boolean): ExtractCcmodResult {
    const unzipped = unzipSync(data)
    let path: string | undefined
    if (isCCMod) {
        path = 'ccmod.json' in unzipped ? 'ccmod.json' : undefined
    } else {
        path = Object.keys(unzipped).find(p => p.replace(/\\/g, '/').split('/').pop() === 'ccmod.json')
    }
    if (!path) return { ok: false, error: isCCMod ? 'ccmod-json-not-at-top-level' : 'ccmod-json-not-found' }
    return { ok: true, ccmod: { path, text: new TextDecoder().decode(unzipped[path]) } }
}
