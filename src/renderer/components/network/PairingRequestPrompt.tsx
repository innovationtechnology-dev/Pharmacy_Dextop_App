import React, { useEffect, useState } from 'react';
import { FiAlertTriangle, FiMonitor } from 'react-icons/fi';
import type { PairRequest } from '../../../main/network/pairing';

/**
 * Main computer: shown on top of any screen when another computer clicks "Request access".
 * Allow hands that computer the access key; Deny refuses it.
 */
const PairingRequestPrompt: React.FC = () => {
  const [pending, setPending] = useState<PairRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [shownId, setShownId] = useState<string | null>(null);

  useEffect(() => {
    window.electron.ipcRenderer
      .invoke('network-pair-pending')
      .then((list) => setPending(list as PairRequest[]));
    const off = window.electron.ipcRenderer.on('network-pair-requests', (list) =>
      setPending(list as PairRequest[])
    );
    return () => off?.();
  }, []);

  // Keep showing the same request while it is pending, so the dialog never swaps under the cursor.
  const request = pending.find((r) => r.id === shownId) ?? pending[0];
  useEffect(() => {
    setShownId(request?.id ?? null);
  }, [request?.id]);

  // Countdown until the request expires.
  useEffect(() => {
    if (!request) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [request]);

  if (!request) return null;

  const respond = async (allow: boolean) => {
    setBusy(true);
    try {
      await window.electron.ipcRenderer.invoke('network-pair-respond', request.id, allow);
      setPending((list) => list.filter((r) => r.id !== request.id));
    } finally {
      setBusy(false);
    }
  };

  const secondsLeft = Math.max(0, Math.round((request.expiresAt - now) / 1000));

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-6 pt-6 pb-4 flex items-start gap-4">
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 shrink-0">
            <FiMonitor className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900 dark:text-white">
              A computer wants to connect
            </h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Allow it to use this pharmacy&apos;s data?
            </p>
          </div>
        </div>

        <div className="mx-6 p-4 rounded-lg bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700">
          <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
            {request.deviceName}
          </div>
          <div className="text-xs font-mono text-gray-500 dark:text-gray-400 mt-0.5">
            {request.address}
          </div>
        </div>

        <div className="mx-6 mt-4 flex gap-2 text-xs text-amber-700 dark:text-amber-400">
          <FiAlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            Only allow computers in your pharmacy. It will be able to see and change stock, sales
            and purchases.
          </span>
        </div>

        <div className="px-6 py-4 mt-4 border-t border-gray-200 dark:border-gray-700 flex items-center gap-2">
          <span className="text-xs text-gray-400 dark:text-gray-500 mr-auto">
            Expires in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
            {pending.length > 1 && ` · ${pending.length - 1} more waiting`}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => respond(false)}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            Deny
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => respond(true)}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
};

export default PairingRequestPrompt;
