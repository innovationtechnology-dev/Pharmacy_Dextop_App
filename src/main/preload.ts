import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

export type Channels =
  | 'ipc-example'
  | 'auth-login' | 'auth-signup' | 'auth-verify-token' | 'auth-get-user'
  | 'auth-login-reply' | 'auth-signup-reply' | 'auth-verify-token-reply' | 'auth-get-user-reply'
  | 'medicine-get-all' | 'medicine-get-by-barcode' | 'medicine-get-by-id' | 'medicine-search' | 'medicine-get-expiring'
  | 'medicine-create' | 'medicine-update' | 'medicine-delete'
  | 'medicine-seed-sample'
  | 'medicine-get-all-reply' | 'medicine-get-by-barcode-reply' | 'medicine-get-by-id-reply' | 'medicine-search-reply' | 'medicine-get-expiring-reply'
  | 'medicine-create-reply' | 'medicine-update-reply' | 'medicine-delete-reply'
  | 'medicine-seed-sample-reply'
  | 'sale-create' | 'sale-get-all' | 'sale-update'
  | 'sale-create-reply' | 'sale-get-all-reply' | 'sale-update-reply'
  | 'financial-get-monthly' | 'financial-get-monthly-reply'
  | 'financial-get-date-range' | 'financial-get-date-range-reply'
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
  | 'payment-create' | 'payment-create-reply'
  | 'payment-get-by-purchase' | 'payment-get-by-purchase-reply'
  | 'payment-get-by-date' | 'payment-get-by-date-reply'
  | 'payment-get-all' | 'payment-get-all-reply'
  | 'payment-get-summary' | 'payment-get-summary-reply'
  | 'payment-get-supplier-accounts' | 'payment-get-supplier-accounts-reply'
  | 'payment-delete' | 'payment-delete-reply'
  | 'asynchronous-sql-command' | 'asynchronous-sql-reply'
  | 'ipc-show-userDataPaths';

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    sendMessage(channel: Channels, args: unknown[]) {
      ipcRenderer.send(channel, args);
    },
    on(channel: Channels, func: (...args: unknown[]) => void) {
      const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
        func(...args);
      ipcRenderer.on(channel, subscription);

      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
    once(channel: Channels, func: (...args: unknown[]) => void) {
      ipcRenderer.once(channel, (_event, ...args) => func(...args));
    },
  },
});
