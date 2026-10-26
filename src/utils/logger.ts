let debugEnabled = false;

/** Minimal console output: results to stdout, diagnostics to stderr. */
export const logger = {
  setDebug(enabled: boolean): void {
    debugEnabled = enabled;
  },
  info(message: string): void {
    process.stdout.write(`${message}\n`);
  },
  error(message: string): void {
    process.stderr.write(`${message}\n`);
  },
  debug(message: string): void {
    if (debugEnabled) process.stderr.write(`[debug] ${message}\n`);
  },
};
