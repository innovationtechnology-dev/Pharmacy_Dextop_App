import os from 'os';
import { loadNetworkConfig, saveNetworkConfig } from './networkConfig';
import { discoverServers, pingServer } from './rpcClient';

/**
 * Client mode: keeps checking the main computer so the UI can say *why* it is unreachable
 * (turned off, app closed, key changed, no WiFi) instead of every screen failing on its own.
 */

export type ConnectionProblem = 'unreachable' | 'app-closed' | 'wrong-key' | 'no-network';

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
let checking: Promise<ConnectionStatus> | null = null;
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
  if (!hasLocalNetwork()) return 'no-network';
  // Port closed on a live host: the computer is on but the Pharmacy app is not running.
  if (e?.code === 'ECONNREFUSED') return 'app-closed';
  return 'unreachable';
};

/** Look for the main computer at a new address; adopt it only if it accepts our access key. */
const rediscover = async (): Promise<string | null> => {
  lastRediscoverAt = Date.now();
  const cfg = loadNetworkConfig();
  const found = await discoverServers();
  for (const server of found) {
    if (server.host === cfg.serverHost) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      await pingServer({ serverHost: server.host, port: server.port, accessKey: cfg.accessKey });
      saveNetworkConfig({ serverHost: server.host, port: server.port });
      return server.host;
    } catch {
      // another pharmacy or a different key — not ours
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

const runCheck = async (): Promise<ConnectionStatus> => {
  const cfg = loadNetworkConfig();
  try {
    await pingServer(cfg);
    setStatus({ online: true, serverHost: cfg.serverHost, lastOnlineAt: Date.now() });
  } catch (error) {
    const problem = classify(error);
    const canMove = problem === 'unreachable' || problem === 'app-closed';
    if (canMove && Date.now() - lastRediscoverAt >= REDISCOVER_INTERVAL_MS) {
      const movedTo = await rediscover();
      if (movedTo) {
        console.log(`[network] Main computer moved ${cfg.serverHost} -> ${movedTo}`);
        setStatus({ online: true, serverHost: movedTo, lastOnlineAt: Date.now(), movedFrom: cfg.serverHost });
        return status as ConnectionStatus;
      }
    }
    setStatus({ online: false, problem, serverHost: cfg.serverHost, lastOnlineAt: status?.lastOnlineAt });
  }
  return status as ConnectionStatus;
};

const schedule = (gen: number) => {
  if (!running || gen !== generation) return;
  timer = setTimeout(async () => {
    await checkNow();
    schedule(gen);
  }, CHECK_INTERVAL_MS);
};

/** Run a check now (concurrent callers share one in-flight check). */
export const checkNow = (): Promise<ConnectionStatus> => {
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
