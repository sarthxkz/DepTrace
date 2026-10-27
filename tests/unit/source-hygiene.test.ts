import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../helpers.js';

const TEXT = /\.(?:[cm]?[jt]sx?|json|ya?ml|md|css|html|svg|sarif|txt)$/;

// Invisible characters that can make code or docs read differently from what
// they are ("Trojan Source"): C0/C1 controls except tab, newline and carriage
// return, line and paragraph separators, bidi embeddings, overrides and isolates.
const RANGES: [number, number][] = [
  [0x00, 0x08],
  [0x0b, 0x0c],
  [0x0e, 0x1f],
  [0x7f, 0x9f],
  [0x2028, 0x2029],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
];
const HIDDEN = new RegExp(
  `[${RANGES.map(([from, to]) => `${String.fromCharCode(from)}-${String.fromCharCode(to)}`).join('')}]`,
);

/** Tracked files plus new files that are not ignored. */
function repositoryFiles(): string[] {
  const output = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    {
      cwd: ROOT,
      encoding: 'utf8',
    },
  );
  return output.split('\0').filter((file) => file !== '' && TEXT.test(file));
}

describe('source hygiene', () => {
  it('finds no invisible control or bidirectional characters in the repository', () => {
    const files = repositoryFiles();
    expect(files.length).toBeGreaterThan(100);
    const offenders: string[] = [];
    for (const file of files) {
      let text: string;
      try {
        text = readFileSync(path.join(ROOT, file), 'utf8');
      } catch {
        continue; // deleted in the working tree but still tracked
      }
      const match = HIDDEN.exec(text);
      if (match) {
        const line = text.slice(0, match.index).split('\n').length;
        offenders.push(
          `${file}:${String(line)} U+${match[0].charCodeAt(0).toString(16).padStart(4, '0')}`,
        );
      }
    }
    expect(offenders).toEqual([]);
  });
});
