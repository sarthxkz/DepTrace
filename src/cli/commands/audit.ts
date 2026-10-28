import { Option, type Command } from 'commander';
import { DEFAULT_REGISTRY, SEVERITIES, type Severity } from '../../audit/audit.js';
import { runAudit, type AuditReport } from '../../audit/report.js';
import { ExitCode } from '../../core/constants.js';
import { DepTraceError } from '../../core/errors.js';
import { logger } from '../../utils/logger.js';
import { formatOption, loadAnalysis, printJson, type OutputFormat } from '../options.js';

interface AuditCommandOptions {
  format: OutputFormat;
  failOn: Severity;
}

const plural = (n: number, word: string, many = `${word}s`) =>
  `${String(n)} ${n === 1 ? word : many}`;

export function formatAudit(report: AuditReport): string {
  const lines = [
    `Advisories: ${report.registry} (sent ${plural(report.packageVersionsSent, 'package version')} from ${report.lockfile}: names and versions only, no source code)`,
  ];
  if (report.packagesNotChecked > 0) {
    lines.push(
      `Not checked: ${plural(report.packagesNotChecked, 'package')} not installed from registry.npmjs.org (private registry, git or local path); never sent`,
    );
  }
  const counts = SEVERITIES.toReversed()
    .filter((severity) => report.summary[severity] > 0)
    .map((severity) => `${String(report.summary[severity])} ${severity}`);
  lines.push(
    report.packages.length === 0
      ? 'Vulnerable packages: none known for the installed versions'
      : `Vulnerable packages: ${String(report.packages.length)} (${counts.join(', ')})`,
  );

  for (const pkg of report.packages) {
    const tags = [pkg.direct ? 'direct' : 'transitive', ...(pkg.dev ? ['dev'] : [])].join(', ');
    lines.push(
      '',
      `${pkg.severity.toUpperCase()}  ${pkg.name}@${pkg.version}  (${tags}, ${pkg.path})`,
    );
    for (const advisory of pkg.advisories) {
      lines.push(
        `  ${advisory.severity}: ${advisory.title}`,
        `    ${advisory.url}  (vulnerable: ${advisory.vulnerableVersions})`,
      );
    }
    lines.push(
      pkg.importedBy.length > 0
        ? `  Imported by: ${pkg.importedBy.map((i) => `${i.file}:${String(i.line)}`).join(', ')}`
        : '  Imported by: no analyzed source file (used by another package, a script or a tool)',
    );
    lines.push(
      pkg.fix.command === null
        ? `  Fix: ${pkg.fix.note}`
        : `  Fix: ${pkg.fix.command}   ${pkg.fix.note}`,
    );
  }
  return lines.join('\n');
}

export function registerAuditCommand(program: Command): void {
  program
    .command('audit')
    .description('Find installed npm packages with known vulnerabilities, and how to fix them')
    .argument('[directory]', 'repository root with package-lock.json', '.')
    .addOption(formatOption())
    .addOption(
      new Option('--fail-on <severity>', 'lowest severity that fails the command')
        .choices([...SEVERITIES])
        .default('low'),
    )
    .addHelpText(
      'after',
      `
Reads package-lock.json, looks up advisories in the npm registry's advisory
database (the service "npm audit" uses), shows which of your source files import
each vulnerable package, and suggests the smallest update that fixes it.

This is the only command that uses the network. It sends package names and
versions, never source code, and only for packages installed from
registry.npmjs.org. DEPTRACE_AUDIT_REGISTRY selects a mirror.

These are known vulnerabilities in your dependencies: not a scan of your own
code, and separate from architecture violations ("deptrace check").

Exit codes: 0 nothing at or above --fail-on, 5 vulnerable packages found,
1 the advisory service could not be reached, 2 missing or unsupported lockfile.`,
    )
    .action(async (directory: string, options: AuditCommandOptions) => {
      const { runAnalysis } = await loadAnalysis();
      const { info, result } = await runAnalysis(directory);
      const report = await runAudit(info.path, {
        toolVersion: program.version() ?? '',
        external: result.external,
        registry: process.env.DEPTRACE_AUDIT_REGISTRY ?? DEFAULT_REGISTRY,
      });
      if (options.format === 'json') printJson(report);
      else logger.info(formatAudit(report));

      const threshold = SEVERITIES.indexOf(options.failOn);
      const failing = report.packages.filter(
        (pkg) => SEVERITIES.indexOf(pkg.severity) >= threshold,
      ).length;
      if (failing > 0) {
        throw new DepTraceError(
          `Audit failed: ${plural(failing, 'vulnerable package')} at or above "${options.failOn}".`,
          ExitCode.Vulnerabilities,
        );
      }
    });
}
