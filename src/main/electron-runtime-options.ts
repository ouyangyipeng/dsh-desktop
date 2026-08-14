import type { RuntimeChildInput } from './runtime-supervisor.ts'

/** Electron utility-process options independent from the Electron runtime object. */
export interface ElectronRuntimeForkOptions {
  readonly cwd: string
  readonly env: Readonly<Record<string, string>>
  readonly execArgv: ['--expose-internals']
  readonly stdio: ['ignore', 'pipe', 'pipe']
  readonly serviceName: 'DS-Harness Runtime'
  readonly allowLoadingUnsignedLibraries?: true
}

/** Spawn request for a packaged runtime using Electron's embedded Node executable. */
export interface EmbeddedNodeRuntimeSpawn {
  readonly command: string
  readonly args: readonly string[]
  readonly options: {
    readonly cwd: string
    readonly detached: boolean
    readonly env: Readonly<Record<string, string>>
    readonly stdio: ['ignore', 'pipe', 'pipe']
  }
}

/**
 * Resolve the utility carrier options for one platform.
 * @param input - Fully resolved runtime child request.
 * @param platform - Target Electron host platform.
 * @returns Options that permit native DSH addons only on the macOS helper that requires the entitlement.
 */
export function resolveElectronRuntimeForkOptions(input: RuntimeChildInput, platform: NodeJS.Platform): ElectronRuntimeForkOptions {
  return {
    cwd: input.cwd,
    env: input.env,
    execArgv: ['--expose-internals'],
    stdio: ['ignore', 'pipe', 'pipe'],
    serviceName: 'DS-Harness Runtime',
    ...(platform === 'darwin' ? { allowLoadingUnsignedLibraries: true } : {}),
  }
}

/**
 * Resolve a packaged runtime process backed by Electron's embedded Node.
 * @param input - Fully resolved runtime child request.
 * @param electronExecutable - Current packaged Electron executable.
 * @returns Command, arguments, and environment with run-as-Node forced on.
 */
export function resolveEmbeddedNodeRuntimeSpawn(
  input: RuntimeChildInput,
  electronExecutable: string,
  platform: NodeJS.Platform,
): EmbeddedNodeRuntimeSpawn {
  return {
    command: electronExecutable,
    args: ['--expose-internals', input.entry, ...input.args],
    options: {
      cwd: input.cwd,
      detached: platform !== 'win32',
      env: { ...input.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  }
}
