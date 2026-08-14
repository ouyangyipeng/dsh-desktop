import { describe, expect, it } from 'vitest'
import { resolveProcessTreeTermination } from '../../src/main/process-tree.ts'

describe('process tree termination', () => {
  it('targets a POSIX process group gracefully before using SIGKILL', () => {
    expect(resolveProcessTreeTermination(4242, false, 'darwin')).toEqual({
      kind: 'signal',
      pid: -4242,
      signal: 'SIGTERM',
    })
    expect(resolveProcessTreeTermination(4242, true, 'linux')).toEqual({
      kind: 'signal',
      pid: -4242,
      signal: 'SIGKILL',
    })
  })

  it('targets the complete Windows process tree and forces only the second request', () => {
    expect(resolveProcessTreeTermination(4242, false, 'win32')).toEqual({
      kind: 'taskkill',
      command: 'taskkill.exe',
      args: ['/PID', '4242', '/T'],
    })
    expect(resolveProcessTreeTermination(4242, true, 'win32')).toEqual({
      kind: 'taskkill',
      command: 'taskkill.exe',
      args: ['/PID', '4242', '/T', '/F'],
    })
  })

  it.each([0, -1, 1.5, Number.NaN])('rejects an unsafe process identifier: %s', (pid) => {
    expect(() => resolveProcessTreeTermination(pid, false, 'darwin')).toThrow('positive integer')
  })
})
