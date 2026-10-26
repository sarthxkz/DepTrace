import ts from 'typescript';
import type { DependencyKind, ImportReference, SourceLocation } from './types.js';

/** An import together with its specifier node (needed for resolution mode lookup). */
export interface RawImport extends ImportReference {
  literal: ts.StringLiteralLike;
}

export interface ExtractedImports {
  imports: RawImport[];
  /** `import(expr)` / `require(expr)` calls whose specifier is not a string literal. */
  unanalyzable: (SourceLocation & { kind: DependencyKind })[];
  /** `require(...)` calls ignored because the file declares its own `require`. */
  shadowedRequires: SourceLocation[];
}

const SCRIPT_KINDS: Record<string, ts.ScriptKind> = {
  '.ts': ts.ScriptKind.TS,
  '.mts': ts.ScriptKind.TS,
  '.cts': ts.ScriptKind.TS,
  '.tsx': ts.ScriptKind.TSX,
  '.js': ts.ScriptKind.JS,
  '.mjs': ts.ScriptKind.JS,
  '.cjs': ts.ScriptKind.JS,
  '.jsx': ts.ScriptKind.JSX,
};

/** Parses source text into an AST. Never evaluates the code. */
export function parseSourceFile(
  fileName: string,
  text: string,
  extension: string,
  impliedNodeFormat: ts.ResolutionMode,
): ts.SourceFile {
  return ts.createSourceFile(
    fileName,
    text,
    {
      languageVersion: ts.ScriptTarget.Latest,
      impliedNodeFormat,
      jsDocParsingMode: ts.JSDocParsingMode.ParseNone,
    },
    true,
    SCRIPT_KINDS[extension] ?? ts.ScriptKind.Unknown,
  );
}

/** Syntax errors reported by the parser (the AST is still usable; TS recovers from errors). */
export function getParseDiagnostics(sourceFile: ts.SourceFile): readonly ts.Diagnostic[] {
  // shortcut: `parseDiagnostics` is internal but avoids building a Program per file;
  // tests/unit/parser.test.ts fails if a TypeScript upgrade removes it.
  return (sourceFile as unknown as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics ?? [];
}

function locate(sourceFile: ts.SourceFile, node: ts.Node): SourceLocation {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { line: line + 1, column: character + 1 };
}

function allTypeOnly(elements: ts.NodeArray<ts.ImportSpecifier | ts.ExportSpecifier>): boolean {
  return elements.length > 0 && elements.every((element) => element.isTypeOnly);
}

function isImportTypeOnly(clause: ts.ImportClause | undefined): boolean {
  if (!clause) return false;
  if (clause.phaseModifier === ts.SyntaxKind.TypeKeyword) return true;
  return (
    !clause.name &&
    clause.namedBindings !== undefined &&
    ts.isNamedImports(clause.namedBindings) &&
    allTypeOnly(clause.namedBindings.elements)
  );
}

function declaresRequire(node: ts.Node): boolean {
  // Cheap name test first: this runs for every node in the file.
  const name = (node as { name?: ts.Node }).name;
  if (!name || !ts.isIdentifier(name) || name.text !== 'require') return false;
  return (
    ts.isVariableDeclaration(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isParameter(node) ||
    ts.isClassDeclaration(node) ||
    ts.isImportClause(node) ||
    ts.isImportSpecifier(node) ||
    ts.isNamespaceImport(node) ||
    ts.isImportEqualsDeclaration(node)
  );
}

/** Collects every statically analyzable import, re-export, dynamic import and require call. */
export function extractImports(sourceFile: ts.SourceFile): ExtractedImports {
  const imports: RawImport[] = [];
  const requires: RawImport[] = [];
  const unanalyzable: ExtractedImports['unanalyzable'] = [];
  const scope = { requireShadowed: false };

  const add = (
    target: RawImport[],
    literal: ts.StringLiteralLike,
    kind: DependencyKind,
    typeOnly: boolean,
  ) => {
    target.push({
      specifier: literal.text,
      kind,
      typeOnly,
      literal,
      ...locate(sourceFile, literal),
    });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      const kind = node.importClause ? 'import' : 'side-effect';
      add(imports, node.moduleSpecifier, kind, isImportTypeOnly(node.importClause));
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      const clause = node.exportClause;
      const typeOnly =
        node.isTypeOnly ||
        (clause !== undefined && ts.isNamedExports(clause) && allTypeOnly(clause.elements));
      add(imports, node.moduleSpecifier, 're-export', typeOnly);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      add(imports, node.moduleReference.expression, 'import-equals', node.isTypeOnly);
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    ) {
      add(imports, node.argument.literal, 'import-type', true);
    } else if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire =
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'require' &&
        node.arguments.length === 1;
      const [argument] = node.arguments;
      if ((isDynamicImport || isRequire) && argument) {
        const kind = isDynamicImport ? 'dynamic-import' : 'require';
        if (ts.isStringLiteralLike(argument)) {
          add(isRequire ? requires : imports, argument, kind, false);
        } else {
          unanalyzable.push({ kind, ...locate(sourceFile, argument) });
        }
      }
    }
    if (declaresRequire(node)) scope.requireShadowed = true;
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  // A locally declared `require` is not the CommonJS loader, so its calls are not imports.
  if (scope.requireShadowed) {
    return {
      imports,
      unanalyzable: unanalyzable.filter((item) => item.kind !== 'require'),
      shadowedRequires: requires.map(({ line, column }) => ({ line, column })),
    };
  }
  return { imports: [...imports, ...requires], unanalyzable, shadowedRequires: [] };
}
