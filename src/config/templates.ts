import { PRODUCT_NAME } from '../core/constants.js';
import { CONFIG_VERSION } from './schema.js';

/** Renders the starter configuration. Output depends only on `projectName`. */
export function renderStarterConfig(projectName: string): string {
  return `version: ${String(CONFIG_VERSION)}

# ${PRODUCT_NAME} configuration (format version ${String(CONFIG_VERSION)}).
#
# This is a Phase 1 starter template. Architecture analysis and rules are
# not implemented yet: no current command reads this file, and the settings
# below are placeholders for future versions.

project:
  name: ${JSON.stringify(projectName)}

# File patterns intended for future analysis. Not used by any command yet.
analysis:
  include:
    - src/**/*.ts
    - src/**/*.tsx
  exclude:
    - node_modules/**
    - dist/**
    - coverage/**

# Architecture rules are not supported in this version. Keep this list empty.
rules: []
`;
}
