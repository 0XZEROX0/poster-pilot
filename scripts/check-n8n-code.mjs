// Checks that every n8n code file in n8n/ can be read by JavaScript, so a typo
// is caught on the pull request instead of inside a live workflow.
// Code-node bodies use a top-level `return`/`await`, so they are parsed as the body
// of an async function; files written as modules (with `import`) are checked by Node itself.
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap((e) => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])

let checked = 0
const broken = []
for (const file of walk('n8n').filter((f) => /\.(c?js|mjs)$/.test(f)).sort()) {
  checked++
  const code = fs.readFileSync(file, 'utf8')
  const asModule = file.endsWith('.cjs') || file.endsWith('.mjs') || /^\s*import\s/m.test(code)
  try {
    if (asModule) execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' })
    else new AsyncFunction(code)
  } catch (e) {
    broken.push(`${file}: ${String(e.stderr || e.message).trim().split('\n').slice(0, 5).join('\n  ')}`)
  }
}
for (const b of broken) console.log('BROKEN', b)
console.log(`${checked} n8n code files checked, ${broken.length} broken`)
process.exit(broken.length ? 1 : 0)
