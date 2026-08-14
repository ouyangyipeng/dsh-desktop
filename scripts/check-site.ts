import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url))
const REQUIRED_HTML = [
  'Download for macOS',
  'Download for Windows',
  'ouyangyipeng/dsh-desktop',
  'deepseek-ai/deepseek-harness',
  'github.com/topics/dsh-plugin',
  'unofficial',
  'desktopCommit',
  'upstreamCommit',
  'marketplaceVersion',
  'dsh-marketplace',
  'assets/desktop-marketplace.webp',
  'href="en/"',
] as const

/**
 * Validate the dependency-free Pages directory and its local references.
 * @param siteRoot Absolute or repository-relative site directory.
 * @returns Stable diagnostics; an empty list is publishable.
 */
export async function checkSite(siteRoot: string = resolve(REPOSITORY_ROOT, 'site')): Promise<string[]> {
  const root = resolve(siteRoot)
  const issues: string[] = []
  const files = ['index.html', 'styles.css', 'particles.js'] as const
  const sources = new Map<string, string>()
  for (const file of files) {
    const path = resolve(root, file)
    if (!existsSync(path)) {
      issues.push(`${file} is missing`)
      continue
    }
    sources.set(file, await readFile(path, 'utf8'))
  }

  const html = sources.get('index.html') ?? ''
  for (const required of REQUIRED_HTML) {
    if (!html.includes(required)) issues.push(`index.html is missing ${required}`)
  }
  if (/<(?:img|script|video|source)\b[^>]*\bsrc=["']https?:/iu.test(html)) issues.push('index.html loads a remote visual asset')
  const css = sources.get('styles.css') ?? ''
  if (/url\(\s*["']?https?:/iu.test(css)) issues.push('styles.css loads a remote visual asset')
  if (!css.includes('prefers-reduced-motion')) issues.push('styles.css is missing reduced-motion support')
  const particles = sources.get('particles.js') ?? ''
  if (!particles.includes('prefers-reduced-motion')) issues.push('particles.js is missing reduced-motion detection')
  if (!particles.includes('visibilitychange')) issues.push('particles.js is missing background-tab suspension')
  if (!particles.includes("addEventListener('pointermove'")) issues.push('particles.js is missing pointer interaction')
  if (!particles.includes('pointer.velocity')) issues.push('particles.js is missing pointer velocity')
  if (!particles.includes('wakeParticles')) issues.push('particles.js is missing pointer wake particles')
  if (!particles.includes('Math.min(devicePixelRatio || 1, 1.75)')) issues.push('particles.js is missing DPR cap')

  for (const reference of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/giu)) {
    const target = reference[1] as string
    if (externalOrDocumentReference(target)) continue
    const clean = target.split(/[?#]/u, 1)[0] as string
    const resolved = resolve(root, clean)
    if (resolved !== root && !resolved.startsWith(`${root}${sep}`)) {
      issues.push(`index.html contains an escaping local reference: ${target}`)
      continue
    }
    if (!existsSync(resolved)) issues.push(`index.html references a missing local file: ${target}`)
  }
  return [...new Set(issues)].sort()
}

function externalOrDocumentReference(target: string): boolean {
  return target === '' || target.startsWith('#') || /^(?:https?:|mailto:)/iu.test(target)
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) {
  const issues = await checkSite()
  if (issues.length > 0) throw new Error(`dsh-desktop site validation failed:\n${issues.map(issue => `- ${issue}`).join('\n')}`)
  console.log('dsh-desktop site: valid')
}
