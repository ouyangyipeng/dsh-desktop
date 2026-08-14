# Releasing

Releases package a fixed pair of source identities: one `dsh-desktop` commit and one official `deepseek-harness` submodule commit. An update check may propose source movement, but no installed application changes until a new Desktop release is built and published.

## Release prerequisites

- The worktree and submodule are clean.
- The submodule URL and gitlink pass repository validation.
- `package.json` contains the intended Desktop version.
- The release tag is `desktop-v<version>` and points to the commit being packaged.
- `DSH_DESKTOP_RELEASE_REPOSITORY` is `ouyangyipeng/dsh-desktop` for public builds.
- CI checks for the same commit are successful.

Run the relevant local checks once before pushing. The baseline release set is:

```bash
pnpm typecheck
pnpm test
pnpm site:check
pnpm build
pnpm runtime:stage -- --development
```

The development stage is a keyless assembly check. Release jobs create release metadata from Git and must not accept commit overrides.

## Target-native matrix

Create each artifact on a runner whose operating system and CPU architecture match the requested installer:

- macOS ARM64 → `DS-Harness-Desktop-<version>-macos-arm64.dmg`
- Windows x64 → `DS-Harness-Desktop-<version>-windows-x64.exe`
- Windows ARM64 → `DS-Harness-Desktop-<version>-windows-arm64.exe`, only when a native ARM64 runner is available

Do not label a cross-built or emulated artifact as target-native. If one matrix target is unavailable, publish the verified targets and state the omitted architecture in the release notes.

## Artifact verification

For every installer:

1. Inspect the expanded application or installer contents.
2. Confirm `build-metadata.json` records the release version, full Desktop commit, official upstream repository, full upstream commit, timestamp, platform, architecture, and release repository.
3. Confirm the staged runtime has no symbolic links and contains the DSH CLI, Cordis group plugin, and Harness Web frontend.
4. Run the packaged smoke on the target operating system.
5. Generate SHA-256 values and publish one `SHA256SUMS` file with the release.

Early releases are intentionally unsigned. Release notes must say that plainly and link to installation guidance. Never suggest disabling operating-system security controls. Signing and notarization can be added later without changing the runtime or update model.

## Publication order

1. Merge or fast-forward the verified release commit to the default branch.
2. Push the source commit and wait for verification and Pages workflows.
3. Create and push `desktop-v<version>`.
4. Let target-native release jobs build and smoke their artifacts.
5. Verify checksums and Git-derived metadata before publishing the GitHub Release.
6. Confirm the product site's latest-release links resolve to the new release.

The scheduled upstream workflow may open a pull request containing only the submodule gitlink and release notes for the upstream revision. It must never auto-merge or auto-publish a Desktop release.
