import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readGitHead } from '../../src/dashboard/git.js';
import { makeTempDir } from '../helpers.js';

const COMMIT = '3d3c42e5aac5ba805825da76410c181273ba90b1';
const OTHER = '949feb2413d6458794dcd2491c4babbbce0c15c1';

async function repo(files: Record<string, string>): Promise<string> {
  const root = await makeTempDir();
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), content);
  }
  return root;
}

describe('readGitHead', () => {
  it('reads a branch and its loose ref', async () => {
    const root = await repo({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.git/refs/heads/main': `${COMMIT}\n`,
    });
    expect(await readGitHead(root)).toEqual({ branch: 'main', commit: COMMIT });
  });

  it('reads packed refs and branch names with slashes', async () => {
    const root = await repo({
      '.git/HEAD': 'ref: refs/heads/feature/graph\n',
      '.git/packed-refs': `# pack-refs with: peeled\n${OTHER} refs/heads/main\n${COMMIT} refs/heads/feature/graph\n`,
    });
    expect(await readGitHead(root)).toEqual({ branch: 'feature/graph', commit: COMMIT });
  });

  it('reads a detached HEAD and a new repository without commits', async () => {
    expect(await readGitHead(await repo({ '.git/HEAD': `${COMMIT}\n` }))).toEqual({
      branch: null,
      commit: COMMIT,
    });
    expect(await readGitHead(await repo({ '.git/HEAD': 'ref: refs/heads/main\n' }))).toEqual({
      branch: 'main',
      commit: null,
    });
  });

  it('follows a worktree .git file to its common directory', async () => {
    const root = await repo({
      'main/.git/refs/heads/topic': `${COMMIT}\n`,
      'main/.git/worktrees/wt/HEAD': 'ref: refs/heads/topic\n',
      'main/.git/worktrees/wt/commondir': '../..\n',
      'wt/.git': 'gitdir: ../main/.git/worktrees/wt\n',
    });
    expect(await readGitHead(path.join(root, 'wt'))).toEqual({ branch: 'topic', commit: COMMIT });
  });

  it('returns null instead of guessing', async () => {
    expect(await readGitHead(await makeTempDir())).toBeNull();
    expect(await readGitHead(await repo({ '.git/HEAD': 'garbage' }))).toBeNull();
    expect(
      await readGitHead(await repo({ '.git/HEAD': 'ref: refs/heads/../../escape\n' })),
    ).toBeNull();
    expect(await readGitHead(await repo({ '.git/HEAD': 'ref: refs/heads/a\u0007b\n' }))).toBeNull();
    expect(
      await readGitHead(
        await repo({
          '.git/HEAD': 'ref: refs/heads/main\n',
          '.git/refs/heads/main': 'not-a-sha\n',
        }),
      ),
    ).toEqual({ branch: 'main', commit: null });
  });
});
