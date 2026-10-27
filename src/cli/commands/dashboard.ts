import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { InvalidArgumentError, type Command } from 'commander';
import { CLI_NAME, ExitCode } from '../../core/constants.js';
import { DepTraceError, fromFsError } from '../../core/errors.js';
import { readGitHead } from '../../dashboard/git.js';
import { startDashboardServer, type DashboardState } from '../../dashboard/server.js';
import { logger } from '../../utils/logger.js';
import { loadAnalysis } from '../options.js';

interface DashboardOptions {
  port: number;
  baseline?: string;
  report?: string;
}

const DEFAULT_PORT = 7341;
/** Same limit the dashboard applies to imported files. */
const MAX_REPORT_BYTES = 64 * 1024 * 1024;

function parsePort(value: string): number {
  const port = Number(value);
  if (!/^\d+$/.test(value) || port > 65535) {
    throw new InvalidArgumentError('must be an integer from 0 to 65535 (0 picks a free port).');
  }
  return port;
}

/** dist/dashboard of this package, from src/ (development) and dist/ (built) alike. */
function assetsDirectory(): string {
  let directory = path.dirname(fileURLToPath(import.meta.url));
  while (!existsSync(path.join(directory, 'package.json'))) {
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return path.join(directory, 'dist', 'dashboard');
}

async function readReportFile(file: string): Promise<string> {
  let size: number;
  try {
    size = (await stat(file)).size;
  } catch (error) {
    throw fromFsError(error, file, 'Reading the report');
  }
  if (size > MAX_REPORT_BYTES) {
    throw new DepTraceError(
      `The report ${file} is larger than ${String(MAX_REPORT_BYTES / 1024 / 1024)} MB.`,
      ExitCode.UsageError,
    );
  }
  const text = await readFile(file, 'utf8').catch((error: unknown) => {
    throw fromFsError(error, file, 'Reading the report');
  });
  try {
    // Only proves it is JSON: the dashboard validates the structure and explains problems.
    return JSON.stringify(JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text));
  } catch {
    throw new DepTraceError(`The report ${file} is not valid JSON.`, ExitCode.UsageError);
  }
}

export function registerDashboardCommand(program: Command): void {
  program
    .command('dashboard')
    .description('Explore the architecture in the browser (served on 127.0.0.1)')
    .argument('[directory]', 'repository root to analyze', '.')
    .option(
      '--port <port>',
      `port on 127.0.0.1 (default ${String(DEFAULT_PORT)}; 0 picks a free port)`,
      parsePort,
      DEFAULT_PORT,
    )
    .option('--baseline <file>', 'mark each violation as new or accepted by this baseline')
    .option('--report <file>', 'show a saved "report --format json" file instead of analyzing')
    .addHelpText(
      'after',
      `
The dashboard runs DepTrace's static analysis (repository code is never
executed) and serves the result to your browser on 127.0.0.1 only. "Re-analyze"
in the dashboard repeats the analysis of the same directory. Press Ctrl+C to stop.

Examples:
  $ ${CLI_NAME} dashboard
  $ ${CLI_NAME} dashboard ./my-app --baseline deptrace-baseline.json
  $ ${CLI_NAME} report --format json > report.json && ${CLI_NAME} dashboard --report report.json`,
    )
    .action(async (directory: string, options: DashboardOptions) => {
      const assetsDir = assetsDirectory();
      if (!existsSync(path.join(assetsDir, 'index.html'))) {
        throw new DepTraceError(
          `The dashboard is not built (${assetsDir} is missing). Run "npm run build".`,
          ExitCode.OperationalError,
        );
      }
      const version = program.version() ?? '';

      let initial: DashboardState;
      let analyze: (() => Promise<DashboardState>) | undefined;
      if (options.report !== undefined) {
        if (directory !== '.' || options.baseline !== undefined) {
          throw new DepTraceError(
            '--report shows a saved report; it cannot be combined with a directory or --baseline.',
            ExitCode.UsageError,
          );
        }
        const file = path.resolve(process.cwd(), options.report);
        initial = {
          report: await readReportFile(file),
          meta: { source: 'file', name: path.basename(file), analyzedAt: null, git: null },
        };
      } else {
        const cli = await loadAnalysis();
        const baselineFile =
          options.baseline === undefined
            ? undefined
            : path.resolve(process.cwd(), options.baseline);
        analyze = async () => {
          // Re-read deptrace.yml and the baseline every time, like a fresh CLI run.
          const approved = baselineFile ? await cli.readBaselineFile(baselineFile) : undefined;
          let report: unknown;
          let run;
          if (baselineFile && approved) {
            const policyRun = await cli.runPolicy(directory);
            run = policyRun;
            report = cli.toReportDocument(
              policyRun,
              policyRun,
              version,
              cli.compareBaseline(policyRun, baselineFile, approved),
            );
          } else {
            run = await cli.runAnalysis(directory);
            report = cli.toReportDocument(
              run,
              cli.evaluateConfiguredPolicy(run.result, run.config),
              version,
            );
          }
          return {
            report: JSON.stringify(report),
            meta: {
              source: 'analysis',
              name: path.basename(run.result.root),
              analyzedAt: new Date().toISOString(),
              git: run.info.gitRoot ? await readGitHead(run.info.gitRoot) : null,
            },
          };
        };
        initial = await analyze();
      }

      let url: string;
      try {
        ({ url } = await startDashboardServer({
          assetsDir,
          port: options.port,
          initial,
          ...(analyze && { analyze }),
        }));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
          throw new DepTraceError(
            `Port ${String(options.port)} on 127.0.0.1 is already in use. Choose another with --port (0 picks a free port).`,
            ExitCode.OperationalError,
          );
        }
        throw error;
      }
      logger.info(`${CLI_NAME} dashboard: ${url}`);
      logger.info(
        options.report === undefined
          ? 'Serving the analysis on 127.0.0.1 only. Press Ctrl+C to stop.'
          : `Serving ${path.basename(options.report)} on 127.0.0.1 only. Press Ctrl+C to stop.`,
      );
      // Keep running until the process is interrupted.
      await new Promise<never>(() => undefined);
    });
}
