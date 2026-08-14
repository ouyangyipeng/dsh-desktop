import { describe, expect, it } from 'vitest'
import {
  parseMarketplaceManifest,
  parseMarketplaceSubmoduleStatus,
  parseSubmoduleStatus,
} from '../../scripts/repository.ts'

const SHA = 'a'.repeat(40)

describe('upstream submodule status', () => {
  it('accepts the exact clean gitlink state', () => {
    expect(parseSubmoduleStatus(` ${SHA} upstream/deepseek-harness (heads/master)\n`)).toEqual({
      commit: SHA,
      clean: true,
    })
  })

  it.each([
    [`-${SHA} upstream/deepseek-harness`, 'uninitialized'],
    [`+${SHA} upstream/deepseek-harness`, 'does not match'],
    [`U${SHA} upstream/deepseek-harness`, 'conflict'],
  ])('rejects an unsafe gitlink state', (status, message) => {
    expect(() => parseSubmoduleStatus(status)).toThrow(message)
  })

  it.each([
    '',
    ` ${SHA} another/path`,
    ` ${'A'.repeat(40)} upstream/deepseek-harness`,
    ` ${SHA} upstream/deepseek-harness\n ${SHA} upstream/extra`,
  ])('rejects an unexpected status line: %j', (status) => {
    expect(() => parseSubmoduleStatus(status)).toThrow('unexpected')
  })
})

describe('Marketplace submodule identity', () => {
  it('accepts the exact clean Marketplace gitlink and manifest', () => {
    expect(parseMarketplaceSubmoduleStatus(` ${SHA} plugins/dsh-marketplace (v0.1.1)\n`)).toEqual({ commit: SHA, clean: true })
    expect(parseMarketplaceManifest({ name: 'dsh-marketplace', version: '0.1.1' })).toBe('0.1.1')
  })

  it.each([
    [`-${SHA} plugins/dsh-marketplace`, 'uninitialized'],
    [`+${SHA} plugins/dsh-marketplace`, 'does not match'],
    [`U${SHA} plugins/dsh-marketplace`, 'conflict'],
    [` ${SHA} upstream/deepseek-harness`, 'unexpected'],
  ])('rejects unsafe Marketplace status %j', (status, message) => {
    expect(() => parseMarketplaceSubmoduleStatus(status)).toThrow(message)
  })

  it.each([
    [null, 'object'],
    [{ name: 'other', version: '0.1.1' }, 'name'],
    [{ name: 'dsh-marketplace', version: '' }, 'version'],
    [{ name: 'dsh-marketplace', version: 'latest' }, 'version'],
  ])('rejects invalid Marketplace manifest %#', (manifest, message) => {
    expect(() => parseMarketplaceManifest(manifest)).toThrow(message)
  })
})
