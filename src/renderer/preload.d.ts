import { Channels } from 'main/preload';
import type { ConnectionStatus } from 'main/network/connectionMonitor';

declare global {
  interface Window {
    electron: {
      ipcRenderer: {
        sendMessage(channel: Channels, args: unknown[]): void;
        on(
          channel: Channels,
          func: (...args: unknown[]) => void
        ): (() => void) | undefined;
        once(channel: Channels, func: (...args: unknown[]) => void): void;
        invoke(channel: Channels, ...args: unknown[]): Promise<unknown>;
      };
      network: {
        mode: 'unset' | 'server' | 'client';
        onConnection(fn: (ok: boolean) => void): () => void;
        /** Client mode: pushed whenever reachability of the main computer changes. */
        onStatus(fn: (status: ConnectionStatus) => void): () => void;
      };
    };
  }
}

export {};
