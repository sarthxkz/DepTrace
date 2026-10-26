import { build } from 'tsup';

// Build once so integration tests exercise the real dist/index.js.
export default async function setup(): Promise<void> {
  await build({ silent: true });
}
