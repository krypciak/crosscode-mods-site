import type { PkgCCMod } from 'ccmoddb/build/src/types'
import { readFile, rename, unlink } from 'node:fs/promises'

export interface ModPublishRequest {
    user: string
    ccmod: PkgCCMod
    modUrl: string
    branchName: string
    source: string
    modArchiveHash: string
    submitDate: number
}

const requestsFile = './mod-publish-requests.json'
export const modPublishRequests: Record<string, ModPublishRequest> = await readRequestsFromDisk()

async function readRequestsFromDisk() {
    let requests: Record<string, ModPublishRequest> = {}
    try {
        requests = JSON.parse(await readFile(requestsFile, 'utf-8'))
    } catch (e) {}
    return requests
}

async function asyncSafeFileWrite(path: string, data: ArrayBufferLike | string): Promise<void> {
    const tmp = `${path}.${crypto.randomUUID()}.tmp`
    try {
        await Bun.write(tmp, data)
        await rename(tmp, path)
    } catch (e) {
        await unlink(tmp).catch(() => {})
    }
}

export async function pushModPublishRequest(request: ModPublishRequest) {
    const id = request.ccmod.id
    if (modPublishRequests[id]) throw new Error(`mod has a publish request pending already!`)
    modPublishRequests[id] = request
    await asyncSafeFileWrite(requestsFile, JSON.stringify(modPublishRequests, null, 4))
}
