import { stat, writeFile } from 'fs/promises'
import { Branch, branches } from '../ccmoddb/branch'
import { $ } from 'bun'
import type { InputLocation, InputLocations, PackageDB } from 'ccmoddb/build/src/types'
import type { ModPublishRequest } from '../ccmoddb/mod-publish-request'

import secrets from '../../secrets.json'

async function fileExists(path: string) {
    return !!(await stat(path).catch(_ => false))
}

let repoSetupPromise: Promise<void>
const repoDir = './CCModDB'

function getRemoteUrlOfBranch(branch: Branch): string {
    return `https://github.com/${branch.config.owner}/${branch.config.repoName}.git`
}

/* TODO: change me */
const fetchRepoUpdatesFromInternet = false

const masterBranch = 'master'

async function setupRepo() {
    console.log('setting up repo')
    if (!(await fileExists(repoDir))) {
        const stable = Object.values(branches)[0]
        const repoUrl = getRemoteUrlOfBranch(stable)
        console.log('cloning repo', repoUrl)
        await $`git clone ${repoUrl} ${repoDir}`
        console.log('running bun install')
        await $`bun install`.cwd(repoDir)
    }

    const remotesText = (await $`git remote -v`.cwd(repoDir).text()).trim()
    const entries = remotesText.split('\n').map(line => line.split(/\t+| +/g).slice(0, -1))
    const remoteUrlToRemote = Object.fromEntries(entries.map(e => e.toReversed()))
    const remoteToRemoteUrl = Object.fromEntries(entries)

    const remotesFetched = new Set<string>()

    await $`git checkout ${masterBranch}`.cwd(repoDir)
    if (fetchRepoUpdatesFromInternet) {
        console.log('pulling', masterBranch)
        await $`git pull`.cwd(repoDir)
    }

    console.log('remotes:', Object.keys(remoteToRemoteUrl))
    for (const branchName in branches) {
        const branch = branches[branchName]
        const remoteUrl = getRemoteUrlOfBranch(branch)
        let remoteName: string
        if (remoteUrlToRemote[remoteUrl]) {
            remoteName = remoteUrlToRemote[remoteUrl]
        } else {
            remoteName = branch.config.owner + '/' + branch.config.repoName
            console.log('adding remote', remoteName, remoteUrl)
            await $`git remote add ${remoteName} ${remoteUrl}`.cwd(repoDir)
            remoteUrlToRemote[remoteUrl] = remoteName
            remoteToRemoteUrl[remoteName] = remoteUrl
        }
        if (!remotesFetched.has(remoteName)) {
            remotesFetched.add(remoteName)
            if (fetchRepoUpdatesFromInternet) {
                console.log(`fetching ${remoteName}`)
                await $`git fetch ${remoteName}`.cwd(repoDir)
            }
        }

        const shellOutput = await $`git show-ref --verify --quiet "refs/heads/${branch.config.branch}"`
            .cwd(repoDir)
            .nothrow()
        if (shellOutput.exitCode != 0) {
            console.log('adding branch', `${remoteName}/${branch.config.branch}`)
            await $`git branch --track "${branch.config.branch}" "${remoteName}/${branch.config.branch}"`.cwd(repoDir)
        } else {
            console.log('updating', `${remoteName}/${branch.config.branch}`)
            await $`git fetch . ${remoteName}/${branch.config.branch}:${branch.config.branch}`.cwd(repoDir)
        }
    }
    console.log('repo setup done')
}

async function setupRepoIfNecessary() {
    return (repoSetupPromise ??= setupRepo())
}

export interface CCModDBTestResults {
    exitCode: number
    text: string
}

async function runCCModDBTest(branch: Branch): Promise<CCModDBTestResults> {
    await setupRepoIfNecessary()

    const res = await $`bun test 2>&1`
        .cwd(repoDir)
        .env({ FORCE_COLOR: '1', BRANCH: branch.config.branch })
        .nothrow()
        .quiet()

    const text = res.text()
    return { exitCode: res.exitCode, text }
}

async function readGit(branch: string, file: string): Promise<string> {
    await setupRepoIfNecessary()
    return $`git show ${branch}:${file}`.cwd(repoDir).text()
}

const inputLocationsPath = 'input-locations.json'
async function readInputLocations(branch: Branch): Promise<InputLocations> {
    return JSON.parse(await readGit(branch.config.branch, inputLocationsPath))
}

function stringifyInputLocations(locations: InputLocations) {
    function stringifyLocation(loc: InputLocation) {
        const body = Object.entries(loc)
            .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
            .join(', ')
        return '{ ' + body + ' }'
    }

    const pad = ' '.repeat(4)
    const body = Object.entries(locations)
        .map(([k, v]) => `${pad}${JSON.stringify(k)}: ${stringifyLocation(v)}`)
        .join(',\n')
    return `{\n${body}\n}`
}

async function writeInputLocationsAndCommit(
    branch: Branch,
    locations: InputLocations,
    commitName: string
): Promise<void> {
    try {
        await $`git checkout ${branch.config.branch}`.cwd(repoDir)
        const str = stringifyInputLocations(locations)
        await writeFile(repoDir + '/' + inputLocationsPath, str)
        await $`git add ${inputLocationsPath}`.cwd(repoDir)
        await $`git commit -m '${commitName}'`.cwd(repoDir)
    } finally {
        await $`git checkout ${masterBranch}`.cwd(repoDir)
    }
}

function addOrUpdateLocation(locations: InputLocations, request: ModPublishRequest) {
    const loc = locations[request.ccmod.id]
    // shouldnt happen
    if (loc.type && loc.type != 'zip') return

    if (request.ccmod.id == 'ccloader') {
        // example url:
        // https://github.com/CCDirectLink/CCLoader/archive/refs/tags/v2.25.0/v2.14.2.zip
        const versionSubStr = request.modUrl
            .substring('https://github.com/CCDirectLink/CCLoader/archive/refs/tags/v'.length)
            .slice(0, -'.zip'.length) // 2.25.0/v2.14.2
        const [cclV, simpV] = versionSubStr.split('/')

        for (const modId of ['ccloader', 'Simplify', 'CCLoader display version']) {
            const loc = locations[modId]
            if (!loc) continue

            if (loc.type && loc.type != 'zip') continue

            loc.url = request.modUrl
            loc.changed = true

            for (const key of ['source', 'ccmodPath'] as const) {
                const val = loc[key]
                if (!val) continue
                const restI = val.indexOf('/')
                loc[key] = `CCLoader-${cclV}-${simpV}${val.substring(restI == -1 ? 10e10 : restI)}`
            }
        }
    } else {
        loc.url = request.ccmod.id
        loc.source = request.source
        loc.changed = true
    }
}

async function runCCModDBStart(branch: Branch) {
    try {
        const text = await $`bun run --silent start`
            .cwd(repoDir)
            .env({ BRANCH: branch.config.branch, GITHUB_TOKEN: secrets.githubGeneralReadOnlyToken })
            .text()
        await $`git add -A`.cwd(repoDir)
        await $`git commit --amend --no-edit`.cwd(repoDir)

        const changedDb: PackageDB = JSON.parse(text)
        return changedDb
    } finally {
        await $`git checkout ${masterBranch}`.cwd(repoDir)
    }
}

export async function handleCCModDBAddCommitCheckPush(
    branch: Branch,
    request: ModPublishRequest
): Promise<{ success: true } | { success: false; testResults?: CCModDBTestResults }> {
    console.log('=== handleCCModDBAddCommitCheckPush ===')
    console.log('branch:', branch.getName(), 'modUrl:', request.modUrl)
    const inputLocations = await readInputLocations(branch)

    addOrUpdateLocation(inputLocations, request)

    let testResults: CCModDBTestResults | undefined
    try {
        await writeInputLocationsAndCommit(
            branch,
            inputLocations,
            `Mod: ${request.ccmod.id} ${request.ccmod.version!} (#${request.requestId})`
        )

        await runCCModDBStart(branch)

        testResults = await runCCModDBTest(branch)
        if (testResults.exitCode != 0) {
            try {
            } catch (e) {
                console.error(e)
            }
        }
    } catch (e) {
        try {
            await $`git checkout ${branch.config.branch}`.cwd(repoDir)
            await $`git reset --hard @{u}`.cwd(repoDir)
        } finally {
            return { success: false, testResults }
        }
    } finally {
        await $`git checkout ${masterBranch}`.cwd(repoDir)
    }

    return { success: true }
}
