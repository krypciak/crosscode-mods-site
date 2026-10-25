import { githubClientId } from './config'
import { addLogoutListener, getGithubToken, isLoggedIn, logoutGithub } from './auth'
import { setOAuthState, setPkceChallenge } from './auth-security'
import { getUserInfo, type GithubUserInfo } from './user-info'

let defaultAvatarDataUri: string

const githubLoginLogoutLink = document.getElementById('githubLoginLogoutLink') as HTMLLinkElement
const githubUsername = document.getElementById('githubUsername') as HTMLSpanElement
const githubAvatar = document.getElementById('githubAvatar') as HTMLImageElement

addLogoutListener(() => void updateGithubUiElements())

export function updateActiveNavLink() {
    const here = location.pathname == '/index.html' ? '/' : location.pathname
    for (const a of document.querySelectorAll<HTMLAnchorElement>('.page-nav a')) {
        const href = new URL(a.getAttribute('href') ?? '.', location.origin).pathname
        if (href == here) a.setAttribute('aria-current', 'page')
        else a.removeAttribute('aria-current')
    }
}

export async function updateGithubUiElements() {
    const token = await getGithubToken()
    const loggedIn = !!token && (await isLoggedIn())

    const userData = loggedIn ? await getUserInfo(token) : undefined

    updateUsernameSpan(userData)
    updateAvatarImage(userData)

    await Promise.all([updateLoginLogoutLink(loggedIn)])
}

async function updateLoginLogoutLink(loggedIn: boolean) {
    if (loggedIn) {
        githubLoginLogoutLink.textContent = 'Logout'
        githubLoginLogoutLink.href = '#'
        githubLoginLogoutLink.onclick = event => {
            event.preventDefault()
            logoutGithub()
        }
    } else {
        githubLoginLogoutLink.textContent = 'Login with GitHub'

        const state = setOAuthState()
        const codeChallenge = await setPkceChallenge()

        githubLoginLogoutLink.href =
            `https://github.com/login/oauth/authorize` +
            `?client_id=${githubClientId}` +
            `&state=${state}` +
            `&code_challenge=${codeChallenge}` +
            `&code_challenge_method=S256`
        githubLoginLogoutLink.onclick = () => {}
    }
}

function updateUsernameSpan(userData: GithubUserInfo | undefined) {
    const name = userData?.name ?? ''
    githubUsername.textContent = name
}

function updateAvatarImage(userData: GithubUserInfo | undefined) {
    const name = userData?.name ?? ''
    defaultAvatarDataUri ??= githubAvatar.src
    githubAvatar.src = userData?.avatar_url ?? defaultAvatarDataUri
    githubAvatar.alt = name
    githubAvatar.title = name
}
