'use client';

import React, { useEffect, useMemo } from 'react';
import { FiAlertTriangle, FiClock, FiRefreshCw } from 'react-icons/fi';
import { useDashboardHeader } from './useDashboardHeader';

const Alerts: React.FC = () => {
  const { setHeader, expiringAlerts, refreshExpiringAlerts, alertThresholdDays } =
    useDashboardHeader();

  const headerActions = useMemo(
    () => (
      <button
        onClick={refreshExpiringAlerts}
        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-emerald-600 dark:bg-emerald-500 rounded-lg shadow hover:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors"
      >
        <FiRefreshCw className="w-4 h-4" />
        Refresh
      </button>
    ),
    [refreshExpiringAlerts]
  );

  useEffect(() => {
    setHeader({
      title: 'Alerts Center',
      subtitle: `Tracking medicines expiring within ${alertThresholdDays} days`,
      actions: headerActions,
    });
    return () => setHeader(null);
  }, [setHeader, alertThresholdDays, headerActions]);

  const sortedAlerts = useMemo(() => {
    return [...expiringAlerts].sort(
      (a, b) =>
        new Date(a.nextExpiryDate).getTime() - new Date(b.nextExpiryDate).getTime()
    );
  }, [expiringAlerts]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-3 sm:p-4 lg:p-6 space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              Expiring within {alertThresholdDays} days
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {sortedAlerts.length > 0
                ? `${sortedAlerts.length} medicine${sortedAlerts.length > 1 ? 's' : ''} require attention.`
                : 'No expiring medicines detected right now.'}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <FiAlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400" />
            Alerts update automatically every minute
          </div>
        </div>
      </div>

      {sortedAlerts.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-8 text-center text-gray-600 dark:text-gray-400">
          <FiClock className="w-10 h-10 mx-auto mb-3 text-gray-400 dark:text-gray-600" />
          <p className="text-sm font-semibold">All clear!</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            We'll notify you here when any stock is about to expire.
          </p>
          <button
            onClick={refreshExpiringAlerts}
            className="mt-4 inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors"
          >
            <FiRefreshCw className="w-4 h-4" />
            Refresh now
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedAlerts.map((alert) => (
            <div
              key={alert.id}
              className="bg-white dark:bg-gray-800 rounded-xl border border-amber-200 dark:border-amber-800 shadow-sm p-4 sm:p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                  <FiAlertTriangle className="w-5 h-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{alert.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Barcode: <span className="font-mono">{alert.barcode || '—'}</span>
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Quantity at risk: {alert.availablePills.toLocaleString()} pills
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Expiry date</p>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {new Date(alert.nextExpiryDate).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-gray-500 dark:text-gray-400">Days remaining</p>
                  <p className="font-semibold text-amber-600 dark:text-amber-400">
                    {Math.max(alert.daysUntilExpiry, 0)} days
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Alerts;

