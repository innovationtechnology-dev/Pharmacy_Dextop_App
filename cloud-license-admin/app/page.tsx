import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-50">
      <div className="max-w-xl w-full px-6 py-10 rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-950 to-slate-900 shadow-xl">
        <h1 className="text-2xl font-semibold mb-3">Pharmacy Cloud License Admin</h1>
        <p className="text-sm text-slate-300 mb-6">
          This is the web control panel for managing pharmacies, license
          requests, and license keys for your desktop pharmacy application.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 transition-colors"
        >
          Go to login
        </Link>
      </div>
    </main>
  );
}

