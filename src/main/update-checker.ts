import type { DesktopBuildMetadata } from './build-metadata.ts'

const API_VERSION = '2026-03-10'
const DEFAULT_TIMEOUT_MS = 10_000
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024
const MAX_RELEASES = 100
const MAX_TAG_CHARACTERS = 64
const MAX_URL_CHARACTERS = 2_048
const MAX_BODY_CHARACTERS = 65_536
const MAX_SUMMARY_CODE_POINTS = 800
const STABLE_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const DESKTOP_TAG_PATTERN = /^desktop-v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

type FetchLike = (input: string, init: RequestInit) => Promise<Response>

interface ReleaseCandidate {
  readonly version: string
  readonly releaseUrl: URL
  readonly summary: string
}

/** Result of one user-initiated desktop Release check. */
export type UpdateCheckResult =
  | { state: 'development' }
  | { state: 'current'; version: string }
  | { state: 'available'; version: string; releaseUrl: URL; summary: string }
  | { state: 'offline'; message: string }
  | { state: 'rate-limited'; resetAt?: Date }
  | { state: 'malformed'; message: string }

/** Dependencies and build identity for one update check. */
export interface UpdateCheckOptions {
  /** Validated identity compiled into the application package. */
  readonly metadata: DesktopBuildMetadata
  /** HTTP implementation overridden by response-boundary tests. */
  readonly fetch?: FetchLike
  /** Total deadline for response headers and body. */
  readonly timeoutMs?: number
}

/**
 * Query and validate stable desktop releases from the compiled GitHub repository.
 * @param options - Packaged build identity and optional test dependencies.
 * @returns A closed advisory state that never downloads or executes a release asset.
 */
export async function checkForUpdates(options: UpdateCheckOptions): Promise<UpdateCheckResult> {
  const releaseRepository = options.metadata.releaseRepository
  if (releaseRepository === undefined) return { state: 'development' }
  if (!isStableVersion(options.metadata.version)) {
    return malformed('The packaged desktop version is not a stable semantic version.')
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error('update check timeoutMs must be a positive safe integer')

  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort(new Error('update check timed out'))
  }, timeoutMs)
  const fetchImpl = options.fetch ?? globalThis.fetch

  try {
    const response = await fetchImpl(releasesApiUrl(releaseRepository), {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'dsh-desktop-update-checker',
        'X-GitHub-Api-Version': API_VERSION,
      },
      redirect: 'error',
      signal: controller.signal,
    })

    if (response.status === 403 || response.status === 429) return rateLimited(response.headers)
    if (!response.ok) return offline(`GitHub Releases returned HTTP ${response.status}.`)

    const responseText = await response.text()
    if (Buffer.byteLength(responseText) > MAX_RESPONSE_BYTES) {
      return malformed('GitHub Releases returned an oversized response.')
    }

    let value: unknown
    try {
      value = JSON.parse(responseText) as unknown
    } catch {
      return malformed('GitHub Releases returned malformed JSON.')
    }

    const parsed = parseReleaseCandidates(value, releaseRepository)
    if (parsed instanceof Error) return malformed(parsed.message)
    const latest = highestRelease(parsed)
    if (latest === undefined || compareDesktopVersions(latest.version, options.metadata.version) <= 0) {
      return { state: 'current', version: options.metadata.version }
    }
    return {
      state: 'available',
      version: latest.version,
      releaseUrl: latest.releaseUrl,
      summary: latest.summary,
    }
  } catch {
    return offline('Could not reach GitHub Releases.')
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Compare stable three-component semantic versions without numeric truncation.
 * @param left - First `X.Y.Z` version.
 * @param right - Second `X.Y.Z` version.
 * @returns A negative, zero, or positive number according to numeric ordering.
 */
export function compareDesktopVersions(left: string, right: string): number {
  const leftParts = stableVersionParts(left)
  const rightParts = stableVersionParts(right)
  for (let index = 0; index < leftParts.length; index += 1) {
    const difference = compareBigInts(leftParts[index] as bigint, rightParts[index] as bigint)
    if (difference !== 0) return difference
  }
  return 0
}

function releasesApiUrl(releaseRepository: string): string {
  const [owner, repository] = releaseRepository.split('/') as [string, string]
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/releases?per_page=100`
}

function rateLimited(headers: Headers): UpdateCheckResult {
  const value = headers.get('x-ratelimit-reset')
  if (value === null || !/^\d+$/.test(value)) return { state: 'rate-limited' }
  const seconds = Number(value)
  if (!Number.isSafeInteger(seconds)) return { state: 'rate-limited' }
  const resetAt = new Date(seconds * 1_000)
  if (!Number.isFinite(resetAt.getTime())) return { state: 'rate-limited' }
  return { state: 'rate-limited', resetAt }
}

function offline(message: string): UpdateCheckResult {
  return { state: 'offline', message }
}

function malformed(message: string): UpdateCheckResult {
  return { state: 'malformed', message }
}

function parseReleaseCandidates(value: unknown, releaseRepository: string): readonly ReleaseCandidate[] | Error {
  if (!Array.isArray(value)) return new Error('GitHub Releases response must be an array.')
  if (value.length > MAX_RELEASES) return new Error('GitHub Releases response contains too many entries.')

  const candidates: ReleaseCandidate[] = []
  for (const item of value) {
    const candidate = parseReleaseCandidate(item, releaseRepository)
    if (candidate instanceof Error) return candidate
    if (candidate !== undefined) candidates.push(candidate)
  }
  return candidates
}

function parseReleaseCandidate(value: unknown, releaseRepository: string): ReleaseCandidate | Error | undefined {
  if (!isRecord(value)) return new Error('GitHub Release entries must be objects.')
  const tag = boundedString(value.tag_name, MAX_TAG_CHARACTERS, 'tag_name')
  if (tag instanceof Error) return tag
  const htmlUrl = boundedString(value.html_url, MAX_URL_CHARACTERS, 'html_url')
  if (htmlUrl instanceof Error) return htmlUrl
  if (typeof value.draft !== 'boolean') return new Error('GitHub Release draft must be a boolean.')
  if (typeof value.prerelease !== 'boolean') return new Error('GitHub Release prerelease must be a boolean.')
  if (value.body !== null && typeof value.body !== 'string') return new Error('GitHub Release body must be a string or null.')
  const body = value.body ?? ''
  if (body.length > MAX_BODY_CHARACTERS) return new Error('GitHub Release body is too long.')

  if (value.draft || value.prerelease || !DESKTOP_TAG_PATTERN.test(tag)) return undefined
  const version = tag.slice('desktop-v'.length)
  const releaseUrl = exactReleaseUrl(htmlUrl, releaseRepository, tag)
  if (releaseUrl instanceof Error) return releaseUrl
  return {
    version,
    releaseUrl,
    summary: Array.from(body).slice(0, MAX_SUMMARY_CODE_POINTS).join(''),
  }
}

function exactReleaseUrl(value: string, releaseRepository: string, tag: string): URL | Error {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return new Error('GitHub Release html_url must be an absolute URL.')
  }
  const expected = new URL(`https://github.com/${releaseRepository}/releases/tag/${tag}`)
  if (parsed.href !== expected.href) return new Error('GitHub Release html_url does not match the compiled repository and tag.')
  return parsed
}

function boundedString(value: unknown, maxCharacters: number, field: string): string | Error {
  if (typeof value !== 'string') return new Error(`GitHub Release ${field} must be a string.`)
  if (value.length > maxCharacters) return new Error(`GitHub Release ${field} is too long.`)
  return value
}

function highestRelease(candidates: readonly ReleaseCandidate[]): ReleaseCandidate | undefined {
  let highest: ReleaseCandidate | undefined
  for (const candidate of candidates) {
    if (highest === undefined || compareDesktopVersions(candidate.version, highest.version) > 0) highest = candidate
  }
  return highest
}

function isStableVersion(value: string): boolean {
  return STABLE_VERSION_PATTERN.test(value)
}

function stableVersionParts(value: string): readonly bigint[] {
  if (!isStableVersion(value)) throw new Error('desktop version must be a stable semantic version')
  return value.split('.').map(part => BigInt(part))
}

function compareBigInts(left: bigint, right: bigint): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
