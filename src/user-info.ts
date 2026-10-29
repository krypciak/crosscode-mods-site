import type { Endpoints } from '@octokit/types'
import { Branch } from './ccmoddb/branch'
import type { KeyValueStore } from './cache'
import { sha256 } from './sha'

export type GithubUserInfo = Endpoints['GET /user']['response']['data']
async function fetchUserInfo(token: string): Promise<GithubUserInfo> {
    const resp = await fetch('https://api.github.com/user', {
        method: 'GET',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
    })
    if (!resp.ok) throw new Error(resp.status + ' ' + resp.statusText)

    const json = await resp.json()
    return json
}

export async function getUserInfo(
    token: string,
    cache: KeyValueStore<'github_user', GithubUserInfo>
): Promise<GithubUserInfo | undefined> {
    let info = cache.get('github_user')
    if (info) return info

    try {
        info = await fetchUserInfo(token)
        cache.set('github_user', info)
        return info
    } catch (error) {
        console.error('fetching user info failed:', error)
    }
}

export type GithubRepoInfo = Endpoints['GET /repos/{owner}/{repo}']['response']['data']
async function fetchRepoInfo(token: string, owner: string, repo: string): Promise<GithubRepoInfo> {
    const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        method: 'GET',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
    })
    if (!resp.ok) throw new Error(resp.status + ' ' + resp.statusText)

    const json = await resp.json()
    return json
}

export async function getRepoInfo(
    token: string,
    owner: string,
    repo: string,
    cache: KeyValueStore<string, GithubRepoInfo>
): Promise<GithubRepoInfo | undefined> {
    const cacheKey = sha256(token) + '/' + owner + '/' + repo
    let info = cache.get(cacheKey)
    if (info) return info

    try {
        info = await fetchRepoInfo(token, owner, repo)
        cache.set(cacheKey, info)
        return info
    } catch (error) {
        console.error('fetching user info failed:', error)
    }
}

export async function getRepoInfoOfBranch(
    token: string,
    branch: Branch,
    cache: KeyValueStore<string, GithubRepoInfo>
): Promise<GithubRepoInfo | undefined> {
    return getRepoInfo(token, branch.config.owner, branch.config.repoName, cache)
}

export async function isUserAdmin(
    token: string,
    branch: Branch,
    cache: KeyValueStore<string, GithubRepoInfo>
): Promise<boolean> {
    const repoInfo = await getRepoInfoOfBranch(token, branch, cache)

    return !!repoInfo?.permissions?.admin
}
