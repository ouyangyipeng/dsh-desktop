# Standalone Desktop implementation

## Goal

Produce an independently versioned DS-Harness Desktop repository and verified macOS installer while preserving official DeepSeek Harness as a pinned Git submodule.

## Preconditions

- The approved design is recorded in `docs/superpowers/specs/2026-08-14-dsh-desktop-standalone-design.md`.
- The executable plan is recorded in `docs/superpowers/plans/2026-08-14-dsh-desktop-standalone-implementation.md`.
- The official source commit is `47f943859bef60e4160492346772ded9b24f765a`.
- The existing public fork remains recoverable throughout migration.

## Steps

1. Establish the root toolchain and official submodule.
2. Migrate and isolate the tested Electron supervisor.
3. Build and stage a relocatable upstream runtime.
4. Add recoverable startup and update behavior.
5. Publish the bilingual README and Midnight Particle site.
6. Add verification, Pages, upstream-check, and release workflows.
7. Build and smoke-test the read-only mounted macOS DMG.
8. Move the verified independent history to GitHub and preserve the fork as an archive.

## Acceptance criteria

- The root repository has no official Harness ancestry.
- A clean recursive clone builds without system-wide runtime dependencies.
- Staging rejects upstream drift and symbolic links.
- The packaged app reaches `dsh web`, reports both commits, and stops its process tree.
- README, Pages, release assets, and checksums are consistent.

## Risks

- Unsigned macOS and Windows artifacts retain platform trust warnings.
- Upstream source changes may require a Desktop compatibility patch before release.
- Windows targets require native runner evidence and cannot be inferred from macOS or a different Windows architecture.
