import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'

interface Workflow {
  readonly name?: string
  readonly on?: unknown
  readonly permissions?: Record<string, string>
  readonly jobs?: Record<string, Record<string, unknown>>
}

const ROOT = resolve(import.meta.dirname, '../..')

async function workflow(name: string): Promise<{ readonly source: string; readonly value: Workflow }> {
  const source = await readFile(resolve(ROOT, `.github/workflows/${name}.yml`), 'utf8')
  return { source, value: load(source) as Workflow }
}

describe('GitHub Actions workflows', () => {
  it('verifies the independent project with the official submodule', async () => {
    const { source, value } = await workflow('verify')
    expect(value.permissions).toEqual({ contents: 'read' })
    expect(source).toContain('submodules: recursive')
    expect(source).toContain('pnpm upstream:bootstrap')
    expect(source).toContain('pnpm check')
    expect(source).toContain('pnpm runtime:stage -- --development')
    expect(source).not.toContain('pull_request_target')
  })

  it('publishes only the validated static site through GitHub Pages', async () => {
    const { source, value } = await workflow('pages')
    expect(value.permissions).toEqual({ contents: 'read', pages: 'write', 'id-token': 'write' })
    expect(source).toContain('actions/configure-pages@v5')
    expect(source).toContain('actions/upload-pages-artifact@v4')
    expect(source).toContain('actions/deploy-pages@v4')
    expect(source).toContain('path: site')
  })

  it('proposes traceable upstream gitlink updates without auto-merge', async () => {
    const { source, value } = await workflow('upstream-check')
    expect(value.permissions).toEqual({ contents: 'write', 'pull-requests': 'write' })
    expect(source).toContain('pnpm upstream:update')
    expect(source).toContain('gh pr create')
    expect(source).toContain('deepseek-ai/deepseek-harness')
    expect(source).not.toMatch(/gh pr merge|auto-merge/u)
  })

  it('builds and smokes every release target on a matching native runner', async () => {
    const { source, value } = await workflow('release')
    expect(value.permissions).toEqual({ contents: 'write' })
    expect(source).toContain("'desktop-v*'")
    expect(source).toContain('runner: macos-15')
    expect(source).toContain('platform: mac')
    expect(source).toContain('runner: windows-2025')
    expect(source).toContain('arch: x64')
    expect(source).toContain('runner: windows-11-arm')
    expect(source).toContain('arch: arm64')
    expect(source).toContain('pnpm smoke:packaged')
    expect(source).toContain('pnpm run pack -- --mac --arm64')
    expect(source).toContain('pnpm run pack -- --windows --${{ matrix.arch }}')
    expect(source).not.toMatch(/\bpnpm pack\b/u)
    expect(source).toContain('DSH_DESKTOP_RELEASE_REPOSITORY: ${{ github.repository }}')
    expect(source).toContain('actions/upload-artifact@v7')
    expect(source).toContain('actions/download-artifact@v8')
    expect(source).toContain('SHA256SUMS')
    expect(source).toContain('gh release create')
  })
})

describe('packaging command documentation', () => {
  it('never collides with pnpm built-in pack', async () => {
    for (const name of [
      'README.md',
      'README.zh.md',
      'docs/development.md',
      'docs/superpowers/plans/2026-08-14-dsh-desktop-standalone-implementation.md',
    ]) {
      const source = await readFile(resolve(ROOT, name), 'utf8')
      expect(source).not.toMatch(/\bpnpm pack\b/u)
      expect(source).toContain('pnpm run pack')
    }
  })
})

describe('workflow action versions', () => {
  it('uses maintained Node 24 action runtimes and pnpm from packageManager', async () => {
    for (const name of ['verify', 'pages', 'upstream-check', 'release']) {
      const { source } = await workflow(name)
      expect(source).toContain('actions/checkout@v6')
      if (name === 'pages') continue
      expect(source).toContain('pnpm/action-setup@v6')
      expect(source).toContain('actions/setup-node@v7')
      expect(source).toContain("node-version: '24'")
    }
  })
})
