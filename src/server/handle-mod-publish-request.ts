import { KeyValueStoreInMemory } from '../cache'
import { Branch, branches } from '../ccmoddb/branch'
import { extractCCMod } from '../ccmoddb/zip'
import { runModCheck } from '../pages/check-mod/ccmod-check'
import {
    type GithubUserInfo,
    type GithubRepoInfo,
    doesUserHavePermissionToPublishThisCCMod,
    getUserInfo,
    isUserAdmin,
} from '../user-info'

const userInfoCache = new KeyValueStoreInMemory<string, GithubUserInfo>(1000 * 60 * 60 * 8)
const githubRepoInfoCache = new KeyValueStoreInMemory<string, GithubRepoInfo>(1000 * 60 * 60 * 8)

export async function handleModPublishRequest(req: Request) {
    try {
        const body = await req.json()

        const token: string = body.token
        if (!token) throw new Error('missing "token" query parameter')

        const modUrl: string = body.url
        if (!modUrl) throw new Error('missing "url" query parameter')

        const branchName: string = body.branch
        if (!branchName) throw new Error('missing "branch" query parameter')

        const branch = branches[branchName]
        if (!branch) throw new Error('unknown branch')

        const source: string = body.source
        if (source === undefined) throw new Error('missing "source" query parameter')

        const { success: ccmodOk, ccmod } = await checkCCMod(modUrl, branch)
        if (!ccmodOk) throw new Error('ccmod.json check failed')

        const userInfo = await getUserInfo(token, userInfoCache)
        if (!userInfo) throw new Error('user info fetch failed, invalid github token?')

        const isAdmin = await isUserAdmin(token, branch, githubRepoInfoCache)
        const hasPermission = await doesUserHavePermissionToPublishThisCCMod(ccmod!, userInfo, isAdmin)
        if (!hasPermission) throw new Error('user has no permission to publish this ccmod')

        return new Response('success', { status: 200 })
    } catch (e) {
        const message = typeof e == 'object' && e && 'message' in e && typeof e.message == 'string' ? e.message : ''
        return new Response(message, { status: 400, headers: { 'Content-Type': 'text/plain' } })
    }
}

/* TODO: check if submitted is a newer version */
async function checkCCMod(modUrl: string, branch: Branch) {
    const resp = await fetch(modUrl)
    const modArchive = await resp.bytes()

    const isCCMod = modUrl.endsWith('.ccmod')
    const result = extractCCMod(modArchive, isCCMod)

    const { tester, ccmod } = (await runModCheck(undefined, result.text, branch, false, true)) ?? {}
    const success = tester?.failCount == 0

    return { success, ccmod }
}
