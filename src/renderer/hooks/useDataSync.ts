import { useEffect, useRef } from 'react';
import type { DataChange, SyncEvent } from 'main/network/dataChanges';

/**
 * Live updates: screens register the kinds of data they show and reload when the main computer
 * reports a change to them. A change made on another computer is also announced (see
 * RemoteChangeNotifier) — but only while a screen showing that data is open.
 */

export type DataTopic =
  | 'medicine'
  | 'sale'
  | 'sale-return'
  | 'purchase'
  | 'payment'
  | 'customer'
  | 'supplier';

interface Subscription {
  topics: string[];
  refresh: () => void;
  notify: boolean;
}

const RELOAD_DEBOUNCE_MS = 250;

const subscriptions = new Set<Subscription>();
const remoteChangeListeners = new Set<(change: DataChange) => void>();
let installed = false;

const install = () => {
  if (installed || !window.electron?.dataSync) return;
  installed = true;
  window.electron.dataSync.onChange((event: SyncEvent) => {
    const matched = [...subscriptions].filter((s) =>
      s.topics.some((t) => event.topics.includes(t))
    );
    matched.forEach((s) => s.refresh());
    const { change } = event;
    if (change && !event.self && matched.some((s) => s.notify)) {
      remoteChangeListeners.forEach((fn) => fn(change));
    }
  });
};

/**
 * Reload when any of `topics` changes. `notify: false` reloads silently — for always-mounted
 * parts like header counters, so they do not announce changes for screens that are not open.
 */
export const useDataSync = (
  topics: DataTopic[],
  refresh: () => void,
  { notify = true }: { notify?: boolean } = {}
) => {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const key = topics.join(',');

  useEffect(() => {
    install();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const subscription: Subscription = {
      topics: key.split(','),
      notify,
      // Several changes in a row (e.g. a purchase with many items) cause one reload.
      refresh: () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => refreshRef.current(), RELOAD_DEBOUNCE_MS);
      },
    };
    subscriptions.add(subscription);
    return () => {
      if (timer) clearTimeout(timer);
      subscriptions.delete(subscription);
    };
  }, [key, notify]);
};

/** Changes made on another computer to data an open screen is showing. */
export const onRemoteChange = (fn: (change: DataChange) => void) => {
  install();
  remoteChangeListeners.add(fn);
  return () => {
    remoteChangeListeners.delete(fn);
  };
};
