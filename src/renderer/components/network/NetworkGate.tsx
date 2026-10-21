import React, { useEffect, useRef, useState } from 'react';
import type { ConnectionStatus } from '../../../main/network/connectionMonitor';
import NetworkSetup from './NetworkSetup';
import ConnectionLostScreen from './ConnectionLostScreen';
import PairingRequestPrompt from './PairingRequestPrompt';

interface NetworkInfo {
  role: 'unset' | 'server' | 'client';
  serverHost: string;
  port: number;
  accessKey: string;
  addresses: string[];
}

const UNREACHABLE_MESSAGE = 'Cannot reach the main computer';

// Client mode: while the main computer is down, every page's data request fails with
// UNREACHABLE_MESSAGE. The connection-lost screen already explains that, so drop those
// rejections instead of letting each one surface as an error (dev overlay / console).
// Capture phase on window runs before other listeners, so stopping it here hides it from them.
if (window.electron?.network?.mode === 'client') {
  window.addEventListener(
    'unhandledrejection',
    (event) => {
      const { reason } = event;
      const message = typeof reason === 'string' ? reason : reason?.message;
      if (message === UNREACHABLE_MESSAGE) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    { capture: true }
  );
}

/**
 * Shows the role picker on first launch, and on clients a full-screen explanation while the
 * main computer is unreachable. Address, access key and role switching live in Settings → Network.
 */
const NetworkGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [info, setInfo] = useState<NetworkInfo | null>(null);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const wasOffline = useRef(false);

  useEffect(() => {
    window.electron.ipcRenderer
      .invoke('network-get-config')
      .then((c) => setInfo(c as NetworkInfo));
    window.electron.ipcRenderer
      .invoke('network-get-status')
      .then((s) => s && setStatus(s as ConnectionStatus));
    return window.electron.network?.onStatus(setStatus);
  }, []);

  // Brief confirmation after the connection comes back (or the main computer got a new address).
  useEffect(() => {
    if (!status) return undefined;
    let message: string | null = null;
    if (status.online && status.movedFrom) {
      message = `Main computer found at its new address (${status.serverHost}) — reconnected.`;
    } else if (status.online && wasOffline.current) {
      message = 'Reconnected to the main computer.';
    }
    wasOffline.current = !status.online;
    if (!message) return undefined;
    setNotice(message);
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [status]);

  if (!info) return null;
  if (info.role === 'unset') return <NetworkSetup />;

  return (
    <>
      {info.role === 'server' && <PairingRequestPrompt />}
      {info.role === 'client' && status && !status.online && (
        <ConnectionLostScreen status={status} />
      )}
      {notice && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] bg-emerald-600 text-white text-sm rounded-lg px-4 py-2 shadow-lg">
          {notice}
        </div>
      )}
      {children}
    </>
  );
};

export default NetworkGate;
