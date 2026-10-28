import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createServer as createHttpServer, request } from 'node:http';
import { createServer } from 'node:net';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseValue } from '../../dashboard/src/contract/load.js';
import { CLI_PATH, copyFixture, defined, makeTempDir, ROOT, runCli } from '../helpers.js';

interface Response {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

function http(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      { method: options.method ?? 'GET', headers: options.headers },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (body += chunk));
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body });
        });
      },
    );
    req.on('error', reject);
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

const servers: ChildProcess[] = [];
// Wait for the servers to exit: on Windows their working directory cannot be removed before.
afterAll(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve) => {
          if (server.exitCode !== null || server.signalCode !== null) {
            resolve();
            return;
          }
          server.once('exit', () => {
            resolve();
          });
          server.kill();
        }),
    ),
  );
});

/** Starts `deptrace dashboard` and resolves with its URL once it is listening. */
function startDashboard(
  args: string[],
  cwd: string,
): Promise<{ url: string; origin: string; port: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, 'dashboard', '--port', '0', ...args], { cwd });
    servers.push(child);
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      const match = /http:\/\/127\.0\.0\.1:(\d+)\//.exec(output);
      if (match) resolve({ url: match[0], origin: match[0].slice(0, -1), port: defined(match[1]) });
    });
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.on('exit', (code) => {
      reject(new Error(`dashboard exited with ${String(code)}: ${output}`));
    });
  });
}

const json = (text: string) => JSON.parse(text) as Record<string, unknown>;

describe('report --format json (the dashboard contract)', () => {
  it('passes the dashboard validator for every fixture', async () => {
    for (const name of ['storefront', 'layered', 'app', 'monorepo']) {
      const dir = await copyFixture(name);
      const result = runCli(['report', '--format', 'json'], dir);
      expect(result.code, result.stderr).toBe(0);
      const loaded = parseValue(JSON.parse(result.stdout));
      expect(loaded.kind).toBe('report');
    }
  });

  it('includes the layer policy and, with --baseline, baseline statuses', async () => {
    const dir = await copyFixture('storefront');
    const plain = json(runCli(['report', '--format', 'json'], dir).stdout);
    const architecture = plain.architecture as Record<string, unknown>;
    expect(architecture.layerRule).toEqual({
      id: 'layer-boundaries',
      severity: 'error',
      allowed: {
        ui: ['application', 'shared'],
        application: ['domain', 'shared'],
        domain: ['shared'],
        infrastructure: ['application', 'domain', 'shared'],
        shared: [],
      },
    });
    expect(architecture.baseline).toBeUndefined();

    const result = runCli(
      ['report', '--format', 'json', '--baseline', 'deptrace-baseline.json'],
      dir,
    );
    expect(result.code).toBe(0);
    const withBaseline = json(result.stdout).architecture as Record<string, unknown>;
    expect(withBaseline.baseline).toMatchObject({
      file: 'deptrace-baseline.json',
      new: 1,
      existing: 4,
      resolved: 1,
    });
    const statuses = (withBaseline.violations as { baselineStatus: string }[]).map(
      (v) => v.baselineStatus,
    );
    expect(statuses.filter((s) => s === 'new')).toHaveLength(1);
  });

  it('shows baseline status in the text report and rejects bad baselines', async () => {
    const dir = await copyFixture('storefront');
    const text = runCli(['report', '--baseline', 'deptrace-baseline.json'], dir);
    expect(text.code).toBe(0);
    expect(text.stdout).toMatch(
      /Baseline: deptrace-baseline\.json \(1 new, 4 existing, 1 resolved\)/,
    );
    expect(runCli(['report', '--baseline', 'missing.json'], dir).code).toBe(2);
    expect(
      runCli(
        ['report', '--format', 'json', '--baseline', 'deptrace-baseline.json'],
        await copyFixture('app'),
      ).code,
    ).toBe(2);
  });

  it('matches the committed dashboard test fixtures', async () => {
    const dir = await copyFixture('storefront');
    const fixtures = path.join(ROOT, 'dashboard', 'tests', 'fixtures');
    const report = json(
      runCli(['report', '--format', 'json', '--baseline', 'deptrace-baseline.json'], dir).stdout,
    );
    (report.summary as Record<string, number>).durationMs = 0;
    expect(report).toEqual(
      JSON.parse(readFileSync(path.join(fixtures, 'storefront-report.json'), 'utf8')),
    );
    const check = runCli(
      ['check', '--format', 'json', '--baseline', 'deptrace-baseline.json'],
      dir,
    );
    expect(JSON.parse(check.stdout)).toEqual(
      JSON.parse(readFileSync(path.join(fixtures, 'storefront-check.json'), 'utf8')),
    );
    runCli(['check', '--baseline', 'deptrace-baseline.json', '--sarif', 'out.sarif'], dir);
    expect(JSON.parse(readFileSync(path.join(dir, 'out.sarif'), 'utf8'))).toEqual(
      JSON.parse(readFileSync(path.join(fixtures, 'storefront.sarif'), 'utf8')),
    );
  });
});

describe('deptrace dashboard', () => {
  it('serves the app and the analysis with security headers', async () => {
    const dir = await copyFixture('storefront');
    const { url } = await startDashboard(['--baseline', 'deptrace-baseline.json'], dir);
    const page = await http(url);
    expect(page.status).toBe(200);
    expect(page.headers['content-type']).toMatch(/text\/html/);
    expect(page.headers['content-security-policy']).toMatch(
      /default-src 'none'; script-src 'self'/,
    );
    expect(page.headers['x-content-type-options']).toBe('nosniff');
    const script = defined(/src="(\/assets\/[^"]+\.js)"/.exec(page.body)?.[1]);
    const asset = await http(new URL(script, url).href);
    expect(asset.status).toBe(200);
    expect(asset.headers['content-type']).toMatch(/text\/javascript/);

    const api = await http(new URL('/api/report', url).href);
    expect(api.status).toBe(200);
    const state = json(api.body);
    expect(state.live).toBe(true);
    expect(state.meta).toMatchObject({ source: 'analysis', name: 'storefront' });
    expect(JSON.stringify(state)).not.toContain(dir); // no absolute paths
    const loaded = parseValue(state.report);
    expect(loaded.kind === 'report' && loaded.report.architecture.baseline?.new).toBe(1);
  });

  it('never maps URLs to files and rejects foreign hosts and cross-site requests', async () => {
    const dir = await copyFixture('storefront');
    const { url, origin, port } = await startDashboard([], dir);
    for (const probe of [
      '/../package.json',
      '/%2e%2e/package.json',
      '/assets/../../package.json',
      '/deptrace.yml',
      '/..%5c..%5cpackage.json',
    ]) {
      expect((await http(`${origin}${probe}`)).status, probe).toBe(404);
    }
    // DNS rebinding: another site's host name pointing at 127.0.0.1.
    expect((await http(url, { headers: { Host: `evil.example:${port}` } })).status).toBe(403);
    expect(
      (await http(new URL('/api/report', url).href, { headers: { Host: 'evil.example' } })).status,
    ).toBe(403);

    const analyze = new URL('/api/analyze', url).href;
    expect((await http(analyze)).status).toBe(405);
    expect(
      (await http(analyze, { method: 'POST', headers: { 'X-DepTrace-Request': 'analyze' } }))
        .status,
    ).toBe(403);
    expect(
      (
        await http(analyze, {
          method: 'POST',
          headers: { Origin: 'https://evil.example', 'X-DepTrace-Request': 'analyze' },
        })
      ).status,
    ).toBe(403);
    expect((await http(analyze, { method: 'POST', headers: { Origin: origin } })).status).toBe(403);
    expect(
      (
        await http(analyze, {
          method: 'POST',
          headers: {
            Origin: origin,
            'X-DepTrace-Request': 'analyze',
            'Content-Type': 'application/json',
          },
          body: '{"directory": "/etc"}',
        })
      ).status,
    ).toBe(413);
    expect((await http(new URL('/api/report', url).href, { method: 'DELETE' })).status).toBe(405);
  });

  it('re-analyzes the same directory on an explicit same-origin request', async () => {
    const dir = await copyFixture('storefront');
    const { url, origin } = await startDashboard([], dir);
    const before = json((await http(new URL('/api/report', url).href)).body);
    await writeFile(
      path.join(dir, 'src', 'shared', 'extra.ts'),
      "import { newId } from './ids';\nexport const x = newId();\n",
    );
    const response = await http(new URL('/api/analyze', url).href, {
      method: 'POST',
      headers: { Origin: origin, 'X-DepTrace-Request': 'analyze' },
    });
    expect(response.status).toBe(200);
    const after = json(response.body);
    const count = (state: Record<string, unknown>) =>
      ((state.report as Record<string, unknown>).nodes as unknown[]).length;
    expect(count(after)).toBe(count(before) + 1);
    expect((after.meta as Record<string, unknown>).analyzedAt).not.toBe(
      (before.meta as Record<string, unknown>).analyzedAt,
    );
  });

  it('runs the dependency audit only on a same-origin request, against the configured registry', async () => {
    const lodash = {
      id: 1,
      url: 'https://github.com/advisories/GHSA-test',
      title: 'Test advisory',
      severity: 'high',
      vulnerable_versions: '<4.17.21',
      cwe: [],
      cvss: { score: 7 },
    };
    const sent: string[] = [];
    const registry = createHttpServer((request, response) => {
      sent.push(`${request.method ?? ''} ${request.url ?? ''}`);
      response.setHeader('Content-Type', 'application/json');
      response.end(
        request.url?.endsWith('/advisories/bulk')
          ? JSON.stringify({ lodash: [lodash] })
          : JSON.stringify({ versions: { '4.17.21': {}, '4.18.0': {} } }),
      );
    });
    await new Promise<void>((resolve) => registry.listen(0, '127.0.0.1', resolve));
    const address = registry.address();
    process.env.DEPTRACE_AUDIT_REGISTRY = `http://127.0.0.1:${String(typeof address === 'object' && address ? address.port : 0)}`;
    try {
      const dir = await copyFixture('storefront');
      await writeFile(
        path.join(dir, 'package-lock.json'),
        JSON.stringify({
          lockfileVersion: 3,
          packages: {
            '': { dependencies: { lodash: '^4.17.0' } },
            'node_modules/lodash': {
              version: '4.17.20',
              resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.20.tgz',
            },
          },
        }),
      );
      const { url, origin } = await startDashboard([], dir);
      const audit = new URL('/api/audit', url).href;
      expect((await http(audit)).status).toBe(405);
      expect(
        (
          await http(audit, {
            method: 'POST',
            headers: { Origin: 'https://evil.example', 'X-DepTrace-Request': 'audit' },
          })
        ).status,
      ).toBe(403);
      expect(sent).toEqual([]);
      const response = await http(audit, {
        method: 'POST',
        headers: { Origin: origin, 'X-DepTrace-Request': 'audit' },
      });
      expect(response.status).toBe(200);
      const report = json(response.body) as { packages: { name: string; fix: unknown }[] };
      expect(report.packages.map((p) => p.name)).toEqual(['lodash']);
      expect(report.packages[0]?.fix).toMatchObject({
        version: '4.17.21',
        command: 'npm update lodash',
      });
      expect(sent[0]).toBe('POST /-/npm/v1/security/advisories/bulk');
    } finally {
      delete process.env.DEPTRACE_AUDIT_REGISTRY;
      registry.close();
    }
  });

  it('serves a saved report file read-only', async () => {
    const dir = await copyFixture('storefront');
    const report = runCli(['report', '--format', 'json'], dir).stdout;
    await writeFile(path.join(dir, 'report.json'), report);
    const { url, origin } = await startDashboard(['--report', 'report.json'], dir);
    const state = json((await http(new URL('/api/report', url).href)).body);
    expect(state.live).toBe(false);
    expect(state.meta).toMatchObject({
      source: 'file',
      name: 'report.json',
      analyzedAt: null,
      git: null,
    });
    const analyze = await http(new URL('/api/analyze', url).href, {
      method: 'POST',
      headers: { Origin: origin, 'X-DepTrace-Request': 'analyze' },
    });
    expect(analyze.status).toBe(409);
    const audit = await http(new URL('/api/audit', url).href, {
      method: 'POST',
      headers: { Origin: origin, 'X-DepTrace-Request': 'audit' },
    });
    expect(audit.status).toBe(409);
  });

  it('fails clearly on bad options and files', async () => {
    const dir = await makeTempDir();
    await writeFile(path.join(dir, 'bad.json'), '{ not json');
    const invalid = runCli(['dashboard', '--report', 'bad.json'], dir);
    expect(invalid.code).toBe(2);
    expect(invalid.stderr).toMatch(/is not valid JSON/);
    expect(runCli(['dashboard', '--report', 'missing.json'], dir).code).toBe(1);
    expect(runCli(['dashboard', 'src', '--report', 'bad.json'], dir).code).toBe(2);
    expect(runCli(['dashboard', '--port', '70000'], dir).code).toBe(2);
    expect(runCli(['dashboard', '--port', 'abc'], dir).code).toBe(2);
  });

  it('reports a port that is already in use', async () => {
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
    const address = blocker.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const dir = await copyFixture('storefront');
    const result = runCli(['dashboard', '--port', String(port)], dir);
    blocker.close();
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/already in use/);
  });
});
