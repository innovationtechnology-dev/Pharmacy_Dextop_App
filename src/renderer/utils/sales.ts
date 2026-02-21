export type SalesSummaryRow = {
  medicineName: string;
  unitsSold: number;
  revenue: number;
};

import { getStoredPharmacySettings } from '../types/pharmacy';

export const getSalesFlatRowsByRange = (fromDate: string, toDate: string): Promise<IpcResponse<FlatSaleRow[]>> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('sales-get-flat-rows-range-reply', (...args: unknown[]) => {
      const response = (args?.[0] as IpcResponse<FlatSaleRow[]>) || { success: false, error: 'no-response' };
      resolve(response);
    });
    window.electron.ipcRenderer.sendMessage('sales-get-flat-rows-range', [fromDate, toDate] as any);
  });
};

export const exportSalesCsvByRange = (fromDate: string, toDate: string): Promise<IpcResponse<{ filePath: string }>> => {
  return new Promise((resolve) => {
    const settings = getStoredPharmacySettings();
    window.electron.ipcRenderer.once('sales-export-csv-range-reply', (...args: unknown[]) => {
      const response = (args?.[0] as IpcResponse<{ filePath: string }>) || { success: false, error: 'no-response' };
      resolve(response);
    });
    window.electron.ipcRenderer.sendMessage('sales-export-csv-range', [fromDate, toDate, settings] as any);
  });
};

export const exportSalesPdf = (fromDate: string, toDate: string): Promise<IpcResponse<{ filePath: string }>> => {
  return new Promise((resolve) => {
    const settings = getStoredPharmacySettings();
    window.electron.ipcRenderer.once('sales-export-pdf-reply', (...args: unknown[]) => {
      const response = (args?.[0] as IpcResponse<{ filePath: string }>) || { success: false, error: 'no-response' };
      resolve(response);
    });
    window.electron.ipcRenderer.sendMessage('sales-export-pdf', [fromDate, toDate, settings] as any);
  });
};

export type FlatSaleRow = {
  saleId: number;
  createdAt: string;
  customerName?: string;
  customerPhone?: string;
  medicineId: number;
  medicineName: string;
  pills: number;
  unitPrice: number;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
};

export const getSalesFlatRows = (): Promise<IpcResponse<FlatSaleRow[]>> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('sales-get-flat-rows-reply', (...args: unknown[]) => {
      const response = (args?.[0] as IpcResponse<FlatSaleRow[]>) || { success: false, error: 'no-response' };
      resolve(response);
    });
    window.electron.ipcRenderer.sendMessage('sales-get-flat-rows', [] as any);
  });
};

export type IpcResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

export const getSalesSummaryByRange = (fromDate: string, toDate: string): Promise<IpcResponse<SalesSummaryRow[]>> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('sales-get-summary-range-reply', (...args: unknown[]) => {
      const response = (args?.[0] as IpcResponse<SalesSummaryRow[]>) || { success: false, error: 'no-response' };
      resolve(response);
    });
    window.electron.ipcRenderer.sendMessage('sales-get-summary-range', [fromDate, toDate] as any);
  });
};

export const exportSalesCsv = (): Promise<IpcResponse<{ filePath: string }>> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('sales-export-csv-reply', (...args: unknown[]) => {
      const response = (args?.[0] as IpcResponse<{ filePath: string }>) || { success: false, error: 'no-response' };
      resolve(response);
    });
    window.electron.ipcRenderer.sendMessage('sales-export-csv', [] as any);
  });
};

export type SaleItemInput = {
  medicineId: number;
  medicineName: string;
  pills: number;
  unitPrice: number;
  discountAmount?: number;
  taxAmount?: number;
};

export type Sale = {
  items: SaleItemInput[];
  customerName?: string;
  customerPhone?: string;
};

export const updateSale = (saleId: number, sale: Sale): Promise<IpcResponse<void>> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('sale-update-reply', (...args: unknown[]) => {
      const response = (args?.[0] as IpcResponse<void>) || { success: false, error: 'no-response' };
      resolve(response);
    });
    window.electron.ipcRenderer.sendMessage('sale-update', [saleId, sale] as any);
  });
};
