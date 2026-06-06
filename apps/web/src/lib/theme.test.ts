import { describe, it, expect, beforeEach } from 'vitest';
import { getStoredTheme, isDark, applyTheme } from './theme';

describe('theme', () => {
  beforeEach(() => { localStorage.clear(); document.documentElement.className = ''; });

  it('reads the stored theme preference', () => {
    expect(getStoredTheme()).toBeNull();
    localStorage.setItem('theme', 'dark');
    expect(getStoredTheme()).toBe('dark');
    expect(isDark()).toBe(true);
  });

  it('applyTheme toggles the dark class and persists the choice', () => {
    applyTheme(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('dark');
    applyTheme(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('theme')).toBe('light');
  });
});
