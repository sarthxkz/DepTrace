/** Validation helpers for untrusted JSON: every problem names its JSON location. */

export const MAX_PROBLEMS = 20;

export class ValidationError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join('\n'));
    this.name = 'ValidationError';
  }
}

/** Thrown internally once MAX_PROBLEMS problems are collected. */
class TooManyProblems extends Error {}

const join = (at: string, key: string) => (at === '$' ? key : `${at}.${key}`);

/** Shortens untrusted values quoted in messages. */
export const quote = (value: string) =>
  JSON.stringify(value.length > 120 ? `${value.slice(0, 117)}...` : value);

const typeName = (value: unknown) =>
  value === null ? 'null' : Array.isArray(value) ? 'an array' : `a ${typeof value}`;

/**
 * Collects problems instead of stopping at the first, so one import shows
 * everything that is wrong (up to MAX_PROBLEMS). Accessors return a harmless
 * fallback after recording a problem.
 */
export class Checker {
  readonly problems: string[] = [];

  problem(at: string, message: string): void {
    this.problems.push(`${at}: ${message}`);
    if (this.problems.length >= MAX_PROBLEMS) throw new TooManyProblems();
  }

  run<T>(validate: () => T): T {
    try {
      const value = validate();
      this.assertClean();
      return value;
    } catch (error) {
      if (error instanceof TooManyProblems) {
        throw new ValidationError([
          ...this.problems,
          `(stopped after ${String(MAX_PROBLEMS)} problems)`,
        ]);
      }
      throw error;
    }
  }

  assertClean(): void {
    if (this.problems.length > 0) throw new ValidationError(this.problems);
  }

  object(value: unknown, at: string): Record<string, unknown> {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    this.problem(at, `expected an object, found ${typeName(value)}`);
    return {};
  }

  string(o: Record<string, unknown>, key: string, at: string): string {
    const value = o[key];
    if (typeof value === 'string') return value;
    this.problem(
      join(at, key),
      value === undefined ? 'missing' : `expected a string, found ${typeName(value)}`,
    );
    return '';
  }

  nullableString(o: Record<string, unknown>, key: string, at: string): string | null {
    return o[key] === null ? null : this.string(o, key, at);
  }

  integer(o: Record<string, unknown>, key: string, at: string): number {
    const value = o[key];
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
    this.problem(
      join(at, key),
      value === undefined
        ? 'missing'
        : `expected a non-negative integer, found ${typeof value === 'number' ? String(value) : typeName(value)}`,
    );
    return 0;
  }

  nullableInteger(o: Record<string, unknown>, key: string, at: string): number | null {
    return o[key] === null ? null : this.integer(o, key, at);
  }

  boolean(o: Record<string, unknown>, key: string, at: string): boolean {
    const value = o[key];
    if (typeof value === 'boolean') return value;
    this.problem(
      join(at, key),
      value === undefined ? 'missing' : `expected true or false, found ${typeName(value)}`,
    );
    return false;
  }

  oneOf<const T extends string>(
    o: Record<string, unknown>,
    key: string,
    at: string,
    allowed: readonly T[],
  ): T {
    const value = o[key];
    if (typeof value === 'string' && (allowed as readonly string[]).includes(value))
      return value as T;
    this.problem(
      join(at, key),
      `expected one of ${allowed.map((item) => `"${item}"`).join(', ')}, found ${typeof value === 'string' ? quote(value) : typeName(value)}`,
    );
    return allowed[0] as T;
  }

  array<T>(
    o: Record<string, unknown>,
    key: string,
    at: string,
    item: (value: unknown, at: string) => T,
  ): T[] {
    const value = o[key];
    const path = join(at, key);
    if (!Array.isArray(value)) {
      this.problem(
        path,
        value === undefined ? 'missing' : `expected an array, found ${typeName(value)}`,
      );
      return [];
    }
    return value.map((element, index) => item(element, `${path}[${String(index)}]`));
  }

  strings(o: Record<string, unknown>, key: string, at: string): string[] {
    return this.array(o, key, at, (value, path) => {
      if (typeof value === 'string') return value;
      this.problem(path, `expected a string, found ${typeName(value)}`);
      return '';
    });
  }
}
