import React, { useEffect, useState } from 'react';
import { FiWifi, FiMonitor, FiKey, FiCopy, FiCheck, FiRefreshCw } from 'react-icons/fi';

interface NetworkInfo {
  role: 'unset' | 'server' | 'client';
  serverHost: string;
  port: number;
  accessKey: string;
  addresses: string[];
}

/** Settings → Network: this computer's role, address and access key, and switching role. */
const NetworkSettings: React.FC = () => {
  const [info, setInfo] = useState<NetworkInfo | null>(null);
  const [online, setOnline] = useState(true);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    window.electron.ipcRenderer
      .invoke('network-get-config')
      .then((c) => setInfo(c as NetworkInfo));
    window.electron.ipcRenderer
      .invoke('network-get-status')
      .then((s) => s && setOnline((s as { online: boolean }).online));
    return window.electron.network?.onConnection(setOnline);
  }, []);

  if (!info) return null;

  const isServer = info.role === 'server';

  const switchComputer = async () => {
    const message = isServer
      ? 'Stop being the main computer? Other computers will be disconnected. The data on this computer is kept.'
      : 'Disconnect this computer from the main computer?';
    // eslint-disable-next-line no-alert
    if (window.confirm(message)) {
      await window.electron.ipcRenderer.invoke('network-reset');
    }
  };

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(info.accessKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — key is still visible
    }
  };

  const rowClass =
    'flex items-center justify-between gap-4 p-4 bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg';

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md transition-all">
        {/* Header */}
        <div className="px-4 py-2 bg-gradient-to-r from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-800/10 border-b border-blue-200/50 dark:border-blue-800/30">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600">
              <FiWifi className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wide">
              {isServer ? 'Main Computer' : 'Connected Computer'}
            </h3>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className={rowClass}>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-600 rounded-xl">
                <FiMonitor className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                  {isServer ? 'This is the main computer' : `Connected to ${info.serverHost}`}
                </h4>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">
                  {isServer
                    ? 'Other computers connect to one of these addresses'
                    : online
                      ? 'All data is read from and saved on the main computer'
                      : 'Cannot reach the main computer right now'}
                </p>
              </div>
            </div>
            {isServer ? (
              <div className="text-right font-mono text-xs text-gray-900 dark:text-white">
                {info.addresses.length
                  ? info.addresses.map((a) => <div key={a}>{`${a}:${info.port}`}</div>)
                  : 'No network found'}
              </div>
            ) : (
              <span
                className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${
                  online
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                }`}
              >
                {online ? 'Online' : 'Offline'}
              </span>
            )}
          </div>

          {isServer && (
            <div className={rowClass}>
              <div className="flex items-center gap-4">
                <div className="p-3 bg-amber-50 dark:bg-amber-900/30 text-amber-600 rounded-xl">
                  <FiKey className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-900 dark:text-white">Access key</h4>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">
                    Enter this key on another computer to connect it
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {showKey && (
                  <span className="font-mono text-sm text-gray-900 dark:text-white">
                    {info.accessKey.match(/.{1,4}/g)?.join('-')}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600"
                >
                  {showKey ? 'Hide' : 'Show'}
                </button>
                {showKey && (
                  <button
                    type="button"
                    onClick={copyKey}
                    title="Copy key"
                    className="p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600"
                  >
                    {copied ? <FiCheck className="w-3.5 h-3.5 text-emerald-600" /> : <FiCopy className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            </div>
          )}

          <div className={rowClass}>
            <div>
              <h4 className="text-sm font-bold text-gray-900 dark:text-white">Change role</h4>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">
                {isServer
                  ? 'Stop sharing this computer’s data with other computers'
                  : 'Disconnect and choose a different main computer'}
              </p>
            </div>
            <button
              type="button"
              onClick={switchComputer}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800 flex items-center gap-2"
            >
              <FiRefreshCw className="w-3.5 h-3.5" />
              Change role
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NetworkSettings;
