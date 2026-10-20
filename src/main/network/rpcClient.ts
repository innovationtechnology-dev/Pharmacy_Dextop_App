import http from 'http';
import dgram from 'dgram';
import os from 'os';
import crypto from 'crypto';
import { DEFAULT_PORT, DISCOVERY_PORT, NetworkConfig } from './networkConfig';
import { computeServerProof, proofsMatch } from './serverProof';
import type { RpcRequest, RpcResponse } from './rpcServer';
import { SELF_SOURCE_ID, deviceName } from './dataChanges';

const REQUEST_TIMEOUT_MS = 65_000;
/** A switched-off computer never answers the TCP handshake; fail fast instead of waiting for the OS. */
const CONNECT_TIMEOUT_MS = 5_000;

/** Tells the main computer who is asking, so it can name this computer when it changes data. */
export const originHeaders = () => ({
  'X-Device-Name': encodeURIComponent(deviceName()),
  'X-Source-Id': SELF_SOURCE_ID,
});

const timeoutError = () =>
  Object.assign(new Error('Main computer did not respond'), { code: 'ETIMEDOUT' });

const request = (
  config: Pick<NetworkConfig, 'serverHost' | 'port' | 'accessKey'>,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<RpcResponse> =>
  new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      {
        host: config.serverHost,
        port: config.port,
        path,
        method,
        timeout: timeoutMs,
        headers: {
          ...originHeaders(),
          // Never send an empty bearer; routes without a key (/hello, /pair/*) do not need one.
          ...(config.accessKey ? { Authorization: `Bearer ${config.accessKey}` } : {}),
          ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as RpcResponse;
            if (res.statusCode === 401) {
              reject(new Error('Wrong access key'));
              return;
            }
            resolve(parsed);
          } catch {
            reject(new Error('Invalid response from main computer'));
          }
        });
      }
    );
    req.on('socket', (socket) => {
      if (!socket.connecting) return;
      const t = setTimeout(() => req.destroy(timeoutError()), Math.min(CONNECT_TIMEOUT_MS, timeoutMs));
      socket.once('connect', () => clearTimeout(t));
      socket.once('close', () => clearTimeout(t));
    });
    req.on('timeout', () => req.destroy(timeoutError()));
    req.on('error', (e) => reject(e));
    if (data) req.write(data);
    req.end();
  });

export const callServer = (config: NetworkConfig, rpc: RpcRequest): Promise<RpcResponse> =>
  request(config, 'POST', '/rpc', rpc);

type Target = Pick<NetworkConfig, 'serverHost' | 'port'>;

const payloadOf = <T,>(res: RpcResponse): T => {
  if (!res.ok) throw new Error(res.error || 'Request failed');
  return res.payload as T;
};

/** Ask the main computer for access; someone there must click Allow. */
export const requestPairing = async (target: Target, deviceName: string) =>
  payloadOf<{ requestId: string; expiresAt: number }>(
    await request({ ...target, accessKey: '' }, 'POST', '/pair/request', { deviceName }, 8000)
  );

export const getPairingStatus = async (target: Target, requestId: string) =>
  payloadOf<{ state: 'pending' | 'approved' | 'denied' | 'expired'; accessKey?: string }>(
    await request({ ...target, accessKey: '' }, 'GET', `/pair/status?id=${encodeURIComponent(requestId)}`, undefined, 8000)
  );

export const cancelPairing = async (target: Target, requestId: string) => {
  await request({ ...target, accessKey: '' }, 'POST', `/pair/cancel?id=${encodeURIComponent(requestId)}`, {}, 4000);
};

/**
 * Prove the host at `target` is the main computer holding `accessKey` (and, when known, with
 * identity `expectedServerId`) — without sending the key. Resolves with the server's id.
 * Errors: 'Wrong access key' (proof fails) or code EWRONGSERVER (another main computer).
 */
export const verifyServer = async (
  target: Target,
  accessKey: string,
  expectedServerId?: string,
  timeoutMs = 4000
): Promise<string> => {
  const nonce = crypto.randomBytes(16).toString('hex');
  let res: RpcResponse;
  try {
    res = await request({ ...target, accessKey: '' }, 'GET', `/hello?nonce=${nonce}`, undefined, timeoutMs);
  } catch (error) {
    // Versions before /hello check the key first and answer 401 to it.
    if ((error as Error)?.message === 'Wrong access key') {
      throw Object.assign(
        new Error('The main computer is running an older version of the app. Update it there, then try again.'),
        { code: 'EOLDSERVER' }
      );
    }
    throw error;
  }
  const hello = res.ok ? (res.payload as { app?: string; serverId?: string; proof?: string }) : null;
  if (!hello || hello.app !== 'pharmacy' || !hello.serverId || !hello.proof) {
    throw new Error('Not a Pharmacy main computer (update the app on all computers)');
  }
  if (!proofsMatch(hello.proof, computeServerProof(accessKey, nonce, hello.serverId))) {
    throw new Error('Wrong access key');
  }
  if (expectedServerId && hello.serverId !== expectedServerId) {
    throw Object.assign(new Error('A different main computer answered at this address'), {
      code: 'EWRONGSERVER',
    });
  }
  return hello.serverId;
};

export const pingServer = (
  config: Pick<NetworkConfig, 'serverHost' | 'port' | 'accessKey'>
): Promise<RpcResponse> => request(config, 'GET', '/ping', undefined, 4000);

export interface DiscoveredServer {
  host: string;
  port: number;
  name: string;
}

const localInterfaces = () =>
  Object.values(os.networkInterfaces())
    .flat()
    .filter(
      (i): i is os.NetworkInterfaceInfo =>
        !!i && i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.')
    );

const ipToInt = (ip: string) =>
  ip.split('.').reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
const intToIp = (n: number) =>
  [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');

/** Directed broadcast per adapter: 255.255.255.255 only leaves one (often the wrong) adapter on Windows. */
const broadcastAddresses = (): string[] => {
  const set = new Set<string>(['255.255.255.255']);
  localInterfaces().forEach((i) => {
    const mask = ipToInt(i.netmask);
    set.add(intToIp((ipToInt(i.address) | ~mask) >>> 0));
  });
  return [...set];
};

const discoverByBroadcast = (timeoutMs: number): Promise<DiscoveredServer[]> =>
  new Promise((resolve) => {
    const found = new Map<string, DiscoveredServer>();
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const finish = () => {
      try { socket.close(); } catch { /* already closed */ }
      resolve([...found.values()]);
    };

    socket.on('message', (msg, rinfo) => {
      try {
        const info = JSON.parse(msg.toString());
        if (info?.app === 'pharmacy') {
          found.set(rinfo.address, { host: rinfo.address, port: info.port, name: info.name });
        }
      } catch {
        /* ignore stray packets */
      }
    });
    socket.on('error', finish);
    socket.bind(0, () => {
      socket.setBroadcast(true);
      const probe = () =>
        broadcastAddresses().forEach((addr) =>
          socket.send(Buffer.from('PHARMACY_DISCOVER'), DISCOVERY_PORT, addr, () => undefined)
        );
      // UDP can be lost; send a few times across the window.
      probe();
      setTimeout(probe, timeoutMs / 3);
      setTimeout(probe, (timeoutMs * 2) / 3);
      setTimeout(finish, timeoutMs);
    });
  });

/** Does something on host:port answer like a Pharmacy main computer? (401 without a key is expected.) */
const probeHost = (host: string, port: number): Promise<DiscoveredServer | null> =>
  new Promise((resolve) => {
    const req = http.request({ host, port, path: '/ping', method: 'GET', timeout: 700 }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          const ours = body?.app === 'pharmacy' || body?.error === 'Invalid access key';
          resolve(ours ? { host, port, name: body?.name || host } : null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
    req.end();
  });

/** Fallback when UDP is filtered (e.g. Windows Firewall): probe every host on the local subnets over TCP. */
const discoverByScan = async (port: number): Promise<DiscoveredServer[]> => {
  const targets = new Set<string>();
  localInterfaces().forEach((i) => {
    let mask = ipToInt(i.netmask);
    const ip = ipToInt(i.address);
    // Cap at a /24 so a wide mask doesn't mean thousands of probes.
    if (mask >>> 0 < 0xffffff00) mask = 0xffffff00;
    const network = (ip & mask) >>> 0;
    const broadcast = (network | ~mask) >>> 0;
    for (let n = network + 1; n < broadcast; n += 1) {
      if (n !== ip) targets.add(intToIp(n));
    }
  });

  const queue = [...targets];
  const found: DiscoveredServer[] = [];
  const worker = async () => {
    while (queue.length) {
      const host = queue.pop() as string;
      // eslint-disable-next-line no-await-in-loop
      const hit = await probeHost(host, port);
      if (hit) found.push(hit);
    }
  };
  await Promise.all(Array.from({ length: 100 }, worker));
  return found;
};

/** Find main computers on the LAN: UDP broadcast and TCP subnet scan run together, results merged. */
export const discoverServers = async (
  timeoutMs = 2500,
  port = DEFAULT_PORT
): Promise<DiscoveredServer[]> => {
  const [broadcast, scanned] = await Promise.all([
    discoverByBroadcast(timeoutMs),
    discoverByScan(port),
  ]);
  const merged = new Map<string, DiscoveredServer>();
  [...scanned, ...broadcast].forEach((s) => merged.set(s.host, s));
  return [...merged.values()];
};
