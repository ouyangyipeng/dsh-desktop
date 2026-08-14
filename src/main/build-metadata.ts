/** Stable identity embedded in one desktop application build. */
export interface DesktopBuildMetadata {
  /** Metadata format version. */
  schemaVersion: 2
  /** Desktop application version. */
  version: string
  /** Commit containing the desktop source. */
  desktopCommit: string
  /** Official DeepSeek Harness commit incorporated by the desktop source. */
  upstreamCommit: string
  /** Official source repository represented by the upstream commit. */
  upstreamRepository: 'https://github.com/deepseek-ai/deepseek-harness.git'
  /** Marketplace commit incorporated by the desktop source. */
  marketplaceCommit: string
  /** Source repository represented by the Marketplace commit. */
  marketplaceRepository: 'https://github.com/ouyangyipeng/dsh-marketplace.git'
  /** Marketplace package version staged into the application. */
  marketplaceVersion: string
  /** UTC build timestamp. */
  builtAt: string
  /** Operating system targeted by the build. */
  platform: NodeJS.Platform
  /** CPU architecture targeted by the build. */
  arch: string
  /** GitHub repository that owns downloadable desktop releases. */
  releaseRepository?: string
}

const PLATFORMS: ReadonlySet<string> = new Set([
  'aix',
  'android',
  'cygwin',
  'darwin',
  'freebsd',
  'haiku',
  'linux',
  'netbsd',
  'openbsd',
  'sunos',
  'win32',
])
const COMMIT_PATTERN = /^[0-9a-f]{40}$/
const RELEASE_REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const ARCH_PATTERN = /^[A-Za-z0-9_-]+$/

/**
 * Parse the packaged build metadata JSON value.
 * @param value - untrusted value read from build-metadata.json.
 * @returns A validated metadata value containing only supported fields.
 */
export function parseDesktopBuildMetadata(value: unknown): DesktopBuildMetadata {
  if (!isRecord(value)) throw new Error('desktop build metadata must be an object')
  if (value.schemaVersion !== 2) throw new Error('desktop build metadata schemaVersion must be 2')

  const version = requiredString(value, 'version')
  const desktopCommit = commit(value, 'desktopCommit')
  const upstreamCommit = commit(value, 'upstreamCommit')
  if (upstreamCommit === 'development') throw new Error('desktop build metadata upstreamCommit must be a full Git SHA')
  const upstreamRepository = requiredString(value, 'upstreamRepository')
  if (upstreamRepository !== 'https://github.com/deepseek-ai/deepseek-harness.git') {
    throw new Error('desktop build metadata upstreamRepository must be the official repository')
  }
  const marketplaceCommit = commit(value, 'marketplaceCommit')
  if (marketplaceCommit === 'development' && desktopCommit !== 'development') {
    throw new Error('desktop release metadata marketplaceCommit must be a full Git SHA')
  }
  const marketplaceRepository = requiredString(value, 'marketplaceRepository')
  if (marketplaceRepository !== 'https://github.com/ouyangyipeng/dsh-marketplace.git') {
    throw new Error('desktop build metadata marketplaceRepository must be the bundled repository')
  }
  const marketplaceVersion = requiredString(value, 'marketplaceVersion')
  if (marketplaceVersion === 'development' && marketplaceCommit !== 'development') {
    throw new Error('desktop build metadata marketplaceVersion cannot be development for a pinned commit')
  }
  const builtAt = isoTimestamp(value)
  const platform = nodePlatform(value)
  const arch = requiredString(value, 'arch')
  if (!ARCH_PATTERN.test(arch)) throw new Error('desktop build metadata arch is invalid')

  const releaseRepository = value.releaseRepository
  if (releaseRepository !== undefined) {
    if (desktopCommit === 'development') {
      throw new Error('desktop development metadata cannot declare a releaseRepository')
    }
    if (typeof releaseRepository !== 'string' || !RELEASE_REPOSITORY_PATTERN.test(releaseRepository)) {
      throw new Error('desktop build metadata releaseRepository must be owner/repo')
    }
  }

  return {
    schemaVersion: 2,
    version,
    desktopCommit,
    upstreamCommit,
    upstreamRepository,
    marketplaceCommit,
    marketplaceRepository,
    marketplaceVersion,
    builtAt,
    platform,
    arch,
    ...(releaseRepository === undefined ? {} : { releaseRepository }),
  }
}

/**
 * Describe a source checkout that has no packaged build metadata.
 * @param version - desktop package version.
 * @returns Metadata that explicitly identifies a development run.
 */
export function developmentBuildMetadata(version: string): DesktopBuildMetadata {
  return {
    schemaVersion: 2,
    version,
    desktopCommit: 'development',
    upstreamCommit: '0'.repeat(40),
    upstreamRepository: 'https://github.com/deepseek-ai/deepseek-harness.git',
    marketplaceCommit: 'development',
    marketplaceRepository: 'https://github.com/ouyangyipeng/dsh-marketplace.git',
    marketplaceVersion: 'development',
    builtAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requiredString(value: Record<string, unknown>, key: string): string {
  const field = value[key]
  if (typeof field !== 'string' || field === '') {
    throw new Error(`desktop build metadata ${key} must be a non-empty string`)
  }
  return field
}

function commit(value: Record<string, unknown>, key: string): string {
  const field = requiredString(value, key)
  if (field !== 'development' && !COMMIT_PATTERN.test(field)) {
    throw new Error(`desktop build metadata ${key} must be a full Git SHA or development`)
  }
  return field
}

function isoTimestamp(value: Record<string, unknown>): string {
  const field = requiredString(value, 'builtAt')
  const parsed = new Date(field)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== field) {
    throw new Error('desktop build metadata builtAt must be an ISO UTC timestamp')
  }
  return field
}

function nodePlatform(value: Record<string, unknown>): NodeJS.Platform {
  const field = requiredString(value, 'platform')
  if (!PLATFORMS.has(field)) throw new Error('desktop build metadata platform is invalid')
  return field as NodeJS.Platform
}
