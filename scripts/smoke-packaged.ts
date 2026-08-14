import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

const TIMEOUT_MS = 60_000
const MAX_OUTPUT_CODE_UNITS = 16_384
const USAGE = 'Usage: pnpm smoke:packaged -- <mounted macOS .app or unpacked Windows .exe>'

/**
 * Resolve the executable used by one target-native packaged smoke.
 * @param argv Package path, optionally prefixed by pnpm's separator.
 * @param platform Current target operating system.
 * @returns Absolute packaged executable path.
 */
export function resolvePackagedExecutable(argv: readonly string[], platform: NodeJS.Platform): string {
  const args = argv[0] === '--' ? argv.slice(1) : argv
  if (args.length !== 1) throw new Error(USAGE)
  const target = args[0] as string
  if (platform === 'darwin' && target.endsWith('.app')) {
    return join(resolve(target), 'Contents', 'MacOS', 'DS-Harness Desktop')
  }
  if (platform === 'win32' && target.toLowerCase().endsWith('.exe')) return resolve(target)
  throw new Error(USAGE)
}

/** Launch one target-native packaged application until its internal smoke lifecycle exits. */
export async function smokePackagedDesktop(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const args = argv[0] === '--' ? argv.slice(1) : argv
  const target = args[0] === undefined ? 'packaged application' : resolve(args[0])
  const executable = resolvePackagedExecutable(argv, process.platform)
  if (!existsSync(executable)) throw new Error(`packaged desktop executable is missing: ${executable}`)

  const temporaryHome = await mkdtemp(join(tmpdir(), 'dsh-desktop-packaged-smoke-'))
  const logPath = join(temporaryHome, 'logs', 'desktop.log')
  try {
    const result = await runPackagedApplication(executable, temporaryHome)
    if (result.code !== 0) {
      throw new Error(`packaged desktop exited with ${describeExit(result.code, result.signal)}\n${result.output}`)
    }
    const log = await readFile(logPath, 'utf8')
    for (const event of ['runtime.ready', 'application.smoke.ready', 'runtime.stopped forced=false']) {
      if (!log.includes(event)) throw new Error(`packaged desktop log lacks ${event}:\n${log.slice(-MAX_OUTPUT_CODE_UNITS)}`)
    }
    console.log(`dsh-desktop packaged smoke: ${basename(target)} reached runtime.ready and stopped cleanly`)
  } catch (error: unknown) {
    let log = ''
    try {
      log = await readFile(logPath, 'utf8')
    } catch {
      log = 'packaged desktop log was not created'
    }
    const message = error instanceof Error ? error.message : 'packaged smoke failed with a non-Error value'
    throw new Error(`${message}\n${log.slice(-MAX_OUTPUT_CODE_UNITS)}`)
  } finally {
    await rm(temporaryHome, { recursive: true, force: true })
  }
}

interface ProcessResult {
  readonly code: number | null
  readonly signal: NodeJS.Signals | null
  readonly output: string
}

async function runPackagedApplication(executable: string, temporaryHome: string): Promise<ProcessResult> {
  return new Promise<ProcessResult>((resolvePromise, reject) => {
    const child = spawn(executable, [], {
      env: {
        ...process.env,
        DSH_DESKTOP_SMOKE: '1',
        DSH_DESKTOP_SMOKE_ROOT: temporaryHome,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    const capture = (chunk: Buffer): void => {
      output = `${output}${chunk.toString('utf8')}`.slice(-MAX_OUTPUT_CODE_UNITS)
    }
    child.stdout.on('data', capture)
    child.stderr.on('data', capture)
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`packaged desktop did not exit within ${String(TIMEOUT_MS)} ms\n${output}`))
    }, TIMEOUT_MS)
    child.once('error', (error) => {
      clearTimeout(timeout)
      reject(new Error(`packaged desktop failed to start: ${error.message}`))
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timeout)
      resolvePromise({ code, signal, output })
    })
  })
}

function describeExit(code: number | null, signal: NodeJS.Signals | null): string {
  return code === null ? `signal ${signal ?? 'unknown'}` : `code ${String(code)}`
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) {
  await smokePackagedDesktop()
}
