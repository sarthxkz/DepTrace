import { stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CONFIG_FILENAME, ExitCode } from '../core/constants.js';
import { DepTraceError, fromFsError } from '../core/errors.js';
import { configPath } from './paths.js';
import { renderStarterConfig } from './templates.js';

export function configExistsError(file: string): DepTraceError {
  return new DepTraceError(
    `${CONFIG_FILENAME} already exists at ${file}. It was not modified.`,
    ExitCode.OperationalError,
  );
}

/**
 * Writes the starter configuration (or `render`'s) into `directory`. Never
 * overwrites an existing file. Returns the path of the created file.
 */
export async function writeStarterConfig(
  directory: string,
  render: (projectName: string) => string = renderStarterConfig,
): Promise<string> {
  try {
    if (!(await stat(directory)).isDirectory()) {
      throw new DepTraceError(`Not a directory: ${directory}`, ExitCode.OperationalError);
    }
  } catch (error) {
    if (error instanceof DepTraceError) throw error;
    throw fromFsError(error, directory, 'Accessing the target directory');
  }

  const file = configPath(directory);
  const projectName = path.basename(directory) || 'my-project';
  try {
    // 'wx' fails if the file exists, so there is no check-then-write race.
    await writeFile(file, render(projectName), { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw configExistsError(file);
    }
    throw fromFsError(error, file, 'Writing the configuration file');
  }
  return file;
}
