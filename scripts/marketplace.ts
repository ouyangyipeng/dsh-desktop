import { copyFile, lstat, mkdir, readFile, readdir } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import { parseMarketplaceManifest } from './repository.ts'

const REQUIRED_PUBLISH_ENTRIES = new Set([
  'lib/index.js',
  'lib/client.js',
  'lib/types/**/*.d.ts',
  'cordis.patch.yml',
  'README.md',
  'README.en.md',
  'LICENSE',
])
const REQUIRED_RUNTIME_FILES = ['lib/index.js', 'lib/client.js', 'cordis.patch.yml', 'package.json'] as const

/** Validated package facts needed by Desktop staging. */
export interface MarketplacePackageIdentity {
  readonly name: 'dsh-marketplace'
  readonly version: string
}

/**
 * Validate the Marketplace manifest and its explicit publish closure.
 * @param root Marketplace checkout root.
 * @returns Exact package name and version.
 */
export async function inspectMarketplacePackage(root: string): Promise<MarketplacePackageIdentity> {
  const manifest = JSON.parse(await readFile(contained(root, 'package.json'), 'utf8')) as Record<string, unknown>
  const version = parseMarketplaceManifest(manifest)
  if (!Array.isArray(manifest.files) || manifest.files.some(value => typeof value !== 'string')) {
    throw new Error('Marketplace package files must be a string array')
  }
  const entries = manifest.files as string[]
  if (entries.length !== REQUIRED_PUBLISH_ENTRIES.size || entries.some(entry => !REQUIRED_PUBLISH_ENTRIES.has(entry))) {
    throw new Error('Marketplace publish file list does not match the Desktop allowlist')
  }
  return { name: 'dsh-marketplace', version }
}

/**
 * Copy the Marketplace package publish closure without dereferencing links.
 * @param source Validated Marketplace checkout.
 * @param target Empty staging package destination.
 */
export async function copyMarketplacePackage(source: string, target: string): Promise<void> {
  await inspectMarketplacePackage(source)
  const files = [
    'package.json',
    'cordis.patch.yml',
    'README.md',
    'README.en.md',
    'LICENSE',
    'lib/index.js',
    'lib/client.js',
    ...await declarationFiles(source),
  ]
  for (const file of files) {
    const state = await lstat(contained(source, file))
    if (state.isSymbolicLink()) throw new Error(`Marketplace publish closure contains symbolic link ${file}`)
    if (!state.isFile()) throw new Error(`Marketplace publish closure requires regular file ${file}`)
  }
  for (const required of REQUIRED_RUNTIME_FILES) {
    if (!files.includes(required)) throw new Error(`Marketplace publish closure is missing ${required}`)
  }
  for (const file of files) {
    const destination = contained(target, file)
    await mkdir(resolve(destination, '..'), { recursive: true })
    await copyFile(contained(source, file), destination)
  }
}

async function declarationFiles(root: string): Promise<string[]> {
  const directory = contained(root, 'lib/types')
  const files = await walkFiles(root, directory)
  const declarations = files.filter(path => path.endsWith('.d.ts')).toSorted()
  if (declarations.length === 0) throw new Error('Marketplace publish closure has no type declarations')
  return declarations
}

async function walkFiles(root: string, directory: string): Promise<string[]> {
  const result: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = contained(root, relative(root, join(directory, entry.name)))
    if (entry.isSymbolicLink()) throw new Error(`Marketplace publish closure contains symbolic link ${relative(root, path)}`)
    if (entry.isDirectory()) result.push(...await walkFiles(root, path))
    else if (entry.isFile()) result.push(relative(root, path))
    else throw new Error(`Marketplace publish closure contains unsupported entry ${relative(root, path)}`)
  }
  return result
}

function contained(root: string, path: string): string {
  const absoluteRoot = resolve(root)
  const absolute = resolve(absoluteRoot, path)
  if (absolute !== absoluteRoot && !absolute.startsWith(`${absoluteRoot}${sep}`)) {
    throw new Error(`Marketplace publish path escapes package root: ${path}`)
  }
  return absolute
}
