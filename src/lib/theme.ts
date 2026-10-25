import { useCallback, useEffect, useState } from 'react';

/** The look the person chose: follow the device, or force light or dark. Saved in this browser. */
export type Theme = 'auto' | 'light' | 'dark';

const KEY = 'tema';
const LIGHT_BAR = '#1e4fd8';
const DARK_BAR = '#0a111a';

export const THEME_LABEL: Record<Theme, string> = { auto: 'Automático', light: 'Claro', dark: 'Oscuro' };

export function storedTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

const deviceIsDark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;

/** Colours the browser bar of the installed app to match the theme in use. */
function syncBar(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'auto' && deviceIsDark());
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = dark ? DARK_BAR : LIGHT_BAR;
}

/** Puts a theme in place: `data-theme` on the page (none means follow the device) and the saved choice. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  try {
    if (theme === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    /* private window: the choice just lasts until the page closes */
  }
  syncBar(theme);
}

/** The theme in use and a way to change it; follows the device while the choice is «Automático». */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(storedTheme);
  const set = useCallback((t: Theme) => {
    setTheme(t);
    applyTheme(t);
  }, []);
  useEffect(() => {
    if (theme !== 'auto' || typeof matchMedia !== 'function') return;
    const q = matchMedia('(prefers-color-scheme: dark)');
    const on = () => syncBar('auto');
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, [theme]);
  return [theme, set] as const;
}
