import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import {
  assertSafeStaging,
  findFirstSymlink,
  preservePnpmWorkspaceState,
  repairLegacyDeploy,
} from './deploy-closure.ts'
import { run } from './process.ts'
import {
  desktopCommit,
  REPOSITORY_ROOT,
  requireCleanUpstream,
  UPSTREAM_REPOSITORY,
  UPSTREAM_ROOT,
} from './repository.ts'
import { parseDesktopBuildMetadata, type DesktopBuildMetadata } from '../src/main/build-metadata.ts'

const STAGING_ROOT = resolve(REPOSITORY_ROOT, 'dist/stage')
const DEPLOY_ROOT = resolve(REPOSITORY_ROOT, 'dist/runtime-deploy')
const ROOT_BUILD = resolve(REPOSITORY_ROOT, 'lib')
const USAGE = 'Usage: pnpm runtime:stage -- --development\n       or provide DSH_DESKTOP_RELEASE_REPOSITORY for a release build.'

/** Stable host and package values used to construct staging metadata. */
export interface DesktopStageIdentity {
  readonly version: string
  readonly platform: NodeJS.Platform
  readonly arch: string
  readonly builtAt: string
}

/** Git identities read from the independent root and recorded submodule. */
export interface DesktopGitIdentity {
  readonly desktopCommit: string
  readonly upstreamCommit: string
}

/**
 * Resolve explicit development or Git-derived release metadata.
 * @param argv Stage command arguments.
 * @param environment Release repository supplied by the build environment.
 * @param identity Package and target identity.
 * @param commits Commits read from Git rather than caller overrides.
 * @returns Metadata validated by the packaged application parser.
 */
export function resolveDesktopStageMetadata(
  argv: readonly string[],
  environment: Readonly<Record<string, string | undefined>>,
  identity: DesktopStageIdentity,
  commits: DesktopGitIdentity,
): DesktopBuildMetadata {
  const args = argv[0] === '--' ? argv.slice(1) : argv
  const development = args.length === 1 && args[0] === '--development'
  if (!development && args.length !== 0) throw new Error(USAGE)
  for (const name of ['DSH_DESKTOP_COMMIT', 'DSH_DESKTOP_UPSTREAM_COMMIT']) {
    if (environment[name] !== undefined) throw new Error(`${name} must not override Git-derived build identity`)
  }

  const metadata: DesktopBuildMetadata = {
    schemaVersion: 1,
    ...identity,
    desktopCommit: development ? 'development' : commits.desktopCommit,
    upstreamCommit: commits.upstreamCommit,
    upstreamRepository: UPSTREAM_REPOSITORY,
    ...(development ? {} : { releaseRepository: requiredReleaseRepository(environment) }),
  }
  return parseDesktopBuildMetadata(metadata)
}

/** Materialize the production Desktop application and upstream dependency closure. */
export async function stageDesktop(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const rootManifest = await readManifest(resolve(REPOSITORY_ROOT, 'package.json'))
  if (typeof rootManifest.version !== 'string' || rootManifest.version === '') {
    throw new Error('desktop package.json requires a non-empty version')
  }
  const upstream = await requireCleanUpstream()
  const metadata = resolveDesktopStageMetadata(argv, process.env, {
    version: rootManifest.version,
    platform: process.platform,
    arch: process.arch,
    builtAt: new Date().toISOString(),
  }, {
    desktopCommit: await desktopCommit(),
    upstreamCommit: upstream.commit,
  })

  requireFile(join(ROOT_BUILD, 'main.js'), 'run pnpm build before staging')
  requireFile(join(UPSTREAM_ROOT, 'apps/cli/lib/bin.js'), 'run pnpm upstream:bootstrap before staging')
  await assertSafeStaging(REPOSITORY_ROOT, STAGING_ROOT)
  await assertSafeStaging(REPOSITORY_ROOT, DEPLOY_ROOT)
  await rm(STAGING_ROOT, { recursive: true, force: true })
  await rm(DEPLOY_ROOT, { recursive: true, force: true })
  await deployUpstreamRuntime()
  await assembleStage(rootManifest, metadata)
  await rm(DEPLOY_ROOT, { recursive: true, force: true })

  requireFile(join(STAGING_ROOT, 'lib/main.js'), 'Desktop bundle is missing')
  requireFile(join(STAGING_ROOT, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), 'DSH CLI is missing')
  requireFile(join(STAGING_ROOT, 'node_modules/@deepseek-ai/cordis-plugin-group/lib/index.js'), 'Cordis group plugin is missing')
  requireFile(join(STAGING_ROOT, 'node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html'), 'Harness Web frontend is missing')
  const remainingSymlink = await findFirstSymlink(STAGING_ROOT)
  if (remainingSymlink !== undefined) throw new Error(`desktop staging retains symbolic link ${remainingSymlink}`)
  console.log(`dsh-desktop stage: ${STAGING_ROOT}`)
}

async function deployUpstreamRuntime(): Promise<void> {
  await preservePnpmWorkspaceState(UPSTREAM_ROOT, async () => run('pnpm', [
    '--filter',
    '@deepseek-ai/dsh',
    'deploy',
    '--legacy',
    '--prod',
    '--config.node-linker=hoisted',
    '--config.auto-install-peers=false',
    '--config.link-workspace-packages=true',
    DEPLOY_ROOT,
  ], { cwd: UPSTREAM_ROOT, env: { CI: 'true' } }))
  await repairLegacyDeploy({
    staging: DEPLOY_ROOT,
    sourceNodeModules: join(UPSTREAM_ROOT, 'apps/cli/node_modules'),
    closureSourceNodeModules: join(UPSTREAM_ROOT, 'node_modules/.pnpm/node_modules'),
    removeFiles: ['pnpm-workspace.yaml'],
  })
}

async function assembleStage(rootManifest: PackageManifest, metadata: DesktopBuildMetadata): Promise<void> {
  const deployedManifest = await readManifest(join(DEPLOY_ROOT, 'package.json'))
  if (typeof deployedManifest.name !== 'string' || deployedManifest.name !== '@deepseek-ai/dsh') {
    throw new Error('upstream deploy root is not @deepseek-ai/dsh')
  }
  if (typeof deployedManifest.version !== 'string' || deployedManifest.version === '') {
    throw new Error('upstream deploy root has no package version')
  }

  await mkdir(join(STAGING_ROOT, 'node_modules/@deepseek-ai'), { recursive: true })
  await cp(join(DEPLOY_ROOT, 'node_modules'), join(STAGING_ROOT, 'node_modules'), { recursive: true, dereference: true })
  await cp(DEPLOY_ROOT, join(STAGING_ROOT, 'node_modules/@deepseek-ai/dsh'), {
    recursive: true,
    dereference: true,
    filter: path => path !== join(DEPLOY_ROOT, 'node_modules') && !path.startsWith(`${join(DEPLOY_ROOT, 'node_modules')}${sep}`),
  })
  await cp(ROOT_BUILD, join(STAGING_ROOT, 'lib'), { recursive: true, dereference: true })
  const stageManifest = {
    name: rootManifest.name,
    productName: rootManifest.productName,
    version: rootManifest.version,
    description: rootManifest.description,
    private: true,
    type: 'module',
    main: 'lib/main.js',
    license: rootManifest.license,
    dependencies: { '@deepseek-ai/dsh': deployedManifest.version },
  }
  await writeFile(join(STAGING_ROOT, 'package.json'), `${JSON.stringify(stageManifest, null, 2)}\n`)
  await writeFile(join(STAGING_ROOT, 'build-metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`)
}

interface PackageManifest {
  readonly name?: unknown
  readonly productName?: unknown
  readonly version?: unknown
  readonly description?: unknown
  readonly license?: unknown
}

async function readManifest(path: string): Promise<PackageManifest> {
  return JSON.parse(await readFile(path, 'utf8')) as PackageManifest
}

function requiredReleaseRepository(environment: Readonly<Record<string, string | undefined>>): string {
  const value = environment.DSH_DESKTOP_RELEASE_REPOSITORY
  if (value === undefined || value === '') throw new Error('release staging requires DSH_DESKTOP_RELEASE_REPOSITORY')
  return value
}

function requireFile(path: string, correction: string): void {
  if (!existsSync(path)) throw new Error(`desktop staging is missing ${path}; ${correction}`)
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) {
  await stageDesktop()
}
