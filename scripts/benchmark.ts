/**
 * Reproducible benchmark for the dependency analysis engine.
 *
 *   npm run bench                         # synthetic repositories of 1 000 and 10 000 files
 *   npm run bench -- --files 500,20000    # custom sizes
 *   npm run bench -- --dir <path>         # an existing repository
 *   npm run bench -- --generate <dir> --files 5000   # only write the synthetic repository
 *
 * Synthetic repositories are generated from a fixed seed, so every run analyzes
 * identical input. Each analysis runs in a fresh child process so its peak
 * memory (maxRSS) is measured in isolation.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeRepository } from '../src/analysis/analyze.js';
import { DEFAULT_INCLUDE } from '../src/analysis/discovery.js';

interface Measurement {
  files: number;
  nodes: number;
  edges: number;
  importReferences: number;
  cycles: number;
  durationMs: number;
  maxRssMb: number;
}

/** Deterministic pseudo-random numbers (mulberry32). */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Writes a synthetic TypeScript repository with `count` files into `root`. */
export function generateRepository(root: string, count: number): void {
  const next = random(20261026);
  const fileName = (index: number) => `src/m${String(Math.floor(index / 50))}/f${String(index)}.ts`;
  const write = (file: string, content: string) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  };
  write(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        module: 'ESNext',
        moduleResolution: 'Bundler',
        paths: { '@/*': ['./src/*'] },
      },
    }),
  );
  for (let pkg = 0; pkg < 10; pkg++) {
    write(
      `node_modules/pkg-${String(pkg)}/package.json`,
      JSON.stringify({ name: `pkg-${String(pkg)}`, types: 'index.d.ts' }),
    );
    write(`node_modules/pkg-${String(pkg)}/index.d.ts`, 'export declare const value: number;\n');
  }
  for (let index = 0; index < count; index++) {
    const lines: string[] = [];
    const imports = 3 + Math.floor(next() * 4);
    for (let i = 0; i < imports && index > 0; i++) {
      // Mostly imports of earlier files (acyclic); about 2% point forward and can form cycles.
      const target = next() < 0.02 ? Math.floor(next() * count) : Math.floor(next() * index);
      const from = path.posix.dirname(fileName(index));
      const relative = path.posix.relative(from, fileName(target).replace(/\.ts$/, ''));
      const specifier =
        next() < 0.1
          ? `@/${fileName(target).slice(4, -3)}`
          : relative.startsWith('.')
            ? relative
            : `./${relative}`;
      const typeOnly = next() < 0.2 ? 'type ' : '';
      lines.push(`import ${typeOnly}{ v${String(target)} as d${String(i)} } from '${specifier}';`);
    }
    if (next() < 0.3) lines.push(`import { value } from 'pkg-${String(Math.floor(next() * 10))}';`);
    lines.push('', `export const v${String(index)} = ${String(index)};`);
    // Filler so files have a realistic size (~1.5 KB).
    for (let i = 0; i < 25; i++) {
      lines.push(
        `export function fn${String(i)}(input: number): number {`,
        `  return input * ${String(i)};`,
        '}',
      );
    }
    write(fileName(index), `${lines.join('\n')}\n`);
  }
}

async function measure(directory: string): Promise<Measurement> {
  const result = await analyzeRepository(realpathSync.native(directory), {
    include: DEFAULT_INCLUDE,
    exclude: [],
    configFile: null,
  });
  return {
    files: result.summary.filesDiscovered,
    nodes: result.summary.nodes,
    edges: result.summary.edges,
    importReferences: result.summary.importReferences,
    cycles: result.summary.cyclicComponents,
    durationMs: result.summary.durationMs,
    maxRssMb: Math.round(process.resourceUsage().maxRSS / 1024),
  };
}

function runChild(directory: string): Measurement {
  const script = fileURLToPath(import.meta.url);
  const child = spawnSync(process.execPath, [...process.execArgv, script, '--child', directory], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (child.status !== 0) throw new Error(`Benchmark child failed:\n${child.stderr}`);
  return JSON.parse(child.stdout) as Measurement;
}

function report(label: string, m: Measurement): void {
  console.log(
    [
      label.padEnd(28),
      `files ${String(m.files).padStart(6)}`,
      `refs ${String(m.importReferences).padStart(7)}`,
      `nodes ${String(m.nodes).padStart(6)}`,
      `edges ${String(m.edges).padStart(7)}`,
      `cyclic SCCs ${String(m.cycles).padStart(3)}`,
      `analysis ${String(m.durationMs).padStart(6)} ms`,
      `peak RSS ${String(m.maxRssMb).padStart(5)} MB`,
    ].join('  '),
  );
}

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};

const childDirectory = option('--child');
const generateDirectory = option('--generate');
if (generateDirectory) {
  generateRepository(generateDirectory, Number(option('--files') ?? '1000'));
} else if (childDirectory) {
  process.stdout.write(JSON.stringify(await measure(childDirectory)));
} else {
  console.log(`Node ${process.version} on ${process.platform}/${process.arch}`);
  const directory = option('--dir');
  if (directory) {
    report(directory, runChild(directory));
  } else {
    const sizes = (option('--files') ?? '1000,10000').split(',').map(Number);
    for (const size of sizes) {
      const root = mkdtempSync(path.join(tmpdir(), 'deptrace-bench-'));
      try {
        generateRepository(root, size);
        report(`synthetic (${String(size)} files)`, runChild(root));
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  }
}
