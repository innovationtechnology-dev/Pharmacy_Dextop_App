import os from 'os';
import { ipcMain } from 'electron';
import {
  DEFAULT_PORT,
  generateAccessKey,
  loadNetworkConfig,
  saveNetworkConfig,
} from './networkConfig';
import { getLocalAddresses, stopRpcServer } from './rpcServer';
import {
  callServer,
  cancelPairing,
  discoverServers,
  getPairingStatus,
  pingServer,
  requestPairing,
} from './rpcClient';
import { listPendingPairRequests, respondToPairRequest } from './pairing';
import {
  checkNow,
  getConnectionStatus,
  startConnectionMonitor,
  stopConnectionMonitor,
} from './connectionMonitor';

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
  const startMonitor = () =>
    startConnectionMonitor((s) => hooks.sendToWindow('network-status', s));
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
        await pingServer({ serverHost: host, port: port || DEFAULT_PORT, accessKey });
        return { success: true };
      } catch (error) {
        return { success: false, error: String((error as Error)?.message ?? error) };
      }
    }
  );

  ipcMain.handle('network-setup-server', async () => {
    try {
      const existing = loadNetworkConfig();
      saveNetworkConfig({
        role: 'server',
        accessKey: existing.accessKey || generateAccessKey(),
      });
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
        const cfg = { serverHost: host.trim(), port: port || DEFAULT_PORT, accessKey: accessKey.trim() };
        await pingServer(cfg);
        saveNetworkConfig({ role: 'client', ...cfg });
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
  let activePairing: { host: string; port: number; requestId: string; cancelled: boolean } | null = null;

  ipcMain.handle('network-request-access', async (_e, host: string, port: number) => {
    const target = { serverHost: host.trim(), port: port || DEFAULT_PORT };
    if (activePairing) activePairing.cancelled = true;
    try {
      const deviceName = os.hostname().replace(/\.local$/, '');
      const { requestId, expiresAt } = await requestPairing(target, deviceName);
      const pairing = { host: target.serverHost, port: target.port, requestId, cancelled: false };
      activePairing = pairing;

      while (!pairing.cancelled && Date.now() < expiresAt + 2000) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 1500));
        if (pairing.cancelled) break;
        let status;
        try {
          // eslint-disable-next-line no-await-in-loop
          status = await getPairingStatus(target, requestId);
        } catch {
          continue; // brief network hiccup — keep waiting
        }
        if (status.state === 'approved' && status.accessKey) {
          const cfg = { ...target, accessKey: status.accessKey };
          // eslint-disable-next-line no-await-in-loop
          await pingServer(cfg);
          saveNetworkConfig({ role: 'client', ...cfg });
          activePairing = null;
          startMonitor();
          hooks.reloadWindow();
          return { success: true };
        }
        if (status.state === 'denied' || status.state === 'expired') {
          activePairing = null;
          return { success: false, reason: status.state };
        }
      }
      if (activePairing === pairing) activePairing = null;
      return { success: false, reason: pairing.cancelled ? 'cancelled' : 'expired' };
    } catch (error) {
      return { success: false, reason: 'error', error: String((error as Error)?.message ?? error) };
    }
  });

  ipcMain.handle('network-cancel-access', async () => {
    const pairing = activePairing;
    if (!pairing) return;
    pairing.cancelled = true;
    activePairing = null;
    await cancelPairing({ serverHost: pairing.host, port: pairing.port }, pairing.requestId).catch(
      () => undefined
    );
  });

  /** Lets the user switch back to the role picker (e.g. wrong server). */
  ipcMain.handle('network-reset', () => {
    stopConnectionMonitor();
    stopRpcServer();
    saveNetworkConfig({ role: 'unset', serverHost: '' });
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
      if (getConnectionStatus()?.online === false && !(await checkNow()).online) {
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
