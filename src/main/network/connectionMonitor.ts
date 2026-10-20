import os from 'os';
import { loadNetworkConfig, saveNetworkConfig } from './networkConfig';
import { discoverServers, verifyServer } from './rpcClient';

/**
 * Client mode: keeps checking the main computer so the UI can say *why* it is unreachable
 * (turned off, app closed, key changed, no WiFi) instead of every screen failing on its own.
 */

export type ConnectionProblem =
  | 'unreachable'
  | 'app-closed'
  | 'wrong-key'
  | 'other-server'
  | 'old-version'
  | 'no-network';

export interface ConnectionStatus {
  online: boolean;
  problem?: ConnectionProblem;
  serverHost: string;
  /** Epoch ms of the last successful contact, if any. */
  lastOnlineAt?: number;
  /** Set once when the main computer was found again at a new address. */
  movedFrom?: string;
}

const CHECK_INTERVAL_MS = 5_000;
/** IP of the main computer may change (DHCP); search the LAN at most this often while offline. */
const REDISCOVER_INTERVAL_MS = 30_000;

let timer: NodeJS.Timeout | null = null;
let running = false;
/** Bumped on every start/stop so a loop from a previous start cannot keep rescheduling. */
let generation = 0;
let checking: Promise<ConnectionStatus | null> | null = null;
let lastRediscoverAt = 0;
let status: ConnectionStatus | null = null;
let notify: (s: ConnectionStatus) => void = () => undefined;

const hasLocalNetwork = () =>
  Object.values(os.networkInterfaces())
    .flat()
    .some((i) => !!i && i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.'));

const classify = (error: unknown): ConnectionProblem => {
  const e = error as NodeJS.ErrnoException;
  if (e?.message === 'Wrong access key') return 'wrong-key';
  if (e?.code === 'EWRONGSERVER') return 'other-server';
  if (e?.code === 'EOLDSERVER') return 'old-version';
  if (!hasLocalNetwork()) return 'no-network';
  // Port closed on a live host: the computer is on but the Pharmacy app is not running.
  if (e?.code === 'ECONNREFUSED') return 'app-closed';
  return 'unreachable';
};

/**
 * Look for the main computer at a new address. A host is adopted only if it proves it holds our
 * key and (when known) has our main computer's identity — the key itself is never sent to it.
 */
const rediscover = async (gen: number): Promise<{ host: string; port: number } | null> => {
  lastRediscoverAt = Date.now();
  const cfg = loadNetworkConfig();
  const found = await discoverServers(2500, cfg.port);
  for (const server of found) {
    if (server.host === cfg.serverHost || gen !== generation) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      await verifyServer({ serverHost: server.host, port: server.port }, cfg.accessKey, cfg.serverId || undefined);
      return { host: server.host, port: server.port };
    } catch {
      // another pharmacy, another main computer, or not ours
    }
  }
  return null;
};

const setStatus = (next: ConnectionStatus) => {
  const changed =
    !status ||
    status.online !== next.online ||
    status.problem !== next.problem ||
    status.serverHost !== next.serverHost ||
    !!next.movedFrom;
  status = next;
  if (changed) notify(next);
};

const runCheck = async (): Promise<ConnectionStatus | null> => {
  // A check still running after stop/restart (e.g. "Change role") must not save or report.
  const gen = generation;
  const cfg = loadNetworkConfig();
  try {
    const serverId = await verifyServer(cfg, cfg.accessKey, cfg.serverId || undefined);
    if (gen !== generation) return status;
    // Older pairings did not record the identity; remember it on first verified contact.
    if (!cfg.serverId) saveNetworkConfig({ serverId });
    setStatus({ online: true, serverHost: cfg.serverHost, lastOnlineAt: Date.now() });
  } catch (error) {
    if (gen !== generation) return status;
    const problem = classify(error);
    const canMove = problem === 'unreachable' || problem === 'app-closed' || problem === 'other-server';
    if (canMove && Date.now() - lastRediscoverAt >= REDISCOVER_INTERVAL_MS) {
      const moved = await rediscover(gen);
      if (gen !== generation) return status;
      if (moved) {
        console.log(`[network] Main computer moved ${cfg.serverHost} -> ${moved.host}`);
        saveNetworkConfig({ serverHost: moved.host, port: moved.port });
        setStatus({ online: true, serverHost: moved.host, lastOnlineAt: Date.now(), movedFrom: cfg.serverHost });
        return status;
      }
    }
    setStatus({ online: false, problem, serverHost: cfg.serverHost, lastOnlineAt: status?.lastOnlineAt });
  }
  return status;
};

const schedule = (gen: number) => {
  if (!running || gen !== generation) return;
  timer = setTimeout(async () => {
    await checkNow();
    schedule(gen);
  }, CHECK_INTERVAL_MS);
};

/** Run a check now (concurrent callers share one in-flight check). */
export const checkNow = (): Promise<ConnectionStatus | null> => {
  if (!checking) {
    checking = runCheck().finally(() => {
      checking = null;
    });
  }
  return checking;
};

export const getConnectionStatus = (): ConnectionStatus | null => status;

export const startConnectionMonitor = (onChange: (s: ConnectionStatus) => void): void => {
  stopConnectionMonitor();
  notify = onChange;
  running = true;
  lastRediscoverAt = 0;
  const gen = generation;
  void checkNow().then(() => schedule(gen));
};

export const stopConnectionMonitor = (): void => {
  running = false;
  generation += 1;
  if (timer) clearTimeout(timer);
  timer = null;
  status = null;
};
