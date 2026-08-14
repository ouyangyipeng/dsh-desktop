import { describe, expect, it } from 'vitest'
import { packagedSmokeEnabled, packagedSmokeRoot } from '../../src/main/smoke-mode.ts'

describe('packaged smoke mode', () => {
  it('enables deterministic self-exit only for an explicitly marked packaged app', () => {
    expect(packagedSmokeEnabled(true, { DSH_DESKTOP_SMOKE: '1' })).toBe(true)
    expect(packagedSmokeEnabled(false, { DSH_DESKTOP_SMOKE: '1' })).toBe(false)
    expect(packagedSmokeEnabled(true, {})).toBe(false)
    expect(packagedSmokeEnabled(true, { DSH_DESKTOP_SMOKE: 'true' })).toBe(false)
  })

  it('accepts only an absolute isolation root for packaged smoke state', () => {
    expect(packagedSmokeRoot(true, {
      DSH_DESKTOP_SMOKE: '1',
      DSH_DESKTOP_SMOKE_ROOT: '/tmp/dsh-desktop-smoke',
    })).toBe('/tmp/dsh-desktop-smoke')
    expect(packagedSmokeRoot(false, {
      DSH_DESKTOP_SMOKE: '1',
      DSH_DESKTOP_SMOKE_ROOT: 'ignored',
    })).toBeUndefined()
    expect(() => packagedSmokeRoot(true, {
      DSH_DESKTOP_SMOKE: '1',
      DSH_DESKTOP_SMOKE_ROOT: 'relative',
    })).toThrow('absolute')
  })
})
