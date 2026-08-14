/** User actions exposed by the native application menu. */
export interface DesktopMenuActions {
  /** Start one advisory GitHub Release check. */
  readonly checkForUpdates: () => void
  /** Check the official Harness default branch without mutating the runtime. */
  readonly checkHarnessUpdates: () => void
  /** Show product and build identity. */
  readonly showAbout: () => void
  /** Reveal the application-owned log directory. */
  readonly openLogsFolder: () => void
  /** Begin orderly application shutdown. */
  readonly quit: () => void
}

/** Mutable state reflected when rebuilding the native menu. */
export interface DesktopMenuState {
  /** Whether one update request is already active. */
  readonly updateInProgress: boolean
  /** Whether one official Harness status request is active. */
  readonly harnessUpdateInProgress: boolean
}

/** Electron-compatible subset used to define the native menu without runtime imports. */
export interface DesktopMenuItem {
  readonly label?: string
  readonly role?: 'about' | 'close' | 'copy' | 'cut' | 'delete' | 'minimize' | 'paste' | 'redo' | 'selectAll' | 'undo' | 'zoomIn' | 'zoomOut' | 'resetZoom' | 'togglefullscreen'
  readonly type?: 'separator'
  readonly accelerator?: string
  readonly enabled?: boolean
  readonly click?: () => void
  readonly submenu?: readonly DesktopMenuItem[]
}

/**
 * Build the complete desktop menu for one platform and update state.
 * @param actions - Application callbacks for product-specific items.
 * @param state - Current update-check activity.
 * @param platform - Host platform used for conventional menu placement.
 * @returns An Electron-compatible menu template.
 */
export function buildDesktopMenuTemplate(
  actions: DesktopMenuActions,
  state: DesktopMenuState,
  platform: NodeJS.Platform,
): readonly DesktopMenuItem[] {
  const productMenu: DesktopMenuItem = {
    label: 'DS-Harness Desktop',
    submenu: [
      { label: 'About DS-Harness Desktop', click: actions.showAbout },
      { type: 'separator' },
      updateItem(actions, state),
      harnessUpdateItem(actions, state),
      { label: 'Open Logs Folder', click: actions.openLogsFolder },
      { type: 'separator' },
      { label: 'Quit DS-Harness Desktop', accelerator: platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4', click: actions.quit },
    ],
  }
  const editMenu: DesktopMenuItem = {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'delete' },
      { role: 'selectAll' },
    ],
  }
  const windowMenu: DesktopMenuItem = {
    label: 'Window',
    submenu: [
      { role: 'minimize' },
      { role: 'close' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { role: 'togglefullscreen' },
    ],
  }
  if (platform === 'darwin') return [productMenu, editMenu, windowMenu]
  return [
    { label: 'File', submenu: [updateItem(actions, state), harnessUpdateItem(actions, state), { label: 'Open Logs Folder', click: actions.openLogsFolder }, { type: 'separator' }, { label: 'Quit DS-Harness Desktop', click: actions.quit }] },
    editMenu,
    windowMenu,
    { label: 'Help', submenu: [{ label: 'About DS-Harness Desktop', click: actions.showAbout }] },
  ]
}

function harnessUpdateItem(actions: DesktopMenuActions, state: DesktopMenuState): DesktopMenuItem {
  return {
    label: 'Check Harness Updates…',
    enabled: !state.harnessUpdateInProgress,
    click: actions.checkHarnessUpdates,
  }
}

function updateItem(actions: DesktopMenuActions, state: DesktopMenuState): DesktopMenuItem {
  return {
    label: 'Check for Updates…',
    enabled: !state.updateInProgress,
    click: actions.checkForUpdates,
  }
}
