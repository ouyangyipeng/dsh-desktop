# DS-Harness Desktop contributor instructions

DS-Harness Desktop is an independent Electron launcher and runtime supervisor for DeepSeek Harness. Read [the architecture](docs/architecture.md) before changing runtime startup, packaging, update behavior, or the Electron security policy.

## Ownership

- Root files own the Desktop application, native installers, product site, and GitHub automation.
- `upstream/deepseek-harness/` is a SHA-pinned Git submodule of the official repository. Never edit, commit from, or apply Desktop patches inside it.
- Agent, loop, LLM, plugin, session, configuration, and Web UI behavior remain upstream responsibilities.
- Installed applications run a staged immutable runtime and never require Git, Node.js, pnpm, or a source checkout.

## Commands

```sh
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm site:check
pnpm upstream:status
pnpm upstream:bootstrap
pnpm runtime:stage -- --development
pnpm run pack -- --development --mac --arm64
```

Run the narrow checks that prove the changed behavior. Installer claims require a target-native packaged smoke; Windows ARM64 evidence does not prove Windows x64 behavior.

## Source and security rules

- TypeScript is strict ESM and uses explicit `.ts` relative imports.
- Add or update tests before changing behavior. Errors name the failed resource and corrective action; never swallow a runtime, staging, or update failure.
- Electron keeps context isolation enabled and Node integration, webviews, arbitrary navigation, downloads, and unsolicited permissions disabled.
- Runtime logs are bounded and credential-redacted before display or export. Never put keys or tokens in source, metadata, commands, fixtures, release assets, or Git history.
- A release records the full Desktop and upstream commits. Staging rejects dirty, uninitialized, mismatched, or unexpected submodule state and any remaining symbolic link.
- Do not disable Gatekeeper, SmartScreen, CORS, CSRF, or operating-system protections to make a build pass.

## Git and documentation

Use feature branches and rebase rather than merge. Keep the independent root history separate from the submodule history. Update README, architecture, release instructions, and visible strings with their behavior.

Commit messages use this format:

```text
[feat/bug/doc/style/refactor/revert/milestone/chore/ci] Do sth

Root cause: NA
Solution: NA
Risks: NA
Dependency: NA
Links: NA
```
