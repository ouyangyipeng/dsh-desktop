import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  RuntimeSupervisor,
  type RuntimeChild,
  type RuntimeChildInput,
} from '../../src/main/runtime-supervisor.ts'

const REPOSITORY_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const BUILT_CLI = join(REPOSITORY_ROOT, 'dist/stage/node_modules/@deepseek-ai/dsh/lib/bin.js')
const EXPECTED_TRANSCRIPT = new URL('./fixtures/desktop-runtime.expected.txt', import.meta.url)
const SECRET_ENVIRONMENT_NAME = /(?:^|_)(?:API_KEY|TOKEN|PASSWORD|SECRET)(?:_|$)/u

class NodeRuntimeChild implements RuntimeChild {
  readonly stdout: Readable
  readonly stderr: Readable
  readonly pid: number | undefined
  readonly exited: Promise<number>

  constructor(private readonly child: ChildProcessByStdio<null, Readable, Readable>) {
    this.stdout = child.stdout
    this.stderr = child.stderr
    this.pid = child.pid
    this.exited = new Promise((resolve) => {
      child.once('exit', (code) => {
        resolve(code ?? -1)
      })
    })
  }

  kill(): boolean {
    if (this.pid === undefined || process.platform === 'win32') return this.child.kill('SIGTERM')
    try {
      process.kill(-this.pid, 'SIGTERM')
      return true
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false
      throw error
    }
  }

  once(_event: 'exit', listener: (code: number) => void): this {
    this.child.once('exit', (code) => {
      listener(code ?? -1)
    })
    return this
  }
}

function spawnNodeRuntime(input: RuntimeChildInput): NodeRuntimeChild {
  const child = spawn(process.execPath, [input.entry, ...input.args], {
    cwd: input.cwd,
    detached: process.platform !== 'win32',
    env: { ...input.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return new NodeRuntimeChild(child)
}

function keylessEnvironment(runtimeRoot: string): Record<string, string> {
  const environment = Object.fromEntries(Object.entries(process.env).filter(
    (entry): entry is [string, string] => entry[1] !== undefined && !SECRET_ENVIRONMENT_NAME.test(entry[0]),
  ))
  delete environment.DEEPSEEK_BASE_URL
  delete environment.NODE_OPTIONS
  delete environment.NODE_NO_WARNINGS
  environment.DSH_HOME = join(runtimeRoot, 'harness')
  environment.DSH_AGENTS_HOME = join(runtimeRoot, 'agents')
  environment.DSH_TELEMETRY_DISABLED = '1'
  return environment
}

describe('assembled desktop runtime', () => {
  it('boots the built Web profile through the desktop supervisor and stops cleanly', async () => {
    expect(existsSync(BUILT_CLI), `missing built CLI ${BUILT_CLI}; run pnpm run build`).toBe(true)
    const runtimeRoot = await mkdtemp(join(tmpdir(), 'dsh-desktop-snapshot-'))
    let child: NodeRuntimeChild | undefined
    let frontendReady = false
    const runtime = new RuntimeSupervisor({
      entry: BUILT_CLI,
      cwd: runtimeRoot,
      env: keylessEnvironment(runtimeRoot),
      childFactory: (input) => {
        child = spawnNodeRuntime(input)
        return child
      },
      probe: async (origin, signal) => {
        const response = await fetch(origin, { signal })
        const body = await response.text()
        if (response.status !== 200 || !body.includes('<title>DeepSeek Harness</title>')) {
          throw new Error(`desktop Web root was not ready: HTTP ${String(response.status)}`)
        }
        frontendReady = true
      },
      startupTimeoutMs: 60_000,
      stopTimeoutMs: 15_000,
      diagnosticMaxBytes: 16_384,
    })

    const transcript: string[] = ['surface=DS-Harness Desktop', 'profile=web']
    try {
      const started = await runtime.start()
      transcript.push(`host=${started.origin.hostname}`)
      transcript.push(`port=${started.origin.port === '' ? 'missing' : 'operating-system-selected'}`)
      transcript.push(`frontend=${frontendReady ? 'ready' : 'not-ready'}`)
      const stopped = await runtime.stop()
      const exitCode = child === undefined ? -1 : await child.exited
      const expectedExit = exitCode === 0 || process.platform === 'win32'
      transcript.push(`shutdown=${!stopped.forced && expectedExit ? 'clean' : 'unclean'}`)
    } finally {
      await runtime.stop()
      await rm(runtimeRoot, { recursive: true, force: true })
    }

    const actual = `${transcript.join('\n')}\n`
    expect(actual).toBe((await readFile(EXPECTED_TRANSCRIPT, 'utf8')).replaceAll('\r\n', '\n'))
  }, 75_000)
})
