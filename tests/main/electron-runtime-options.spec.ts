/** Platform-specific Electron utility carrier options. */

import { describe, expect, it } from 'vitest'
import {
  resolveElectronRuntimeForkOptions,
  resolveEmbeddedNodeRuntimeSpawn,
} from '../../src/main/electron-runtime-options.ts'
import type { RuntimeChildInput } from '../../src/main/runtime-supervisor.ts'

const input: RuntimeChildInput = {
  entry: '/app/node_modules/@deepseek-ai/dsh/lib/bin.js',
  args: ['web', '--host', '127.0.0.1', '--port', '0'],
  cwd: '/data/harness',
  env: { PATH: '/bin', DSH_HOME: '/data/harness' },
}

describe('Electron runtime fork options', () => {
  it('uses the macOS plugin helper required by DSH native addons', () => {
    expect(resolveElectronRuntimeForkOptions(input, 'darwin')).toEqual({
      cwd: '/data/harness',
      env: { PATH: '/bin', DSH_HOME: '/data/harness' },
      execArgv: ['--expose-internals'],
      stdio: ['ignore', 'pipe', 'pipe'],
      serviceName: 'DS-Harness Runtime',
      allowLoadingUnsignedLibraries: true,
    })
  })

  it('does not relax library validation on platforms without that helper contract', () => {
    expect(resolveElectronRuntimeForkOptions(input, 'win32')).toEqual({
      cwd: '/data/harness',
      env: { PATH: '/bin', DSH_HOME: '/data/harness' },
      execArgv: ['--expose-internals'],
      stdio: ['ignore', 'pipe', 'pipe'],
      serviceName: 'DS-Harness Runtime',
    })
  })

  it('launches packaged runtimes through the Electron embedded Node carrier', () => {
    expect(resolveEmbeddedNodeRuntimeSpawn(input, '/app/Contents/MacOS/DS-Harness Desktop', 'darwin')).toEqual({
      command: '/app/Contents/MacOS/DS-Harness Desktop',
      args: [
        '--expose-internals',
        '/app/node_modules/@deepseek-ai/dsh/lib/bin.js',
        'web',
        '--host',
        '127.0.0.1',
        '--port',
        '0',
      ],
      options: {
        cwd: '/data/harness',
        env: { PATH: '/bin', DSH_HOME: '/data/harness', ELECTRON_RUN_AS_NODE: '1' },
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    })
  })

  it('does not request a detached Windows process group', () => {
    expect(resolveEmbeddedNodeRuntimeSpawn(input, 'C:\\Program Files\\DS-Harness Desktop.exe', 'win32').options.detached).toBe(false)
  })
})
