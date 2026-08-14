/** Desktop application orchestration independent from Electron object identity. */

import { describe, expect, it, vi } from 'vitest'
import { DesktopLifecycle, type DesktopAppPort, type DesktopWindowPort } from '../../src/main/main-lifecycle.ts'
import type { DesktopLogger } from '../../src/main/logging.ts'
import type { RuntimeStartResult, UnexpectedRuntimeExit } from '../../src/main/runtime-supervisor.ts'

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

class FakeApp implements DesktopAppPort {
  lock = true
  quitCount = 0
  relaunchCount = 0
  readonly exitCodes: number[] = []
  readonly listeners = {
    secondInstance: [] as Array<() => void>,
    activate: [] as Array<() => void>,
    windowAllClosed: [] as Array<() => void>,
    beforeQuit: [] as Array<(event: { preventDefault(): void }) => void>,
  }

  requestSingleInstanceLock(): boolean {
    return this.lock
  }

  async whenReady(): Promise<void> {}

  onSecondInstance(listener: () => void): void {
    this.listeners.secondInstance.push(listener)
  }

  onActivate(listener: () => void): void {
    this.listeners.activate.push(listener)
  }

  onWindowAllClosed(listener: () => void): void {
    this.listeners.windowAllClosed.push(listener)
  }

  onBeforeQuit(listener: (event: { preventDefault(): void }) => void): void {
    this.listeners.beforeQuit.push(listener)
  }

  quit(): void {
    this.quitCount += 1
  }

  relaunch(): void {
    this.relaunchCount += 1
  }

  exit(code: number): void {
    this.exitCodes.push(code)
  }

  emit(name: 'secondInstance' | 'activate' | 'windowAllClosed'): void {
    for (const listener of this.listeners[name]) listener()
  }

  beforeQuit(): { preventDefault: ReturnType<typeof vi.fn> } {
    const event = { preventDefault: vi.fn() }
    for (const listener of this.listeners.beforeQuit) listener(event)
    return event
  }
}

class FakeWindow implements DesktopWindowPort {
  showCount = 0
  focusCount = 0
  restoreCount = 0
  reloadCount = 0
  minimized = false
  readonly loaded: URL[] = []
  private readyListener: (() => void) | undefined
  private closedListener: (() => void) | undefined
  private rendererGoneListener: (() => void) | undefined

  async load(url: URL): Promise<void> {
    this.loaded.push(url)
  }

  onReadyToShow(listener: () => void): void {
    this.readyListener = listener
  }

  onClosed(listener: () => void): void {
    this.closedListener = listener
  }

  onRendererGone(listener: () => void): void {
    this.rendererGoneListener = listener
  }

  show(): void {
    this.showCount += 1
  }

  isMinimized(): boolean {
    return this.minimized
  }

  restore(): void {
    this.restoreCount += 1
    this.minimized = false
  }

  focus(): void {
    this.focusCount += 1
  }

  reload(): void {
    this.reloadCount += 1
  }

  ready(): void {
    this.readyListener?.()
  }

  close(): void {
    this.closedListener?.()
  }

  rendererGone(): void {
    this.rendererGoneListener?.()
  }
}

class FakeLogger implements DesktopLogger {
  initialize = vi.fn(async () => {})
  record = vi.fn()
  flush = vi.fn(async () => {})
}

function harness(platform: NodeJS.Platform = 'darwin', stopResult: Promise<{ forced: boolean }> = Promise.resolve({ forced: false })) {
  const app = new FakeApp()
  const logger = new FakeLogger()
  const windows: FakeWindow[] = []
  const order: string[] = []
  const runtime = {
    start: vi.fn(async (): Promise<RuntimeStartResult> => {
      order.push('runtime')
      return { origin: new URL('http://127.0.0.1:43127/'), pid: 42 }
    }),
    stop: vi.fn(async () => await stopResult),
  }
  const showRuntimeFatal = vi.fn(async (): Promise<'retry' | 'quit'> => 'quit')
  const showRendererGone = vi.fn(async (): Promise<'reload' | 'quit'> => 'reload')
  const lifecycle = new DesktopLifecycle({
    app,
    platform,
    runtime,
    logger,
    prepare: async () => {
      order.push('prepare')
    },
    createWindow: () => {
      order.push('window')
      const window = new FakeWindow()
      windows.push(window)
      return window
    },
    showRuntimeFatal,
    showRendererGone,
  })
  return { app, logger, windows, order, runtime, lifecycle, showRuntimeFatal, showRendererGone }
}

describe('desktop main lifecycle', () => {
  it('quits immediately without preparing or starting when another instance owns the lock', async () => {
    const context = harness()
    context.app.lock = false

    await expect(context.lifecycle.start()).resolves.toBe(false)
    expect(context.app.quitCount).toBe(1)
    expect(context.runtime.start).not.toHaveBeenCalled()
    expect(context.windows).toHaveLength(0)
  })

  it('prepares before starting one runtime and shows only after ready-to-show', async () => {
    const context = harness()

    await expect(context.lifecycle.start()).resolves.toBe(true)
    expect(context.order).toEqual(['prepare', 'runtime', 'window'])
    expect(context.windows[0]?.loaded).toEqual([new URL('http://127.0.0.1:43127/')])
    expect(context.windows[0]?.showCount).toBe(0)
    context.windows[0]?.ready()
    expect(context.windows[0]?.showCount).toBe(1)
  })

  it('relaunches a fresh process when startup recovery requests retry', async () => {
    const context = harness()
    context.runtime.start.mockRejectedValueOnce(new Error('runtime unavailable'))
    context.showRuntimeFatal.mockResolvedValueOnce('retry')

    await expect(context.lifecycle.start()).resolves.toBe(false)

    expect(context.showRuntimeFatal).toHaveBeenCalledWith(-1)
    expect(context.app.relaunchCount).toBe(1)
    expect(context.app.exitCodes).toEqual([0])
  })

  it('restores and focuses the existing window for a second instance', async () => {
    const context = harness()
    await context.lifecycle.start()
    const window = context.windows[0] as FakeWindow
    window.minimized = true

    context.app.emit('secondInstance')

    expect(window.restoreCount).toBe(1)
    expect(window.focusCount).toBe(1)
    expect(context.runtime.start).toHaveBeenCalledOnce()
  })

  it('keeps the runtime on macOS and recreates only the window on activate', async () => {
    const context = harness('darwin')
    await context.lifecycle.start()
    context.windows[0]?.close()

    context.app.emit('windowAllClosed')
    context.app.emit('activate')
    await vi.waitFor(() => {
      expect(context.windows).toHaveLength(2)
    })

    expect(context.app.quitCount).toBe(0)
    expect(context.runtime.start).toHaveBeenCalledOnce()
    expect(context.windows[1]?.loaded).toEqual([new URL('http://127.0.0.1:43127/')])
  })

  it('requests quit after all windows close on Windows', async () => {
    const context = harness('win32')
    await context.lifecycle.start()

    context.app.emit('windowAllClosed')

    expect(context.app.quitCount).toBe(1)
  })

  it('prevents quit until runtime shutdown and logger flush complete', async () => {
    const stopping = deferred<{ forced: boolean }>()
    const context = harness('darwin', stopping.promise)
    await context.lifecycle.start()

    const event = context.app.beforeQuit()
    const duplicate = context.app.beforeQuit()
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(duplicate.preventDefault).toHaveBeenCalledOnce()
    expect(context.runtime.stop).toHaveBeenCalledOnce()
    expect(context.app.exitCodes).toEqual([])
    stopping.resolve({ forced: false })
    await vi.waitFor(() => {
      expect(context.app.exitCodes).toEqual([0])
    })

    expect(context.logger.flush).toHaveBeenCalledOnce()
  })

  it('returns a failure exit code after forced runtime termination', async () => {
    const context = harness('darwin', Promise.resolve({ forced: true }))
    await context.lifecycle.start()

    context.app.beforeQuit()
    await vi.waitFor(() => {
      expect(context.app.exitCodes).toEqual([1])
    })
  })

  it('shows one fatal dialog for repeated unexpected runtime exit notifications', async () => {
    const context = harness()
    await context.lifecycle.start()
    const exit: UnexpectedRuntimeExit = { code: 9, diagnostics: { stdout: 'tail', stderr: 'failure' } }

    context.lifecycle.handleUnexpectedRuntimeExit(exit)
    context.lifecycle.handleUnexpectedRuntimeExit(exit)
    await vi.waitFor(() => {
      expect(context.app.quitCount).toBe(1)
    })

    expect(context.showRuntimeFatal).toHaveBeenCalledOnce()
    expect(context.showRuntimeFatal).toHaveBeenCalledWith(9)
    context.app.beforeQuit()
    await vi.waitFor(() => {
      expect(context.app.exitCodes).toEqual([1])
    })
  })

  it('reloads a crashed renderer without starting another Host', async () => {
    const context = harness()
    await context.lifecycle.start()
    const window = context.windows[0] as FakeWindow

    window.rendererGone()
    await vi.waitFor(() => {
      expect(window.reloadCount).toBe(1)
    })

    expect(context.showRendererGone).toHaveBeenCalledOnce()
    expect(context.runtime.start).toHaveBeenCalledOnce()
    expect(context.windows).toHaveLength(1)
  })
})
