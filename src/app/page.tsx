import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-screen-md flex-col items-start justify-center gap-6 px-6">
      <h1 className="text-4xl font-semibold text-slate-900">Logistics Intel</h1>
      <p className="text-lg text-slate-600">
        Explore company insights, shipments, and trade lanes in the unified search experience.
      </p>
      <Link
        href="/search"
        className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700"
      >
        Go to Search
      </Link>
    </main>
  );
}
