# Architecture

DS-Harness Desktop owns distribution and application lifecycle; the official DeepSeek Harness submodule owns agent and Web runtime behavior. This separation lets Desktop follow upstream by changing one reviewed gitlink instead of maintaining a product fork.

## Runtime sequence

```text
Desktop main process
  ├─ resolves isolated DSH_HOME
  ├─ starts embedded @deepseek-ai/dsh CLI
  │    └─ dsh web --host 127.0.0.1 --port 0
  ├─ validates the announced loopback URL
  ├─ probes the exact HTTP root
  └─ creates a sandboxed BrowserWindow for that origin
```

`RuntimeSupervisor` owns exactly one child lifetime. Startup has one deadline covering the readiness line and HTTP probe. Output is retained in bounded UTF-8 tails. A normal application quit first requests graceful termination, waits for the configured deadline, and then requests forced process-tree termination if the child is still alive. Startup failures and unexpected exits transition to a local recovery document; Retry relaunches the whole application so a failed supervisor is never reused.

The packaged app uses Electron's executable in Node mode to launch the staged CLI. On POSIX systems the child has an owned process group, so termination addresses the process tree with `SIGTERM` before `SIGKILL`. Windows has no equivalent graceful signal for an owned process tree, so each bounded shutdown request uses `taskkill.exe /PID … /T /F`; the PID remains restricted to the child started by Desktop.

## Source and artifact planes

`upstream/deepseek-harness` is a read-only Git submodule whose URL must match the official public repository. Repository checks require the gitlink and nested worktree to be exact and clean.

Staging performs these steps:

1. Build Desktop TypeScript into `lib/`.
2. Require a clean official submodule and read both Git commit identities.
3. Ask pnpm to deploy the production closure of official `@deepseek-ai/dsh`.
4. Materialize workspace and package links into a link-free `dist/stage/node_modules` tree.
5. Add the Desktop bundle and validated `build-metadata.json`.
6. Let electron-builder rebuild native modules and create a target-native installer.

The installer does not contain the upstream `.git` directory or source checkout. It contains the built runtime closure needed by the official CLI. `build-metadata.json` connects that artifact back to the independent Desktop commit and pinned upstream commit.

## Browser security

The Harness page is local application content but is still treated as renderer content:

- `contextIsolation`, `sandbox`, and `webSecurity` are enabled;
- `nodeIntegration` and `webviewTag` are disabled;
- navigation to the exact probed origin is allowed;
- HTTPS navigation outside that origin is opened by the system browser;
- other protocols, credentials in URLs, popups, WebViews, downloads, and permission requests are denied.

The recovery page is a script-free `data:` document with a restrictive Content Security Policy. Its links use a private action protocol, and the main process accepts only a fixed action allowlist. Diagnostics are bounded in the supervisor and redacted before the page or clipboard receives them.

## Update model

There are three independent identities:

- Desktop semantic version, such as `0.1.1`;
- Desktop source commit;
- official Harness source commit.

Desktop release checks query the configured GitHub release repository. Harness revision checks query only `deepseek-ai/deepseek-harness`, validate its reported default branch and commit, and open only an exact official commit URL. Neither check mutates the installed runtime.

`pnpm upstream:update` is a maintainer operation. It fetches the official default branch, updates the detached submodule gitlink, then builds, tests, and stages the resulting pair. Automation may propose that gitlink change as a pull request, but release publication remains a separate verified action.

## Why Desktop is not a Harness plugin

Harness product capabilities belong in Harness plugins. Desktop must also operate before plugin loading and after runtime failure: it owns installer construction, native application lifecycle, child-process termination, renderer policy, recovery, and release identity. Putting those responsibilities in an in-process plugin would remove the independent supervisor exactly when startup is broken. The shell therefore integrates through the official CLI and Web interface while leaving Harness's internal plugin system intact.
