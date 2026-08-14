import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveDshCliEntry } from '../../src/main/runtime-entry.ts'

describe('desktop runtime entry', () => {
  it('uses the packaged runtime resource tree when supplied', () => {
    const nodeModules = join('/Applications', 'DS-Harness Desktop.app', 'Contents', 'Resources', 'runtime', 'node_modules')

    expect(resolveDshCliEntry(nodeModules)).toBe(join(nodeModules, '@deepseek-ai', 'dsh', 'lib', 'bin.js'))
  })

  it('resolves the workspace dependency for development', () => {
    expect(resolveDshCliEntry()).toBe(resolve(import.meta.dirname, '../../upstream/deepseek-harness/apps/cli/lib/bin.js'))
  })
})
