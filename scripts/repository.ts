import { resolve } from 'node:path'
import { run } from './process.ts'

export const REPOSITORY_ROOT = resolve(import.meta.dirname, '..')
export const UPSTREAM_PATH = 'upstream/deepseek-harness'
export const UPSTREAM_ROOT = resolve(REPOSITORY_ROOT, UPSTREAM_PATH)
export const UPSTREAM_REPOSITORY = 'https://github.com/deepseek-ai/deepseek-harness.git'
const STATUS_PATTERN = /^ ([0-9a-f]{40}) upstream\/deepseek-harness(?: \([^\n]+\))?\n?$/u

/** Proven clean identity of the pinned upstream checkout. */
export interface SubmoduleIdentity {
  readonly commit: string
  readonly clean: true
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
