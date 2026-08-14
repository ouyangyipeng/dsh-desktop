import { describe, expect, it } from 'vitest'
import { resolveCommandExecutable } from '../../scripts/process.ts'

describe('script command executable', () => {
  it('uses the pnpm command shim required by Windows child_process', () => {
    expect(resolveCommandExecutable('pnpm', 'win32')).toBe('pnpm.cmd')
  })

  it('preserves native executables and POSIX commands', () => {
    expect(resolveCommandExecutable('git', 'win32')).toBe('git')
    expect(resolveCommandExecutable('pnpm', 'darwin')).toBe('pnpm')
    expect(resolveCommandExecutable('/usr/local/bin/node', 'linux')).toBe('/usr/local/bin/node')
  })
})
