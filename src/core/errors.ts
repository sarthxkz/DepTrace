import { ExitCode } from './constants.js';

/** An expected failure with a user-facing message and a defined exit code. */
export class DepTraceError extends Error {
  constructor(
    message: string,
    readonly exitCode: ExitCode,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'DepTraceError';
  }
}

const FS_REASONS: Record<string, string> = {
  ENOENT: 'the path does not exist',
  ENOTDIR: 'a parent path is not a directory',
  EACCES: 'permission denied',
  EPERM: 'operation not permitted',
  EROFS: 'the filesystem is read-only',
  ENOSPC: 'no space left on device',
  EISDIR: 'the path is a directory',
};

/** Converts a Node.js filesystem error into a readable operational error. */
export function fromFsError(error: unknown, target: string, action: string): DepTraceError {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  const reason =
    (code && FS_REASONS[code]) ?? (error instanceof Error ? error.message : String(error));
  return new DepTraceError(
    `${action} failed for ${target}: ${reason}.`,
    ExitCode.OperationalError,
    {
      cause: error,
    },
  );
}

/**
 * Escapes control characters (newlines included) in untrusted text, so a
 * value from a repository cannot start a new output line, e.g. a forged CI
 * workflow command.
 */
export function printable(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, escapeChar);
}

const escapeChar = (char: string) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`;

/**
 * Escapes characters that let untrusted text (file names, import specifiers)
 * control a terminal or disguise itself: control characters other than
 * newline and tab (ANSI escape sequences start with ESC), and Unicode
 * bidirectional overrides ("Trojan Source"). Applied to all CLI text output.
 */
export function terminalSafe(text: string): string {
  return text.replace(TERMINAL_UNSAFE, escapeChar);
}

const TERMINAL_UNSAFE =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;
