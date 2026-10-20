import http from 'http';
import dgram from 'dgram';
import os from 'os';
import crypto from 'crypto';
import { DISCOVERY_PORT, NetworkConfig } from './networkConfig';
import { getInvokeHandler, getSendHandlers } from './ipcRegistry';

const MAX_BODY_BYTES = 25 * 1024 * 1024;
const HANDLER_TIMEOUT_MS = 60_000;
const DISCOVER_MESSAGE = 'PHARMACY_DISCOVER';

/** Channels that must never be callable from another computer. */
const isBlockedRemotely = (channel: string) =>
  channel.startsWith('network-') ||
  channel === 'asynchronous-sql-command' ||
  channel === 'ipc-show-userDataPaths';

export interface RpcRequest {
  kind: 'send' | 'invoke';
  channel: string;
  args?: unknown[];
}

export interface RpcResponse {
  ok: boolean;
  /** For kind 'send': the channel the controller replied on. */
  replyChannel?: string;
  payload?: unknown;
  error?: string;
}

const keysMatch = (a: string, b: string): boolean => {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};

const withTimeout = <T,>(p: Promise<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Request timed out')), HANDLER_TIMEOUT_MS);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });

const dispatch = async (req: RpcRequest): Promise<RpcResponse> => {
  if (!req || typeof req.channel !== 'string') return { ok: false, error: 'Bad request' };
  if (isBlockedRemotely(req.channel)) return { ok: false, error: 'Channel not available remotely' };

  if (req.kind === 'invoke') {
    const handler = getInvokeHandler(req.channel);
    if (!handler) return { ok: false, error: `Unknown channel: ${req.channel}` };
    const payload = await withTimeout(
      Promise.resolve(handler({ sender: null }, ...(req.args ?? [])))
    );
    return { ok: true, payload };
  }

  const handlers = getSendHandlers(req.channel);
  if (!handlers?.length) return { ok: false, error: `Unknown channel: ${req.channel}` };

  // Controllers answer with event.reply(replyChannel, payload); capture the first reply.
  const reply = await withTimeout(
    new Promise<{ channel: string; payload: unknown }>((resolve, reject) => {
      const fakeEvent = {
        sender: null,
        reply: (channel: string, payload: unknown) => resolve({ channel, payload }),
      };
      try {
        handlers.forEach((h) => {
          Promise.resolve(h(fakeEvent, req.args ?? [])).catch(reject);
        });
      } catch (e) {
        reject(e);
      }
    })
  );
  return { ok: true, replyChannel: reply.channel, payload: reply.payload };
};

const readBody = (req: http.IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

const send = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

let server: http.Server | null = null;
let discovery: dgram.Socket | null = null;

export const startRpcServer = (config: NetworkConfig): Promise<void> =>
  new Promise((resolve, reject) => {
    if (server) { resolve(); return; }

    server = http.createServer(async (req, res) => {
      try {
        const auth = req.headers.authorization ?? '';
        if (!keysMatch(auth, `Bearer ${config.accessKey}`)) {
          send(res, 401, { ok: false, app: 'pharmacy', name: os.hostname(), error: 'Invalid access key' });
          return;
        }
        if (req.method === 'GET' && req.url === '/ping') {
          send(res, 200, { ok: true });
          return;
        }
        if (req.method === 'POST' && req.url === '/rpc') {
          const parsed = JSON.parse(await readBody(req)) as RpcRequest;
          send(res, 200, await dispatch(parsed));
          return;
        }
        send(res, 404, { ok: false, error: 'Not found' });
      } catch (error) {
        console.error('RPC error:', error);
        send(res, 500, { ok: false, error: String((error as Error)?.message ?? error) });
      }
    });

    server.once('error', (err) => {
      server = null;
      reject(err);
    });
    server.listen(config.port, '0.0.0.0', () => {
      console.log(`Pharmacy server listening on port ${config.port}`);
      startDiscoveryResponder(config.port);
      resolve();
    });
  });

const startDiscoveryResponder = (port: number) => {
  try {
    discovery = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    discovery.on('message', (msg, rinfo) => {
      if (msg.toString() !== DISCOVER_MESSAGE) return;
      const reply = Buffer.from(JSON.stringify({ app: 'pharmacy', name: os.hostname(), port }));
      discovery?.send(reply, rinfo.port, rinfo.address);
    });
    discovery.on('error', (e) => console.error('Discovery error:', e));
    discovery.bind(DISCOVERY_PORT);
  } catch (e) {
    console.error('Could not start discovery responder:', e);
  }
};

export const stopRpcServer = () => {
  server?.close();
  server = null;
  discovery?.close();
  discovery = null;
};

/** Non-internal IPv4 addresses, shown to the user so they can type them on clients. */
export const getLocalAddresses = (): string[] =>
  Object.values(os.networkInterfaces())
    .flat()
    .filter((i): i is os.NetworkInterfaceInfo => !!i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);

export { DISCOVER_MESSAGE };
