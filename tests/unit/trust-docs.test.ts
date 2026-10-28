import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { ROOT } from '../helpers.js';

const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');

const POLICIES = ['SECURITY.md', 'PRIVACY.md', 'TERMS.md'];
const TRUST_DOCS = [
  ...POLICIES,
  'docs/trust/README.md',
  'docs/trust/data-inventory.md',
  'docs/trust/threat-model.md',
  'docs/trust/operations.md',
];

const placeholders = (text: string) =>
  [...text.matchAll(/\[\[PLACEHOLDER: ([\s\S]*?)\]\]/g)]
    .map((match) => (match[1] ?? '').replace(/\s+/g, ' '))
    // "[[PLACEHOLDER: …]]" itself is how the documents explain the convention.
    .filter((text) => text !== '…');

describe('security, privacy and legal documents', () => {
  it('flag every policy as a draft that needs legal review', () => {
    for (const file of POLICIES) {
      expect(read(file), file).toMatch(
        /^# .+\n\n> \*\*Draft\. Legal review required before publication\.\*\*/,
      );
    }
  });

  it('list every placeholder in the Trust Center checklist, and nothing stale', () => {
    const checklist = [...read('docs/trust/README.md').matchAll(/^- \[ \] `([^`]+)`/gm)].map(
      (match) => match[1] ?? '',
    );
    const used = TRUST_DOCS.flatMap((file) =>
      placeholders(read(file)).map((text) => ({ file, text })),
    );
    expect(used.length).toBeGreaterThan(0);
    for (const { file, text } of used) {
      expect(
        checklist.some((key) => text.includes(key)),
        `${file}: "${text}" is not in the Open placeholders list`,
      ).toBe(true);
    }
    for (const key of checklist) {
      expect(
        used.some(({ text }) => text.includes(key)),
        `stale checklist entry "${key}"`,
      ).toBe(true);
    }
  });

  it('invent no contact details or compliance claims', () => {
    for (const file of [...TRUST_DOCS, '.github/ISSUE_TEMPLATE/config.yml']) {
      const text = read(file);
      expect(text, `${file}: email address`).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
      expect(text, `${file}: mailto link`).not.toMatch(/mailto:/i);
      expect(text, `${file}: phone number`).not.toMatch(/\+\d[\d ()-]{7,}/);
      expect(text, `${file}: compliance claim`).not.toMatch(
        /\b(?:GDPR|CCPA|HIPAA|SOC ?2|ISO ?27001|PCI)\b|\bcompliant\b|\bcertified\b/i,
      );
    }
  });

  it('state facts that match the code', () => {
    const inventory = read('docs/trust/data-inventory.md');
    // Artifact retention in the workflows.
    for (const workflow of [
      '.github/workflows/architecture.yml',
      'docs/examples/github-actions/deptrace.yml',
    ]) {
      expect(read(workflow)).toMatch(/retention-days: 14\b/);
    }
    expect(inventory).toContain('`retention-days: 14`');
    expect(read('PRIVACY.md')).toContain('`retention-days: 14`');
    // The only browser storage key.
    expect(read('dashboard/src/lib/theme.ts')).toContain("THEME_STORAGE_KEY = 'deptrace.theme'");
    expect(inventory).toContain('`deptrace.theme`');
    // The local server's binding.
    expect(read('src/dashboard/server.ts')).toContain("const HOST = '127.0.0.1';");
  });

  it('route security reports away from public issues', () => {
    const config = parse(read('.github/ISSUE_TEMPLATE/config.yml')) as {
      contact_links: { name: string; url: string }[];
    };
    const link = config.contact_links.find((entry) => /security/i.test(entry.name));
    expect(link?.url).toMatch(/^https:\/\/github\.com\/[^/]+\/[^/]+\/security\/policy$/);
    expect(read('SECURITY.md')).toMatch(/do not report security vulnerabilities in public/i);
  });

  it('configure Dependabot for npm and the pinned GitHub Actions', () => {
    const config = parse(read('.github/dependabot.yml')) as {
      updates: { 'package-ecosystem': string }[];
    };
    expect(config.updates.map((update) => update['package-ecosystem']).sort()).toEqual([
      'github-actions',
      'npm',
    ]);
  });
});
