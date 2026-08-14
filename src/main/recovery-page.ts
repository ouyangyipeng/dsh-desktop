import { redactLogText } from './logging.ts'

/** Actions accepted from the static recovery document. */
export type RecoveryAction = 'retry' | 'copy-diagnostics' | 'open-logs' | 'help' | 'quit'

/** Values rendered into one local recovery document. */
export interface RecoveryPageInput {
  readonly title: string
  readonly message: string
  readonly diagnostics: string
  readonly version: string
  readonly upstreamCommit: string
}

const ACTIONS: ReadonlySet<string> = new Set(['retry', 'copy-diagnostics', 'open-logs', 'help', 'quit'])

/**
 * Parse one main-process action URL without accepting paths or parameters.
 * @param value Untrusted renderer navigation target.
 * @returns The allowlisted action, or undefined.
 */
export function parseRecoveryAction(value: string): RecoveryAction | undefined {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return undefined
  }
  if (url.protocol !== 'dsh-desktop-action:' || url.search !== '' || url.hash !== '') return undefined
  const action = url.pathname
  return ACTIONS.has(action) ? action as RecoveryAction : undefined
}

/**
 * Render a script-free local recovery page with redacted diagnostics.
 * @param input Failure copy, bounded diagnostics, and build identity.
 * @returns A complete HTML document safe to load from a data URL.
 */
export function renderRecoveryPage(input: RecoveryPageInput): string {
  const diagnostics = escapeHtml(redactLogText(input.diagnostics))
  const title = escapeHtml(input.title)
  const message = escapeHtml(input.message)
  const version = escapeHtml(input.version)
  const upstream = escapeHtml(input.upstreamCommit.slice(0, 12))
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${title}</title>
<style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:28px;color:#edf5ff;background:radial-gradient(circle at 20% 20%,#163254 0,transparent 34%),#080b10}.card{width:min(780px,100%);padding:34px;border:1px solid #29435f;border-radius:20px;background:rgba(14,20,29,.94);box-shadow:0 30px 90px #0009}.eyebrow{color:#82b9ef;font-size:12px;letter-spacing:.14em;text-transform:uppercase}h1{margin:10px 0 8px;font-size:34px;font-weight:600}p{color:#aebdce;line-height:1.6}.actions{display:flex;flex-wrap:wrap;gap:10px;margin:24px 0}.button{display:inline-block;padding:10px 15px;border:1px solid #385878;border-radius:10px;color:#dcecff;text-decoration:none;background:#162638}.button.primary{color:#07101a;background:#e7f3ff;border-color:#e7f3ff}pre{max-height:260px;overflow:auto;margin:20px 0 0;padding:16px;border-radius:12px;color:#b8c9dc;background:#070a0e;white-space:pre-wrap;word-break:break-word}.meta{color:#71839a;font:12px ui-monospace,SFMono-Regular,Menlo,monospace}
</style>
</head>
<body><main class="card"><div class="eyebrow">runtime recovery</div><h1>${title}</h1><p>${message}</p><div class="actions"><a class="button primary" href="dsh-desktop-action:retry">Retry</a><a class="button" href="dsh-desktop-action:copy-diagnostics">Copy diagnostics</a><a class="button" href="dsh-desktop-action:open-logs">Open logs</a><a class="button" href="dsh-desktop-action:help">Installation help</a><a class="button" href="dsh-desktop-action:quit">Quit</a></div><div class="meta">Desktop ${version} · Harness ${upstream}</div><pre>${diagnostics}</pre></main></body>
</html>`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] as string)
}
