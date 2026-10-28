import { KeyValueStoreInMemory } from '../cache'
import { branches } from '../ccmoddb/branch'
import { ccmodCheck } from '../ccmoddb/ccmod-check'
import { ccmodModPublishCheck } from '../ccmoddb/mod-publish-check'
import { extractCCMod } from '../ccmoddb/zip'
import { getErrorMessage } from '../error-msg'
import { sha256 } from '../sha'
import { type GithubUserInfo, type GithubRepoInfo, getUserInfo, isUserAdmin } from '../user-info'
import { pushModPublishRequest } from './mod-publish-requests'

const githubUserInfoCache = new KeyValueStoreInMemory<string, GithubUserInfo>(1000 * 60 * 60 * 8)
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

        const resp = await fetch(modUrl)
        const modArchive = await resp.bytes()

        const isCCMod = modUrl.endsWith('.ccmod')
        const { text: ccmodText } = extractCCMod(modArchive, isCCMod)

        const { ccmod } = await ccmodCheck({ ccmodText, branch })

        const userInfo = await getUserInfo(token, githubUserInfoCache)
        if (!userInfo) throw new Error('user info fetch failed, invalid github token?')
        const isAdmin = await isUserAdmin(token, branch, githubRepoInfoCache)

        await ccmodModPublishCheck({ ccmod, branch, userInfo, isAdmin })

        const modArchiveHash = await sha256(modArchive)

        await pushModPublishRequest({
            user: userInfo.login,
            modUrl,
            ccmod,
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
