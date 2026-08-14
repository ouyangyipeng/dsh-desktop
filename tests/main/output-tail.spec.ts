/** Bounded runtime stdout and stderr tail retention. */

import { describe, expect, it } from 'vitest'
import { OutputTail } from '../../src/main/output-tail.ts'

const encoder = new TextEncoder()

describe('output tail', () => {
  it('preserves a UTF-8 code point split across input chunks', () => {
    const tail = new OutputTail(16)
    const bytes = encoder.encode('ab€cd')

    tail.push(bytes.subarray(0, 3))
    tail.push(bytes.subarray(3))

    expect(tail.text()).toBe('ab€cd')
  })

  it('retains the latest complete UTF-8 text within the byte limit', () => {
    const tail = new OutputTail(10)

    tail.push(encoder.encode('start-你好-end'))

    expect(tail.text()).toBe('你好-end')
    expect(Buffer.byteLength(tail.text())).toBe(10)
  })

  it.each([0, -1, 1.5])('rejects an invalid maxBytes value: %s', (maxBytes) => {
    expect(() => new OutputTail(maxBytes)).toThrow(/maxBytes/)
  })

  it('leaves secret-like text unchanged for the logging redaction layer', () => {
    const tail = new OutputTail(100)

    tail.push(encoder.encode('DEEPSEEK_API_KEY=not-a-real-key'))

    expect(tail.text()).toBe('DEEPSEEK_API_KEY=not-a-real-key')
  })
})
