import type { Package, PackageDB } from 'ccmoddb/build/src/types'
import gt from 'semver/functions/gt'

interface BranchConfig {
    owner: string
    repoName: string
    branch: string
    parent?: Branch
}
export class Branch {
    private cached?: Promise<PackageDB>

    constructor(public config: BranchConfig) {}

    private async fetch(): Promise<PackageDB> {
        const { owner, repoName, branch } = this.config
        const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repoName}/${branch}/npDatabase.json`)
        if (!res.ok) throw new Error(`Failed to fetch ${branch}: ${res.status}`)
        return (await res.json()) as PackageDB
    }

    async getDb(): Promise<PackageDB> {
        return (this.cached ??= this.fetch())
    }

    async getDbs(): Promise<PackageDB[]> {
        return [
            //
            await this.getDb(),
            ...((await this.config.parent?.getDbs()) ?? []),
        ]
    }

    getName() {
        return '@' + this.config.owner + '/' + this.config.repoName + '/' + this.config.branch
    }

    async getHighestVersionPackageAvailable(modId: string): Promise<Package | undefined> {
        const dbs = await this.getDbs()

        const packages: Package[] = []
        for (const db of dbs) {
            const pkg = db[modId]
            if (pkg) packages.push(pkg)
        }

        if (packages.length == 0) return undefined

        let highestVersionPkg: Package = packages[0]
        for (let i = 1; i < packages.length; i++) {
            const pkg = packages[i]

            const highestPkgV = highestVersionPkg.metadataCCMod!.version!
            const pkgV = pkg.metadataCCMod!.version!

            if (gt(pkgV, highestPkgV)) highestVersionPkg = pkg
        }
        return highestVersionPkg
    }
}

export const stable = new Branch({
    owner: 'CCDirectLink',
    repoName: 'CCModDB',
    branch: 'stable',
})
const testing = new Branch({
    owner: 'CCDirectLink',
    repoName: 'CCModDB',
    branch: 'testing',
    parent: stable,
})
const multi = new Branch({
    owner: 'krypciak',
    repoName: 'CCModDB',
    branch: 'multi',
    parent: stable
})

export const branches: Record<string, Branch> = Object.fromEntries(
    [stable, testing, multi].map(branch => [branch.getName(), branch])
)
