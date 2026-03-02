import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { IconBaseProps, IconType } from 'react-icons';
import { FiTrendingUp, FiTrendingDown, FiDollarSign, FiPackage, FiCreditCard, FiPieChart, FiRefreshCw, FiCalendar, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { useDashboardHeader } from './useDashboardHeader';
import { PharmacySettings, getStoredPharmacySettings } from '../../types/pharmacy';

interface FinancialData {
  purchasingTotal: number;
  sellingTotal: number;
  saleReturnsTotal: number;
  netRevenue: number;
  paymentTotal: number;
  remainingPayment: number;
  profit: number;
  trend?: Array<{ date: string; sales: number; purchases: number; profit: number }>;
}

const renderIcon = (IconComponent: IconType, className?: string) =>
  React.createElement(
    IconComponent as any,
    { className } as any
  );

const currencySymbols: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  PKR: '₨',
  INR: '₹',
};

const FinancialSummary: React.FC = () => {
  const [pharmacySettings] = useState<PharmacySettings>(() => getStoredPharmacySettings());
  // Initialize date range to current month
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const formatDateForInput = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [financialData, setFinancialData] = useState<FinancialData>({
    purchasingTotal: 0,
    sellingTotal: 0,
    saleReturnsTotal: 0,
    netRevenue: 0,
    paymentTotal: 0,
    remainingPayment: 0,
    profit: 0,
  });
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState<string>(formatDateForInput(firstDayOfMonth));
  const [toDate, setToDate] = useState<string>(formatDateForInput(lastDayOfMonth));
  const [shouldLoad, setShouldLoad] = useState(true);
  const [dateRangeExpanded, setDateRangeExpanded] = useState(false);
  const { setHeader } = useDashboardHeader();

  useEffect(() => {
    if (shouldLoad && fromDate && toDate) {
      if (new Date(fromDate) <= new Date(toDate)) {
        loadFinancialData();
      }
      setShouldLoad(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldLoad, fromDate, toDate]);

  const loadFinancialData = useCallback(async () => {
    setLoading(true);
    try {
      window.electron.ipcRenderer.once('financial-get-date-range-reply', (response: any) => {
        setLoading(false);
        if (response.success) {
          setFinancialData(response.data);
        } else {
          console.error('Error loading financial data:', response.error);
          // Set default values on error
          setFinancialData({
            purchasingTotal: 0,
            sellingTotal: 0,
            saleReturnsTotal: 0,
            netRevenue: 0,
            paymentTotal: 0,
            remainingPayment: 0,
            profit: 0,
          });
        }
      });
      window.electron.ipcRenderer.sendMessage('financial-get-date-range', [fromDate, toDate]);
    } catch (error) {
      console.error('Error loading financial data:', error);
      setLoading(false);
    }
  }, [fromDate, toDate]);

  const formatDisplayDate = (dateString: string): string => {
    const date = new Date(dateString);
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return `${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  };

  const handleDateRangeChange = () => {
    if (fromDate && toDate) {
      if (new Date(fromDate) > new Date(toDate)) {
        alert('From date cannot be after To date');
        // Reset to valid range
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        setFromDate(formatDateForInput(firstDay));
        setToDate(formatDateForInput(lastDay));
        return;
      }
      setShouldLoad(true);
    }
  };

  const setCurrentMonth = useCallback(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setFromDate(formatDateForInput(firstDay));
    setToDate(formatDateForInput(lastDay));
    setShouldLoad(true);
  }, []);

  const setCurrentYear = useCallback(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), 0, 1);
    const lastDay = new Date(now.getFullYear(), 11, 31);
    setFromDate(formatDateForInput(firstDay));
    setToDate(formatDateForInput(lastDay));
    setShouldLoad(true);
  }, []);

  const formatCurrency = (amount: number): string => {
    const currency = pharmacySettings.currency || 'USD';
    const symbol = currencySymbols[currency] || currency;
    // For INR and PKR, use Indian/Pakistani number formatting
    if (currency === 'INR' || currency === 'PKR') {
      return `${symbol}${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const StatCard: React.FC<{
    title: string;
    value: number;
    icon: IconType;
    color: string;
    bgColor: string;
    trend?: number;
  }> = ({ title, value, icon: IconComponent, color, bgColor, trend }) => {
    const TrendIcon = trend !== undefined && trend < 0 ? FiTrendingDown : FiTrendingUp;
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 sm:p-5 lg:p-6 hover:shadow-md transition-shadow border border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <div className={`p-2 sm:p-3 rounded-lg ${bgColor}`}>
            <div className={`${color} text-base sm:text-lg`}>
              {renderIcon(IconComponent, 'w-5 h-5 sm:w-6 sm:h-6')}
            </div>
          </div>
          {trend !== undefined && (
            <div className={`flex items-center gap-1 ${trend >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {renderIcon(TrendIcon, 'w-3 h-3 sm:w-4 sm:h-4')}
              <span className="text-xs sm:text-sm font-medium">{Math.abs(trend)}%</span>
            </div>
          )}
        </div>
        <h3 className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">{title}</h3>
        <p className={`text-lg sm:text-xl lg:text-2xl font-bold ${color} break-words`}>
          {formatCurrency(value)}
        </p>
      </div>
    );
  };

  const headerActions = useMemo(
    () => (
      <div className="flex flex-wrap items-center gap-2">
        {/* Removed duplicate buttons - they are in the date range section */}
      </div>
    ),
    []
  );

  useEffect(() => {
    setHeader({
      title: 'Financial Summary',
      subtitle: `${formatDisplayDate(fromDate)} - ${formatDisplayDate(toDate)}`,
      actions: headerActions,
    });

    return () => setHeader(null);
  }, [setHeader, headerActions, fromDate, toDate]);

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-700/50 dark:bg-gray-900 overflow-hidden">
      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {/* Header */}
        <div className="mb-4 sm:mb-6">

          {/* Date Range Toggle */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            {/* Toggle Header */}
            <button
              onClick={() => setDateRangeExpanded(!dateRangeExpanded)}
              className="w-full flex items-center justify-between p-4 sm:p-5 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-700/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg">
                  {renderIcon(FiCalendar, 'w-5 h-5 text-emerald-600 dark:text-emerald-400')}
                </div>
                <div className="text-left">
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Date Range</h2>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {formatDisplayDate(fromDate)} - {formatDisplayDate(toDate)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {renderIcon(
                  dateRangeExpanded ? FiChevronUp : FiChevronDown,
                  'w-5 h-5 text-gray-400'
                )}
              </div>
            </button>

            {/* Toggle Content */}
            {dateRangeExpanded && (
              <div className="border-t border-gray-200 dark:border-gray-700 p-4 sm:p-5 bg-gray-50 dark:bg-gray-700/50">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="sm:col-span-1">
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">From Date</label>
                    <input
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      onBlur={handleDateRangeChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white dark:bg-gray-800"
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">To Date</label>
                    <input
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      onBlur={handleDateRangeChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white dark:bg-gray-800"
                    />
                  </div>
                  <div className="sm:col-span-2 flex items-end gap-2">
                    <button
                      onClick={setCurrentMonth}
                      className="flex-1 px-3 py-2 text-xs sm:text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-700/50 hover:border-emerald-500 dark:hover:border-emerald-400 transition-colors font-medium"
                    >
                      This Month
                    </button>
                    <button
                      onClick={setCurrentYear}
                      className="flex-1 px-3 py-2 text-xs sm:text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-700/50 hover:border-emerald-500 dark:hover:border-emerald-400 transition-colors font-medium"
                    >
                      This Year
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-gray-600 dark:text-gray-400 text-sm sm:text-base">Loading financial data...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6 mb-4 sm:mb-6">
              <StatCard
                title="Purchasing Total"
                value={financialData.purchasingTotal}
                icon={FiPackage}
                color="text-blue-600 dark:text-blue-400"
                bgColor="bg-blue-50 dark:bg-blue-900/30"
              />
              <StatCard
                title="Gross Sales"
                value={financialData.sellingTotal}
                icon={FiDollarSign}
                color="text-emerald-600 dark:text-emerald-400"
                bgColor="bg-emerald-50 dark:bg-emerald-900/30"
              />
              <StatCard
                title="Sale Returns"
                value={financialData.saleReturnsTotal}
                icon={FiTrendingDown}
                color="text-red-600 dark:text-red-400"
                bgColor="bg-red-50 dark:bg-red-900/30"
              />
              <StatCard
                title="Net Revenue"
                value={financialData.netRevenue}
                icon={FiDollarSign}
                color="text-teal-600 dark:text-teal-400"
                bgColor="bg-teal-50 dark:bg-teal-900/30"
              />
              <StatCard
                title="Payment Total"
                value={financialData.paymentTotal}
                icon={FiCreditCard}
                color="text-purple-600 dark:text-purple-400"
                bgColor="bg-purple-50 dark:bg-purple-900/30"
              />
              <StatCard
                title="Remaining Payment"
                value={financialData.remainingPayment}
                icon={FiCreditCard}
                color="text-orange-600 dark:text-orange-400"
                bgColor="bg-orange-50 dark:bg-orange-900/30"
              />
              <div className="sm:col-span-2 lg:col-span-3">
                <StatCard
                  title="Net Profit"
                  value={financialData.profit}
                  icon={FiTrendingUp}
                  color={financialData.profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}
                  bgColor={financialData.profit >= 0 ? 'bg-green-50 dark:bg-green-900/30' : 'bg-red-50 dark:bg-red-900/30'}
                />
              </div>
            </div>

            {/* Summary Card */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 sm:p-5 lg:p-6 border border-gray-100 dark:border-gray-700 mb-4 sm:mb-6">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-3 sm:mb-4">Financial Overview</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div className="space-y-3 sm:space-y-4">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-0 pb-2 sm:pb-3 border-b border-gray-200 dark:border-gray-700">
                    <span className="text-sm sm:text-base text-gray-600 dark:text-gray-400 font-medium">Gross Sales</span>
                    <span className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(financialData.sellingTotal)}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-0 pb-2 sm:pb-3 border-b border-gray-200 dark:border-gray-700">
                    <span className="text-sm sm:text-base text-gray-600 dark:text-gray-400 font-medium">Sale Returns</span>
                    <span className="text-base sm:text-lg font-bold text-red-600 dark:text-red-400">
                      -{formatCurrency(financialData.saleReturnsTotal)}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-0 pb-2 sm:pb-3 border-b-2 border-gray-300 dark:border-gray-600">
                    <span className="text-sm sm:text-base text-gray-700 dark:text-gray-300 font-bold">Net Revenue</span>
                    <span className="text-base sm:text-lg font-bold text-teal-600 dark:text-teal-400">
                      {formatCurrency(financialData.netRevenue)}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-0 pb-2 sm:pb-3 border-b border-gray-200 dark:border-gray-700">
                    <span className="text-sm sm:text-base text-gray-600 dark:text-gray-400 font-medium">Total Purchases</span>
                    <span className="text-base sm:text-lg font-bold text-blue-600 dark:text-blue-400">
                      {formatCurrency(financialData.purchasingTotal)}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-0 pb-2 sm:pb-3 border-b border-gray-200 dark:border-gray-700">
                    <span className="text-sm sm:text-base text-gray-600 dark:text-gray-400 font-medium">Payments Received</span>
                    <span className="text-base sm:text-lg font-bold text-purple-600 dark:text-purple-400">
                      {formatCurrency(financialData.paymentTotal)}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-0 pb-2 sm:pb-3 border-b border-gray-200 dark:border-gray-700">
                    <span className="text-sm sm:text-base text-gray-600 dark:text-gray-400 font-medium">Outstanding Payments</span>
                    <span className="text-base sm:text-lg font-bold text-orange-600 dark:text-orange-400">
                      {formatCurrency(financialData.remainingPayment)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-center pt-4 sm:pt-0">
                  <div className="text-center w-full">
                    <div className="text-2xl sm:text-3xl font-bold mb-2">
                      <span className={financialData.profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                        {formatCurrency(financialData.profit)}
                      </span>
                    </div>
                    <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-3 sm:mb-4">Net Profit</div>
                    <div className="w-24 h-24 sm:w-32 sm:h-32 mx-auto rounded-full flex items-center justify-center border-4 border-gray-200 dark:border-gray-700">
                      <div className="text-center">
                        <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                          {financialData.sellingTotal > 0
                            ? Math.round((financialData.profit / financialData.sellingTotal) * 100)
                            : 0}%
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Margin</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Profit Trend Chart */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 sm:p-5 lg:p-6 border border-gray-100 dark:border-gray-700 mb-4 sm:mb-6">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-4">Profit Trend</h2>
              <div className="h-80 w-full">
                {financialData.trend && financialData.trend.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={financialData.trend}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(date) => new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        stroke="#9CA3AF"
                        tick={{ fill: '#6B7280', fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                        dy={10}
                      />
                      <YAxis
                        stroke="#9CA3AF"
                        tick={{ fill: '#6B7280', fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => formatCurrency(value)}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                        itemStyle={{ fontSize: '12px' }}
                        labelStyle={{ color: '#374151', fontWeight: 'bold', marginBottom: '4px' }}
                        labelFormatter={(date) => new Date(date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                        formatter={(value: any) => [formatCurrency(Number(value) || 0), 'Amount']}
                      />
                      <Legend wrapperStyle={{ paddingTop: '20px' }} />
                      <Line
                        type="monotone"
                        dataKey="profit"
                        name="Profit"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={{ r: 3, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="sales"
                        name="Sales"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={false}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-500">
                    No trend data available for this period
                  </div>
                )}
              </div>
            </div>

            {/* Additional Info */}
            <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-xl p-3 sm:p-4 mb-4">
              <div className="flex items-start gap-2 sm:gap-3">
                {renderIcon(
                  FiPieChart,
                  'w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0'
                )}
                <div className="text-xs sm:text-sm text-blue-800 dark:text-blue-300">
                  <p className="font-medium mb-1">Note:</p>
                  <p className="leading-relaxed">
                    Financial data is calculated based on transactions from the selected date range.
                    Purchasing total includes all purchase orders, while selling total represents
                    completed sales. Profit is calculated as Selling Total minus Purchasing Total.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default FinancialSummary;
