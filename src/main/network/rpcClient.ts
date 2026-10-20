import http from 'http';
import dgram from 'dgram';
import { DISCOVERY_PORT, NetworkConfig } from './networkConfig';
import type { RpcRequest, RpcResponse } from './rpcServer';

const REQUEST_TIMEOUT_MS = 65_000;

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
    req.on('timeout', () => req.destroy(new Error('Main computer did not respond')));
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

/** Broadcast on the LAN and collect main computers that answer within the timeout. */
export const discoverServers = (timeoutMs = 2000): Promise<DiscoveredServer[]> =>
  new Promise((resolve) => {
    const found = new Map<string, DiscoveredServer>();
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

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
    socket.on('error', () => {
      socket.close();
      resolve([...found.values()]);
    });
    socket.bind(0, () => {
      socket.setBroadcast(true);
      socket.send(Buffer.from('PHARMACY_DISCOVER'), DISCOVERY_PORT, '255.255.255.255');
      setTimeout(() => {
        try { socket.close(); } catch { /* already closed */ }
        resolve([...found.values()]);
      }, timeoutMs);
    });
  });
