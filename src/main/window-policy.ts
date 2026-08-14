const HTTPS_PROTOCOL = 'https:'

/** Minimum event surface required to block an Electron action. */
export interface PreventableEvent {
  /** Cancel the requested browser action. */
  preventDefault(): void
}

/** Browser decision independent from Electron object identity. */
export type NavigationDecision =
  | { action: 'allow' }
  | { action: 'external'; url: URL }
  | { action: 'deny' }

/** WebContents hooks required by the desktop security policy. */
export interface WebContentsSecurityPort {
  /** Register main-frame navigation interception. */
  onWillNavigate(listener: (event: PreventableEvent, target: string) => void): void
  /** Register popup interception. */
  onWindowOpen(handler: (target: string) => { action: 'deny' }): void
  /** Register webview attachment interception. */
  onWillAttachWebview(listener: (event: PreventableEvent) => void): void
}

/** Session hooks required by the desktop security policy. */
export interface SessionSecurityPort {
  /** Register a permission-request decision callback. */
  onPermissionRequest(listener: (decide: (allowed: boolean) => void) => void): void
  /** Register a synchronous permission check. */
  onPermissionCheck(listener: () => boolean): void
  /** Register download interception. */
  onWillDownload(listener: (event: PreventableEvent) => void): void
}

/** Security-relevant BrowserWindow options owned by the desktop shell. */
export interface DesktopWindowOptions {
  readonly width: number
  readonly height: number
  readonly minWidth: number
  readonly minHeight: number
  readonly show: false
  readonly backgroundColor: string
  readonly webPreferences: {
    readonly contextIsolation: true
    readonly sandbox: true
    readonly nodeIntegration: false
    readonly webSecurity: true
    readonly webviewTag: false
  }
}

/**
 * Classify a renderer navigation against the exact owned runtime origin.
 * @param target - Untrusted renderer-provided navigation string.
 * @param runtimeOrigin - Validated loopback origin owned by the current runtime.
 * @returns An allow, external-open, or deny decision.
 */
export function classifyNavigation(target: string, runtimeOrigin: URL): NavigationDecision {
  let parsed: URL
  try {
    parsed = new URL(target)
  } catch {
    return { action: 'deny' }
  }
  if (parsed.username !== '' || parsed.password !== '') return { action: 'deny' }
  if (parsed.origin === runtimeOrigin.origin) return { action: 'allow' }
  if (parsed.protocol === HTTPS_PROTOCOL) return { action: 'external', url: parsed }
  return { action: 'deny' }
}

/** @returns Explicit hardened preferences for the single desktop renderer. */
export function desktopWindowOptions(): DesktopWindowOptions {
  return {
    width: 1280,
    height: 820,
    minWidth: 840,
    minHeight: 600,
    show: false,
    backgroundColor: '#111318',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      webviewTag: false,
    },
  }
}

/**
 * Install exact-origin navigation, external link, and webview denial hooks.
 * @param contents - WebContents adapter receiving policy hooks.
 * @param runtimeOrigin - Validated loopback runtime origin.
 * @param openExternal - System-browser adapter for approved HTTPS URLs.
 */
export function installWebContentsSecurity(
  contents: WebContentsSecurityPort,
  runtimeOrigin: URL,
  openExternal: (url: URL) => void | Promise<void>,
): void {
  contents.onWillNavigate((event, target) => {
    const decision = classifyNavigation(target, runtimeOrigin)
    if (decision.action === 'allow') return
    event.preventDefault()
    if (decision.action === 'external') scheduleExternalOpen(decision.url, openExternal)
  })
  contents.onWindowOpen((target) => {
    const decision = classifyNavigation(target, runtimeOrigin)
    if (decision.action === 'external') scheduleExternalOpen(decision.url, openExternal)
    return { action: 'deny' }
  })
  contents.onWillAttachWebview((event) => {
    event.preventDefault()
  })
}

/**
 * Install deny-by-default permission and download hooks.
 * @param session - Electron session adapter receiving security hooks.
 */
export function installSessionSecurity(session: SessionSecurityPort): void {
  session.onPermissionRequest((decide) => {
    decide(false)
  })
  session.onPermissionCheck(() => false)
  session.onWillDownload((event) => {
    event.preventDefault()
  })
}

function scheduleExternalOpen(url: URL, openExternal: (url: URL) => void | Promise<void>): void {
  setImmediate(() => {
    void Promise.resolve(openExternal(url)).catch(() => {
      // The system browser is outside the desktop runtime lifecycle.
    })
  })
}
