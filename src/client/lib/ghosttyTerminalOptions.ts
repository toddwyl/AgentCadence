import type { Ghostty, ITerminalOptions, ITheme } from 'ghostty-web';

/** GitHub-dark style palette aligned with previous xterm theme */
const executionTheme: ITheme = {
  background: '#0d1117',
  foreground: '#c9d1d9',
  cursor: '#c9d1d9',
  cursorAccent: '#0d1117',
  selectionBackground: '#264f78',
  black: '#0d1117',
  red: '#ff7b72',
  green: '#7ee787',
  yellow: '#d29922',
  blue: '#58a6ff',
  magenta: '#bc8cff',
  cyan: '#39c5cf',
  white: '#c9d1d9',
  brightBlack: '#484f58',
  brightRed: '#ffa198',
  brightGreen: '#56d364',
  brightYellow: '#e3b341',
  brightBlue: '#79c0ff',
  brightMagenta: '#d2a8ff',
  brightCyan: '#56d4dd',
  brightWhite: '#f0f6fc',
};

/**
 * Options for the execution monitor terminal (read-only PTY mirror).
 * Mirrors OpenChamber’s getGhosttyTerminalOptions shape: Ghostty WASM instance + theme + FitAddon sizing.
 */
export function getExecutionGhosttyOptions(ghostty: Ghostty): ITerminalOptions {
  return {
    cursorBlink: false,
    cursorStyle: 'bar',
    fontSize: 12,
    lineHeight: 1.15,
    fontFamily: "'JetBrains Mono', 'Menlo', 'Monaco', monospace",
    convertEol: true,
    disableStdin: true,
    allowTransparency: false,
    scrollback: 10_000,
    ghostty,
    theme: executionTheme,
  };
}
