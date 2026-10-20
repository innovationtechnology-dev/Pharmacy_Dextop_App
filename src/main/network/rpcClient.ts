import http from 'http';
import dgram from 'dgram';
import os from 'os';
import { DEFAULT_PORT, DISCOVERY_PORT, NetworkConfig } from './networkConfig';
import type { RpcRequest, RpcResponse } from './rpcServer';

const REQUEST_TIMEOUT_MS = 65_000;
/** A switched-off computer never answers the TCP handshake; fail fast instead of waiting for the OS. */
const CONNECT_TIMEOUT_MS = 5_000;

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
          Authorization: `Bearer ${config.accessKey}`,
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
export const discoverServers = async (timeoutMs = 2500): Promise<DiscoveredServer[]> => {
  const [broadcast, scanned] = await Promise.all([
    discoverByBroadcast(timeoutMs),
    discoverByScan(DEFAULT_PORT),
  ]);
  const merged = new Map<string, DiscoveredServer>();
  [...scanned, ...broadcast].forEach((s) => merged.set(s.host, s));
  return [...merged.values()];
};
