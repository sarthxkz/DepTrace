import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { CONFIG_FILENAME, ExitCode } from '../core/constants.js';
import { DepTraceError, fromFsError, printable } from '../core/errors.js';
import { configPath } from './paths.js';
import { validateConfig, type DepTraceConfig } from './schema.js';

/**
 * Loads `deptrace.yml` from `directory`. Returns undefined when the file does
 * not exist; throws a usage error when it is invalid.
 */
export async function loadConfig(directory: string): Promise<DepTraceConfig | undefined> {
  const file = configPath(directory);
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw fromFsError(error, file, 'Reading the configuration file');
  }

  let value: unknown;
  try {
    value = parse(text);
  } catch (error) {
    throw new DepTraceError(
      `Invalid ${CONFIG_FILENAME}: ${printable((error as Error).message)}`,
      ExitCode.UsageError,
      { cause: error },
    );
  }
  const problems = validateConfig(value);
  if (problems.length > 0) {
    throw new DepTraceError(
      `Invalid ${CONFIG_FILENAME} at ${file}:\n${problems.map((p) => `  - ${printable(p)}`).join('\n')}`,
      ExitCode.UsageError,
    );
  }
  return value as DepTraceConfig;
}
