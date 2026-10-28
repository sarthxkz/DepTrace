/**
 * The `deptrace audit --format json` document: known vulnerabilities in installed npm
 * packages, the files that import them and a suggested fix. Validated like every other
 * document the dashboard reads.
 */
import { Checker } from './checker';

export const SEVERITIES = ['info', 'low', 'moderate', 'high', 'critical'] as const;
export type AuditSeverity = (typeof SEVERITIES)[number];

export interface Advisory {
  id: number;
  url: string;
  title: string;
  severity: AuditSeverity;
  vulnerableVersions: string;
  cwe: string[];
  cvssScore: number | null;
}

export interface VulnerablePackage {
  name: string;
  version: string;
  path: string;
  direct: boolean;
  dev: boolean;
  severity: AuditSeverity;
  advisories: Advisory[];
  importedBy: { file: string; line: number; column: number }[];
  fix: { version: string | null; command: string | null; breaking: boolean; note: string };
}

export interface AuditReport {
  tool: { name: string; version: string };
  registry: string;
  lockfile: string;
  packageVersionsSent: number;
  packagesNotChecked: number;
  summary: Record<AuditSeverity, number> & { packages: number };
  packages: VulnerablePackage[];
}

export function parseAudit(value: unknown): AuditReport {
  const c = new Checker();
  return c.run(() => {
    const o = c.object(value, '$');
    if (o.schemaVersion !== 1) c.problem('schemaVersion', 'expected 1');
    const tool = c.object(o.tool, 'tool');
    const summary = c.object(o.summary, 'summary');
    return {
      tool: { name: c.string(tool, 'name', 'tool'), version: c.string(tool, 'version', 'tool') },
      registry: c.string(o, 'registry', '$'),
      lockfile: c.string(o, 'lockfile', '$'),
      packageVersionsSent: c.integer(o, 'packageVersionsSent', '$'),
      packagesNotChecked: c.integer(o, 'packagesNotChecked', '$'),
      summary: {
        ...(Object.fromEntries(
          SEVERITIES.map((s) => [s, c.integer(summary, s, 'summary')]),
        ) as Record<AuditSeverity, number>),
        packages: c.integer(summary, 'packages', 'summary'),
      },
      packages: c.array(o, 'packages', '$', (item, at) => {
        const p = c.object(item, at);
        const fix = c.object(p.fix, `${at}.fix`);
        return {
          name: c.string(p, 'name', at),
          version: c.string(p, 'version', at),
          path: c.string(p, 'path', at),
          direct: c.boolean(p, 'direct', at),
          dev: c.boolean(p, 'dev', at),
          severity: c.oneOf(p, 'severity', at, SEVERITIES),
          advisories: c.array(p, 'advisories', at, (entry, where) => {
            const a = c.object(entry, where);
            const url = c.string(a, 'url', where);
            // Advisory links are rendered as anchors: only https URLs.
            if (!url.startsWith('https://')) c.problem(`${where}.url`, 'must be an https URL');
            return {
              id: c.integer(a, 'id', where),
              url,
              title: c.string(a, 'title', where),
              severity: c.oneOf(a, 'severity', where, SEVERITIES),
              vulnerableVersions: c.string(a, 'vulnerableVersions', where),
              cwe: c.strings(a, 'cwe', where),
              cvssScore: typeof a.cvssScore === 'number' ? a.cvssScore : null,
            };
          }),
          importedBy: c.array(p, 'importedBy', at, (entry, where) => {
            const i = c.object(entry, where);
            return {
              file: c.string(i, 'file', where),
              line: c.integer(i, 'line', where),
              column: c.integer(i, 'column', where),
            };
          }),
          fix: {
            version: c.nullableString(fix, 'version', `${at}.fix`),
            command: c.nullableString(fix, 'command', `${at}.fix`),
            breaking: c.boolean(fix, 'breaking', `${at}.fix`),
            note: c.string(fix, 'note', `${at}.fix`),
          },
        };
      }),
    };
  });
}
