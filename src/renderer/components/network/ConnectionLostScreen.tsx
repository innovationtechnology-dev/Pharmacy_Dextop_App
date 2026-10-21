import React, { useEffect, useState } from 'react';
import { FiKey, FiPower, FiRefreshCw, FiWifiOff, FiMonitor } from 'react-icons/fi';
import type { ConnectionStatus, ConnectionProblem } from '../../../main/network/connectionMonitor';

const COPY: Record<
  ConnectionProblem,
  { icon: React.ElementType; title: string; body: (host: string) => string; steps: string[] }
> = {
  unreachable: {
    icon: FiPower,
    title: 'Main computer is turned off or not reachable',
    body: (host) =>
      `This computer cannot find the main computer (${host}). It is probably turned off, asleep, or on a different WiFi.`,
    steps: [
      'Turn on the main computer and wake it up if it is asleep.',
      'Open the Pharmacy app on the main computer.',
      'Make sure both computers are on the same WiFi.',
    ],
  },
  'app-closed': {
    icon: FiMonitor,
    title: 'Pharmacy app is closed on the main computer',
    body: (host) =>
      `The main computer (${host}) is on, but the Pharmacy app is not running on it.`,
    steps: ['Open the Pharmacy app on the main computer and log in.'],
  },
  'wrong-key': {
    icon: FiKey,
    title: 'Access key has changed',
    body: (host) =>
      `The main computer (${host}) no longer accepts this computer's access key. It may have been set up again.`,
    steps: [
      'On the main computer, open Settings → Network to see the access key.',
      'Here, click "Connect to a different main computer" and enter the new key.',
    ],
  },
  'other-server': {
    icon: FiMonitor,
    title: 'A different main computer is at this address',
    body: (host) =>
      `The computer at ${host} is a Pharmacy main computer, but not the one this computer was connected to. Its data was not used.`,
    steps: [
      'Turn on the original main computer — this computer will find it automatically.',
      'Or click "Connect to a different main computer" if the main computer was changed on purpose.',
    ],
  },
  'old-version': {
    icon: FiRefreshCw,
    title: 'Main computer needs an update',
    body: (host) =>
      `The main computer (${host}) is running an older version of the Pharmacy app that cannot talk to this one.`,
    steps: ['Install the same app version on the main computer and open it.'],
  },
  'no-network': {
    icon: FiWifiOff,
    title: 'This computer is not connected to WiFi',
    body: () => 'This computer has no network connection, so it cannot reach the main computer.',
    steps: ['Connect this computer to the same WiFi as the main computer.'],
  },
};

const timeAgo = (ms?: number) => {
  if (!ms) return null;
  const mins = Math.round((Date.now() - ms) / 60_000);
  if (mins < 1) return 'less than a minute ago';
  if (mins < 60) return `${mins} min ago`;
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

/**
 * Covers the app while the main computer is unreachable. The page underneath stays mounted,
 * so unsaved work (e.g. a cart) is still there when the connection comes back.
 */
const ConnectionLostScreen: React.FC<{ status: ConnectionStatus }> = ({ status }) => {
  const [retrying, setRetrying] = useState(false);
  const [, tick] = useState(0);
  const copy = COPY[status.problem ?? 'unreachable'];
  const Icon = copy.icon;

  // Keep "last connected" fresh.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const retry = async () => {
    setRetrying(true);
    try {
      await window.electron.ipcRenderer.invoke('network-retry');
    } finally {
      setRetrying(false);
    }
  };

  const reconnectElsewhere = async () => {
    // eslint-disable-next-line no-alert
    if (window.confirm('Disconnect from this main computer and choose another one?')) {
      await window.electron.ipcRenderer.invoke('network-reset');
    }
  };

  const lastSeen = timeAgo(status.lastOnlineAt);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-900/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-6 pt-6 pb-4 flex items-start gap-4">
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 shrink-0">
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">{copy.title}</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{copy.body(status.serverHost)}</p>
          </div>
        </div>

        <div className="px-6 pb-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
            To fix it
          </div>
          <ol className="space-y-1.5 list-decimal list-inside text-sm text-gray-700 dark:text-gray-200">
            {copy.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>

        <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900/40 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400 flex items-center gap-2">
          <FiRefreshCw className="w-3.5 h-3.5 animate-spin" />
          <span>
            Checking again automatically — this screen closes on its own once connected.
            {lastSeen && <> Last connected {lastSeen}.</>}
          </span>
        </div>

        <div className="px-6 py-4 flex flex-col sm:flex-row gap-2 sm:justify-end">
          <button
            type="button"
            onClick={reconnectElsewhere}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Connect to a different main computer
          </button>
          <button
            type="button"
            onClick={retry}
            disabled={retrying}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            <FiRefreshCw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} />
            {retrying ? 'Checking…' : 'Try now'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConnectionLostScreen;
