import { useEffect, useState } from 'react';

export const PAGES = [
  'overview',
  'graph',
  'layers',
  'violations',
  'cycles',
  'modules',
  'reports',
  'configuration',
  'privacy',
] as const;

export type Page = (typeof PAGES)[number];

export interface Route {
  page: Page;
  params: URLSearchParams;
}

/** Routes live in the hash (#/graph?focus=src/a.ts), so the server only serves one page. */
export function parseHash(hash: string): Route {
  const [path = '', query = ''] = hash.replace(/^#\/?/, '').split('?');
  const page = (PAGES as readonly string[]).includes(path) ? (path as Page) : 'overview';
  return { page, params: new URLSearchParams(query) };
}

export function href(
  page: Page,
  params: Record<string, string | number | null | undefined> = {},
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') query.set(key, String(value));
  }
  const text = query.toString();
  return `#/${page}${text ? `?${text}` : ''}`;
}

export function navigate(
  page: Page,
  params?: Record<string, string | number | null | undefined>,
): void {
  window.location.hash = href(page, params);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const update = () => {
      setRoute(parseHash(window.location.hash));
    };
    window.addEventListener('hashchange', update);
    return () => {
      window.removeEventListener('hashchange', update);
    };
  }, []);
  return route;
}
