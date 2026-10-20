import { ipcMain } from 'electron';

/**
 * Records every handler registered on ipcMain so the same controllers can be
 * served over the network without being rewritten. Call installIpcRegistry()
 * before any controller is constructed.
 */
type SendHandler = (event: any, ...args: any[]) => unknown;
type InvokeHandler = (event: any, ...args: any[]) => unknown;

const sendHandlers = new Map<string, SendHandler[]>();
const invokeHandlers = new Map<string, InvokeHandler>();

let installed = false;

export const installIpcRegistry = (): void => {
  if (installed) return;
  installed = true;

  const originalOn = ipcMain.on.bind(ipcMain);
  const originalHandle = ipcMain.handle.bind(ipcMain);

  (ipcMain as any).on = (channel: string, listener: SendHandler) => {
    const list = sendHandlers.get(channel) ?? [];
    list.push(listener);
    sendHandlers.set(channel, list);
    return originalOn(channel, listener as any);
  };

  (ipcMain as any).handle = (channel: string, listener: InvokeHandler) => {
    invokeHandlers.set(channel, listener);
    return originalHandle(channel, listener as any);
  };
};

export const getSendHandlers = (channel: string) => sendHandlers.get(channel);
export const getInvokeHandler = (channel: string) => invokeHandlers.get(channel);
