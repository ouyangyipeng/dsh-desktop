import { spawn } from 'node:child_process'

/** One safe target-specific process-tree termination request. */
export type ProcessTreeTermination = {
  readonly kind: 'signal'
  readonly pid: number
  readonly signal: 'SIGTERM' | 'SIGKILL'
} | {
  readonly kind: 'taskkill'
  readonly command: 'taskkill.exe'
  readonly args: readonly string[]
}

/**
 * Resolve a termination request for the owned process group or Windows tree.
 * @param pid Positive operating-system process identifier.
 * @param force Whether the POSIX graceful deadline has elapsed; Windows has no signal-equivalent tree request.
 * @param platform Target operating system.
 * @returns A request that targets descendants as well as the carrier.
 */
export function resolveProcessTreeTermination(pid: number, force: boolean, platform: NodeJS.Platform): ProcessTreeTermination {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error('process tree pid must be a positive integer')
  if (platform === 'win32') {
    return {
      kind: 'taskkill',
      command: 'taskkill.exe',
      args: ['/PID', String(pid), '/T', '/F'],
    }
  }
  return { kind: 'signal', pid: -pid, signal: force ? 'SIGKILL' : 'SIGTERM' }
}

/**
 * Send one target-specific request to a Desktop-owned process tree.
 * @param pid Positive operating-system process identifier.
 * @param force Whether the graceful deadline has elapsed.
 * @param platform Host operating system.
 * @returns Whether the request reached an existing process or command carrier.
 */
export function terminateProcessTree(pid: number, force: boolean, platform: NodeJS.Platform = process.platform): boolean {
  const request = resolveProcessTreeTermination(pid, force, platform)
  if (request.kind === 'taskkill') {
    const child = spawn(request.command, [...request.args], { stdio: 'ignore', windowsHide: true })
    child.once('error', () => {
      // The runtime exit listener owns the observable failure and deadline.
    })
    return true
  }
  try {
    process.kill(request.pid, request.signal)
    return true
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false
    throw error
  }
}
