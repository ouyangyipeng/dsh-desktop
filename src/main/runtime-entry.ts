import { join, resolve } from 'node:path'

/**
 * Resolve the built DSH CLI from development dependencies or packaged resources.
 * @param packagedNodeModules - Packaged runtime node_modules copied outside app.asar.
 * @returns Absolute path to `@deepseek-ai/dsh/lib/bin.js`.
 */
export function resolveDshCliEntry(packagedNodeModules?: string): string {
  if (packagedNodeModules !== undefined) {
    return join(packagedNodeModules, '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  }
  return resolve(process.cwd(), 'upstream/deepseek-harness/apps/cli/lib/bin.js')
}
