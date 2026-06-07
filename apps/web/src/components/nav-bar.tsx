'use client';
import { useEffect, useState } from 'react';
import { ThemeToggle } from './theme-toggle';

export function NavBar() {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setAuthed(!!localStorage.getItem('accessToken'));
  }, []);

  function logout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    window.location.href = '/login';
  }

  return (
    <nav className="flex items-center justify-between border-b px-4 py-3 dark:border-gray-700">
      <a href="/" className="font-semibold">MultiMarket</a>
      <div className="flex items-center gap-4 text-sm">
        {authed && (
          <>
            <a href="/dashboard">Tableau de bord</a>
            <a href="/listings">Mes annonces</a>
            <a href="/accounts">Mes comptes</a>
            <a href="/listings/new">+ Nouvelle</a>
            <button onClick={logout} className="text-red-600">Déconnexion</button>
          </>
        )}
        <ThemeToggle />
      </div>
    </nav>
  );
}
