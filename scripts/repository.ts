import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { run } from './process.ts'

export const REPOSITORY_ROOT = resolve(import.meta.dirname, '..')
export const UPSTREAM_PATH = 'upstream/deepseek-harness'
export const UPSTREAM_ROOT = resolve(REPOSITORY_ROOT, UPSTREAM_PATH)
export const UPSTREAM_REPOSITORY = 'https://github.com/deepseek-ai/deepseek-harness.git'
export const MARKETPLACE_PATH = 'plugins/dsh-marketplace'
export const MARKETPLACE_ROOT = resolve(REPOSITORY_ROOT, MARKETPLACE_PATH)
export const MARKETPLACE_REPOSITORY = 'https://github.com/ouyangyipeng/dsh-marketplace.git'
const STATUS_PATTERN = /^ ([0-9a-f]{40}) upstream\/deepseek-harness(?: \([^\n]+\))?\n?$/u
const MARKETPLACE_STATUS_PATTERN = /^ ([0-9a-f]{40}) plugins\/dsh-marketplace(?: \([^\n]+\))?\n?$/u
const PACKAGE_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u

/** Proven clean identity of the pinned upstream checkout. */
export interface SubmoduleIdentity {
  readonly commit: string
  readonly clean: true
}

/** Proven clean identity and package version of the bundled Marketplace. */
export interface MarketplaceSubmoduleIdentity extends SubmoduleIdentity {
  readonly version: string
}

/**
 * Parse the exact one-line status for the owned upstream submodule.
 * @param output Raw `git submodule status` output.
 * @returns The recorded clean commit.
 */
export function parseSubmoduleStatus(output: string): SubmoduleIdentity {
  if (output.startsWith('-')) throw new Error(`upstream submodule is uninitialized; run pnpm upstream:bootstrap`)
  if (output.startsWith('+')) throw new Error(`upstream submodule checkout does not match the recorded gitlink`)
  if (output.startsWith('U')) throw new Error(`upstream submodule has a merge conflict`)
  const match = STATUS_PATTERN.exec(output)
  if (match?.[1] === undefined) throw new Error(`upstream submodule status is unexpected: ${JSON.stringify(output.trim())}`)
  return { commit: match[1], clean: true }
}

/**
 * Parse the exact one-line status for the Marketplace submodule.
 * @param output Raw `git submodule status` output.
 * @returns The recorded clean commit.
 */
export function parseMarketplaceSubmoduleStatus(output: string): SubmoduleIdentity {
  if (output.startsWith('-')) throw new Error('Marketplace submodule is uninitialized; run git submodule update --init --recursive')
  if (output.startsWith('+')) throw new Error('Marketplace submodule checkout does not match the recorded gitlink')
  if (output.startsWith('U')) throw new Error('Marketplace submodule has a merge conflict')
  const match = MARKETPLACE_STATUS_PATTERN.exec(output)
  if (match?.[1] === undefined) throw new Error(`Marketplace submodule status is unexpected: ${JSON.stringify(output.trim())}`)
  return { commit: match[1], clean: true }
}

/**
 * Validate the package identity read from the Marketplace checkout.
 * @param value Parsed package manifest value.
 * @returns The exact semantic package version.
 */
export function parseMarketplaceManifest(value: unknown): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Marketplace package manifest must be an object')
  const manifest = value as Record<string, unknown>
  if (manifest.name !== 'dsh-marketplace') throw new Error('Marketplace package manifest name must be dsh-marketplace')
  if (typeof manifest.version !== 'string' || !PACKAGE_VERSION_PATTERN.test(manifest.version)) {
    throw new Error('Marketplace package manifest version must be semantic')
  }
  return manifest.version
}

/**
 * Verify URL, gitlink, nested HEAD, and nested worktree identity.
 * @returns The full official upstream commit used by the build.
 */
export async function requireCleanUpstream(): Promise<SubmoduleIdentity> {
  const configuredUrl = (await git(['config', '-f', '.gitmodules', '--get', `submodule.${UPSTREAM_PATH}.url`], REPOSITORY_ROOT)).trim()
  if (configuredUrl !== UPSTREAM_REPOSITORY) {
    throw new Error(`upstream submodule URL must be ${UPSTREAM_REPOSITORY}`)
  }
  const status = parseSubmoduleStatus(await git(['submodule', 'status', '--', UPSTREAM_PATH], REPOSITORY_ROOT))
  const nestedStatus = await git(['status', '--porcelain=v1'], UPSTREAM_ROOT)
  if (nestedStatus !== '') throw new Error(`upstream submodule worktree is dirty; discard or move its changes before building`)
  const nestedHead = (await git(['rev-parse', 'HEAD'], UPSTREAM_ROOT)).trim()
  if (nestedHead !== status.commit) throw new Error(`upstream submodule HEAD does not match the recorded gitlink`)
  return status
}

/**
 * Verify URL, gitlink, nested HEAD, worktree, and package identity for Marketplace.
 * @returns The immutable Marketplace commit and package version used by the build.
 */
export async function requireCleanMarketplace(): Promise<MarketplaceSubmoduleIdentity> {
  const configuredUrl = (await git(['config', '-f', '.gitmodules', '--get', `submodule.${MARKETPLACE_PATH}.url`], REPOSITORY_ROOT)).trim()
  if (configuredUrl !== MARKETPLACE_REPOSITORY) throw new Error(`Marketplace submodule URL must be ${MARKETPLACE_REPOSITORY}`)
  const status = parseMarketplaceSubmoduleStatus(await git(['submodule', 'status', '--', MARKETPLACE_PATH], REPOSITORY_ROOT))
  if (await git(['status', '--porcelain=v1'], MARKETPLACE_ROOT) !== '') {
    throw new Error('Marketplace submodule worktree is dirty; discard or move its changes before building')
  }
  const nestedHead = (await git(['rev-parse', 'HEAD'], MARKETPLACE_ROOT)).trim()
  if (nestedHead !== status.commit) throw new Error('Marketplace submodule HEAD does not match the recorded gitlink')
  const origin = (await git(['remote', 'get-url', 'origin'], MARKETPLACE_ROOT)).trim()
  if (origin !== MARKETPLACE_REPOSITORY) throw new Error(`Marketplace origin must be ${MARKETPLACE_REPOSITORY}`)
  const version = parseMarketplaceManifest(JSON.parse(await readFile(resolve(MARKETPLACE_ROOT, 'package.json'), 'utf8')))
  return { ...status, version }
}

/** @returns The full root repository commit. */
export async function desktopCommit(): Promise<string> {
  const commit = (await git(['rev-parse', 'HEAD'], REPOSITORY_ROOT)).trim()
  if (!/^[0-9a-f]{40}$/u.test(commit)) throw new Error('desktop repository HEAD is not a full Git SHA')
  return commit
}

/** @param args Git arguments. @param cwd Repository receiving the command. @returns Captured stdout. */
export function git(args: readonly string[], cwd: string): Promise<string> {
  return run('git', args, { cwd, capture: true })
}
