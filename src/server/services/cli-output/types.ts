/**
 * Unified streaming presenter for agent CLIs: NDJSON / JSONL → terminal-friendly text.
 */

export type TerminalEmit = (chunk: string) => void;

export interface CliStreamPresenterHandle {
  onChunk: (chunk: string) => void;
  /** Prefer accumulated pretty output; fall back to raw stdout if empty. */
  finish: (rawStdout: string) => string;
}
