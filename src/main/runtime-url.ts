const READY_LINE_PATTERN = /^dsh web: (http:\/\/127\.0\.0\.1:([1-9]\d{0,4}))$/u

/**
 * Parse one complete line emitted by the owned `dsh web` child.
 * @param line - decoded stdout line without its line terminator.
 * @returns The validated runtime origin, or undefined for any other output.
 */
export function parseRuntimeReadyLine(line: string): URL | undefined {
  const match = READY_LINE_PATTERN.exec(line)
  const rawUrl = match?.[1]
  const rawPort = match?.[2]
  if (rawUrl === undefined || rawPort === undefined || String(Number(rawPort)) !== rawPort) return undefined

  try {
    return assertRuntimeOrigin(new URL(rawUrl))
  } catch {
    return undefined
  }
}

/**
 * Require an uncredentialed HTTP root origin on the IPv4 loopback address.
 * @param value - URL proposed as the renderer's runtime origin.
 * @returns The same URL after validation.
 */
export function assertRuntimeOrigin(value: URL): URL {
  const port = Number(value.port)
  if (value.protocol !== 'http:'
    || value.hostname !== '127.0.0.1'
    || value.username !== ''
    || value.password !== ''
    || value.port === ''
    || !Number.isInteger(port)
    || port <= 0
    || port > 65_535
    || value.pathname !== '/'
    || value.search !== ''
    || value.hash !== '') {
    throw new Error('desktop runtime URL is not an owned loopback origin')
  }
  return value
}
