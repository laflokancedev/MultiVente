'use client';
import { useEffect, useState } from 'react';
import { applyTheme } from '@/lib/theme';

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    applyTheme(next);
  }

  return (
    <button onClick={toggle} aria-label="Basculer le thème" className="rounded border px-2 py-1 dark:border-gray-700">
      {dark ? '☀️' : '🌙'}
    </button>
  );
}
