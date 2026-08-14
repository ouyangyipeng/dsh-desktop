import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { RuntimeChild, RuntimeChildFactory, RuntimeChildInput } from '../../../src/main/runtime-supervisor.ts'

/** Controllable runtime process used by supervisor lifecycle tests. */
export class FakeRuntimeChild extends EventEmitter implements RuntimeChild {
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly pid = 4242
  killCount = 0
  private exited = false

  constructor(
    private readonly exitOnKillCount = 1,
    private readonly killExitCode = 0,
  ) {
    super()
  }

  kill(): boolean {
    this.killCount++
    if (this.killCount === this.exitOnKillCount) {
      queueMicrotask(() => {
        this.exit(this.killExitCode)
      })
    }
    return true
  }

  override once(event: 'exit', listener: (code: number) => void): this {
    return super.once(event, listener)
  }

  /** Emit the process exit event once. */
  exit(code: number): void {
    if (this.exited) return
    this.exited = true
    this.emit('exit', code)
    this.stdout.end()
    this.stderr.end()
  }

  /** Write one stdout chunk. */
  writeStdout(chunk: string | Uint8Array): void {
    this.stdout.write(chunk)
  }

  /** Write one stderr chunk. */
  writeStderr(chunk: string | Uint8Array): void {
    this.stderr.write(chunk)
  }
}

/** Factory plus captured launch input for one fake child. */
export function fakeRuntimeFactory(child: FakeRuntimeChild): {
  readonly factory: RuntimeChildFactory
  readonly inputs: RuntimeChildInput[]
} {
  const inputs: RuntimeChildInput[] = []
  return {
    inputs,
    factory: (input) => {
      inputs.push(input)
      return child
    },
  }
}
