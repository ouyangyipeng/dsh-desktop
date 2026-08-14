import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolvePackagedExecutable } from '../../scripts/smoke-packaged.ts'

describe('packaged smoke executable', () => {
  it('resolves the application executable inside a macOS bundle', () => {
    expect(resolvePackagedExecutable(['--', '/Volumes/Test/DS-Harness Desktop.app'], 'darwin')).toBe(
      resolve('/Volumes/Test/DS-Harness Desktop.app/Contents/MacOS/DS-Harness Desktop'),
    )
  })

  it('accepts an unpacked Windows application executable', () => {
    expect(resolvePackagedExecutable(['C:\\build\\DS-Harness Desktop.exe'], 'win32')).toBe(
      resolve('C:\\build\\DS-Harness Desktop.exe'),
    )
  })

  it('rejects an unsupported host, target, or argument count', () => {
    expect(() => resolvePackagedExecutable([], 'darwin')).toThrow('Usage:')
    expect(() => resolvePackagedExecutable(['desktop.exe'], 'darwin')).toThrow('Usage:')
    expect(() => resolvePackagedExecutable(['Desktop.app'], 'win32')).toThrow('Usage:')
    expect(() => resolvePackagedExecutable(['Desktop.app'], 'linux')).toThrow('Usage:')
  })
})
