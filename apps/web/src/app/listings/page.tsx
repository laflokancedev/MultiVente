'use client';
import { useEffect, useState } from 'react';
import { listListings } from '@/lib/api-client';
import type { Listing } from '@multimarket/shared';

export default function ListingsPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listListings()
      .then(setListings)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="p-6">Chargement…</p>;
  if (error) return <p className="p-6 text-red-600">{error}</p>;

  return (
    <main className="mx-auto mt-10 max-w-2xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Mes annonces</h1>
        <a className="rounded bg-blue-600 px-3 py-2 text-white" href="/listings/new">+ Nouvelle</a>
      </div>
      {listings.length === 0 ? (
        <p className="text-gray-500">Aucune annonce pour l&apos;instant.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {listings.map((l) => (
            <li key={l.id} className="flex items-center justify-between rounded border p-3">
              <span>{l.title}</span>
              <span className="text-sm text-gray-500">
                {(l.priceCents / 100).toFixed(2)} {l.currency} · {l.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
