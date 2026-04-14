import type { Ghostty, ITerminalOptions, ITheme } from 'ghostty-web';
import type { Theme } from '../store/app-store';

/** GitHub-dark style palette aligned with previous xterm theme */
const darkExecutionTheme: ITheme = {
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

const lightExecutionTheme: ITheme = {
  background: '#f7f4ef',
  foreground: '#2d2a26',
  cursor: '#54493f',
  cursorAccent: '#f7f4ef',
  selectionBackground: '#e7e0d4',
  black: '#4a4238',
  red: '#dc2626',
  green: '#15803d',
  yellow: '#a16207',
  blue: '#4f6da7',
  magenta: '#7a5c86',
  cyan: '#2f7b79',
  white: '#efe8dd',
  brightBlack: '#7b7469',
  brightRed: '#ef4444',
  brightGreen: '#16a34a',
  brightYellow: '#ca8a04',
  brightBlue: '#6c86b9',
  brightMagenta: '#9a73a9',
  brightCyan: '#479493',
  brightWhite: '#ffffff',
};

/**
 * Options for the execution monitor terminal (read-only PTY mirror).
 * Mirrors OpenChamber’s getGhosttyTerminalOptions shape: Ghostty WASM instance + theme + FitAddon sizing.
 */
export function getExecutionGhosttyOptions(ghostty: Ghostty, theme: Theme): ITerminalOptions {
  return {
    cursorBlink: false,
    cursorStyle: 'bar',
    fontSize: 12,
    lineHeight: 1.2,
    fontFamily: "'JetBrains Mono', 'Menlo', 'Monaco', monospace",
    convertEol: true,
    disableStdin: true,
    allowTransparency: false,
    scrollback: 10_000,
    ghostty,
    theme: theme === 'light' ? lightExecutionTheme : darkExecutionTheme,
  };
}
