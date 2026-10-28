import { readFile } from 'node:fs/promises';
import path from 'node:path';
import semver from 'semver';
import { ExitCode } from '../core/constants.js';
import { DepTraceError, fromFsError } from '../core/errors.js';

/** Where advisories are looked up; the same endpoint `npm audit` uses. */
export const DEFAULT_REGISTRY = 'https://registry.npmjs.org';
const PUBLIC_TARBALLS = 'https://registry.npmjs.org/';
const TIMEOUT_MS = 30_000;

export const SEVERITIES = ['info', 'low', 'moderate', 'high', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];

/** One installed copy of a package, from package-lock.json. */
export interface InstalledPackage {
  name: string;
  version: string;
  /** Lockfile key, e.g. "node_modules/a/node_modules/b". */
  path: string;
  dev: boolean;
  /** The top-level copy of a package listed in the root package.json. */
  direct: boolean;
  /** The version range package.json declares for it, when direct. */
  declaredRange: string | null;
}

export interface Lockfile {
  file: string;
  /** Installed from the public npm registry: these are looked up. */
  packages: InstalledPackage[];
  /** Installed from elsewhere (private registry, git, local path) or without a "resolved" URL: never sent. */
  notChecked: InstalledPackage[];
}

export interface Advisory {
  id: number;
  url: string;
  title: string;
  severity: Severity;
  vulnerableVersions: string;
  cwe: string[];
  cvssScore: number | null;
}

export interface Vulnerability extends InstalledPackage {
  advisory: Advisory;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Reads npm-shrinkwrap.json or package-lock.json (lockfile version 2 or 3) in `root`. */
export async function readLockfile(root: string): Promise<Lockfile> {
  let file = '';
  let text: string | undefined;
  for (const name of ['npm-shrinkwrap.json', 'package-lock.json']) {
    file = path.join(root, name);
    try {
      text = await readFile(file, 'utf8');
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw fromFsError(error, file, 'Reading the lockfile');
      }
    }
  }
  if (text === undefined) {
    throw new DepTraceError(
      `No package-lock.json in ${root}. "deptrace audit" reads npm lockfiles; run "npm install" to create one (pnpm and Yarn lockfiles are not supported).`,
      ExitCode.UsageError,
    );
  }
  let lock: unknown;
  try {
    lock = JSON.parse(text);
  } catch {
    throw new DepTraceError(`${file} is not valid JSON.`, ExitCode.UsageError);
  }
  if (!isRecord(lock) || !isRecord(lock.packages)) {
    throw new DepTraceError(
      `${file} has no "packages" section. Lockfile version 2 or 3 is required (npm 7 or later); run "npm install" to update it.`,
      ExitCode.UsageError,
    );
  }

  const rootEntry = lock.packages[''];
  const direct = new Map<string, string>();
  if (isRecord(rootEntry)) {
    for (const field of [
      'dependencies',
      'devDependencies',
      'optionalDependencies',
      'peerDependencies',
    ]) {
      const deps = rootEntry[field];
      if (!isRecord(deps)) continue;
      for (const [name, range] of Object.entries(deps)) {
        if (typeof range === 'string' && !direct.has(name)) direct.set(name, range);
      }
    }
  }

  const packages: InstalledPackage[] = [];
  const notChecked: InstalledPackage[] = [];
  for (const [key, entry] of Object.entries(lock.packages)) {
    const at = key.lastIndexOf('node_modules/');
    if (at === -1 || !isRecord(entry) || entry.link === true) continue;
    if (typeof entry.version !== 'string' || semver.valid(entry.version) === null) continue;
    const name =
      typeof entry.name === 'string' ? entry.name : key.slice(at + 'node_modules/'.length);
    const isDirect = direct.has(name) && key === `node_modules/${name}`;
    const installed: InstalledPackage = {
      name,
      version: entry.version,
      path: key,
      dev: entry.dev === true,
      direct: isDirect,
      declaredRange: isDirect ? (direct.get(name) ?? null) : null,
    };
    const fromPublicRegistry =
      typeof entry.resolved === 'string' && entry.resolved.startsWith(PUBLIC_TARBALLS);
    (fromPublicRegistry ? packages : notChecked).push(installed);
  }
  return { file, packages, notChecked };
}

function parseAdvisory(value: unknown): Advisory | null {
  if (!isRecord(value)) return null;
  const { id, url, title, severity, vulnerable_versions: range, cwe, cvss } = value;
  if (
    typeof id !== 'number' ||
    typeof url !== 'string' ||
    !url.startsWith('https://') ||
    typeof title !== 'string' ||
    typeof range !== 'string' ||
    !SEVERITIES.includes(severity as Severity) ||
    semver.validRange(range) === null
  ) {
    return null;
  }
  const score = isRecord(cvss) && typeof cvss.score === 'number' ? cvss.score : null;
  return {
    id,
    url,
    title,
    severity: severity as Severity,
    vulnerableVersions: range,
    cwe: Array.isArray(cwe) ? cwe.filter((item): item is string => typeof item === 'string') : [],
    cvssScore: score,
  };
}

/**
 * Looks up advisories for the given packages with npm's bulk advisory endpoint. Sends
 * only package names and versions. The response is untrusted: entries that do not have
 * the documented shape are rejected.
 */
export async function fetchAdvisories(
  packages: readonly InstalledPackage[],
  registry = DEFAULT_REGISTRY,
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, Advisory[]>> {
  const body: Record<string, string[]> = {};
  for (const pkg of packages) {
    const versions = (body[pkg.name] ??= []);
    if (!versions.includes(pkg.version)) versions.push(pkg.version);
  }
  const advisories = new Map<string, Advisory[]>();
  if (packages.length === 0) return advisories;

  const url = `${registry.replace(/\/+$/, '')}/-/npm/v1/security/advisories/bulk`;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new DepTraceError(
      `Could not reach the advisory service at ${url}: ${error instanceof Error ? error.message : String(error)}. No vulnerabilities were checked.`,
      ExitCode.OperationalError,
      { cause: error },
    );
  }
  if (!response.ok) {
    throw new DepTraceError(
      `The advisory service at ${url} answered HTTP ${String(response.status)}. No vulnerabilities were checked.`,
      ExitCode.OperationalError,
    );
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    throw new DepTraceError(
      `The advisory service at ${url} returned invalid JSON. No vulnerabilities were checked.`,
      ExitCode.OperationalError,
      { cause: error },
    );
  }
  if (!isRecord(data)) {
    throw new DepTraceError(
      `The advisory service at ${url} returned an unexpected response. No vulnerabilities were checked.`,
      ExitCode.OperationalError,
    );
  }
  for (const [name, list] of Object.entries(data)) {
    if (!Object.hasOwn(body, name) || !Array.isArray(list)) continue;
    const parsed = list.map(parseAdvisory).filter((item): item is Advisory => item !== null);
    if (parsed.length > 0) advisories.set(name, parsed);
  }
  return advisories;
}

/** Every installed copy that an advisory's vulnerable range covers, most severe first. */
export function matchVulnerabilities(
  packages: readonly InstalledPackage[],
  advisories: ReadonlyMap<string, Advisory[]>,
): Vulnerability[] {
  const found: Vulnerability[] = [];
  for (const pkg of packages) {
    for (const advisory of advisories.get(pkg.name) ?? []) {
      // includePrerelease: a prerelease inside the range is vulnerable too.
      if (semver.satisfies(pkg.version, advisory.vulnerableVersions, { includePrerelease: true })) {
        found.push({ ...pkg, advisory });
      }
    }
  }
  const rank = (v: Vulnerability) => SEVERITIES.indexOf(v.advisory.severity);
  return found.sort(
    (a, b) =>
      rank(b) - rank(a) ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
      (a.path < b.path ? -1 : a.path > b.path ? 1 : 0) ||
      a.advisory.id - b.advisory.id,
  );
}

export interface FixSuggestion {
  /** Lowest published version above the installed one that no known advisory covers. */
  version: string | null;
  /** Command that applies it, when one command can. */
  command: string | null;
  /** True when the fix is outside the installed version's caret range (may break the API). */
  breaking: boolean;
  note: string;
}

/** Published versions of a package (abbreviated registry metadata), or null if the lookup fails. */
export async function fetchVersions(
  name: string,
  registry = DEFAULT_REGISTRY,
  fetchImpl: typeof fetch = fetch,
): Promise<string[] | null> {
  const url = `${registry.replace(/\/+$/, '')}/${name.replace('/', '%2f')}`;
  try {
    const response = await fetchImpl(url, {
      headers: { accept: 'application/vnd.npm.install-v1+json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (!isRecord(data) || !isRecord(data.versions)) return null;
    return Object.keys(data.versions).filter((version) => semver.valid(version) !== null);
  } catch {
    return null;
  }
}

/** Suggests the smallest update that leaves every known advisory of the package behind. */
export function suggestFix(
  pkg: InstalledPackage,
  advisories: readonly Advisory[],
  published: readonly string[] | null,
): FixSuggestion {
  if (published === null) {
    return {
      version: null,
      command: null,
      breaking: false,
      note: `Could not look up the published versions of ${pkg.name}. Check the advisory for the fixed version.`,
    };
  }
  const fixed = published
    .filter((v) => semver.prerelease(v) === null && semver.gt(v, pkg.version))
    .sort(semver.compare)
    .find(
      (v) =>
        !advisories.some((a) =>
          semver.satisfies(v, a.vulnerableVersions, { includePrerelease: true }),
        ),
    );
  if (fixed === undefined) {
    return {
      version: null,
      command: null,
      breaking: false,
      note: `No published version of ${pkg.name} is outside the vulnerable ranges. Replace or remove the package, or check the advisory for a workaround.`,
    };
  }
  const breaking = !semver.satisfies(fixed, `^${pkg.version}`);
  const caution = breaking
    ? ' This is a major update: check its changelog for breaking changes.'
    : '';
  if (!pkg.direct) {
    return {
      version: fixed,
      command: null,
      breaking,
      note: `${pkg.name} is a transitive dependency. Update the packages that depend on it ("npm explain ${pkg.name}" lists them), or force ${fixed} with "overrides" in package.json.${caution}`,
    };
  }
  if (
    pkg.declaredRange !== null &&
    semver.validRange(pkg.declaredRange) !== null &&
    semver.satisfies(fixed, pkg.declaredRange)
  ) {
    return {
      version: fixed,
      command: `npm update ${pkg.name}`,
      breaking,
      note: `${fixed} is within the range in package.json (${pkg.declaredRange}).${caution}`,
    };
  }
  return {
    version: fixed,
    command: `npm install ${pkg.name}@${fixed}${pkg.dev ? ' --save-dev' : ''}`,
    breaking,
    note: `${fixed} is outside the range in package.json; this command updates it.${caution}`,
  };
}
