export const plural = (n: number, word: string, many = `${word}s`) =>
  `${n.toLocaleString('en-US')} ${n === 1 ? word : many}`;

export const number = (n: number) => n.toLocaleString('en-US');

export function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export const location = (file: string | null, line: number | null, column: number | null) =>
  file === null
    ? ''
    : line === null
      ? file
      : `${file}:${String(line)}${column === null ? '' : `:${String(column)}`}`;
