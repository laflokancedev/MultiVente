'use client';
import { useState } from 'react';
import { registerUser } from '@/lib/api-client';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await registerUser({ email, password });
      localStorage.setItem('accessToken', res.tokens.accessToken);
      localStorage.setItem('refreshToken', res.tokens.refreshToken);
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (done) return <p className="p-6">Compte créé ✅</p>;

  return (
    <form onSubmit={onSubmit} className="mx-auto mt-16 flex max-w-sm flex-col gap-3 p-6">
      <h1 className="text-xl font-semibold">Inscription</h1>
      <input className="rounded border p-2" type="email" placeholder="Email"
        value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input className="rounded border p-2" type="password" placeholder="Mot de passe (min 8)"
        value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="rounded bg-blue-600 p-2 text-white" type="submit">Créer mon compte</button>
    </form>
  );
}
