import type { DesktopLogger } from './logging.ts'
import type { RuntimeStartResult, UnexpectedRuntimeExit } from './runtime-supervisor.ts'

/** Synchronous Electron event surface used to delay application exit. */
export interface QuitEvent {
  /** Cancel Electron's current synchronous quit attempt. */
  preventDefault(): void
}

/** Application lifecycle operations used by the desktop orchestrator. */
export interface DesktopAppPort {
  /** @returns Whether this process owns the application singleton. */
  requestSingleInstanceLock(): boolean
  /** @returns A promise fulfilled after Electron initialization. */
  whenReady(): Promise<void>
  /** Register notification that another process attempted to launch. */
  onSecondInstance(listener: () => void): void
  /** Register macOS application activation. */
  onActivate(listener: () => void): void
  /** Register transition to no open windows. */
  onWindowAllClosed(listener: () => void): void
  /** Register the synchronous quit interception point. */
  onBeforeQuit(listener: (event: QuitEvent) => void): void
  /** Request the ordinary Electron quit sequence. */
  quit(): void
  /** End the process after owned asynchronous cleanup. */
  exit(code: number): void
}

/** One desktop renderer window owned by the orchestrator. */
export interface DesktopWindowPort {
  /** Load the validated runtime URL. */
  load(url: URL): Promise<void>
  /** Register the first-paint visibility point. */
  onReadyToShow(listener: () => void): void
  /** Register final window closure. */
  onClosed(listener: () => void): void
  /** Register renderer process loss. */
  onRendererGone(listener: () => void): void
  /** Make the window visible. */
  show(): void
  /** @returns Whether the window is minimized. */
  isMinimized(): boolean
  /** Restore a minimized window. */
  restore(): void
  /** Focus the existing window. */
  focus(): void
  /** Reload the current runtime URL in the same renderer window. */
  reload(): void
}

/** Runtime operations owned across all desktop windows. */
export interface DesktopRuntimePort {
  /** @returns Validated origin and process identity after readiness. */
  start(): Promise<RuntimeStartResult>
  /** @returns Whether a second termination request was required. */
  stop(): Promise<{ forced: boolean }>
}

/** Construction dependencies for the platform-independent lifecycle. */
export interface DesktopLifecycleOptions {
  readonly app: DesktopAppPort
  readonly platform: NodeJS.Platform
  readonly runtime: DesktopRuntimePort
  readonly logger: DesktopLogger
  /** Prepare application-owned directories after Electron becomes ready. */
  readonly prepare: () => Promise<void>
  /** Construct a new hardened renderer window for the existing runtime. */
  readonly createWindow: (origin: URL) => DesktopWindowPort
  /** Show a generic runtime failure dialog for an exit code. */
  readonly showRuntimeFatal: (code: number) => Promise<void>
  /** Ask whether a lost renderer should reload or quit. */
  readonly showRendererGone: () => Promise<'reload' | 'quit'>
}

/** Own the singleton Electron application, one Host runtime, and at most one window. */
export class DesktopLifecycle {
  private window: DesktopWindowPort | undefined
  private origin: URL | undefined
  private runtimeFatalShown = false
  private rendererFailureActive = false
  private failureExitRequested = false
  private shutdown: Promise<void> | undefined

  /** @param options Electron adapters, one runtime, diagnostics, and dialog callbacks. */
  constructor(private readonly options: DesktopLifecycleOptions) {}

  /**
   * Acquire the singleton, initialize owned resources, and launch the runtime and window.
   * @returns Whether this process became the active desktop instance.
   */
  async start(): Promise<boolean> {
    if (!this.options.app.requestSingleInstanceLock()) {
      this.options.app.quit()
      return false
    }
    this.installApplicationHandlers()

    try {
      await this.options.app.whenReady()
      if (this.isShutdownStarted()) return false
      await this.options.logger.initialize()
      await this.options.prepare()
      if (this.isShutdownStarted()) return false
      this.options.logger.record('runtime.starting')
      const started = await this.options.runtime.start()
      if (this.isShutdownStarted()) return false
      this.origin = started.origin
      this.options.logger.record('runtime.ready', {
        pid: started.pid,
        origin: started.origin.origin,
      })
      await this.openWindow()
      return true
    } catch (error: unknown) {
      if (this.isShutdownStarted()) return false
      this.recordError('application.start.failed', error)
      await this.safeRuntimeFatal(-1)
      await this.safeFlush()
      this.options.app.exit(1)
      return false
    }
  }

  /** Begin the ordinary Electron quit sequence from menus or fatal dialogs. */
  requestQuit(): void {
    this.options.app.quit()
  }

  /**
   * Handle the one ready runtime's terminal failure without creating a replacement Host.
   * @param exit - Bounded supervisor diagnostics and process exit code.
   */
  handleUnexpectedRuntimeExit(exit: UnexpectedRuntimeExit): void {
    if (this.runtimeFatalShown) return
    this.runtimeFatalShown = true
    this.failureExitRequested = true
    this.options.logger.record('runtime.unexpected-exit', {
      code: exit.code,
      stdout: exit.diagnostics.stdout,
      stderr: exit.diagnostics.stderr,
    })
    void this.safeRuntimeFatal(exit.code).finally(() => {
      this.options.app.quit()
    })
  }

  private installApplicationHandlers(): void {
    this.options.app.onSecondInstance(() => {
      this.focusWindow()
    })
    this.options.app.onActivate(() => {
      if (this.window !== undefined) {
        this.focusWindow()
        return
      }
      if (this.origin === undefined) return
      void this.openWindow().catch((error: unknown) => {
        this.handleWindowOpenFailure(error)
      })
    })
    this.options.app.onWindowAllClosed(() => {
      if (this.options.platform !== 'darwin') this.options.app.quit()
    })
    this.options.app.onBeforeQuit((event) => {
      event.preventDefault()
      if (this.shutdown !== undefined) return
      this.shutdown = this.performShutdown()
    })
  }

  private async openWindow(): Promise<void> {
    if (this.window !== undefined) return
    const origin = this.origin
    if (origin === undefined) throw new Error('desktop runtime origin is unavailable')
    const window = this.options.createWindow(origin)
    this.window = window
    window.onReadyToShow(() => {
      if (this.window === window) window.show()
    })
    window.onClosed(() => {
      if (this.window === window) this.window = undefined
    })
    window.onRendererGone(() => {
      this.handleRendererGone(window)
    })
    await window.load(origin)
  }

  private focusWindow(): void {
    const window = this.window
    if (window === undefined) return
    if (window.isMinimized()) window.restore()
    window.focus()
  }

  private handleRendererGone(window: DesktopWindowPort): void {
    if (window !== this.window || this.rendererFailureActive) return
    this.rendererFailureActive = true
    this.options.logger.record('renderer.gone')
    void this.options.showRendererGone()
      .then((decision) => {
        if (decision === 'reload' && window === this.window) {
          window.reload()
          this.rendererFailureActive = false
          return
        }
        this.failureExitRequested = true
        this.options.app.quit()
      })
      .catch((error: unknown) => {
        this.recordError('renderer.dialog.failed', error)
        this.failureExitRequested = true
        this.options.app.quit()
      })
  }

  private handleWindowOpenFailure(error: unknown): void {
    this.failureExitRequested = true
    this.recordError('window.open.failed', error)
    void this.safeRuntimeFatal(-1).finally(() => {
      this.options.app.quit()
    })
  }

  private async performShutdown(): Promise<void> {
    let exitCode = this.failureExitRequested ? 1 : 0
    try {
      const result = await this.options.runtime.stop()
      if (result.forced) exitCode = 1
      this.options.logger.record('runtime.stopped', { forced: result.forced })
    } catch (error: unknown) {
      exitCode = 1
      this.recordError('runtime.stop.failed', error)
    }
    if (!(await this.safeFlush())) exitCode = 1
    this.options.app.exit(exitCode)
  }

  private async safeRuntimeFatal(code: number): Promise<void> {
    try {
      await this.options.showRuntimeFatal(code)
    } catch (error: unknown) {
      this.recordError('runtime.dialog.failed', error)
    }
  }

  private async safeFlush(): Promise<boolean> {
    try {
      await this.options.logger.flush()
      return true
    } catch {
      return false
    }
  }

  private isShutdownStarted(): boolean {
    return this.shutdown !== undefined
  }

  private recordError(event: string, error: unknown): void {
    if (error instanceof Error) {
      this.options.logger.record(event, { name: error.name, message: error.message })
      return
    }
    this.options.logger.record(event, { name: 'UnknownError', message: 'non-Error failure' })
  }
}
