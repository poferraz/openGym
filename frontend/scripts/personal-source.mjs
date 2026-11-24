import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'

const dist = new URL('../dist/', import.meta.url)
const source = new URL('source/', dist)
mkdirSync(source, { recursive: true })
copyFileSync(new URL('../../NOTICE.md', import.meta.url), new URL('NOTICE.md', dist))
copyFileSync(new URL('../../LICENSE', import.meta.url), new URL('LICENSE', source))

const { VERCEL_GIT_REPO_OWNER: owner, VERCEL_GIT_REPO_SLUG: repo, VERCEL_GIT_COMMIT_SHA: sha } = process.env
const githubPart = /^[A-Za-z0-9_.-]+$/
// The standalone release writes its own source offer with the pinned upstream and patch.
const url = githubPart.test(owner || '') && githubPart.test(repo || '') && /^[a-f0-9]{40}$/.test(sha || '')
  ? `https://github.com/${owner}/${repo}/tree/${sha}`
  : ''

writeFileSync(new URL('index.html', source), `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>openGym Personal source code</title>
<h1>openGym Personal source code</h1>
<p>A noncommercial adaptation of openGym licensed under the GNU Affero General Public License.</p>
${url ? `<p><a href="${url}">Source code for this build</a></p>` : '<p>The source for this local build is in its working checkout.</p>'}
<p><a href="LICENSE">License</a> · <a href="../NOTICE.md">Third-party notices</a></p>
</html>
`)
