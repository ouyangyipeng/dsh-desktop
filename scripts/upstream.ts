import { resolve } from 'node:path'
import { run } from './process.ts'
import {
  git,
  REPOSITORY_ROOT,
  requireCleanUpstream,
  UPSTREAM_PATH,
  UPSTREAM_ROOT,
} from './repository.ts'
import { stageDesktop } from './stage.ts'

const USAGE = 'Usage: pnpm upstream:status | pnpm upstream:bootstrap | pnpm upstream:update'
export type UpstreamAction = 'status' | 'bootstrap' | 'update'

/** @param argv Arguments after `scripts/upstream.ts`. @returns One supported action. */
export function parseUpstreamAction(argv: readonly string[]): UpstreamAction {
  if (argv.length !== 1) throw new Error(USAGE)
  const action = argv[0]
  if (action !== 'status' && action !== 'bootstrap' && action !== 'update') throw new Error(USAGE)
  return action
}

/** Execute one explicit upstream maintenance action. */
export async function manageUpstream(action: UpstreamAction): Promise<void> {
  if (action === 'bootstrap') {
    await git(['submodule', 'update', '--init', '--recursive', '--', UPSTREAM_PATH], REPOSITORY_ROOT)
    const identity = await requireCleanUpstream()
    await installAndBuildUpstream()
    console.log(`dsh-desktop upstream bootstrapped: ${identity.commit}`)
    return
  }

  const current = await requireCleanUpstream()
  if (action === 'status') {
    console.log(`dsh-desktop upstream recorded: ${current.commit}`)
    try {
      const remote = (await git(['rev-parse', 'origin/master'], UPSTREAM_ROOT)).trim()
      console.log(`dsh-desktop upstream local origin/master: ${remote}`)
    } catch {
      console.log('dsh-desktop upstream local origin/master: unavailable; fetch before comparing')
    }
    return
  }

  await git(['fetch', 'origin', 'master'], UPSTREAM_ROOT)
  await git(['checkout', '--detach', 'origin/master'], UPSTREAM_ROOT)
  await git(['add', '--', UPSTREAM_PATH], REPOSITORY_ROOT)
  const updated = await requireCleanUpstream()
  await installAndBuildUpstream()
  await run('pnpm', ['build'], { cwd: REPOSITORY_ROOT })
  await stageDesktop(['--development'])
  await run('pnpm', ['test'], { cwd: REPOSITORY_ROOT })
  console.log(`dsh-desktop upstream updated: ${current.commit} -> ${updated.commit}`)
}

async function installAndBuildUpstream(): Promise<void> {
  await run('pnpm', ['install', '--frozen-lockfile'], { cwd: UPSTREAM_ROOT, env: { CI: 'true' } })
  await run('pnpm', ['run', 'build'], { cwd: UPSTREAM_ROOT, env: { CI: 'true' } })
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) {
  await manageUpstream(parseUpstreamAction(process.argv.slice(2)))
}
