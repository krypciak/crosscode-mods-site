import './style.css'
import { checkForGithubCallback } from './auth'
import { updateGithubUiElements } from './ui'

// catch errors!
await checkForGithubCallback()
await updateGithubUiElements()
