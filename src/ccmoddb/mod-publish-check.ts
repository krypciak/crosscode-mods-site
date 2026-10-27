import type { PkgCCMod } from 'ccmoddb/build/src/types'
import { doesUserHavePermissionToPublishThisCCMod, type GithubUserInfo } from '../user-info'
import { isModTheHighestVersionAvailable } from './is-mod-highest-version'

export async function ccmodModPublishCheck({
    ccmod,
    getUserInfo,
    isUserAdmin,
}: {
    ccmod: PkgCCMod
    getUserInfo: () => Promise<GithubUserInfo | undefined>
    isUserAdmin: () => Promise<boolean>
}) {
    const userInfo = await getUserInfo()
    if (!userInfo) throw new Error('user info fetch failed, invalid github token?')

    const isAdmin = await isUserAdmin()
    const hasPermission = await doesUserHavePermissionToPublishThisCCMod(ccmod!, userInfo, isAdmin)
    if (!hasPermission) throw new Error('user has no permission to publish this ccmod')

    if (!isModTheHighestVersionAvailable(ccmod))
        throw new Error(
            'did you forget to bump the version? a mod with the same or higher version already exists on this branch!'
        )
}
