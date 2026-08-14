import { describe, expect, it } from 'vitest'
import { parseRecoveryAction, renderRecoveryPage } from '../../src/main/recovery-page.ts'

describe('runtime recovery page', () => {
  it('renders escaped and credential-redacted diagnostics without executable script', () => {
    const html = renderRecoveryPage({
      title: 'Runtime <failed>',
      message: 'Could not start & remain ready.',
      diagnostics: 'DEEPSEEK_API_KEY=not-real\n<script>alert(1)</script>',
      version: '0.1.1',
      upstreamCommit: 'a'.repeat(40),
    })

    expect(html).toContain('Runtime &lt;failed&gt;')
    expect(html).toContain('Could not start &amp; remain ready.')
    expect(html).toContain('DEEPSEEK_API_KEY=[REDACTED]')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('not-real')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('file://')
    expect(html).toContain("default-src 'none'")
    expect(html).toContain('dsh-desktop-action:retry')
    expect(html).toContain('dsh-desktop-action:open-logs')
  })

  it.each([
    ['dsh-desktop-action:retry', 'retry'],
    ['dsh-desktop-action:copy-diagnostics', 'copy-diagnostics'],
    ['dsh-desktop-action:open-logs', 'open-logs'],
    ['dsh-desktop-action:help', 'help'],
    ['dsh-desktop-action:quit', 'quit'],
  ] as const)('parses the exact allowlisted action %s', (url, action) => {
    expect(parseRecoveryAction(url)).toBe(action)
  })

  it.each(['https://example.com', 'dsh-desktop-action:retry/path', 'dsh-desktop-action:unknown', 'not a URL'])('rejects an untrusted action URL: %s', (url) => {
    expect(parseRecoveryAction(url)).toBeUndefined()
  })
})
