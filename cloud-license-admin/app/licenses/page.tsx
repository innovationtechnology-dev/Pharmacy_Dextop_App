import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getAdminAuth, getAdminFirestore } from '../../lib/firebaseAdmin';
import LicenseKeyDisplay from './LicenseKeyDisplay';

interface LicenseDoc {
  id: string;
  pharmacyId: string;
  pharmacyName?: string;
  email?: string;
  phone?: string | null;
  doctorName?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  installationId?: string | null;
  plan?: string | null;
  licenseKey: string;
  validFrom: string;
  validUntil: string;
  status: string;
}

export default async function LicensesPage() {
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
    .collection('licenses')
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();

  const licenses: LicenseDoc[] = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as any)
  }));

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <header className="border-b border-slate-800 px-8 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Licenses</h1>
        <p className="text-xs text-slate-400">
          Overview of all issued licenses across pharmacies.
        </p>
      </header>
      <section className="px-8 py-6">
        {licenses.length === 0 ? (
          <p className="text-sm text-slate-400">No licenses found.</p>
        ) : (
          <div className="space-y-3">
            {licenses.map((l) => (
              <div
                key={l.id}
                className="rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm flex flex-col md:flex-row md:items-center md:justify-between gap-2"
              >
                <div className="space-y-1">
                  <div className="font-medium">
                    Pharmacy: {l.pharmacyName || 'Unknown'}
                    <span className="ml-2 text-[11px] text-slate-500">
                      (ID: {l.pharmacyId})
                    </span>
                  </div>
                  {(l.city || l.country) && (
                    <div className="text-[11px] text-slate-400">
                      {l.city || 'Unknown city'}
                      {l.country ? `, ${l.country}` : ''}
                    </div>
                  )}
                  {l.address && (
                    <div className="text-[11px] text-slate-500">
                      Address: {l.address}
                    </div>
                  )}
                  {l.doctorName && (
                    <div className="text-[11px] text-slate-500">
                      Doctor: {l.doctorName}
                    </div>
                  )}
                  {(l.email || l.phone) && (
                    <div className="text-[11px] text-slate-400">
                      {l.email && <span>{l.email}</span>}
                      {l.email && l.phone && <span className="mx-1">·</span>}
                      {l.phone && <span>{l.phone}</span>}
                    </div>
                  )}
                  <div className="text-xs text-slate-400">
                    Valid {new Date(l.validFrom).toLocaleDateString()} –{' '}
                    {new Date(l.validUntil).toLocaleDateString()}
                  </div>
                  {l.plan && (
                    <div className="text-xs text-slate-400">Plan: {l.plan}</div>
                  )}
                  {l.installationId && (
                    <div className="text-[11px] text-slate-500">
                      Installation: {l.installationId}
                    </div>
                  )}
                  <div className="text-[11px] text-slate-500">ID: {l.id}</div>
                  <LicenseKeyDisplay licenseKey={l.licenseKey} />
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      l.status === 'active'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : l.status === 'expired'
                        ? 'bg-slate-500/20 text-slate-300'
                        : 'bg-red-500/20 text-red-300'
                    }`}
                  >
                    {l.status.toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

