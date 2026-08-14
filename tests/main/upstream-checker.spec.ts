import { describe, expect, it, vi } from 'vitest'
import { checkUpstreamStatus } from '../../src/main/upstream-checker.ts'

const CURRENT = 'a'.repeat(40)
const LATEST = 'b'.repeat(40)

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('upstream status checker', () => {
  it('reports a validated newer official default-branch commit', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ default_branch: 'master' }))
      .mockResolvedValueOnce(response({ sha: LATEST, html_url: `https://github.com/deepseek-ai/deepseek-harness/commit/${LATEST}` }))

    await expect(checkUpstreamStatus(fetcher, CURRENT)).resolves.toEqual({
      state: 'newer',
      currentCommit: CURRENT,
      latestCommit: LATEST,
      commitUrl: new URL(`https://github.com/deepseek-ai/deepseek-harness/commit/${LATEST}`),
    })
    expect(fetcher).toHaveBeenNthCalledWith(1, 'https://api.github.com/repos/deepseek-ai/deepseek-harness', expect.any(Object))
    expect(fetcher).toHaveBeenNthCalledWith(2, 'https://api.github.com/repos/deepseek-ai/deepseek-harness/commits/master', expect.any(Object))
  })

  it('reports the current pinned commit without an update URL action', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ default_branch: 'master' }))
      .mockResolvedValueOnce(response({ sha: CURRENT, html_url: `https://github.com/deepseek-ai/deepseek-harness/commit/${CURRENT}` }))

    await expect(checkUpstreamStatus(fetcher, CURRENT)).resolves.toEqual({
      state: 'current',
      currentCommit: CURRENT,
    })
  })

  it.each([
    [{ default_branch: '../main' }, undefined],
    [{ default_branch: 'master' }, { sha: 'short', html_url: 'https://github.com/deepseek-ai/deepseek-harness' }],
    [{ default_branch: 'master' }, { sha: LATEST, html_url: `https://github.com/another/repo/commit/${LATEST}` }],
  ])('rejects malformed GitHub identity data', async (repository, commit) => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(repository))
    if (commit !== undefined) fetcher.mockResolvedValueOnce(response(commit))

    await expect(checkUpstreamStatus(fetcher, CURRENT)).resolves.toMatchObject({ state: 'malformed' })
  })

  it('reports network failures without throwing', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'))

    await expect(checkUpstreamStatus(fetcher, CURRENT)).resolves.toEqual({
      state: 'offline',
      message: 'The official Harness update status could not be reached.',
    })
  })
})
