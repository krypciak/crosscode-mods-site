import type { PkgCCMod } from 'ccmoddb/build/src/types'
import { unzip, type Unzipped } from 'fflate'

export type ExtractCcmodError = 'ccmod-json-not-found' | 'ccmod-json-not-at-top-level'

export async function unzipModArchive(data: Uint8Array): Promise<Unzipped> {
    return new Promise<Unzipped>((res, rej) => unzip(data, {}, (err, data) => (err ? rej(err) : res(data))))
}

export function getCCModJsonFileFromUnzippedModArchive(unzipped: Unzipped, isCCMod: boolean, source?: string): string {
    let path: string | undefined
    if (isCCMod) {
        path = 'ccmod.json'
        if (!unzipped[path]) throw new Error('ccmod.json must be at the top level of the archive')
    } else {
        let keys = Object.keys(unzipped)
        if (source) keys = keys.filter(k => k.startsWith(source))
        path = keys.find(p => p.replace(/\\/g, '/').split('/').pop() === 'ccmod.json')
        if (!path) throw new Error('no ccmod.json found in mod archive')
    }

    const data = unzipped[path]
    const ccmodText = new TextDecoder().decode(data)
    return ccmodText
}

function getModIconPath(ccmod: PkgCCMod): string | undefined {
    if (!ccmod || !ccmod.icons || typeof ccmod.icons !== 'object' || !ccmod.icons['24']) return
    return ccmod.icons['24']
}

function uint8ArrayToDataUrl(bytes: Uint8Array, mimeType: string): string {
    if (typeof bytes.toBase64 === 'function') {
        return `data:${mimeType};base64,${bytes.toBase64()}`
    }

    // Build a binary string in chunks (avoids call-stack limits of String.fromCharCode)
    const chunkSize = 0x8000 // 32 KB
    let binary = ''
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
    }
    return `data:${mimeType};base64,${btoa(binary)}`
}

export function getModIconUrlFromUnzippedModArchive(unzipped: Unzipped, ccmod: PkgCCMod): string | undefined {
    const path = getModIconPath(ccmod)
    if (!path) return

    const data = unzipped[path]
    if (!data) throw new Error(`mod icon file specified but is not present under path: "${path}"`)

    const url = uint8ArrayToDataUrl(data, 'image/png')
    return url
}
