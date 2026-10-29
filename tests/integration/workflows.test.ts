import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { copyFixture, makeTempDir, ROOT, writeTree } from '../helpers.js';
import { workflowValidator } from '../schemas.js';

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
}
interface Job {
  permissions?: Record<string, string> | string;
  steps: Step[];
}
interface Workflow {
  on: Record<string, unknown>;
  permissions?: Record<string, string> | string;
  env?: Record<string, string>;
  jobs: Record<string, Job>;
}

const DIRECTORIES = [
  path.join(ROOT, '.github', 'workflows'),
  path.join(ROOT, 'docs', 'examples', 'github-actions'),
];
const files = DIRECTORIES.flatMap((directory) =>
  readdirSync(directory)
    .filter((name) => name.endsWith('.yml'))
    .map((name) => path.join(directory, name)),
);
const load = (file: string) => {
  const text = readFileSync(file, 'utf8');
  return { text, workflow: parse(text) as Workflow };
};
const example = load(path.join(ROOT, 'docs', 'examples', 'github-actions', 'deptrace.yml'));

describe('workflow files', () => {
  const validate = workflowValidator();

  it('exist', () => {
    expect(files.map((file) => path.basename(file)).sort()).toEqual([
      'architecture-code-scanning.yml',
      'architecture.yml',
      'ci.yml',
      'deptrace-code-scanning.yml',
      'deptrace.yml',
    ]);
  });

  it('the schema rejects invalid workflows (the validator is not a no-op)', () => {
    const invalid = {
      on: 'push',
      jobs: { x: { 'runs-on': 'ubuntu-latest', steps: [{ uses: 1 }] } },
    };
    expect(validate(invalid)).toBe(false);
  });

  for (const file of files) {
    const name = path.relative(ROOT, file).split(path.sep).join('/');
    const { text, workflow } = load(file);
    const jobs = Object.values(workflow.jobs);
    const steps = jobs.flatMap((job) => job.steps);

    describe(name, () => {
      it('matches the GitHub workflow schema (SchemaStore)', () => {
        validate(workflow);
        expect(validate.errors ?? []).toEqual([]);
      });

      it('pins every action to a full commit SHA with a version comment', () => {
        const uses = text.split('\n').filter((line) => /^\s*(- )?uses:/.test(line));
        expect(uses.length).toBeGreaterThan(0);
        for (const line of uses) {
          expect(line).toMatch(/uses: [\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
        }
      });

      it('never interpolates expressions into shell scripts', () => {
        for (const step of steps) {
          if (step.run !== undefined) expect(step.run).not.toContain('${{');
        }
      });

      it('does not keep Git credentials in checkouts', () => {
        for (const step of steps.filter((s) => s.uses?.startsWith('actions/checkout@'))) {
          expect(step.with?.['persist-credentials']).toBe(false);
        }
      });

      it('uses least privilege and no privileged pull request triggers', () => {
        expect(Object.keys(workflow.on)).not.toContain('pull_request_target');
        expect(Object.keys(workflow.on)).not.toContain('workflow_run');
        expect(workflow.permissions).toBeDefined();
        const grants = [workflow.permissions, ...jobs.map((job) => job.permissions)].flatMap(
          (permissions) =>
            permissions === undefined
              ? []
              : typeof permissions === 'string'
                ? [permissions]
                : Object.entries(permissions)
                    .filter(([, level]) => level === 'write')
                    .map(([scope]) => scope),
        );
        expect(grants).not.toContain('write-all');
        if (grants.length > 0) {
          // Only SARIF upload writes, and never for pull requests.
          expect(grants).toEqual(['security-events']);
          expect(Object.keys(workflow.on)).not.toContain('pull_request');
          expect(steps.some((s) => s.uses?.startsWith('github/codeql-action/upload-sarif@'))).toBe(
            true,
          );
        }
      });
    });
  }
});

/**
 * The bash GitHub uses for `shell: bash`. On Windows that is Git Bash; the first bash on PATH
 * is often WSL's, which cannot run this checkout's Windows Node.
 */
function findBash(): string {
  if (process.platform !== 'win32') return 'bash';
  // git --exec-path is <Git>/mingw64/libexec/git-core; Git Bash is <Git>/bin/bash.exe.
  const exec = spawnSync('git', ['--exec-path'], { encoding: 'utf8' }).stdout.trim();
  const gitBash = path.resolve(exec, '..', '..', '..', 'bin', 'bash.exe');
  return exec !== '' && existsSync(gitBash) ? gitBash : 'bash';
}
const BASH = findBash();

/** Runs a workflow step's script the way GitHub runs bash steps. */
function runStep(script: string, env: Record<string, string>, cwd: string) {
  const result = spawnSync(BASH, ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

const stepNamed = (name: string) => {
  const step = Object.values(example.workflow.jobs)
    .flatMap((job) => job.steps)
    .find((s) => s.name === name);
  if (step?.run === undefined) throw new Error(`no run step "${name}"`);
  return step.run;
};

/** A fake runner: RUNNER_TEMP with this checkout as the built DepTrace, and a step summary file. */
async function runner() {
  const temp = await makeTempDir();
  await symlink(ROOT, path.join(temp, 'deptrace-tool'), 'junction');
  const summary = path.join(temp, 'step-summary.md');
  await writeFile(summary, '');
  return { RUNNER_TEMP: temp, GITHUB_STEP_SUMMARY: summary };
}

function git(cwd: string, ...args: string[]) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
}

describe('example workflow scripts (run locally with bash)', () => {
  const settings = { ...example.workflow.env, DEPTRACE_DIRECTORY: '.' } as Record<string, string>;

  it('rejects a placeholder or abbreviated DepTrace ref', async () => {
    const env = { ...settings, ...(await runner()) };
    expect(runStep(stepNamed('Validate settings'), env, ROOT).code).toBe(1);
    expect(
      runStep(stepNamed('Validate settings'), { ...env, DEPTRACE_REF: 'main' }, ROOT).code,
    ).toBe(1);
    const sha = 'a'.repeat(40);
    expect(runStep(stepNamed('Validate settings'), { ...env, DEPTRACE_REF: sha }, ROOT).code).toBe(
      0,
    );
  });

  it('propagates the exit code and writes the summary, in full and baseline mode', async () => {
    const repo = await copyFixture('layered');
    const env = { ...settings, ...(await runner()) };
    const script = stepNamed('Check architecture');

    const full = runStep(script, env, repo);
    expect(full.code).toBe(3);
    expect(full.stdout).toMatch(/^::stop-commands::/);
    expect(await readFile(env.GITHUB_STEP_SUMMARY, 'utf8')).toContain(
      'Mode: full architecture check.',
    );
    const report = path.join(env.RUNNER_TEMP, 'deptrace', 'deptrace-report.json');
    expect(JSON.parse(await readFile(report, 'utf8'))).toMatchObject({ result: 'failed' });

    spawnSync(process.execPath, [path.join(ROOT, 'dist', 'index.js'), 'baseline', 'create'], {
      cwd: repo,
    });
    const baseline = runStep(script, { ...env, DEPTRACE_BASELINE: 'deptrace-baseline.json' }, repo);
    expect(baseline.code).toBe(0);
    expect(await readFile(env.GITHUB_STEP_SUMMARY, 'utf8')).toContain(
      '## DepTrace architecture check: passed',
    );

    const strict = runStep(
      script,
      { ...env, DEPTRACE_BASELINE: 'deptrace-baseline.json', DEPTRACE_STRICT: 'true' },
      repo,
    );
    expect(strict.code).toBe(0); // no new violations, so --strict does not fail either
  });

  it('reports configuration and baseline errors as failures, not as passes', async () => {
    const repo = await copyFixture('layered');
    const env = { ...settings, ...(await runner()) };
    const missing = runStep(
      stepNamed('Check architecture'),
      { ...env, DEPTRACE_BASELINE: 'nope.json' },
      repo,
    );
    expect(missing.code).toBe(2);
    expect(await readFile(env.GITHUB_STEP_SUMMARY, 'utf8')).toContain(
      '## DepTrace architecture check: error (exit code 2)',
    );
  });

  it('flags pull requests that change the baseline, and copes with missing history', async () => {
    const repo = await copyFixture('layered');
    git(repo, 'init', '--quiet');
    git(repo, 'config', 'user.email', 'test@example.com');
    git(repo, 'config', 'user.name', 'Test');
    git(repo, 'add', '-A');
    git(repo, 'commit', '--quiet', '-m', 'base');
    const env = { ...settings, ...(await runner()), DEPTRACE_BASELINE: 'deptrace-baseline.json' };
    const script = stepNamed('Flag baseline changes');

    expect(runStep(script, env, repo).stdout).toContain('history not available');

    await writeTree(repo, { 'deptrace-baseline.json': '{}' });
    git(repo, 'add', '-A');
    git(repo, 'commit', '--quiet', '-m', 'accept violations');
    const changed = runStep(script, env, repo);
    expect(changed.code).toBe(0);
    expect(changed.stdout).toContain(
      '::warning::This pull request changes the architecture baseline.',
    );
    expect(await readFile(env.GITHUB_STEP_SUMMARY, 'utf8')).toContain('> [!WARNING]');

    await writeTree(repo, { 'src/other.ts': 'export {};' });
    git(repo, 'add', '-A');
    git(repo, 'commit', '--quiet', '-m', 'unrelated');
    expect(runStep(script, env, repo).stdout).toBe('');
  });

  it('passes untrusted-looking paths to DepTrace as data, not shell code', async () => {
    const repo = await copyFixture('layered');
    const env = { ...settings, ...(await runner()) };
    const marker = path.join(env.RUNNER_TEMP, 'pwned');
    const evil = `$(touch ${marker.split(path.sep).join('/')}); echo hi`;
    const result = runStep(
      stepNamed('Check architecture'),
      { ...env, DEPTRACE_BASELINE: evil },
      repo,
    );
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('Baseline file not found');
    const { existsSync } = await import('node:fs');
    expect(existsSync(marker)).toBe(false);
  });
});
