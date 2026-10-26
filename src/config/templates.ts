import { PRODUCT_NAME } from '../core/constants.js';
import { CONFIG_VERSION } from './schema.js';

/** Renders the starter configuration. Output depends only on `projectName`. */
export function renderStarterConfig(projectName: string): string {
  return `version: ${String(CONFIG_VERSION)}

# ${PRODUCT_NAME} configuration (format version ${String(CONFIG_VERSION)}).
# Read by "deptrace scan", "deptrace deps" and "deptrace path".

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

# Architecture rules are not implemented yet. Keep this list empty.
rules: []
`;
}
