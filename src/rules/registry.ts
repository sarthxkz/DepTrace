import { buildGraph, findCycles, type GraphLink } from '../analysis/graph.js';
import { packageNameOf } from '../analysis/resolver.js';
import type { AnalysisResult, GraphEdge, ImportReference } from '../analysis/types.js';
import { fingerprint } from './fingerprint.js';
import { createLayerResolver, createModuleResolver } from './layers.js';
import { compileMatcher } from './patterns.js';
import type { Policy, Rule, RuleType, Violation } from './types.js';

export interface RuleContext {
  result: AnalysisResult;
  policy: Policy;
  layerOf: (file: string) => string | null;
}

type RuleOf<T extends RuleType> = Extract<Rule, { type: T }>;

/** Rule fields every violation shares. */
type ViolationBase = Pick<Violation, 'ruleId' | 'ruleType' | 'ruleDescription' | 'severity'>;

export interface RuleDefinition<T extends RuleType> {
  type: T;
  /** Default description; a rule's own `description` replaces it. */
  describe(rule: RuleOf<T>): string;
  evaluate(rule: RuleOf<T>, context: RuleContext, base: ViolationBase): Violation[];
}

const list = (items: readonly string[]) => (items.length > 0 ? items.join(', ') : 'none');

/** References of an edge that the rule checks (all, or only runtime ones). */
function checkedReferences(edge: GraphEdge, ignoreTypeOnly: boolean): ImportReference[] {
  return ignoreTypeOnly
    ? edge.references.filter((reference) => !reference.typeOnly)
    : edge.references;
}

function edgeViolation(
  base: ViolationBase,
  edge: GraphEdge,
  references: ImportReference[],
  message: string,
  metadata: Record<string, string> = {},
): Violation {
  const [first] = references;
  return {
    ...base,
    file: edge.from,
    line: first?.line ?? null,
    column: first?.column ?? null,
    target: { kind: 'file', path: edge.to },
    dependencyKinds: [...new Set(references.map((reference) => reference.kind))].sort(),
    typeOnly: references.every((reference) => reference.typeOnly),
    references,
    message,
    path: [edge.from, edge.to],
    fingerprint: fingerprint(base.ruleId, edge.from, edge.to),
    metadata,
  };
}

/** Evaluates `check` on every internal edge that is not exempt. */
function evaluateEdges(
  rule: Rule,
  context: RuleContext,
  check: (edge: GraphEdge, references: ImportReference[]) => Violation | null,
): Violation[] {
  const excluded = compileMatcher(rule.exclude);
  const violations: Violation[] = [];
  for (const edge of context.result.graph.edges) {
    // `exclude` exempts importing files: their imports are not checked.
    if (edge.from === edge.to || excluded(edge.from)) continue;
    const references = checkedReferences(edge, rule.ignoreTypeOnly);
    if (references.length === 0) continue;
    const violation = check(edge, references);
    if (violation) violations.push(violation);
  }
  return violations;
}

const layerBoundaries: RuleDefinition<'layer-boundaries'> = {
  type: 'layer-boundaries',
  describe: (rule) =>
    `Layers may only import the layers they are allowed to: ${Object.entries(rule.allowed)
      .map(([layer, targets]) => `${layer} -> [${targets.join(', ')}]`)
      .join('; ')}`,
  evaluate: (rule, context, base) =>
    evaluateEdges(rule, context, (edge, references) => {
      const from = context.layerOf(edge.from);
      const to = context.layerOf(edge.to);
      if (from === null || to === null || from === to) return null;
      const allowed = rule.allowed[from] ?? [];
      if (allowed.includes(to)) return null;
      return edgeViolation(
        base,
        edge,
        references,
        `Layer "${from}" must not depend on layer "${to}" (allowed for "${from}": ${list(allowed)}). ${edge.from} imports ${edge.to}.`,
        { fromLayer: from, toLayer: to },
      );
    }),
};

const forbiddenImports: RuleDefinition<'forbidden-imports'> = {
  type: 'forbidden-imports',
  describe: (rule) =>
    `Files matching ${list(rule.from)} must not import files matching ${list(rule.to)}`,
  evaluate: (rule, context, base) => {
    const from = compileMatcher(rule.from);
    const to = compileMatcher(rule.to);
    return evaluateEdges(rule, context, (edge, references) =>
      from(edge.from) && to(edge.to)
        ? edgeViolation(
            base,
            edge,
            references,
            `${edge.from} must not import ${edge.to} (rule "${base.ruleId}": ${base.ruleDescription}).`,
          )
        : null,
    );
  },
};

const forbiddenPackages: RuleDefinition<'forbidden-packages'> = {
  type: 'forbidden-packages',
  describe: (rule) =>
    `Files matching ${list(rule.from)} must not import the packages ${list(rule.packages)}`,
  evaluate: (rule, context, base) => {
    const from = compileMatcher(rule.from);
    const excluded = compileMatcher(rule.exclude);
    const forbidden = compileMatcher(rule.packages);
    // Unresolved bare specifiers still name a package: the import is in the code even
    // when the package is not installed where the scan runs.
    const imports = [
      ...context.result.external.flatMap((entry) =>
        entry.references.map((reference) => ({
          ...reference,
          packageName: entry.packageName,
          resolved: true,
        })),
      ),
      ...context.result.unresolved
        .filter((reference) => reference.reason === 'package-not-found')
        .map((reference) => ({
          ...reference,
          packageName: packageNameOf(reference.specifier),
          resolved: false,
        })),
    ];
    const grouped = new Map<string, typeof imports>();
    for (const item of imports) {
      if (!from(item.file) || excluded(item.file) || !forbidden(item.packageName)) continue;
      if (rule.ignoreTypeOnly && item.typeOnly) continue;
      const key = `${item.file}\0${item.packageName}`;
      grouped.set(key, [...(grouped.get(key) ?? []), item]);
    }
    return [...grouped.values()].map((items) => {
      const [first] = items as [(typeof items)[number], ...typeof items];
      const references = items
        .map(({ specifier, kind, typeOnly, line, column }) => ({
          specifier,
          kind,
          typeOnly,
          line,
          column,
        }))
        .sort((a, b) => a.line - b.line || a.column - b.column);
      return {
        ...base,
        file: first.file,
        line: references[0]?.line ?? null,
        column: references[0]?.column ?? null,
        target: {
          kind: 'package',
          name: first.packageName,
          resolved: items.some((item) => item.resolved),
        },
        dependencyKinds: [...new Set(references.map((reference) => reference.kind))].sort(),
        typeOnly: references.every((reference) => reference.typeOnly),
        references,
        message: `${first.file} must not import the package "${first.packageName}" (rule "${base.ruleId}").`,
        path: null,
        fingerprint: fingerprint(base.ruleId, first.file, `package:${first.packageName}`),
        metadata: {},
      } satisfies Violation;
    });
  },
};

const moduleBoundaries: RuleDefinition<'module-boundaries'> = {
  type: 'module-boundaries',
  describe: (rule) =>
    `Modules (${list(rule.modules)}) may only import other modules through their public files (${list(rule.public)})`,
  evaluate: (rule, context, base) => {
    const moduleOf = createModuleResolver(rule.modules);
    const isPublic = compileMatcher(rule.public);
    return evaluateEdges(rule, context, (edge, references) => {
      const from = moduleOf(edge.from);
      const to = moduleOf(edge.to);
      if (from === null || to === null || from === to) return null;
      if (isPublic(edge.to.slice(to.length + 1))) return null;
      return edgeViolation(
        base,
        edge,
        references,
        `Module "${from}" may only use the public files of module "${to}" (${list(rule.public)}). ${edge.from} imports ${edge.to}.`,
        { fromModule: from, toModule: to },
      );
    });
  },
};

const circularDependencies: RuleDefinition<'circular-dependencies'> = {
  type: 'circular-dependencies',
  describe: (rule) =>
    `Files must not form circular dependencies${rule.ignoreTypeOnly ? ' (type-only imports ignored)' : ''}`,
  evaluate: (rule, context, base) => {
    const { graph } = context.result;
    const excluded = compileMatcher(rule.exclude);
    // Recompute cycles on the graph this rule sees: excluded files (as importer or
    // imported) and ignored type-only imports are removed.
    const links: GraphLink[] = graph.edges.flatMap((edge) =>
      excluded(edge.from) || excluded(edge.to)
        ? []
        : checkedReferences(edge, rule.ignoreTypeOnly).map((reference) => ({
            from: edge.from,
            to: edge.to,
            reference,
          })),
    );
    return findCycles(buildGraph(graph.nodes, links)).cycles.map((cycle) => {
      const [file = ''] = cycle.nodes;
      const firstEdge = cycle.edges.find((edge) => edge.from === file);
      const reference = firstEdge?.references[0];
      const references = cycle.edges.flatMap((edge) => edge.references);
      return {
        ...base,
        file,
        line: reference?.line ?? null,
        column: reference?.column ?? null,
        target: { kind: 'cycle', files: cycle.nodes },
        dependencyKinds: [...new Set(references.map((r) => r.kind))].sort(),
        typeOnly: !cycle.runtime,
        references: firstEdge?.references ?? [],
        message: `Circular dependency between ${String(cycle.nodes.length)} file(s): ${cycle.representativePath.join(' -> ')}${cycle.nodes.length > 2 ? ' (one representative cycle; see the component files)' : ''}.`,
        path: cycle.representativePath,
        fingerprint: fingerprint(base.ruleId, ...cycle.nodes),
        metadata: { componentSize: String(cycle.nodes.length), edges: String(cycle.edges.length) },
      } satisfies Violation;
    });
  },
};

/** Every supported rule type and its evaluator. */
export const RULE_REGISTRY: { [T in RuleType]: RuleDefinition<T> } = {
  'layer-boundaries': layerBoundaries,
  'forbidden-imports': forbiddenImports,
  'forbidden-packages': forbiddenPackages,
  'module-boundaries': moduleBoundaries,
  'circular-dependencies': circularDependencies,
};

export function createRuleContext(result: AnalysisResult, policy: Policy): RuleContext {
  return { result, policy, layerOf: createLayerResolver(policy.layers) };
}
