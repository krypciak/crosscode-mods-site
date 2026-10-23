# crosscode-mods-site

static, client-sided web app to submit and update mods in [CCModDB](https://github.com/CCDirectLink/CCModDB) from the browser.
it logs in with github, forks CCModDB to the user's account, syncs it, commits `input-locations.json` on a
`ccbot-web/<n>` branch and opens a pull request to upstream.

project setup is based on [crosscode-mod-check](https://github.com/krypciak/crosscode-mod-check) (vite + typescript, no framework),
the `input-locations.json` logic is ported from [ccbot](https://github.com/CCDirectLink/ccbot)'s `/publish-mod` command.

## setup / run

```sh
bun install
bun run dev
```

## needed one-time setup

1. **github app**: create one at <https://github.com/settings/apps/new>
   (homepage url = the site url, webhook inactive, callback unused — device flow does not
   need one), enable **"Enable Device Flow"**, set the repository permissions
   **Contents: Read and write** and **Pull requests: Read and write** (metadata read is
   implied), publish it and note its client id. users authorize it once per browser session;
   on first use they also install it on their account, restricted to CCModDB ("only select
   repositories").
   an 'oauth app' with the `public_repo` scope also works but grants far too many permissions.
2. **CORS relay**: the oauth token endpoints on github.com do not send CORS headers (api.github.com does),
   so the device flow requests go through a tiny relay. when relayed by the same server that hosts this site
   (same origin), just add the two relay locations from `proxy/nginx-site.conf` into the site's server block
   and leave `oauthProxyUrl` empty; the site then uses its own origin.

3. fill in `oauthClientId` in `src/config.ts` (`oauthProxyUrl` stays empty for the same-origin relay, or holds
   the relay's base url when standalone).

## deviating fork state

if your fork's branch (stable/testing) has diverged from upstream, the sync fails with
"your fork's branch has diverged from upstream". fix that manually via
`https://github.com/<you>/CCModDB/branches/<branch>/merge-upstream` or by recalculating your fork from scratch.

## token handling

the token is kept in `sessionStorage` only (gone when the browser tab is closed). it has the `public_repo`
scope and is only ever sent to api.github.com.
