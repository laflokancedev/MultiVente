const KEY = 'theme';

export function prefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
}

export function getStoredTheme(): 'dark' | 'light' | null {
  const t = localStorage.getItem(KEY);
  return t === 'dark' || t === 'light' ? t : null;
}

export function isDark(): boolean {
  const stored = getStoredTheme();
  return stored ? stored === 'dark' : prefersDark();
}

export function applyTheme(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark);
  localStorage.setItem(KEY, dark ? 'dark' : 'light');
}
