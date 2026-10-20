import React, { useEffect, useState } from 'react';
import NetworkSetup from './NetworkSetup';

interface NetworkInfo {
  role: 'unset' | 'server' | 'client';
  serverHost: string;
  port: number;
  accessKey: string;
  addresses: string[];
}

/**
 * Shows the role picker on first launch and a status strip afterwards:
 * the main computer shows its address + key, clients show connection state.
 */
const NetworkGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [info, setInfo] = useState<NetworkInfo | null>(null);
  const [online, setOnline] = useState(true);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    window.electron.ipcRenderer
      .invoke('network-get-config')
      .then((c) => setInfo(c as NetworkInfo));
    return window.electron.network?.onConnection(setOnline);
  }, []);

  if (!info) return null;
  if (info.role === 'unset') return <NetworkSetup />;

  const switchComputer = async () => {
    const message =
      info.role === 'server'
        ? 'Stop being the main computer? Other computers will be disconnected. The data on this computer is kept.'
        : 'Disconnect this computer from the main computer?';
    // eslint-disable-next-line no-alert
    if (window.confirm(message)) {
      await window.electron.ipcRenderer.invoke('network-reset');
    }
  };

  return (
    <>
      {info.role === 'client' && !online && (
        <div className="fixed top-0 inset-x-0 z-[9999] bg-red-600 text-white text-sm text-center py-1.5">
          Cannot reach the main computer ({info.serverHost}). Check that it is on and on the same
          WiFi — retrying on your next action.
        </div>
      )}
      {info.role === 'server' && (
        <div className="fixed bottom-2 right-2 z-[9999] text-xs bg-gray-900/90 text-white rounded-lg px-3 py-2 shadow-lg">
          <div className="font-semibold">Main computer</div>
          <div>
            {info.addresses.length ? info.addresses.map((a) => `${a}:${info.port}`).join(', ') : 'No network found'}
          </div>
          <button
            type="button"
            className="underline"
            onClick={() => setShowKey((v) => !v)}
          >
            {showKey ? `Key: ${info.accessKey}` : 'Show access key'}
          </button>
          <button type="button" className="underline ml-3" onClick={switchComputer}>
            Change role
          </button>
        </div>
      )}
      {info.role === 'client' && (
        <button
          type="button"
          onClick={switchComputer}
          className="fixed bottom-2 right-2 z-[9999] text-xs bg-gray-900/80 text-white rounded-lg px-3 py-1.5"
        >
          Connected to {info.serverHost} · change
        </button>
      )}
      {children}
    </>
  );
};

export default NetworkGate;
