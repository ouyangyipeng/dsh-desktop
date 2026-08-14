import { defineConfig } from 'tsdown'

/** Bundle the Electron main process from the host TypeScript project output. */
export default defineConfig({
  entry: ['../lib/types/main/main.js'],
  outDir: '../lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  deps: {
    neverBundle: ['electron'],
  },
  fixedExtension: false,
  dts: false,
  clean: false,
})
