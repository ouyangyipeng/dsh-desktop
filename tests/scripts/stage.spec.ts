import { describe, expect, it } from 'vitest'
import { parseDesktopBuildMetadata } from '../../src/main/build-metadata.ts'
import { resolveDesktopStageMetadata } from '../../scripts/stage.ts'

const identity = {
  version: '0.1.1',
  platform: 'darwin',
  arch: 'arm64',
  builtAt: '2026-08-14T04:00:00.000Z',
} as const
const commits = {
  desktopCommit: 'a'.repeat(40),
  upstreamCommit: 'b'.repeat(40),
}

describe('desktop stage metadata', () => {
  it('records the real upstream commit in an explicit development build', () => {
    const metadata = resolveDesktopStageMetadata(['--development'], {}, identity, commits)

    expect(parseDesktopBuildMetadata(metadata)).toEqual({
      schemaVersion: 1,
      version: '0.1.1',
      desktopCommit: 'development',
      upstreamCommit: 'b'.repeat(40),
      upstreamRepository: 'https://github.com/deepseek-ai/deepseek-harness.git',
      builtAt: '2026-08-14T04:00:00.000Z',
      platform: 'darwin',
      arch: 'arm64',
    })
  })

  it('derives release commits from Git and accepts only the release repository from the environment', () => {
    const metadata = resolveDesktopStageMetadata([], {
      DSH_DESKTOP_RELEASE_REPOSITORY: 'ouyangyipeng/dsh-desktop',
    }, identity, commits)

    expect(metadata).toEqual({
      schemaVersion: 1,
      ...identity,
      ...commits,
      upstreamRepository: 'https://github.com/deepseek-ai/deepseek-harness.git',
      releaseRepository: 'ouyangyipeng/dsh-desktop',
    })
  })

  it('rejects caller commit overrides instead of trusting release input', () => {
    expect(() => resolveDesktopStageMetadata([], {
      DSH_DESKTOP_RELEASE_REPOSITORY: 'ouyangyipeng/dsh-desktop',
      DSH_DESKTOP_COMMIT: 'c'.repeat(40),
    }, identity, commits)).toThrow('must not override')
  })

  it('rejects missing release identity and malformed arguments', () => {
    expect(() => resolveDesktopStageMetadata([], {}, identity, commits)).toThrow('release staging requires')
    expect(() => resolveDesktopStageMetadata(['--debug'], {}, identity, commits)).toThrow('Usage:')
    expect(() => resolveDesktopStageMetadata(['--development', '--development'], {}, identity, commits)).toThrow('Usage:')
  })
})
