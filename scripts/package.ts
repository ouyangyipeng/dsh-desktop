import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { assertSafeStaging } from './deploy-closure.ts'
import { run } from './process.ts'
import { REPOSITORY_ROOT } from './repository.ts'
import { stageDesktop } from './stage.ts'

const STAGING_ROOT = resolve(REPOSITORY_ROOT, 'dist/stage')
const ARTIFACTS_ROOT = resolve(REPOSITORY_ROOT, 'dist/artifacts')
const BUILDER_CONFIG = resolve(REPOSITORY_ROOT, 'config/electron-builder.yml')
const BUILDER_CLI = resolve(REPOSITORY_ROOT, 'node_modules/electron-builder/out/cli/cli.js')
const USAGE = 'Usage: pnpm run pack -- [--development] (--mac|--windows) (--arm64|--x64)'

/** Supported native installer operating systems. */
export type DesktopPackagePlatform = 'mac' | 'windows'

/** One native-host package request. */
export interface DesktopPackageRequest {
  readonly development: boolean
  readonly platform: DesktopPackagePlatform
  readonly arch: 'arm64' | 'x64'
}

/**
 * Parse one explicit request and require the current native host.
 * @param argv Package flags, optionally prefixed by pnpm's separator.
 * @param hostPlatform Operating system executing electron-builder.
 * @param hostArch CPU architecture executing electron-builder.
 * @returns A package target proven to match the host.
 */
export function resolveDesktopPackageRequest(
  argv: readonly string[],
  hostPlatform: NodeJS.Platform,
  hostArch: string,
): DesktopPackageRequest {
  const args = argv[0] === '--' ? argv.slice(1) : argv
  const allowed = new Set(['--development', '--mac', '--windows', '--arm64', '--x64'])
  if (args.some(argument => !allowed.has(argument)) || new Set(args).size !== args.length) throw new Error(USAGE)
  const platforms = args.filter(argument => argument === '--mac' || argument === '--windows')
  const architectures = args.filter(argument => argument === '--arm64' || argument === '--x64')
  if (platforms.length !== 1 || architectures.length !== 1) throw new Error(USAGE)

  const platform = platforms[0] === '--mac' ? 'mac' : 'windows'
  const arch = architectures[0] === '--arm64' ? 'arm64' : 'x64'
  const expectedPlatform = hostPlatform === 'darwin' ? 'mac' : hostPlatform === 'win32' ? 'windows' : undefined
  if (platform !== expectedPlatform || arch !== hostArch) {
    throw new Error(`desktop packaging only supports the current host (${hostPlatform}/${hostArch})`)
  }
  return { development: args.includes('--development'), platform, arch }
}

/** Build, stage, and package one target-native installer without publishing it. */
export async function packageDesktop(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const request = resolveDesktopPackageRequest(argv, process.platform, process.arch)
  await run('pnpm', ['build'], { cwd: REPOSITORY_ROOT })
  await stageDesktop(request.development ? ['--development'] : [])
  await assertSafeStaging(REPOSITORY_ROOT, ARTIFACTS_ROOT)
  await rm(ARTIFACTS_ROOT, { recursive: true, force: true })
  const platformArgs = request.platform === 'mac' ? ['--mac', 'dmg'] : ['--win', 'nsis']
  await run(process.execPath, [
    BUILDER_CLI,
    '--projectDir',
    STAGING_ROOT,
    '--config',
    BUILDER_CONFIG,
    ...platformArgs,
    `--${request.arch}`,
    '--publish',
    'never',
  ], {
    cwd: REPOSITORY_ROOT,
    env: { CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
  })
  console.log(`dsh-desktop artifacts: ${ARTIFACTS_ROOT}`)
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) {
  await packageDesktop()
}
