import { mkdir, mkdtemp, readFile, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  copyMarketplacePackage,
  inspectMarketplacePackage,
} from '../../scripts/marketplace.ts'

const roots: string[] = []

afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('Marketplace publish closure', () => {
  it('copies only runtime package files and preserves no development surface', async () => {
    const source = await fixture()
    const target = join(await temporaryRoot(), 'target')

    expect(await inspectMarketplacePackage(source)).toEqual({ name: 'dsh-marketplace', version: '0.1.1' })
    await copyMarketplacePackage(source, target)

    expect(JSON.parse(await readFile(join(target, 'package.json'), 'utf8'))).toMatchObject({ name: 'dsh-marketplace', version: '0.1.1' })
    expect(await readFile(join(target, 'lib/index.js'), 'utf8')).toBe('host\n')
    expect(await readFile(join(target, 'lib/client.js'), 'utf8')).toBe('client\n')
    await expect(readFile(join(target, 'tests/unsafe.spec.ts'), 'utf8')).rejects.toThrow()
    await expect(readFile(join(target, '.git/config'), 'utf8')).rejects.toThrow()
  })

  it('rejects a symlink before copying any package content', async () => {
    const source = await fixture()
    await unlink(join(source, 'lib/client.js'))
    await symlink('index.js', join(source, 'lib/client.js'))
    const target = join(await temporaryRoot(), 'target')

    await expect(copyMarketplacePackage(source, target)).rejects.toThrow('symbolic link')
    await expect(readFile(join(target, 'package.json'), 'utf8')).rejects.toThrow()
  })

  it('rejects missing required runtime files and path escape entries', async () => {
    const source = await fixture()
    await writeFile(join(source, 'package.json'), JSON.stringify({
      name: 'dsh-marketplace', version: '0.1.1', files: ['lib/index.js', '../outside'],
    }))
    await expect(inspectMarketplacePackage(source)).rejects.toThrow('publish file')
  })
})

async function fixture(): Promise<string> {
  const root = await temporaryRoot()
  await mkdir(join(root, 'lib/types'), { recursive: true })
  await mkdir(join(root, 'tests'), { recursive: true })
  await mkdir(join(root, '.git'), { recursive: true })
  await writeFile(join(root, 'package.json'), JSON.stringify({
    name: 'dsh-marketplace', version: '0.1.1', files: [
      'lib/index.js', 'lib/client.js', 'lib/types/**/*.d.ts', 'cordis.patch.yml', 'README.md', 'README.en.md', 'LICENSE',
    ],
  }))
  await writeFile(join(root, 'lib/index.js'), 'host\n')
  await writeFile(join(root, 'lib/client.js'), 'client\n')
  await writeFile(join(root, 'lib/types/index.d.ts'), 'export {}\n')
  await writeFile(join(root, 'cordis.patch.yml'), '[]\n')
  await writeFile(join(root, 'README.md'), 'zh\n')
  await writeFile(join(root, 'README.en.md'), 'en\n')
  await writeFile(join(root, 'LICENSE'), 'MIT\n')
  await writeFile(join(root, 'tests/unsafe.spec.ts'), 'unsafe\n')
  await writeFile(join(root, '.git/config'), 'unsafe\n')
  return root
}

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-marketplace-'))
  roots.push(root)
  return root
}
