/** Desktop runtime readiness URL validation. */

import { describe, expect, it } from 'vitest'
import { assertRuntimeOrigin, parseRuntimeReadyLine } from '../../src/main/runtime-url.ts'

describe('runtime readiness URL', () => {
  it('accepts the owned loopback readiness line', () => {
    const url = parseRuntimeReadyLine('dsh web: http://127.0.0.1:43127')

    expect(url?.href).toBe('http://127.0.0.1:43127/')
    expect(assertRuntimeOrigin(url as URL)).toBe(url)
  })

  it.each([
    'dsh web: http://localhost:43127',
    'dsh web: http://[::1]:43127',
    'dsh web: http://0.0.0.0:43127',
    'dsh web: https://127.0.0.1:43127',
    'dsh web: http://127.0.0.1',
    'dsh web: http://127.0.0.1:0',
    'dsh web: http://user:pass@127.0.0.1:43127',
    'dsh web: http://127.0.0.1:43127/path',
    'dsh web: http://127.0.0.1:43127?query=yes',
    'dsh web: http://127.0.0.1:43127#fragment',
    'evil dsh webx: http://127.0.0.1:43127',
    'dsh web: http://127.0.0.1:43127 http://127.0.0.1:43128',
    'dsh web: http://127.0.0.1:43127 ready',
    'dsh web: http://127.0.0.1:43127 (LAN: http://192.168.1.5:43127)',
  ])('rejects an unowned readiness line: %s', (line) => {
    expect(parseRuntimeReadyLine(line)).toBeUndefined()
  })

  it.each([
    'https://127.0.0.1:43127/',
    'http://localhost:43127/',
    'http://127.0.0.1/',
    'http://127.0.0.1:43127/path',
    'http://name@127.0.0.1:43127/',
  ])('rejects an invalid runtime URL object: %s', (value) => {
    expect(() => assertRuntimeOrigin(new URL(value))).toThrow()
  })
})
