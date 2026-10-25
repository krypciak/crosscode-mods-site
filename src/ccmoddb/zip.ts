import { unzipSync } from 'fflate'

export interface ExtractedCcmod {
    path: string
    text: string
}

export type ExtractCcmodError = 'ccmod-json-not-found' | 'ccmod-json-not-at-top-level'

export function extractCCMod(data: Uint8Array, isCCMod: boolean): ExtractedCcmod {
    const unzipped = unzipSync(data)
    let path: string | undefined
    if (isCCMod) {
        path = 'ccmod.json' in unzipped ? 'ccmod.json' : undefined
    } else {
        path = Object.keys(unzipped).find(p => p.replace(/\\/g, '/').split('/').pop() === 'ccmod.json')
    }
    if (!path) throw new Error(isCCMod ? 'ccmod.json must be at the top level of the archive' : 'no ccmod.json found')
    return { path, text: new TextDecoder().decode(unzipped[path]) }
}
