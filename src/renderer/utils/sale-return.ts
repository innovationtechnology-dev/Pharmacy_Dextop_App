import { getStoredPharmacySettings } from '../types/pharmacy';

export type FlatSaleReturnRow = {
  saleReturnId: number;
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
  reason?: string;
};

export type SaleReturnItem = {
  medicineId: number;
  medicineName: string;
  pills: number;
  unitPrice: number;
  discountAmount?: number;
  taxAmount?: number;
  reason?: string;
};

export type SaleReturn = {
  id?: number;
  saleId: number;
  items: SaleReturnItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  customerName?: string;
  customerPhone?: string;
  reason?: string;
  notes?: string;
  createdAt?: string;
};

export type IpcResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

export const getSaleReturnsFlatRowsByRange = (fromDate: string, toDate: string): Promise<IpcResponse<FlatSaleReturnRow[]>> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('sale-return-get-flat-rows-range-reply', (...args: unknown[]) => {
      const response = (args?.[0] as IpcResponse<FlatSaleReturnRow[]>) || { success: false, error: 'no-response' };
      resolve(response);
    });
    window.electron.ipcRenderer.sendMessage('sale-return-get-flat-rows-range', [fromDate, toDate] as any);
  });
};

export const getAllSaleReturns = (): Promise<IpcResponse<SaleReturn[]>> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('sale-return-get-all-reply', (...args: unknown[]) => {
      const response = (args?.[0] as IpcResponse<SaleReturn[]>) || { success: false, error: 'no-response' };
      resolve(response);
    });
    window.electron.ipcRenderer.sendMessage('sale-return-get-all', [] as any);
  });
};

export const getSaleReturnsBySaleId = (saleId: number): Promise<IpcResponse<SaleReturn[]>> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('sale-return-get-by-sale-id-reply', (...args: unknown[]) => {
      const response = (args?.[0] as IpcResponse<SaleReturn[]>) || { success: false, error: 'no-response' };
      resolve(response);
    });
    window.electron.ipcRenderer.sendMessage('sale-return-get-by-sale-id', [saleId] as any);
  });
};

export const createSaleReturn = (saleReturn: Omit<SaleReturn, 'id' | 'createdAt' | 'subtotal' | 'discountTotal' | 'taxTotal' | 'total'>): Promise<IpcResponse<{ id: number }>> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('sale-return-create-reply', (...args: unknown[]) => {
      const response = (args?.[0] as IpcResponse<{ id: number }>) || { success: false, error: 'no-response' };
      resolve(response);
    });
    window.electron.ipcRenderer.sendMessage('sale-return-create', [saleReturn] as any);
  });
};

export const deleteSaleReturn = (saleReturnId: number): Promise<IpcResponse<void>> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('sale-return-delete-reply', (...args: unknown[]) => {
      const response = (args?.[0] as IpcResponse<void>) || { success: false, error: 'no-response' };
      resolve(response);
    });
    window.electron.ipcRenderer.sendMessage('sale-return-delete', [saleReturnId] as any);
  });
};

export const exportSaleReturnsCsv = (fromDate?: string, toDate?: string): Promise<IpcResponse<{ filePath: string }>> => {
  return new Promise((resolve) => {
    const settings = getStoredPharmacySettings();
    window.electron.ipcRenderer.once('sale-return-export-csv-reply', (...args: unknown[]) => {
      const response = (args?.[0] as IpcResponse<{ filePath: string }>) || { success: false, error: 'no-response' };
      resolve(response);
    });
    window.electron.ipcRenderer.sendMessage('sale-return-export-csv', [settings, fromDate, toDate] as any);
  });
};

export const exportSaleReturnsPdf = (fromDate?: string, toDate?: string): Promise<IpcResponse<{ filePath: string }>> => {
  return new Promise((resolve) => {
    const settings = getStoredPharmacySettings();
    window.electron.ipcRenderer.once('sale-return-export-pdf-reply', (...args: unknown[]) => {
      const response = (args?.[0] as IpcResponse<{ filePath: string }>) || { success: false, error: 'no-response' };
      resolve(response);
    });
    window.electron.ipcRenderer.sendMessage('sale-return-export-pdf', [settings, fromDate, toDate] as any);
  });
};

