/** Bounded UTF-8 tail for runtime diagnostics. */
export class OutputTail {
  private bytes = new Uint8Array()

  /** @param maxBytes Positive integer byte budget for retained text. */
  constructor(private readonly maxBytes: number) {
    if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
      throw new Error('maxBytes must be a positive integer')
    }
  }

  /** @param chunk Raw stdout or stderr bytes appended to the retained tail. */
  push(chunk: Uint8Array): void {
    const combined = new Uint8Array(this.bytes.length + chunk.length)
    combined.set(this.bytes)
    combined.set(chunk, this.bytes.length)
    const retainedBytes = this.maxBytes + 3
    this.bytes = combined.length <= retainedBytes ? combined : combined.slice(combined.length - retainedBytes)
  }

  /** @returns The newest complete UTF-8 text within the configured byte budget. */
  text(): string {
    let start = Math.max(0, this.bytes.length - this.maxBytes)
    while (start < this.bytes.length && isContinuationByte(this.bytes[start] as number)) start++
    const end = completeUtf8End(this.bytes, start)
    return new TextDecoder().decode(this.bytes.subarray(start, end))
  }
}

function isContinuationByte(byte: number): boolean {
  return (byte & 0xc0) === 0x80
}

function completeUtf8End(bytes: Uint8Array, start: number): number {
  if (bytes.length <= start) return start
  let lead = bytes.length - 1
  while (lead >= start && isContinuationByte(bytes[lead] as number)) lead--
  if (lead < start) return start
  const expected = utf8SequenceLength(bytes[lead] as number)
  if (expected === 1) return bytes.length
  return bytes.length - lead < expected ? lead : bytes.length
}

function utf8SequenceLength(byte: number): number {
  if ((byte & 0x80) === 0) return 1
  if ((byte & 0xe0) === 0xc0) return 2
  if ((byte & 0xf0) === 0xe0) return 3
  if ((byte & 0xf8) === 0xf0) return 4
  return 1
}
