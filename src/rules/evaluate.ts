import type { AnalysisResult } from '../analysis/types.js';
import { createRuleContext, RULE_REGISTRY, type RuleDefinition } from './registry.js';
import type { Policy, PolicyEvaluation, Rule, RuleResult, RuleType, Violation } from './types.js';

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function describeRule(rule: Rule): string {
  const definition = RULE_REGISTRY[rule.type] as RuleDefinition<RuleType>;
  return rule.description ?? definition.describe(rule);
}

/**
 * Evaluates every enabled rule against an analysis result. Rules with
 * severity "off" are listed but not evaluated. Pure: no I/O, no printing.
 */
export function evaluatePolicy(result: AnalysisResult, policy: Policy): PolicyEvaluation {
  const context = createRuleContext(result, policy);
  const byFingerprint = new Map<string, Violation>();
  const rules: RuleResult[] = [];

  for (const rule of policy.rules) {
    const description = describeRule(rule);
    let count = 0;
    if (rule.severity !== 'off') {
      const definition = RULE_REGISTRY[rule.type] as RuleDefinition<RuleType>;
      const base = {
        ruleId: rule.id,
        ruleType: rule.type,
        ruleDescription: description,
        severity: rule.severity,
      };
      for (const violation of definition.evaluate(rule, context, base)) {
        // A rule reports each dependency once; the fingerprint is its identity.
        if (byFingerprint.has(violation.fingerprint)) continue;
        byFingerprint.set(violation.fingerprint, violation);
        count++;
      }
    }
    rules.push({
      id: rule.id,
      type: rule.type,
      description,
      severity: rule.severity,
      violations: count,
    });
  }

  const violations = [...byFingerprint.values()].sort(
    (a, b) =>
      compare(a.file, b.file) ||
      (a.line ?? 0) - (b.line ?? 0) ||
      (a.column ?? 0) - (b.column ?? 0) ||
      compare(a.ruleId, b.ruleId) ||
      compare(a.fingerprint, b.fingerprint),
  );
  return {
    rules,
    violations,
    errors: violations.filter((violation) => violation.severity === 'error').length,
    warnings: violations.filter((violation) => violation.severity === 'warning').length,
  };
}

/** Number of files per layer, and the internal edges between different layers. */
export function summarizeLayers(result: AnalysisResult, policy: Policy) {
  const { layerOf } = createRuleContext(result, policy);
  const layers = policy.layers.map((layer) => ({
    name: layer.name,
    files: result.graph.nodes
      .filter((node) => layerOf(node.id) === layer.name)
      .map((node) => node.id),
  }));
  const unlayered = result.graph.nodes
    .filter((node) => layerOf(node.id) === null)
    .map((node) => node.id);
  const counts = new Map<
    string,
    { from: string; to: string; edges: number; typeOnlyEdges: number }
  >();
  for (const edge of result.graph.edges) {
    const from = layerOf(edge.from);
    const to = layerOf(edge.to);
    if (from === null || to === null || from === to) continue;
    const key = `${from}\0${to}`;
    const entry = counts.get(key) ?? { from, to, edges: 0, typeOnlyEdges: 0 };
    entry.edges++;
    if (edge.typeOnly) entry.typeOnlyEdges++;
    counts.set(key, entry);
  }
  const order = new Map(policy.layers.map((layer, index) => [layer.name, index]));
  const dependencies = [...counts.values()].sort(
    (a, b) =>
      (order.get(a.from) ?? 0) - (order.get(b.from) ?? 0) ||
      (order.get(a.to) ?? 0) - (order.get(b.to) ?? 0),
  );
  return { layers, unlayered, dependencies };
}
