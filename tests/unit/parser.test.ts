import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractImports, getParseDiagnostics, parseSourceFile } from '../../src/analysis/parser.js';

function parse(code: string, file = 'test.ts') {
  const sourceFile = parseSourceFile(file, code, path.extname(file), undefined);
  const { imports, unanalyzable, shadowedRequires } = extractImports(sourceFile);
  return {
    imports: imports.map(({ specifier, kind, typeOnly }) => ({ specifier, kind, typeOnly })),
    unanalyzable,
    shadowedRequires,
    diagnostics: getParseDiagnostics(sourceFile),
  };
}

describe('extractImports', () => {
  it.each([
    ['default import', "import x from './a';", 'import', false],
    ['named import', "import { x, y as z } from './a';", 'import', false],
    ['namespace import', "import * as ns from './a';", 'import', false],
    ['side-effect import', "import './a';", 'side-effect', false],
    ['type-only import', "import type { T } from './a';", 'import', true],
    ['all-type named import', "import { type T, type U } from './a';", 'import', true],
    ['mixed named import', "import { type T, value } from './a';", 'import', false],
    ['named re-export', "export { x } from './a';", 're-export', false],
    ['star re-export', "export * from './a';", 're-export', false],
    ['namespace re-export', "export * as ns from './a';", 're-export', false],
    ['type-only re-export', "export type { T } from './a';", 're-export', true],
    ['dynamic import', "const m = import('./a');", 'dynamic-import', false],
    ['template literal dynamic import', 'const m = import(`./a`);', 'dynamic-import', false],
    ['require', "const m = require('./a');", 'require', false],
    ['import equals', "import m = require('./a');", 'import-equals', false],
    ['type-only import equals', "import type m = require('./a');", 'import-equals', true],
    ['import type node', "type T = import('./a').T;", 'import-type', true],
  ])('recognizes a %s', (_label, code, kind, typeOnly) => {
    expect(parse(code).imports).toEqual([{ specifier: './a', kind, typeOnly }]);
  });

  it('records 1-based locations of the specifier', () => {
    const sourceFile = parseSourceFile('t.ts', "\n  import x from './a';", '.ts', undefined);
    expect(extractImports(sourceFile).imports[0]).toMatchObject({ line: 2, column: 17 });
  });

  it('keeps every import, including repeated specifiers', () => {
    const { imports } = parse("import a from './a';\nexport * from './a';\nimport('./a');");
    expect(imports.map((item) => item.kind)).toEqual(['import', 're-export', 'dynamic-import']);
  });

  it('ignores exports without a module specifier', () => {
    expect(parse('const x = 1; export { x }; export default x;').imports).toEqual([]);
  });

  it('reports non-literal dynamic specifiers as unanalyzable', () => {
    const result = parse("const name = './a';\nimport(name);\nrequire('./b' + name);");
    expect(result.imports).toEqual([]);
    expect(result.unanalyzable.map((item) => item.kind)).toEqual(['dynamic-import', 'require']);
  });

  it('ignores require calls that are not the CommonJS loader shape', () => {
    expect(parse("require('./a', 'b'); obj.require('./c'); require();").imports).toEqual([]);
  });

  it.each([
    ['function declaration', "function require(x) { return x; }\nrequire('./a');"],
    ['variable', "const require = (x) => x;\nrequire('./a');"],
    ['parameter', "export function load(require) { return require('./a'); }"],
    ['import binding', "import { require } from './loader';\nrequire('./a');"],
  ])('does not treat require as CommonJS when shadowed by a %s', (_label, code) => {
    const result = parse(code, 'test.js');
    expect(result.imports.filter((item) => item.kind === 'require')).toEqual([]);
    expect(result.shadowedRequires).toHaveLength(1);
  });

  it('parses JSX in .tsx and .jsx files', () => {
    for (const file of ['c.tsx', 'c.jsx']) {
      const result = parse("import x from './a';\nexport const C = () => <div>{x}</div>;", file);
      expect(result.diagnostics).toHaveLength(0);
      expect(result.imports).toHaveLength(1);
    }
  });

  it('parses .mts, .cts, .mjs and .cjs files', () => {
    for (const file of ['a.mts', 'a.cts', 'a.mjs', 'a.cjs']) {
      expect(parse("import x from './a';", file).imports).toHaveLength(1);
    }
  });
});

describe('getParseDiagnostics', () => {
  it('reports syntax errors and still extracts imports', () => {
    const result = parse("import { a } from './a';\nconst broken = a(1, ;\nimport './b';");
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.imports.map((item) => item.specifier)).toEqual(['./a', './b']);
  });

  it('reports nothing for valid code', () => {
    expect(parse("import { a } from './a';\nexport const b = a;").diagnostics).toHaveLength(0);
  });
});
