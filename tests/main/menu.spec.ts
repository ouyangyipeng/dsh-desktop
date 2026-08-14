/** Native desktop menu contents and in-progress update state. */

import { describe, expect, it, vi } from 'vitest'
import { buildDesktopMenuTemplate, type DesktopMenuActions } from '../../src/main/menu.ts'

interface MenuNode {
  readonly label?: string
  readonly role?: string
  readonly enabled?: boolean
  readonly click?: () => void
  readonly submenu?: readonly MenuNode[]
}

function actions(): DesktopMenuActions {
  return {
    checkForUpdates: vi.fn(),
    checkHarnessUpdates: vi.fn(),
    showAbout: vi.fn(),
    openLogsFolder: vi.fn(),
    quit: vi.fn(),
  }
}

function flatten(nodes: readonly MenuNode[]): readonly MenuNode[] {
  return nodes.flatMap(node => [node, ...(node.submenu === undefined ? [] : flatten(node.submenu))])
}

describe('desktop application menu', () => {
  it.each(['darwin', 'win32'] as const)('contains product, diagnostics, edit, window, and quit actions on %s', (platform) => {
    const menuActions = actions()
    const nodes = flatten(buildDesktopMenuTemplate(menuActions, { updateInProgress: false, harnessUpdateInProgress: false }, platform))

    expect(nodes.some(node => node.label === 'Check for Updates…')).toBe(true)
    expect(nodes.some(node => node.label === 'Check Harness Updates…')).toBe(true)
    expect(nodes.some(node => node.label === 'About DS-Harness Desktop')).toBe(true)
    expect(nodes.some(node => node.label === 'Open Logs Folder')).toBe(true)
    expect(nodes.some(node => node.label === 'Quit DS-Harness Desktop')).toBe(true)
    expect(nodes.some(node => node.role === 'copy')).toBe(true)
    expect(nodes.some(node => node.role === 'paste')).toBe(true)
    expect(nodes.some(node => node.role === 'minimize')).toBe(true)

    nodes.find(node => node.label === 'Check for Updates…')?.click?.()
    nodes.find(node => node.label === 'Check Harness Updates…')?.click?.()
    nodes.find(node => node.label === 'About DS-Harness Desktop')?.click?.()
    nodes.find(node => node.label === 'Open Logs Folder')?.click?.()
    nodes.find(node => node.label === 'Quit DS-Harness Desktop')?.click?.()
    expect(menuActions.checkForUpdates).toHaveBeenCalledOnce()
    expect(menuActions.checkHarnessUpdates).toHaveBeenCalledOnce()
    expect(menuActions.showAbout).toHaveBeenCalledOnce()
    expect(menuActions.openLogsFolder).toHaveBeenCalledOnce()
    expect(menuActions.quit).toHaveBeenCalledOnce()
  })

  it('disables the update action while the same check is in progress', () => {
    const nodes = flatten(buildDesktopMenuTemplate(actions(), { updateInProgress: true, harnessUpdateInProgress: true }, 'darwin'))

    expect(nodes.find(node => node.label === 'Check for Updates…')?.enabled).toBe(false)
    expect(nodes.find(node => node.label === 'Check Harness Updates…')?.enabled).toBe(false)
  })
})
