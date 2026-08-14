import { describe, expect, it } from 'vitest'
import { parseSubmoduleStatus } from '../../scripts/repository.ts'

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
