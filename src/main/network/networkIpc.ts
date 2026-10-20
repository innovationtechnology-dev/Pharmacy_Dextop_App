import os from 'os';
import { ipcMain } from 'electron';
import {
  DEFAULT_PORT,
  ensureServerIdentity,
  loadNetworkConfig,
  normalizeAccessKey,
  saveNetworkConfig,
} from './networkConfig';
import { getLocalAddresses, stopRpcServer } from './rpcServer';
import {
  callServer,
  cancelPairing,
  discoverServers,
  getPairingStatus,
  requestPairing,
  verifyServer,
} from './rpcClient';
import { listPendingPairRequests, respondToPairRequest } from './pairing';
import {
  checkNow,
  getConnectionStatus,
  startConnectionMonitor,
  stopConnectionMonitor,
} from './connectionMonitor';
import { SELF_SOURCE_ID, onDataChange } from './dataChanges';
import { startDataSync, stopDataSync } from './dataSyncClient';

interface NetworkIpcHooks {
  /** Initialise backend + start the server; called when this PC becomes the main computer. */
  startAsServer: () => Promise<void>;
  /** Re-run the renderer so the preload picks up the new mode. */
  reloadWindow: () => void;
  /** Push an event to the renderer. */
  sendToWindow: (channel: string, payload: unknown) => void;
}

/**
 * Local-only channels. These are registered in every mode and are never
 * exposed through the RPC server (see isBlockedRemotely).
 */
export const registerNetworkIpc = (hooks: NetworkIpcHooks): void => {
  const startMonitor = () => {
    startConnectionMonitor((s) => hooks.sendToWindow('network-status', s));
    // Other computer: live data changes from the main computer.
    startDataSync((event) => hooks.sendToWindow('data-changed', event));
  };

  // Main computer: its own window hears about every change, whichever computer made it.
  onDataChange((change) =>
    hooks.sendToWindow('data-changed', {
      topics: change.topics,
      self: change.sourceId === SELF_SOURCE_ID,
      change,
    })
  );
  if (loadNetworkConfig().role === 'client') startMonitor();

  /** Client mode: current reachability of the main computer (null until the first check). */
  ipcMain.handle('network-get-status', () => getConnectionStatus());
  ipcMain.handle('network-retry', () => checkNow());

  // Preload needs the mode synchronously, before the page runs.
  ipcMain.on('network-get-mode', (event) => {
    event.returnValue = loadNetworkConfig().role;
  });

  ipcMain.handle('network-get-config', () => {
    const c = loadNetworkConfig();
    return {
      role: c.role,
      port: c.port,
      serverHost: c.serverHost,
      accessKey: c.role === 'server' ? c.accessKey : '',
      addresses: c.role === 'server' ? getLocalAddresses() : [],
    };
  });

  ipcMain.handle('network-discover', () => discoverServers());

  ipcMain.handle(
    'network-test-connection',
    async (_e, host: string, port: number, accessKey: string) => {
      try {
        await verifyServer({ serverHost: host, port: port || DEFAULT_PORT }, normalizeAccessKey(accessKey));
        return { success: true };
      } catch (error) {
        return { success: false, error: String((error as Error)?.message ?? error) };
      }
    }
  );

  ipcMain.handle('network-setup-server', async () => {
    try {
      // Own key + id — never the key this computer may have used as a client.
      ensureServerIdentity();
      await hooks.startAsServer();
      hooks.reloadWindow();
      return { success: true };
    } catch (error) {
      saveNetworkConfig({ role: 'unset' });
      return { success: false, error: String((error as Error)?.message ?? error) };
    }
  });

  ipcMain.handle(
    'network-setup-client',
    async (_e, host: string, port: number, accessKey: string) => {
      try {
        const target = { serverHost: host.trim(), port: port || DEFAULT_PORT };
        const key = normalizeAccessKey(accessKey);
        // Verify the main computer proves it holds this key before we ever send the key to it.
        const serverId = await verifyServer(target, key);
        saveNetworkConfig({ role: 'client', ...target, accessKey: key, serverId });
        startMonitor();
        hooks.reloadWindow();
        return { success: true };
      } catch (error) {
        return { success: false, error: String((error as Error)?.message ?? error) };
      }
    }
  );

  // --- Main computer: answer "Request access" prompts ---
  ipcMain.handle('network-pair-pending', () => listPendingPairRequests());
  ipcMain.handle('network-pair-respond', (_e, id: string, allow: boolean) =>
    respondToPairRequest(id, !!allow)
  );

  // --- Other computer: ask the main computer for access and wait for Allow/Deny ---
  interface Pairing {
    host: string;
    port: number;
    requestId: string | null;
    cancelled: boolean;
  }
  let activePairing: Pairing | null = null;

  const sendCancel = (pairing: Pairing) => {
    if (!pairing.requestId) return;
    void cancelPairing({ serverHost: pairing.host, port: pairing.port }, pairing.requestId).catch(
      () => undefined
    );
  };

  ipcMain.handle('network-request-access', async (_e, host: string, port: number) => {
    const target = { serverHost: host.trim(), port: port || DEFAULT_PORT };
    if (activePairing) activePairing.cancelled = true;
    // Registered before the first await so "Cancel request" always has something to cancel.
    const pairing: Pairing = { host: target.serverHost, port: target.port, requestId: null, cancelled: false };
    activePairing = pairing;
    const finish = (result: { success: boolean; reason?: string; error?: string }) => {
      if (activePairing === pairing) activePairing = null;
      return result;
    };
    try {
      const deviceName = os.hostname().replace(/\.local$/, '');
      const { requestId, expiresAt } = await requestPairing(target, deviceName);
      pairing.requestId = requestId;
      if (pairing.cancelled) {
        sendCancel(pairing);
        return finish({ success: false, reason: 'cancelled' });
      }

      while (Date.now() < expiresAt + 2000) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 1500));
        if (pairing.cancelled) return finish({ success: false, reason: 'cancelled' });
        let status;
        try {
          // eslint-disable-next-line no-await-in-loop
          status = await getPairingStatus(target, requestId);
        } catch {
          continue; // brief network hiccup — keep waiting
        }
        if (pairing.cancelled) {
          sendCancel(pairing);
          return finish({ success: false, reason: 'cancelled' });
        }
        if (status.state === 'approved' && status.accessKey) {
          const key = normalizeAccessKey(status.accessKey);
          // eslint-disable-next-line no-await-in-loop
          const serverId = await verifyServer(target, key);
          if (pairing.cancelled) return finish({ success: false, reason: 'cancelled' });
          saveNetworkConfig({ role: 'client', ...target, accessKey: key, serverId });
          finish({ success: true });
          startMonitor();
          hooks.reloadWindow();
          return { success: true };
        }
        if (status.state === 'denied' || status.state === 'expired') {
          return finish({ success: false, reason: status.state });
        }
      }
      return finish({ success: false, reason: 'expired' });
    } catch (error) {
      if (pairing.cancelled) return finish({ success: false, reason: 'cancelled' });
      return finish({ success: false, reason: 'error', error: String((error as Error)?.message ?? error) });
    }
  });

  ipcMain.handle('network-cancel-access', () => {
    const pairing = activePairing;
    if (!pairing) return;
    pairing.cancelled = true;
    activePairing = null;
    sendCancel(pairing); // if the request is still being sent, the flow above cancels it once sent
  });

  /** Lets the user switch back to the role picker (e.g. wrong server). */
  ipcMain.handle('network-reset', () => {
    stopConnectionMonitor();
    stopDataSync();
    stopRpcServer();
    saveNetworkConfig({ role: 'unset', serverHost: '', serverId: '' });
    hooks.reloadWindow();
    return { success: true };
  });

  /** Client mode: forward a renderer IPC call to the main computer. */
  ipcMain.handle(
    'network-rpc',
    async (_e, kind: 'send' | 'invoke', channel: string, args: unknown[]) => {
      const cfg = loadNetworkConfig();
      if (cfg.role !== 'client') return { ok: false, error: 'Not in client mode' };
      // Known to be down: confirm with one quick check rather than letting each call wait to time out.
      if (getConnectionStatus()?.online === false && !(await checkNow())?.online) {
        return { ok: false, error: 'Cannot reach the main computer', unreachable: true };
      }
      try {
        console.log(`[rpc-client] -> ${cfg.serverHost}:${cfg.port} ${kind} ${channel}`);
        return await callServer(cfg, { kind, channel, args });
      } catch (error) {
        console.log(`[rpc-client] ${channel} failed: ${(error as Error)?.message}`);
        void checkNow(); // update the status screen with the reason
        return { ok: false, error: String((error as Error)?.message ?? error), unreachable: true };
      }
    }
  );
};
