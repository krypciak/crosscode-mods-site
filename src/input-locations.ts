import type { InputLocations } from 'ccmoddb/build/src/types'
import * as prettier from 'prettier/standalone'
import * as prettierPluginBabel from 'prettier/plugins/babel'
import * as prettierPluginEstree from 'prettier/plugins/estree'

/// same settings as ccbot's publish-mod command
export async function prettierJson(obj: object): Promise<string> {
    return await prettier.format(JSON.stringify(obj), {
        parser: 'json',
        plugins: [prettierPluginBabel, prettierPluginEstree],
        tabWidth: 4,
        printWidth: 170,
        bracketSameLine: true,
    })
}

export type SubmitStatus = 'pushed' | 'changed' | 'sameUrl'

/// ported from ccbot's publish-mod.ts
export function addOrUpdateUrl(
    inputs: InputLocations,
    url: string,
    source: string
): { status: SubmitStatus; index: number } {
    const obj = { url, source }
    const repoUrl = url.split('/').slice(0, 5).join('/')

    if (url.startsWith('https://github.com/CCDirectLink/CCLoader')) {
        // example url:
        // https://github.com/CCDirectLink/CCLoader/archive/refs/tags/v2.25.0/v2.14.2.zip

        let versionSubStr = url.substring('https://github.com/CCDirectLink/CCLoader/archive/refs/tags/v'.length) // 2.25.0/v2.14.2.zip
        versionSubStr = versionSubStr.substring(0, versionSubStr.length - '.zip'.length) // 2.25.0/v2.14.2
        const [cclV, simpV] = versionSubStr.split('/') // example: cclV: "2.25.0" simpV: "v2.14.2"

        for (let i = 0; i < inputs.length; i++) {
            const input = inputs[i]
            if (input.url.startsWith(repoUrl) && (!input.type || input.type == 'zip')) {
                input.url = obj.url

                for (const key of ['source', 'ccmodPath'] as const) {
                    const val = input[key]
                    if (!val) continue
                    const restI = val.indexOf('/')
                    input[key] = `CCLoader-${cclV}-${simpV}${val.substring(restI == -1 ? 10e10 : restI)}`
                }
                // this must be true
            }
        }
        return { index: 0, status: 'changed' }
    }

    for (let i = 0; i < inputs.length; i++) {
        const input = inputs[i]
        if (input.url.startsWith(repoUrl)) {
            const status = input.url == obj.url ? 'sameUrl' : 'changed'
            obj.source = source || obj.source
            inputs[i] = obj

            return { status, index: i }
        }
    }
    return { index: inputs.push(obj), status: 'pushed' }
}
