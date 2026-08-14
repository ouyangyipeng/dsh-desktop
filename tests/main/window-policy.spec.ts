/** BrowserWindow navigation and capability-denial policy. */

import { describe, expect, it, vi } from 'vitest'
import {
  classifyNavigation,
  desktopWindowOptions,
  installSessionSecurity,
  installWebContentsSecurity,
  type PreventableEvent,
  type SessionSecurityPort,
  type WebContentsSecurityPort,
} from '../../src/main/window-policy.ts'

const runtimeOrigin = new URL('http://127.0.0.1:43127/')

describe('desktop window navigation policy', () => {
  it.each([
    'http://127.0.0.1:43127/',
    'http://127.0.0.1:43127/session/abc',
    'http://127.0.0.1:43127/?tab=plugins#active',
  ])('allows an exact-origin runtime URL: %s', (target) => {
    expect(classifyNavigation(target, runtimeOrigin)).toEqual({ action: 'allow' })
  })

  it('normalizes an HTTPS URL before handing it to the system browser', () => {
    expect(classifyNavigation('https://example.com:443/a/../docs?q=1#top', runtimeOrigin)).toEqual({
      action: 'external',
      url: new URL('https://example.com/docs?q=1#top'),
    })
  })

  it.each([
    'http://example.com/',
    'file:///tmp/secret',
    'javascript:alert(1)',
    'https://user:pass@example.com/',
    '//example.com/path',
    'not a URL',
    'http://localhost:43127/',
    'http://127.0.0.1:43128/',
  ])('denies an untrusted navigation target: %s', (target) => {
    expect(classifyNavigation(target, runtimeOrigin)).toEqual({ action: 'deny' })
  })

  it('declares every security-sensitive BrowserWindow preference explicitly', () => {
    expect(desktopWindowOptions()).toMatchObject({
      show: false,
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        webviewTag: false,
      },
    })
  })

  it('denies popups and routes only approved HTTPS links externally', async () => {
    let navigate: ((event: PreventableEvent, target: string) => void) | undefined
    let openWindow: ((target: string) => { action: 'deny' }) | undefined
    const attachEvent = { preventDefault: vi.fn() }
    const external = vi.fn()
    const port: WebContentsSecurityPort = {
      onWillNavigate: (listener) => {
        navigate = listener
      },
      onWindowOpen: (handler) => {
        openWindow = handler
      },
      onWillAttachWebview: (listener) => {
        listener(attachEvent)
      },
    }
    installWebContentsSecurity(port, runtimeOrigin, external)

    const internalEvent = { preventDefault: vi.fn() }
    navigate?.(internalEvent, 'http://127.0.0.1:43127/plugins')
    expect(internalEvent.preventDefault).not.toHaveBeenCalled()

    const externalEvent = { preventDefault: vi.fn() }
    navigate?.(externalEvent, 'https://github.com/topics/dsh-plugin')
    expect(externalEvent.preventDefault).toHaveBeenCalledOnce()
    expect(openWindow?.('https://github.com/topics/dsh-plugin')).toEqual({ action: 'deny' })
    expect(openWindow?.('file:///tmp/secret')).toEqual({ action: 'deny' })
    await new Promise<void>(resolve => setImmediate(resolve))

    expect(external).toHaveBeenCalledTimes(2)
    expect(external).toHaveBeenCalledWith(new URL('https://github.com/topics/dsh-plugin'))
    expect(attachEvent.preventDefault).toHaveBeenCalledOnce()
  })

  it('denies all permission requests, checks, and downloads', () => {
    const requestDecision = vi.fn()
    let checkPermission: (() => boolean) | undefined
    const downloadEvent = { preventDefault: vi.fn() }
    const port: SessionSecurityPort = {
      onPermissionRequest: (listener) => {
        listener(requestDecision)
      },
      onPermissionCheck: (listener) => {
        checkPermission = listener
      },
      onWillDownload: (listener) => {
        listener(downloadEvent)
      },
    }

    installSessionSecurity(port)

    expect(requestDecision).toHaveBeenCalledWith(false)
    expect(checkPermission?.()).toBe(false)
    expect(downloadEvent.preventDefault).toHaveBeenCalledOnce()
  })
})
