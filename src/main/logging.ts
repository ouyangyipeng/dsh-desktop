import { appendFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const MAX_LOG_VALUE_CODE_POINTS = 4_096
const SECRET_ASSIGNMENT_PATTERN = /\b([A-Z0-9_]*(?:API_KEY|TOKEN|PASSWORD|SECRET))=[^\s]+/giu
const BEARER_PATTERN = /\bBearer\s+[^\s]+/giu
const URL_CREDENTIALS_PATTERN = /\b(https?:\/\/)[^\s/@]+:[^\s/@]+@/giu

/** Primitive values accepted by the structured desktop logger. */
export type DesktopLogFields = Readonly<Record<string, string | number | boolean | undefined>>

/** Application logger lifecycle consumed by the desktop orchestrator. */
export interface DesktopLogger {
  /** Prepare the parent directory and log file. */
  initialize(): Promise<void>
  /** Queue one sanitized structured line. */
  record(event: string, fields?: DesktopLogFields): void
  /** Wait until every queued line reaches the file. */
  flush(): Promise<void>
}

/** Ordered append-only logger for application-owned desktop diagnostics. */
export class FileDesktopLogger implements DesktopLogger {
  private writes: Promise<void> = Promise.resolve()

  /**
   * @param path Absolute application-owned log file path.
   * @param now Clock used to timestamp entries.
   */
  constructor(
    private readonly path: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Prepare the parent directory and create the file when absent. */
  async initialize(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    await appendFile(this.path, '', 'utf8')
  }

  /**
   * Queue one sanitized structured line.
   * @param event Stable application lifecycle event name.
   * @param fields Primitive diagnostic values; undefined fields are omitted.
   */
  record(event: string, fields: DesktopLogFields = {}): void {
    const values = Object.entries(fields)
      .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
      .map(([key, value]) => `${key}=${sanitizeLogValue(String(value))}`)
    const line = `${this.now().toISOString()} ${sanitizeLogValue(event)}${values.length === 0 ? '' : ` ${values.join(' ')}`}\n`
    this.writes = this.writes.then(async () => appendFile(this.path, line, 'utf8'))
  }

  /** Wait for all entries queued before this call. */
  async flush(): Promise<void> {
    await this.writes
  }
}

/**
 * Remove common credential forms before diagnostics cross into a file or dialog.
 * @param value - Potentially sensitive diagnostic text.
 * @returns Redacted text with URL authority preserved but credentials removed.
 */
export function redactLogText(value: string): string {
  return value
    .replace(SECRET_ASSIGNMENT_PATTERN, '$1=[REDACTED]')
    .replace(BEARER_PATTERN, 'Bearer [REDACTED]')
    .replace(URL_CREDENTIALS_PATTERN, '$1[REDACTED]@')
}

function sanitizeLogValue(value: string): string {
  const singleLine = redactLogText(value).replace(/[\r\n\t]+/gu, ' ').trim()
  return Array.from(singleLine).slice(0, MAX_LOG_VALUE_CODE_POINTS).join('')
}
