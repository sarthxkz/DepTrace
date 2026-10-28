import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  fetchAdvisories,
  readLockfile,
  suggestFix,
  type Advisory,
  type InstalledPackage,
} from '../../src/audit/audit.js';
import { runAudit } from '../../src/audit/report.js';
import { ExitCode } from '../../src/core/constants.js';
import { makeTempDir } from '../helpers.js';

const npm = (name: string, version: string) =>
  `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`;

async function project(lock: unknown): Promise<string> {
  const dir = await makeTempDir();
  await writeFile(path.join(dir, 'package-lock.json'), JSON.stringify(lock));
  return dir;
}

const LOCK = {
  lockfileVersion: 3,
  packages: {
    '': { name: 'app', dependencies: { lodash: '^4.17.0' }, devDependencies: { tool: '1.0.0' } },
    'node_modules/lodash': { version: '4.17.20', resolved: npm('lodash', '4.17.20') },
    'node_modules/tool': { version: '1.0.0', resolved: npm('tool', '1.0.0'), dev: true },
    'node_modules/tool/node_modules/lodash': {
      version: '3.10.1',
      resolved: npm('lodash', '3.10.1'),
      dev: true,
    },
    'node_modules/@corp/secret': { version: '2.0.0', resolved: 'https://npm.corp.example/x.tgz' },
    'node_modules/linked': { link: true, resolved: 'packages/linked' },
  },
};

const advisory = (id: number, range: string, severity: Advisory['severity']) => ({
  id,
  url: `https://github.com/advisories/GHSA-${String(id)}`,
  title: `Advisory ${String(id)}`,
  severity,
  vulnerable_versions: range,
  cwe: ['CWE-94'],
  cvss: { score: 7.2 },
});

/** A fake registry: the bulk advisory endpoint and abbreviated package metadata. */
function fakeRegistry(sent: unknown[] = []): typeof fetch {
  const respond = (url: string, body: string): Response => {
    if (url.endsWith('/-/npm/v1/security/advisories/bulk')) {
      sent.push(JSON.parse(body));
      return Response.json({
        lodash: [advisory(1, '<4.17.21', 'high'), advisory(2, '>=4.0.0 <=4.17.23', 'moderate')],
        tool: [{ id: 'not a number' }],
        unrequested: [advisory(3, '*', 'critical')],
      });
    }
    if (url.endsWith('/lodash')) {
      return Response.json({
        versions: { '3.10.1': {}, '4.17.21': {}, '4.18.0': {}, '5.0.0-rc.1': {} },
      });
    }
    return new Response('not found', { status: 404 });
  };
  // The audit passes the URL as a string and the body as a JSON string.
  const fake = (input: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(
      respond(
        input instanceof Request ? input.url : input.toString(),
        typeof init?.body === 'string' ? init.body : '',
      ),
    );
  return fake;
}

describe('readLockfile', () => {
  it('lists registry packages, and keeps private, git and linked ones out', async () => {
    const lock = await readLockfile(await project(LOCK));
    expect(lock.packages.map((p) => [p.name, p.version, p.direct, p.dev])).toEqual([
      ['lodash', '4.17.20', true, false],
      ['tool', '1.0.0', true, true],
      ['lodash', '3.10.1', false, true],
    ]);
    expect(lock.packages[0]?.declaredRange).toBe('^4.17.0');
    expect(lock.notChecked.map((p) => p.name)).toEqual(['@corp/secret']);
  });

  it('rejects a missing or version 1 lockfile with a usage error', async () => {
    await expect(readLockfile(await makeTempDir())).rejects.toMatchObject({
      exitCode: ExitCode.UsageError,
    });
    await expect(
      readLockfile(await project({ lockfileVersion: 1, dependencies: {} })),
    ).rejects.toMatchObject({ exitCode: ExitCode.UsageError, message: /version 2 or 3/ });
  });
});

describe('fetchAdvisories', () => {
  it('sends only names and versions, and drops malformed or unrequested entries', async () => {
    const sent: unknown[] = [];
    const { packages } = await readLockfile(await project(LOCK));
    const result = await fetchAdvisories(packages, 'https://registry.test', fakeRegistry(sent));
    expect(sent).toEqual([{ lodash: ['4.17.20', '3.10.1'], tool: ['1.0.0'] }]);
    expect([...result.keys()]).toEqual(['lodash']);
    expect(result.get('lodash')?.[0]).toMatchObject({ id: 1, cvssScore: 7.2, cwe: ['CWE-94'] });
  });

  it('fails clearly when the service cannot be reached', async () => {
    const { packages } = await readLockfile(await project(LOCK));
    const offline = (() => Promise.reject(new Error('getaddrinfo ENOTFOUND'))) as typeof fetch;
    await expect(fetchAdvisories(packages, undefined, offline)).rejects.toMatchObject({
      exitCode: ExitCode.OperationalError,
      message: /No vulnerabilities were checked/,
    });
  });
});

describe('suggestFix', () => {
  const pkg: InstalledPackage = {
    name: 'lodash',
    version: '4.17.20',
    path: 'node_modules/lodash',
    dev: false,
    direct: true,
    declaredRange: '^4.17.0',
  };
  const ranges = [
    advisory(1, '<4.17.21', 'high'),
    advisory(2, '>=4.0.0 <=4.17.23', 'moderate'),
  ].map((a) => ({ ...a, vulnerableVersions: a.vulnerable_versions }) as unknown as Advisory);
  const published = ['4.17.21', '4.17.23', '4.18.0', '5.0.0', '6.0.0-beta.1'];

  it('picks the lowest version that clears every advisory, inside the declared range', () => {
    expect(suggestFix(pkg, ranges, published)).toMatchObject({
      version: '4.18.0',
      command: 'npm update lodash',
      breaking: false,
    });
  });

  it('installs explicitly when the fix is outside the declared range, and flags major updates', () => {
    const fix = suggestFix({ ...pkg, declaredRange: '~4.17.0' }, ranges, ['4.17.23', '5.0.0']);
    expect(fix).toMatchObject({
      version: '5.0.0',
      command: 'npm install lodash@5.0.0',
      breaking: true,
    });
  });

  it('explains transitive dependencies and missing fixes instead of guessing a command', () => {
    expect(suggestFix({ ...pkg, direct: false }, ranges, published)).toMatchObject({
      version: '4.18.0',
      command: null,
      note: expect.stringContaining('npm explain lodash') as string,
    });
    expect(suggestFix(pkg, ranges, ['4.17.23'])).toMatchObject({ version: null, command: null });
    expect(suggestFix(pkg, ranges, null).note).toContain('Could not look up');
  });
});

describe('runAudit', () => {
  it('groups advisories per installed copy and links them to the importing files', async () => {
    const report = await runAudit(await project(LOCK), {
      toolVersion: '0.0.0',
      external: [
        { packageName: 'lodash', references: [{ file: 'src/a.ts', line: 1, column: 15 }] },
      ],
      registry: 'https://registry.test',
      fetchImpl: fakeRegistry(),
    });
    expect(report.summary).toMatchObject({ high: 2, moderate: 0, packages: 2 });
    expect(report.packagesNotChecked).toBe(1);
    expect(report.packages.map((p) => [p.path, p.severity, p.advisories.length])).toEqual([
      ['node_modules/lodash', 'high', 2],
      ['node_modules/tool/node_modules/lodash', 'high', 1],
    ]);
    expect(report.packages[0]?.importedBy).toEqual([{ file: 'src/a.ts', line: 1, column: 15 }]);
    expect(report.packages[0]?.fix.command).toBe('npm update lodash');
  });
});
