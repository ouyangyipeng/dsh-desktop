/** Owned Web-runtime startup, diagnostics, exit, and shutdown behavior. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  RuntimeSupervisor,
  type RuntimeLogEntry,
  type RuntimeProbe,
  type RuntimeStartResult,
} from '../../src/main/runtime-supervisor.ts'
import { FakeRuntimeChild, fakeRuntimeFactory } from './fixtures/fake-runtime-child.ts'

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
  reject(error: unknown): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function supervisor(
  child: FakeRuntimeChild,
  overrides: Partial<ConstructorParameters<typeof RuntimeSupervisor>[0]> = {},
): { runtime: RuntimeSupervisor; inputs: ReturnType<typeof fakeRuntimeFactory>['inputs'] } {
  const { factory, inputs } = fakeRuntimeFactory(child)
  return {
    inputs,
    runtime: new RuntimeSupervisor({
      childFactory: factory,
      entry: '/app/node_modules/@deepseek-ai/dsh/lib/bin.js',
      patchPath: '/app/runtime/dsh-desktop.patch.yml',
      cwd: '/data/harness',
      env: { PATH: '/bin', DSH_HOME: '/data/harness' },
      probe: async () => {},
      startupTimeoutMs: 100,
      stopTimeoutMs: 50,
      diagnosticMaxBytes: 64,
      ...overrides,
    }),
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('runtime supervisor', () => {
  it('parses split stdout lines and resolves only after the readiness probe', async () => {
    const child = new FakeRuntimeChild()
    const gate = deferred<undefined>()
    const probeMock = vi.fn(() => gate.promise)
    const probe: RuntimeProbe = probeMock
    const { runtime, inputs } = supervisor(child, { probe })
    let settled = false
    const starting = runtime.start().then((result) => {
      settled = true
      return result
    })

    child.writeStdout('booting\ndsh web: http://127.')
    child.writeStdout('0.0.1:43127\n')
    await vi.waitFor(() => {
      expect(probeMock).toHaveBeenCalledOnce()
    })
    expect(settled).toBe(false)
    gate.resolve(undefined)

    await expect(starting).resolves.toEqual({
      origin: new URL('http://127.0.0.1:43127/'),
      pid: 4242,
    } satisfies RuntimeStartResult)
    expect(inputs).toEqual([{
      entry: '/app/node_modules/@deepseek-ai/dsh/lib/bin.js',
      args: ['web', '--patch', '/app/runtime/dsh-desktop.patch.yml', '--host', '127.0.0.1', '--port', '0'],
      cwd: '/data/harness',
      env: { PATH: '/bin', DSH_HOME: '/data/harness' },
    }])
    await expect(runtime.stop()).resolves.toEqual({ forced: false })
  })

  it('rejects a relative Desktop overlay path before spawning', () => {
    const child = new FakeRuntimeChild()
    expect(() => supervisor(child, { patchPath: 'config/dsh-desktop.patch.yml' })).toThrow('absolute')
  })

  it('rejects when the child exits before readiness', async () => {
    const child = new FakeRuntimeChild()
    const { runtime } = supervisor(child)
    const starting = runtime.start()

    child.writeStderr('startup failed')
    child.exit(2)

    await expect(starting).rejects.toThrow(/exited with code 2 before readiness/)
    expect(runtime.diagnostics()).toEqual({ stdout: '', stderr: 'startup failed' })
  })

  it('fails loud and terminates the child on an invalid readiness line', async () => {
    const child = new FakeRuntimeChild()
    const { runtime } = supervisor(child)
    const starting = runtime.start()

    child.writeStdout('dsh web: http://127.0.0.1:43127 (LAN: http://192.168.1.5:43127)\n')

    await expect(starting).rejects.toThrow(/invalid readiness line/)
    expect(child.killCount).toBe(1)
  })

  it('aborts the probe and kills the child at the startup deadline', async () => {
    vi.useFakeTimers()
    const child = new FakeRuntimeChild()
    let probeSignal: AbortSignal | undefined
    const probe: RuntimeProbe = async (_url, signal) => {
      probeSignal = signal
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(new Error('probe aborted'))
        }, { once: true })
      })
    }
    const { runtime } = supervisor(child, { probe })
    const starting = runtime.start()
    const rejection = expect(starting).rejects.toThrow(/startup timed out/)
    child.writeStdout('dsh web: http://127.0.0.1:43127\n')
    await vi.advanceTimersByTimeAsync(100)

    await rejection
    expect(probeSignal?.aborted).toBe(true)
    expect(child.killCount).toBe(1)
  })

  it('forces shutdown after the graceful deadline and waits for exit', async () => {
    vi.useFakeTimers()
    const child = new FakeRuntimeChild(2, 1)
    const { runtime } = supervisor(child)
    const starting = runtime.start()
    child.writeStdout('dsh web: http://127.0.0.1:43127\n')
    await starting

    const stopping = runtime.stop()
    expect(child.killCount).toBe(1)
    await vi.advanceTimersByTimeAsync(50)

    await expect(stopping).resolves.toEqual({ forced: true })
    expect(child.killCount).toBe(2)
  })

  it('reports one unexpected exit after readiness without restarting', async () => {
    const child = new FakeRuntimeChild()
    const onUnexpectedExit = vi.fn()
    const { runtime } = supervisor(child, { onUnexpectedExit })
    const starting = runtime.start()
    child.writeStdout('dsh web: http://127.0.0.1:43127\n')
    await starting

    child.exit(9)
    child.exit(9)
    await vi.waitFor(() => {
      expect(onUnexpectedExit).toHaveBeenCalledOnce()
    })

    expect(onUnexpectedExit).toHaveBeenCalledWith({
      code: 9,
      diagnostics: runtime.diagnostics(),
    })
    await expect(runtime.start()).rejects.toThrow(/cannot start from failed/)
  })

  it('bounds diagnostics and each emitted log snapshot', async () => {
    const child = new FakeRuntimeChild()
    const entries: RuntimeLogEntry[] = []
    const { runtime } = supervisor(child, {
      diagnosticMaxBytes: 8,
      logSink: entry => entries.push(entry),
    })
    const starting = runtime.start()

    child.writeStdout('abcdefghijklmnop\n')
    child.writeStderr('qrstuvwxyz')
    child.writeStdout('dsh web: http://127.0.0.1:43127\n')
    await starting

    const diagnostics = runtime.diagnostics()
    expect(Buffer.byteLength(diagnostics.stdout)).toBeLessThanOrEqual(8)
    expect(Buffer.byteLength(diagnostics.stderr)).toBeLessThanOrEqual(8)
    expect(entries.every(entry => Buffer.byteLength(entry.text) <= 8)).toBe(true)
    await runtime.stop()
  })

  it('contains an unexpected-exit callback exception', async () => {
    const child = new FakeRuntimeChild()
    const logSink = vi.fn()
    const { runtime } = supervisor(child, {
      logSink,
      onUnexpectedExit: () => {
        throw new Error('listener failed')
      },
    })
    const starting = runtime.start()
    child.writeStdout('dsh web: http://127.0.0.1:43127\n')
    await starting

    expect(() => {
      child.exit(7)
    }).not.toThrow()
    expect(logSink).toHaveBeenCalledWith({ source: 'supervisor', text: 'unexpected-exit listener failed' })
  })

  it('makes stop idempotent and forbids parallel or later restarts', async () => {
    const child = new FakeRuntimeChild()
    const { runtime } = supervisor(child)
    const starting = runtime.start()
    await expect(runtime.start()).rejects.toThrow(/cannot start from starting/)
    child.writeStdout('dsh web: http://127.0.0.1:43127\n')
    await starting

    await expect(runtime.stop()).resolves.toEqual({ forced: false })
    await expect(runtime.stop()).resolves.toEqual({ forced: false })
    expect(child.killCount).toBe(1)
    await expect(runtime.start()).rejects.toThrow(/cannot start from stopped/)
  })
})
