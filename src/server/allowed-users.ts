import config from '../../config.json'

const allowedUsers: string[] = config.allowedUsers
export function isUserInTheAllowedUsersList(username: string) {
    return allowedUsers.includes(username)
}
