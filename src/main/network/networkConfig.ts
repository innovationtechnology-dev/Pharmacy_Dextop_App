import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { app } from 'electron';

export type NetworkRole = 'unset' | 'server' | 'client';

export interface NetworkConfig {
  role: NetworkRole;
  /** Port the main computer listens on (server) or connects to (client). */
  port: number;
  /** Key in use: the main computer's own key (server) or the key it gave us (client). */
  accessKey: string;
  /** Client only: host/IP of the main computer. */
  serverHost: string;
  /** Client only: identity of the main computer we paired with (see /hello). */
  serverId: string;
  /**
   * This computer's own identity and key for when it is the main computer. Kept apart from
   * accessKey so a laptop that was a client never becomes a main computer holding another
   * main computer's key (its old clients would then silently switch to it).
   */
  ownServerId: string;
  ownKey: string;
}

export const DEFAULT_PORT = 3737;
export const DISCOVERY_PORT = 41234;

const defaults = (): NetworkConfig => ({
  role: 'unset',
  port: DEFAULT_PORT,
  accessKey: '',
  serverHost: '',
  serverId: '',
  ownServerId: '',
  ownKey: '',
});

const configPath = () => path.join(app.getPath('userData'), 'network-config.json');

/** 128-bit key. Normally delivered by "Request access"; shown grouped (XXXX-XXXX-…) for typing. */
export const generateAccessKey = (): string =>
  crypto.randomBytes(16).toString('hex').toUpperCase();

export const generateServerId = (): string => crypto.randomBytes(16).toString('hex');

/** Keys may be typed with dashes, spaces or lowercase. */
export const normalizeAccessKey = (key: string): string =>
  key.replace(/[^0-9a-f]/gi, '').toUpperCase();

let cached: NetworkConfig | null = null;

export const loadNetworkConfig = (): NetworkConfig => {
  if (cached) return cached;
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    cached = { ...defaults(), ...raw };
    // Older configs: a main computer's key lived only in accessKey.
    if (cached && cached.role === 'server' && !cached.ownKey && cached.accessKey) {
      cached.ownKey = cached.accessKey;
    }
  } catch {
    cached = defaults();
  }
  return cached as NetworkConfig;
};

export const saveNetworkConfig = (patch: Partial<NetworkConfig>): NetworkConfig => {
  cached = { ...loadNetworkConfig(), ...patch };
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(cached, null, 2));
  return cached;
};

/**
 * Become (or keep being) the main computer with this computer's own identity. A computer that
 * never was a main computer gets a fresh key and id — never the key it used as a client.
 */
export const ensureServerIdentity = (): NetworkConfig => {
  const c = loadNetworkConfig();
  // Keys from before 128-bit keys (8 hex chars) are replaced: /hello publishes an HMAC of the
  // key, and a short key could be brute-forced offline from it. Clients re-pair via Request access.
  const ownKey = c.ownKey && c.ownKey.length >= 32 ? c.ownKey : generateAccessKey();
  const ownServerId = c.ownServerId || generateServerId();
  if (c.role === 'server' && c.accessKey === ownKey && c.ownServerId === ownServerId) return c;
  return saveNetworkConfig({ role: 'server', ownKey, ownServerId, accessKey: ownKey });
};
