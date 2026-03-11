'use client';

import { useState } from 'react';
import { getFirebaseAuth } from '../../lib/firebaseClient';

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

interface Props {
  initialRequests: LicenseRequest[];
}

function formatLicenseKeyForDisplay(key: string): string {
  const clean = key.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return clean.replace(/(.{4})/g, '$1 ').trim();
}

const APPROVABLE_STATUSES = ['pending', 'desktop_generated'];

export default function RequestList({ initialRequests }: Props) {
  const [requests, setRequests] = useState<LicenseRequest[]>(() => initialRequests);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [markedShared, setMarkedShared] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function handleMarkShared(request: LicenseRequest) {
    if (loadingId) return;

    setErrors((prev) => ({ ...prev, [request.id]: '' }));
    setLoadingId(request.id);

    try {
      const auth = getFirebaseAuth();
      const user = auth.currentUser;

      if (!user) {
        window.location.href = '/login';
        return;
      }

      const idToken = await user.getIdToken();

      const resp = await fetch('/api/license-requests/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, requestId: request.id }),
      });

      const data: { ok: boolean; error?: string } = await resp.json();

      if (!resp.ok || !data.ok) {
        throw new Error(data.error || 'Failed to mark request as shared');
      }

      setMarkedShared((prev) => ({ ...prev, [request.id]: true }));
      setRequests((prev) =>
        prev.map((r) => (r.id === request.id ? { ...r, status: 'approved' } : r))
      );
    } catch (error: any) {
      setErrors((prev) => ({
        ...prev,
        [request.id]: error?.message || 'Failed to mark request as shared',
      }));
    } finally {
      setLoadingId(null);
    }
  }

  if (requests.length === 0) {
    return <p className="text-sm text-slate-400">No requests found.</p>;
  }

  return (
    <div className="space-y-3">
      {requests.map((r) => {
        const wasJustMarked = markedShared[r.id];
        const error = errors[r.id];
        const isApprovable = APPROVABLE_STATUSES.includes(r.status);

        return (
          <div
            key={r.id}
            className="rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm space-y-2"
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div>
                <div className="font-medium">
                  {r.pharmacyName}{' '}
                  <span className="text-xs text-slate-400">({r.city || 'N/A'})</span>
                </div>
                <div className="text-xs text-slate-400">
                  {r.email} · {r.phone || 'No phone'}
                </div>
                {r.doctorName && (
                  <div className="text-xs text-slate-500">Doctor: {r.doctorName}</div>
                )}
                {r.licenseKey && (
                  <div className="mt-1 flex items-center gap-2">
                    <span className="font-mono text-[11px] text-emerald-300 tracking-wider">
                      {formatLicenseKeyForDisplay(r.licenseKey)}
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const clean = (r.licenseKey as string)
                            .replace(/[^A-Za-z0-9]/g, '')
                            .toUpperCase();
                          await navigator.clipboard.writeText(clean);
                          setCopiedId(r.id);
                          setTimeout(() => {
                            setCopiedId((prev) => (prev === r.id ? null : prev));
                          }, 1500);
                        } catch {
                          // ignore clipboard errors
                        }
                      }}
                      className="px-2 py-0.5 rounded-full bg-emerald-600 text-[10px] font-semibold text-white hover:bg-emerald-500"
                    >
                      {copiedId === r.id ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                )}
                <div className="text-xs text-slate-500 mt-0.5" suppressHydrationWarning>
                  Requested at {new Date(r.requestedAt).toLocaleString()}
                  {r.source === 'desktop' && (
                    <span className="ml-1.5 text-[10px] text-blue-400 font-medium">
                      · desktop-generated
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    r.status === 'pending' || r.status === 'desktop_generated'
                      ? 'bg-amber-500/20 text-amber-300'
                      : r.status === 'approved'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-red-500/20 text-red-300'
                  }`}
                >
                  {r.status === 'desktop_generated' ? 'GENERATED' : r.status.toUpperCase()}
                </span>

                {isApprovable && (
                  <button
                    type="button"
                    onClick={() => handleMarkShared(r)}
                    disabled={loadingId === r.id}
                    className="inline-flex items-center rounded-full bg-emerald-500 px-3 py-1 text-[11px] font-semibold text-slate-950 shadow-sm hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loadingId === r.id ? 'Updating…' : 'Mark as Shared'}
                  </button>
                )}
              </div>
            </div>

            {wasJustMarked && (
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100 space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-wide">
                  Marked as shared
                </div>
                <div className="text-[11px] text-emerald-200">
                  Request marked as shared — key was generated by the admin desktop.
                </div>
                {r.licenseKey && (
                  <div className="font-mono text-[11px] text-emerald-300 tracking-wider">
                    {formatLicenseKeyForDisplay(r.licenseKey)}
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {error}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
