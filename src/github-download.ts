export async function githubAssetDownload(url: string): Promise<Uint8Array> {
    const requestUrl = '/gh?url=' + encodeURIComponent(url)
    const resp = await fetch(requestUrl)

    if (!resp.ok) throw new Error(`Download failed: ${resp.status} ${resp.statusText}`)

    const buf = await resp.arrayBuffer()
    return new Uint8Array(buf)
}
