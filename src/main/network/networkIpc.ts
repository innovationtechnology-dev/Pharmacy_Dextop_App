import { ipcMain } from 'electron';
import {
  DEFAULT_PORT,
  generateAccessKey,
  loadNetworkConfig,
  saveNetworkConfig,
} from './networkConfig';
import { getLocalAddresses, stopRpcServer } from './rpcServer';
import { callServer, discoverServers, pingServer } from './rpcClient';

interface NetworkIpcHooks {
  /** Initialise backend + start the server; called when this PC becomes the main computer. */
  startAsServer: () => Promise<void>;
  /** Re-run the renderer so the preload picks up the new mode. */
  reloadWindow: () => void;
}

/**
 * Local-only channels. These are registered in every mode and are never
 * exposed through the RPC server (see isBlockedRemotely).
 */
export const registerNetworkIpc = (hooks: NetworkIpcHooks): void => {
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
        hooks.reloadWindow();
        return { success: true };
      } catch (error) {
        return { success: false, error: String((error as Error)?.message ?? error) };
      }
    }
  );

  /** Lets the user switch back to the role picker (e.g. wrong server). */
  ipcMain.handle('network-reset', () => {
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
      try {
        console.log(`[rpc-client] -> ${cfg.serverHost}:${cfg.port} ${kind} ${channel}`);
        return await callServer(cfg, { kind, channel, args });
      } catch (error) {
        console.log(`[rpc-client] ${channel} failed: ${(error as Error)?.message}`);
        return { ok: false, error: String((error as Error)?.message ?? error), unreachable: true };
      }
    }
  );
};
