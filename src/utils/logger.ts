import { terminalSafe } from '../core/errors.js';

let debugEnabled = false;

/**
 * Minimal console output: results to stdout, diagnostics to stderr. Text output
 * carries repository content, so control and bidi characters are escaped.
 */
export const logger = {
  setDebug(enabled: boolean): void {
    debugEnabled = enabled;
  },
  info(message: string): void {
    process.stdout.write(`${terminalSafe(message)}\n`);
  },
  error(message: string): void {
    process.stderr.write(`${terminalSafe(message)}\n`);
  },
  debug(message: string): void {
    if (debugEnabled) process.stderr.write(`[debug] ${terminalSafe(message)}\n`);
  },
};
