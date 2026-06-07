'use client';
import { use, useEffect, useRef, useState } from 'react';
import { publishEverywhere, getPublications, getAssisted, markPosted, getAccounts } from '@/lib/api-client';
import { shareAssisted, downloadPhotos } from '@/lib/share';
import { connectedMarketplaces, marketplaceLabel } from '@/lib/marketplaces';
import type { AssistedPayload, Marketplace, Publication } from '@multimarket/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const TERMINAL = ['published', 'failed', 'sold', 'expired', 'awaiting_user'];

export default function PublishPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [available, setAvailable] = useState<Marketplace[]>([]);
  const [selected, setSelected] = useState<Marketplace[]>([]);
  const [pubs, setPubs] = useState<Publication[]>([]);
  const [assisted, setAssisted] = useState<Record<string, AssistedPayload>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    getAccounts()
      .then((accts) => {
        const conn = connectedMarketplaces(accts);
        setAvailable(conn);
        setSelected(conn);
      })
      .catch(() => {});
    getPublications(id).then(setPubs).catch(() => {});
    return () => esRef.current?.close();
  }, [id]);

  // Load assisted payloads for any awaiting_user publication we don't have yet.
  useEffect(() => {
    for (const p of pubs) {
      if (p.status === 'awaiting_user' && !assisted[p.id]) {
        getAssisted(p.id).then((payload) => setAssisted((a) => ({ ...a, [p.id]: payload }))).catch(() => {});
      }
    }
  }, [pubs, assisted]);

  function toggle(m: Marketplace) {
    setSelected((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]));
  }

  function openStream() {
    esRef.current?.close();
    const token = localStorage.getItem('accessToken') ?? '';
    const es = new EventSource(`${API_URL}/listings/${id}/publications/stream?access_token=${encodeURIComponent(token)}`);
    es.onmessage = (e) => {
      const data = JSON.parse(e.data) as Publication[];
      setPubs(data);
      if (data.length > 0 && data.every((p) => TERMINAL.includes(p.status))) es.close();
    };
    es.onerror = () => es.close();
    esRef.current = es;
  }

  async function onPublish() {
    setError(null);
    try {
      await publishEverywhere(id, selected);
      openStream();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function onPosted(pubId: string) {
    try {
      await markPosted(pubId, urls[pubId] || undefined);
      setPubs(await getPublications(id));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <main className="mx-auto mt-10 max-w-2xl p-6">
      <h1 className="text-xl font-semibold">Publier partout</h1>
      {available.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          Aucun marketplace activé. Active-les dans <a className="text-blue-600 underline" href="/accounts">Mes comptes</a>.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-4">
          {available.map((m) => (
            <label key={m} className="flex items-center gap-2">
              <input type="checkbox" checked={selected.includes(m)} onChange={() => toggle(m)} />
              {marketplaceLabel(m)}
            </label>
          ))}
        </div>
      )}
      <button className="mt-4 rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50" onClick={onPublish} disabled={selected.length === 0}>
        Publier partout
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <ul className="mt-6 flex flex-col gap-3">
        {pubs.map((p) => (
          <li key={p.id} className="rounded border p-3 dark:border-gray-700">
            <div className="flex justify-between">
              <span className="font-medium">{marketplaceLabel(p.marketplace)}</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">{p.status}</span>
            </div>
            {p.status === 'published' && p.externalUrl && (
              <a className="text-sm text-blue-600 underline" href={p.externalUrl} target="_blank" rel="noreferrer">
                Voir l&apos;annonce
              </a>
            )}
            {p.status === 'failed' && <p className="text-sm text-red-600">{p.error}</p>}
            {p.status === 'awaiting_user' && assisted[p.id] && (
              <div className="mt-2 flex flex-col gap-2 text-sm">
                <div className="flex flex-wrap gap-2">
                  <button className="rounded bg-blue-600 px-3 py-1 text-white" onClick={() => shareAssisted(assisted[p.id])}>
                    Partager
                  </button>
                  <button className="rounded border px-3 py-1 dark:border-gray-700" onClick={() => navigator.clipboard?.writeText(assisted[p.id].pasteText)}>
                    Copier le texte
                  </button>
                  <button className="rounded border px-3 py-1 dark:border-gray-700" onClick={() => downloadPhotos(assisted[p.id].photoUrls)}>
                    Télécharger les photos
                  </button>
                  <a className="rounded border px-3 py-1 dark:border-gray-700" href={assisted[p.id].deepLink} target="_blank" rel="noreferrer">
                    Ouvrir {marketplaceLabel(p.marketplace)}
                  </a>
                </div>
                <textarea className="w-full rounded border p-2 dark:border-gray-700 dark:bg-gray-800" rows={4} readOnly value={assisted[p.id].pasteText} />
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded border p-2 dark:border-gray-700 dark:bg-gray-800"
                    placeholder="URL de l'annonce (optionnel)"
                    value={urls[p.id] ?? ''}
                    onChange={(e) => setUrls((u) => ({ ...u, [p.id]: e.target.value }))}
                  />
                  <button className="rounded bg-green-600 px-3 py-1 text-white" onClick={() => onPosted(p.id)}>
                    J&apos;ai posté
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
