# Roadmap

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
