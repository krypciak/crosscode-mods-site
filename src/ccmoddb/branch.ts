import type { PackageDB } from 'ccmoddb/build/src/types'

interface BranchConfig {
    owner: string
    repoName: string
    branch: string
    parent?: Branch
}
class Branch {
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
}

const stable = new Branch({
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

export const branches: Record<string, Branch> = Object.fromEntries(
    [stable, testing].map(branch => [branch.getName(), branch])
)
