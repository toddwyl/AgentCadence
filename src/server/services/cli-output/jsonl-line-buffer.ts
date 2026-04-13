/**
 * Split arbitrary PTY chunks into complete newline-terminated lines.
 */
export class JsonlLineBuffer {
  private buf = '';

  push(raw: string, onLine: (line: string) => void): void {
    this.buf += raw;
    const parts = this.buf.split('\n');
    this.buf = parts.pop() ?? '';
    for (const line of parts) {
      onLine(line);
    }
  }

  flush(onLine: (line: string) => void): void {
    const rest = this.buf;
    this.buf = '';
    const t = rest.trimEnd();
    if (t) onLine(t);
  }
}
