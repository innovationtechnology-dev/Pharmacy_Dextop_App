'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  Cell,
  ReferenceLine,
  Label,
} from 'recharts';
import {
  FiTrendingUp,
  FiUsers,
  FiDollarSign,
  FiShoppingBag,
  FiPackage,
  FiRefreshCw,
} from 'react-icons/fi';
import { invokeIpc } from '../../utils/ipcHelpers';
import { useDashboardHeader } from './useDashboardHeader';
import { PharmacySettings, getStoredPharmacySettings } from '../../types/pharmacy';
import { getCurrencySymbol as getSymbol } from '../../../common/currency';

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
  saleType?: string;
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
  pillQuantity: number;
  totalAvailablePills?: number;
  sellablePills?: number;
  status: string;
};

const numberFormatter = new Intl.NumberFormat('en-US');
const formatNumber = (value: number) => numberFormatter.format(value);

const getDateKey = (date: Date) => date.toISOString().slice(0, 10);

const buildTotals = (sales: SaleRecord[], purchases: PurchaseRecord[], medicines: MedicineRecord[], saleReturnsTotal: number) => {
  const revenue = sales.reduce((sum, sale) => sum + (sale.total || 0), 0);
  
  let costOfGoodsSold = 0;
  sales.forEach((sale) => {
    sale.items?.forEach((item) => {
      const estimatedCost = (item.unitPrice || 0) * 0.6;
      costOfGoodsSold += estimatedCost * (item.pills || 0);
    });
  });

  if (costOfGoodsSold === 0 && revenue > 0) {
    costOfGoodsSold = revenue * 0.7;
  }

  const netRevenue = revenue - saleReturnsTotal;
  const profit = netRevenue - costOfGoodsSold;

  const familyTotal = sales
    .filter((sale) => sale.saleType === 'Family/Relatives')
    .reduce((sum, sale) => sum + (sale.total || 0), 0);
  const charityTotal = sales
    .filter((sale) => sale.saleType === 'Charity')
    .reduce((sum, sale) => sum + (sale.total || 0), 0);

  const uniqueCustomers = new Set(
    sales
      .map((sale) => sale.customerName?.trim().toLowerCase())
      .filter((name): name is string => Boolean(name))
  ).size;
  const totalMedicines = medicines.length;

  const purchasesTotal = purchases.reduce((sum, p) => sum + (p.grandTotal || 0), 0);

  return {
    revenue,
    netRevenue,
    saleReturnsTotal,
    familyTotal,
    charityTotal,
    purchasesTotal,
    profit,
    uniqueCustomers,
    totalMedicines,
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
    const label = d.toLocaleString('default', { month: 'short', day: 'numeric' });
    data.push({ day: label, value: map.get(key) || 0 });
  }
  return data;
};

const buildRevenueSpark = (sales: SaleRecord[]) => {
  const now = new Date();
  const months: { x: string; y: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const total = sales
      .filter((sale) => sale.createdAt && new Date(sale.createdAt).getFullYear() === date.getFullYear() && new Date(sale.createdAt).getMonth() === date.getMonth())
      .reduce((sum, sale) => sum + (sale.total || 0), 0);
    months.push({ x: date.toLocaleString('default', { month: 'short' }), y: total });
  }
  return months;
};

const Dashboard = () => {
  const { setHeader } = useDashboardHeader();
  const [pharmacySettings] = useState<PharmacySettings>(() => getStoredPharmacySettings());
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [medicines, setMedicines] = useState<MedicineRecord[]>([]);
  const [saleReturnsTotal, setSaleReturnsTotal] = useState<number>(0);
  const [range, setRange] = useState<'this_month' | 'last_month' | 'this_year'>('this_month');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const formatCurrency = (value: number) => {
    const currency = pharmacySettings.currency || 'USD';
    const symbol = getSymbol(currency);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const value = payload[0].value;
      const avg = chartData.reduce((acc, curr) => acc + curr.value, 0) / chartData.length;
      const isAboveAvg = value >= avg;

      return (
        <div className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl border border-white/20 dark:border-gray-700/50 p-3 rounded-xl shadow-2xl space-y-2 min-w-[140px] z-[1000] ring-1 ring-black/5">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700/50 pb-1.5 mb-1">
            <p className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">{label}</p>
            <div className={`w-1.5 h-1.5 rounded-full ${isAboveAvg ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          </div>
          
          <div className="space-y-0">
            <p className="text-[9px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Sales</p>
            <p className="text-base font-bold text-gray-900 dark:text-white leading-none">
              {formatCurrency(value)}
            </p>
          </div>

          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-wider ${
            isAboveAvg ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600'
          }`}>
            {isAboveAvg ? (
              <><FiTrendingUp className="w-2.5 h-2.5" /> Above Avg</>
            ) : (
              <><FiTrendingUp className="w-2.5 h-2.5 rotate-180" /> Below Avg</>
            )}
          </div>
        </div>
      );
    }
    return null;
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
      setError(err instanceof Error ? err.message : 'Unable to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setHeader({
      title: 'Pharmacy Dashboard',
      subtitle: 'Live view of sales, purchasing, and inventory',
      actions: (
        <button
          onClick={loadData}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 dark:bg-emerald-500 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700 dark:hover:bg-emerald-600"
        >
          <FiRefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      ),
    });
    return () => setHeader(null);
  }, [setHeader, loadData, loading]);

  const totals = useMemo(
    () => buildTotals(sales, purchases, medicines, saleReturnsTotal),
    [sales, purchases, medicines, saleReturnsTotal]
  );

  const metrics = useMemo(
    () => [
      {
        id: 'purchases',
        title: 'Purchases',
        value: formatCurrency(totals.purchasesTotal),
        icon: <FiPackage />,
      },
      {
        id: 'revenue',
        title: 'Gross Sales',
        value: formatCurrency(totals.revenue),
        icon: <FiDollarSign />,
      },
      {
        id: 'netRevenue',
        title: 'Net Sales',
        value: formatCurrency(totals.netRevenue),
        icon: <FiShoppingBag />,
      },
      {
        id: 'profit',
        title: 'Net Profit',
        value: formatCurrency(totals.profit),
        icon: <FiTrendingUp />,
      },
      {
        id: 'customers',
        title: 'Customers',
        value: formatNumber(totals.uniqueCustomers),
        icon: <FiUsers />,
      },
      {
        id: 'inventory',
        title: 'Medicines',
        value: formatNumber(totals.totalMedicines),
        icon: <FiPackage />,
      },
      {
        id: 'family',
        title: 'Relative',
        value: formatCurrency(totals.familyTotal),
        icon: <FiUsers />,
      },
      {
        id: 'charity',
        title: 'Charity',
        value: formatCurrency(totals.charityTotal),
        icon: <FiPackage />,
      },
    ],
    [totals]
  );

  const chartData = useMemo(() => buildSalesSeries(sales, range), [sales, range]);
  const sparkData = useMemo(() => buildRevenueSpark(sales), [sales]);
  const recentOrders = useMemo(() => sales.slice(0, 50), [sales]);

  return (
    <div className="flex flex-col h-auto md:h-[calc(100vh-80px)] w-full bg-gradient-to-br from-gray-50 via-gray-50 to-gray-100/50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800/80 overflow-visible md:overflow-hidden px-4 pb-4 md:pb-0">
      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-300 mb-2">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-gray-500 dark:text-gray-400">
            <div className="w-12 h-12 border-4 border-emerald-500 dark:border-emerald-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium">Loading live metrics...</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="bg-gradient-to-br from-white via-white to-gray-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-gray-800/90 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-3 flex flex-wrap items-center gap-3 mb-2 flex-shrink-0">
            {metrics.map((metric) => (
              <div key={metric.id} className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border shadow-sm ${
                  metric.id === 'revenue' ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-600/50' :
                  metric.id === 'netRevenue' ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-600/50' :
                  metric.id === 'profit' ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-600/50' :
                  metric.id === 'purchases' ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-600/50' :
                  metric.id === 'customers' ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-600/50' :
                  metric.id === 'family' ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-600/50' :
                  metric.id === 'charity' ? 'bg-pink-50 dark:bg-pink-900/20 border-pink-200 dark:border-pink-600/50' :
                  'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-600/50'
                }`}>
                  <div className={
                    metric.id === 'revenue' ? 'text-blue-500' :
                    metric.id === 'netRevenue' ? 'text-indigo-500' :
                    metric.id === 'profit' ? 'text-emerald-500' :
                    metric.id === 'purchases' ? 'text-orange-500' :
                    metric.id === 'customers' ? 'text-teal-500' :
                    metric.id === 'family' ? 'text-purple-500' :
                    metric.id === 'charity' ? 'text-pink-500' :
                    'text-amber-500'
                  }>
                    {React.cloneElement(metric.icon as React.ReactElement, { className: 'w-3.5 h-3.5' })}
                  </div>
                  <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                    {metric.title}
                  </span>
                  <span className={`text-xs font-bold ml-1 ${
                    metric.id === 'revenue' ? 'text-blue-600 dark:text-blue-400' :
                    metric.id === 'netRevenue' ? 'text-indigo-600 dark:text-indigo-400' :
                    metric.id === 'profit' ? 'text-emerald-600 dark:text-emerald-400' :
                    metric.id === 'purchases' ? 'text-orange-600 dark:text-orange-400' :
                    metric.id === 'customers' ? 'text-teal-600 dark:text-teal-400' :
                    metric.id === 'family' ? 'text-purple-600 dark:text-purple-400' :
                    metric.id === 'charity' ? 'text-pink-600 dark:text-pink-400' :
                    'text-amber-600 dark:text-amber-400'
                  }`}>
                    {metric.value}
                  </span>
                </div>
              </div>
            ))}
            
            <button
              onClick={loadData}
              className="ml-auto px-3 py-1.5 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-xs font-semibold rounded-md transition-colors uppercase tracking-wide flex items-center gap-1.5 shadow-sm"
            >
              <FiRefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-3 flex-1 overflow-hidden min-h-0">
            <div className="lg:col-span-2 bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md flex flex-col overflow-hidden min-h-0">
              <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-800/10 border-b border-blue-200/50 dark:border-blue-800/30 flex items-center justify-between flex-shrink-0">
                <h2 className="text-sm font-bold text-gray-800 dark:text-white uppercase tracking-wide">
                  Sales Analytics
                </h2>
                <select
                  value={range}
                  onChange={(e) => setRange(e.target.value as typeof range)}
                  className="rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-3 py-1.5 text-xs focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                >
                  <option value="this_month">This month</option>
                  <option value="last_month">Last month</option>
                  <option value="this_year">This year</option>
                </select>
              </div>
              <div className="flex-1 min-h-0 p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={chartData} 
                    margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                    barGap={0}
                  >
                    <defs>
                      <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3B82F6" stopOpacity={1} />
                        <stop offset="100%" stopColor="#2563EB" stopOpacity={0.9} />
                      </linearGradient>
                      <linearGradient id="activeBarGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10B981" stopOpacity={1} />
                        <stop offset="100%" stopColor="#059669" stopOpacity={0.9} />
                      </linearGradient>
                      <filter id="barShadow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.2" />
                      </filter>
                    </defs>
                    
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.03)" />
                    
                    <XAxis 
                      dataKey="day" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#9CA3AF', fontSize: 9, fontWeight: 600, letterSpacing: '0.02em' }} 
                      dy={10}
                    />
                    
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#9CA3AF', fontSize: 9, fontWeight: 600 }} 
                      tickFormatter={(val) => formatCurrency(val).split('.')[0]}
                      dx={-10}
                    />
                    
                    <Tooltip 
                      cursor={{ fill: 'rgba(59, 130, 246, 0.03)', radius: 8 }}
                      content={<CustomTooltip />}
                    />

                    {/* Average Reference Line */}
                    <ReferenceLine 
                      y={chartData.reduce((acc, curr) => acc + curr.value, 0) / chartData.length} 
                      stroke="#9CA3AF" 
                      strokeDasharray="4 4" 
                      strokeOpacity={0.4}
                      strokeWidth={1}
                    >
                      <Label 
                        value="AVG" 
                        position="right" 
                        fill="#9CA3AF" 
                        fontSize={8} 
                        fontWeight={700} 
                        className="uppercase tracking-widest text-[7px]"
                        dx={10}
                      />
                    </ReferenceLine>
                    
                    {/* Shadow / Background Bar for Depth */}
                    <Bar 
                      dataKey="value" 
                      fill="rgba(0,0,0,0.02)" 
                      radius={[6, 6, 0, 0]} 
                      barSize={range === 'this_year' ? 32 : 12}
                      xAxisId={0}
                      isAnimationActive={false}
                    />

                    {/* Main Interactive Bar */}
                    <Bar 
                      dataKey="value" 
                      radius={[6, 6, 0, 0]} 
                      barSize={range === 'this_year' ? 32 : 12}
                      animationDuration={1500}
                      animationEasing="ease-out"
                    >
                      {chartData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={index === chartData.length - 1 ? 'url(#activeBarGradient)' : 'url(#barGradient)'}
                          filter="url(#barShadow)"
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md flex flex-col overflow-hidden min-h-0">
              <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-800/10 border-b border-blue-200/50 dark:border-blue-800/30 flex-shrink-0">
                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide flex items-center gap-2">
                  <FiTrendingUp className="text-emerald-500" />
                  Sales Overview
                </h3>
              </div>

              <div className="flex-1 flex flex-col min-h-0 p-4 overflow-y-auto">
                <div className="mb-4">
                  <div className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                    {formatCurrency(totals.revenue)}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                    Total sales recorded
                  </div>
                </div>

                <div className="h-[120px] w-full flex-shrink-0 mb-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={sparkData}>
                      <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Tooltip 
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', fontSize: '10px' }}
                        formatter={(value: any) => [formatCurrency(Number(value) || 0), 'Sales']}
                        labelStyle={{ display: 'none' }} // Hide x-axis index/date to keep it clean
                      />
                      <Area type="monotone" dataKey="y" stroke="#10B981" fill="url(#colorRevenue)" strokeWidth={2} dot={{ r: 2, fill: '#10B981' }} activeDot={{ r: 4 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="space-y-2 mt-auto">
                  <div className="flex items-center justify-between p-3 bg-blue-50/50 dark:bg-blue-900/10 rounded-lg border border-blue-100/50 dark:border-blue-800/30">
                    <div>
                      <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Transactions</div>
                      <div className="text-sm font-bold text-gray-900 dark:text-white">{formatNumber(sales.length)}</div>
                    </div>
                    <div className="px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-[10px] font-bold text-blue-600 dark:text-blue-400">LIVE</div>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-lg border border-emerald-100/50 dark:border-emerald-800/30">
                    <div>
                      <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Net Profit</div>
                      <div className="text-sm font-bold text-gray-900 dark:text-white">{formatCurrency(totals.profit)}</div>
                    </div>
                    <div className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      totals.profit >= 0 ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
                    }`}>
                      {totals.profit >= 0 ? 'PROFIT' : 'LOSS'}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2.5 bg-purple-50/50 dark:bg-purple-900/10 rounded-lg border border-purple-100/50 dark:border-purple-800/30">
                      <div className="text-[9px] font-bold text-purple-600/70 dark:text-purple-400/70 uppercase tracking-wider mb-0.5">Relative</div>
                      <div className="text-xs font-bold text-purple-700 dark:text-purple-300">{formatCurrency(totals.familyTotal)}</div>
                    </div>
                    <div className="p-2.5 bg-pink-50/50 dark:bg-pink-900/10 rounded-lg border border-pink-100/50 dark:border-pink-800/30">
                      <div className="text-[9px] font-bold text-pink-600/70 dark:text-pink-400/70 uppercase tracking-wider mb-0.5">Charity</div>
                      <div className="text-xs font-bold text-pink-700 dark:text-pink-300">{formatCurrency(totals.charityTotal)}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-4 flex-shrink-0">
            <div className="bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md flex flex-col overflow-hidden">
              <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-800/10 border-b border-blue-200/50 dark:border-blue-800/30">
                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide flex items-center gap-2">
                  <FiShoppingBag className="text-blue-500" />
                  Recent Sales
                </h3>
              </div>
              <div className="overflow-x-auto overflow-y-auto max-h-[150px] custom-scrollbar rounded-b-lg">
                <table className="w-full text-left text-xs relative">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/90 backdrop-blur-md z-10 shadow-sm">
                    <tr>
                      <th className="py-2.5 px-4 font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">ID</th>
                      <th className="py-2.5 px-4 font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">Customer</th>
                      <th className="py-2.5 px-4 font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">Date</th>
                      <th className="py-2.5 px-4 font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right border-b border-gray-100 dark:border-gray-700">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {recentOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors group">
                        <td className="py-2.5 px-4 font-bold text-gray-900 dark:text-white">#{order.id}</td>
                        <td className="py-2.5 px-4 text-gray-600 dark:text-gray-300 font-medium">{order.customerName || 'Walk-in'}</td>
                        <td className="py-2.5 px-4 text-gray-500 dark:text-gray-400">
                          {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : '-'}
                        </td>
                        <td className="py-2.5 px-4 font-bold text-gray-900 dark:text-white text-right">{formatCurrency(order.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
