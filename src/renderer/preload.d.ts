import { Channels } from 'main/preload';
import type { ConnectionStatus } from 'main/network/connectionMonitor';
import type { SyncEvent } from 'main/network/dataChanges';

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
      dataSync: {
        /** Pushed whenever data changes on the main computer, from any computer. */
        onChange(fn: (event: SyncEvent) => void): () => void;
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
