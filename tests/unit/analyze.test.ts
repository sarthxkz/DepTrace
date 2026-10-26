import { mkdir, symlink } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeRepository } from '../../src/analysis/analyze.js';
import { DEFAULT_INCLUDE, discoverSourceFiles } from '../../src/analysis/discovery.js';
import { toRelative } from '../../src/analysis/paths.js';
import type { AnalysisResult } from '../../src/analysis/types.js';
import { copyFixture, makeTempDir, writeTree } from '../helpers.js';

const analyze = (root: string, include = DEFAULT_INCLUDE, exclude: string[] = []) =>
  analyzeRepository(root, { include, exclude, configFile: null });

const edgeList = (result: AnalysisResult) => result.graph.edges.map((e) => `${e.from} -> ${e.to}`);

const resolutionOf = (result: AnalysisResult, specifier: string) => {
  if (result.graph.edges.some((e) => e.references.some((r) => r.specifier === specifier))) {
    return 'internal';
  }
  if (result.external.some((e) => e.references.some((r) => r.specifier === specifier))) {
    return 'external';
  }
  const excluded = result.excluded.find((r) => r.specifier === specifier);
  if (excluded) return `excluded:${excluded.reason}`;
  const unresolved = result.unresolved.find((r) => r.specifier === specifier);
  return unresolved ? `unresolved:${unresolved.reason}` : 'missing';
};

describe('discoverSourceFiles', () => {
  it('finds supported extensions in sorted order and skips built-in excludes', async () => {
    const root = await makeTempDir();
    await writeTree(root, {
      'b.ts': '',
      'a.tsx': '',
      'src/c.mjs': '',
      'src/d.cts': '',
      'src/e.jsx': '',
      'src/f.mts': '',
      'src/g.cjs': '',
      'src/h.js': '',
      'src/vendor.min.js': '',
      'readme.md': '',
      'node_modules/pkg/index.js': '',
      'packages/x/node_modules/y/index.js': '',
      'dist/out.js': '',
      'build/out.js': '',
      'coverage/out.js': '',
    });
    const { files, stats } = discoverSourceFiles(root, { include: DEFAULT_INCLUDE, exclude: [] });
    expect(files).toEqual([
      'a.tsx',
      'b.ts',
      'src/c.mjs',
      'src/d.cts',
      'src/e.jsx',
      'src/f.mts',
      'src/g.cjs',
      'src/h.js',
    ]);
    expect(stats.filesExcluded).toBe(1);
    expect(stats.directoriesExcluded).toBe(5);
  });

  it('applies include and exclude patterns', async () => {
    const root = await makeTempDir();
    await writeTree(root, { 'src/a.ts': '', 'src/a.test.ts': '', 'scripts/b.ts': '' });
    const { files } = discoverSourceFiles(root, {
      include: ['src/**/*'],
      exclude: ['**/*.test.ts'],
    });
    expect(files).toEqual(['src/a.ts']);
  });

  it('does not follow symbolic links, so files are not discovered twice', async () => {
    const root = await makeTempDir();
    await writeTree(root, { 'src/a.ts': '' });
    await symlink(path.join(root, 'src'), path.join(root, 'linked'), 'junction');
    const { files, stats } = discoverSourceFiles(root, { include: DEFAULT_INCLUDE, exclude: [] });
    expect(files).toEqual(['src/a.ts']);
    expect(stats.symlinksSkipped).toBe(1);
  });
});

describe('analyzeRepository on the app fixture', async () => {
  const root = await copyFixture('app');
  const result = await analyze(root);

  it('discovers and parses source files', () => {
    expect(result.summary.filesDiscovered).toBe(14);
    expect(result.summary.filesWithParseErrors).toBe(1);
    expect(result.summary.filesParsed).toBe(13);
    expect(result.graph.nodes.find((n) => n.id === 'src/broken.ts')?.status).toBe('parse-errors');
  });

  it('resolves relative, index, extension, alias and re-export imports internally', () => {
    expect(edgeList(result)).toEqual(
      expect.arrayContaining([
        'src/index.ts -> src/utils/index.ts',
        'src/index.ts -> src/services/api.ts',
        'src/index.ts -> src/math.ts',
        'src/index.ts -> src/lazy.ts',
        'src/index.ts -> src/polyfills.ts',
        'src/legacy.cjs -> src/math.ts',
        'src/component.tsx -> src/utils/index.ts',
      ]),
    );
  });

  it('extracts imports from a file with syntax errors', () => {
    expect(edgeList(result)).toContain('src/broken.ts -> src/math.ts');
  });

  it('merges the import and re-export of ./math.js into one edge', () => {
    const edge = result.graph.edges.find(
      (e) => e.from === 'src/index.ts' && e.to === 'src/math.ts',
    );
    expect(edge?.references.map((r) => r.kind)).toEqual(['import', 're-export']);
    expect(result.summary.internalReferences).toBe(result.summary.edges + 1);
  });

  it('classifies external packages, including exports subpaths and built-ins', () => {
    expect(result.external.map((e) => [e.packageName, e.builtin])).toEqual([
      ['@scope/pkg', false],
      ['fs', true],
      ['left-pad', false],
    ]);
  });

  it('classifies unresolved imports by reason instead of calling them external', () => {
    expect(resolutionOf(result, './missing')).toBe('unresolved:file-not-found');
    expect(resolutionOf(result, '@missing/thing')).toBe('unresolved:alias-not-found');
    expect(resolutionOf(result, 'not-installed')).toBe('unresolved:package-not-found');
  });

  it('classifies resolved non-source files as excluded', () => {
    expect(resolutionOf(result, './data.json')).toBe('excluded:non-source-file');
    expect(resolutionOf(result, './styles.css')).toBe('excluded:non-source-file');
  });

  it('tracks type-only edges', () => {
    const typeOnly = result.graph.edges
      .filter((e) => e.typeOnly)
      .map((e) => `${e.from} -> ${e.to}`);
    expect(typeOnly).toEqual([
      'src/index.ts -> src/types.ts',
      'src/types-cycle/a.ts -> src/types-cycle/b.ts',
      'src/types-cycle/b.ts -> src/types-cycle/a.ts',
      'src/types.ts -> src/services/api.ts',
    ]);
  });

  it('detects the runtime cycle, the self-loop and the type-only cycle', () => {
    expect(result.cycles.map((c) => [c.nodes, c.runtime])).toEqual([
      [['src/self.ts'], true],
      [['src/services/api.ts', 'src/utils/index.ts'], true],
      [['src/types-cycle/a.ts', 'src/types-cycle/b.ts'], false],
    ]);
  });

  it('reports diagnostics with locations', () => {
    expect(result.status).toBe('completed-with-diagnostics');
    expect(result.diagnostics.map((d) => `${d.severity} ${d.code} ${d.file ?? ''}`)).toEqual([
      'error parse-error src/broken.ts',
      'warning unresolved-import src/index.ts',
      'warning unresolved-import src/index.ts',
      'warning unresolved-import src/index.ts',
      'warning unanalyzable-import src/index.ts',
      'warning unanalyzable-import src/legacy.cjs',
      'info shadowed-require src/shadow.js',
    ]);
    expect(result.diagnostics.every((d) => d.line !== null && d.column !== null)).toBe(true);
  });

  it('never includes files from node_modules or dist as nodes', () => {
    expect(result.graph.nodes.some((n) => /node_modules|dist/.test(n.id))).toBe(false);
  });

  it('is deterministic and independent of where the repository is located', async () => {
    const again = await analyze(await copyFixture('app'));
    const strip = (r: AnalysisResult) =>
      JSON.stringify({
        ...r,
        root: null,
        graph: { ...r.graph, indexOf: null },
        summary: { ...r.summary, durationMs: 0 },
      });
    expect(strip(again)).toBe(strip(result));
  });
});

describe('module resolution', () => {
  it('resolves workspace packages across monorepo boundaries via node_modules links', async () => {
    const root = await copyFixture('monorepo');
    await mkdir(path.join(root, 'node_modules', '@mono'), { recursive: true });
    await symlink(
      path.join(root, 'packages', 'lib'),
      path.join(root, 'node_modules', '@mono', 'lib'),
      'junction',
    );
    const result = await analyze(root);
    expect(edgeList(result)).toEqual([
      'packages/app/src/main.ts -> packages/lib/src/index.ts',
      'packages/lib/src/index.ts -> packages/lib/src/format.ts',
    ]);
    expect(result.unresolved).toEqual([]);
  });

  it('uses the nearest tsconfig.json per file (multiple tsconfig files)', async () => {
    const root = await copyFixture('monorepo');
    const result = await analyze(root);
    const tsconfigOf = (id: string) => result.graph.nodes.find((n) => n.id === id)?.tsconfig;
    expect(tsconfigOf('packages/app/src/main.ts')).toBe('packages/app/tsconfig.json');
    expect(tsconfigOf('packages/lib/src/index.ts')).toBeNull();
    // Without the workspace link the package is not installed: unresolved, not external.
    expect(resolutionOf(result, '@mono/lib')).toBe('unresolved:package-not-found');
  });

  it('uses referenced projects of a solution-style tsconfig', async () => {
    const root = await copyFixture('solution-config');
    const result = await analyze(root);
    expect(result.graph.nodes.map((n) => [n.id, n.tsconfig])).toEqual([
      ['src/main.ts', 'tsconfig.app.json'],
      ['src/util.ts', 'tsconfig.app.json'],
      ['vite.config.ts', 'tsconfig.node.json'],
    ]);
    expect(edgeList(result)).toEqual(['src/main.ts -> src/util.ts']);
    // tsconfig.node.json has no "~/*" alias, so the same import fails there.
    expect(result.unresolved.map((u) => u.file)).toEqual(['vite.config.ts']);
  });

  it('supports baseUrl', async () => {
    const root = await makeTempDir();
    await writeTree(root, {
      'tsconfig.json': JSON.stringify({
        compilerOptions: { baseUrl: './src', module: 'commonjs', moduleResolution: 'node10' },
      }),
      'src/app.ts': "import { x } from 'lib/x';",
      'src/lib/x.ts': 'export const x = 1;',
    });
    expect(edgeList(await analyze(root))).toEqual(['src/app.ts -> src/lib/x.ts']);
  });

  it('supports NodeNext resolution with .js specifiers and require in .cts', async () => {
    const root = await makeTempDir();
    await writeTree(root, {
      'package.json': JSON.stringify({ type: 'module' }),
      'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'nodenext' } }),
      'src/a.ts': "import { b } from './b.js';",
      'src/b.ts': 'export const b = 1;',
      'src/c.cts': "const b = require('./b.js');",
    });
    const result = await analyze(root);
    expect(edgeList(result)).toEqual(['src/a.ts -> src/b.ts', 'src/c.cts -> src/b.ts']);
  });

  it('supports package.json "imports" and package "exports"', async () => {
    const root = await makeTempDir();
    await writeTree(root, {
      'package.json': JSON.stringify({ name: 'self', imports: { '#utils': './src/utils.ts' } }),
      'src/a.ts':
        "import u from '#utils';\nimport m from '#missing';\nimport e from 'pkg/sub';\nimport h from 'pkg/hidden';",
      'src/utils.ts': 'export default 1;',
      'node_modules/pkg/package.json': JSON.stringify({
        name: 'pkg',
        exports: { './sub': './sub.js' },
      }),
      'node_modules/pkg/sub.js': 'export default 1;',
      'node_modules/pkg/hidden.js': 'export default 1;',
    });
    const result = await analyze(root);
    expect(resolutionOf(result, '#utils')).toBe('internal');
    expect(resolutionOf(result, '#missing')).toBe('unresolved:package-import-not-found');
    expect(resolutionOf(result, 'pkg/sub')).toBe('external');
    // Not listed in "exports", so Node would refuse it too.
    expect(resolutionOf(result, 'pkg/hidden')).toBe('unresolved:package-not-found');
  });

  it('works without any tsconfig (JavaScript project)', async () => {
    const root = await makeTempDir();
    await writeTree(root, {
      'index.js': "const a = require('./lib');\nimport('./lazy.mjs');",
      'lib/index.js': 'module.exports = 1;',
      'lazy.mjs': 'export default 1;',
    });
    const result = await analyze(root);
    expect(edgeList(result)).toEqual(['index.js -> lazy.mjs', 'index.js -> lib/index.js']);
    expect(result.settings.tsconfigs).toEqual([]);
  });

  it('classifies imports outside the root and excluded files', async () => {
    const parent = await makeTempDir();
    await writeTree(parent, {
      'outside.ts': 'export const o = 1;',
      'repo/src/a.ts': "import { o } from '../../outside';\nimport { s } from '../scripts/tool';",
      'repo/scripts/tool.ts': 'export const s = 1;',
    });
    const result = await analyze(path.join(parent, 'repo'), DEFAULT_INCLUDE, ['scripts/**']);
    const outside = result.excluded.find((e) => e.specifier === '../../outside');
    expect(outside).toMatchObject({ reason: 'outside-root', target: null });
    expect(resolutionOf(result, '../scripts/tool')).toBe('excluded:excluded-by-pattern');
    expect(result.graph.nodes.map((n) => n.id)).toEqual(['src/a.ts']);
  });

  it('reports invalid and circular tsconfig files without failing', async () => {
    const root = await makeTempDir();
    await writeTree(root, {
      'tsconfig.json': JSON.stringify({ extends: './tsconfig.base.json' }),
      'tsconfig.base.json': JSON.stringify({ extends: './tsconfig.json' }),
      'bad/tsconfig.json': '{ "compilerOptions": { "module": 42 ',
      'a.ts': "import './b';",
      'b.ts': '',
      'bad/c.ts': "import '../b';",
    });
    const result = await analyze(root);
    const configErrors = result.diagnostics.filter((d) => d.code === 'tsconfig-error');
    expect(configErrors.map((d) => d.file)).toEqual(
      expect.arrayContaining(['bad/tsconfig.json', 'tsconfig.json']),
    );
    expect(configErrors.some((d) => /circularity/i.test(d.message))).toBe(true);
    expect(edgeList(result)).toEqual(['a.ts -> b.ts', 'bad/c.ts -> b.ts']);
  });

  it('reports an empty repository as an empty graph', async () => {
    const result = await analyze(await makeTempDir());
    expect(result.graph.nodes).toEqual([]);
    expect(result.status).toBe('completed');
  });
});

describe('toRelative', () => {
  it('returns posix paths inside the root and null outside it', () => {
    const root = path.resolve('/repo');
    expect(toRelative(root, path.join(root, 'src', 'a.ts'))).toBe('src/a.ts');
    expect(toRelative(root, root)).toBe('');
    expect(toRelative(root, path.resolve('/other/a.ts'))).toBeNull();
    expect(toRelative(root, path.join(root, '..', 'repo-sibling', 'a.ts'))).toBeNull();
  });

  it.runIf(process.platform === 'win32')('accepts Windows paths with either separator', () => {
    expect(toRelative('C:\\repo', 'C:\\repo\\src\\a.ts')).toBe('src/a.ts');
    expect(toRelative('C:\\repo', 'C:/repo/src/a.ts')).toBe('src/a.ts');
    expect(toRelative('C:\\repo', 'c:\\REPO\\src\\a.ts')).toBe('src/a.ts');
    expect(toRelative('C:\\repo', 'D:\\repo\\a.ts')).toBeNull();
  });
});
