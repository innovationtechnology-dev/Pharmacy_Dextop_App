import { ipcMain } from 'electron';
import { ChangeOrigin, isWriteChannel, localOrigin, recordChange } from './dataChanges';

/**
 * Records every handler registered on ipcMain so the same controllers can be
 * served over the network without being rewritten. Call installIpcRegistry()
 * before any controller is constructed.
 *
 * Handlers of write channels are wrapped so every successful write — from this
 * computer or, via the RPC server, another one — is reported to dataChanges.
 * The RPC server marks its events with `origin`; local IPC events have none.
 */
type SendHandler = (event: any, ...args: any[]) => unknown;
type InvokeHandler = (event: any, ...args: any[]) => unknown;

const sendHandlers = new Map<string, SendHandler[]>();
const invokeHandlers = new Map<string, InvokeHandler>();

let installed = false;

const originOf = (event: any): ChangeOrigin => event?.origin ?? localOrigin();

const wrapSend = (channel: string, listener: SendHandler): SendHandler => {
  if (!isWriteChannel(channel)) return listener;
  return (event: any, ...rest: any[]) => {
    const args = Array.isArray(rest[0]) ? rest[0] : rest;
    const origin = originOf(event);
    // Controllers answer with event.reply(); report the write once the answer says it worked.
    const reply = event.reply.bind(event);
    event.reply = (replyChannel: string, payload: unknown) => {
      reply(replyChannel, payload);
      recordChange(channel, args, payload, origin);
    };
    return listener(event, ...rest);
  };
};

const wrapInvoke = (channel: string, listener: InvokeHandler): InvokeHandler => {
  if (!isWriteChannel(channel)) return listener;
  return async (event: any, ...args: any[]) => {
    const result = await listener(event, ...args);
    recordChange(channel, args, result, originOf(event));
    return result;
  };
};

export const installIpcRegistry = (): void => {
  if (installed) return;
  installed = true;

  const originalOn = ipcMain.on.bind(ipcMain);
  const originalHandle = ipcMain.handle.bind(ipcMain);

  (ipcMain as any).on = (channel: string, listener: SendHandler) => {
    const wrapped = wrapSend(channel, listener);
    const list = sendHandlers.get(channel) ?? [];
    list.push(wrapped);
    sendHandlers.set(channel, list);
    return originalOn(channel, wrapped as any);
  };

  (ipcMain as any).handle = (channel: string, listener: InvokeHandler) => {
    const wrapped = wrapInvoke(channel, listener);
    invokeHandlers.set(channel, wrapped);
    return originalHandle(channel, wrapped as any);
  };
};

export const getSendHandlers = (channel: string) => sendHandlers.get(channel);
export const getInvokeHandler = (channel: string) => invokeHandlers.get(channel);
