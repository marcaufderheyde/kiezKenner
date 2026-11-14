import type { ResolvedTheme } from './types';

const STORAGE_KEY = 'color-scheme';

function getMetaElement(): HTMLMetaElement | null {
  return document.querySelector('meta[name="color-scheme"]');
}

export function getSystemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getResolvedTheme(): ResolvedTheme {
  const meta = getMetaElement();
  const content = meta?.getAttribute('content');
  if (content === 'dark' || content === 'light') {
    return content;
  }
  return getSystemTheme();
}

function syncThemeColorMeta(resolved: ResolvedTheme): void {
  const color = resolved === 'dark' ? '#0b1120' : '#f4f1ea';
  for (const tag of document.querySelectorAll('meta[name="theme-color"]')) {
    tag.setAttribute('content', color);
  }
}

export function toggleColorScheme(): ResolvedTheme {
  const current = getResolvedTheme();
  const target: ResolvedTheme = current === 'dark' ? 'light' : 'dark';
  const system = getSystemTheme();

  try {
    if (target !== system) {
      localStorage.setItem(STORAGE_KEY, target);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Ignore blocked storage
  }

  const meta = getMetaElement();
  if (meta) {
    meta.setAttribute('content', target === system ? 'light dark' : target);
  }

  syncThemeColorMeta(target);
  return target;
}

export function subscribeThemeChanges(onChange: (theme: ResolvedTheme) => void): () => void {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');

  const handleMediaChange = () => {
    // Do NOT remove stored override when OS switches to match it
    onChange(getResolvedTheme());
  };

  const handleStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    const meta = getMetaElement();
    if (meta) {
      meta.setAttribute('content', e.newValue === 'light' || e.newValue === 'dark' ? e.newValue : 'light dark');
    }
    const resolved = getResolvedTheme();
    syncThemeColorMeta(resolved);
    onChange(resolved);
  };

  mql.addEventListener('change', handleMediaChange);
  window.addEventListener('storage', handleStorage);
  syncThemeColorMeta(getResolvedTheme());

  return () => {
    mql.removeEventListener('change', handleMediaChange);
    window.removeEventListener('storage', handleStorage);
  };
}
