/** Desktop file logging redaction and ordered flushing. */

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FileDesktopLogger, redactLogText } from '../../src/main/logging.ts'

let temporaryRoot: string

beforeEach(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'dsh-desktop-log-'))
})

afterEach(async () => {
  await rm(temporaryRoot, { recursive: true, force: true })
})

describe('desktop logging', () => {
  it('redacts key assignments, bearer tokens, and URL credentials', () => {
    const value = redactLogText('DEEPSEEK_API_KEY=secret Bearer abc.def https://user:pass@example.com/path')

    expect(value).toBe('DEEPSEEK_API_KEY=[REDACTED] Bearer [REDACTED] https://[REDACTED]@example.com/path')
    expect(value).not.toMatch(/secret|abc\.def|user:pass/)
  })

  it('serializes sanitized entries and flushes them to the owned file', async () => {
    const logPath = join(temporaryRoot, 'logs', 'desktop.log')
    const logger = new FileDesktopLogger(logPath, () => new Date('2026-08-13T16:00:00.000Z'))
    await logger.initialize()

    logger.record('runtime.output', {
      source: 'stderr',
      text: 'TOKEN=private\nnext line',
      pid: 42,
    })
    await logger.flush()

    expect(await readFile(logPath, 'utf8')).toBe('2026-08-13T16:00:00.000Z runtime.output source=stderr text=TOKEN=[REDACTED] next line pid=42\n')
  })
})
