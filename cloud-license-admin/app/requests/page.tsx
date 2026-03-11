import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getAdminAuth, getAdminFirestore } from '../../lib/firebaseAdmin';
import RequestList from './RequestList';

interface LicenseRequest {
  id: string;
  pharmacyName: string;
  email: string;
  phone?: string | null;
  doctorName?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  installationId?: string | null;
  licenseKey?: string | null;
  status: string;
  requestedAt: string;
  source?: string | null;
}

export default async function RequestsPage() {
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
    .collection('licenseRequests')
    .orderBy('requestedAt', 'desc')
    .limit(50)
    .get();

  const requests: LicenseRequest[] = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as any)
  }));

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <header className="border-b border-slate-800 px-8 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">License Requests</h1>
        <p className="text-xs text-slate-400">
          Latest requests from desktop pharmacies waiting for approval.
        </p>
      </header>

      <section className="px-8 py-6">
        <RequestList initialRequests={requests} />
      </section>
    </main>
  );
}

