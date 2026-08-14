import { isAbsolute, resolve } from 'node:path'

/**
 * Decide whether a packaged application should prove readiness and quit itself.
 * @param isPackaged - Electron application packaging state.
 * @param environment - Process environment containing the internal smoke marker.
 * @returns Whether the deterministic packaged smoke lifecycle is enabled.
 */
export function packagedSmokeEnabled(
  isPackaged: boolean,
  environment: Readonly<Record<string, string | undefined>>,
): boolean {
  return isPackaged && environment.DSH_DESKTOP_SMOKE === '1'
}

/**
 * Resolve the application data root owned by one packaged smoke run.
 * @param isPackaged - Electron application packaging state.
 * @param environment - Process environment containing smoke isolation values.
 * @returns An absolute normalized root, or undefined outside packaged smoke mode.
 */
export function packagedSmokeRoot(
  isPackaged: boolean,
  environment: Readonly<Record<string, string | undefined>>,
): string | undefined {
  if (!packagedSmokeEnabled(isPackaged, environment)) return undefined
  const root = environment.DSH_DESKTOP_SMOKE_ROOT
  if (root === undefined || !isAbsolute(root)) throw new Error('packaged smoke root must be absolute')
  return resolve(root)
}
