import { randomBytes } from 'node:crypto';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Command } from 'commander';
import { CONFIG_FILENAME, ExitCode } from '../../core/constants.js';
import { DepTraceError, fromFsError } from '../../core/errors.js';
import { logger } from '../../utils/logger.js';
import { formatOption, loadAnalysis, printJson } from '../options.js';
import type { BaselineView } from '../policy-output.js';

interface CheckOptions {
  format: 'text' | 'json' | 'github';
  strict?: true;
  verbose?: true;
  baseline?: string;
  report?: string;
  sarif?: string;
  summary?: string;
}

/** Writes (or appends to) an output file given on the command line, creating its directory. */
async function writeOutput(file: string, content: string, append = false): Promise<void> {
  const target = path.resolve(process.cwd(), file);
  try {
    await mkdir(path.dirname(target), { recursive: true });
    await (append ? appendFile : writeFile)(target, content, 'utf8');
  } catch (error) {
    throw fromFsError(error, target, 'Writing the output file');
  }
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const count = (n: number, word: string) => `${String(n)} ${word}${n === 1 ? '' : 's'}`;

export function registerCheckCommand(program: Command): void {
  program
    .command('check')
    .description('Evaluate the architecture rules in deptrace.yml')
    .argument('[directory]', 'repository root to check', '.')
    .addOption(formatOption(['text', 'json', 'github']))
    .option('--strict', 'fail on warning violations too')
    .option('--verbose', 'show violation fingerprints')
    .option('--baseline <file>', 'fail only on violations not accepted by this baseline')
    .option('--report <file>', 'also write the JSON report to a file')
    .option('--sarif <file>', 'also write a SARIF 2.1.0 log to a file')
    .option('--summary <file>', 'append a Markdown summary to a file (e.g. "$GITHUB_STEP_SUMMARY")')
    .addHelpText(
      'after',
      `
Exit codes: 0 no failing violations, 3 violations (errors; with --strict also
warnings; with --baseline only violations not in the baseline), 2 missing or
invalid ${CONFIG_FILENAME}, no rules configured, or a missing, invalid or
incompatible baseline. Unresolved imports and cycles are not violations
unless a rule says so.

--format github prints the text report with GitHub workflow commands
disabled, then annotations for the (new) violations, at most 10 per severity.`,
    )
    .action(async (directory: string, options: CheckOptions) => {
      const cli = await loadAnalysis();
      const strict = options.strict === true;
      const version = program.version() ?? '';
      // Read the baseline first: a missing or broken one should fail before a long analysis.
      const baselineFile =
        options.baseline === undefined ? undefined : path.resolve(process.cwd(), options.baseline);
      const approved = baselineFile ? await cli.readBaselineFile(baselineFile) : undefined;

      const run = await cli.runPolicy(directory);
      const { result, evaluation } = run;

      const baseline: BaselineView | undefined =
        baselineFile && approved ? cli.compareBaseline(run, baselineFile, approved) : undefined;

      const checked = baseline ? baseline.comparison.new : evaluation.violations;
      const failing = cli.failingViolations(checked, strict).length;
      const plain = cli.toCheckDocument(result, evaluation, strict, version);
      const document = baseline
        ? cli.toBaselineCheckDocument(plain, baseline.comparison, baseline.file, strict)
        : plain;
      const prefix = cli.repositoryPathPrefix(run);

      if (options.report !== undefined) await writeOutput(options.report, json(document));
      if (options.sarif !== undefined) {
        const newFingerprints =
          baseline && new Set(baseline.comparison.new.map((violation) => violation.fingerprint));
        await writeOutput(
          options.sarif,
          json(
            cli.toSarif(evaluation, version, {
              pathPrefix: prefix,
              ...(newFingerprints && { newFingerprints }),
            }),
          ),
        );
      }
      if (options.summary !== undefined) {
        const summary = cli.formatSummary({
          result,
          evaluation,
          baseline,
          strict,
          failing,
          reportFile: options.report === undefined ? null : path.basename(options.report),
        });
        await writeOutput(options.summary, summary, true);
      }

      if (options.format === 'json') {
        printJson(document);
      } else {
        const text = cli.formatCheck(result, evaluation, options.verbose === true, baseline);
        if (options.format === 'github') {
          // File names and import specifiers come from the repository; with workflow
          // commands stopped, a line in them cannot act as a command (e.g. "::error::").
          const token = randomBytes(16).toString('hex');
          logger.info(`::stop-commands::${token}`);
          logger.info(text);
          logger.info(`::${token}::`);
          for (const line of cli.formatAnnotations(checked, prefix)) logger.info(line);
        } else {
          logger.info(text);
        }
      }

      if (failing > 0) {
        const accepted = baseline
          ? ` (${count(baseline.comparison.existing.length, 'existing violation')} accepted by the baseline)`
          : '';
        throw new DepTraceError(
          `Architecture check failed: ${count(failing, baseline ? 'new failing violation' : 'failing violation')}${strict ? ' (strict mode: warnings fail too)' : ''}${accepted}.`,
          ExitCode.ArchitectureViolations,
        );
      }
      if (options.format !== 'json') {
        const warnings = checked.length;
        logger.info(
          baseline
            ? `\nArchitecture check passed: no new failing violations (${count(baseline.comparison.existing.length, 'existing violation')} accepted by the baseline, ${String(baseline.comparison.resolved.length)} resolved${warnings > 0 ? `, ${count(warnings, 'new warning')}` : ''}).`
            : `\nArchitecture check passed${warnings > 0 ? ` with ${String(warnings)} warning(s)` : ''}.`,
        );
      }
    });
}
