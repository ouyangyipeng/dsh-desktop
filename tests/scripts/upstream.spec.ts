import { describe, expect, it } from 'vitest'
import { parseUpstreamAction } from '../../scripts/upstream.ts'

describe('upstream command', () => {
  it.each(['status', 'bootstrap', 'update'] as const)('accepts the one supported %s action', (action) => {
    expect(parseUpstreamAction([action])).toBe(action)
  })

  it.each([[[]], [['status', 'extra']], [['fetch']], [['--help']]])('rejects malformed arguments: %j', (argv) => {
    expect(() => parseUpstreamAction(argv)).toThrow('Usage:')
  })
})
