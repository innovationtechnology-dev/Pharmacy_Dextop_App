import crypto from 'crypto';
import { loadNetworkConfig } from './networkConfig';

/**
 * Main computer side of "Request access": another computer asks to join, someone at the
 * main computer clicks Allow or Deny, and only on Allow is the access key handed out —
 * and only to the same address that asked.
 */

export interface PairRequest {
  id: string;
  deviceName: string;
  address: string;
  createdAt: number;
  expiresAt: number;
  state: 'pending' | 'approved' | 'denied';
}

export type PairStatus =
  | { state: 'pending' }
  | { state: 'approved'; accessKey: string }
  | { state: 'denied' | 'expired' };

const REQUEST_TTL_MS = 2 * 60_000;
const MAX_PENDING = 5;

const requests = new Map<string, PairRequest>();
let onChange: (pending: PairRequest[]) => void = () => undefined;

/** Strip IPv6-mapped prefix so "::ffff:192.168.1.5" and "192.168.1.5" compare equal. */
const normalizeAddress = (address: string) => address.replace(/^::ffff:/, '');

export const listPendingPairRequests = (): PairRequest[] =>
  [...requests.values()].filter((r) => r.state === 'pending' && r.expiresAt > Date.now());

const emit = () => onChange(listPendingPairRequests());

export const setPairingListener = (fn: (pending: PairRequest[]) => void): void => {
  onChange = fn;
};

/** Returns null when too many requests are already waiting. */
export const createPairRequest = (rawName: unknown, rawAddress: string): PairRequest | null => {
  const address = normalizeAddress(rawAddress);
  const deviceName =
    String(rawName ?? '')
      .replace(/[^\w .()-]/g, '')
      .trim()
      .slice(0, 64) || 'Unknown computer';

  // One waiting request per computer: asking again replaces the old one.
  [...requests.values()]
    .filter((r) => r.address === address && r.state === 'pending')
    .forEach((r) => requests.delete(r.id));
  if (listPendingPairRequests().length >= MAX_PENDING) return null;

  const now = Date.now();
  const request: PairRequest = {
    id: crypto.randomBytes(12).toString('hex'),
    deviceName,
    address,
    createdAt: now,
    expiresAt: now + REQUEST_TTL_MS,
    state: 'pending',
  };
  requests.set(request.id, request);
  setTimeout(() => {
    if (requests.delete(request.id)) emit();
  }, REQUEST_TTL_MS + 1000);
  emit();
  return request;
};

export const getPairStatus = (id: string, rawAddress: string): PairStatus => {
  const request = requests.get(id);
  if (!request || request.address !== normalizeAddress(rawAddress)) return { state: 'expired' };
  if (request.state === 'approved') {
    // Kept until the request expires so a lost reply can be retried; only this address gets it.
    return { state: 'approved', accessKey: loadNetworkConfig().accessKey };
  }
  if (request.state === 'denied') {
    requests.delete(id);
    return { state: 'denied' };
  }
  if (request.expiresAt <= Date.now()) {
    requests.delete(id);
    return { state: 'expired' };
  }
  return { state: 'pending' };
};

/** The requesting computer gave up waiting. */
export const cancelPairRequest = (id: string, rawAddress: string): void => {
  const request = requests.get(id);
  if (request && request.address === normalizeAddress(rawAddress)) {
    requests.delete(id);
    emit();
  }
};

/** Someone at the main computer clicked Allow or Deny. */
export const respondToPairRequest = (id: string, allow: boolean): boolean => {
  const request = requests.get(id);
  if (!request || request.state !== 'pending') return false;
  request.state = allow ? 'approved' : 'denied';
  emit();
  return true;
};
