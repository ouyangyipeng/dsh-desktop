import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'
import { resolveDesktopPackageRequest } from '../../scripts/package.ts'

describe('desktop package request', () => {
  it('accepts an explicit development macOS ARM64 package on its host', () => {
    expect(resolveDesktopPackageRequest(['--', '--development', '--mac', '--arm64'], 'darwin', 'arm64')).toEqual({
      development: true,
      platform: 'mac',
      arch: 'arm64',
    })
  })

  it('rejects an operating system or architecture that differs from the host', () => {
    expect(() => resolveDesktopPackageRequest(['--windows', '--arm64'], 'darwin', 'arm64')).toThrow('current host')
    expect(() => resolveDesktopPackageRequest(['--mac', '--x64'], 'darwin', 'arm64')).toThrow('current host')
  })

  it('rejects implicit, conflicting, duplicated, or unknown targets', () => {
    expect(() => resolveDesktopPackageRequest(['--development'], 'darwin', 'arm64')).toThrow('Usage:')
    expect(() => resolveDesktopPackageRequest(['--mac', '--windows', '--arm64'], 'darwin', 'arm64')).toThrow('Usage:')
    expect(() => resolveDesktopPackageRequest(['--mac', '--arm64', '--arm64'], 'darwin', 'arm64')).toThrow('Usage:')
    expect(() => resolveDesktopPackageRequest(['--mac', '--arm64', '--publish'], 'darwin', 'arm64')).toThrow('Usage:')
  })
})

describe('electron-builder configuration', () => {
  it('packages only the staged application and immutable runtime', async () => {
    const config = load(await readFile(resolve(import.meta.dirname, '../../config/electron-builder.yml'), 'utf8')) as Record<string, unknown>

    expect(config).toMatchObject({
      appId: 'io.github.ouyangyipeng.dsh-desktop',
      productName: 'DS-Harness Desktop',
      electronVersion: '43.4.0',
      asar: true,
      npmRebuild: true,
      nativeRebuilder: 'sequential',
      directories: { output: '../artifacts' },
      mac: {
        target: ['dmg'],
        identity: null,
        hardenedRuntime: false,
        notarize: false,
      },
    })
    expect(config.files).toEqual(['lib/**', 'node_modules/**', 'package.json', '!**/*.map'])
    expect(config.extraResources).toEqual([
      { from: 'build-metadata.json', to: 'build-metadata.json' },
      { from: 'dsh-desktop.patch.yml', to: 'runtime/dsh-desktop.patch.yml' },
      { from: 'node_modules', to: 'runtime/node_modules' },
    ])
  })
})
