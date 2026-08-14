# DS-Harness Desktop Standalone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, verify, document, and publish an independently versioned DS-Harness Desktop repository that packages a SHA-pinned official DeepSeek Harness runtime into macOS and Windows installers.

**Architecture:** The root repository owns an Electron supervisor and static product site. `upstream/deepseek-harness` is an official Git submodule; staging deploys the built upstream `@deepseek-ai/dsh` production closure into an immutable, symlink-free application resource before electron-builder creates a native installer. The Electron renderer loads only the loopback `dsh web` origin after readiness and uses a local recovery document for startup failure.

**Tech Stack:** TypeScript 6, Node.js 22.19+, pnpm 11.21, Electron 43, electron-builder 26, Vitest 4, tsdown, static HTML/CSS/Canvas, GitHub Actions.

## Global Constraints

- The standalone repository has a new Git root and uses `main` as its default branch.
- The official repository URL is `https://github.com/deepseek-ai/deepseek-harness.git`; the recorded Git submodule commit is the only upstream source identity used by a build.
- Desktop code never modifies the submodule worktree and never imports upstream TypeScript source.
- Installed applications do not require system Git, Node.js, or pnpm and do not run `git pull`.
- The packaged runtime is immutable, contains no symbolic links, and records both full Git commits.
- Electron keeps context isolation enabled, Node integration disabled, webviews disabled, loopback navigation allowlisted, and external URLs delegated to the operating system.
- Release signing, notarization, silent installation, Intel macOS, and automatic merging of upstream changes remain deferred.
- Windows ARM64 manual evidence cannot substitute for a Windows x64 GitHub runner.
- Desktop-owned source uses Apache-2.0 and retains third-party notices for MIT-licensed upstream material.
- No credential value may enter logs, build metadata, command arguments, release assets, or Git history.
- Commit messages use the repository's five-section `Root cause`, `Solution`, `Risks`, `Dependency`, and `Links` template.

---

### Task 1: Standalone repository and pinned upstream

**Files:**
- Create: `.gitignore`
- Create: `.gitmodules`
- Create: `AGENTS.md`
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `vitest.config.ts`
- Create: `LICENSE`
- Create: `THIRD_PARTY_NOTICES.md`
- Create: `plan/00-v1-standalone-desktop-implementation.md`
- Modify: `ROADMAP.md`
- Create gitlink: `upstream/deepseek-harness`

**Interfaces:**
- Consumes: official upstream commit reachable from the local official checkout.
- Produces: `pnpm install`, root scripts, and a clean submodule at `upstream/deepseek-harness` for every later task.

- [ ] **Step 1: Add the official Harness submodule without copying Git history**

Use the existing local clone only as the object source, check out the official remote commit, and record the public URL:

```bash
git -c protocol.file.allow=always submodule add /Users/bytedance/proj/experiment/deepseek-harness upstream/deepseek-harness
git -C upstream/deepseek-harness checkout 47f943859bef60e4160492346772ded9b24f765a
git config -f .gitmodules submodule.upstream/deepseek-harness.url https://github.com/deepseek-ai/deepseek-harness.git
git submodule sync -- upstream/deepseek-harness
```

Verify:

```bash
git submodule status -- upstream/deepseek-harness
git -C upstream/deepseek-harness status --short
git config -f .gitmodules --get submodule.upstream/deepseek-harness.url
```

Expected: the gitlink starts with one blank status marker, the worktree is clean, and the official URL is reachable through `.gitmodules`.

- [ ] **Step 2: Create the root toolchain manifests**

Define exact root scripts:

```json
{
  "scripts": {
    "build": "tsc -b && tsdown",
    "check": "pnpm run typecheck && pnpm run test && pnpm run site:check",
    "dev": "pnpm run build && electron .",
    "pack": "tsx scripts/package.ts",
    "runtime:stage": "tsx scripts/stage.ts",
    "smoke:packaged": "tsx scripts/smoke-packaged.ts",
    "site:check": "tsx scripts/check-site.ts",
    "test": "vitest run",
    "typecheck": "tsc -b --pretty false",
    "upstream:bootstrap": "tsx scripts/upstream.ts bootstrap",
    "upstream:status": "tsx scripts/upstream.ts status",
    "upstream:update": "tsx scripts/upstream.ts update"
  }
}
```

Use the exact dependency versions named in the plan header and allow install scripts only for reviewed native dependencies required by Electron and Harness.

- [ ] **Step 3: Add repository instructions, license, notices, ignores, and initial stage plan**

`AGENTS.md` must state the Desktop/upstream ownership split, protected submodule rule, test commands, release metadata requirement, and five-section commit format. `.gitignore` must exclude `node_modules`, `lib`, `dist`, coverage, `.DS_Store`, local environment files, logs, and editor output without ignoring the gitlink.

- [ ] **Step 4: Install and verify the root project**

Run:

```bash
pnpm install
pnpm exec tsc --version
pnpm exec electron --version
git diff --check
```

Expected: install succeeds, TypeScript is 6.x, Electron is 43.4.0, and whitespace validation passes.

- [ ] **Step 5: Commit the standalone foundation**

```text
[chore] Establish standalone repository

Root cause: NA
Solution: Add the root toolchain, project policy, license, and pinned
official Harness submodule.
Risks: Upstream builds remain tied to the recorded submodule commit.
Dependency: DeepSeek Harness 47f943859bef60e4160492346772ded9b24f765a
Links: https://github.com/deepseek-ai/deepseek-harness
```

### Task 2: Migrate the tested Electron supervisor without workspace imports

**Files:**
- Create: `src/main/build-metadata.ts`
- Create: `src/main/electron-runtime-child.ts`
- Create: `src/main/electron-runtime-options.ts`
- Create: `src/main/logging.ts`
- Create: `src/main/main-lifecycle.ts`
- Create: `src/main/main.ts`
- Create: `src/main/menu.ts`
- Create: `src/main/output-tail.ts`
- Create: `src/main/process-tree.ts`
- Create: `src/main/runtime-entry.ts`
- Create: `src/main/runtime-supervisor.ts`
- Create: `src/main/runtime-url.ts`
- Create: `src/main/smoke-mode.ts`
- Create: `src/main/update-checker.ts`
- Create: `src/main/window-policy.ts`
- Create: `tests/main/*.spec.ts`
- Create: `tests/main/desktop-runtime.snapshot.ts`
- Create: `tests/main/process-tree.spec.ts`
- Create: `tests/fixtures/fake-runtime-child.ts`
- Create: `tests/fixtures/desktop-runtime.expected.txt`
- Create: `tsconfig.json`
- Create: `tsdown.config.ts`

**Interfaces:**
- Consumes: Electron APIs and packaged path `resources/runtime/node_modules/@deepseek-ai/dsh/lib/bin.js`.
- Produces: `RuntimeSupervisor`, `DesktopLifecycle`, `FileDesktopLogger`, `parseDesktopBuildMetadata`, `checkForUpdates`, `desktopWindowOptions`, target-specific process-tree termination, and the bundled `lib/main.js` entry.

- [ ] **Step 1: Copy the existing behavioral tests and change imports to `src/main`**

Preserve every current Desktop test. Update only path roots and version fixtures from `0.1.0` to `0.1.1`. Run:

```bash
pnpm test
```

Expected: FAIL because `src/main` modules do not exist.

- [ ] **Step 2: Copy the supervisor modules except `output-tail.ts`**

Move the existing modules from `apps/desktop/src` to `src/main`, retain their public interfaces, and update local paths only. Do not import anything from `upstream/`.

- [ ] **Step 3: Replace upstream output retention with a zero-dependency bounded UTF-8 tail**

Implement `OutputTail` with these invariants:

```ts
export class OutputTail {
  private bytes = new Uint8Array()
  constructor(private readonly maxBytes: number) {}
  push(chunk: Uint8Array): void {}
  text(): string {}
}
```

`push` retains at most `maxBytes + 3` newest bytes so one incomplete UTF-8 prefix can be repaired. `text` drops leading continuation bytes, decodes with a fatal `TextDecoder`, and advances the start until the retained suffix is valid. It rejects non-positive or non-integer budgets. Secret-like text is intentionally unchanged because `FileDesktopLogger` owns redaction.

Run:

```bash
pnpm test -- tests/main/output-tail.spec.ts
```

Expected: all split-code-point, exact-byte-budget, invalid-budget, and unchanged-secret tests pass.

- [ ] **Step 4: Compile and run the focused supervisor suite**

Adapt the packaged child carrier so the supervisor requests graceful or forced tree termination instead of sending the same single-process signal twice. Packaged POSIX children run in their own process group and receive `SIGTERM` followed by `SIGKILL` through the negative group PID. Windows uses `taskkill /PID <pid> /T` and adds `/F` only for forced termination. Tests validate command resolution and reject undefined, non-integer, or non-positive process identifiers without invoking a host process command.

Run:

```bash
pnpm typecheck
pnpm test -- tests/main
```

Expected: TypeScript has no project references outside the root, every migrated unit test passes, and the snapshot self-skips only when the built upstream runtime is not available.

- [ ] **Step 5: Commit the self-contained supervisor**

```text
[feat] Migrate desktop supervisor

Root cause: NA
Solution: Move the tested Electron lifecycle into the standalone root
and replace its sole upstream source import with local bounded retention.
Risks: The renderer continues to depend on the upstream loopback UI.
Dependency: Electron 43.4.0
Links: NA
```

### Task 3: Build and stage a relocatable upstream runtime

**Files:**
- Create: `scripts/process.ts`
- Create: `scripts/repository.ts`
- Create: `scripts/deploy-closure.ts`
- Create: `scripts/upstream.ts`
- Create: `scripts/stage.ts`
- Create: `scripts/package.ts`
- Create: `scripts/smoke-packaged.ts`
- Create: `electron-builder.yml`
- Create: `tests/scripts/repository.spec.ts`
- Create: `tests/scripts/upstream.spec.ts`
- Create: `tests/scripts/stage.spec.ts`
- Create: `tests/scripts/package.spec.ts`
- Create: `tests/scripts/deploy-closure.spec.ts`

**Interfaces:**
- Consumes: root build output, clean submodule, and upstream workspace commands.
- Produces: `dist/stage` with Desktop files, `build-metadata.json`, and a symlink-free `node_modules` containing the upstream CLI; `dist/artifacts` contains the native installer.

- [ ] **Step 1: Write repository-state tests**

Cover exact parsing and rejection behavior:

```ts
expect(parseSubmoduleStatus(` ${'a'.repeat(40)} upstream/deepseek-harness (heads/master)`)).toEqual({ commit: 'a'.repeat(40), clean: true })
expect(() => parseSubmoduleStatus(`-${'a'.repeat(40)} upstream/deepseek-harness`)).toThrow('uninitialized')
expect(() => parseSubmoduleStatus(`+${'a'.repeat(40)} upstream/deepseek-harness`)).toThrow('does not match')
expect(() => parseSubmoduleStatus(`U${'a'.repeat(40)} upstream/deepseek-harness`)).toThrow('conflict')
```

Run `pnpm test -- tests/scripts/repository.spec.ts`; expect failure before the parser exists.

- [ ] **Step 2: Implement submodule status and command execution helpers**

Expose:

```ts
export interface SubmoduleIdentity { readonly commit: string; readonly clean: true }
export function parseSubmoduleStatus(output: string): SubmoduleIdentity
export async function requireCleanUpstream(): Promise<SubmoduleIdentity>
export async function run(command: string, args: readonly string[], options: RunOptions): Promise<void>
```

`requireCleanUpstream` checks `.gitmodules`, `git submodule status`, the nested worktree, the nested `HEAD`, and the public URL. Errors name the failing path and the corrective command.

- [ ] **Step 3: Implement explicit upstream commands**

`status` fetches no objects unless `--fetch` is supplied; it prints the recorded commit and local official remote commit when available. `bootstrap` initializes recursively, validates identity, runs `pnpm install --frozen-lockfile`, and runs the upstream build. `update` fetches the official default branch, checks out its commit in the submodule, validates, builds, stages, and runs tests; it never commits or pushes.

Unit tests inject a fake command runner and assert the exact command order. Run `pnpm test -- tests/scripts/upstream.spec.ts`.

- [ ] **Step 4: Adapt deploy-closure helpers and test destructive path guards**

Copy only the required MIT-licensed closure materialization logic. Preserve `assertSafeStaging`, `findFirstSymlink`, and package-link materialization. Add tests proving repository roots, ancestors, `../` removals, missing required peers, and remaining symlinks fail loudly.

- [ ] **Step 5: Implement staging**

The staging order is fixed:

```text
require clean submodule
read and validate Desktop version
validate development or release metadata
clear only the proven-safe dist/stage path
run upstream pnpm deploy for @deepseek-ai/dsh into dist/stage
repair required dependency closure
overlay root lib and a merged package manifest
write build-metadata.json
require dsh CLI, Web frontend, and Cordis group entry
reject any remaining symlink
```

Release mode derives `desktopCommit` from root `HEAD` and `upstreamCommit` from the gitlink. It rejects environment overrides that disagree with Git rather than trusting caller-provided SHAs. Development mode uses `development` for the Desktop commit but still records the real upstream commit.

Run:

```bash
pnpm test -- tests/scripts/stage.spec.ts tests/scripts/deploy-closure.spec.ts
pnpm runtime:stage -- --development
node dist/stage/node_modules/@deepseek-ai/dsh/lib/bin.js --help
```

Expected: tests pass, staging contains no symlink, and the built CLI prints help under plain Node.

- [ ] **Step 6: Implement native packaging and packaged smoke**

The package parser accepts exactly one host platform and host architecture. electron-builder reads only `dist/stage`, copies `build-metadata.json` and the deployed `node_modules` to `resources/runtime`, and never publishes automatically. The smoke runner starts an app with an isolated temporary home, waits for `runtime.ready` and `application.stopped`, then verifies clean exit and removes only that temporary directory.

- [ ] **Step 7: Commit runtime staging and packaging**

```text
[feat] Package pinned Harness runtime

Root cause: NA
Solution: Build the submodule and stage its production closure as a
validated, symlink-free Electron resource with dual commit metadata.
Risks: Native dependencies require packaging on each target platform.
Dependency: DeepSeek Harness gitlink
Links: https://github.com/deepseek-ai/deepseek-harness
```

### Task 4: Add recoverable startup diagnostics and build identity

**Files:**
- Create: `src/main/recovery-page.ts`
- Modify: `src/main/main.ts`
- Modify: `src/main/main-lifecycle.ts`
- Modify: `src/main/logging.ts`
- Modify: `src/main/menu.ts`
- Modify: `src/main/update-checker.ts`
- Create: `src/main/upstream-checker.ts`
- Create: `tests/main/recovery-page.spec.ts`
- Modify: `tests/main/main-lifecycle.spec.ts`
- Modify: `tests/main/logging.spec.ts`
- Modify: `tests/main/menu.spec.ts`
- Modify: `tests/main/update-checker.spec.ts`
- Create: `tests/main/upstream-checker.spec.ts`

**Interfaces:**
- Consumes: `RuntimeDiagnostics`, `DesktopBuildMetadata`, log path, updater result.
- Produces: `renderRecoveryPage(input): string`, explicit retry/open-logs/copy-redacted-diagnostics/quit command handling, and user-initiated Desktop/upstream update status.

- [ ] **Step 1: Write recovery-page security tests**

Tests assert that runtime output is HTML-escaped, known credential assignments are redacted, raw file URLs are absent, inline script is absent, and actions are represented as typed command links understood only by the main process.

- [ ] **Step 2: Implement a static recovery document and retry lifecycle**

The document contains the failure summary, bounded redacted diagnostics, and actions for retry, copy diagnostics, open logs, installation help, and quit. It uses a restrictive Content Security Policy and no remote resources. Retry creates a new `RuntimeSupervisor`; the existing non-restartable supervisor instance is never reused.

- [ ] **Step 3: Add About and Updates identity**

About displays Desktop version, Desktop commit, upstream repository, upstream commit, platform, and architecture. Desktop update checks query only stable `desktop-v<semver>` releases from the compiled repository and open an exact validated GitHub HTTPS URL after confirmation.

Add `checkUpstreamStatus(fetcher, currentCommit)` that first reads `https://api.github.com/repos/deepseek-ai/deepseek-harness`, validates `default_branch`, then reads the branch head through the GitHub commits API. It validates a full lowercase SHA and exact repository commit URL before reporting `current`, `newer`, or `unavailable`. The user initiates this network request through **Check Harness Updates…**; it never mutates the installed runtime.

- [ ] **Step 4: Run focused behavior validation**

```bash
pnpm test -- tests/main/recovery-page.spec.ts tests/main/main-lifecycle.spec.ts tests/main/logging.spec.ts tests/main/update-checker.spec.ts tests/main/upstream-checker.spec.ts
pnpm typecheck
```

- [ ] **Step 5: Commit recovery behavior**

```text
[feat] Add recoverable startup diagnostics

Root cause: NA
Solution: Render bounded redacted startup failures with retry, log,
help, and quit actions while preserving the hardened renderer policy.
Risks: Retry creates a fresh runtime process and may expose repeated
configuration failures until the user corrects them.
Dependency: NA
Links: NA
```

### Task 5: Publish product documentation and Midnight Particle Pages

**Files:**
- Create: `README.md`
- Create: `README.zh.md`
- Create: `docs/architecture.md`
- Create: `docs/development.md`
- Create: `docs/releasing.md`
- Create: `site/index.html`
- Create: `site/styles.css`
- Create: `site/particles.js`
- Create: `site/assets/dsh-mark.svg`
- Create: `site/assets/desktop-preview.svg`
- Create: `scripts/check-site.ts`
- Create: `tests/site/check-site.spec.ts`
- Modify: `ROADMAP.md`

**Interfaces:**
- Consumes: public repository coordinates, stable release naming, and build metadata fields.
- Produces: bilingual product entry points and a dependency-free static Pages artifact.

- [ ] **Step 1: Write site validation tests**

Tests parse `site/index.html` and assert one primary macOS download, one Windows download, GitHub/upstream/community links, non-official notice, reduced-motion support, no DeepSeek-hosted image/video/font asset, and no secret or localhost URL. The checker rejects missing local files and traversal outside `site/`.

- [ ] **Step 2: Write the bilingual README pair**

Both documents must contain product positioning, stable downloads, screenshots, installation steps, Gatekeeper/SmartScreen instructions that do not disable security, update semantics, data and plugin behavior, source build commands, submodule synchronization, security limitations, Apache-2.0, upstream MIT attribution, and the unofficial-project statement.

- [ ] **Step 3: Implement the static product site**

Use semantic HTML and an original DSH monogram. CSS provides near-black space, blue-gray fog, a sparse grid, a translucent Desktop preview, readable focus states, responsive layout, and a complete static fallback. `particles.js` draws sparse pointer-independent particles with Canvas 2D, pauses when hidden, stops below the performance threshold, and disables animation for `prefers-reduced-motion`.

- [ ] **Step 4: Document architecture, development, and release procedures**

Architecture owns component responsibilities and lifecycle. Development owns prerequisites, clone with submodules, local tests, upstream commands, and source run. Releasing owns target-native builds, metadata, checksums, DMG/EXE smoke evidence, unsigned warnings, and the archive migration.

- [ ] **Step 5: Verify and commit product surfaces**

```bash
pnpm site:check
pnpm test -- tests/site/check-site.spec.ts
git diff --check
```

```text
[doc] Publish desktop product surfaces

Root cause: NA
Solution: Add bilingual product documentation and an original static
Midnight Particle download site with reduced-motion support.
Risks: Download buttons depend on stable GitHub Release naming.
Dependency: GitHub Pages
Links: https://www.deepseek.com/harness/
```

### Task 6: Add CI, upstream proposals, and target-native release builds

**Files:**
- Create: `.github/workflows/verify.yml`
- Create: `.github/workflows/pages.yml`
- Create: `.github/workflows/upstream-check.yml`
- Create: `.github/workflows/release.yml`
- Create: `.github/dependabot.yml`
- Create: `.github/pull_request_template.md`
- Create: `scripts/check-release.ts`
- Create: `tests/scripts/check-release.spec.ts`
- Create: `tests/workflows/workflows.spec.ts`
- Modify: `docs/releasing.md`

**Interfaces:**
- Consumes: root scripts and `desktop-v<semver>` tags.
- Produces: reproducible verification, Pages deployment, reviewable upstream PRs, target-native installers, metadata, and checksums.

- [ ] **Step 1: Add workflow structure tests**

Parse all workflow YAML and assert pinned major action versions, recursive submodules, pnpm cache, Node 22.19+, no secret printing, least-privilege permissions, no direct upstream-check push to `main`, release tag filtering, macOS ARM64, Windows ARM64, and Windows x64 jobs.

- [ ] **Step 2: Implement verification and Pages workflows**

`verify.yml` runs root install, upstream bootstrap/build, root check, runtime stage, and staged CLI smoke. `pages.yml` runs the site checker and uploads only `site/` after a successful default-branch build.

- [ ] **Step 3: Implement upstream-check workflow**

Use a scheduled and manual trigger. Fetch the official default branch, update the submodule on `chore/upstream-<short-sha>`, run the normal checks, and create or update a pull request with old/new full SHAs. Use repository `contents: write` and `pull-requests: write` only in this workflow; never auto-merge.

- [ ] **Step 4: Implement release workflow**

Trigger only `desktop-v*` tags, require tag/version equality, build on `macos-14` ARM64 and native Windows ARM64/x64 runners where available, stage release metadata from Git rather than environment guesses, execute target-native smoke, produce SHA-256 checksums, and upload artifacts to one GitHub Release. A target with no native runner remains explicitly unsupported rather than cross-claimed.

- [ ] **Step 5: Verify and commit automation**

```bash
pnpm test -- tests/scripts/check-release.spec.ts tests/workflows
pnpm typecheck
git diff --check
```

```text
[ci] Automate desktop verification and releases

Root cause: NA
Solution: Verify the pinned runtime, publish Pages, propose upstream
updates, and build native installers with checksums in scoped workflows.
Risks: Unsigned artifacts retain operating-system reputation warnings.
Dependency: GitHub Actions
Links: NA
```

### Task 7: Build and verify the standalone macOS artifact

**Files:**
- Modify only when a real failure requires a source, test, or documentation correction.
- Generate: `dist/artifacts/DS-Harness-Desktop-0.1.1-macos-arm64.dmg`
- Generate: `dist/artifacts/SHA256SUMS.txt`

**Interfaces:**
- Consumes: all prior implementation tasks and the macOS ARM64 host.
- Produces: artifact-backed evidence that the new repository installs and launches independently.

- [ ] **Step 1: Run the narrow source checks once**

```bash
pnpm check
pnpm runtime:stage -- --development
node dist/stage/node_modules/@deepseek-ai/dsh/lib/bin.js --help
```

- [ ] **Step 2: Package the native development DMG**

```bash
pnpm pack -- --development --mac --arm64
```

Expected: one DMG named with version, platform, and architecture.

- [ ] **Step 3: Mount read-only and run the packaged smoke**

Mount the exact DMG with `hdiutil attach -readonly -nobrowse`, resolve `/Volumes/DS-Harness Desktop/DS-Harness Desktop.app`, run `pnpm smoke:packaged -- "/Volumes/DS-Harness Desktop/DS-Harness Desktop.app"`, and detach the device reported by `hdiutil`. Verify `runtime.ready`, `application.smoke.ready`, clean runtime stop, and clean application exit.

- [ ] **Step 4: Generate and verify checksums**

```bash
shasum -a 256 dist/artifacts/*.dmg
shasum -a 256 -c dist/artifacts/SHA256SUMS.txt
```

- [ ] **Step 5: Record evidence and commit only durable corrections**

Do not commit installers or temporary logs. Update `ROADMAP.md` with commands and outcomes; commit any required source correction with the five-section template and rerun only the affected validation.

### Task 8: Migrate GitHub identity and publish the independent repository

**Files:**
- Modify: repository remote configuration outside Git-tracked files.
- Modify: GitHub repository settings, description, topics, Pages, and Releases.

**Interfaces:**
- Consumes: clean verified local history and DMG evidence.
- Produces: public independent `ouyangyipeng/dsh-desktop` repository with `dsh-plugin` topic and its own Pages deployment.

- [ ] **Step 1: Run pre-push secret and ancestry checks**

```bash
git status --short
git log --oneline --decorate --graph
git merge-base --is-ancestor 47f943859bef60e4160492346772ded9b24f765a HEAD
git grep -n -I -E '(API_KEY|SECRET|TOKEN|PASSWORD)=' -- ':!pnpm-lock.yaml'
git submodule status
```

Expected: clean root history, the upstream commit is not an ancestor, no credential assignment is tracked, and the gitlink matches the packaged metadata.

- [ ] **Step 2: Rename the existing fork without deleting it**

Use `gh repo rename dsh-desktop-upstream-archive --repo ouyangyipeng/dsh-desktop`. Verify the archive remains a fork and retains `desktop-v0.1.0` and its assets.

- [ ] **Step 3: Create and push the independent repository**

Create public `ouyangyipeng/dsh-desktop` from the standalone root, push `main`, set the description, and add topics:

```text
dsh-plugin
deepseek-harness
desktop-app
electron
macos
windows
```

- [ ] **Step 4: Verify Pages and repository identity**

Confirm `isFork` is false, the default branch is `main`, `.gitmodules` uses the official URL, README renders, Actions recognizes all workflows, and the project appears under `https://github.com/topics/dsh-plugin` after topic indexing.

- [ ] **Step 5: Publish `desktop-v0.1.1` only after release checks pass**

Tag the clean release commit, allow the release workflow to build target-native artifacts, compare GitHub asset digests with `SHA256SUMS.txt`, download the macOS asset into a fresh temporary directory, repeat the read-only DMG smoke, and verify release notes show both commits. Do not delete the archive repository.

## Final verification

- [ ] `git status --short` is empty in the standalone repository.
- [ ] `git submodule status` records one clean official Harness SHA.
- [ ] `pnpm typecheck`, `pnpm test`, and `pnpm site:check` pass.
- [ ] `pnpm runtime:stage -- --development` produces no symlink.
- [ ] The staged DSH CLI prints help under plain Node.
- [ ] The macOS DMG passes the read-only mounted packaged smoke.
- [ ] Packaged metadata, README, Pages, release notes, and GitHub assets agree on the version and both commits.
- [ ] The original local Harness user changes remain unstaged and unmodified.
- [ ] The archived fork still exists and the public `dsh-desktop` repository reports `isFork: false`.
