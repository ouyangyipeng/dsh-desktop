# DS-Harness Desktop Marketplace Bundle and Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Release DS-Harness Desktop v0.2.0 with an immutable offline Marketplace bundle, three-source build identity, Chinese-first documentation, original brand assets, real application screenshots, and a pointer-reactive product site.

**Architecture:** A clean SHA-pinned Marketplace submodule is copied as a publish-file closure into the staged runtime, declared in the staged DSH dependency graph, and mounted through a Desktop-owned read-only `--patch` overlay. Electron remains a thin supervisor; the official Harness submodule and user profile remain unmodified.

**Tech Stack:** Electron 41, TypeScript 6, Node.js embedded runtime, pnpm deploy, Vitest, electron-builder, semantic HTML, CSS, Canvas 2D, GitHub Actions.

## Global Constraints

- `plugins/dsh-marketplace` points to the immutable Marketplace v0.1.1 release commit.
- Staging rejects dirty, uninitialized, mismatched, malformed, or symlink-containing Marketplace input.
- Packaged startup does not need Git, Node.js, pnpm, or network access.
- The overlay never edits the official Harness submodule or the user's profile files.
- `README.md` is Chinese; `README.en.md` is English; delete `README.zh.md` after migration.
- Logo and cover are original SVG assets; README and Pages show real application screenshots.
- All commits use `ouyangyipeng <115654921+ouyangyipeng@users.noreply.github.com>`.

---

### Task 1: Marketplace submodule identity and build metadata

**Files:**
- Modify: `.gitmodules`
- Add gitlink: `plugins/dsh-marketplace`
- Modify: `scripts/repository.ts`
- Modify: `src/main/build-metadata.ts`
- Modify: `tests/scripts/repository.spec.ts`
- Modify: `tests/main/build-metadata.spec.ts`
- Modify: `tests/scripts/stage.spec.ts`

**Interfaces:**
- Produces: `MARKETPLACE_ROOT`, `MARKETPLACE_REPOSITORY`, and `requireCleanMarketplace(): Promise<{ commit; version }>`.
- Produces: `DesktopBuildMetadata` schema version 2 with `marketplaceRepository`, `marketplaceCommit`, and `marketplaceVersion`.
- Produces: `DesktopGitIdentity.marketplaceCommit` and `DesktopStageIdentity.marketplaceVersion`.

- [ ] **Step 1: Write failing repository identity tests**

Cover uninitialized gitlink, dirty worktree, recorded/actual SHA mismatch, wrong origin URL, invalid package name/version, and valid exact state.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm exec vitest run --config config/vitest.config.ts tests/scripts/repository.spec.ts`
Expected: FAIL because Marketplace identity helpers do not exist.

- [ ] **Step 3: Implement Marketplace repository validation**

Follow the existing upstream validation pattern without generalizing both into a speculative framework. Read the Marketplace manifest as untrusted JSON and require `name === 'dsh-marketplace'` plus a non-empty semantic package version.

- [ ] **Step 4: Write failing metadata schema tests**

```ts
expect(parseDesktopBuildMetadata(value)).toMatchObject({
  schemaVersion: 2,
  marketplaceRepository: 'https://github.com/ouyangyipeng/dsh-marketplace.git',
  marketplaceCommit: 'c'.repeat(40),
  marketplaceVersion: '0.1.1',
})
```

Reject schema 1, development Marketplace SHA in release metadata, wrong repository, and missing version.

- [ ] **Step 5: Run metadata tests and verify RED**

Run: `pnpm exec vitest run --config config/vitest.config.ts tests/main/build-metadata.spec.ts tests/scripts/stage.spec.ts`
Expected: FAIL because schema 2 fields do not exist.

- [ ] **Step 6: Implement schema 2 and development identity**

Record all three source identities and validate them at the JSON read boundary. Development metadata uses `marketplaceCommit: 'development'` only when `desktopCommit` is also development.

- [ ] **Step 7: Run Task 1 tests and verify GREEN**

Run: `pnpm exec vitest run --config config/vitest.config.ts tests/scripts/repository.spec.ts tests/main/build-metadata.spec.ts tests/scripts/stage.spec.ts`
Expected: PASS.

- [ ] **Step 8: Commit Task 1**

Commit subject: `[feat] Track bundled Marketplace identity`

### Task 2: Offline Marketplace stage and immutable overlay

**Files:**
- Create: `config/dsh-desktop.patch.yml`
- Create: `scripts/marketplace.ts`
- Create: `tests/scripts/marketplace.spec.ts`
- Modify: `scripts/stage.ts`
- Modify: `tests/scripts/stage.spec.ts`
- Modify: `config/electron-builder.yml`
- Modify: `tests/workflows/workflows.spec.ts`
- Modify: `docs/architecture.md`

**Interfaces:**
- Produces: `inspectMarketplacePackage(root): MarketplacePackageIdentity`.
- Produces: `copyMarketplacePackage(source, target): Promise<void>` using an explicit publish-file allowlist.
- Produces: stage files `node_modules/dsh-marketplace/**` and `dsh-desktop.patch.yml`.
- Produces: staged DSH and Desktop manifests with exact `dsh-marketplace: 0.1.1` dependencies.

- [ ] **Step 1: Write failing publish-closure tests**

Test allowed runtime files, excluded `.git`/tests/site/node_modules, required Host/Client/patch files, path containment, and first symlink rejection.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm exec vitest run --config config/vitest.config.ts tests/scripts/marketplace.spec.ts`
Expected: FAIL because `scripts/marketplace.ts` does not exist.

- [ ] **Step 3: Implement the smallest publish closure copier**

Read `package.json#files`, expand only the known committed runtime paths, copy with `dereference: false`, validate every destination, and reject any symlink before stage completion.

- [ ] **Step 4: Write failing stage and overlay assertions**

Assert the overlay inserts exactly one `dsh-marketplace` row, configures `bundledRepositories: ['ouyangyipeng/dsh-marketplace']`, and both staged manifests declare the exact Marketplace version.

- [ ] **Step 5: Run and verify RED**

Run: `pnpm exec vitest run --config config/vitest.config.ts tests/scripts/stage.spec.ts tests/workflows/workflows.spec.ts`
Expected: FAIL because stage has no Marketplace files or overlay.

- [ ] **Step 6: Integrate Marketplace into stage**

Validate both submodules before deletion of old stage, copy the Marketplace closure, patch only the staged `@deepseek-ai/dsh/package.json`, copy the overlay beside build metadata, and extend postconditions and build metadata.

- [ ] **Step 7: Run and verify GREEN**

Run: `pnpm exec vitest run --config config/vitest.config.ts tests/scripts/marketplace.spec.ts tests/scripts/stage.spec.ts tests/workflows/workflows.spec.ts`
Expected: PASS.

- [ ] **Step 8: Commit Task 2**

Commit subject: `[feat] Bundle Marketplace offline`

### Task 3: Supervisor patch launch and packaged identity

**Files:**
- Modify: `src/main/runtime-supervisor.ts`
- Modify: `src/main/electron-runtime-options.ts`
- Modify: `src/main/main.ts`
- Modify: `src/main/menu.ts`
- Modify: `tests/main/runtime-supervisor.spec.ts`
- Modify: `tests/main/electron-runtime-options.spec.ts`
- Modify: `tests/main/menu.spec.ts`
- Modify: `tests/main/desktop-runtime.snapshot.ts`
- Modify: `tests/main/fixtures/desktop-runtime.expected.txt`
- Modify: `scripts/smoke-packaged.ts`
- Modify: `tests/scripts/smoke-packaged.spec.ts`

**Interfaces:**
- Produces: `RuntimeSupervisorOptions.patchPath: string`.
- Produces launch args: `['web', '--patch', patchPath, '--host', '127.0.0.1', '--port', '0']`.
- Produces About details for Marketplace version and short commit.

- [ ] **Step 1: Write failing supervisor argument tests**

Assert exact argument order, absolute patch path, immutable caller copy, and missing/relative path rejection in runtime option resolution.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm exec vitest run --config config/vitest.config.ts tests/main/runtime-supervisor.spec.ts tests/main/electron-runtime-options.spec.ts`
Expected: FAIL because the supervisor still uses fixed args without a patch.

- [ ] **Step 3: Implement explicit patch path flow**

Resolve packaged path from `process.resourcesPath/runtime/dsh-desktop.patch.yml` and development path from the repository `config/` directory. Keep host and port fixed inside the supervisor.

- [ ] **Step 4: Update snapshots and packaged smoke expectations test-first**

Assert assembled config contains one `# == dsh-marketplace` section, bootstrap reports the bundled repository, client bundle returns 200, and About text records Marketplace identity.

- [ ] **Step 5: Run and verify RED, then implement smoke probes**

Run: `pnpm exec vitest run --config config/vitest.config.ts tests/main/desktop-runtime.snapshot.ts tests/scripts/smoke-packaged.spec.ts tests/main/menu.spec.ts`
Expected: fail before smoke implementation; pass after adding the probes and visible metadata.

- [ ] **Step 6: Run Task 3 tests and verify GREEN**

Run: `pnpm exec vitest run --config config/vitest.config.ts tests/main/runtime-supervisor.spec.ts tests/main/electron-runtime-options.spec.ts tests/main/menu.spec.ts tests/scripts/smoke-packaged.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit Task 3**

Commit subject: `[feat] Mount Marketplace at launch`

### Task 4: Chinese-first README, original brand, and real screenshots

**Files:**
- Create: `assets/brand/desktop-logo.svg`
- Create: `assets/brand/desktop-cover.svg`
- Create: `assets/brand/desktop-cover.png`
- Create: `assets/icons/icon.icns`
- Create: `assets/icons/icon.ico`
- Create: `assets/screenshots/desktop-marketplace.png`
- Create: `assets/screenshots/desktop-marketplace.webp`
- Create: `README.en.md`
- Modify: `README.md`
- Delete: `README.zh.md`
- Modify: `config/electron-builder.yml`
- Modify: `ROADMAP.md`

**Interfaces:**
- Produces stable asset paths consumed by README, Pages, Electron, DMG, and EXE.

- [ ] **Step 1: Add failing documentation and packaging assertions**

Extend package/workflow tests to require Chinese `README.md`, English switch, Marketplace links, real screenshot path, 1280 × 640 cover, and platform icon paths.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm exec vitest run --config config/vitest.config.ts tests/workflows/workflows.spec.ts tests/site/site.spec.ts`
Expected: FAIL because the new language and asset layout does not exist.

- [ ] **Step 3: Build the Desktop brand assets**

Create the window/forward-cut 24 × 24 mark and a 1280 × 640 cover using the same line system as Marketplace but a distinct silhouette. Export PNG/ICNS/ICO deterministically and verify small-size legibility.

- [ ] **Step 4: Capture a real packaged macOS screenshot**

Launch the current packaged application with isolated smoke data, open Settings → Marketplace, ensure no user paths or credentials are visible, and save Retina PNG plus WebP. Place the real capture into the cover composition.

- [ ] **Step 5: Rewrite README pair**

Make `README.md` Chinese-first and `README.en.md` English. Lead with cover, language switch, website/download/Marketplace/security/development navigation, then real screenshot. Preserve unsigned-install steps, upstream ownership, immutable release update model, security policy, build commands, and unofficial notice.

- [ ] **Step 6: Run and verify GREEN**

Run: `pnpm exec vitest run --config config/vitest.config.ts tests/workflows/workflows.spec.ts tests/site/site.spec.ts && git diff --check`
Expected: PASS.

- [ ] **Step 7: Commit Task 4**

Commit subject: `[doc] Redesign Desktop entry point`

### Task 5: Pointer-reactive Desktop site

**Files:**
- Modify: `site/index.html`
- Create: `site/en/index.html`
- Modify: `site/styles.css`
- Modify: `site/particles.js`
- Replace: `site/assets/dsh-mark.svg`
- Replace: `site/assets/desktop-preview.svg` with `site/assets/desktop-marketplace.webp`
- Modify: `scripts/check-site.ts`
- Modify: `tests/site/site.spec.ts`

**Interfaces:**
- Produces: `window.__dshDesktopMotionDebug` read-only pointer/wake counters for acceptance.
- Consumes: repository-local Logo, cover, and real screenshot only.

- [ ] **Step 1: Write failing site tests for the requested gap**

Assert Chinese default language, English link, Marketplace section, real screenshot, `pointermove` and pointer velocity tracking, wake particle creation, neighbor lines, reduced-motion fallback, visibility pause, DPR cap, and local-only assets.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm exec vitest run --config config/vitest.config.ts tests/site/site.spec.ts`
Expected: FAIL because the current particle field only auto-drifts.

- [ ] **Step 3: Implement the upgraded site composition**

Use the official-site-inspired near-black/blue atmosphere with an original asymmetrical layout. Add default Marketplace, real application preview, three-source identity, runtime flow, releases, security, and download sections.

- [ ] **Step 4: Implement real pointer-driven particles**

Track pointer position/velocity, apply a bounded local field, spawn a capped wake, draw proximity connections, decay energy, cap DPR at 1.75, pause when hidden, and use a static frame for reduced motion or touch-only input.

- [ ] **Step 5: Run static and browser acceptance**

Run: `pnpm site:check && pnpm exec vitest run --config config/vitest.config.ts tests/site/site.spec.ts`
Expected: PASS. Inspect 1440 × 900, 390 × 844, keyboard focus, reduced motion, pointer wake, and no-JavaScript reading order.

- [ ] **Step 6: Commit Task 5**

Commit subject: `[feat] Upgrade Desktop product site`

### Task 6: v0.2.0 installer verification and publication

**Files:**
- Modify: `package.json`
- Modify: `ROADMAP.md`
- Modify: `docs/releasing.md`
- Create: release tag `desktop-v0.2.0`

**Interfaces:**
- Produces macOS ARM64 DMG and Windows ARM64/x64 EXE assets whose metadata contains all three pinned commits.

- [ ] **Step 1: Set version 0.2.0 and bootstrap exact submodules**

Run: `pnpm upstream:bootstrap` and the Marketplace identity check.
Expected: both submodules are clean and exactly recorded.

- [ ] **Step 2: Run source and assembled verification**

Run: `pnpm build && pnpm typecheck && pnpm runtime:stage -- --development && pnpm test && pnpm site:check`
Expected: PASS; assembled snapshot proves Marketplace Host and Client paths.

- [ ] **Step 3: Build and smoke the macOS DMG**

Run: `pnpm run pack -- --development --mac --arm64` followed by the packaged smoke command.
Expected: mounted DMG launches, Marketplace bootstrap/client respond, real window is visible, clean quit leaves no owned process.

- [ ] **Step 4: Commit release state**

Commit subject: `[milestone] Release Desktop v0.2.0`

- [ ] **Step 5: Push branch, open and rebase the pull request, then publish after checks**

Push `feat/marketplace-bundle-branding`, open a PR to `main`, run required checks, rebase on current `main`, and do not create a merge commit. After `main` contains the reviewed commits, tag `desktop-v0.2.0`; release workflow must produce and smoke macOS ARM64, Windows x64, and Windows ARM64 before assets publish.

- [ ] **Step 6: Publish Pages and repository metadata**

Verify both Pages URLs, set repository homepages, preserve `dsh-plugin` topics, upload each 1280 × 640 cover as the GitHub social preview when the UI permits, and confirm README renders Chinese by default with an English link.
