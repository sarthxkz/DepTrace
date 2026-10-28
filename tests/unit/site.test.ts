import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../helpers.js';

const SITE = path.join(ROOT, 'site');
const html = readFileSync(path.join(SITE, 'index.html'), 'utf8');
const attributes = (name: string) =>
  [...html.matchAll(new RegExp(`\\s${name}="([^"]*)"`, 'g'))].map((match) => match[1] ?? '');

describe('website (site/)', () => {
  it('references only files that exist', () => {
    const local = [...attributes('src'), ...attributes('href')].filter(
      (url) => !/^(?:https?:|#|mailto:)/.test(url),
    );
    expect(local.length).toBeGreaterThan(3);
    for (const url of local) expect(existsSync(path.join(SITE, url)), url).toBe(true);
  });

  it('loads nothing from other origins and runs no scripts (works under a strict CSP)', () => {
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/\sstyle="/);
    for (const url of attributes('src')) expect(url).not.toMatch(/^https?:/);
    for (const tag of html.match(/<link [^>]*>/g) ?? []) expect(tag).not.toMatch(/href="https?:/);
    expect(readFileSync(path.join(SITE, 'styles.css'), 'utf8')).not.toMatch(
      /@import|url\(\s*['"]?https?:/,
    );
  });

  it('describes every image and reserves its space', () => {
    const images = html.match(/<img\s[\s\S]*?\/>/g) ?? [];
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) {
      expect(image).toMatch(/\salt="[^"]{20,}"/);
      expect(image).toMatch(/\swidth="\d+"/);
      expect(image).toMatch(/\sheight="\d+"/);
    }
  });

  it('shows the version that package.json declares', () => {
    const { version } = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
      version: string;
    };
    expect(html).toContain(`DepTrace ${version}`);
    expect(html).toContain(`<dd>${version}</dd>`);
  });
});
