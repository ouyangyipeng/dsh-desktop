import { spawn } from 'node:child_process'

/** Options for one checked child command. */
export interface RunOptions {
  readonly cwd: string
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly capture?: boolean
}

/** One executable and its argument vector after platform adaptation. */
export interface CommandInvocation {
  readonly executable: string
  readonly args: readonly string[]
}

/**
 * Resolve command shims that Node cannot execute directly on Windows.
 * @param command Requested executable name or path.
 * @param args Explicit argument vector.
 * @param platform Current operating system.
 * @param commandShell Windows command interpreter path.
 * @returns Executable and arguments accepted by `child_process.spawn`.
 */
export function resolveCommandInvocation(
  command: string,
  args: readonly string[],
  platform: NodeJS.Platform,
  commandShell = 'cmd.exe',
): CommandInvocation {
  if (platform === 'win32' && command === 'pnpm') {
    return { executable: commandShell, args: ['/d', '/s', '/c', 'pnpm.cmd', ...args] }
  }
  return { executable: command, args }
}

/**
 * Execute one command and reject with its exact failed role.
 * @param command Executable name or path.
 * @param args Explicit argument vector.
 * @param options Working directory, environment additions, and capture mode.
 * @returns Captured stdout when requested, otherwise an empty string.
 */
export async function run(command: string, args: readonly string[], options: RunOptions): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    const invocation = resolveCommandInvocation(command, args, process.platform, process.env.ComSpec)
    const child = spawn(invocation.executable, [...invocation.args], {
      cwd: options.cwd,
      env: inheritedEnvironment(options.env),
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    })
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.once('error', (error) => {
      reject(new Error(`${command} failed to start: ${error.message}`))
    })
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve(stdout)
        return
      }
      const cause = code === null ? `signal ${signal ?? 'unknown'}` : `exit code ${String(code)}`
      const detail = stderr.trim() === '' ? '' : `: ${stderr.trim()}`
      reject(new Error(`${command} failed with ${cause}${detail}`))
    })
  })
}

function inheritedEnvironment(additions?: Readonly<Record<string, string | undefined>>): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env }
  for (const [key, value] of Object.entries(additions ?? {})) {
    if (value === undefined) delete environment[key]
    else environment[key] = value
  }
  return environment
}
