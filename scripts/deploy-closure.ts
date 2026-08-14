import { existsSync } from 'node:fs'
import { cp, lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'

/** Values required to complete a legacy pnpm deploy as a closed file tree. */
export interface RepairDeployOptions {
  /** Deployed application root containing package.json and node_modules. */
  readonly staging: string
  /** Source node_modules used when legacy hoisting omits a direct dependency. */
  readonly sourceNodeModules: string
  /** Optional hoisted package tree used to restore transitive required peers. */
  readonly closureSourceNodeModules?: string
  /** Staging-relative files removed after repair. */
  readonly removeFiles?: readonly string[]
}

/**
 * Reject a staging directory that could clear the repository itself.
 * @param root - Repository root that must survive staging cleanup.
 * @param staging - Candidate deploy directory.
 * @returns After the paths are proven disjoint in the destructive direction.
 */
export function assertSafeStaging(root: string, staging: string): Promise<void> {
  const repositoryRoot = resolve(root)
  const stagingRoot = resolve(staging)
  if (stagingRoot === repositoryRoot) {
    return Promise.reject(new Error(`deploy staging ${stagingRoot} equals the repository root`))
  }
  if (repositoryRoot.startsWith(`${stagingRoot}${sep}`)) {
    return Promise.reject(new Error(`deploy staging ${stagingRoot} contains the repository root ${repositoryRoot}`))
  }
  return Promise.resolve()
}

/**
 * Preserve pnpm's root workspace-state cache around legacy deploy.
 * @param workspaceRoot - Workspace whose install-mode cache must not be changed.
 * @param action - Legacy deploy operation that may rewrite the cache.
 * @returns The action result after the original cache has been restored.
 */
export async function preservePnpmWorkspaceState<T>(
  workspaceRoot: string,
  action: () => Promise<T>,
): Promise<T> {
  const statePath = join(resolve(workspaceRoot), 'node_modules', '.pnpm-workspace-state-v1.json')
  let previous: Buffer | undefined
  try {
    previous = await readFile(statePath)
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  try {
    return await action()
  } finally {
    if (previous === undefined) {
      await rm(statePath, { force: true })
    } else {
      await mkdir(dirname(statePath), { recursive: true })
      await writeFile(statePath, previous)
    }
  }
}

/**
 * Restore omitted direct dependencies, materialize package links, and remove deploy-only files.
 * @param options - Staged tree, source dependency tree, and optional removals.
 * @returns After the direct dependency closure contains no symbolic links.
 */
export async function repairLegacyDeploy(options: RepairDeployOptions): Promise<void> {
  const staging = resolve(options.staging)
  const sourceNodeModules = resolve(options.sourceNodeModules)
  const nodeModules = join(staging, 'node_modules')
  const manifest = JSON.parse(await readFile(join(staging, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
  }
  const dependencies = Object.keys(manifest.dependencies ?? {}).sort()
  const restored: string[] = []

  for (const dependency of dependencies) {
    const destination = join(nodeModules, dependency)
    if (existsSync(destination)) continue
    const source = join(sourceNodeModules, dependency)
    if (!existsSync(source)) {
      throw new Error(`deployed dependency ${dependency} is absent from both ${destination} and ${source}`)
    }
    await mkdir(dirname(destination), { recursive: true })
    await copyPackageWithoutNestedDependencies(source, destination)
    restored.push(dependency)
  }

  const stillMissing = dependencies.filter(dependency => !existsSync(join(nodeModules, dependency)))
  if (stillMissing.length > 0) {
    throw new Error(`staged dependencies remain missing: ${stillMissing.join(', ')}`)
  }
  if (restored.length > 0) console.log(`dsh-desktop-deploy: restored legacy deploy hoists: ${restored.join(', ')}`)

  if (options.closureSourceNodeModules !== undefined) {
    const closureRestored = await restoreRequiredDependencyClosure(
      manifest,
      nodeModules,
      resolve(options.closureSourceNodeModules),
    )
    if (closureRestored.length > 0) {
      await recordRestoredClosureDependencies(staging, manifest, nodeModules, closureRestored)
      console.log(`dsh-desktop-deploy: restored required dependency closure: ${closureRestored.join(', ')}`)
    }
  }

  await materializePackageLinks(nodeModules)
  await rm(join(nodeModules, '.pnpm'), { recursive: true, force: true })
  for (const relativePath of options.removeFiles ?? []) {
    await rm(resolveStagedFile(staging, relativePath), { force: true })
  }
}

interface PackageManifest {
  readonly version?: unknown
  readonly dependencies?: Readonly<Record<string, string>>
  readonly peerDependencies?: Readonly<Record<string, string>>
  readonly peerDependenciesMeta?: Readonly<Record<string, { readonly optional?: boolean }>>
}

async function recordRestoredClosureDependencies(
  staging: string,
  rootManifest: PackageManifest,
  nodeModules: string,
  restored: readonly string[],
): Promise<void> {
  const dependencies: Record<string, string> = { ...rootManifest.dependencies }
  for (const packageName of restored) {
    const manifest = JSON.parse(await readFile(join(nodeModules, packageName, 'package.json'), 'utf8')) as PackageManifest
    if (typeof manifest.version !== 'string' || manifest.version === '') {
      throw new Error(`restored dependency ${packageName} has no package version`)
    }
    dependencies[packageName] = manifest.version
  }
  await writeFile(join(staging, 'package.json'), `${JSON.stringify({ ...rootManifest, dependencies }, null, 2)}\n`)
}

async function restoreRequiredDependencyClosure(
  rootManifest: PackageManifest,
  nodeModules: string,
  sourceNodeModules: string,
): Promise<string[]> {
  const pending = Object.keys(rootManifest.dependencies ?? {}).sort()
  const visited = new Set<string>()
  const restored: string[] = []

  while (pending.length > 0) {
    const packageName = pending.shift()
    if (packageName === undefined || visited.has(packageName)) continue
    visited.add(packageName)
    const destination = join(nodeModules, packageName)
    if (!existsSync(destination)) {
      const source = join(sourceNodeModules, packageName)
      if (!existsSync(source)) {
        throw new Error(`required dependency ${packageName} is absent from both ${destination} and ${source}`)
      }
      await mkdir(dirname(destination), { recursive: true })
      await copyPackageWithoutNestedDependencies(source, destination)
      restored.push(packageName)
    }

    const manifest = JSON.parse(await readFile(join(destination, 'package.json'), 'utf8')) as PackageManifest
    const dependencies = Object.keys(manifest.dependencies ?? {})
    const requiredPeers = Object.keys(manifest.peerDependencies ?? {}).filter(
      peer => manifest.peerDependenciesMeta?.[peer]?.optional !== true,
    )
    pending.push(...dependencies, ...requiredPeers)
    pending.sort()
  }
  return restored
}

/**
 * Find the first symbolic link below a directory in stable lexical order.
 * @param directory - Directory to inspect recursively.
 * @returns Absolute symbolic-link path, or undefined when the tree contains none.
 */
export async function findFirstSymlink(directory: string): Promise<string | undefined> {
  const entries = await readdir(directory, { withFileTypes: true })
  entries.sort((left, right) => left.name.localeCompare(right.name))
  for (const entry of entries) {
    const path = join(directory, entry.name)
    const metadata = await lstat(path)
    if (metadata.isSymbolicLink()) return path
    if (!metadata.isDirectory()) continue
    const nested = await findFirstSymlink(path)
    if (nested !== undefined) return nested
  }
  return undefined
}

async function materializePackageLinks(nodeModules: string): Promise<void> {
  let remaining = await findFirstSymlink(nodeModules)
  while (remaining !== undefined) {
    const segments = remaining.slice(nodeModules.length + 1).split(sep)
    const binIndex = segments.lastIndexOf('.bin')
    if (binIndex >= 0) {
      await rm(join(nodeModules, ...segments.slice(0, binIndex + 1)), { recursive: true, force: true })
      remaining = await findFirstSymlink(nodeModules)
      continue
    }

    const source = await realpath(remaining)
    await rm(remaining, { recursive: true, force: true })
    await copyPackageWithoutNestedDependencies(source, remaining)
    remaining = await findFirstSymlink(nodeModules)
  }
}

async function copyPackageWithoutNestedDependencies(source: string, destination: string): Promise<void> {
  const nestedNodeModules = join(source, 'node_modules')
  await cp(source, destination, {
    recursive: true,
    dereference: true,
    filter: path => path !== nestedNodeModules && !path.startsWith(`${nestedNodeModules}${sep}`),
  })
}

function resolveStagedFile(staging: string, relativePath: string): string {
  const path = resolve(staging, relativePath)
  if (path === staging || !path.startsWith(`${staging}${sep}`)) {
    throw new Error(`deploy removal ${JSON.stringify(relativePath)} escapes staging ${staging}`)
  }
  return path
}
