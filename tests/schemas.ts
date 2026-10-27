import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { ValidateFunction } from 'ajv';
import { FIXTURES } from './helpers.js';

// The ajv packages are CommonJS modules exporting `default`; require() gives them correct types.
const require = createRequire(import.meta.url);
const { default: Ajv } = require('ajv') as typeof import('ajv');
const { default: AjvDraft04 } = require('ajv-draft-04') as typeof import('ajv-draft-04');
const { default: addFormats } = require('ajv-formats') as typeof import('ajv-formats');

const schema = (name: string) =>
  JSON.parse(readFileSync(path.join(FIXTURES, 'schemas', name), 'utf8')) as object;

/** The official OASIS SARIF 2.1.0 schema (JSON Schema draft-04), with format checks. */
export function sarifValidator(): ValidateFunction {
  const ajv = new AjvDraft04({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema('sarif-schema-2.1.0.json'));
}

/** SchemaStore's GitHub Actions workflow schema (JSON Schema draft-07). */
export function workflowValidator(): ValidateFunction {
  return new Ajv({ allErrors: true, strict: false }).compile(schema('github-workflow.json'));
}
