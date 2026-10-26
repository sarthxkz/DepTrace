import { PRODUCT_NAME } from '../core/constants.js';
import { CONFIG_VERSION } from './schema.js';

/** Renders the starter configuration. Output depends only on `projectName`. */
export function renderStarterConfig(projectName: string): string {
  return `version: ${String(CONFIG_VERSION)}

# ${PRODUCT_NAME} configuration (format version ${String(CONFIG_VERSION)}).
# Reference: docs/configuration.md and docs/rules.md.

project:
  name: ${JSON.stringify(projectName)}

# Which files the dependency analysis covers. Patterns are globs relative to
# this directory. Only .ts .tsx .js .jsx .mts .cts .mjs .cjs files are analyzed.
# node_modules, dist, build, coverage, .git, .next, .turbo and *.min.js are
# always excluded.
analysis:
  include:
    - "**/*"
  exclude: []
  # exclude:
  #   - "**/*.test.ts"
  #   - "scripts/**"

# Architecture rules, evaluated by "deptrace check". No rules are active until
# you add them. Example (importer layer -> layers it may import):
#
# layers:
#   - name: ui
#     files: ["src/ui/**"]
#   - name: domain
#     files: ["src/domain/**"]
#
# rules:
#   layer-boundaries:
#     severity: error
#     allowed:
#       ui: [domain]
#       domain: []
#   circular-dependencies:
#     severity: warning
rules: []
`;
}
