'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Cell,
} from 'recharts';
import {
  FiTrendingUp,
  FiUsers,
  FiDollarSign,
  FiShoppingBag,
  FiPackage,
  FiRefreshCw,
  FiAlertTriangle,
  FiTrash2,
} from 'react-icons/fi';
import WelcomeNotification from '../../components/WelcomeNotification';
import { invokeIpc } from '../../utils/ipcHelpers';
import { useDashboardHeader } from './useDashboardHeader';
import { PharmacySettings, getStoredPharmacySettings } from '../../types/pharmacy';
import { currencySymbols, getCurrencySymbol as getSymbol } from '../../../common/currency';

type SaleItemSummary = {
  medicineId: number;
  medicineName: string;
  pills: number;
  unitPrice: number;
  total: number;
};

type SaleRecord = {
  id: number;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  customerName?: string;
  customerPhone?: string;
  createdAt?: string;
  items: SaleItemSummary[];
};

type PurchaseRecord = {
  id: number;
  supplierName?: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  createdAt?: string;
};

type MedicineRecord = {
  id: number;
  name: string;
  barcode?: string;
  pillQuantity: number;
  totalAvailablePills?: number;
  sellablePills?: number;
  status: string;
};

type Metric = {
  id: string;
  title: string;
  value: string;
  delta?: string;
  icon: React.ReactNode;
  color: string;
};


const numberFormatter = new Intl.NumberFormat('en-US');
const formatNumber = (value: number) => numberFormatter.format(value);

const getDateKey = (date: Date) => date.toISOString().slice(0, 10);

// Helper function to check if a date is today
const isToday = (dateString?: string): boolean => {
  if (!dateString) return false;
  const date = new Date(dateString);
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
};

const MetricCard: React.FC<{ metric: Metric }> = ({ metric }) => (
  <div className="group bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl p-4 sm:rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
    <div className="flex items-center justify-between mb-3 sm:mb-4">
      <div className={`p-2 sm:p-3 rounded-xl ${metric.color} text-white shadow-lg`}>
        {metric.icon}
      </div>
      {metric.delta && (
        <div className="text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded-full">
          {metric.delta}
        </div>
      )}
    </div>
    <div className="space-y-1 sm:space-y-2">
      <div className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">{metric.title}</div>
      <div className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-white">{metric.value}</div>
    </div>
  </div>
);

const buildTotals = (sales: SaleRecord[], purchases: PurchaseRecord[], medicines: MedicineRecord[], saleReturnsTotal: number) => {
  const revenue = sales.reduce((sum, sale) => sum + (sale.total || 0), 0);
  const purchaseTotal = purchases.reduce((sum, p) => sum + (p.grandTotal || 0), 0);

  // Calculate Cost of Goods Sold (COGS) from sale items
  // This is a more accurate profit calculation - only count the cost of items actually sold
  let costOfGoodsSold = 0;
  sales.forEach((sale) => {
    sale.items?.forEach((item) => {
      // Estimate COGS: If we have unit price, assume 60% of sale price is cost (40% margin)
      // This is a reasonable pharmacy margin estimate
      // You can adjust this percentage based on your actual margins
      const estimatedCost = (item.unitPrice || 0) * 0.6; // 60% cost, 40% margin
      costOfGoodsSold += estimatedCost * (item.pills || 0);
    });
  });

  // If we can't calculate COGS from items, use a conservative estimate
  // Assume 70% of revenue is cost (30% margin) as fallback
  if (costOfGoodsSold === 0 && revenue > 0) {
    costOfGoodsSold = revenue * 0.7;
  }

  // Net Revenue = Revenue - Sale Returns
  const netRevenue = revenue - saleReturnsTotal;

  // Net Profit = Net Revenue - Cost of Goods Sold (not all purchases!)
  const profit = netRevenue - costOfGoodsSold;

  const orders = sales.length;
  const uniqueCustomers = new Set(
    sales
      .map((sale) => sale.customerName?.trim().toLowerCase())
      .filter((name): name is string => Boolean(name))
  ).size;
  const totalMedicines = medicines.length;
  const lowStock = medicines.filter(
    (med) => (med.totalAvailablePills ?? 0) > 0 && (med.totalAvailablePills ?? 0) < med.pillQuantity
  ).length;
  const sellablePills = medicines.reduce((sum, med) => sum + (med.sellablePills ?? 0), 0);

  return {
    revenue,
    netRevenue,
    saleReturnsTotal,
    purchaseTotal,
    costOfGoodsSold,
    profit,
    orders,
    uniqueCustomers,
    totalMedicines,
    lowStock,
    sellablePills,
  };
};

const buildSalesSeries = (
  sales: SaleRecord[],
  range: 'this_month' | 'last_month' | 'this_year'
): { day: string; value: number }[] => {
  const now = new Date();
  let start: Date;
  let end: Date;
  let mode: 'day' | 'month' = 'day';

  switch (range) {
    case 'last_month': {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
      break;
    }
    case 'this_year': {
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear(), 11, 31);
      mode = 'month';
      break;
    }
    default: {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }
  }

  if (mode === 'month') {
    const map = new Map<string, number>();
    sales.forEach((sale) => {
      if (!sale.createdAt) return;
      const date = new Date(sale.createdAt);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      map.set(key, (map.get(key) || 0) + (sale.total || 0));
    });
    const result: { day: string; value: number }[] = [];
    for (let month = 0; month < 12; month++) {
      const date = new Date(start.getFullYear(), month, 1);
      if (date < start || date > end) continue;
      const key = `${date.getFullYear()}-${month}`;
      result.push({
        day: date.toLocaleString('default', { month: 'short' }),
        value: map.get(key) || 0,
      });
    }
    return result;
  }

  const map = new Map<string, number>();
  sales.forEach((sale) => {
    if (!sale.createdAt) return;
    const date = new Date(sale.createdAt);
    const key = getDateKey(date);
    map.set(key, (map.get(key) || 0) + (sale.total || 0));
  });

  const data: { day: string; value: number }[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = getDateKey(d);
    data.push({ day: key.slice(5), value: map.get(key) || 0 });
  }
  return data;
};

const buildRevenueSpark = (sales: SaleRecord[]) => {
  const now = new Date();
  const months: { x: string; y: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const total = sales
      .filter((sale) => sale.createdAt && new Date(sale.createdAt).getFullYear() === date.getFullYear() && new Date(sale.createdAt).getMonth() === date.getMonth())
      .reduce((sum, sale) => sum + (sale.total || 0), 0);
    months.push({ x: date.toLocaleString('default', { month: 'short' }), y: total });
  }
  return months;
};

const buildMonthlyPerformance = (sales: SaleRecord[], purchases: PurchaseRecord[]) => {
  const map = new Map<
    string,
    { label: string; timestamp: number; sales: number; purchases: number }
  >();

  const addValue = (dateString: string | undefined, amount: number, type: 'sales' | 'purchases') => {
    if (!dateString) return;
    const date = new Date(dateString);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    if (!map.has(key)) {
      map.set(key, {
        label: date.toLocaleString('default', { month: 'long', year: 'numeric' }),
        timestamp: date.getTime(),
        sales: 0,
        purchases: 0,
      });
    }
    const entry = map.get(key)!;
    entry[type] += amount;
  };

  sales.forEach((sale) => addValue(sale.createdAt, sale.total || 0, 'sales'));
  purchases.forEach((purchase) =>
    addValue(purchase.createdAt, purchase.grandTotal || 0, 'purchases')
  );

  return Array.from(map.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 6);
};

const Dashboard = () => {
  const { setHeader, expiringAlerts } = useDashboardHeader();
  const [pharmacySettings] = useState<PharmacySettings>(() => getStoredPharmacySettings());
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [medicines, setMedicines] = useState<MedicineRecord[]>([]);
  const [saleReturnsTotal, setSaleReturnsTotal] = useState<number>(0);
  const [range, setRange] = useState<'this_month' | 'last_month' | 'this_year'>('this_month');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showWelcomeNotification, setShowWelcomeNotification] = useState(false);

  const formatCurrency = (value: number) => {
    const currency = pharmacySettings.currency || 'USD';
    const symbol = getSymbol(currency);
    // For INR and PKR, use Indian/Pakistani number formatting
    if (currency === 'INR' || currency === 'PKR') {
      return `${symbol}${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [salesData, purchaseData, medicineData, saleReturnsData] = await Promise.all([
        invokeIpc<SaleRecord[]>('sale-get-all', 'sale-get-all-reply'),
        invokeIpc<PurchaseRecord[]>('purchase-get-all', 'purchase-get-all-reply'),
        invokeIpc<MedicineRecord[]>('medicine-get-all', 'medicine-get-all-reply'),
        invokeIpc<number>('sale-return-get-total', 'sale-return-get-total-reply'),
      ]);
      setSales(salesData || []);
      setPurchases(purchaseData || []);
      setMedicines(medicineData || []);
      setSaleReturnsTotal(saleReturnsData || 0);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load dashboard data. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDeleteSale = async (saleId: number, saleDate?: string) => {
    // Check if sale is from today
    if (!isToday(saleDate)) {
      alert('Only sales from today can be deleted. This sale is from a previous date.');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete sale #${saleId}? This action cannot be undone.`)) {
      return;
    }

    try {
      window.electron.ipcRenderer.once('sale-delete-reply', (response: any) => {
        if (response.success) {
          loadData();
          alert('Sale deleted successfully!');
        } else {
          alert('Error deleting sale: ' + (response.error || 'Unknown error'));
        }
      });
      window.electron.ipcRenderer.sendMessage('sale-delete', [saleId]);
    } catch (err) {
      alert('Error deleting sale. Please try again.');
    }
  };

  useEffect(() => {
    setHeader({
      title: 'Pharmacy Dashboard',
      subtitle: 'Live view of sales, purchasing, and inventory',
      actions: (
        <button
          onClick={loadData}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 dark:bg-emerald-500 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700 dark:hover:bg-emerald-600"
        >
          <FiRefreshCw className="h-4 w-4" />
          Refresh
        </button>
      ),
    });
    return () => setHeader(null);
  }, [setHeader, loadData]);

  useEffect(() => {
    const shouldShow = sessionStorage.getItem('shouldShowWelcome');
    if (shouldShow === 'true') {
      const timer = setTimeout(() => setShowWelcomeNotification(true), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleCloseWelcomeNotification = () => {
    setShowWelcomeNotification(false);
    sessionStorage.removeItem('shouldShowWelcome');
  };

  const totals = useMemo(
    () => buildTotals(sales, purchases, medicines, saleReturnsTotal),
    [sales, purchases, medicines, saleReturnsTotal]
  );

  const metrics: Metric[] = useMemo(
    () => [
      {
        id: 'revenue',
        title: 'Gross Revenue',
        value: formatCurrency(totals.revenue),
        delta: `${formatNumber(totals.orders)} orders`,
        icon: <FiDollarSign className="w-5 h-5" />,
        color: 'bg-gradient-to-br from-blue-500 to-cyan-400',
      },
      {
        id: 'netRevenue',
        title: 'Net Revenue',
        value: formatCurrency(totals.netRevenue),
        delta: totals.saleReturnsTotal > 0 ? `Rs.${totals.saleReturnsTotal.toFixed(2)} returned` : 'No returns',
        icon: <FiShoppingBag className="w-5 h-5" />,
        color: 'bg-gradient-to-br from-indigo-500 to-blue-400',
      },
      {
        id: 'profit',
        title: 'Net Profit',
        value: formatCurrency(totals.profit),
        delta: totals.profit >= 0 ? 'Healthy margin' : 'Negative margin',
        icon: <FiTrendingUp className="w-5 h-5" />,
        color: 'bg-gradient-to-br from-violet-500 to-purple-400',
      },
      {
        id: 'customers',
        title: 'Unique Customers',
        value: formatNumber(totals.uniqueCustomers),
        delta: `${formatNumber(sales.length || 0)} sales`,
        icon: <FiUsers className="w-5 h-5" />,
        color: 'bg-gradient-to-br from-emerald-500 to-green-400',
      },
      {
        id: 'inventory',
        title: 'Active Medicines',
        value: formatNumber(totals.totalMedicines),
        delta: `${formatNumber(totals.sellablePills)} pills ready`,
        icon: <FiPackage className="w-5 h-5" />,
        color: 'bg-gradient-to-br from-amber-500 to-orange-400',
      },
    ],
    [totals, sales.length]
  );

  const chartData = useMemo(() => buildSalesSeries(sales, range), [sales, range]);
  const sparkData = useMemo(() => buildRevenueSpark(sales), [sales]);
  const recentOrders = useMemo(() => sales.slice(0, 12), [sales]);
  const monthlyPerformance = useMemo(
    () => buildMonthlyPerformance(sales, purchases),
    [sales, purchases]
  );
  const quickStats = useMemo(
    () => [
      {
        label: 'Low stock items',
        value: formatNumber(totals.lowStock),
        accent: 'text-amber-600',
        bg: 'bg-amber-50',
      },
      {
        label: 'Sellable pills',
        value: formatNumber(totals.sellablePills),
        accent: 'text-emerald-600',
        bg: 'bg-emerald-50',
      },
      {
        label: 'Expiring soon',
        value: formatNumber(expiringAlerts.length),
        accent: 'text-red-600',
        bg: 'bg-red-50',
      },
      {
        label: 'Total purchases',
        value: formatCurrency(totals.purchaseTotal),
        accent: 'text-blue-600',
        bg: 'bg-blue-50',
      },
    ],
    [totals, expiringAlerts.length]
  );

  return (
    <div className="flex flex-col space-y-4 sm:space-y-6 lg:space-y-8 px-2 sm:px-0 pb-8 min-h-full">
      {showWelcomeNotification && (
        <WelcomeNotification onClose={handleCloseWelcomeNotification} />
      )}

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <div className="flex flex-col items-center gap-4 text-gray-500 dark:text-gray-400">
            <div className="w-12 h-12 border-4 border-emerald-500 dark:border-emerald-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium">Loading live metrics...</p>
          </div>
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {metrics.map((metric) => (
              <MetricCard key={metric.id} metric={metric} />
            ))}
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8 lg:auto-rows-fr">
            <div className="lg:col-span-2 bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 h-full flex flex-col">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 sm:mb-6">
                <h2 className="text-lg sm:text-xl font-bold text-gray-800 dark:text-white mb-2 sm:mb-0">
                  Sales Analytics
                </h2>
                <div className="flex items-center gap-3">
                  <select
                    value={range}
                    onChange={(e) => setRange(e.target.value as typeof range)}
                    className="rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all w-full sm:w-auto"
                  >
                    <option value="this_month">This month</option>
                    <option value="last_month">Last month</option>
                    <option value="this_year">This year</option>
                  </select>
                </div>
              </div>
              <div className="h-[250px] sm:h-[300px] flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke={document.documentElement.classList.contains('dark')
                        ? 'rgb(var(--color-gray-700) / 1)'
                        : 'rgb(var(--color-gray-100) / 1)'}
                    />
                    <XAxis
                      dataKey="day"
                      axisLine={false}
                      tickLine={false}
                      tick={{
                        fill: document.documentElement.classList.contains('dark')
                          ? 'rgb(var(--color-gray-400) / 1)'
                          : 'rgb(var(--color-gray-500) / 1)',
                        fontSize: 12
                      }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{
                        fill: document.documentElement.classList.contains('dark')
                          ? 'rgb(var(--color-gray-400) / 1)'
                          : 'rgb(var(--color-gray-500) / 1)',
                        fontSize: 12
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '12px',
                        border: 'none',
                        boxShadow: '0 10px 25px rgb(var(--color-black) / 0.1)',
                        background: document.documentElement.classList.contains('dark')
                          ? 'rgb(var(--color-gray-800) / 1)'
                          : 'rgb(var(--color-white) / 1)',
                        color: document.documentElement.classList.contains('dark')
                          ? 'rgb(var(--color-white) / 1)'
                          : 'rgb(var(--color-gray-900) / 1)',
                      }}
                      formatter={(value: any) => formatCurrency(Number(value) || 0)}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={
                            index === chartData.length - 1
                              ? 'rgb(var(--color-emerald-500) / 1)'
                              : 'rgb(var(--color-emerald-400) / 1)'
                          }
                          opacity={index === chartData.length - 1 ? 1 : 0.7}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 h-full flex flex-col">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h3 className="text-base sm:text-lg font-bold text-gray-800 dark:text-white">
                  Revenue Overview
                </h3>
                <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 sm:px-3 py-1 rounded-full">
                  Last 12 months
                </div>
              </div>

              <div className="space-y-4 sm:space-y-6 flex-1 flex flex-col">
                <div>
                  <div className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-white mb-2">
                    {formatCurrency(totals.revenue)}
                  </div>
                  <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                    Total revenue recorded in the database
                  </div>
                </div>

                <div className="h-[100px] sm:h-[120px] flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={sparkData}>
                      <defs>
                        <linearGradient
                          id="colorRevenue"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="rgb(var(--color-emerald-500))"
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor="rgb(var(--color-emerald-500))"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <Tooltip
                        formatter={(value: any) => formatCurrency(Number(value) || 0)}
                        contentStyle={{
                          borderRadius: '12px',
                          border: 'none',
                          boxShadow: '0 10px 25px rgb(var(--color-black) / 0.1)',
                          background: document.documentElement.classList.contains('dark')
                            ? 'rgb(var(--color-gray-800) / 1)'
                            : 'rgb(var(--color-white) / 1)',
                          color: document.documentElement.classList.contains('dark')
                            ? 'rgb(var(--color-white) / 1)'
                            : 'rgb(var(--color-gray-900) / 1)',
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="y"
                        stroke="rgb(var(--color-emerald-500) / 1)"
                        fill="url(#colorRevenue)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="space-y-3 mt-auto">
                  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-900/30 dark:to-green-900/30 rounded-xl border border-emerald-100 dark:border-emerald-800">
                    <div>
                      <div className="text-sm font-medium text-gray-600 dark:text-gray-300">
                        Total Transactions
                      </div>
                      <div className="font-bold text-gray-800 dark:text-white">{formatNumber(sales.length)}</div>
                    </div>
                    <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-white dark:bg-gray-700 px-2 py-1 rounded-full">
                      + real-time
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-600">
                    <div>
                      <div className="text-sm font-medium text-gray-600 dark:text-gray-300">
                        Net Profit
                      </div>
                      <div className="font-bold text-gray-800 dark:text-white">{formatCurrency(totals.profit)}</div>
                    </div>
                    <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-white dark:bg-gray-700 px-2 py-1 rounded-full">
                      {totals.profit >= 0 ? 'Positive' : 'Negative'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section>
            <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h4 className="text-base sm:text-lg font-bold text-gray-800 dark:text-white">Recent Sales</h4>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Showing latest {recentOrders.length} sales
                </span>
              </div>

              <div className="hidden lg:block overflow-x-auto">
                <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 mb-4">
                  <div className="col-span-2">Invoice</div>
                  <div className="col-span-3">Customer</div>
                  <div className="col-span-2">Date</div>
                  <div className="col-span-2">Amount</div>
                  <div className="col-span-2">Status</div>
                  <div className="col-span-1">Actions</div>
                </div>
                <div className="max-h-96 overflow-y-auto space-y-3 pr-1">
                  {recentOrders.map((order) => (
                    <div
                      key={order.id}
                      className="grid grid-cols-12 gap-4 px-4 py-3 bg-white dark:bg-gray-700/50 border border-gray-100 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <div className="col-span-2 font-semibold text-gray-800 dark:text-white">#{order.id}</div>
                      <div className="col-span-3 text-gray-600 dark:text-gray-300">
                        {order.customerName || 'Walk-in customer'}
                      </div>
                      <div className="col-span-2 text-gray-500 dark:text-gray-400">
                        {order.createdAt
                          ? new Date(order.createdAt).toLocaleDateString()
                          : '—'}
                      </div>
                      <div className="col-span-2 font-semibold text-gray-800 dark:text-white">
                        {formatCurrency(order.total)}
                      </div>
                      <div className="col-span-2">
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400">
                          Completed
                        </span>
                      </div>
                      <div className="col-span-1 flex items-center gap-1">
                        <button
                          onClick={() => handleDeleteSale(order.id, order.createdAt)}
                          disabled={!isToday(order.createdAt)}
                          className={`p-1.5 rounded transition-colors ${
                            isToday(order.createdAt)
                              ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 cursor-pointer'
                              : 'text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-50'
                          }`}
                          title={isToday(order.createdAt) ? 'Delete Sale' : 'Only today\'s sales can be deleted'}
                        >
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:hidden space-y-3 max-h-96 overflow-y-auto">
                {recentOrders.map((order) => (
                  <div
                    key={order.id}
                    className="bg-white dark:bg-gray-700/50 border border-gray-100 dark:border-gray-600 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold text-gray-800 dark:text-white">#{order.id}</div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400">
                          Completed
                        </span>
                        <button
                          onClick={() => handleDeleteSale(order.id, order.createdAt)}
                          disabled={!isToday(order.createdAt)}
                          className={`p-1.5 rounded transition-colors ${
                            isToday(order.createdAt)
                              ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 cursor-pointer'
                              : 'text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-50'
                          }`}
                          title={isToday(order.createdAt) ? 'Delete Sale' : 'Only today\'s sales can be deleted'}
                        >
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-300">
                      {order.customerName || 'Walk-in customer'}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      {order.createdAt
                        ? new Date(order.createdAt).toLocaleString()
                        : '—'}
                    </div>
                    <div className="text-base font-semibold text-gray-900 dark:text-white">
                      {formatCurrency(order.total)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section>
            <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
              <h4 className="text-base sm:text-lg font-bold text-gray-800 dark:text-white mb-4">Quick Stats</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                {quickStats.map((stat) => (
                  <div key={stat.label} className={`text-center p-4 rounded-xl ${stat.bg} dark:bg-gray-700/50`}>
                    <div className={`text-lg font-bold ${stat.accent}`}>{stat.value}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section>
            <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
              <h4 className="text-base sm:text-lg font-bold text-gray-800 dark:text-white mb-4">
                Monthly Performance
              </h4>
              <div className="space-y-4">
                {monthlyPerformance.length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No sales or purchases recorded yet.</p>
                )}
                {monthlyPerformance.map((entry) => (
                  <div
                    key={entry.label}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                  >
                    <div>
                      <div className="font-medium text-gray-700 dark:text-gray-300">{entry.label}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Sales vs Purchases</div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-sm text-emerald-600 dark:text-emerald-400 font-semibold">
                        {formatCurrency(entry.sales)}
                      </div>
                      <div className="text-sm text-blue-600 dark:text-blue-400 font-semibold">
                        {formatCurrency(entry.purchases)}
                      </div>
                      <div
                        className={`text-xs px-2 py-1 rounded-full ${entry.sales - entry.purchases >= 0
                            ? 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                            : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                          }`}
                      >
                        {entry.sales - entry.purchases >= 0 ? '+' : '-'}
                        {formatCurrency(Math.abs(entry.sales - entry.purchases))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default Dashboard;
