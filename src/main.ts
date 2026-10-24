import './style.css'
import { checkForGithubCallback } from './auth'
import { updateActiveNavLink, updateGithubUiElements } from './ui'

updateActiveNavLink()
await checkForGithubCallback()
await updateGithubUiElements()
