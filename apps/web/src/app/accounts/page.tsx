'use client';
import { useEffect, useState } from 'react';
import { getAccounts, setAccountConnected } from '@/lib/api-client';
import { marketplaceLabel } from '@/lib/marketplaces';
import type { MarketplaceAccountView } from '@multimarket/shared';

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<MarketplaceAccountView[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAccounts().then(setAccounts).catch((e) => setError((e as Error).message));
  }, []);

  async function toggle(a: MarketplaceAccountView) {
    const next = !a.connected;
    setAccounts((list) => list.map((x) => (x.marketplace === a.marketplace ? { ...x, connected: next } : x)));
    try {
      await setAccountConnected(a.marketplace, next);
    } catch (e) {
      setError((e as Error).message);
      setAccounts((list) => list.map((x) => (x.marketplace === a.marketplace ? { ...x, connected: a.connected } : x)));
    }
  }

  if (error) return <p className="p-6 text-red-600">{error}</p>;

  return (
    <main className="mx-auto mt-10 max-w-2xl p-6">
      <h1 className="text-xl font-semibold">Mes comptes</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Choisissez les marketplaces proposés lors de la publication.
      </p>
      <ul className="mt-4 flex flex-col gap-2">
        {accounts.map((a) => (
          <li key={a.marketplace} className="flex items-center justify-between rounded border p-3 dark:border-gray-700">
            <span>
              {marketplaceLabel(a.marketplace)}
              <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{a.mode}</span>
            </span>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={a.connected} onChange={() => toggle(a)} />
              {a.connected ? 'Activé' : 'Désactivé'}
            </label>
          </li>
        ))}
      </ul>
    </main>
  );
}
