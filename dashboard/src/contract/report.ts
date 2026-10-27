/**
 * The dashboard's data contract: the `deptrace report --format json` document
 * (schemaVersion 1), validated before anything is rendered. Imported files are
 * untrusted, so every field the dashboard reads is checked here, including the
 * references between nodes, edges, cycles, layers and violations.
 *
 * The dashboard never imports analyzer code: these types describe the JSON,
 * and a CLI test checks that real analyzer output passes this validator.
 */
import { Checker, quote, ValidationError } from './checker.js';

export const SUPPORTED_SCHEMA_VERSION = 1;

export interface ImportRef {
  specifier: string;
  kind: string;
  typeOnly: boolean;
  line: number;
  column: number;
}

export interface FileRef extends ImportRef {
  file: string;
}

export interface ReportNode {
  id: string;
  extension: string;
  status: string;
  tsconfig: string | null;
}

export interface ReportEdge {
  from: string;
  to: string;
  typeOnly: boolean;
  references: ImportRef[];
}

export interface ReportCycle {
  nodes: string[];
  representativePath: string[];
  edges: ReportEdge[];
  runtime: boolean;
}

export interface ExternalDependency {
  packageName: string;
  builtin: boolean;
  references: FileRef[];
}

export interface UnresolvedDependency extends FileRef {
  reason: string;
}

export interface Diagnostic {
  severity: string;
  code: string;
  message: string;
  file: string | null;
  line: number | null;
  column: number | null;
}

export type Target =
  | { kind: 'file'; path: string }
  | { kind: 'package'; name: string; resolved: boolean }
  | { kind: 'cycle'; files: string[] };

export interface Violation {
  ruleId: string;
  ruleType: string;
  ruleDescription: string;
  severity: 'error' | 'warning';
  file: string;
  line: number | null;
  column: number | null;
  target: Target;
  dependencyKinds: string[];
  typeOnly: boolean;
  references: ImportRef[];
  message: string;
  path: string[] | null;
  fingerprint: string;
  /** Present only when the report was made with --baseline. */
  baselineStatus: 'new' | 'existing' | null;
}

export interface RuleResult {
  id: string;
  type: string;
  description: string;
  severity: 'error' | 'warning' | 'off';
  violations: number;
}

export interface BaselineEntry {
  fingerprint: string;
  ruleId: string;
  file: string;
  target: Target;
  message: string;
}

export interface BaselineSummary {
  file: string;
  new: number;
  existing: number;
  resolved: number;
  resolvedViolations: BaselineEntry[];
}

export interface Layer {
  name: string;
  patterns: string[];
  files: string[];
}

export interface Architecture {
  layers: Layer[];
  unlayeredFiles: string[];
  layerDependencies: { from: string; to: string; edges: number; typeOnlyEdges: number }[];
  /** null: no layer-boundaries rule. undefined: the report predates this field. */
  layerRule: { id: string; severity: string; allowed: Record<string, string[]> } | null | undefined;
  rules: RuleResult[];
  violations: Violation[];
  errors: number;
  warnings: number;
  baseline: BaselineSummary | null;
}

export const SUMMARY_FIELDS = [
  'filesDiscovered',
  'filesParsed',
  'filesWithParseErrors',
  'filesUnreadable',
  'importReferences',
  'internalReferences',
  'externalReferences',
  'externalPackages',
  'excludedReferences',
  'unresolvedReferences',
  'unanalyzableImports',
  'nodes',
  'edges',
  'typeOnlyEdges',
  'cyclicComponents',
  'runtimeCycles',
  'errors',
  'warnings',
  'durationMs',
] as const;

export type Summary = Record<(typeof SUMMARY_FIELDS)[number], number>;

export interface Settings {
  configFile: string | null;
  include: string[];
  exclude: string[];
  builtinExcludedDirectories: string[];
  builtinExcludedFiles: string[];
  extensions: string[];
  tsconfigs: string[];
}

export interface Report {
  schemaVersion: number;
  tool: { name: string; version: string };
  status: string;
  repository: { packageName: string | null; packageVersion: string | null; git: boolean };
  settings: Settings;
  summary: Summary;
  nodes: ReportNode[];
  edges: ReportEdge[];
  cycles: ReportCycle[];
  externalDependencies: ExternalDependency[];
  unresolvedDependencies: UnresolvedDependency[];
  excludedReferences: number;
  diagnostics: Diagnostic[];
  architecture: Architecture;
}

function importRef(c: Checker, value: unknown, at: string): ImportRef {
  const o = c.object(value, at);
  return {
    specifier: c.string(o, 'specifier', at),
    kind: c.string(o, 'kind', at),
    typeOnly: c.boolean(o, 'typeOnly', at),
    line: c.integer(o, 'line', at),
    column: c.integer(o, 'column', at),
  };
}

function fileRef(c: Checker, value: unknown, at: string): FileRef {
  return { ...importRef(c, value, at), file: c.string(c.object(value, at), 'file', at) };
}

function edge(c: Checker, value: unknown, at: string): ReportEdge {
  const o = c.object(value, at);
  return {
    from: c.string(o, 'from', at),
    to: c.string(o, 'to', at),
    typeOnly: c.boolean(o, 'typeOnly', at),
    references: c.array(o, 'references', at, (item, p) => importRef(c, item, p)),
  };
}

export function target(c: Checker, value: unknown, at: string): Target {
  const o = c.object(value, at);
  const kind = c.oneOf(o, 'kind', at, ['file', 'package', 'cycle'] as const);
  if (kind === 'file') return { kind, path: c.string(o, 'path', at) };
  if (kind === 'package') {
    return { kind, name: c.string(o, 'name', at), resolved: c.boolean(o, 'resolved', at) };
  }
  return { kind: 'cycle', files: c.strings(o, 'files', at) };
}

export function violation(c: Checker, value: unknown, at: string): Violation {
  const o = c.object(value, at);
  const status = o.baselineStatus;
  return {
    ruleId: c.string(o, 'ruleId', at),
    ruleType: c.string(o, 'ruleType', at),
    ruleDescription: c.string(o, 'ruleDescription', at),
    severity: c.oneOf(o, 'severity', at, ['error', 'warning'] as const),
    file: c.string(o, 'file', at),
    line: c.nullableInteger(o, 'line', at),
    column: c.nullableInteger(o, 'column', at),
    target: target(c, o.target, `${at}.target`),
    dependencyKinds: c.strings(o, 'dependencyKinds', at),
    typeOnly: c.boolean(o, 'typeOnly', at),
    references: c.array(o, 'references', at, (item, p) => importRef(c, item, p)),
    message: c.string(o, 'message', at),
    path: o.path === null ? null : c.strings(o, 'path', at),
    fingerprint: c.string(o, 'fingerprint', at),
    baselineStatus:
      status === undefined ? null : c.oneOf(o, 'baselineStatus', at, ['new', 'existing'] as const),
  };
}

export function ruleResult(c: Checker, value: unknown, at: string): RuleResult {
  const o = c.object(value, at);
  return {
    id: c.string(o, 'id', at),
    type: c.string(o, 'type', at),
    description: c.string(o, 'description', at),
    severity: c.oneOf(o, 'severity', at, ['error', 'warning', 'off'] as const),
    violations: c.integer(o, 'violations', at),
  };
}

export function baselineSummary(c: Checker, value: unknown, at: string): BaselineSummary {
  const o = c.object(value, at);
  return {
    file: c.string(o, 'file', at),
    new: c.integer(o, 'new', at),
    existing: c.integer(o, 'existing', at),
    resolved: c.integer(o, 'resolved', at),
    resolvedViolations: c.array(o, 'resolvedViolations', at, (item, p) => {
      const entry = c.object(item, p);
      return {
        fingerprint: c.string(entry, 'fingerprint', p),
        ruleId: c.string(entry, 'ruleId', p),
        file: c.string(entry, 'file', p),
        target: target(c, entry.target, `${p}.target`),
        message: c.string(entry, 'message', p),
      };
    }),
  };
}

function architecture(c: Checker, value: unknown, at: string): Architecture {
  const o = c.object(value, at);
  let layerRule: Architecture['layerRule'];
  if (o.layerRule === null) layerRule = null;
  else if (o.layerRule !== undefined) {
    const rule = c.object(o.layerRule, `${at}.layerRule`);
    const allowed = c.object(rule.allowed, `${at}.layerRule.allowed`);
    layerRule = {
      id: c.string(rule, 'id', `${at}.layerRule`),
      severity: c.string(rule, 'severity', `${at}.layerRule`),
      allowed: Object.fromEntries(
        Object.keys(allowed).map((key) => [
          key,
          c.strings(allowed, key, `${at}.layerRule.allowed`),
        ]),
      ),
    };
  }
  return {
    layers: c.array(o, 'layers', at, (item, p) => {
      const layer = c.object(item, p);
      return {
        name: c.string(layer, 'name', p),
        patterns: c.strings(layer, 'patterns', p),
        files: c.strings(layer, 'files', p),
      };
    }),
    unlayeredFiles: c.strings(o, 'unlayeredFiles', at),
    layerDependencies: c.array(o, 'layerDependencies', at, (item, p) => {
      const dependency = c.object(item, p);
      return {
        from: c.string(dependency, 'from', p),
        to: c.string(dependency, 'to', p),
        edges: c.integer(dependency, 'edges', p),
        typeOnlyEdges: c.integer(dependency, 'typeOnlyEdges', p),
      };
    }),
    layerRule,
    rules: c.array(o, 'rules', at, (item, p) => ruleResult(c, item, p)),
    violations: c.array(o, 'violations', at, (item, p) => violation(c, item, p)),
    errors: c.integer(o, 'errors', at),
    warnings: c.integer(o, 'warnings', at),
    baseline: o.baseline === undefined ? null : baselineSummary(c, o.baseline, `${at}.baseline`),
  };
}

/** Structure only; see `checkReferences` for the relations between parts. */
function readReport(c: Checker, value: unknown): Report {
  const o = c.object(value, '$');
  const tool = c.object(o.tool, 'tool');
  const repository = c.object(o.repository, 'repository');
  const settings = c.object(o.settings, 'settings');
  const summary = c.object(o.summary, 'summary');
  return {
    schemaVersion: c.integer(o, 'schemaVersion', '$'),
    tool: { name: c.string(tool, 'name', 'tool'), version: c.string(tool, 'version', 'tool') },
    status: c.string(o, 'status', '$'),
    repository: {
      packageName: c.nullableString(repository, 'packageName', 'repository'),
      packageVersion: c.nullableString(repository, 'packageVersion', 'repository'),
      git: c.boolean(repository, 'git', 'repository'),
    },
    settings: {
      configFile: c.nullableString(settings, 'configFile', 'settings'),
      include: c.strings(settings, 'include', 'settings'),
      exclude: c.strings(settings, 'exclude', 'settings'),
      builtinExcludedDirectories: c.strings(settings, 'builtinExcludedDirectories', 'settings'),
      builtinExcludedFiles: c.strings(settings, 'builtinExcludedFiles', 'settings'),
      extensions: c.strings(settings, 'extensions', 'settings'),
      tsconfigs: c.strings(settings, 'tsconfigs', 'settings'),
    },
    summary: Object.fromEntries(
      SUMMARY_FIELDS.map((field) => [field, c.integer(summary, field, 'summary')]),
    ) as Summary,
    nodes: c.array(o, 'nodes', '$', (item, p) => {
      const node = c.object(item, p);
      return {
        id: c.string(node, 'id', p),
        extension: c.string(node, 'extension', p),
        status: c.string(node, 'status', p),
        tsconfig: c.nullableString(node, 'tsconfig', p),
      };
    }),
    edges: c.array(o, 'edges', '$', (item, p) => edge(c, item, p)),
    cycles: c.array(o, 'cycles', '$', (item, p) => {
      const cycle = c.object(item, p);
      return {
        nodes: c.strings(cycle, 'nodes', p),
        representativePath: c.strings(cycle, 'representativePath', p),
        edges: c.array(cycle, 'edges', p, (e, ep) => edge(c, e, ep)),
        runtime: c.boolean(cycle, 'runtime', p),
      };
    }),
    externalDependencies: c.array(o, 'externalDependencies', '$', (item, p) => {
      const dependency = c.object(item, p);
      return {
        packageName: c.string(dependency, 'packageName', p),
        builtin: c.boolean(dependency, 'builtin', p),
        references: c.array(dependency, 'references', p, (r, rp) => fileRef(c, r, rp)),
      };
    }),
    unresolvedDependencies: c.array(o, 'unresolvedDependencies', '$', (item, p) => ({
      ...fileRef(c, item, p),
      reason: c.string(c.object(item, p), 'reason', p),
    })),
    excludedReferences: c.array(o, 'excludedDependencies', '$', (item, p) => c.object(item, p))
      .length,
    diagnostics: c.array(o, 'diagnostics', '$', (item, p) => {
      const diagnostic = c.object(item, p);
      return {
        severity: c.string(diagnostic, 'severity', p),
        code: c.string(diagnostic, 'code', p),
        message: c.string(diagnostic, 'message', p),
        file: c.nullableString(diagnostic, 'file', p),
        line: c.nullableInteger(diagnostic, 'line', p),
        column: c.nullableInteger(diagnostic, 'column', p),
      };
    }),
    architecture: architecture(c, o.architecture, 'architecture'),
  };
}

/** Rejects graphs whose parts point at nodes that do not exist, and duplicate identities. */
function checkReferences(c: Checker, report: Report): void {
  const ids = new Set<string>();
  report.nodes.forEach((node, index) => {
    if (ids.has(node.id))
      c.problem(`nodes[${String(index)}].id`, `duplicate node id ${quote(node.id)}`);
    ids.add(node.id);
  });
  const known = (id: string, at: string) => {
    if (!ids.has(id)) c.problem(at, `refers to ${quote(id)}, which is not a node`);
  };
  const edgeKeys = new Set<string>();
  report.edges.forEach((e, index) => {
    known(e.from, `edges[${String(index)}].from`);
    known(e.to, `edges[${String(index)}].to`);
    const key = `${e.from}\0${e.to}`;
    if (edgeKeys.has(key))
      c.problem(`edges[${String(index)}]`, `duplicate edge ${quote(e.from)} -> ${quote(e.to)}`);
    edgeKeys.add(key);
  });
  report.cycles.forEach((cycle, index) => {
    cycle.nodes.forEach((id, i) => {
      known(id, `cycles[${String(index)}].nodes[${String(i)}]`);
    });
    cycle.representativePath.forEach((id, i) => {
      known(id, `cycles[${String(index)}].representativePath[${String(i)}]`);
    });
    cycle.edges.forEach((e, i) => {
      if (!edgeKeys.has(`${e.from}\0${e.to}`)) {
        c.problem(`cycles[${String(index)}].edges[${String(i)}]`, 'is not an edge of the graph');
      }
    });
  });
  report.externalDependencies.forEach((dependency, index) => {
    dependency.references.forEach((r, i) => {
      known(r.file, `externalDependencies[${String(index)}].references[${String(i)}].file`);
    });
  });
  report.unresolvedDependencies.forEach((r, index) => {
    known(r.file, `unresolvedDependencies[${String(index)}].file`);
  });

  const { architecture: arch } = report;
  const layered = new Map<string, string>();
  arch.layers.forEach((layer, index) => {
    layer.files.forEach((file, i) => {
      const at = `architecture.layers[${String(index)}].files[${String(i)}]`;
      known(file, at);
      const other = layered.get(file);
      if (other !== undefined) c.problem(at, `${quote(file)} is already in layer ${quote(other)}`);
      layered.set(file, layer.name);
    });
  });
  arch.unlayeredFiles.forEach((file, i) => {
    const at = `architecture.unlayeredFiles[${String(i)}]`;
    known(file, at);
    if (layered.has(file)) c.problem(at, `${quote(file)} is also in a layer`);
  });
  const fingerprints = new Set<string>();
  arch.violations.forEach((v, index) => {
    const at = `architecture.violations[${String(index)}]`;
    known(v.file, `${at}.file`);
    if (v.target.kind === 'file') known(v.target.path, `${at}.target.path`);
    if (v.target.kind === 'cycle')
      v.target.files.forEach((f, i) => {
        known(f, `${at}.target.files[${String(i)}]`);
      });
    v.path?.forEach((id, i) => {
      known(id, `${at}.path[${String(i)}]`);
    });
    if (fingerprints.has(v.fingerprint))
      c.problem(`${at}.fingerprint`, `duplicate fingerprint ${quote(v.fingerprint)}`);
    fingerprints.add(v.fingerprint);
    if ((v.baselineStatus === null) !== (arch.baseline === null)) {
      c.problem(
        `${at}.baselineStatus`,
        arch.baseline
          ? 'missing although the report has a baseline section'
          : 'present without a baseline section',
      );
    }
  });
}

/**
 * Validates a parsed `deptrace report --format json` document. Throws a
 * ValidationError listing (at most 20) problems with their JSON locations.
 */
export function parseReport(value: unknown): Report {
  const c = new Checker();
  const version =
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>).schemaVersion
      : undefined;
  if (version !== SUPPORTED_SCHEMA_VERSION) {
    throw new ValidationError([
      `schemaVersion: ${version === undefined ? 'missing' : JSON.stringify(version)}; this dashboard reads version ${String(SUPPORTED_SCHEMA_VERSION)}${typeof version === 'number' && version > SUPPORTED_SCHEMA_VERSION ? ' (the report was written by a newer DepTrace)' : ''}`,
    ]);
  }
  return c.run(() => {
    const report = readReport(c, value);
    // Relations are only meaningful once the structure is right.
    c.assertClean();
    checkReferences(c, report);
    return report;
  });
}
