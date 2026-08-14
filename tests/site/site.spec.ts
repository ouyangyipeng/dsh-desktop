import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkSite } from '../../scripts/check-site.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async root => rm(root, { recursive: true, force: true })))
})

describe('product site', () => {
  it('contains the approved downloads, identity, community, and motion fallback', async () => {
    await expect(checkSite()).resolves.toEqual([])
  })

  it('rejects a local reference that escapes the published directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-site-'))
    roots.push(root)
    await mkdir(join(root, 'site'), { recursive: true })
    await writeFile(join(root, 'site/index.html'), '<a href="../secret.txt">escape</a>')

    await expect(checkSite(join(root, 'site'))).resolves.toContain('index.html contains an escaping local reference: ../secret.txt')
  })

  it('rejects a remotely hosted visual asset', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-site-'))
    roots.push(root)
    await mkdir(join(root, 'site'), { recursive: true })
    await writeFile(join(root, 'site/index.html'), '<img src="https://www.deepseek.com/logo.png">')

    await expect(checkSite(join(root, 'site'))).resolves.toContain('index.html loads a remote visual asset')
  })
})
