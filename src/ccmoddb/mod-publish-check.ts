import type { PkgCCMod } from 'ccmoddb/build/src/types'
import { doesUserHavePermissionToPublishThisCCMod, type GithubUserInfo } from '../user-info'
import type { Branch } from './branch'
import { gt } from 'semver'

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
    const hasPermission = await doesUserHavePermissionToPublishThisCCMod(ccmod, userInfo, isAdmin)
    if (!hasPermission) throw new Error('user has no permission to publish this ccmod')

    const highestVersionPackage = await branch.getHighestVersionPackageAvailable(ccmod.id)
    if (!highestVersionPackage || !gt(ccmod.version!, highestVersionPackage!.metadataCCMod!.version)) {
        throw new Error(
            `did you forget to bump the version? ` +
                `a mod with the same or higher version ("${highestVersionPackage!.metadataCCMod!.version}") already exists on this branch!`
        )
    }
}
