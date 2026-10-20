import React, { useEffect } from 'react';
import { FiMonitor } from 'react-icons/fi';
import type { DataChange } from 'main/network/dataChanges';
import { ToastContainer, useToast } from './Toast';
import { onRemoteChange } from '../../hooks/useDataSync';

const ENTITY_NAMES: Record<string, string> = {
  medicine: 'medicine',
  sale: 'sale',
  'sale-return': 'sale return',
  purchase: 'purchase',
  payment: 'payment',
  customer: 'customer',
  supplier: 'supplier',
};

const VERBS: Record<DataChange['action'], string> = {
  created: 'added',
  updated: 'updated',
  deleted: 'deleted',
  changed: 'changed',
};

const describe = (change: DataChange): React.ReactNode => {
  if (change.entity === 'data') return 'replaced the pharmacy data';
  const entity = ENTITY_NAMES[change.entity] ?? change.entity;
  if (change.action === 'changed') return `changed ${entity} records`;
  const verb = VERBS[change.action];
  if (change.label) {
    return (
      <>
        {verb} {entity} <span className="font-semibold">“{change.label}”</span>
      </>
    );
  }
  return `${verb} a ${entity}`;
};

/** Announces changes made on another computer to data shown on the open screen. */
const RemoteChangeNotifier: React.FC = () => {
  const { toasts, removeToast, info } = useToast();

  useEffect(
    () =>
      onRemoteChange((change) =>
        info(
          <span className="flex items-start gap-2">
            <FiMonitor className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              <span className="font-semibold">{change.device}</span>{' '}
              {describe(change)}. The list has been updated.
            </span>
          </span>,
          4000
        )
      ),
    [info]
  );

  return <ToastContainer toasts={toasts} onClose={removeToast} />;
};

export default RemoteChangeNotifier;
