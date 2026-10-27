import { useEffect, useState } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';
/** The only key the dashboard writes to browser storage. */
export const THEME_STORAGE_KEY = 'deptrace.theme';
const KEY = THEME_STORAGE_KEY;

function stored(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

/** The viewer's theme choice; "system" follows the operating system. */
export function useTheme(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>(stored);
  useEffect(() => {
    const root = document.documentElement;
    if (choice === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', choice);
    try {
      if (choice === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, choice);
    } catch {
      // Storage can be unavailable (private windows); the choice still applies now.
    }
    window.dispatchEvent(new Event('deptrace-theme'));
  }, [choice]);
  return [choice, setChoice];
}

// matchMedia is missing in some embedded browsers and test environments.
const darkQuery = (): MediaQueryList | null =>
  typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

/** Re-renders when the effective theme changes (choice or operating system). */
export function useEffectiveTheme(): 'light' | 'dark' {
  const read = (): 'light' | 'dark' => {
    const forced = document.documentElement.getAttribute('data-theme');
    if (forced === 'light' || forced === 'dark') return forced;
    return darkQuery()?.matches ? 'dark' : 'light';
  };
  const [theme, setTheme] = useState(read);
  useEffect(() => {
    const update = () => {
      setTheme(read());
    };
    const media = darkQuery();
    media?.addEventListener('change', update);
    window.addEventListener('deptrace-theme', update);
    return () => {
      media?.removeEventListener('change', update);
      window.removeEventListener('deptrace-theme', update);
    };
  }, []);
  return theme;
}
