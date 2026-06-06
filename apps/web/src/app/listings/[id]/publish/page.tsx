'use client';
import { use, useState } from 'react';
import { publishEverywhere, getPublications, getAssisted } from '@/lib/api-client';
import type { AssistedPayload, Marketplace, Publication } from '@multimarket/shared';

const ALL: Marketplace[] = ['EBAY', 'VINTED', 'LEBONCOIN'];

export default function PublishPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [selected, setSelected] = useState<Marketplace[]>(ALL);
  const [pubs, setPubs] = useState<Publication[]>([]);
  const [assisted, setAssisted] = useState<Record<string, AssistedPayload>>({});
  const [error, setError] = useState<string | null>(null);

  function toggle(m: Marketplace) {
    setSelected((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]));
  }

  async function refresh() {
    const list = await getPublications(id);
    setPubs(list);
    for (const p of list) {
      if (p.status === 'awaiting_user' && !assisted[p.id]) {
        setAssisted((a) => ({ ...a, [p.id]: undefined as unknown as AssistedPayload }));
        getAssisted(p.id).then((payload) => setAssisted((a) => ({ ...a, [p.id]: payload }))).catch(() => {});
      }
    }
  }

  async function onPublish() {
    setError(null);
    try {
      await publishEverywhere(id, selected);
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 800));
        await refresh();
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <main className="mx-auto mt-10 max-w-2xl p-6">
      <h1 className="text-xl font-semibold">Publier partout</h1>
      <div className="mt-4 flex gap-4">
        {ALL.map((m) => (
          <label key={m} className="flex items-center gap-2">
            <input type="checkbox" checked={selected.includes(m)} onChange={() => toggle(m)} />
            {m}
          </label>
        ))}
      </div>
      <button className="mt-4 rounded bg-blue-600 px-4 py-2 text-white" onClick={onPublish}>
        Publier partout
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <ul className="mt-6 flex flex-col gap-3">
        {pubs.map((p) => (
          <li key={p.id} className="rounded border p-3">
            <div className="flex justify-between">
              <span className="font-medium">{p.marketplace}</span>
              <span className="text-sm text-gray-500">{p.status}</span>
            </div>
            {p.status === 'published' && p.externalUrl && (
              <a className="text-sm text-blue-600 underline" href={p.externalUrl} target="_blank" rel="noreferrer">
                Voir l&apos;annonce
              </a>
            )}
            {p.status === 'failed' && <p className="text-sm text-red-600">{p.error}</p>}
            {p.status === 'awaiting_user' && assisted[p.id] && (
              <div className="mt-2 text-sm">
                <a className="text-blue-600 underline" href={assisted[p.id].deepLink} target="_blank" rel="noreferrer">
                  Ouvrir {p.marketplace} pour publier
                </a>
                <textarea className="mt-2 w-full rounded border p-2" rows={4} readOnly value={assisted[p.id].pasteText} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
