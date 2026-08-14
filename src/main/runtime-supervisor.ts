import { isAbsolute } from 'node:path'
import { OutputTail } from './output-tail.ts'
import { parseRuntimeReadyLine } from './runtime-url.ts'

const MAX_PENDING_LINE_CHARS = 4096
const encoder = new TextEncoder()

/** Input required to start the packaged Harness runtime. */
export interface RuntimeChildInput {
  /** Built dsh CLI entry. */
  readonly entry: string
  /** Fixed Web-profile arguments. */
  readonly args: readonly string[]
  /** Runtime working directory. */
  readonly cwd: string
  /** Explicit child environment. */
  readonly env: Readonly<Record<string, string>>
}

/** Minimum utility-process surface owned by the supervisor. */
export interface RuntimeChild {
  /** Child stdout bytes. */
  readonly stdout: NodeJS.ReadableStream
  /** Child stderr bytes. */
  readonly stderr: NodeJS.ReadableStream
  /** Operating-system process identifier when available. */
  readonly pid: number | undefined
  /** Request process termination. */
  kill(): boolean
  /** Register the one terminal process event. */
  once(event: 'exit', listener: (code: number) => void): this
}

/** Construct one runtime child from a fully resolved launch request. */
export type RuntimeChildFactory = (input: RuntimeChildInput) => RuntimeChild

/** Probe the validated Web root before a renderer may load it. */
export type RuntimeProbe = (url: URL, signal: AbortSignal) => Promise<void>

/** One bounded diagnostic snapshot sent to the application logger. */
export interface RuntimeLogEntry {
  /** Runtime stream or supervisor lifecycle source. */
  readonly source: 'stdout' | 'stderr' | 'supervisor'
  /** Bounded text; the logger owns credential redaction. */
  readonly text: string
}

/** Successful runtime startup facts. */
export interface RuntimeStartResult {
  /** Exact loopback origin owned by the child. */
  readonly origin: URL
  /** Operating-system process identifier when available. */
  readonly pid: number | undefined
}

/** Unexpected exit delivered after a runtime became ready. */
export interface UnexpectedRuntimeExit {
  /** Child exit code. */
  readonly code: number
  /** Bounded output retained at exit. */
  readonly diagnostics: RuntimeDiagnostics
}

/** Current bounded output snapshots. */
export interface RuntimeDiagnostics {
  /** Latest complete stdout text. */
  readonly stdout: string
  /** Latest complete stderr text. */
  readonly stderr: string
}

/** Construction values for one non-restartable runtime supervisor. */
export interface RuntimeSupervisorOptions extends Omit<RuntimeChildInput, 'args'> {
  /** Absolute immutable Desktop overlay mounted after the user profile. */
  readonly patchPath: string
  /** Utility-process adapter. */
  readonly childFactory: RuntimeChildFactory
  /** HTTP readiness probe. */
  readonly probe: RuntimeProbe
  /** Whole startup deadline, including the HTTP probe. */
  readonly startupTimeoutMs: number
  /** Grace period before sending a second termination request. */
  readonly stopTimeoutMs: number
  /** Per-stream retained diagnostic byte budget. */
  readonly diagnosticMaxBytes: number
  /** Optional bounded application log consumer. */
  readonly logSink?: (entry: RuntimeLogEntry) => void
  /** Optional notification for a ready runtime that exits. */
  readonly onUnexpectedExit?: (exit: UnexpectedRuntimeExit) => void
}

type RuntimeState = 'idle' | 'starting' | 'ready' | 'stopping' | 'stopped' | 'failed'

interface Deferred<T> {
  readonly promise: Promise<T>
  readonly settled: boolean
  resolve(value: T): void
  reject(error: unknown): void
}

/** Own exactly one packaged `dsh web` process from startup through quiescence. */
export class RuntimeSupervisor {
  private state: RuntimeState = 'idle'
  private child: RuntimeChild | undefined
  private exit: Deferred<number> | undefined
  private readiness: Deferred<URL> | undefined
  private readonly stdoutTail: OutputTail
  private readonly stderrTail: OutputTail
  private readonly stdoutDecoder = new TextDecoder()
  private pendingStdout = ''
  private discardingLongLine = false
  private startupAbort: AbortController | undefined
  private stopPromise: Promise<{ forced: boolean }> | undefined

  /** @param options Fully resolved launch, timeout, diagnostics, and callback values. */
  constructor(private readonly options: RuntimeSupervisorOptions) {
    if (!isAbsolute(options.patchPath)) throw new Error('runtime Desktop overlay path must be absolute')
    assertPositiveInteger(options.startupTimeoutMs, 'startupTimeoutMs')
    assertPositiveInteger(options.stopTimeoutMs, 'stopTimeoutMs')
    this.stdoutTail = new OutputTail(options.diagnosticMaxBytes)
    this.stderrTail = new OutputTail(options.diagnosticMaxBytes)
  }

  /**
   * Start and probe the one owned Web runtime.
   * @returns Exact origin and child PID after both readiness signals succeed.
   */
  async start(): Promise<RuntimeStartResult> {
    if (this.state !== 'idle') throw new Error(`runtime cannot start from ${this.state}`)
    this.state = 'starting'
    this.readiness = deferred<URL>()
    this.exit = deferred<number>()
    this.startupAbort = new AbortController()

    try {
      const child = this.options.childFactory({
        entry: this.options.entry,
        args: ['web', '--patch', this.options.patchPath, '--host', '127.0.0.1', '--port', '0'],
        cwd: this.options.cwd,
        env: this.options.env,
      })
      this.child = child
      this.attachChild(child)
      this.emitLog({ source: 'supervisor', text: `runtime child spawned pid=${String(child.pid ?? 'unknown')}` })
      const origin = await this.awaitStartup()
      this.markReady()
      return { origin, pid: child.pid }
    } catch (error: unknown) {
      this.startupAbort.abort(error)
      if (!this.isStopping()) {
        this.state = 'failed'
        await this.terminateFailedStart()
      }
      throw error
    }
  }

  /**
   * Stop the runtime and wait for process exit; a second signal follows the grace deadline.
   * @returns Whether the second termination request was required.
   */
  stop(): Promise<{ forced: boolean }> {
    if (this.stopPromise !== undefined) return this.stopPromise
    if (this.state === 'stopped') return Promise.resolve({ forced: false })
    if (this.child === undefined || this.exit === undefined || this.exit.settled) {
      this.state = 'stopped'
      return Promise.resolve({ forced: false })
    }

    this.state = 'stopping'
    this.startupAbort?.abort(new Error('runtime stopped during startup'))
    this.readiness?.reject(new Error('runtime stopped during startup'))
    this.stopPromise = this.performStop(this.child, this.exit)
    return this.stopPromise
  }

  /** @returns Current bounded stdout and stderr snapshots. */
  diagnostics(): RuntimeDiagnostics {
    return { stdout: this.stdoutTail.text(), stderr: this.stderrTail.text() }
  }

  private attachChild(child: RuntimeChild): void {
    child.once('exit', (code) => {
      this.handleExit(code)
    })
    child.stdout.on('data', (chunk: Uint8Array | string) => {
      this.handleStdout(chunk)
    })
    child.stderr.on('data', (chunk: Uint8Array | string) => {
      this.handleStderr(chunk)
    })
  }

  private markReady(): void {
    if (this.state !== 'starting') throw new Error(`runtime left starting state before readiness: ${this.state}`)
    this.state = 'ready'
  }

  private async awaitStartup(): Promise<URL> {
    const abort = this.startupAbort as AbortController
    const timeout = deadline(this.options.startupTimeoutMs, 'runtime startup timed out', abort)
    const earlyExit = (this.exit as Deferred<number>).promise.then((code) => {
      throw new Error(`runtime exited with code ${String(code)} before readiness`)
    })
    const probe = (this.readiness as Deferred<URL>).promise.then(async (origin) => {
      await this.options.probe(origin, abort.signal)
      return origin
    })
    try {
      return await Promise.race([probe, earlyExit, timeout.promise])
    } finally {
      timeout.cancel()
    }
  }

  private handleStdout(chunk: Uint8Array | string): void {
    const bytes = typeof chunk === 'string' ? encoder.encode(chunk) : chunk
    this.stdoutTail.push(bytes)
    this.emitLog({ source: 'stdout', text: this.stdoutTail.text() })
    if (this.state !== 'starting') return
    this.consumeReadyText(this.stdoutDecoder.decode(bytes, { stream: true }))
  }

  private handleStderr(chunk: Uint8Array | string): void {
    const bytes = typeof chunk === 'string' ? encoder.encode(chunk) : chunk
    this.stderrTail.push(bytes)
    this.emitLog({ source: 'stderr', text: this.stderrTail.text() })
  }

  private consumeReadyText(text: string): void {
    if (this.discardingLongLine) {
      const newline = text.indexOf('\n')
      const discarded = newline === -1 ? text : text.slice(0, newline)
      if (discarded.includes('dsh web')) this.rejectReadiness('runtime emitted an invalid readiness line')
      if (newline === -1) return
      this.discardingLongLine = false
      text = text.slice(newline + 1)
    }

    this.pendingStdout += text
    let newline = this.pendingStdout.indexOf('\n')
    while (newline !== -1) {
      const rawLine = this.pendingStdout.slice(0, newline)
      this.pendingStdout = this.pendingStdout.slice(newline + 1)
      this.inspectReadyLine(rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine)
      newline = this.pendingStdout.indexOf('\n')
    }
    if (this.pendingStdout.length <= MAX_PENDING_LINE_CHARS) return
    if (this.pendingStdout.includes('dsh web')) this.rejectReadiness('runtime emitted an invalid readiness line')
    this.pendingStdout = ''
    this.discardingLongLine = true
  }

  private inspectReadyLine(line: string): void {
    const origin = parseRuntimeReadyLine(line)
    if (origin !== undefined) {
      this.readiness?.resolve(origin)
      return
    }
    if (line.includes('dsh web')) this.rejectReadiness('runtime emitted an invalid readiness line')
  }

  private rejectReadiness(message: string): void {
    this.readiness?.reject(new Error(message))
  }

  private handleExit(code: number): void {
    const stateAtExit = this.state
    this.emitLog({ source: 'supervisor', text: `runtime child exited code=${String(code)}` })
    this.exit?.resolve(code)
    this.child = undefined
    if (stateAtExit === 'starting') {
      this.readiness?.reject(new Error(`runtime exited with code ${String(code)} before readiness`))
      return
    }
    if (stateAtExit !== 'ready') return

    this.state = 'failed'
    const listener = this.options.onUnexpectedExit
    if (listener === undefined) return
    try {
      listener({ code, diagnostics: this.diagnostics() })
    } catch (error: unknown) {
      void error
      this.emitLog({ source: 'supervisor', text: 'unexpected-exit listener failed' })
    }
  }

  private async terminateFailedStart(): Promise<void> {
    const child = this.child
    const exit = this.exit
    if (child === undefined || exit === undefined || exit.settled) return
    child.kill()
    if (await exitsWithin(exit.promise, this.options.stopTimeoutMs)) return
    child.kill()
    if (!(await exitsWithin(exit.promise, this.options.stopTimeoutMs))) {
      throw new Error('runtime did not exit after forced startup cleanup')
    }
  }

  private async performStop(child: RuntimeChild, exit: Deferred<number>): Promise<{ forced: boolean }> {
    child.kill()
    if (await exitsWithin(exit.promise, this.options.stopTimeoutMs)) {
      this.state = 'stopped'
      return { forced: false }
    }

    child.kill()
    if (!(await exitsWithin(exit.promise, this.options.stopTimeoutMs))) {
      this.state = 'failed'
      throw new Error('runtime did not exit after forced termination')
    }
    this.state = 'stopped'
    return { forced: true }
  }

  private emitLog(entry: RuntimeLogEntry): void {
    const sink = this.options.logSink
    if (sink === undefined) return
    const bounded = boundLogEntry(entry, this.options.diagnosticMaxBytes)
    try {
      sink(bounded)
    } catch (error: unknown) {
      // A diagnostic consumer cannot change the runtime lifecycle.
      void error
    }
  }

  private isStopping(): boolean {
    return this.state === 'stopping'
  }
}

function deferred<T>(): Deferred<T> {
  let settled = false
  let resolvePromise!: (value: T) => void
  let rejectPromise!: (error: unknown) => void
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  return {
    promise,
    get settled() {
      return settled
    },
    resolve(value) {
      if (settled) return
      settled = true
      resolvePromise(value)
    },
    reject(error) {
      if (settled) return
      settled = true
      rejectPromise(error)
    },
  }
}

function deadline(milliseconds: number, message: string, abort: AbortController): {
  readonly promise: Promise<never>
  cancel(): void
} {
  let timer: NodeJS.Timeout | undefined
  const promise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error(message)
      abort.abort(error)
      reject(error)
    }, milliseconds)
  })
  return {
    promise,
    cancel: () => {
      clearTimeout(timer)
    },
  }
}

function exitsWithin(exit: Promise<number>, milliseconds: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(false)
    }, milliseconds)
    void exit.then(() => {
      clearTimeout(timer)
      resolve(true)
    })
  })
}

function boundLogEntry(entry: RuntimeLogEntry, maxBytes: number): RuntimeLogEntry {
  if (Buffer.byteLength(entry.text) <= maxBytes) return entry
  const tail = new OutputTail(maxBytes)
  tail.push(encoder.encode(entry.text))
  return { ...entry, text: tail.text() }
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`)
}
