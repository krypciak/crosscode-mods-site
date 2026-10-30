import type { PkgCCMod } from 'ccmoddb/build/src/types'
import type { GithubUserInfo } from '../user-info'
import type { Branch } from './branch'
import { gt } from 'semver'

export interface ModPublishRequest {
    requestId: number
    userLogin: string
    userName: string
    userAvatarUrl: string
    modIconUrl?: string

    ccmod: PkgCCMod
    oldVersion?: string
    modUrl: string
    branchName: string
    source: string
    modArchiveHash: string
    submitDate: number
}
export type ModPublishRequestsRecord = Record<number, ModPublishRequest>

export type ModPublishRequestActionType = 'accept' | 'reject'

export async function ccmodModPublishCheck({
    ccmod,
    branch,
    userInfo,
    isAdmin,
}: {
    ccmod: PkgCCMod
    branch: Branch
    userInfo: GithubUserInfo
    isAdmin: boolean
}) {
    const hasPermission = await hasPermissionToSendModPublishRequest({ ccmod, userInfo, isAdmin })
    if (!hasPermission) throw new Error('user has no permission to publish this ccmod')

    const highestVersionPackage = await branch.getHighestVersionPackageAvailable(ccmod.id)
    if (highestVersionPackage && !gt(ccmod.version!, highestVersionPackage.metadataCCMod!.version)) {
        throw new Error(
            `did you forget to bump the version? ` +
                `a mod with the same or higher version ("${highestVersionPackage!.metadataCCMod!.version}") already exists on this branch!`
        )
    }

    return { highestVersionPackage }
}

function doesModOwnerMatch(ccmod: PkgCCMod, userInfo: GithubUserInfo): boolean {
    const ccmodRepository = ccmod.repository ?? ''
    return ccmodRepository.startsWith(userInfo.html_url)
}

async function hasPermissionToSendModPublishRequest({
    ccmod,
    userInfo,
    isAdmin,
}: {
    ccmod: PkgCCMod
    userInfo: GithubUserInfo
    isAdmin: boolean
}): Promise<boolean> {
    const ownerMatch = doesModOwnerMatch(ccmod, userInfo)
    if (ownerMatch) return true

    return isAdmin
}

export interface ModPublishRequestActPermissions {
    accept: boolean
    reject: boolean
}
export function getPermissionsToActOnModPublishRequest({
    request,
    userInfo,
    isAdmin,
}: {
    request: ModPublishRequest
    userInfo: GithubUserInfo | undefined
    isAdmin: boolean
}): ModPublishRequestActPermissions {
    return {
        accept: isAdmin,
        reject: isAdmin || (!!userInfo && request.userLogin == userInfo.login),
    }
}

export function hasRequestPendingAlready(
    requests: ModPublishRequestsRecord,
    branchName: string,
    modId: string
): boolean {
    return !!Object.values(requests).find(request => request.branchName == branchName && request.ccmod.id == modId)
}
