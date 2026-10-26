import { patternProblem } from './patterns.js';
import {
  RULE_TYPES,
  type Layer,
  type Policy,
  type Rule,
  type RuleType,
  type Severity,
} from './types.js';

const SEVERITIES: Severity[] = ['error', 'warning', 'off'];
const NAME = /^[a-z0-9][a-z0-9-]*$/;
const NAMED_RULES = new Set<RuleType>([
  'forbidden-imports',
  'forbidden-packages',
  'module-boundaries',
]);
const COMMON_KEYS = ['severity', 'description', 'exclude', 'ignore-type-only'];
const RULE_KEYS: Record<RuleType, string[]> = {
  'layer-boundaries': [...COMMON_KEYS, 'allowed'],
  'forbidden-imports': [...COMMON_KEYS, 'name', 'from', 'to'],
  'forbidden-packages': [...COMMON_KEYS, 'name', 'from', 'packages'],
  'module-boundaries': [...COMMON_KEYS, 'name', 'modules', 'public'],
  'circular-dependencies': COMMON_KEYS,
};

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const quoteList = (items: readonly string[]) => items.map((item) => `"${item}"`).join(', ');

/** Collects problems while reading untrusted configuration values. */
class Reader {
  readonly problems: string[] = [];

  problem(at: string, message: string): void {
    this.problems.push(`${at}: ${message}`);
  }

  unknownKeys(value: Raw, at: string, allowed: readonly string[]): void {
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) {
        this.problem(`${at}.${key}`, `unknown setting (supported: ${quoteList(allowed)})`);
      }
    }
  }

  string(value: unknown, at: string): string | null {
    if (typeof value === 'string' && value.trim() !== '') return value;
    this.problem(at, 'must be a non-empty string');
    return null;
  }

  patterns(value: unknown, at: string, fallback?: string[]): string[] {
    if (value === undefined && fallback) return fallback;
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
      this.problem(at, 'must be a list of glob strings');
      return [];
    }
    const patterns = value as string[];
    for (const [index, pattern] of patterns.entries()) {
      const problem = patternProblem(pattern);
      if (problem) this.problem(`${at}[${String(index)}]`, `pattern "${pattern}" ${problem}`);
    }
    return patterns;
  }

  nonEmptyPatterns(value: unknown, at: string): string[] {
    const patterns = this.patterns(value, at);
    if (Array.isArray(value) && value.length === 0) this.problem(at, 'must not be empty');
    return patterns;
  }
}

function readLayers(reader: Reader, value: unknown): Layer[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    reader.problem('layers', 'must be a list of { name, files } entries');
    return [];
  }
  const layers: Layer[] = [];
  for (const [index, entry] of value.entries()) {
    const at = `layers[${String(index)}]`;
    if (!isRecord(entry)) {
      reader.problem(at, 'must be a mapping with "name" and "files"');
      continue;
    }
    reader.unknownKeys(entry, at, ['name', 'files']);
    const name = reader.string(entry.name, `${at}.name`);
    if (name !== null && !NAME.test(name)) {
      reader.problem(`${at}.name`, `"${name}" must use lowercase letters, digits and "-"`);
    }
    if (name !== null && layers.some((layer) => layer.name === name)) {
      reader.problem(`${at}.name`, `duplicate layer name "${name}"`);
    }
    const files = reader.nonEmptyPatterns(entry.files, `${at}.files`);
    if (name !== null) layers.push({ name, files });
  }
  return layers;
}

function readRule(
  reader: Reader,
  type: RuleType,
  value: unknown,
  at: string,
  layers: Layer[],
): Rule | null {
  if (!isRecord(value)) {
    reader.problem(at, 'must be a mapping of settings');
    return null;
  }
  reader.unknownKeys(value, at, RULE_KEYS[type]);

  let id: string = type;
  if (NAMED_RULES.has(type)) {
    const name = reader.string(value.name, `${at}.name`);
    if (name !== null && !NAME.test(name)) {
      reader.problem(`${at}.name`, `"${name}" must use lowercase letters, digits and "-"`);
    }
    id = `${type}/${name ?? '?'}`;
  }

  const severity = value.severity ?? 'error';
  if (!SEVERITIES.includes(severity as Severity)) {
    reader.problem(`${at}.severity`, `must be one of ${quoteList(SEVERITIES)}`);
  }
  if (value.description !== undefined) reader.string(value.description, `${at}.description`);
  const ignoreTypeOnly = value['ignore-type-only'] ?? false;
  if (typeof ignoreTypeOnly !== 'boolean')
    reader.problem(`${at}.ignore-type-only`, 'must be true or false');

  const base = {
    id,
    description: typeof value.description === 'string' ? value.description : null,
    severity: severity as Severity,
    exclude: reader.patterns(value.exclude, `${at}.exclude`, []),
    ignoreTypeOnly: ignoreTypeOnly === true,
  };

  switch (type) {
    case 'layer-boundaries': {
      if (layers.length === 0) reader.problem(at, 'requires "layers" to be defined');
      const names = layers.map((layer) => layer.name);
      const allowed: Record<string, string[]> = {};
      if (!isRecord(value.allowed)) {
        reader.problem(
          `${at}.allowed`,
          'must map each layer to the layers it may import, e.g. { presentation: [application], domain: [] }',
        );
      } else {
        for (const [layer, targets] of Object.entries(value.allowed)) {
          if (!names.includes(layer)) {
            reader.problem(
              `${at}.allowed.${layer}`,
              `unknown layer (defined: ${quoteList(names)})`,
            );
          }
          if (!Array.isArray(targets) || targets.some((target) => typeof target !== 'string')) {
            reader.problem(
              `${at}.allowed.${layer}`,
              'must be a list of layer names (use [] for none)',
            );
            continue;
          }
          for (const [index, target] of (targets as string[]).entries()) {
            if (!names.includes(target)) {
              reader.problem(
                `${at}.allowed.${layer}[${String(index)}]`,
                `unknown layer "${target}" (defined: ${quoteList(names)})`,
              );
            }
          }
          allowed[layer] = targets as string[];
        }
        for (const name of names) {
          if (!(name in value.allowed)) {
            reader.problem(
              `${at}.allowed`,
              `missing layer "${name}" (list the layers it may import, or [] for none)`,
            );
          }
        }
      }
      return { ...base, type, allowed };
    }
    case 'forbidden-imports':
      return {
        ...base,
        type,
        from: reader.nonEmptyPatterns(value.from, `${at}.from`),
        to: reader.nonEmptyPatterns(value.to, `${at}.to`),
      };
    case 'forbidden-packages': {
      const packages = Array.isArray(value.packages) ? value.packages : null;
      if (
        !packages ||
        packages.length === 0 ||
        packages.some((p) => typeof p !== 'string' || p === '')
      ) {
        reader.problem(`${at}.packages`, 'must be a non-empty list of package names or globs');
      }
      return {
        ...base,
        type,
        from: reader.patterns(value.from, `${at}.from`, ['**']),
        packages: (packages ?? []).filter((p): p is string => typeof p === 'string'),
      };
    }
    case 'module-boundaries':
      return {
        ...base,
        type,
        modules: reader.nonEmptyPatterns(value.modules, `${at}.modules`),
        public: reader.patterns(value.public, `${at}.public`, []),
      };
    case 'circular-dependencies':
      return { ...base, type };
  }
}

function readRules(reader: Reader, value: unknown, layers: Layer[]): Rule[] {
  // `rules: []` (the format before rules existed) means no rules.
  if (value === undefined || (Array.isArray(value) && value.length === 0)) return [];
  if (!isRecord(value)) {
    reader.problem('rules', `must be a mapping of rule types (${quoteList(RULE_TYPES)})`);
    return [];
  }
  reader.unknownKeys(value, 'rules', RULE_TYPES);
  const rules: Rule[] = [];
  for (const type of RULE_TYPES) {
    const entry = value[type];
    if (entry === undefined) continue;
    if (!NAMED_RULES.has(type)) {
      const rule = readRule(reader, type, entry, `rules.${type}`, layers);
      if (rule) rules.push(rule);
      continue;
    }
    if (!Array.isArray(entry)) {
      reader.problem(`rules.${type}`, 'must be a list of rules, each with a "name"');
      continue;
    }
    for (const [index, item] of entry.entries()) {
      const rule = readRule(reader, type, item, `rules.${type}[${String(index)}]`, layers);
      if (!rule) continue;
      if (rules.some((existing) => existing.id === rule.id)) {
        reader.problem(`rules.${type}[${String(index)}].name`, `duplicate rule id "${rule.id}"`);
      }
      rules.push(rule);
    }
  }
  return rules;
}

/** Reads and validates `layers` and `rules`. The policy is only usable when `problems` is empty. */
export function parsePolicy(
  layers: unknown,
  rules: unknown,
): { policy: Policy; problems: string[] } {
  const reader = new Reader();
  const parsedLayers = readLayers(reader, layers);
  const parsedRules = readRules(reader, rules, parsedLayers);
  return { policy: { layers: parsedLayers, rules: parsedRules }, problems: reader.problems };
}
