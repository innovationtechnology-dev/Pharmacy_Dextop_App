import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

export type Channels =
  | 'ipc-example'
  | 'auth-login' | 'auth-signup' | 'auth-verify-token' | 'auth-get-user'
  | 'auth-login-reply' | 'auth-signup-reply' | 'auth-verify-token-reply' | 'auth-get-user-reply'
  | 'medicine-get-all' | 'medicine-get-by-barcode' | 'medicine-get-by-id' | 'medicine-search' | 'medicine-get-expiring'
  | 'medicine-create' | 'medicine-update' | 'medicine-delete'
  | 'medicine-seed-sample' | 'medicine-get-financial-details'
  | 'medicine-get-all-reply' | 'medicine-get-by-barcode-reply' | 'medicine-get-by-id-reply' | 'medicine-search-reply' | 'medicine-get-expiring-reply'
  | 'medicine-create-reply' | 'medicine-update-reply' | 'medicine-delete-reply'
  | 'medicine-seed-sample-reply' | 'medicine-get-financial-details-reply'
  | 'sale-create' | 'sale-get-all' | 'sale-update'
  | 'sale-create-reply' | 'sale-get-all-reply' | 'sale-update-reply'
  | 'financial-get-monthly' | 'financial-get-monthly-reply'
  | 'financial-get-date-range' | 'financial-get-date-range-reply'
  | 'financial-get-spark-range' | 'financial-get-spark-range-reply'
  | 'sales-get-summary-range' | 'sales-get-summary-range-reply'
  | 'sales-export-csv' | 'sales-export-csv-reply'
  | 'sales-get-flat-rows' | 'sales-get-flat-rows-reply'
  | 'sales-get-flat-rows-range' | 'sales-get-flat-rows-range-reply'
  | 'sales-export-csv-range' | 'sales-export-csv-range-reply'
  | 'sales-export-pdf' | 'sales-export-pdf-reply'
  | 'sale-return-create' | 'sale-return-get-all' | 'sale-return-get-by-id' | 'sale-return-get-by-sale-id' | 'sale-return-get-by-date-range' | 'sale-return-get-flat-rows-range' | 'sale-return-delete' | 'sale-return-export-csv' | 'sale-return-export-pdf'
  | 'sale-return-create-reply' | 'sale-return-get-all-reply' | 'sale-return-get-by-id-reply' | 'sale-return-get-by-sale-id-reply' | 'sale-return-get-by-date-range-reply' | 'sale-return-get-flat-rows-range-reply' | 'sale-return-delete-reply' | 'sale-return-export-csv-reply' | 'sale-return-export-pdf-reply'
  | 'supplier-get-all' | 'supplier-get-by-id' | 'supplier-create' | 'supplier-update' | 'supplier-delete'
  | 'supplier-get-all-reply' | 'supplier-get-by-id-reply' | 'supplier-create-reply' | 'supplier-update-reply' | 'supplier-delete-reply'
  | 'purchase-create' | 'purchase-get-all' | 'purchase-get-by-id' | 'purchase-get-total-by-date-range'
  | 'purchase-create-reply' | 'purchase-get-all-reply' | 'purchase-get-by-id-reply' | 'purchase-get-total-by-date-range-reply'
  | 'purchase-export-pdf' | 'purchase-export-pdf-reply' | 'purchase-export-csv' | 'purchase-export-csv-reply'
  | 'purchase-delete' | 'purchase-delete-reply'
  | 'purchase-update' | 'purchase-update-reply'
  | 'purchase-update-payment' | 'purchase-update-payment-reply'
  | 'purchase-record-supplier-refund' | 'purchase-record-supplier-refund-reply'
  | 'payment-get-all' | 'payment-get-all-reply'
  | 'payment-get-supplier-ledger' | 'payment-get-supplier-ledger-reply'
  | 'payment-get-summary' | 'payment-get-summary-reply'
  | 'payment-get-supplier-accounts' | 'payment-get-supplier-accounts-reply'
  | 'payment-get-by-purchase' | 'payment-get-by-purchase-reply'
  | 'payment-create' | 'payment-create-reply'
  | 'payment-delete' | 'payment-delete-reply'
  | 'payment-export-pdf' | 'payment-export-pdf-reply'
  | 'payment-export-csv' | 'payment-export-csv-reply'
  | 'asynchronous-sql-command' | 'asynchronous-sql-reply'
  | 'ipc-show-userDataPaths'
  | 'system-reset-all-data' | 'system-reset-all-data-reply'
  | 'get-table-counts' | 'get-table-counts-reply'
  | (string & {});

const networkMode: string = ipcRenderer.sendSync('network-get-mode');
const isClient = networkMode === 'client';

type Listener = (...args: unknown[]) => void;
const clientListeners = new Map<string, Set<{ fn: Listener; once: boolean }>>();

const emitLocal = (channel: string, payload: unknown) => {
  const set = clientListeners.get(channel);
  if (!set) return;
  [...set].forEach((entry) => {
    if (entry.once) set.delete(entry);
    entry.fn(payload);
  });
};

const addLocal = (channel: string, fn: Listener, once: boolean) => {
  const set = clientListeners.get(channel) ?? new Set();
  const entry = { fn, once };
  set.add(entry);
  clientListeners.set(channel, set);
  return () => {
    set.delete(entry);
  };
};

const isLocalChannel = (channel: string) =>
  channel.startsWith('network-') || channel === 'ipc-example';

// Event.detail does not survive the context-isolation boundary, so expose a callback API instead.
const connectionListeners = new Set<(ok: boolean) => void>();
const notifyConnection = (ok: boolean) =>
  connectionListeners.forEach((fn) => fn(ok));

const bridge = {
  sendMessage(channel: Channels, args: unknown[]) {
    if (!isClient || isLocalChannel(channel)) {
      ipcRenderer.send(channel, args);
      return;
    }
    ipcRenderer.invoke('network-rpc', 'send', channel, args).then((res) => {
      notifyConnection(!res?.unreachable);
      if (res?.ok) {
        emitLocal(res.replyChannel, res.payload);
      } else {
        emitLocal(`${channel}-reply`, {
          success: false,
          error: res?.error || 'Cannot reach the main computer',
        });
      }
    });
  },
  on(channel: Channels, func: Listener) {
    if (isClient && !isLocalChannel(channel)) return addLocal(channel, func, false);
    const subscription = (_event: IpcRendererEvent, ...args: unknown[]) => func(...args);
    ipcRenderer.on(channel, subscription);
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },
  once(channel: Channels, func: Listener) {
    if (isClient && !isLocalChannel(channel)) {
      addLocal(channel, func, true);
      return;
    }
    ipcRenderer.once(channel, (_event, ...args) => func(...args));
  },
  /** Prefer for request/response (e.g. barcode lookup) — avoids stacked `once` bugs on rapid scans. */
  async invoke(channel: Channels, ...args: unknown[]) {
    if (!isClient || isLocalChannel(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    const res = await ipcRenderer.invoke('network-rpc', 'invoke', channel, args);
    notifyConnection(!res?.unreachable);
    if (!res?.ok) throw new Error(res?.error || 'Cannot reach the main computer');
    return res.payload;
  },
};

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: bridge,
  network: {
    mode: networkMode,
    onConnection(fn: (ok: boolean) => void) {
      connectionListeners.add(fn);
      return () => {
        connectionListeners.delete(fn);
      };
    },
  },
});
