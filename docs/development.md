# Development

## Prerequisites

- Git with submodule support
- Node.js `^22.19.0 || >=24.0.0`
- pnpm `11.21.0`
- macOS for macOS packaging, or Windows for Windows packaging

Clone recursively:

```bash
git clone --recursive https://github.com/ouyangyipeng/dsh-desktop.git
cd dsh-desktop
pnpm install --frozen-lockfile
pnpm upstream:bootstrap
```

`upstream:bootstrap` initializes the official submodule, installs its locked dependencies with `CI=true`, and builds its workspaces. `CI=true` activates the upstream repository's documented non-interactive install path and prevents developer Git-hook setup inside the nested checkout.

## Inner loop

```bash
pnpm dev
```

The development application builds the Desktop main process and launches Electron. It resolves the CLI from the built upstream workspace and assigns a Desktop-specific `DSH_HOME` below the Electron user-data directory.

Before committing a focused change, run the checks that exercise its surface:

```bash
pnpm typecheck
pnpm exec vitest run tests/main/<focused-test>.spec.ts
pnpm site:check                 # when site/ changes
```

`pnpm test` includes a real local `dsh web` startup snapshot. Environments that forbid loopback listeners must run that check in an allowed host context; an `EPERM` from `listen 127.0.0.1` is sandbox evidence, not a reason to weaken the runtime binding or skip the snapshot.

## Update the official Harness pin

Inspect the recorded revision:

```bash
pnpm upstream:status
```

Update it and execute the guarded local sequence:

```bash
pnpm upstream:update
```

This command fetches `origin/master` in the official submodule, checks out that revision detached, stages the parent gitlink, rebuilds upstream, builds and tests Desktop, and creates a development stage. Review the upstream changes and the gitlink diff before committing. Never add Desktop patches inside the submodule; propose Harness fixes upstream or keep Desktop-specific code in this repository.

## Build a development installer

Builds are target-native and architecture-exact. On an Apple Silicon Mac:

```bash
pnpm run pack -- --development --mac --arm64
```

On a matching Windows host:

```powershell
pnpm run pack -- --development --windows --arm64
```

Use `--x64` only on an x64 host. Artifacts are written below `dist/artifacts`. Development metadata records the Desktop commit as `development`, but still records the real official Harness commit.

Smoke the unpacked application produced beside the Windows installer:

```powershell
pnpm smoke:packaged -- "dist/artifacts/win-unpacked/DS-Harness Desktop.exe"
```

For a release stage, omit `--development` and provide the public release repository:

```bash
DSH_DESKTOP_RELEASE_REPOSITORY=ouyangyipeng/dsh-desktop pnpm run pack -- --mac --arm64
```

The staging command rejects environment variables that attempt to override Git-derived Desktop or upstream commits.

## Packaged macOS smoke

Mount the produced DMG read-only, then pass the exact mounted application path:

```bash
pnpm smoke:packaged -- "/Volumes/DS-Harness Desktop/DS-Harness Desktop.app"
```

The smoke mode uses a temporary application-data root, launches the packaged executable, waits for `runtime.ready`, requests a normal quit, verifies graceful child termination, and removes its temporary data. It does not use a developer checkout of the upstream CLI.

## Site

`site/` is intentionally static and self-contained. Do not add remote fonts, scripts, images, analytics, or build-time framework dependencies. `pnpm site:check` validates required product identity, local file references, absence of remote visual assets, and reduced-motion support. GitHub Pages publishes only this directory.
