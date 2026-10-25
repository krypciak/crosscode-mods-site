import './style.css'
import { checkForGithubCallback } from './auth'
import { updateActiveNavLink, updateGithubUiElements } from './header-ui'

updateActiveNavLink()
await checkForGithubCallback()
await updateGithubUiElements()
