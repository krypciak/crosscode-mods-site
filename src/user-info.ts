import type { Endpoints } from '@octokit/types'
import { onLogout } from './auth'

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

const userCacheKey = 'github_user'

function getCachedUserInfo(): GithubUserInfo | undefined {
    const str = localStorage.getItem(userCacheKey)
    if (!str) return
    return JSON.parse(str) as GithubUserInfo
}

export async function getUserInfo(token: string): Promise<GithubUserInfo | undefined> {
    const info = getCachedUserInfo()
    if (info) return info

    try {
        const userInfo = await fetchUserInfo(token)
        localStorage.setItem(userCacheKey, JSON.stringify(userInfo))
        return userInfo
    } catch (error) {
        console.error('fetching user info failed:', error)
    }
}
onLogout.push(() => {
    localStorage.removeItem(userCacheKey)
})
