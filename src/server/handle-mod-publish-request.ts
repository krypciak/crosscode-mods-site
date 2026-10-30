import { KeyValueStoreInMemory } from '../cache'
import { branches } from '../ccmoddb/branch'
import { ccmodCheck } from '../ccmoddb/ccmod-check'
import { ccmodModPublishCheck, hasRequestPendingAlready } from '../ccmoddb/mod-publish-request'
import {
    getCCModJsonFileFromUnzippedModArchive,
    getModIconUrlFromUnzippedModArchive,
    unzipModArchive,
} from '../ccmoddb/zip'
import { getErrorMessage } from '../error-msg'
import { sha256 } from '../sha'
import { type GithubUserInfo, type GithubRepoInfo, getUserInfo, isUserAdmin } from '../user-info'
import type { ModPublishRequest } from '../ccmoddb/mod-publish-request'
import { readFile, rename, unlink } from 'node:fs/promises'

const githubUserInfoCache = new KeyValueStoreInMemory<string, GithubUserInfo>(1000 * 60 * 60 * 8)
const githubRepoInfoCache = new KeyValueStoreInMemory<string, GithubRepoInfo>(1000 * 60 * 60 * 8)

const requestsFile = './mod-publish-requests.json'
export const modPublishRequests: ModPublishRequest[] = await readRequestsFromDisk()

export async function handleModPublishRequest(req: Request) {
    try {
        const body = await req.json()

        const token: string = body.token
        if (!token) throw new Error('missing "token" query parameter')

        const modId: string = body.modId
        if (!modId) throw new Error('missing "modId" query parameter')

        const modUrl: string = body.url
        if (!modUrl) throw new Error('missing "url" query parameter')

        const branchName: string = body.branch
        if (!branchName) throw new Error('missing "branch" query parameter')

        let source: string = body.source
        if (source === undefined) throw new Error('missing "source" query parameter')

        checkIfHasRequestPendingAlready(branchName, modId)

        const branch = branches[branchName]
        if (!branch) throw new Error('unknown branch')

        const resp = await fetch(modUrl)
        const modArchive = await resp.bytes()

        const isCCMod = modUrl.endsWith('.ccmod')
        const unzipped = await unzipModArchive(modArchive)
        let ccmodText: string
        ;({ ccmodText, source } = getCCModJsonFileFromUnzippedModArchive(unzipped, isCCMod))

        const { ccmod } = await ccmodCheck({ ccmodText, branch })

        if (ccmod.id != modId) throw new Error('submitted mod archive has different mod id than the request one')

        const userInfo = await getUserInfo(token, githubUserInfoCache)
        if (!userInfo) throw new Error('user info fetch failed, invalid github token?')
        const isAdmin = await isUserAdmin(token, branch, githubRepoInfoCache)

        const { highestVersionPackage } = await ccmodModPublishCheck({ ccmod, branch, userInfo, isAdmin })

        const modArchiveHash = await sha256(modArchive)

        const modIconUrl = getModIconUrlFromUnzippedModArchive(unzipped, ccmod, source)

        await pushModPublishRequest({
            userLogin: userInfo.login,
            userName: userInfo.name ?? userInfo.login,
            userAvatarUrl: userInfo.avatar_url,
            modIconUrl,
            modUrl,
            ccmod,
            oldVersion: highestVersionPackage?.metadataCCMod!.version,
            branchName,
            source,
            modArchiveHash,
            submitDate: Date.now(),
        })

        return new Response('success', { status: 200 })
    } catch (e) {
        const message = getErrorMessage(e)
        return new Response(message, { status: 400, headers: { 'Content-Type': 'text/plain' } })
    }
}

async function readRequestsFromDisk() {
    let requests: ModPublishRequest[] = []
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

function checkIfHasRequestPendingAlready(branchName: string, modId: string) {
    if (hasRequestPendingAlready(modPublishRequests, branchName, modId))
        throw new Error(`mod has a publish request pending already!`)
}

async function pushModPublishRequest(request: ModPublishRequest) {
    const id = request.ccmod.id
    const branchName = request.branchName
    checkIfHasRequestPendingAlready(branchName, id)
    modPublishRequests.push(request)
    await asyncSafeFileWrite(requestsFile, JSON.stringify(modPublishRequests, null, 4))
}
