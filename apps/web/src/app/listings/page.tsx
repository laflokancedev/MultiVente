'use client';
import { useEffect, useState } from 'react';
import { listListings } from '@/lib/api-client';
import type { Listing, PublicationStatus } from '@multimarket/shared';

const ICON: Record<PublicationStatus, string> = {
  pending: '⏳',
  awaiting_user: '✋',
  published: '✓',
  failed: '✕',
  sold: '€',
  expired: '⌛',
};

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
        <p className="text-gray-500 dark:text-gray-400">Aucune annonce pour l&apos;instant.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {listings.map((l) => (
            <li key={l.id} className="rounded border p-3 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <a className="font-medium hover:underline" href={`/listings/${l.id}/publish`}>{l.title}</a>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {(l.priceCents / 100).toFixed(2)} {l.currency} · {l.status}
                </span>
              </div>
              {l.publications && l.publications.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {l.publications.map((p) => (
                    <span key={p.marketplace} className="rounded bg-gray-100 px-2 py-0.5 dark:bg-gray-800">
                      {p.marketplace} {ICON[p.status]}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
