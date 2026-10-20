import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { app } from 'electron';

export type NetworkRole = 'unset' | 'server' | 'client';

export interface NetworkConfig {
  role: NetworkRole;
  /** Port the main computer listens on (server) or connects to (client). */
  port: number;
  /** Pairing key. Generated on the main computer, typed into the clients. */
  accessKey: string;
  /** Client only: host/IP of the main computer. */
  serverHost: string;
}

export const DEFAULT_PORT = 3737;
export const DISCOVERY_PORT = 41234;

const defaults = (): NetworkConfig => ({
  role: 'unset',
  port: DEFAULT_PORT,
  accessKey: '',
  serverHost: '',
});

const configPath = () => path.join(app.getPath('userData'), 'network-config.json');

export const generateAccessKey = (): string =>
  crypto.randomBytes(4).toString('hex').toUpperCase();

let cached: NetworkConfig | null = null;

export const loadNetworkConfig = (): NetworkConfig => {
  if (cached) return cached;
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    cached = { ...defaults(), ...raw };
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
