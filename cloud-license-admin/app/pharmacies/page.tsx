import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getAdminAuth, getAdminFirestore } from '../../lib/firebaseAdmin';

interface PharmacyDoc {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  doctorName?: string | null;
  city?: string | null;
  createdAt?: string;
}

export default async function PharmaciesPage() {
  const cookieStore = cookies();
  const sessionCookie = cookieStore.get('session')?.value;

  if (!sessionCookie) {
    redirect('/login');
  }

  const auth = getAdminAuth();
  const db = getAdminFirestore();

  try {
    await auth.verifySessionCookie(sessionCookie, true);
  } catch {
    redirect('/login');
  }

  const snap = await db
    .collection('pharmacies')
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();

  const pharmacies: PharmacyDoc[] = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as any)
  }));

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <header className="border-b border-slate-800 px-8 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Pharmacies</h1>
        <p className="text-xs text-slate-400">
          Basic list of pharmacies associated with licenses and requests.
        </p>
      </header>
      <section className="px-8 py-6">
        {pharmacies.length === 0 ? (
          <p className="text-sm text-slate-400">No pharmacies found.</p>
        ) : (
          <div className="space-y-3">
            {pharmacies.map((p) => (
              <div
                key={p.id}
                className="rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm flex flex-col md:flex-row md:items-center md:justify-between gap-2"
              >
                <div>
                  <div className="font-medium">
                    {p.name}{' '}
                    <span className="text-xs text-slate-400">({p.city || 'N/A'})</span>
                  </div>
                  <div className="text-xs text-slate-400">
                    {p.email} · {p.phone || 'No phone'}
                  </div>
                </div>
                <div className="text-xs text-slate-500">ID: {p.id}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

