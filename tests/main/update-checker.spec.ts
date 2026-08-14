/** Advisory GitHub Release update checks at the untrusted response boundary. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { developmentBuildMetadata, type DesktopBuildMetadata } from '../../src/main/build-metadata.ts'
import { checkForUpdates, compareDesktopVersions } from '../../src/main/update-checker.ts'

const RELEASE_REPOSITORY = 'ouyangyipeng/dsh-desktop'

function metadata(overrides: Partial<DesktopBuildMetadata> = {}): DesktopBuildMetadata {
  return {
    schemaVersion: 1,
    version: '1.9.9',
    desktopCommit: 'a'.repeat(40),
    upstreamCommit: 'b'.repeat(40),
    upstreamRepository: 'https://github.com/deepseek-ai/deepseek-harness.git',
    builtAt: '2026-08-13T15:00:00.000Z',
    platform: 'darwin',
    arch: 'arm64',
    releaseRepository: RELEASE_REPOSITORY,
    ...overrides,
  }
}

function release(version: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tag_name: `desktop-v${version}`,
    html_url: `https://github.com/${RELEASE_REPOSITORY}/releases/tag/desktop-v${version}`,
    draft: false,
    prerelease: false,
    body: `Release ${version}`,
    ...overrides,
  }
}

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status: init.status ?? 200,
    ...(init.headers === undefined ? {} : { headers: init.headers }),
  })
}

afterEach(() => {
  vi.useRealTimers()
})

describe('desktop update checker', () => {
  it('does not make a request for a development build', async () => {
    const fetchMock = vi.fn(async () => jsonResponse([]))
    const result = await checkForUpdates({
      metadata: developmentBuildMetadata('1.9.9'),
      fetch: fetchMock,
    })

    expect(result).toEqual({ state: 'development' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('requests releases with the current GitHub REST headers', async () => {
    const fetchMock = vi.fn(async () => jsonResponse([release('1.10.0')]))

    await checkForUpdates({ metadata: metadata(), fetch: fetchMock })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [input, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(input).toBe('https://api.github.com/repos/ouyangyipeng/dsh-desktop/releases?per_page=100')
    expect(init.redirect).toBe('error')
    const headers = new Headers(init.headers)
    expect(headers.get('accept')).toBe('application/vnd.github+json')
    expect(headers.get('x-github-api-version')).toBe('2026-03-10')
    expect(headers.get('user-agent')).toBe('dsh-desktop-update-checker')
  })

  it('selects the highest stable desktop release by numeric version', async () => {
    const fetchMock = vi.fn(async () => jsonResponse([
      release('1.9.10'),
      release('9.0.0', { draft: true }),
      release('8.0.0', { prerelease: true }),
      release('1.2.3', { tag_name: 'latest-v1.2.3' }),
      release('1.10.0'),
    ]))

    await expect(checkForUpdates({ metadata: metadata(), fetch: fetchMock })).resolves.toEqual({
      state: 'available',
      version: '1.10.0',
      releaseUrl: new URL('https://github.com/ouyangyipeng/dsh-desktop/releases/tag/desktop-v1.10.0'),
      summary: 'Release 1.10.0',
    })
  })

  it('reports the packaged version as current when no newer matching release exists', async () => {
    const fetchMock = vi.fn(async () => jsonResponse([
      release('1.9.8'),
      release('2.0.0', { tag_name: 'desktop-v2.0.0-beta.1' }),
      release('2.0.0', { tag_name: 'v2.0.0' }),
    ]))

    await expect(checkForUpdates({ metadata: metadata(), fetch: fetchMock })).resolves.toEqual({
      state: 'current',
      version: '1.9.9',
    })
  })

  it.each([
    'http://github.com/ouyangyipeng/dsh-desktop/releases/tag/desktop-v2.0.0',
    'https://github.com/another-owner/dsh-desktop/releases/tag/desktop-v2.0.0',
    'https://user:pass@github.com/ouyangyipeng/dsh-desktop/releases/tag/desktop-v2.0.0',
    'https://github.com/ouyangyipeng/dsh-desktop/releases/tag/desktop-v9.0.0',
    'https://github.com/ouyangyipeng/dsh-desktop/releases/tag/desktop-v2.0.0?download=1',
    'https://github.com/ouyangyipeng/dsh-desktop/releases/tag/desktop-v2.0.0/',
  ])('rejects an unowned release URL: %s', async (htmlUrl) => {
    const fetchMock = vi.fn(async () => jsonResponse([release('2.0.0', { html_url: htmlUrl })]))

    await expect(checkForUpdates({ metadata: metadata(), fetch: fetchMock })).resolves.toMatchObject({
      state: 'malformed',
    })
  })

  it.each([
    release('2.0.0', { tag_name: 'x'.repeat(65) }),
    release('2.0.0', { html_url: `https://github.com/${'x'.repeat(2049)}` }),
    release('2.0.0', { body: 'x'.repeat(65_537) }),
  ])('rejects overlong release fields', async (candidate) => {
    const fetchMock = vi.fn(async () => jsonResponse([candidate]))

    await expect(checkForUpdates({ metadata: metadata(), fetch: fetchMock })).resolves.toMatchObject({
      state: 'malformed',
    })
  })

  it.each([
    { invalid: 'object' },
    [release('2.0.0', { tag_name: 2 })],
    [release('2.0.0', { html_url: null })],
    [release('2.0.0', { draft: 'false' })],
    [release('2.0.0', { prerelease: 0 })],
    [release('2.0.0', { body: 1 })],
  ])('maps invalid response fields to malformed', async (payload) => {
    const fetchMock = vi.fn(async () => jsonResponse(payload))

    await expect(checkForUpdates({ metadata: metadata(), fetch: fetchMock })).resolves.toMatchObject({
      state: 'malformed',
    })
  })

  it('maps invalid JSON to malformed without exposing the body', async () => {
    const fetchMock = vi.fn(async () => new Response('private response contents', { status: 200 }))

    await expect(checkForUpdates({ metadata: metadata(), fetch: fetchMock })).resolves.toEqual({
      state: 'malformed',
      message: 'GitHub Releases returned malformed JSON.',
    })
  })

  it('truncates the release summary to 800 Unicode code points', async () => {
    const body = '🙂'.repeat(805)
    const fetchMock = vi.fn(async () => jsonResponse([release('2.0.0', { body })]))

    const result = await checkForUpdates({ metadata: metadata(), fetch: fetchMock })

    expect(result.state).toBe('available')
    if (result.state !== 'available') throw new Error('expected an available update')
    expect(Array.from(result.summary)).toHaveLength(800)
    expect(result.summary).toBe('🙂'.repeat(800))
  })

  it.each([403, 429])('maps HTTP %s to a rate-limited state', async (status) => {
    const fetchMock = vi.fn(async () => new Response('', {
      status,
      headers: { 'x-ratelimit-reset': '1786640400' },
    }))

    await expect(checkForUpdates({ metadata: metadata(), fetch: fetchMock })).resolves.toEqual({
      state: 'rate-limited',
      resetAt: new Date(1_786_640_400_000),
    })
  })

  it('omits an invalid rate-limit reset time', async () => {
    const fetchMock = vi.fn(async () => new Response('', {
      status: 429,
      headers: { 'x-ratelimit-reset': 'later' },
    }))

    await expect(checkForUpdates({ metadata: metadata(), fetch: fetchMock })).resolves.toEqual({
      state: 'rate-limited',
    })
  })

  it('maps network failures to an offline state without exposing the error', async () => {
    const fetchMock = vi.fn(async (): Promise<Response> => {
      throw new Error('getaddrinfo ENOTFOUND api.github.com internal-detail')
    })

    await expect(checkForUpdates({ metadata: metadata(), fetch: fetchMock })).resolves.toEqual({
      state: 'offline',
      message: 'Could not reach GitHub Releases.',
    })
  })

  it('aborts a stalled request at the configured deadline', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async (_input: string | URL, init?: RequestInit): Promise<Response> => await new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new Error('request aborted'))
      }, { once: true })
    }))
    const checking = checkForUpdates({ metadata: metadata(), fetch: fetchMock, timeoutMs: 50 })

    await vi.advanceTimersByTimeAsync(50)

    await expect(checking).resolves.toEqual({
      state: 'offline',
      message: 'Could not reach GitHub Releases.',
    })
  })

  it('maps non-rate-limit HTTP failures to offline', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 503 }))

    await expect(checkForUpdates({ metadata: metadata(), fetch: fetchMock })).resolves.toEqual({
      state: 'offline',
      message: 'GitHub Releases returned HTTP 503.',
    })
  })
})

describe('desktop version comparison', () => {
  it('compares each numeric component instead of using lexical ordering', () => {
    expect(compareDesktopVersions('1.10.0', '1.9.9')).toBeGreaterThan(0)
    expect(compareDesktopVersions('2.0.0', '2.0.0')).toBe(0)
    expect(compareDesktopVersions('0.9.9', '1.0.0')).toBeLessThan(0)
  })

  it.each(['1.0', 'v1.0.0', '01.0.0', '1.0.0-beta.1'])('rejects a non-release version: %s', (version) => {
    expect(() => compareDesktopVersions(version, '1.0.0')).toThrow(/stable semantic version/)
  })
})
