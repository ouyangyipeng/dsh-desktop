import { spawn } from 'node:child_process'

/** Options for one checked child command. */
export interface RunOptions {
  readonly cwd: string
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly capture?: boolean
}

/**
 * Resolve command shims that Node does not discover without a Windows shell.
 * @param command Requested executable name or path.
 * @param platform Current operating system.
 * @returns Executable accepted by `child_process.spawn` without `shell: true`.
 */
export function resolveCommandExecutable(command: string, platform: NodeJS.Platform): string {
  return platform === 'win32' && command === 'pnpm' ? 'pnpm.cmd' : command
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
    const executable = resolveCommandExecutable(command, process.platform)
    const child = spawn(executable, [...args], {
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
