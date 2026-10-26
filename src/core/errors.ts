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
