import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assertSafeStaging, findFirstSymlink } from '../../scripts/deploy-closure.ts'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-desktop-deploy-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('deploy closure path safety', () => {
  it('allows a staging descendant of the repository', async () => {
    await expect(assertSafeStaging(root, join(root, 'dist/stage'))).resolves.toBeUndefined()
  })

  it('rejects the repository and every staging ancestor', async () => {
    await expect(assertSafeStaging(root, root)).rejects.toThrow('equals the repository root')
    await expect(assertSafeStaging(root, tmpdir())).rejects.toThrow('contains the repository root')
  })

  it('finds a nested symbolic link deterministically', async () => {
    const directory = join(root, 'tree')
    await mkdir(join(directory, 'a'), { recursive: true })
    await writeFile(join(root, 'target'), 'target')
    await symlink(join(root, 'target'), join(directory, 'a/link'))

    expect(await findFirstSymlink(directory)).toBe(join(directory, 'a/link'))
  })
})
