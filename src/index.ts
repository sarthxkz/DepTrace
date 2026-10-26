#!/usr/bin/env node
import { createRequire } from 'node:module';
import { run } from './cli/index.js';

// package.json sits one level above both src/ (dev) and dist/ (built).
const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

process.once('SIGINT', () => {
  process.stderr.write('\nAborted.\n');
  process.exit(130);
});

process.exitCode = await run(process.argv.slice(2), version);
