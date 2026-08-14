/** Desktop build metadata parsing at the packaged JSON boundary. */

import { describe, expect, it } from 'vitest'
import {
  developmentBuildMetadata,
  parseDesktopBuildMetadata,
  type DesktopBuildMetadata,
} from '../../src/main/build-metadata.ts'

const validMetadata = {
  schemaVersion: 1,
  version: '0.1.1',
  desktopCommit: 'a'.repeat(40),
  upstreamCommit: 'b'.repeat(40),
  builtAt: '2026-08-13T15:00:00.000Z',
  platform: 'darwin',
  arch: 'arm64',
  releaseRepository: 'ouyangyipeng/dsh-desktop',
} as const

describe('desktop build metadata', () => {
  it('parses release metadata without propagating unknown fields', () => {
    expect(parseDesktopBuildMetadata({ ...validMetadata, ignored: 'value' })).toEqual(validMetadata)
  })

  it('creates an explicit development fallback for the current host', () => {
    const metadata: DesktopBuildMetadata = developmentBuildMetadata('0.1.1')

    expect(metadata).toMatchObject({
      schemaVersion: 1,
      version: '0.1.1',
      desktopCommit: 'development',
      upstreamCommit: 'development',
      platform: process.platform,
      arch: process.arch,
    })
    expect(metadata.builtAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(metadata).not.toHaveProperty('releaseRepository')
  })

  it('parses development metadata written into an unsigned local package', () => {
    const metadata = {
      schemaVersion: 1,
      version: '0.1.1',
      desktopCommit: 'development',
      upstreamCommit: 'development',
      builtAt: '2026-08-14T04:00:00.000Z',
      platform: 'darwin',
      arch: 'arm64',
    } as const

    expect(parseDesktopBuildMetadata(metadata)).toEqual(metadata)
  })

  it('rejects mixed release and development commit identities', () => {
    expect(() => parseDesktopBuildMetadata({
      ...validMetadata,
      desktopCommit: 'development',
    })).toThrow('must both be release SHAs or development')
  })

  it('rejects a release repository on development metadata', () => {
    expect(() => parseDesktopBuildMetadata({
      ...validMetadata,
      desktopCommit: 'development',
      upstreamCommit: 'development',
    })).toThrow('development metadata cannot declare a releaseRepository')
  })

  it.each([
    ['schema version', { schemaVersion: 2 }],
    ['desktop commit', { desktopCommit: 'main' }],
    ['upstream commit', { upstreamCommit: 'unknown' }],
    ['build time', { builtAt: 'yesterday' }],
    ['release repository', { releaseRepository: 'owner/repo/extra' }],
    ['platform', { platform: 'browser' }],
    ['architecture', { arch: '' }],
  ])('rejects an invalid %s', (_label, override) => {
    expect(() => parseDesktopBuildMetadata({ ...validMetadata, ...override })).toThrow()
  })
})
