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
 * Shows the role picker on first launch, and an offline banner on clients that lose the
 * main computer. Address, access key and role switching live in Settings → Network.
 */
const NetworkGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [info, setInfo] = useState<NetworkInfo | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    window.electron.ipcRenderer
      .invoke('network-get-config')
      .then((c) => setInfo(c as NetworkInfo));
    return window.electron.network?.onConnection(setOnline);
  }, []);

  if (!info) return null;
  if (info.role === 'unset') return <NetworkSetup />;

  return (
    <>
      {info.role === 'client' && !online && (
        <div className="fixed top-0 inset-x-0 z-[9999] bg-red-600 text-white text-sm text-center py-1.5">
          Cannot reach the main computer ({info.serverHost}). Check that it is on and on the same
          WiFi — retrying on your next action.
        </div>
      )}
      {children}
    </>
  );
};

export default NetworkGate;
