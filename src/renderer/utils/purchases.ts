export type IpcResponse<T> = {
    success: boolean;
    data?: T;
    error?: string;
};

import { getStoredPharmacySettings } from '../types/pharmacy';

export const exportPurchasesPdf = (fromDate?: string, toDate?: string, options?: any): Promise<IpcResponse<{ filePath: string }>> => {
    return new Promise((resolve) => {
        const settings = getStoredPharmacySettings();
        window.electron.ipcRenderer.once('purchase-export-pdf-reply', (...args: unknown[]) => {
            const response = (args?.[0] as IpcResponse<{ filePath: string }>) || { success: false, error: 'no-response' };
            resolve(response);
        });
        window.electron.ipcRenderer.sendMessage('purchase-export-pdf', [settings, fromDate, toDate, options] as any);
    });
};

export const exportPurchasesCsv = (): Promise<IpcResponse<{ filePath: string }>> => {
    return new Promise((resolve) => {
        const settings = getStoredPharmacySettings();
        window.electron.ipcRenderer.once('purchase-export-csv-reply', (...args: unknown[]) => {
            const response = (args?.[0] as IpcResponse<{ filePath: string }>) || { success: false, error: 'no-response' };
            resolve(response);
        });
        window.electron.ipcRenderer.sendMessage('purchase-export-csv', [settings] as any);
    });
};
