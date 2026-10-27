import { randomBytes } from 'node:crypto';
import { open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CLI_NAME, ExitCode } from '../core/constants.js';
import { DepTraceError, fromFsError, printable } from '../core/errors.js';
import { parseBaseline, serializeBaseline, type Baseline } from './baseline.js';

/** Far above any real baseline; protects against reading a huge planted file. */
const MAX_BASELINE_BYTES = 64 * 1024 * 1024;

const errorCode = (error: unknown) => (error as NodeJS.ErrnoException | undefined)?.code;

/** Reads and validates a baseline file. Every problem is a usage error (exit 2). */
export async function readBaselineFile(file: string): Promise<Baseline> {
  try {
    const info = await stat(file);
    if (!info.isFile()) {
      throw new DepTraceError(`The baseline is not a file: ${file}`, ExitCode.UsageError);
    }
    if (info.size > MAX_BASELINE_BYTES) {
      throw new DepTraceError(
        `The baseline ${file} is larger than ${String(MAX_BASELINE_BYTES / 1024 / 1024)} MB; refusing to read it.`,
        ExitCode.UsageError,
      );
    }
  } catch (error) {
    if (error instanceof DepTraceError) throw error;
    if (errorCode(error) === 'ENOENT') {
      throw new DepTraceError(
        `Baseline file not found: ${file}. Create it with "${CLI_NAME} baseline create", review it and commit it.`,
        ExitCode.UsageError,
      );
    }
    throw fromFsError(error, file, 'Reading the baseline');
  }

  let value: unknown;
  try {
    // Editors on Windows may add a byte order mark, which JSON.parse rejects.
    const text = await readFile(file, 'utf8');
    value = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new DepTraceError(
        `Invalid baseline ${file}: not valid JSON (${printable(error.message)}).`,
        ExitCode.UsageError,
      );
    }
    throw fromFsError(error, file, 'Reading the baseline');
  }
  const { baseline, problems } = parseBaseline(value);
  if (!baseline) {
    throw new DepTraceError(
      `Invalid baseline ${file}:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`,
      ExitCode.UsageError,
    );
  }
  return baseline;
}

/**
 * Writes a baseline without partial files: the content goes to a temporary
 * file next to the target, which is then renamed over it. "create" never
 * replaces an existing file; "update" requires one.
 */
export async function writeBaselineFile(
  file: string,
  baseline: Baseline,
  mode: 'create' | 'update',
): Promise<void> {
  const content = serializeBaseline(baseline);
  // Validate exactly what will be written, so a bug cannot produce an unreadable baseline.
  const { problems } = parseBaseline(JSON.parse(content));
  if (problems.length > 0) throw new Error(`Generated baseline is invalid: ${problems.join('; ')}`);

  if (mode === 'update') {
    try {
      if (!(await stat(file)).isFile()) {
        throw new DepTraceError(`The baseline is not a file: ${file}`, ExitCode.UsageError);
      }
    } catch (error) {
      if (error instanceof DepTraceError) throw error;
      if (errorCode(error) === 'ENOENT') {
        throw new DepTraceError(
          `No baseline to update at ${file}. Create one with "${CLI_NAME} baseline create".`,
          ExitCode.UsageError,
        );
      }
      throw fromFsError(error, file, 'Accessing the baseline');
    }
  }

  const temp = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${randomBytes(6).toString('hex')}.tmp`,
  );
  let reserved = false;
  try {
    if (mode === 'create') {
      // 'wx' reserves the name atomically and fails if anything (even a symlink) exists there.
      await (await open(file, 'wx')).close();
      reserved = true;
    }
    await writeFile(temp, content, { encoding: 'utf8', flag: 'wx' });
    await rename(temp, file);
  } catch (error) {
    await rm(temp, { force: true });
    if (reserved) await rm(file, { force: true });
    if (errorCode(error) === 'EEXIST' && mode === 'create') {
      throw new DepTraceError(
        `A baseline already exists at ${file}. It was not modified. Compare with "${CLI_NAME} check --baseline", then replace it explicitly with "${CLI_NAME} baseline update".`,
        ExitCode.OperationalError,
      );
    }
    throw fromFsError(error, file, 'Writing the baseline');
  }
}
