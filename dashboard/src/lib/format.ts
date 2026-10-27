export const plural = (n: number, word: string, many = `${word}s`) =>
  `${n.toLocaleString('en-US')} ${n === 1 ? word : many}`;

export const number = (n: number) => n.toLocaleString('en-US');

export function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

// Control characters except tab and newline, line/paragraph separators, bidi overrides and isolates.
const HIDDEN_RANGES: [number, number][] = [
  [0x00, 0x08],
  [0x0b, 0x1f],
  [0x7f, 0x9f],
  [0x2028, 0x2029],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
];
const HIDDEN_CONTROLS = new RegExp(
  `[${HIDDEN_RANGES.map(([from, to]) => `${String.fromCharCode(from)}-${String.fromCharCode(to)}`).join('')}]`,
  'g',
);

/**
 * Shows invisible control and bidirectional-override characters in untrusted
 * repository text as visible escapes (U+202E RIGHT-TO-LEFT OVERRIDE shows as backslash-u-202e), so a file name cannot
 * display as something it is not ("Trojan Source"). Display only: the data
 * used for matching and fingerprints is unchanged.
 */
export const revealControls = (text: string) =>
  text.replace(HIDDEN_CONTROLS, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);

export const location = (file: string | null, line: number | null, column: number | null) =>
  file === null
    ? ''
    : line === null
      ? file
      : `${file}:${String(line)}${column === null ? '' : `:${String(column)}`}`;
