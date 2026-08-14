import { spawn, type ChildProcessByStdio } from 'node:child_process'
import type { Readable } from 'node:stream'
import {
  utilityProcess,
  type UtilityProcess,
} from 'electron'
import {
  RuntimeSupervisor,
  type RuntimeChild,
  type RuntimeChildFactory,
  type RuntimeLogEntry,
  type UnexpectedRuntimeExit,
} from './runtime-supervisor.ts'
import {
  resolveElectronRuntimeForkOptions,
  resolveEmbeddedNodeRuntimeSpawn,
} from './electron-runtime-options.ts'
import { resolveDshCliEntry } from './runtime-entry.ts'
import { terminateProcessTree } from './process-tree.ts'

const DEFAULT_STARTUP_TIMEOUT_MS = 30_000
const DEFAULT_STOP_TIMEOUT_MS = 10_000
const DEFAULT_DIAGNOSTIC_MAX_BYTES = 64 * 1024

/** Application-owned values needed to launch the packaged Web runtime. */
export interface ElectronRuntimeSupervisorOptions {
  /** Isolated desktop DSH_HOME. */
  readonly desktopHarnessHome: string
  /** Absolute Desktop-owned DSH overlay. */
  readonly patchPath: string
  /** Runtime working directory; defaults to the isolated DSH_HOME. */
  readonly cwd?: string
  /** Optional application log consumer. */
  readonly logSink?: (entry: RuntimeLogEntry) => void
  /** Packaged runtime dependency tree copied outside app.asar. */
  readonly runtimeNodeModules?: string
  /** Process carrier selected by the Electron application assembly. */
  readonly runtimeChildFactory?: RuntimeChildFactory
  /** Optional ready-runtime exit notification. */
  readonly onUnexpectedExit?: (exit: UnexpectedRuntimeExit) => void
  /** Whole startup deadline. */
  readonly startupTimeoutMs?: number
  /** Grace period before the second termination request. */
  readonly stopTimeoutMs?: number
  /** Retained byte budget for each output stream. */
  readonly diagnosticMaxBytes?: number
}

/** Node child-process adapter with the non-null piped streams promised by the factory. */
class EmbeddedNodeRuntimeChild implements RuntimeChild {
  readonly stdout: Readable
  readonly stderr: Readable
  private terminationCount = 0

  constructor(private readonly child: ChildProcessByStdio<null, Readable, Readable>) {
    this.stdout = child.stdout
    this.stderr = child.stderr
  }

  get pid(): number | undefined {
    return this.child.pid
  }

  kill(): boolean {
    const pid = this.child.pid
    if (pid === undefined) return false
    this.terminationCount++
    return terminateProcessTree(pid, this.terminationCount > 1)
  }

  once(event: 'exit', listener: (code: number) => void): this {
    let delivered = false
    const deliver = (code: number): void => {
      if (delivered) return
      delivered = true
      listener(code)
    }
    this.child.once(event, (code) => {
      deliver(code ?? -1)
    })
    this.child.once('error', () => {
      deliver(-1)
    })
    return this
  }
}

/** Electron utility-process adapter with the non-null piped streams promised by the factory. */
class ElectronRuntimeChild implements RuntimeChild {
  readonly stdout: NodeJS.ReadableStream
  readonly stderr: NodeJS.ReadableStream

  constructor(private readonly child: UtilityProcess) {
    const { stdout, stderr } = child
    if (stdout === null || stderr === null) {
      child.kill()
      throw new Error('Electron utility process did not expose piped output')
    }
    this.stdout = stdout
    this.stderr = stderr
  }

  get pid(): number | undefined {
    return this.child.pid
  }

  kill(): boolean {
    return this.child.kill()
  }

  once(event: 'exit', listener: (code: number) => void): this {
    this.child.once(event, listener)
    return this
  }
}

/** Start one built dsh CLI inside Electron's supported utility-process carrier. */
export const electronRuntimeChildFactory: RuntimeChildFactory = (input) => {
  const child = utilityProcess.fork(input.entry, [...input.args], resolveElectronRuntimeForkOptions(input, process.platform))
  return new ElectronRuntimeChild(child)
}

/** Launch a packaged runtime through the current Electron executable in Node mode. */
export const embeddedNodeRuntimeChildFactory: RuntimeChildFactory = (input) => {
  const request = resolveEmbeddedNodeRuntimeSpawn(input, process.execPath, process.platform)
  return new EmbeddedNodeRuntimeChild(spawn(request.command, [...request.args], request.options))
}

/**
 * Probe the exact validated Web root and discard its response body.
 * @param url - owned loopback root URL.
 * @param signal - whole-startup deadline signal.
 */
export async function probeRuntimeOrigin(url: URL, signal: AbortSignal): Promise<void> {
  const response = await fetch(url, { method: 'GET', redirect: 'error', signal })
  await response.body?.cancel()
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`desktop runtime readiness probe returned HTTP ${String(response.status)}`)
  }
}

/**
 * Construct the production Electron supervisor for one isolated desktop data root.
 * @param options - application paths, optional callbacks, and timeout overrides.
 * @returns A non-restartable supervisor ready for `start()`.
 */
export function createElectronRuntimeSupervisor(options: ElectronRuntimeSupervisorOptions): RuntimeSupervisor {
  return new RuntimeSupervisor({
    childFactory: options.runtimeChildFactory ?? electronRuntimeChildFactory,
    entry: resolveDshCliEntry(options.runtimeNodeModules),
    patchPath: options.patchPath,
    cwd: options.cwd ?? options.desktopHarnessHome,
    env: inheritedRuntimeEnvironment(options.desktopHarnessHome),
    probe: probeRuntimeOrigin,
    startupTimeoutMs: options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS,
    stopTimeoutMs: options.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS,
    diagnosticMaxBytes: options.diagnosticMaxBytes ?? DEFAULT_DIAGNOSTIC_MAX_BYTES,
    ...(options.logSink === undefined ? {} : { logSink: options.logSink }),
    ...(options.onUnexpectedExit === undefined ? {} : { onUnexpectedExit: options.onUnexpectedExit }),
  })
}

function inheritedRuntimeEnvironment(desktopHarnessHome: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value
  }
  env.DSH_HOME = desktopHarnessHome
  return env
}
