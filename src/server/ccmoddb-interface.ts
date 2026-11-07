import { stat, writeFile } from 'fs/promises'
import { Branch, branches } from '../ccmoddb/branch'
import { $ } from 'bun'
import type { InputLocation, InputLocations, PackageDB } from 'ccmoddb/build/src/types'
import type { ModPublishRequest } from '../ccmoddb/mod-publish-request'
import type { CCModDBTestResults } from '../server-endpoints'
import { serverConfig } from './server-config'

const branchTokens: Record<string, string> = serverConfig.githubBranchTokens
for (const branchName in branches) {
    if (!branchTokens[branchName]) console.warn('warn: branch', branchName, 'has no github token configured')
}

const repoDir = './CCModDB'
const fetchRepoUpdatesFromInternet = true
const masterBranch = 'master'

async function fileExists(path: string) {
    return !!(await stat(path).catch(_ => false))
}

let repoSetupPromise: Promise<void>

function getRemoteUrlOfBranch(branch: Branch): string {
    return `https://github.com/${branch.config.owner}/${branch.config.repoName}.git`
}

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

async function runCCModDBTest(branch: Branch): Promise<CCModDBTestResults> {
    const res = await $`bun test 2>&1`
        .cwd(repoDir)
        .env({ FORCE_COLOR: '1', BRANCH: branch.config.branch })
        .nothrow()
        .quiet()

    const text = res.text()
    return { exitCode: res.exitCode, text }
}

async function readGit(branch: string, file: string): Promise<string> {
    return $`git show ${branch}:${file}`.cwd(repoDir).text()
}

const inputLocationsPath = 'input-locations.json'
async function readInputLocations(branch: Branch): Promise<InputLocations> {
    return JSON.parse(await readGit(branch.config.branch, inputLocationsPath))
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

function stringifyLocation(loc: InputLocation) {
    const body = Object.entries(loc)
        .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
        .join(', ')
    return '{ ' + body + ' }'
}

function stringifyInputLocations(locations: InputLocations) {
    const pad = ' '.repeat(4)
    const body = Object.entries(locations)
        .map(([k, v]) => `${pad}${JSON.stringify(k)}: ${stringifyLocation(v)}`)
        .join(',\n')
    return `{\n${body}\n}`
}

function addOrUpdateLocation(locations: InputLocations, request: ModPublishRequest): string[] {
    const loc = (locations[request.ccmod.id] ??= { url: '' })
    // shouldnt happen
    if (loc?.type && loc.type != 'zip') return []

    if (request.ccmod.id == 'ccloader') {
        // example url:
        // https://github.com/CCDirectLink/CCLoader/archive/refs/tags/v2.25.0/v2.14.2.zip
        const versionSubStr = request.modUrl
            .substring('https://github.com/CCDirectLink/CCLoader/archive/refs/tags/v'.length)
            .slice(0, -'.zip'.length) // 2.25.0/v2.14.2
        const [cclV, simpV] = versionSubStr.split('/')

        const modIds = ['ccloader', 'Simplify', 'CCLoader display version']
        for (const modId of modIds) {
            const loc = locations[modId]
            if (!loc) continue

            if (loc.type && loc.type != 'zip') continue

            loc.url = request.modUrl

            for (const key of ['source', 'ccmodPath'] as const) {
                const val = loc[key]
                if (!val) continue
                const restI = val.indexOf('/')
                loc[key] = `CCLoader-${cclV}-${simpV}${val.substring(restI == -1 ? 10e10 : restI)}`
            }
        }
        return modIds
    } else {
        loc.url = request.modUrl
        loc.source = request.source
        return [request.ccmod.id]
    }
}

async function runCCModDBStart(branch: Branch, changedModIds: string[]) {
    try {
        const text = await $`bun run --silent start '${changedModIds.join(',')}'`
            .cwd(repoDir)
            .env({
                ...process.env,
                BRANCH: branch.config.branch,
                GITHUB_TOKEN: serverConfig.githubGeneralReadOnlyToken,
            })
            .text()

        await $`git add -A`.cwd(repoDir)
        await $`git commit --amend --no-edit`.cwd(repoDir)

        const changedDb: PackageDB = JSON.parse(text)
        return changedDb
    } finally {
        await $`git checkout ${masterBranch}`.cwd(repoDir)
    }
}

async function pushCommit(branch: Branch) {
    const token = branchTokens[branch.getName()] ?? 'bad_token'
    const url = `https://x-access-token:${token}@github.com/${branch.config.owner}/${branch.config.repoName}`
    await $`git push ${url} ${branch.config.branch}:${branch.config.branch}`.cwd(repoDir)
}

export async function handleCCModDBAddCommitCheckPush(
    branch: Branch,
    request: ModPublishRequest
): Promise<{ success: true } | { success: false; error: unknown; testResults?: CCModDBTestResults }> {
    console.log('=== handleCCModDBAddCommitCheckPush ===')
    console.log('branch:', branch.getName(), 'modUrl:', request.modUrl)

    await setupRepoIfNecessary()

    const inputLocations = await readInputLocations(branch)

    const changedModIds = addOrUpdateLocation(inputLocations, request)

    let testResults: CCModDBTestResults | undefined
    try {
        await writeInputLocationsAndCommit(
            branch,
            inputLocations,
            `Mod: ${request.ccmod.id} ${request.ccmod.version!} (#${request.requestId})`
        )

        await runCCModDBStart(branch, changedModIds)

        testResults = await runCCModDBTest(branch)
        if (testResults.exitCode != 0) throw new Error('tests didnt pass')

        await pushCommit(branch)
    } catch (error) {
        try {
            await $`git checkout ${branch.config.branch}`.cwd(repoDir)
            await $`git reset --hard @{u}`.cwd(repoDir)
        } finally {
            return { success: false, error, testResults }
        }
    } finally {
        await $`git checkout ${masterBranch}`.cwd(repoDir)
    }

    return { success: true }
}
