import { describe, expect, it } from 'vitest'
import { resolveCommandInvocation } from '../../scripts/process.ts'

describe('script command invocation', () => {
  it('runs the pnpm command shim through the Windows command interpreter', () => {
    expect(resolveCommandInvocation('pnpm', ['install', '--frozen-lockfile'], 'win32', 'C:\\Windows\\System32\\cmd.exe')).toEqual({
      executable: 'C:\\Windows\\System32\\cmd.exe',
      args: ['/d', '/s', '/c', 'pnpm.cmd', 'install', '--frozen-lockfile'],
    })
  })

  it('preserves native executables and POSIX commands', () => {
    expect(resolveCommandInvocation('git', ['status'], 'win32')).toEqual({ executable: 'git', args: ['status'] })
    expect(resolveCommandInvocation('pnpm', ['build'], 'darwin')).toEqual({ executable: 'pnpm', args: ['build'] })
    expect(resolveCommandInvocation('/usr/local/bin/node', ['app.mjs'], 'linux')).toEqual({ executable: '/usr/local/bin/node', args: ['app.mjs'] })
  })
})
