'use client';
import { useState } from 'react';
import { createListing, uploadPhotoFile } from '@/lib/api-client';
import type { Condition } from '@multimarket/shared';

export default function NewListingPage() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [condition, setCondition] = useState<Condition>('good');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const listing = await createListing({
        title,
        description,
        priceCents: Math.round(parseFloat(price || '0') * 100),
        category,
        condition,
      });
      const chosen = files.slice(0, 20);
      for (let i = 0; i < chosen.length; i++) {
        await uploadPhotoFile(listing.id, chosen[i], i);
      }
      setCreatedId(listing.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (createdId) {
    return (
      <main className="mx-auto mt-16 max-w-lg p-6">
        <p className="text-lg">Annonce créée ✅</p>
        <a className="mt-4 inline-block rounded bg-blue-600 px-4 py-2 text-white" href="/listings">
          Voir mes annonces
        </a>
      </main>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto mt-10 flex max-w-lg flex-col gap-3 p-6">
      <h1 className="text-xl font-semibold">Nouvelle annonce</h1>
      <input className="rounded border p-2" placeholder="Titre" value={title}
        onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
      <textarea className="rounded border p-2" placeholder="Description" value={description}
        onChange={(e) => setDescription(e.target.value)} required />
      <input className="rounded border p-2" type="number" step="0.01" min="0" placeholder="Prix (€)"
        value={price} onChange={(e) => setPrice(e.target.value)} required />
      <input className="rounded border p-2" placeholder="Catégorie" value={category}
        onChange={(e) => setCategory(e.target.value)} required />
      <select className="rounded border p-2" value={condition}
        onChange={(e) => setCondition(e.target.value as Condition)}>
        <option value="new">Neuf</option>
        <option value="like_new">Comme neuf</option>
        <option value="good">Bon état</option>
        <option value="fair">État correct</option>
      </select>
      <input className="rounded border p-2" type="file" accept="image/*" multiple
        onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
      <p className="text-xs text-gray-500">{files.length} photo(s) sélectionnée(s) (max 20)</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="rounded bg-blue-600 p-2 text-white disabled:opacity-50" type="submit" disabled={submitting}>
        {submitting ? 'Publication…' : "Publier l'annonce"}
      </button>
    </form>
  );
}
