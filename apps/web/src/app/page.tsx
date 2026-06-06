export default function Home() {
  return (
    <main className="mx-auto mt-16 max-w-xl p-6">
      <h1 className="text-2xl font-bold">MultiMarket</h1>
      <p className="mt-2 text-gray-600">Publiez une annonce une fois, partout.</p>
      <div className="mt-6 flex gap-3">
        <a className="rounded bg-blue-600 px-4 py-2 text-white" href="/login">Connexion</a>
        <a className="rounded border px-4 py-2" href="/register">Inscription</a>
      </div>
    </main>
  );
}
