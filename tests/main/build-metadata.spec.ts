/** Desktop build metadata parsing at the packaged JSON boundary. */

import { describe, expect, it } from 'vitest'
import {
  developmentBuildMetadata,
  parseDesktopBuildMetadata,
  type DesktopBuildMetadata,
} from '../../src/main/build-metadata.ts'

const validMetadata = {
  schemaVersion: 2,
  version: '0.1.1',
  desktopCommit: 'a'.repeat(40),
  upstreamCommit: 'b'.repeat(40),
  upstreamRepository: 'https://github.com/deepseek-ai/deepseek-harness.git',
  marketplaceCommit: 'c'.repeat(40),
  marketplaceRepository: 'https://github.com/ouyangyipeng/dsh-marketplace.git',
  marketplaceVersion: '0.1.1',
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
      schemaVersion: 2,
      version: '0.1.1',
      desktopCommit: 'development',
      upstreamCommit: '0'.repeat(40),
      upstreamRepository: 'https://github.com/deepseek-ai/deepseek-harness.git',
      marketplaceCommit: 'development',
      marketplaceRepository: 'https://github.com/ouyangyipeng/dsh-marketplace.git',
      marketplaceVersion: 'development',
      platform: process.platform,
      arch: process.arch,
    })
    expect(metadata.builtAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(metadata).not.toHaveProperty('releaseRepository')
  })

  it('parses development metadata written into an unsigned local package', () => {
    const metadata = {
      schemaVersion: 2,
      version: '0.1.1',
      desktopCommit: 'development',
      upstreamCommit: 'b'.repeat(40),
      upstreamRepository: 'https://github.com/deepseek-ai/deepseek-harness.git',
      marketplaceCommit: 'b'.repeat(40),
      marketplaceRepository: 'https://github.com/ouyangyipeng/dsh-marketplace.git',
      marketplaceVersion: '0.1.1',
      builtAt: '2026-08-14T04:00:00.000Z',
      platform: 'darwin',
      arch: 'arm64',
    } as const

    expect(parseDesktopBuildMetadata(metadata)).toEqual(metadata)
  })

  it('accepts a development desktop built from a real upstream revision', () => {
    expect(() => parseDesktopBuildMetadata({
      ...validMetadata,
      desktopCommit: 'development',
      releaseRepository: undefined,
    })).not.toThrow()
  })

  it('rejects a release repository on development metadata', () => {
    expect(() => parseDesktopBuildMetadata({
      ...validMetadata,
      desktopCommit: 'development',
    })).toThrow('development metadata cannot declare a releaseRepository')
  })

  it.each([
    ['schema version', { schemaVersion: 1 }],
    ['desktop commit', { desktopCommit: 'main' }],
    ['upstream commit', { upstreamCommit: 'unknown' }],
    ['Marketplace commit', { marketplaceCommit: 'unknown' }],
    ['Marketplace repository', { marketplaceRepository: 'https://example.com/marketplace.git' }],
    ['Marketplace version', { marketplaceVersion: '' }],
    ['build time', { builtAt: 'yesterday' }],
    ['release repository', { releaseRepository: 'owner/repo/extra' }],
    ['platform', { platform: 'browser' }],
    ['architecture', { arch: '' }],
  ])('rejects an invalid %s', (_label, override) => {
    expect(() => parseDesktopBuildMetadata({ ...validMetadata, ...override })).toThrow()
  })
})
