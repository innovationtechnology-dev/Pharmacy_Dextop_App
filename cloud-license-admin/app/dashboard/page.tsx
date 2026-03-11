import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getAdminAuth } from '../../lib/firebaseAdmin';
import { getAdminFirestore } from '../../lib/firebaseAdmin';

export default async function DashboardPage() {
  const cookieStore = cookies();
  const sessionCookie = cookieStore.get('session')?.value;

  if (!sessionCookie) {
    redirect('/login');
  }

  const auth = getAdminAuth();

  try {
    await auth.verifySessionCookie(sessionCookie, true);
  } catch {
    redirect('/login');
  }

  const db = getAdminFirestore();

  const [licensesSnap, requestsSnap] = await Promise.all([
    db.collection('licenses').get(),
    db
      .collection('licenseRequests')
      .where('status', '==', 'pending')
      .get()
  ]);

  const totalLicenses = licensesSnap.size;
  const pendingRequests = requestsSnap.size;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <header className="border-b border-slate-800 px-8 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Cloud License Dashboard</h1>
        <span className="text-xs text-slate-400">
          Total licenses: {totalLicenses} · Pending requests: {pendingRequests}
        </span>
      </header>
      <section className="px-8 py-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <h2 className="text-sm font-medium mb-1">Active licenses</h2>
          <p className="text-xs text-slate-400 mb-2">
            Overview of all issued licenses across pharmacies.
          </p>
          <p className="text-2xl font-semibold">{totalLicenses}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <h2 className="text-sm font-medium mb-1">Pending requests</h2>
          <p className="text-xs text-slate-400 mb-2">
            New pharmacies waiting for license approval.
          </p>
          <p className="text-2xl font-semibold">{pendingRequests}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <h2 className="text-sm font-medium mb-1">Next steps</h2>
          <p className="text-xs text-slate-400">
            Use the Requests and Licenses pages to approve requests and issue new
            keys.
          </p>
        </div>
      </section>
    </main>
  );
}

