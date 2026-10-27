import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'tsup';
import { build as buildDashboard } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Build once so integration tests exercise the real dist/index.js and dist/dashboard.
export default async function setup(): Promise<void> {
  await build({ silent: true });
  await buildDashboard({
    configFile: path.join(ROOT, 'dashboard', 'vite.config.ts'),
    logLevel: 'error',
  });
}
