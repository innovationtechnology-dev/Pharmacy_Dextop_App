import { Channels } from 'main/preload';

/**
 * Helper to wrap an IPC send/reply pair into a promise.
 */
export const invokeIpc = <T = any>(
  requestChannel: Channels,
  replyChannel: Channels,
  args: unknown[] = []
): Promise<T> => {
  return new Promise((resolve, reject) => {
    const handler = (response: any) => {
      if (response?.success) {
        resolve(response.data as T);
      } else {
        reject(response?.error || 'Unknown IPC error');
      }
    };

    window.electron.ipcRenderer.once(replyChannel, handler);
    window.electron.ipcRenderer.sendMessage(requestChannel, args);
  });
};

