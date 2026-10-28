import { readdir, readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

/** What `GET /api/report` returns besides the report itself. */
export interface DashboardMeta {
  /** `analysis`: produced by this server (re-analysis possible); `file`: a report file. */
  source: 'analysis' | 'file';
  /** Directory or file name only, never an absolute path. */
  name: string;
  /** When the analysis finished (ISO 8601), or null for a report file. */
  analyzedAt: string | null;
  git: { branch: string | null; commit: string | null } | null;
}

export interface DashboardState {
  /** The report as JSON text (`deptrace report --format json`). */
  report: string;
  meta: DashboardMeta;
}

export interface DashboardServerOptions {
  /** The built dashboard (index.html and assets). */
  assetsDir: string;
  /** 0 picks a free port. */
  port: number;
  initial: DashboardState;
  /** Re-runs the analysis; absent when serving a report file. */
  analyze?: () => Promise<DashboardState>;
  /**
   * Runs `deptrace audit` and returns its JSON report. The only network use of the
   * dashboard, and only when the user asks; absent when serving a report file.
   */
  audit?: () => Promise<string>;
}

const HOST = '127.0.0.1';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

interface Asset {
  body: Buffer;
  type: string;
}

/**
 * Loads every file of the built dashboard into memory once. Requests are
 * answered from this map only, so a URL can never reach the filesystem.
 */
export async function loadAssets(directory: string): Promise<Map<string, Asset>> {
  const assets = new Map<string, Asset>();
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    const type = CONTENT_TYPES[path.extname(entry.name)];
    if (type === undefined) continue;
    const url = `/${path.relative(directory, file).split(path.sep).join('/')}`;
    assets.set(url, { body: await readFile(file), type });
  }
  return assets;
}

/**
 * Serves the dashboard on 127.0.0.1 only. The API has three endpoints:
 * `GET /api/report` and, for live analyses, `POST /api/analyze` and
 * `POST /api/audit`. None takes a path or any other parameter from the browser.
 */
export async function startDashboardServer(
  options: DashboardServerOptions,
): Promise<{ server: Server; url: string }> {
  const assets = await loadAssets(options.assetsDir);
  if (!assets.has('/index.html')) {
    throw new Error(`index.html not found in ${options.assetsDir}`);
  }
  let state = options.initial;
  let analyzing: Promise<DashboardState> | null = null;
  let auditing: Promise<string> | null = null;
  let port = options.port;

  const send = (
    response: ServerResponse,
    status: number,
    body: string | Buffer,
    type = 'text/plain; charset=utf-8',
  ) => {
    response.writeHead(status, {
      ...SECURITY_HEADERS,
      'Content-Type': type,
      'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'no-store',
    });
    response.end(body);
  };
  const sendState = (response: ServerResponse) => {
    send(
      response,
      200,
      `{"meta":${JSON.stringify(state.meta)},"live":${String(options.analyze !== undefined)},"report":${state.report}}`,
      'application/json; charset=utf-8',
    );
  };

  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    // DNS rebinding: a page on another domain resolving to 127.0.0.1 sends its own Host.
    const host = request.headers.host;
    if (host !== `${HOST}:${String(port)}` && host !== `localhost:${String(port)}`) {
      send(response, 403, 'Forbidden: unexpected Host header.\n');
      return;
    }
    const url = new URL(request.url ?? '/', `http://${host}`);

    /** Rejects anything but a same-origin, body-less POST that names its action. */
    const acceptAction = (action: string): boolean => {
      if (request.method !== 'POST') {
        send(response, 405, 'Method not allowed.\n');
        return false;
      }
      // Cross-site requests: browsers always send Origin on POST. The custom
      // header also forces a CORS preflight, which this server never approves.
      if (
        request.headers.origin !== `http://${host}` ||
        request.headers['x-deptrace-request'] !== action
      ) {
        send(response, 403, 'Forbidden: cross-origin request.\n');
        return false;
      }
      const length = Number(request.headers['content-length'] ?? 0);
      if (length > 0 || request.headers['transfer-encoding'] !== undefined) {
        send(response, 413, 'This endpoint takes no request body.\n');
        return false;
      }
      return true;
    };

    if (url.pathname === '/api/audit') {
      if (!acceptAction('audit')) return;
      if (!options.audit) {
        send(response, 409, 'This dashboard shows a report file; it cannot run an audit.\n');
        return;
      }
      if (auditing) {
        send(response, 409, 'An audit is already running.\n');
        return;
      }
      auditing = options.audit();
      let body: string;
      try {
        body = await auditing;
      } catch (error) {
        send(
          response,
          502,
          `Audit failed: ${error instanceof Error ? error.message : String(error)}\n`,
        );
        return;
      } finally {
        auditing = null;
      }
      send(response, 200, body, 'application/json; charset=utf-8');
      return;
    }

    if (url.pathname === '/api/analyze') {
      if (!acceptAction('analyze')) return;
      if (!options.analyze) {
        send(response, 409, 'This dashboard shows a report file; it cannot re-analyze.\n');
        return;
      }
      if (analyzing) {
        send(response, 409, 'An analysis is already running.\n');
        return;
      }
      analyzing = options.analyze();
      try {
        state = await analyzing;
      } catch (error) {
        send(
          response,
          500,
          `Analysis failed: ${error instanceof Error ? error.message : String(error)}\n`,
        );
        return;
      } finally {
        analyzing = null;
      }
      sendState(response);
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      send(response, 405, 'Method not allowed.\n');
      return;
    }
    if (url.pathname === '/api/report') {
      sendState(response);
      return;
    }
    const asset = assets.get(url.pathname === '/' ? '/index.html' : url.pathname);
    if (asset) {
      send(response, 200, asset.body, asset.type);
      return;
    }
    send(response, 404, 'Not found.\n');
  };

  const server = createServer(
    { maxHeaderSize: 16 * 1024, requestTimeout: 120_000 },
    (request, response) => {
      handle(request, response).catch((error: unknown) => {
        if (!response.headersSent) send(response, 500, 'Internal error.\n');
        else response.destroy(error instanceof Error ? error : undefined);
      });
    },
  );
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, HOST, () => {
      server.off('error', reject);
      resolve();
    });
  });
  port = (server.address() as AddressInfo).port;
  return { server, url: `http://${HOST}:${String(port)}/` };
}
