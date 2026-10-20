import React, { useState } from 'react';
import {
  FiAlertCircle,
  FiArrowLeft,
  FiCheck,
  FiChevronRight,
  FiDatabase,
  FiKey,
  FiMonitor,
  FiSearch,
  FiShield,
  FiWifi,
} from 'react-icons/fi';

interface DiscoveredServer {
  host: string;
  port: number;
  name: string;
}

const invoke = <T,>(channel: string, ...args: unknown[]) =>
  window.electron.ipcRenderer.invoke(channel, ...args) as Promise<T>;

type Busy = null | 'starting' | 'searching' | 'connecting';

const label = 'block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5';
const input =
  'w-full px-3.5 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition';
const primaryBtn =
  'w-full py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2';
const secondaryBtn =
  'w-full py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-50 transition flex items-center justify-center gap-2';

const Spinner = () => (
  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
);

const RoleCard: React.FC<{
  icon: React.ElementType;
  title: string;
  description: string;
  badge?: string;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
}> = ({ icon: Icon, title, description, badge, loading, disabled, onClick }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className="group w-full text-left p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-emerald-500 hover:shadow-md hover:shadow-emerald-500/5 dark:hover:border-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed transition flex items-center gap-4"
  >
    <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white transition shrink-0">
      <Icon className="w-5 h-5" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-gray-900 dark:text-white">{title}</span>
        {badge && (
          <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            {badge}
          </span>
        )}
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
    </div>
    <div className="text-gray-400 group-hover:text-emerald-600 transition shrink-0">
      {loading ? <Spinner /> : <FiChevronRight className="w-5 h-5" />}
    </div>
  </button>
);

const NetworkSetup: React.FC = () => {
  const [step, setStep] = useState<'choose' | 'client'>('choose');
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState('');
  const [servers, setServers] = useState<DiscoveredServer[]>([]);
  const [searched, setSearched] = useState(false);
  const [host, setHost] = useState('');
  const [port, setPort] = useState('3737');
  const [accessKey, setAccessKey] = useState('');

  const chooseServer = async () => {
    setBusy('starting');
    setError('');
    const res = await invoke<{ success: boolean; error?: string }>('network-setup-server');
    if (!res.success) {
      setError(res.error || 'Could not start the main computer');
      setBusy(null);
    }
    // On success the window reloads itself.
  };

  const search = async () => {
    setBusy('searching');
    setError('');
    const found = await invoke<DiscoveredServer[]>('network-discover');
    setServers(found);
    setSearched(true);
    if (found.length === 1) {
      setHost(found[0].host);
      setPort(String(found[0].port));
    }
    setBusy(null);
  };

  const connect = async () => {
    if (!host || !accessKey || busy) return;
    setBusy('connecting');
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
          ? 'Wrong access key. Check the key in Settings → Network on the main computer.'
          : `Could not connect: ${res.error || 'unknown error'}`
      );
      setBusy(null);
    }
  };

  const selectServer = (s: DiscoveredServer) => {
    setHost(s.host);
    setPort(String(s.port));
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4 sm:p-8">
      <div className="w-full max-w-4xl grid md:grid-cols-5 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Brand panel */}
        <aside className="md:col-span-2 relative bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-8 flex flex-col">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_top_right,white,transparent_60%)]" />
          <div className="relative flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-white/15 backdrop-blur">
              <FiShield className="w-6 h-6" />
            </div>
            <div>
              <div className="font-bold leading-tight">Pharmacy</div>
              <div className="text-xs text-emerald-100">Management System</div>
            </div>
          </div>

          <div className="relative mt-10 md:mt-auto">
            <h2 className="text-xl font-bold">One pharmacy, many counters</h2>
            <p className="text-sm text-emerald-50/90 mt-2">
              One computer keeps all the data. Every other computer connects to it over your
              shop&apos;s WiFi and works with the same stock, sales and purchases.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                'Data stays in one place',
                'Stock updates on every counter at once',
                'Protected with an access key',
              ].map((t) => (
                <li key={t} className="flex items-center gap-2.5">
                  <span className="p-0.5 rounded-full bg-white/20">
                    <FiCheck className="w-3.5 h-3.5" />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* Content */}
        <main className="md:col-span-3 p-8 sm:p-10">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
            <span className={step === 'choose' ? 'text-emerald-600 dark:text-emerald-400' : ''}>
              1. Choose role
            </span>
            <FiChevronRight className="w-3 h-3" />
            <span className={step === 'client' ? 'text-emerald-600 dark:text-emerald-400' : ''}>
              2. Connect
            </span>
          </div>

          {step === 'choose' && (
            <>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Set up this computer</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-6">
                How will this computer be used in your pharmacy?
              </p>
              <div className="space-y-3">
                <RoleCard
                  icon={FiDatabase}
                  title="This is the main computer"
                  description="Stores the database. Choose this on the first computer you install."
                  badge="First computer"
                  loading={busy === 'starting'}
                  disabled={!!busy}
                  onClick={chooseServer}
                />
                <RoleCard
                  icon={FiMonitor}
                  title="Connect to the main computer"
                  description="For every additional counter or laptop. No data is stored here."
                  disabled={!!busy}
                  onClick={() => {
                    setError('');
                    setStep('client');
                  }}
                />
              </div>
              <p className="mt-6 text-xs text-gray-400 dark:text-gray-500">
                You can change this later in Settings → Network.
              </p>
            </>
          )}

          {step === 'client' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void connect();
              }}
            >
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Connect to the main computer</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-6">
                Make sure the Pharmacy app is open on the main computer and both are on the same WiFi.
              </p>

              <button type="button" onClick={search} disabled={!!busy} className={secondaryBtn}>
                {busy === 'searching' ? <Spinner /> : <FiSearch className="w-4 h-4" />}
                {busy === 'searching' ? 'Searching your WiFi…' : searched ? 'Search again' : 'Find main computer on WiFi'}
              </button>

              {searched && servers.length === 0 && (
                <div className="mt-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 flex gap-2">
                  <FiAlertCircle className="w-4 h-4 shrink-0 mt-px" />
                  No main computer found. Check it is on with the app open, or enter its address below.
                </div>
              )}

              {servers.length > 0 && (
                <div className="mt-3 space-y-2">
                  {servers.map((s) => {
                    const selected = s.host === host;
                    return (
                      <button
                        key={s.host}
                        type="button"
                        onClick={() => selectServer(s)}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition ${
                          selected
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-emerald-400'
                        }`}
                      >
                        <FiWifi className={`w-4 h-4 ${selected ? 'text-emerald-600' : 'text-gray-400'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">{s.name}</div>
                          <div className="text-xs font-mono text-gray-500 dark:text-gray-400">
                            {s.host}:{s.port}
                          </div>
                        </div>
                        {selected && <FiCheck className="w-4 h-4 text-emerald-600" />}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center gap-3 my-5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                <span className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                {servers.length > 0 ? 'Details' : 'Or enter manually'}
                <span className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
              </div>

              <div className="grid grid-cols-[1fr_6rem] gap-3">
                <div>
                  <label className={label} htmlFor="ns-host">Main computer address</label>
                  <input
                    id="ns-host"
                    className={`${input} font-mono`}
                    placeholder="192.168.1.10"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                  />
                </div>
                <div>
                  <label className={label} htmlFor="ns-port">Port</label>
                  <input
                    id="ns-port"
                    className={`${input} font-mono`}
                    inputMode="numeric"
                    value={port}
                    onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className={label} htmlFor="ns-key">Access key</label>
                <div className="relative">
                  <FiKey className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    id="ns-key"
                    className={`${input} pl-10 font-mono tracking-widest uppercase`}
                    placeholder="e.g. 3FA9C21B"
                    value={accessKey}
                    onChange={(e) => setAccessKey(e.target.value.trim())}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
                <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                  Shown on the main computer in Settings → Network.
                </p>
              </div>

              {error && (
                <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 flex gap-2">
                  <FiAlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setStep('choose');
                  }}
                  disabled={busy === 'connecting'}
                  className={`${secondaryBtn} !w-auto px-4`}
                >
                  <FiArrowLeft className="w-4 h-4" />
                  Back
                </button>
                <button type="submit" disabled={!!busy || !host || !accessKey} className={primaryBtn}>
                  {busy === 'connecting' && <Spinner />}
                  {busy === 'connecting' ? 'Connecting…' : 'Connect'}
                </button>
              </div>
            </form>
          )}

          {step === 'choose' && error && (
            <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 flex gap-2">
              <FiAlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default NetworkSetup;
