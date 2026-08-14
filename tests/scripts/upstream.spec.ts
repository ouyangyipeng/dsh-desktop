import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseUpstreamAction } from '../../scripts/upstream.ts'

describe('upstream command', () => {
  it.each(['status', 'bootstrap', 'update'] as const)('accepts the one supported %s action', (action) => {
    expect(parseUpstreamAction([action])).toBe(action)
  })

  it.each([[[]], [['status', 'extra']], [['fetch']], [['--help']]])('rejects malformed arguments: %j', (argv) => {
    expect(() => parseUpstreamAction(argv)).toThrow('Usage:')
  })

  it('assembles the runtime before running the snapshot-bearing test suite', async () => {
    const source = await readFile(resolve(import.meta.dirname, '../../scripts/upstream.ts'), 'utf8')
    const build = source.indexOf("await run('pnpm', ['build']")
    const stage = source.indexOf("await stageDesktop(['--development'])")
    const test = source.indexOf("await run('pnpm', ['test']")
    expect(build).toBeGreaterThan(-1)
    expect(stage).toBeGreaterThan(build)
    expect(test).toBeGreaterThan(stage)
  })
})
