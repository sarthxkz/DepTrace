import { CLI_NAME } from '../core/constants.js';
import type { AnalysisResult } from './types.js';

/** Version of the JSON document produced by `deptrace scan --format json`. */
export const JSON_SCHEMA_VERSION = 1;

export interface RepositoryMetadata {
  packageName: string | null;
  packageVersion: string | null;
  git: boolean;
}

/**
 * Serializable view of an analysis. Contains only repository-relative paths
 * (the absolute root is omitted) and uses null instead of undefined.
 */
export function toJsonDocument(
  result: AnalysisResult,
  toolVersion: string,
  repository: RepositoryMetadata,
) {
  return {
    schemaVersion: JSON_SCHEMA_VERSION,
    tool: { name: CLI_NAME, version: toolVersion },
    status: result.status,
    repository,
    settings: result.settings,
    summary: result.summary,
    nodes: result.graph.nodes,
    edges: result.graph.edges,
    cycles: result.cycles,
    externalDependencies: result.external,
    unresolvedDependencies: result.unresolved,
    excludedDependencies: result.excluded,
    diagnostics: result.diagnostics,
  };
}
