import path from 'node:path';
import {
  DEFAULT_REGISTRY,
  SEVERITIES,
  fetchAdvisories,
  fetchVersions,
  matchVulnerabilities,
  readLockfile,
  suggestFix,
  type Advisory,
  type FixSuggestion,
  type Severity,
} from './audit.js';

export const AUDIT_SCHEMA_VERSION = 1;

export interface Importer {
  file: string;
  line: number;
  column: number;
}

/** One vulnerable installed copy of a package, with every advisory that covers it. */
export interface VulnerablePackage {
  name: string;
  version: string;
  path: string;
  direct: boolean;
  dev: boolean;
  /** The most severe of `advisories`. */
  severity: Severity;
  advisories: Advisory[];
  /** Analyzed source files that import the package by name. */
  importedBy: Importer[];
  fix: FixSuggestion;
}

export interface AuditReport {
  schemaVersion: typeof AUDIT_SCHEMA_VERSION;
  tool: { name: string; version: string };
  registry: string;
  lockfile: string;
  /** Distinct name@version pairs sent to the registry. */
  packageVersionsSent: number;
  /** Installed copies not from registry.npmjs.org: never sent, not checked. */
  packagesNotChecked: number;
  summary: Record<Severity, number> & { packages: number };
  packages: VulnerablePackage[];
}

export interface AuditOptions {
  toolVersion: string;
  /** Packages your source files import, from the dependency analysis. */
  external: readonly { packageName: string; references: readonly Importer[] }[];
  registry?: string;
  fetchImpl?: typeof fetch;
}

/** Reads the lockfile in `root`, looks up advisories and suggests a fix for every vulnerable copy. */
export async function runAudit(root: string, options: AuditOptions): Promise<AuditReport> {
  const registry = options.registry ?? DEFAULT_REGISTRY;
  const fetchImpl = options.fetchImpl ?? fetch;
  const lock = await readLockfile(root);
  const advisories = await fetchAdvisories(lock.packages, registry, fetchImpl);
  const vulnerabilities = matchVulnerabilities(lock.packages, advisories);

  const importers = new Map(
    options.external.map((dependency) => [
      dependency.packageName,
      dependency.references.map(({ file, line, column }) => ({ file, line, column })),
    ]),
  );
  const names = [...new Set(vulnerabilities.map((v) => v.name))];
  const published = new Map(
    await Promise.all(
      names.map(async (name) => [name, await fetchVersions(name, registry, fetchImpl)] as const),
    ),
  );

  // matchVulnerabilities sorts most severe first, so the first entry per copy sets its severity.
  const byCopy = new Map<string, VulnerablePackage>();
  for (const v of vulnerabilities) {
    const existing = byCopy.get(v.path);
    if (existing) {
      existing.advisories.push(v.advisory);
      continue;
    }
    byCopy.set(v.path, {
      name: v.name,
      version: v.version,
      path: v.path,
      direct: v.direct,
      dev: v.dev,
      severity: v.advisory.severity,
      advisories: [v.advisory],
      importedBy: importers.get(v.name) ?? [],
      fix: suggestFix(v, advisories.get(v.name) ?? [], published.get(v.name) ?? null),
    });
  }
  const packages = [...byCopy.values()];

  const summary = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<Severity, number>;
  for (const pkg of packages) summary[pkg.severity] += 1;
  return {
    schemaVersion: AUDIT_SCHEMA_VERSION,
    tool: { name: 'deptrace', version: options.toolVersion },
    registry,
    lockfile: path.basename(lock.file),
    packageVersionsSent: new Set(lock.packages.map((p) => `${p.name}@${p.version}`)).size,
    packagesNotChecked: lock.notChecked.length,
    summary: { ...summary, packages: packages.length },
    packages,
  };
}
