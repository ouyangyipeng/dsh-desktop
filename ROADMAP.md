# Roadmap

## 2026-08-14 16:53 CST

- Change: Made target checkout tests platform-semantic by normalizing the smoke root with the host path implementation, comparing snapshots with canonical LF endings, accepting Windows' non-zero runtime termination code after a single successful stop, and advancing the release version to `0.1.4`.
- Files: `tests/main/smoke-mode.spec.ts`, `tests/main/desktop-runtime.snapshot.ts`, `package.json`, `site/index.html`, `site/assets/desktop-preview.svg`.
- Decision: Root cause category — technical blind spot. The release matrix was correctly running the assembled runtime test on native Windows, but three assertions encoded macOS filesystem, checkout newline, and POSIX signal-exit behavior. Prevention: distinguish supervisor stop success from platform process exit conventions, normalize text fixtures at read time, derive expected paths through `node:path`, and keep `desktop-v0.1.3` immutable as failed release evidence.

## 2026-08-14 16:39 CST

- Change: Routed pnpm's Windows command shim through the explicit command interpreter recommended by Node.js, covered the complete executable and argument vector, and advanced the release version to `0.1.3` without rewriting `desktop-v0.1.2`.
- Files: `scripts/process.ts`, `tests/scripts/process.spec.ts`, `package.json`, `site/index.html`, `site/assets/desktop-preview.svg`.
- Decision: Root cause category — technical blind spot. Resolving `pnpm` to `pnpm.cmd` fixed command discovery but still treated a command script as a native executable, which Node 24 rejects with `spawn EINVAL`. Prevention: test Windows invocation semantics rather than only executable naming, run trusted pnpm arguments through an explicit `cmd.exe /d /s /c` vector, and preserve each failed release tag as immutable evidence.

## 2026-08-14 16:23 CST

- Change: Made pnpm child-process execution portable by resolving `pnpm.cmd` on Windows, added command-shim coverage, and advanced the release version to `0.1.2` without rewriting the failed `desktop-v0.1.1` tag.
- Files: `scripts/process.ts`, `tests/scripts/process.spec.ts`, `package.json`, `site/index.html`, `site/assets/desktop-preview.svg`.
- Decision: Root cause category — technical blind spot. `child_process.spawn` does not resolve the pnpm command shim on Windows without a shell, so both native Windows runners failed before upstream build despite PowerShell finding pnpm. Prevention: keep `shell: false`, map only the required trusted shim, test platform command resolution directly, and issue a new patch tag instead of rewriting published Git history.

## 2026-08-14 16:11 CST

- Change: Reordered clean-run verification so the Desktop bundle and immutable runtime stage exist before the assembled-runtime snapshot in Verify, Release, and scheduled upstream update paths.
- Files: `.github/workflows/verify.yml`, `.github/workflows/release.yml`, `scripts/upstream.ts`, `tests/workflows/workflows.spec.ts`, `tests/scripts/upstream.spec.ts`.
- Decision: Root cause category — technical blind spot. Local validation reused an ignored `dist/stage`, while a fresh GitHub runner correctly proved that `pnpm test` includes an artifact-plane snapshot. Prevention: encode build → stage → snapshot ordering in tests and treat clean-run CI as authoritative for source/artifact sequencing.

## 2026-08-14 16:02 CST

- Change: Corrected every packaging invocation from ambiguous `pnpm pack` to explicit `pnpm run pack`, and added regression checks across release automation and user documentation.
- Files: `.github/workflows/release.yml`, `README.md`, `README.zh.md`, `docs/development.md`, `docs/superpowers/plans/2026-08-14-dsh-desktop-standalone-implementation.md`, `tests/workflows/workflows.spec.ts`.
- Decision: Root cause category — rule violation. The project script name collides with pnpm's built-in tarball command, and the initial manual package invocation followed the ambiguous documentation without verifying artifact type. Prevention: require `pnpm run` for colliding script names, reject `pnpm pack` in executable release surfaces, and inspect the produced extension before treating a packaging command as successful.

## 2026-08-14 16:00 CST

- Change: Added source verification, static Pages deployment, scheduled upstream pull-request creation, and target-native three-platform release automation; extended packaged smoke coverage to Windows executables.
- Files: `.github/workflows/`, `scripts/smoke-packaged.ts`, `tests/workflows/`, `tests/scripts/smoke-packaged.spec.ts`, `docs/development.md`.
- Decision: Use GitHub's native macOS ARM64, Windows x64, and public-preview Windows ARM64 runners; block publication until each packaged application reaches a real Harness runtime and stops cleanly, then publish one checksum manifest.

## 2026-08-14 15:50 CST

- Change: Added the bilingual product README, architecture, development and release documentation, plus a self-contained Midnight Particle GitHub Pages site with responsive and reduced-motion behavior.
- Files: `README.md`, `README.zh.md`, `docs/architecture.md`, `docs/development.md`, `docs/releasing.md`, `site/`, `scripts/check-site.ts`, `tests/site/site.spec.ts`.
- Decision: Present Desktop as an unofficial distribution companion with explicit upstream identity; keep the site dependency-free and prohibit remote visual assets so Pages remains auditable and durable.

## 2026-08-14 15:40 CST

- Change: Replaced fatal startup dialogs with a script-free recovery page, added fresh-process retry, expanded About metadata, and separated Desktop Release checks from official Harness revision checks.
- Files: `src/main/recovery-page.ts`, `src/main/upstream-checker.ts`, `src/main/main.ts`, `src/main/main-lifecycle.ts`, `src/main/menu.ts`, `tests/main/`.
- Decision: Keep installed runtimes immutable; a Harness status check reports official source movement, while only a verified Desktop Release changes packaged code. Recovery actions remain main-process allowlisted and diagnostics are redacted before rendering or copying.

## 2026-08-14 15:34 CST

- Change: Added submodule identity checks, CI-safe upstream bootstrap, Git-derived build metadata, production-closure materialization, native packaging configuration, packaged smoke support, and real Web runtime snapshot coverage.
- Files: `scripts/`, `electron-builder.yml`, `src/main/build-metadata.ts`, `tests/scripts/`, `tests/main/desktop-runtime.snapshot.ts`, `tsconfig.scripts.json`, `package.json`.
- Decision: Deploy the official `@deepseek-ai/dsh` workspace from the pinned submodule, materialize every dependency link, and stage the CLI below `runtime/node_modules`; run the upstream install with `CI=true` because the official postinstall explicitly skips developer Git-hook configuration in CI and the submodule must not mutate the parent Git configuration.

## 2026-08-14 15:22 CST

- Change: Migrated the Electron supervisor into the independent source tree, replaced its upstream workspace import with a local bounded UTF-8 tail, and added target-specific process-tree termination requests.
- Files: `src/main/`, `tests/main/`, `tsconfig.json`, `tsconfig.base.json`, `tsdown.config.ts`.
- Decision: Keep the existing tested lifecycle interfaces while making the root build independent from all upstream TypeScript packages; packaged POSIX and Windows shutdown targets the owned tree rather than one carrier process.

## 2026-08-14 15:18 CST

- Change: Started implementation on `feat/standalone-desktop`, recorded the official Harness gitlink, and added the root toolchain, repository policy, license, notices, and stage plan.
- Files: `.gitmodules`, `upstream/deepseek-harness`, `.gitignore`, `AGENTS.md`, `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.config.ts`, `LICENSE`, `THIRD_PARTY_NOTICES.md`, `plan/00-v1-standalone-desktop-implementation.md`.
- Decision: Build a self-contained root project while treating the official submodule as read-only source input.

## 2026-08-14 15:08 CST

- Change: Added the executable standalone implementation plan covering the pinned runtime, Desktop supervisor, recovery UI, product site, automation, installer smoke, and GitHub migration.
- Files: `docs/superpowers/plans/2026-08-14-dsh-desktop-standalone-implementation.md`.
- Decision: Execute the approved design inline in independently verifiable tasks and preserve the existing fork as an archive during repository migration.

## 2026-08-14 15:00 CST

- Change: Approved the standalone repository, runtime supervision, upstream update, release, README, and GitHub Pages design.
- Files: `docs/superpowers/specs/2026-08-14-dsh-desktop-standalone-design.md`.
- Decision: Keep Desktop independently versioned and pin the official Harness repository as a Git submodule so upstream updates remain traceable and testable.
