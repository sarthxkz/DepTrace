import type { DependencyKind, ImportReference } from '../analysis/types.js';

export type Severity = 'error' | 'warning' | 'off';

export const RULE_TYPES = [
  'layer-boundaries',
  'forbidden-imports',
  'forbidden-packages',
  'module-boundaries',
  'circular-dependencies',
] as const;

export type RuleType = (typeof RULE_TYPES)[number];

export interface Layer {
  name: string;
  /** Globs (root-relative). A file belongs to the first layer whose patterns match. */
  files: string[];
}

interface BaseRule {
  /** Stable id: the type, plus `/<name>` for named rules (e.g. `forbidden-imports/no-ui`). */
  id: string;
  description: string | null;
  severity: Severity;
  /**
   * Files exempt from this rule: their imports are not checked. For
   * circular-dependencies, matching files are removed from cycle detection.
   */
  exclude: string[];
  /** When true, type-only imports are not checked. */
  ignoreTypeOnly: boolean;
}

export interface LayerBoundariesRule extends BaseRule {
  type: 'layer-boundaries';
  /** Importer layer → layers it may import. Imports within a layer are always allowed. */
  allowed: Record<string, string[]>;
}

export interface ForbiddenImportsRule extends BaseRule {
  type: 'forbidden-imports';
  from: string[];
  to: string[];
}

export interface ForbiddenPackagesRule extends BaseRule {
  type: 'forbidden-packages';
  from: string[];
  /** Package name globs, e.g. `express`, `@nestjs/*`, `fs` (built-ins without `node:`). */
  packages: string[];
}

export interface ModuleBoundariesRule extends BaseRule {
  type: 'module-boundaries';
  /** Directory globs; every matching directory is one module (e.g. `src/features/*`). */
  modules: string[];
  /** Globs relative to a module directory that other modules may import (e.g. `index.ts`). */
  public: string[];
}

export interface CircularDependenciesRule extends BaseRule {
  type: 'circular-dependencies';
}

export type Rule =
  | LayerBoundariesRule
  | ForbiddenImportsRule
  | ForbiddenPackagesRule
  | ModuleBoundariesRule
  | CircularDependenciesRule;

export interface Policy {
  layers: Layer[];
  /** In configuration order: rule types in RULE_TYPES order, named rules as listed. */
  rules: Rule[];
}

export type ViolationTarget =
  | { kind: 'file'; path: string }
  | { kind: 'package'; name: string; resolved: boolean }
  | { kind: 'cycle'; files: string[] };

export interface Violation {
  ruleId: string;
  ruleType: RuleType;
  /** What the rule enforces. */
  ruleDescription: string;
  severity: 'error' | 'warning';
  /** Importing file (for cycles: the first file of the component). */
  file: string;
  line: number | null;
  column: number | null;
  target: ViolationTarget;
  dependencyKinds: DependencyKind[];
  typeOnly: boolean;
  /** The imports that cause the violation. */
  references: ImportReference[];
  /** Human-readable explanation. */
  message: string;
  /** How to fix it, derived from the rule and the configuration. */
  suggestion: string;
  /** Dependency path, when meaningful (a cycle, or importer → imported). */
  path: string[] | null;
  /** Stable identity: does not change when lines move or the repository is relocated. */
  fingerprint: string;
  metadata: Record<string, string>;
}

export interface RuleResult {
  id: string;
  type: RuleType;
  description: string;
  severity: Severity;
  violations: number;
}

export interface PolicyEvaluation {
  rules: RuleResult[];
  /** Sorted by file, line, column, rule id, then fingerprint. */
  violations: Violation[];
  errors: number;
  warnings: number;
}
