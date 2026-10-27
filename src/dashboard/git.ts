import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface GitHead {
  /** Checked-out branch, or null when HEAD is detached. */
  branch: string | null;
  /** Full commit id, or null when it cannot be read (e.g. a new repository). */
  commit: string | null;
}

const COMMIT = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
// Git forbids control characters in ref names; reject anything else odd too.
const BRANCH = /^[\w./-]{1,200}$/;

const read = (file: string) => readFile(file, 'utf8').then((text) => text.trim());

/**
 * Reads the current branch and commit straight from `.git`, without running
 * git (which could execute hooks or fsmonitor commands configured by the
 * repository). Returns null when anything is missing or unexpected, so the
 * dashboard never shows a guessed value.
 */
export async function readGitHead(gitRoot: string): Promise<GitHead | null> {
  try {
    let gitDir = path.join(gitRoot, '.git');
    const pointer = await read(gitDir).catch(() => null); // a file in worktrees and submodules
    if (pointer !== null) {
      if (!pointer.startsWith('gitdir: ')) return null;
      gitDir = path.resolve(gitRoot, pointer.slice('gitdir: '.length));
    }
    // Linked worktrees keep refs in the common directory.
    const common = await read(path.join(gitDir, 'commondir')).catch(() => null);
    const refsDir = common === null ? gitDir : path.resolve(gitDir, common);

    const head = await read(path.join(gitDir, 'HEAD'));
    if (COMMIT.test(head)) return { branch: null, commit: head };
    if (!head.startsWith('ref: refs/heads/')) return null;
    const ref = head.slice('ref: '.length);
    const branch = ref.slice('refs/heads/'.length);
    if (!BRANCH.test(branch) || branch.includes('..')) return null;
    return { branch, commit: await resolveRef(refsDir, ref) };
  } catch {
    return null;
  }
}

async function resolveRef(refsDir: string, ref: string): Promise<string | null> {
  const loose = await read(path.join(refsDir, ...ref.split('/'))).catch(() => null);
  if (loose !== null) return COMMIT.test(loose) ? loose : null;
  const packed = await read(path.join(refsDir, 'packed-refs')).catch(() => '');
  for (const line of packed.split('\n')) {
    const [commit, name] = line.trim().split(' ');
    if (name === ref && commit !== undefined && COMMIT.test(commit)) return commit;
  }
  return null;
}
