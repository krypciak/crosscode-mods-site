import { serverConfig } from './server-config'

const allowedUsers: string[] = serverConfig.allowedUsers
export function isUserInTheAllowedUsersList(username: string) {
    return allowedUsers.includes(username)
}
