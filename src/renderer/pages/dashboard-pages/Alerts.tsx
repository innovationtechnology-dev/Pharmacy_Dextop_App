import React, { useEffect, useMemo, useState } from 'react';
import { FiAlertTriangle, FiClock, FiRefreshCw, FiPackage } from 'react-icons/fi';
import { useDashboardHeader } from './useDashboardHeader';

const Alerts: React.FC = () => {
  const {
    setHeader,
    expiringAlerts,
    refreshExpiringAlerts,
    alertThresholdDays,
    lowStockAlerts,
    refreshLowStockAlerts,
    lowStockAlertsEnabled,
  } = useDashboardHeader();

  const [activeTab, setActiveTab] = useState<'expiry' | 'lowstock'>('expiry');

  const handleRefresh = () => {
    refreshExpiringAlerts();
    refreshLowStockAlerts();
  };

  const headerActions = useMemo(
    () => (
      <button
        onClick={handleRefresh}
        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-emerald-600 dark:bg-emerald-500 rounded-lg shadow hover:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors"
      >
        <FiRefreshCw className="w-4 h-4" />
        Refresh
      </button>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refreshExpiringAlerts, refreshLowStockAlerts]
  );

  useEffect(() => {
    setHeader({
      title: 'Alerts Center',
      subtitle: `Expiry within ${alertThresholdDays} days · Low stock tracking`,
      actions: headerActions,
    });
    return () => setHeader(null);
  }, [setHeader, alertThresholdDays, headerActions]);

  const sortedExpiryAlerts = useMemo(
    () =>
      [...expiringAlerts].sort(
        (a, b) =>
          new Date(a.nextExpiryDate).getTime() - new Date(b.nextExpiryDate).getTime()
      ),
    [expiringAlerts]
  );

  const sortedLowStockAlerts = useMemo(
    () => [...lowStockAlerts].sort((a, b) => b.deficit - a.deficit),
    [lowStockAlerts]
  );

  const totalAlerts =
    sortedExpiryAlerts.length +
    (lowStockAlertsEnabled ? sortedLowStockAlerts.length : 0);

  return (
    <div className="flex flex-col h-auto md:h-[calc(100vh-80px)] w-full bg-gradient-to-br from-gray-50 via-gray-50 to-gray-100/50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800/80 overflow-visible md:overflow-hidden px-4 pb-4 md:pb-0">
      {/* Stats Header */}
      <div className="bg-gradient-to-br from-white via-white to-gray-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-gray-800/90 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-3 mb-3 flex flex-wrap items-center gap-3 mt-2">
        <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1.5 rounded-md border border-amber-200 dark:border-amber-600/50 shadow-sm">
          <FiAlertTriangle className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
            Active Alerts
          </span>
          <span className="text-xs font-bold text-amber-600 dark:text-amber-400 ml-1">
            {totalAlerts}
          </span>
        </div>

        <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1.5 rounded-md border border-blue-200 dark:border-blue-600/50 shadow-sm">
          <FiClock className="w-3.5 h-3.5 text-blue-500" />
          <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
            Expiry Threshold
          </span>
          <span className="text-xs font-bold text-blue-600 dark:text-blue-400 ml-1">
            {alertThresholdDays} Days
          </span>
        </div>

        {lowStockAlertsEnabled && (
          <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-900/20 px-2.5 py-1.5 rounded-md border border-red-200 dark:border-red-600/50 shadow-sm">
            <FiPackage className="w-3.5 h-3.5 text-red-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              Low Stock
            </span>
            <span className="text-xs font-bold text-red-600 dark:text-red-400 ml-1">
              {sortedLowStockAlerts.length}
            </span>
          </div>
        )}

        <div className="hidden sm:flex items-center gap-2 text-[10px] text-gray-400 dark:text-gray-500 italic ml-2">
          <FiRefreshCw className="w-2.5 h-2.5 animate-pulse" />
          Updates automatically
        </div>

        <button
          onClick={handleRefresh}
          className="ml-auto px-3 py-1.5 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-xs font-semibold rounded-md transition-colors uppercase tracking-wide flex items-center gap-1.5 shadow-sm"
        >
          <FiRefreshCw className="w-3.5 h-3.5" />
          Refresh Now
        </button>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 mb-3">
        <button
          onClick={() => setActiveTab('expiry')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide transition-colors ${
            activeTab === 'expiry'
              ? 'bg-amber-500 text-white shadow'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-amber-50 dark:hover:bg-amber-900/20'
          }`}
        >
          <FiAlertTriangle className="w-3.5 h-3.5" />
          Near Expiry
          {sortedExpiryAlerts.length > 0 && (
            <span
              className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'expiry'
                  ? 'bg-white/20 text-white'
                  : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
              }`}
            >
              {sortedExpiryAlerts.length}
            </span>
          )}
        </button>

        {lowStockAlertsEnabled && (
          <button
            onClick={() => setActiveTab('lowstock')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide transition-colors ${
              activeTab === 'lowstock'
                ? 'bg-red-500 text-white shadow'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-red-50 dark:hover:bg-red-900/20'
            }`}
          >
            <FiPackage className="w-3.5 h-3.5" />
            Low Stock
            {sortedLowStockAlerts.length > 0 && (
              <span
                className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  activeTab === 'lowstock'
                    ? 'bg-white/20 text-white'
                    : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                }`}
              >
                {sortedLowStockAlerts.length}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md overflow-hidden flex flex-col mb-4 md:mb-0">
        {/* Section Header */}
        <div
          className={`px-4 py-3 border-b border-blue-200/50 dark:border-blue-800/30 flex-shrink-0 ${
            activeTab === 'expiry'
              ? 'bg-gradient-to-r from-amber-50 to-amber-100/50 dark:from-amber-900/20 dark:to-amber-800/10'
              : 'bg-gradient-to-r from-red-50 to-red-100/50 dark:from-red-900/20 dark:to-red-800/10'
          }`}
        >
          <h3 className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide flex items-center gap-2">
            {activeTab === 'expiry' ? (
              <>
                <FiAlertTriangle className="text-amber-500 w-3.5 h-3.5" />
                Medicines Near Expiry
              </>
            ) : (
              <>
                <FiPackage className="text-red-500 w-3.5 h-3.5" />
                Medicines Below Minimum Stock Level
              </>
            )}
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* EXPIRY TAB */}
          {activeTab === 'expiry' &&
            (sortedExpiryAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-900/20 rounded-full flex items-center justify-center mb-4">
                  <FiClock className="w-8 h-8 text-emerald-500" />
                </div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">
                  All clear!
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-[250px]">
                  No medicines are currently reaching the expiry threshold.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedExpiryAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="group relative bg-white dark:bg-gray-800/50 rounded-xl border border-amber-100 dark:border-amber-900/30 p-4 hover:shadow-md hover:border-amber-300 dark:hover:border-amber-700 transition-all duration-200"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 group-hover:bg-amber-100 dark:group-hover:bg-amber-900/50 transition-colors">
                        <FiAlertTriangle className="w-4 h-4 text-amber-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate mb-0.5">
                          {alert.name}
                        </h4>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider mb-2">
                          Barcode: {alert.barcode || 'N/A'}
                        </p>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-500 dark:text-gray-400 font-medium">
                              Stock at risk
                            </span>
                            <span className="font-bold text-gray-700 dark:text-gray-200">
                              {alert.availablePills.toLocaleString()} Pills
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-500 dark:text-gray-400 font-medium text-[11px]">
                              Expiry Date
                            </span>
                            <span className="font-bold text-red-600 dark:text-red-400 underline decoration-red-200 dark:decoration-red-900/50 underline-offset-2">
                              {new Date(alert.nextExpiryDate).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/50 flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                          <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                            {Math.max(alert.daysUntilExpiry, 0)} Days Remaining
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}

          {/* LOW STOCK TAB */}
          {activeTab === 'lowstock' &&
            (sortedLowStockAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-900/20 rounded-full flex items-center justify-center mb-4">
                  <FiPackage className="w-8 h-8 text-emerald-500" />
                </div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">
                  Stock levels OK!
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-[250px]">
                  All medicines with a minimum stock level set are sufficiently stocked.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedLowStockAlerts.map((alert) => {
                  const pct =
                    alert.minimumStockLevel > 0
                      ? Math.min(
                          100,
                          Math.round(
                            (alert.sellablePills / alert.minimumStockLevel) * 100
                          )
                        )
                      : 0;
                  return (
                    <div
                      key={alert.id}
                      className="group relative bg-white dark:bg-gray-800/50 rounded-xl border border-red-100 dark:border-red-900/30 p-4 hover:shadow-md hover:border-red-300 dark:hover:border-red-700 transition-all duration-200"
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/30 group-hover:bg-red-100 dark:group-hover:bg-red-900/50 transition-colors">
                          <FiPackage className="w-4 h-4 text-red-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate mb-0.5">
                            {alert.name}
                          </h4>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider mb-2">
                            Barcode: {alert.barcode || 'N/A'}
                          </p>
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-gray-500 dark:text-gray-400 font-medium">
                                Current Stock
                              </span>
                              <span className="font-bold text-red-600 dark:text-red-400">
                                {alert.sellablePills.toLocaleString()} Pills
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-gray-500 dark:text-gray-400 font-medium">
                                Min. Required
                              </span>
                              <span className="font-bold text-gray-700 dark:text-gray-200">
                                {alert.minimumStockLevel.toLocaleString()} Pills
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-gray-500 dark:text-gray-400 font-medium">
                                Deficit
                              </span>
                              <span className="font-bold text-red-600 dark:text-red-400">
                                -{alert.deficit.toLocaleString()} Pills
                              </span>
                            </div>
                          </div>
                          {/* Stock progress bar */}
                          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/50">
                            <div className="flex justify-between text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1">
                              <span>Stock Level</span>
                              <span>{pct}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-red-500 to-red-400 rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default Alerts;
