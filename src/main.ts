import './style.css'
import { checkForGithubCallback, getGithubToken, updateGithubLoginLink } from './github'

// catch errors!
await checkForGithubCallback()
updateGithubLoginLink()
const token = await getGithubToken()
if (token) {
    console.log('token:', token)
    // const userInfo = await fetchUserInfo(token)
    // console.log(userInfo)
    // console.log(userInfo.avatar_url)
} else {
    console.log('no token stored!')
}
