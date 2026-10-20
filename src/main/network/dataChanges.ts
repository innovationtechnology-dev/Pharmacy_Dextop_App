import crypto from 'crypto';
import os from 'os';

/**
 * Main computer: records every successful write (from this computer or another one) and tells
 * subscribers — its own window and every other computer's live event stream — what changed.
 * Each topic carries a version number so a computer that missed events can tell it is behind.
 */

export interface ChangeOrigin {
  /** Random per running app instance; lets a computer recognise its own changes. */
  sourceId: string;
  device: string;
}

export type ChangeAction = 'created' | 'updated' | 'deleted' | 'changed';

export interface DataChange {
  entity: string;
  action: ChangeAction;
  /** Every kind of data this write affects (a sale also changes medicine stock). */
  topics: string[];
  /** Name of the record, when the request carried one. */
  label?: string;
  device: string;
  sourceId: string;
  at: number;
  /** Version of each affected topic after this change. */
  versions: Record<string, number>;
}

export interface SyncState {
  /** Changes on every start of the main computer, so versions from a previous run never match. */
  epoch: string;
  versions: Record<string, number>;
}

/** What the renderer receives: a change, or (no `change`) a catch-up after a missed stretch. */
export interface SyncEvent {
  topics: string[];
  self: boolean;
  change?: DataChange;
}

export const ALL_TOPICS = [
  'medicine',
  'sale',
  'sale-return',
  'purchase',
  'payment',
  'customer',
  'supplier',
];

interface WriteChannel {
  entity: string;
  action: ChangeAction;
  topics: string[];
}

const PURCHASE_TOPICS = ['purchase', 'medicine', 'payment', 'supplier'];
const PAYMENT_TOPICS = ['payment', 'purchase', 'supplier'];
const SALE_TOPICS = ['sale', 'medicine', 'customer'];
const SALE_RETURN_TOPICS = ['sale-return', 'sale', 'medicine'];

const WRITE_CHANNELS: Record<string, WriteChannel> = {
  'medicine-create': { entity: 'medicine', action: 'created', topics: ['medicine'] },
  'medicine-update': { entity: 'medicine', action: 'updated', topics: ['medicine'] },
  'medicine-delete': { entity: 'medicine', action: 'deleted', topics: ['medicine'] },
  'medicine-seed-sample': { entity: 'medicine', action: 'changed', topics: ['medicine'] },
  'sale-create': { entity: 'sale', action: 'created', topics: SALE_TOPICS },
  'sale-update': { entity: 'sale', action: 'updated', topics: SALE_TOPICS },
  'sale-delete': { entity: 'sale', action: 'deleted', topics: SALE_TOPICS },
  'sale-return-create': { entity: 'sale-return', action: 'created', topics: SALE_RETURN_TOPICS },
  'sale-return-delete': { entity: 'sale-return', action: 'deleted', topics: SALE_RETURN_TOPICS },
  'purchase-create': { entity: 'purchase', action: 'created', topics: PURCHASE_TOPICS },
  'purchase-update': { entity: 'purchase', action: 'updated', topics: PURCHASE_TOPICS },
  'purchase-delete': { entity: 'purchase', action: 'deleted', topics: PURCHASE_TOPICS },
  'purchase-update-payment': { entity: 'purchase', action: 'updated', topics: PURCHASE_TOPICS },
  'purchase-record-supplier-refund': { entity: 'purchase', action: 'updated', topics: PURCHASE_TOPICS },
  'payment-create': { entity: 'payment', action: 'created', topics: PAYMENT_TOPICS },
  'payment-add': { entity: 'payment', action: 'created', topics: PAYMENT_TOPICS },
  'payment-delete': { entity: 'payment', action: 'deleted', topics: PAYMENT_TOPICS },
  'customer-create': { entity: 'customer', action: 'created', topics: ['customer'] },
  'customer-update': { entity: 'customer', action: 'updated', topics: ['customer'] },
  'customer-delete': { entity: 'customer', action: 'deleted', topics: ['customer'] },
  'supplier-create': { entity: 'supplier', action: 'created', topics: ['supplier'] },
  'supplier-update': { entity: 'supplier', action: 'updated', topics: ['supplier'] },
  'supplier-delete': { entity: 'supplier', action: 'deleted', topics: ['supplier'] },
  'system-reset-all-data': { entity: 'data', action: 'changed', topics: ALL_TOPICS },
  'super-admin-restore-backup': { entity: 'data', action: 'changed', topics: ALL_TOPICS },
  'super-admin-import-database': { entity: 'data', action: 'changed', topics: ALL_TOPICS },
};

export const isWriteChannel = (channel: string) => channel in WRITE_CHANNELS;

export const SELF_SOURCE_ID = crypto.randomUUID();

export const deviceName = () => os.hostname().replace(/\.local$/, '');

export const localOrigin = (): ChangeOrigin => ({
  sourceId: SELF_SOURCE_ID,
  device: deviceName(),
});

const epoch = crypto.randomUUID();
const versions: Record<string, number> = {};
const listeners = new Set<(change: DataChange) => void>();

export const getSyncState = (): SyncState => ({ epoch, versions: { ...versions } });

export const onDataChange = (fn: (change: DataChange) => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

const LABEL_FIELDS = ['name', 'medicineName', 'customerName', 'supplierName', 'invoiceNumber'];

/** Best-effort record name from the request arguments (e.g. the medicine being created). */
const findLabel = (args: unknown[]): string | undefined => {
  for (const arg of args) {
    if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
      for (const field of LABEL_FIELDS) {
        const value = (arg as Record<string, unknown>)[field];
        if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 80);
      }
    }
  }
  return undefined;
};

/** Call after a write handler finished; ignored for reads and failed writes. */
export const recordChange = (
  channel: string,
  args: unknown[],
  result: unknown,
  origin: ChangeOrigin
): void => {
  const write = WRITE_CHANNELS[channel];
  if (!write) return;
  if ((result as { success?: boolean } | null)?.success === false) return;

  const changed: Record<string, number> = {};
  write.topics.forEach((topic) => {
    versions[topic] = (versions[topic] ?? 0) + 1;
    changed[topic] = versions[topic];
  });

  const change: DataChange = {
    entity: write.entity,
    action: write.action,
    topics: write.topics,
    label: findLabel(args),
    device: origin.device,
    sourceId: origin.sourceId,
    at: Date.now(),
    versions: changed,
  };
  listeners.forEach((fn) => {
    try {
      fn(change);
    } catch (error) {
      console.error('Data change listener failed:', error);
    }
  });
};
