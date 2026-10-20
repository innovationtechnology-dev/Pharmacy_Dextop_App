import React, { useState } from 'react';

interface DiscoveredServer {
  host: string;
  port: number;
  name: string;
}

const invoke = <T,>(channel: string, ...args: unknown[]) =>
  window.electron.ipcRenderer.invoke(channel, ...args) as Promise<T>;

const card =
  'w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 p-8';
const primaryBtn =
  'w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50';
const input =
  'w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500';

const NetworkSetup: React.FC = () => {
  const [step, setStep] = useState<'choose' | 'client'>('choose');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [servers, setServers] = useState<DiscoveredServer[]>([]);
  const [searched, setSearched] = useState(false);
  const [host, setHost] = useState('');
  const [port, setPort] = useState('3737');
  const [accessKey, setAccessKey] = useState('');

  const chooseServer = async () => {
    setBusy(true);
    setError('');
    const res = await invoke<{ success: boolean; error?: string }>('network-setup-server');
    if (!res.success) {
      setError(res.error || 'Could not start the main computer');
      setBusy(false);
    }
    // On success the window reloads itself.
  };

  const search = async () => {
    setBusy(true);
    setError('');
    const found = await invoke<DiscoveredServer[]>('network-discover');
    setServers(found);
    setSearched(true);
    if (found.length === 1) {
      setHost(found[0].host);
      setPort(String(found[0].port));
    }
    setBusy(false);
  };

  const connect = async () => {
    setBusy(true);
    setError('');
    const res = await invoke<{ success: boolean; error?: string }>(
      'network-setup-client',
      host,
      Number(port),
      accessKey
    );
    if (!res.success) {
      setError(
        res.error?.includes('Wrong access key')
          ? 'Wrong access key. Check the key shown on the main computer.'
          : `Could not connect: ${res.error || 'unknown error'}`
      );
      setBusy(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className={card}>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Set up this computer</h1>
        <p className="text-sm text-gray-500 mb-6">
          Only one computer stores the data. Other computers connect to it over the same WiFi.
        </p>

        {step === 'choose' && (
          <div className="space-y-3">
            <button
              type="button"
              disabled={busy}
              onClick={chooseServer}
              className="w-full text-left p-4 rounded-xl border-2 border-gray-200 hover:border-emerald-500 disabled:opacity-50"
            >
              <div className="font-semibold text-gray-900">This is the main computer</div>
              <div className="text-sm text-gray-500">
                Stores the database. Choose this on the first computer you install.
              </div>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setStep('client')}
              className="w-full text-left p-4 rounded-xl border-2 border-gray-200 hover:border-emerald-500 disabled:opacity-50"
            >
              <div className="font-semibold text-gray-900">Connect to the main computer</div>
              <div className="text-sm text-gray-500">
                For every additional laptop. No data is stored here.
              </div>
            </button>
          </div>
        )}

        {step === 'client' && (
          <div className="space-y-4">
            <button type="button" onClick={search} disabled={busy} className={primaryBtn}>
              {busy && !searched ? 'Searching…' : 'Find main computer on WiFi'}
            </button>
            {searched && servers.length === 0 && (
              <p className="text-sm text-amber-600">
                Nothing found. Make sure the main computer is open and on the same WiFi, or type
                its address below.
              </p>
            )}
            {servers.length > 1 && (
              <select
                className={input}
                value={host}
                onChange={(e) => {
                  const s = servers.find((x) => x.host === e.target.value);
                  setHost(e.target.value);
                  if (s) setPort(String(s.port));
                }}
              >
                <option value="">Choose a computer…</option>
                {servers.map((s) => (
                  <option key={s.host} value={s.host}>
                    {s.name} ({s.host})
                  </option>
                ))}
              </select>
            )}
            <div className="flex gap-3">
              <input
                className={input}
                placeholder="Main computer address, e.g. 192.168.1.10"
                value={host}
                onChange={(e) => setHost(e.target.value)}
              />
              <input
                className={`${input} !w-24`}
                placeholder="Port"
                value={port}
                onChange={(e) => setPort(e.target.value)}
              />
            </div>
            <input
              className={input}
              placeholder="Access key (shown on the main computer)"
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value)}
            />
            <button
              type="button"
              onClick={connect}
              disabled={busy || !host || !accessKey}
              className={primaryBtn}
            >
              {busy && searched
                ? 'Connecting…'
                : !host
                  ? 'Enter the main computer address'
                  : !accessKey
                    ? 'Enter the access key to connect'
                    : 'Connect'}
            </button>
            <button
              type="button"
              onClick={() => setStep('choose')}
              className="w-full text-sm text-gray-500 hover:text-gray-700"
            >
              Back
            </button>
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
};

export default NetworkSetup;
