import { KeyValueStoreInMemory } from '../cache'
import { branches } from '../ccmoddb/branch'
import { ccmodCheck } from '../ccmoddb/ccmod-check'
import {
    ccmodModPublishCheck,
    getPermissionsToActOnModPublishRequest,
    hasRequestPendingAlready,
} from '../ccmoddb/mod-publish-request'
import {
    getCCModJsonFileFromUnzippedModArchive,
    getModIconUrlFromUnzippedModArchive,
    unzipModArchive,
} from '../ccmoddb/zip'
import { getErrorMessage } from '../error-msg'
import { sha256 } from '../sha'
import { type GithubUserInfo, type GithubRepoInfo, getUserInfo, isUserAdmin } from '../user-info'
import type {
    ModPublishRequest,
    ModPublishRequestActionType,
    ModPublishRequestsRecord,
} from '../ccmoddb/mod-publish-request'
import { readFile, rename, unlink } from 'node:fs/promises'
import { handleCCModDBAddCommitCheckPush } from './ccmoddb-interface'
import { checkModArchiveUrl } from './handle-github-download'
import { isUserInTheAllowedUsersList } from './allowed-users'

const githubUserInfoCache = new KeyValueStoreInMemory<string, GithubUserInfo>(1000 * 60 * 60 * 8)
const githubRepoInfoCache = new KeyValueStoreInMemory<string, GithubRepoInfo>(1000 * 60 * 60 * 8)

interface ModPublishRequestsFile {
    idCounter: number
    requests: ModPublishRequestsRecord
}

const requestsFile = './mod-publish-requests.json'
const modPublishRequests: ModPublishRequestsFile = await readRequestsFromDisk()

let actionRequestQueue: Promise<void> = Promise.resolve()

export async function handleGetModPublishRequests(_req: Request) {
    try {
        return Response.json(modPublishRequests.requests)
    } catch (e) {
        const message = getErrorMessage(e)
        return new Response(message, { status: 400, headers: { 'Content-Type': 'text/plain' } })
    }
}

function checkIfUserIsInTheAllowedUsersList(login: string) {
    if (!isUserInTheAllowedUsersList(login)) {
        throw new Error(
            'You have no permission to publish a mod! Ask for permission on the crosscode modding discord server'
        )
    }
}

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

        const userInfo = await getUserInfo(token, githubUserInfoCache)
        if (!userInfo) throw new Error('user info fetch failed, invalid github token?')
        checkIfUserIsInTheAllowedUsersList(userInfo.login)
        const isAdmin = await isUserAdmin(token, branch, githubRepoInfoCache)

        checkModArchiveUrl(modUrl)
        const resp = await fetch(modUrl)
        const modArchive = await resp.bytes()

        const isCCMod = modUrl.endsWith('.ccmod')
        const unzipped = await unzipModArchive(modArchive)
        let ccmodText: string
        ;({ ccmodText, source } = getCCModJsonFileFromUnzippedModArchive(unzipped, isCCMod))

        const { ccmod } = await ccmodCheck({ ccmodText, branch })

        if (ccmod.id != modId) throw new Error('submitted mod archive has different mod id than the request one')

        const { highestVersionPackage } = await ccmodModPublishCheck({ ccmod, branch, userInfo, isAdmin })

        const modArchiveHash = await sha256(modArchive)

        const modIconUrl = getModIconUrlFromUnzippedModArchive(unzipped, ccmod, source)

        pushModPublishRequest({
            requestId: modPublishRequests.idCounter++,
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
        void saveModPublishRequestsToFile()

        return new Response('success', { status: 200 })
    } catch (e) {
        const message = getErrorMessage(e)
        return new Response(message, { status: 400, headers: { 'Content-Type': 'text/plain' } })
    }
}

async function readRequestsFromDisk(): Promise<ModPublishRequestsFile> {
    let requests: ModPublishRequestsFile = { idCounter: 0, requests: {} }
    try {
        requests = JSON.parse(await readFile(requestsFile, 'utf-8'))
    } catch (e) {
        console.error(e)
    }
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
    if (hasRequestPendingAlready(modPublishRequests.requests, branchName, modId))
        throw new Error(`mod has a publish request pending already!`)
}

async function saveModPublishRequestsToFile() {
    await asyncSafeFileWrite(requestsFile, JSON.stringify(modPublishRequests, null, 4))
}

function pushModPublishRequest(request: ModPublishRequest) {
    const id = request.ccmod.id
    const branchName = request.branchName
    checkIfHasRequestPendingAlready(branchName, id)
    if (modPublishRequests.requests[request.requestId])
        throw new Error(`request with id ${request.requestId} already exists!`)
    modPublishRequests.requests[request.requestId] = request
}

function removeModPublishRequest(request: ModPublishRequest) {
    delete modPublishRequests.requests[request.requestId]
}

function actionRequestEnqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = actionRequestQueue.then(task)
    actionRequestQueue = run.then(
        () => {},
        () => {}
    )
    return run
}

export async function handleModPublishRequestAction(req: Request): Promise<Response> {
    return actionRequestEnqueue(async () => {
        try {
            const body = await req.json()

            const token: string = body.token
            if (!token) throw new Error('missing "token" query parameter')

            const requestId: number = body.requestId
            if (requestId === undefined) throw new Error('missing "requestId" query parameter')

            const request = modPublishRequests.requests[requestId]
            if (!request) throw new Error('request with the specified id not found')

            const actionType: ModPublishRequestActionType = body.actionType
            if (!actionType) throw new Error('missing "actionType" query parameter')
            if (actionType != 'accept' && actionType != 'reject') throw new Error('invalid "actionType" value')

            const branch = branches[request.branchName]

            const userInfo = await getUserInfo(token, githubUserInfoCache)
            if (!userInfo) throw new Error('user info fetch failed, invalid github token?')
            checkIfUserIsInTheAllowedUsersList(userInfo.login)
            const isAdmin = await isUserAdmin(token, branch, githubRepoInfoCache)

            const userPermissions = getPermissionsToActOnModPublishRequest({ request, userInfo, isAdmin })
            if (!userPermissions[actionType]) throw new Error('user has no permission to perform this action')

            if (actionType == 'reject') {
                removeModPublishRequest(request)
                await saveModPublishRequestsToFile()
            } else if (actionType == 'accept') {
                checkModArchiveUrl(request.modUrl)
                const resp = await fetch(request.modUrl)
                const modArchive = await resp.bytes()

                const modArchiveHash = await sha256(modArchive)

                if (modArchiveHash != request.modArchiveHash) {
                    throw new Error(
                        'mod archive hash mismatch! did you change the mod archive after submitting the publish request?'
                    )
                }

                const res = await handleCCModDBAddCommitCheckPush(branch, request)
                if (!res.success) {
                    if (res.testResults) return Response.json(res.testResults, { status: 409 })
                    throw res.error
                }

                removeModPublishRequest(request)
                await saveModPublishRequestsToFile()
            }

            return Response.json(modPublishRequests.requests)
        } catch (e) {
            console.error(e)
            const message = getErrorMessage(e)
            return new Response(message, { status: 400, headers: { 'Content-Type': 'text/plain' } })
        }
    })
}
