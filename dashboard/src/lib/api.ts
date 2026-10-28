/** The local `deptrace dashboard` server: GET /api/report, POST /api/analyze and POST /api/audit. */

export interface ServerMeta {
  source: 'analysis' | 'file';
  name: string;
  analyzedAt: string | null;
  git: { branch: string | null; commit: string | null } | null;
}

export interface ServerState {
  meta: ServerMeta;
  live: boolean;
  /** The report document, validated by the caller. */
  report: unknown;
}

export class ServerError extends Error {
  constructor(
    message: string,
    /** True when no DepTrace server answered at all. */
    readonly unreachable = false,
  ) {
    super(message);
    this.name = 'ServerError';
  }
}

function readState(value: unknown): ServerState {
  const o = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const meta = (typeof o.meta === 'object' && o.meta !== null ? o.meta : {}) as Record<
    string,
    unknown
  >;
  const git = meta.git as Record<string, unknown> | null | undefined;
  const text = (v: unknown) => (typeof v === 'string' ? v : null);
  return {
    meta: {
      source: meta.source === 'file' ? 'file' : 'analysis',
      name: text(meta.name) ?? '',
      analyzedAt: text(meta.analyzedAt),
      git: git ? { branch: text(git.branch), commit: text(git.commit) } : null,
    },
    live: o.live === true,
    report: o.report,
  };
}

async function request(input: string, init?: RequestInit): Promise<ServerState> {
  let response: Response;
  try {
    response = await fetch(input, { cache: 'no-store', ...init });
  } catch {
    throw new ServerError(
      'The DepTrace server is not reachable. Is "deptrace dashboard" still running?',
      true,
    );
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).trim().slice(0, 500);
    throw new ServerError(
      detail || `The server answered ${String(response.status)}.`,
      response.status === 404,
    );
  }
  try {
    return readState(await response.json());
  } catch {
    throw new ServerError('The server sent a response that is not JSON.');
  }
}

export const fetchReport = () => request('/api/report');

/**
 * Runs `deptrace audit` on the server. It sends package names and versions from
 * package-lock.json to the npm registry, so it only runs when the user asks.
 */
export async function runAudit(): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch('/api/audit', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'X-DepTrace-Request': 'audit' },
    });
  } catch {
    throw new ServerError(
      'The DepTrace server is not reachable. Is "deptrace dashboard" still running?',
      true,
    );
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).trim().slice(0, 500);
    throw new ServerError(detail || `The server answered ${String(response.status)}.`);
  }
  return response.json();
}

/** Re-runs the analysis on the server (same directory and options it was started with). */
export const reanalyze = () =>
  request('/api/analyze', { method: 'POST', headers: { 'X-DepTrace-Request': 'analyze' } });
