import http from 'http';
import { loadNetworkConfig } from './networkConfig';
import { originHeaders } from './rpcClient';
import { DataChange, SELF_SOURCE_ID, SyncEvent, SyncState } from './dataChanges';

/**
 * Other computer: keeps one Server-Sent Events connection open to the main computer and
 * forwards every data change to the window. Reconnects on its own; on reconnect the main
 * computer's versions show what was missed while the connection was down.
 */

const RETRY_MS = 3_000;
/** The main computer sends a heartbeat every 20s; this much silence means the link is dead. */
const IDLE_TIMEOUT_MS = 45_000;

let running = false;
/** Bumped on every start/stop so a connection from a previous start cannot reconnect. */
let generation = 0;
let request: http.ClientRequest | null = null;
let retryTimer: NodeJS.Timeout | null = null;
let known: SyncState | null = null;
let emit: (event: SyncEvent) => void = () => undefined;

/** Topics whose version differs between what we last saw and what the main computer has now. */
const missedTopics = (prev: SyncState, next: SyncState): string[] => {
  const keys = new Set([...Object.keys(prev.versions), ...Object.keys(next.versions)]);
  if (prev.epoch !== next.epoch) return [...keys];
  return [...keys].filter((k) => (prev.versions[k] ?? 0) !== (next.versions[k] ?? 0));
};

const handleEvent = (event: string, data: string) => {
  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    return;
  }
  if (event === 'hello') {
    const state = payload as SyncState;
    // First connection: the screens just loaded fresh data. Later ones: catch up on gaps.
    const missed = known ? missedTopics(known, state) : [];
    known = { epoch: state.epoch, versions: { ...state.versions } };
    if (missed.length) emit({ topics: missed, self: false });
    return;
  }
  if (event === 'change') {
    const change = payload as DataChange;
    if (known) Object.assign(known.versions, change.versions);
    emit({ topics: change.topics, self: change.sourceId === SELF_SOURCE_ID, change });
  }
};

const connect = (gen: number) => {
  const cfg = loadNetworkConfig();
  if (gen !== generation || cfg.role !== 'client' || !cfg.serverHost) return;

  const req = http.get({
    host: cfg.serverHost,
    port: cfg.port,
    path: '/events',
    headers: { ...originHeaders(), Authorization: `Bearer ${cfg.accessKey}` },
  });
  request = req;
  // Covers both a computer that never answers and a stream that went silent.
  req.setTimeout(IDLE_TIMEOUT_MS, () => req.destroy());

  req.on('response', (res) => {
    if (res.statusCode !== 200) {
      res.resume();
      req.destroy();
      return;
    }
    res.setEncoding('utf8');
    let buffer = '';
    res.on('data', (chunk: string) => {
      buffer += chunk.replace(/\r\n/g, '\n');
      let end = buffer.indexOf('\n\n');
      while (end >= 0) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        let event = 'message';
        const data: string[] = [];
        block.split('\n').forEach((line) => {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) data.push(line.slice(5).trim());
        });
        if (data.length) handleEvent(event, data.join('\n'));
        end = buffer.indexOf('\n\n');
      }
    });
    res.on('error', () => req.destroy());
  });

  req.on('error', () => undefined); // 'close' follows and schedules the retry
  req.on('close', () => {
    if (request === req) request = null;
    if (!running || gen !== generation) return;
    retryTimer = setTimeout(() => connect(gen), RETRY_MS);
  });
};

export const startDataSync = (onEvent: (event: SyncEvent) => void): void => {
  stopDataSync();
  emit = onEvent;
  running = true;
  connect(generation);
};

export const stopDataSync = (): void => {
  running = false;
  generation += 1;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  request?.destroy();
  request = null;
  known = null;
};
