'use client';
import { useEffect, useState } from 'react';
import { getDashboard } from '@/lib/api-client';
import { successRateLabel } from '@/lib/format';
import type { DashboardStats } from '@multimarket/shared';

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded border p-4 dark:border-gray-700">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDashboard().then(setStats).catch((e) => setError((e as Error).message));
  }, []);

  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!stats) return <p className="p-6">Chargement…</p>;

  const rate = successRateLabel(stats.successRate);

  return (
    <main className="mx-auto mt-10 max-w-3xl p-6">
      <h1 className="text-xl font-semibold">Tableau de bord</h1>
      <section className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Annonces actives" value={stats.activeListings} />
        <Stat label="Publiées" value={stats.publicationsByStatus.published} />
        <Stat label="En attente" value={stats.publicationsByStatus.awaiting_user} />
        <Stat label="Échecs" value={stats.publicationsByStatus.failed} />
        <Stat label="En file" value={stats.publicationsByStatus.pending} />
        <Stat label="Taux de succès" value={rate} />
      </section>

      <h2 className="mt-8 text-lg font-medium">Par marketplace</h2>
      <section className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.byMarketplace.map((m) => (
          <div key={m.marketplace} className="rounded border p-4 dark:border-gray-700">
            <h3 className="font-medium">{m.marketplace}</h3>
            <ul className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              <li>Publiées : {m.published}</li>
              <li>En attente : {m.awaiting_user}</li>
              <li>Échecs : {m.failed}</li>
              <li>En file : {m.pending}</li>
            </ul>
          </div>
        ))}
      </section>
    </main>
  );
}
