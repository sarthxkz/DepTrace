import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { detectLayers, renderDetectedConfig } from '../../src/config/detect.js';
import { writeStarterConfig } from '../../src/config/init.js';
import { configPath, resolveTargetDirectory } from '../../src/config/paths.js';
import { CONFIG_VERSION, validateConfig } from '../../src/config/schema.js';
import { renderStarterConfig } from '../../src/config/templates.js';
import { ExitCode } from '../../src/core/constants.js';
import { DepTraceError } from '../../src/core/errors.js';
import { makeTempDir } from '../helpers.js';

describe('renderStarterConfig', () => {
  it('produces valid YAML that matches the supported schema', () => {
    const config: unknown = parse(renderStarterConfig('my-app'));
    expect(validateConfig(config)).toEqual([]);
    expect(config).toMatchObject({ version: CONFIG_VERSION, project: { name: 'my-app' } });
  });

  it('is deterministic', () => {
    expect(renderStarterConfig('my-app')).toBe(renderStarterConfig('my-app'));
  });

  it('starts with the format version and uses LF line endings', () => {
    const text = renderStarterConfig('x');
    expect(text.startsWith('version: 1\n')).toBe(true);
    expect(text).not.toContain('\r');
  });

  it('contains no active rules', () => {
    expect(parse(renderStarterConfig('x'))).toMatchObject({ rules: [] });
  });

  it('contains a commented rules example that is valid when uncommented', () => {
    const lines = renderStarterConfig('x').split('\n');
    const start = lines.findIndex((line) => line === '# layers:');
    const end = lines.findIndex((line) => line === 'rules: []');
    const example = lines.slice(start, end).map((line) => line.replace(/^# ?/, ''));
    const config = [...lines.slice(0, start), ...example].join('\n');
    expect(validateConfig(parse(config))).toEqual([]);
    expect(parse(config)).toMatchObject({ rules: { 'layer-boundaries': { severity: 'error' } } });
  });

  it.each(['my app', 'a: b', '#hash', 'it\'s "quoted"'])(
    'keeps the project name %j intact',
    (name) => {
      expect(parse(renderStarterConfig(name))).toMatchObject({ project: { name } });
    },
  );
});

describe('validateConfig', () => {
  const valid = () => parse(renderStarterConfig('x')) as Record<string, unknown>;

  it.each([
    ['a non-object', 'text', 'configuration must be a mapping'],
    ['a wrong version', { ...valid(), version: 2 }, 'version must be 1'],
    [
      'a missing project name',
      { ...valid(), project: {} },
      'project.name must be a non-empty string',
    ],
    [
      'non-string patterns',
      { ...valid(), analysis: { include: [1], exclude: [] } },
      'analysis.include must be a list of strings',
    ],
    [
      'a non-empty rules list',
      { ...valid(), rules: [{ name: 'x' }] },
      'rules: must be a mapping of rule types',
    ],
    ['an unknown top-level setting', { ...valid(), rulez: {} }, 'rulez: unknown setting'],
  ])('rejects %s', (_label, input, problem) => {
    expect(validateConfig(input).join('\n')).toContain(problem);
  });

  it('rejects empty patterns and backslashes', () => {
    const check = (pattern: string) =>
      validateConfig({ ...valid(), analysis: { include: [pattern], exclude: [] } }).join('\n');
    expect(check('')).toContain('must not be empty');
    expect(check('src\\**')).toContain('must use forward slashes');
  });

  it.each(['../src/**', 'src/../../x', '/etc/**', 'C:/repo/**', 'c:\\repo', '..\\x'])(
    'rejects the pattern %j because it could point outside the root',
    (pattern) => {
      const config = { ...valid(), analysis: { include: [pattern], exclude: [] } };
      expect(validateConfig(config).join('\n')).toContain(
        'must be relative to the repository root',
      );
    },
  );

  it.each(['**/*', 'src/**/*.ts', '..hidden/*.ts', 'a..b/**'])(
    'accepts the pattern %j',
    (pattern) => {
      expect(validateConfig({ ...valid(), analysis: { include: [pattern], exclude: [] } })).toEqual(
        [],
      );
    },
  );
});

describe('paths', () => {
  it('resolves relative and absolute targets', () => {
    const cwd = path.resolve('/work');
    expect(resolveTargetDirectory(undefined, cwd)).toBe(cwd);
    expect(resolveTargetDirectory('sub dir', cwd)).toBe(path.join(cwd, 'sub dir'));
    expect(resolveTargetDirectory(path.resolve('/other'), cwd)).toBe(path.resolve('/other'));
  });

  it('places the config file in the directory', () => {
    expect(configPath(path.resolve('/work'))).toBe(
      path.join(path.resolve('/work'), 'deptrace.yml'),
    );
  });
});

describe('writeStarterConfig', () => {
  it('creates deptrace.yml with the starter template', async () => {
    const dir = await makeTempDir();
    const file = await writeStarterConfig(dir);
    expect(file).toBe(path.join(dir, 'deptrace.yml'));
    expect(await readFile(file, 'utf8')).toBe(renderStarterConfig(path.basename(dir)));
  });

  it('never overwrites an existing file', async () => {
    const dir = await makeTempDir();
    const file = path.join(dir, 'deptrace.yml');
    await writeFile(file, 'custom: true\n');
    await expect(writeStarterConfig(dir)).rejects.toMatchObject({
      exitCode: ExitCode.OperationalError,
      message: expect.stringContaining('already exists') as unknown,
    });
    expect(await readFile(file, 'utf8')).toBe('custom: true\n');
  });

  it('refuses a repeated initialization', async () => {
    const dir = await makeTempDir();
    await writeStarterConfig(dir);
    const first = await readFile(path.join(dir, 'deptrace.yml'), 'utf8');
    await expect(writeStarterConfig(dir)).rejects.toBeInstanceOf(DepTraceError);
    expect(await readFile(path.join(dir, 'deptrace.yml'), 'utf8')).toBe(first);
  });

  it('reports a missing target directory as an operational error', async () => {
    const dir = path.join(await makeTempDir(), 'missing');
    await expect(writeStarterConfig(dir)).rejects.toMatchObject({
      exitCode: ExitCode.OperationalError,
      message: expect.stringContaining('does not exist') as unknown,
    });
  });

  it('reports a file used as the target directory', async () => {
    const dir = await makeTempDir();
    const file = path.join(dir, 'file.txt');
    await writeFile(file, '');
    await expect(writeStarterConfig(file)).rejects.toMatchObject({
      message: expect.stringContaining('Not a directory') as unknown,
    });
  });

  it('reports a directory occupying the config path', async () => {
    const dir = await makeTempDir();
    await mkdir(path.join(dir, 'deptrace.yml'));
    await expect(writeStarterConfig(dir)).rejects.toBeInstanceOf(DepTraceError);
  });
});

describe('detectLayers', () => {
  const files = [
    'src/main.ts',
    'src/ui/list.ts',
    'src/domain/order.ts',
    'src/infra/db.ts',
    'src/(group)/page.ts',
    'tests/order.test.ts',
  ];
  const edges = [
    { from: 'src/ui/list.ts', to: 'src/domain/order.ts' },
    { from: 'src/infra/db.ts', to: 'src/domain/order.ts' },
    { from: 'src/domain/order.ts', to: 'src/infra/db.ts' },
    { from: 'src/main.ts', to: 'src/ui/list.ts' },
  ];

  it('makes one layer per src/ folder and allows the imports that exist', () => {
    expect(detectLayers(files, edges)).toEqual({
      base: 'src',
      layers: [
        { name: 'domain', directory: 'src/domain' },
        { name: 'infra', directory: 'src/infra' },
        { name: 'ui', directory: 'src/ui' },
      ],
      allowed: { domain: ['infra'], infra: ['domain'], ui: ['domain'] },
      mutual: [['domain', 'infra']],
      unassigned: 3,
      skipped: ['src/(group)'],
    });
  });

  it('falls back to top-level folders and needs at least two layers', () => {
    expect(detectLayers(['lib/a.ts', 'App/b.ts'], [])?.layers).toEqual([
      { name: 'app', directory: 'App' },
      { name: 'lib', directory: 'lib' },
    ]);
    expect(detectLayers(['src/a/x.ts', 'index.ts'], [])).toBeNull();
  });

  it('renders a valid configuration', () => {
    const detection = detectLayers(files, edges);
    if (detection === null) throw new Error('no detection');
    const text = renderDetectedConfig('my app', detection);
    expect(validateConfig(parse(text))).toEqual([]);
    expect(text).toContain('domain and infra import each other');
    expect(text).toContain('Not suggested (name not usable as a layer or pattern): src/(group)');
    expect(renderDetectedConfig('my app', detection)).toBe(text);
  });
});
