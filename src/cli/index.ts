import { Command, CommanderError } from 'commander';
import { CLI_NAME, ExitCode, PRODUCT_NAME, TAGLINE } from '../core/constants.js';
import { DepTraceError } from '../core/errors.js';
import { logger } from '../utils/logger.js';
import { registerBaselineCommand } from './commands/baseline.js';
import { registerCheckCommand } from './commands/check.js';
import { registerDashboardCommand } from './commands/dashboard.js';
import { registerDepsCommand } from './commands/deps.js';
import { registerInitCommand } from './commands/init.js';
import { registerPathCommand } from './commands/path.js';
import { registerReportCommand } from './commands/report.js';
import { registerScanCommand } from './commands/scan.js';

const EXAMPLES = `
Examples:
  $ ${CLI_NAME} init                              Create a starter deptrace.yml
  $ ${CLI_NAME} scan                              Analyze the current directory
  $ ${CLI_NAME} scan ./my-app --format json       Machine-readable dependency graph
  $ ${CLI_NAME} deps src/index.ts                 What src/index.ts imports
  $ ${CLI_NAME} deps src/db.ts -d incoming        Which files import src/db.ts
  $ ${CLI_NAME} path src/index.ts src/db.ts       Shortest import path between two files
  $ ${CLI_NAME} check                             Enforce the rules in deptrace.yml (exit 3 on violations)
  $ ${CLI_NAME} report --format json              Layers, rule results and the full graph
  $ ${CLI_NAME} baseline create                   Accept today's violations in deptrace-baseline.json
  $ ${CLI_NAME} check --baseline deptrace-baseline.json
                                               Fail only on violations not in the baseline
  $ ${CLI_NAME} dashboard                         Explore the graph and findings in the browser

Run "${CLI_NAME} <command> --help" for details about a command.`;

export function createProgram(version: string): Command {
  // exitOverride must be set before subcommands are added so they inherit it.
  const program = new Command(CLI_NAME)
    .description(
      `${PRODUCT_NAME}: ${TAGLINE}\nArchitecture analysis CLI for TypeScript/JavaScript repositories.`,
    )
    .version(version, '-V, --version', 'Print the version number')
    .helpOption('-h, --help', 'Show help')
    .helpCommand('help [command]', 'Show help for a command')
    .option('--debug', 'Show detailed diagnostics when an error occurs')
    .showHelpAfterError(`(run "${CLI_NAME} --help" for usage)`)
    .addHelpText('after', EXAMPLES)
    .exitOverride();

  registerInitCommand(program);
  registerScanCommand(program);
  registerDepsCommand(program);
  registerPathCommand(program);
  registerCheckCommand(program);
  registerReportCommand(program);
  registerBaselineCommand(program);
  registerDashboardCommand(program);
  return program;
}

/** Runs the CLI with user arguments (no node/script prefix) and returns the exit code. */
export async function run(args: string[], version: string): Promise<ExitCode> {
  // Read from raw args so --debug also applies when argument parsing itself fails.
  const debug = args.includes('--debug');
  logger.setDebug(debug);
  try {
    await createProgram(version).parseAsync(args, { from: 'user' });
    return ExitCode.Success;
  } catch (error) {
    return handleError(error);
  }
}

function handleError(error: unknown): ExitCode {
  // Commander has already printed its own message (or help/version output).
  if (error instanceof CommanderError) {
    return error.exitCode === 0 ? ExitCode.Success : ExitCode.UsageError;
  }
  if (error instanceof DepTraceError) {
    logger.error(`error: ${error.message}`);
    const detail = error.cause instanceof Error ? error.cause : error;
    logger.debug(detail.stack ?? detail.message);
    return error.exitCode;
  }
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`Unexpected error: ${message}`);
  logger.error('Run again with --debug for details.');
  if (error instanceof Error) logger.debug(error.stack ?? message);
  return ExitCode.OperationalError;
}
