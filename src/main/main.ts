import { mkdirSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  Menu,
  shell,
  type MenuItemConstructorOptions,
} from 'electron'
import {
  developmentBuildMetadata,
  parseDesktopBuildMetadata,
  type DesktopBuildMetadata,
} from './build-metadata.ts'
import {
  createElectronRuntimeSupervisor,
  embeddedNodeRuntimeChildFactory,
} from './electron-runtime-child.ts'
import { FileDesktopLogger, redactLogText } from './logging.ts'
import {
  DesktopLifecycle,
  type DesktopAppPort,
  type DesktopWindowPort,
} from './main-lifecycle.ts'
import { buildDesktopMenuTemplate, type DesktopMenuItem } from './menu.ts'
import { parseRecoveryAction, renderRecoveryPage, type RecoveryAction } from './recovery-page.ts'
import { checkForUpdates, type UpdateCheckResult } from './update-checker.ts'
import { checkUpstreamStatus, type UpstreamCheckResult } from './upstream-checker.ts'
import { packagedSmokeRoot } from './smoke-mode.ts'
import {
  desktopWindowOptions,
  installSessionSecurity,
  installWebContentsSecurity,
  type SessionSecurityPort,
  type WebContentsSecurityPort,
} from './window-policy.ts'

const APPLICATION_ID = 'io.github.ouyangyipeng.dsh-desktop'
const BUILD_METADATA_FILE = 'build-metadata.json'
const PRODUCT_NAME = 'DS-Harness Desktop'

app.setName(PRODUCT_NAME)
const smokeRoot = packagedSmokeRoot(app.isPackaged, process.env)
if (smokeRoot === undefined) {
  app.setAppLogsPath()
} else {
  const userDataPath = join(smokeRoot, 'user-data')
  const logsPath = join(smokeRoot, 'logs')
  mkdirSync(userDataPath, { recursive: true })
  mkdirSync(logsPath, { recursive: true })
  app.setPath('userData', userDataPath)
  app.setAppLogsPath(logsPath)
}
const desktopHarnessHome = join(app.getPath('userData'), 'harness')
const logsDirectory = app.getPath('logs')
const logger = new FileDesktopLogger(join(logsDirectory, 'desktop.log'))
let buildMetadata = developmentBuildMetadata(app.getVersion())
let updateInProgress = false
let harnessUpdateInProgress = false
let sessionSecurityInstalled = false
const lifecycleReference: { current?: DesktopLifecycle } = {}

const runtime = createElectronRuntimeSupervisor({
  desktopHarnessHome,
  patchPath: app.isPackaged
    ? join(process.resourcesPath, 'runtime', 'dsh-desktop.patch.yml')
    : join(import.meta.dirname, '../config/dsh-desktop.patch.yml'),
  ...(app.isPackaged ? { runtimeNodeModules: join(process.resourcesPath, 'runtime', 'node_modules') } : {}),
  ...(app.isPackaged ? { runtimeChildFactory: embeddedNodeRuntimeChildFactory } : {}),
  logSink: (entry) => {
    logger.record('runtime.output', { source: entry.source, text: entry.text })
  },
  onUnexpectedExit: (exit) => {
    lifecycleReference.current?.handleUnexpectedRuntimeExit(exit)
  },
})

const lifecycle = new DesktopLifecycle({
  app: electronAppPort(),
  platform: process.platform,
  runtime,
  logger,
  prepare: prepareApplication,
  createWindow: createDesktopWindow,
  showRuntimeFatal,
  showRendererGone,
})
lifecycleReference.current = lifecycle

void lifecycle.start().then((started) => {
  if (!started || smokeRoot === undefined) return
  logger.record('application.smoke.ready')
  lifecycle.requestQuit()
})

async function prepareApplication(): Promise<void> {
  if (process.platform === 'win32') app.setAppUserModelId(APPLICATION_ID)
  await mkdir(desktopHarnessHome, { recursive: true })
  buildMetadata = await loadBuildMetadata()
  installApplicationMenu()
  logger.record('application.prepared', {
    version: buildMetadata.version,
    platform: buildMetadata.platform,
    arch: buildMetadata.arch,
  })
}

function createDesktopWindow(origin: URL): DesktopWindowPort {
  const window = new BrowserWindow(desktopWindowOptions())
  if (!sessionSecurityInstalled) {
    installSessionSecurity(electronSessionPort(window))
    sessionSecurityInstalled = true
  }
  installWebContentsSecurity(electronWebContentsPort(window), origin, async (url) => {
    await shell.openExternal(url.href)
  })
  return electronWindowPort(window)
}

function electronWindowPort(window: BrowserWindow): DesktopWindowPort {
  return {
    load: async (url) => {
      await window.loadURL(url.href)
    },
    onReadyToShow: listener => window.once('ready-to-show', listener),
    onClosed: listener => window.once('closed', listener),
    onRendererGone: listener => window.webContents.once('render-process-gone', listener),
    show: () => {
      window.show()
    },
    isMinimized: () => window.isMinimized(),
    restore: () => {
      window.restore()
    },
    focus: () => {
      window.focus()
    },
    reload: () => {
      window.webContents.reload()
    },
  }
}

function electronWebContentsPort(window: BrowserWindow): WebContentsSecurityPort {
  return {
    onWillNavigate: listener => window.webContents.on('will-navigate', (event, url) => {
      listener(event, url)
    }),
    onWindowOpen: (handler) => {
      window.webContents.setWindowOpenHandler(details => handler(details.url))
    },
    onWillAttachWebview: listener => window.webContents.on('will-attach-webview', (event) => {
      listener(event)
    }),
  }
}

function electronSessionPort(window: BrowserWindow): SessionSecurityPort {
  const session = window.webContents.session
  return {
    onPermissionRequest: (listener) => {
      session.setPermissionRequestHandler((_contents, _permission, decide) => {
        listener(decide)
      })
    },
    onPermissionCheck: (listener) => {
      session.setPermissionCheckHandler(() => listener())
    },
    onWillDownload: listener => session.on('will-download', (event) => {
      listener(event)
    }),
  }
}

function electronAppPort(): DesktopAppPort {
  return {
    requestSingleInstanceLock: () => app.requestSingleInstanceLock(),
    whenReady: async () => app.whenReady(),
    onSecondInstance: listener => app.on('second-instance', () => {
      listener()
    }),
    onActivate: listener => app.on('activate', () => {
      listener()
    }),
    onWindowAllClosed: listener => app.on('window-all-closed', () => {
      listener()
    }),
    onBeforeQuit: listener => app.on('before-quit', (event) => {
      listener(event)
    }),
    quit: () => {
      app.quit()
    },
    relaunch: () => {
      app.relaunch()
    },
    exit: (code) => {
      app.exit(code)
    },
  }
}

function installApplicationMenu(): void {
  const template = buildDesktopMenuTemplate({
    checkForUpdates: () => {
      void performUpdateCheck()
    },
    checkHarnessUpdates: () => {
      void performHarnessUpdateCheck()
    },
    showAbout: () => {
      void showAbout()
    },
    openLogsFolder: () => {
      void openLogsFolder()
    },
    quit: () => {
      lifecycle.requestQuit()
    },
  }, { updateInProgress, harnessUpdateInProgress }, process.platform)
  Menu.setApplicationMenu(Menu.buildFromTemplate(template.map(toElectronMenuItem)))
}

async function performHarnessUpdateCheck(): Promise<void> {
  if (harnessUpdateInProgress) return
  harnessUpdateInProgress = true
  installApplicationMenu()
  logger.record('upstream-update.started')
  try {
    const result = await checkUpstreamStatus(fetch, buildMetadata.upstreamCommit)
    logger.record('upstream-update.finished', { state: result.state })
    await showHarnessUpdateResult(result)
  } finally {
    harnessUpdateInProgress = false
    installApplicationMenu()
  }
}

async function showHarnessUpdateResult(result: UpstreamCheckResult): Promise<void> {
  if (result.state === 'current') {
    await dialog.showMessageBox({ type: 'info', title: 'Harness Updates', message: 'The bundled DeepSeek Harness revision matches the official default branch.' })
    return
  }
  if (result.state === 'newer') {
    const response = await dialog.showMessageBox({
      type: 'info',
      title: 'Harness Update Available',
      message: 'The official Harness repository has a newer revision.',
      detail: `Bundled: ${result.currentCommit.slice(0, 12)}\nOfficial: ${result.latestCommit.slice(0, 12)}\n\nInstalled runtimes update only through a verified Desktop release.`,
      buttons: ['Open Official Commit', 'Close'],
      defaultId: 0,
      cancelId: 1,
    })
    if (response.response === 0) await shell.openExternal(result.commitUrl.href)
    return
  }
  await dialog.showMessageBox({ type: 'warning', title: 'Harness Updates', message: result.message })
}

function toElectronMenuItem(item: DesktopMenuItem): MenuItemConstructorOptions {
  return {
    ...item,
    ...(item.submenu === undefined ? {} : { submenu: item.submenu.map(toElectronMenuItem) }),
  } as MenuItemConstructorOptions
}

async function performUpdateCheck(): Promise<void> {
  if (updateInProgress) return
  updateInProgress = true
  installApplicationMenu()
  logger.record('update.started')
  try {
    const result = await checkForUpdates({ metadata: buildMetadata })
    logger.record('update.finished', { state: result.state })
    await showUpdateResult(result)
  } finally {
    updateInProgress = false
    installApplicationMenu()
  }
}

async function showUpdateResult(result: UpdateCheckResult): Promise<void> {
  switch (result.state) {
    case 'development':
      await dialog.showMessageBox({ type: 'info', title: 'Check for Updates', message: 'Development builds do not check GitHub Releases.' })
      return
    case 'current':
      await dialog.showMessageBox({ type: 'info', title: 'Check for Updates', message: `DS-Harness Desktop ${result.version} is current.` })
      return
    case 'available': {
      const response = await dialog.showMessageBox({
        type: 'info',
        title: 'Update Available',
        message: `DS-Harness Desktop ${result.version} is available.`,
        detail: result.summary,
        buttons: ['Open Release', 'Cancel'],
        defaultId: 0,
        cancelId: 1,
      })
      if (response.response === 0) await shell.openExternal(result.releaseUrl.href)
      return
    }
    case 'offline':
      await dialog.showMessageBox({ type: 'warning', title: 'Check for Updates', message: result.message })
      return
    case 'rate-limited':
      await dialog.showMessageBox({
        type: 'warning',
        title: 'Check for Updates',
        message: 'GitHub temporarily limited anonymous update checks.',
        ...(result.resetAt === undefined ? {} : { detail: `Try again after ${result.resetAt.toLocaleString()}.` }),
      })
      return
    case 'malformed':
      await dialog.showMessageBox({ type: 'warning', title: 'Check for Updates', message: result.message })
  }
}

async function showAbout(): Promise<void> {
  await dialog.showMessageBox({
    type: 'info',
    title: 'About DS-Harness Desktop',
    message: `DS-Harness Desktop ${buildMetadata.version}`,
    detail: `Desktop commit: ${buildMetadata.desktopCommit}\nUpstream repository: ${buildMetadata.upstreamRepository}\nUpstream commit: ${buildMetadata.upstreamCommit}\nMarketplace: ${buildMetadata.marketplaceVersion} (${buildMetadata.marketplaceCommit})\nMarketplace repository: ${buildMetadata.marketplaceRepository}\nTarget: ${buildMetadata.platform}/${buildMetadata.arch}`,
  })
}

async function openLogsFolder(): Promise<void> {
  const error = await shell.openPath(logsDirectory)
  if (error === '') return
  logger.record('logs.open.failed', { message: error })
  await dialog.showMessageBox({ type: 'warning', title: 'Open Logs Folder', message: 'The logs folder could not be opened.' })
}

async function showRuntimeFatal(code: number): Promise<'retry' | 'quit'> {
  if (smokeRoot !== undefined) return 'quit'
  const diagnostics = runtime.diagnostics()
  const diagnosticText = redactLogText(`stdout:\n${diagnostics.stdout}\n\nstderr:\n${diagnostics.stderr}`)
  return await showRecoveryWindow({
    title: code === -1 ? 'DS-Harness Desktop could not start' : 'The DS-Harness runtime stopped',
    message: code === -1 ? 'Review the diagnostics, correct the configuration if needed, then retry with a fresh runtime.' : `Runtime exit code ${String(code)}. Retry starts a fresh application process.`,
    diagnostics: diagnosticText,
  })
}

async function showRecoveryWindow(input: { readonly title: string; readonly message: string; readonly diagnostics: string }): Promise<'retry' | 'quit'> {
  const window = new BrowserWindow(desktopWindowOptions())
  if (!sessionSecurityInstalled) {
    installSessionSecurity(electronSessionPort(window))
    sessionSecurityInstalled = true
  }
  const html = renderRecoveryPage({ ...input, version: buildMetadata.version, upstreamCommit: buildMetadata.upstreamCommit })
  const pageUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-attach-webview', event => event.preventDefault())
  return await new Promise<'retry' | 'quit'>((resolve) => {
    let settled = false
    const finish = (decision: 'retry' | 'quit'): void => {
      if (settled) return
      settled = true
      resolve(decision)
      if (!window.isDestroyed()) window.close()
    }
    window.webContents.on('will-navigate', (event, target) => {
      if (target === pageUrl) return
      event.preventDefault()
      const action = parseRecoveryAction(target)
      if (action !== undefined) void handleRecoveryAction(action, input.diagnostics, finish)
    })
    window.once('closed', () => finish('quit'))
    window.once('ready-to-show', () => window.show())
    void window.loadURL(pageUrl).catch((error: unknown) => {
      logger.record('recovery.load.failed', { message: error instanceof Error ? error.message : 'unknown failure' })
      finish('quit')
    })
  })
}

async function handleRecoveryAction(
  action: RecoveryAction,
  diagnostics: string,
  finish: (decision: 'retry' | 'quit') => void,
): Promise<void> {
  if (action === 'retry' || action === 'quit') {
    finish(action)
    return
  }
  if (action === 'copy-diagnostics') {
    clipboard.writeText(redactLogText(diagnostics))
    return
  }
  if (action === 'open-logs') {
    const error = await shell.openPath(logsDirectory)
    if (error !== '') logger.record('logs.open.failed', { message: error })
    return
  }
  await shell.openExternal('https://github.com/ouyangyipeng/dsh-desktop#installation')
}

async function showRendererGone(): Promise<'reload' | 'quit'> {
  const result = await dialog.showMessageBox({
    type: 'error',
    title: 'DS-Harness Desktop',
    message: 'The desktop window stopped responding.',
    detail: 'The Harness runtime is still running.',
    buttons: ['Reload Window', 'Quit'],
    defaultId: 0,
    cancelId: 1,
  })
  return result.response === 0 ? 'reload' : 'quit'
}

async function loadBuildMetadata(): Promise<DesktopBuildMetadata> {
  if (!app.isPackaged) return developmentBuildMetadata(app.getVersion())
  const path = join(process.resourcesPath, BUILD_METADATA_FILE)
  const source = await readFile(path, 'utf8')
  const metadata = parseDesktopBuildMetadata(JSON.parse(source) as unknown)
  if (metadata.platform !== process.platform || metadata.arch !== process.arch) {
    throw new Error('desktop build metadata does not match the running platform')
  }
  return metadata
}
