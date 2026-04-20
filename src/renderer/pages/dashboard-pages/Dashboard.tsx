'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  additionalDiscount?: number;
  additionalDiscountAmount?: number;
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
  averageSellablePricePerPill?: number | null;
  status: string;
};

const numberFormatter = new Intl.NumberFormat('en-US');
const formatNumber = (value: number) => numberFormatter.format(value);

const getDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

type FinancialRangeKpis = {
  purchasingTotal: number;
  grossSubtotal: number;
  sellingTotal: number;
  netSalesGrossBasis: number;
  netRevenue: number;
  familyTotal: number;
  charityTotal: number;
  employeeTotal: number;
  saleReturnsTotal: number;
  profit: number;
  trend?: any[];
};

/** Matches main process getFinancialSparkForDateRange (same basis as financial-get-date-range). */
type SalesOverviewSparkMonth = { x: string; gross: number; net: number; profit: number };

const buildTotals = (sales: SaleRecord[], purchases: PurchaseRecord[], medicines: MedicineRecord[], saleReturnsTotal: number) => {
  const revenue = sales.reduce((sum, sale) => sum + (sale.total || 0), 0);
  const grossSubtotal = sales.reduce((sum, sale) => sum + (sale.subtotal || 0), 0);
  
  // Calculate COGS using actual purchase costs from medicine inventory
  let costOfGoodsSold = 0;
  const medicineMap = new Map(medicines.map(m => [m.id, m]));
  
  sales.forEach((sale) => {
    sale.items?.forEach((item) => {
      const medicine = medicineMap.get(item.medicineId);
      
      // Use average sellable price per pill as cost if available
      // This represents the weighted average cost of inventory that can be sold
      let actualCost = 0;
      
      if (medicine?.averageSellablePricePerPill && medicine.averageSellablePricePerPill > 0) {
        // Use the average cost from purchase_items (this is the actual purchase cost)
        actualCost = medicine.averageSellablePricePerPill;
      } else {
        // Fallback: Use 70% of selling price as conservative estimate
        // This should rarely happen if purchases are properly recorded
        actualCost = (item.unitPrice || 0) * 0.7;
      }
      
      costOfGoodsSold += actualCost * (item.pills || 0);
    });
  });

  const familyTotal = sales
    .filter((sale) => sale.saleType === 'Family/Relatives')
    .reduce((sum, sale) => sum + (sale.total || 0), 0);
  const charityTotal = sales
    .filter((sale) => sale.saleType === 'Charity')
    .reduce((sum, sale) => sum + (sale.total || 0), 0);
  const employeeTotal = sales
    .filter((sale) => sale.saleType === 'Employee')
    .reduce((sum, sale) => sum + (sale.total || 0), 0);

  const companyExpenses = familyTotal + charityTotal + employeeTotal;
  const netRevenue = Math.max(0, revenue - companyExpenses - saleReturnsTotal);
  const netSalesGrossBasis = Math.max(0, grossSubtotal - companyExpenses - saleReturnsTotal);
  const profit = netRevenue - costOfGoodsSold;

  const uniqueCustomers = new Set(
    sales
      .map((sale) => sale.customerName?.trim().toLowerCase())
      .filter((name): name is string => Boolean(name))
  ).size;
  const totalMedicines = medicines.length;

  const purchasesTotal = purchases.reduce((sum, p) => sum + (p.grandTotal || 0), 0);

  return {
    revenue,
    grossSubtotal,
    netSalesGrossBasis,
    netRevenue,
    saleReturnsTotal,
    familyTotal,
    charityTotal,
    employeeTotal,
    purchasesTotal,
    profit,
    uniqueCustomers,
    totalMedicines,
  };
};

const buildSalesSeries = (
  sales: SaleRecord[],
  returns: any[],
  range: 'this_month' | 'last_month' | 'this_year'
): { day: string; value: number; net: number }[] => {
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
    const grossMap = new Map<string, number>();
    const netMap = new Map<string, number>();
    sales.forEach((sale) => {
      if (!sale.createdAt) return;
      const date = new Date(sale.createdAt);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      grossMap.set(key, (grossMap.get(key) || 0) + (sale.subtotal || sale.total || 0));
      const invoiced = sale.total || 0;
      const deductions = ['Family/Relatives', 'Charity', 'Employee'].includes(sale.saleType || '') ? invoiced : 0;
      netMap.set(key, (netMap.get(key) || 0) + (invoiced - deductions));
    });
    returns.forEach((ret) => {
      if (!ret.createdAt) return;
      const date = new Date(ret.createdAt);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      netMap.set(key, (netMap.get(key) || 0) - (ret.total || 0));
    });
    const result: { day: string; value: number; net: number }[] = [];
    for (let month = 0; month < 12; month++) {
      const date = new Date(start.getFullYear(), month, 1);
      if (date < start || date > end) continue;
      const key = `${date.getFullYear()}-${month}`;
      result.push({
        day: date.toLocaleString('default', { month: 'short' }),
        value: grossMap.get(key) || 0,
        net: Math.max(0, netMap.get(key) || 0),
      });
    }
    return result;
  }

  const grossMap = new Map<string, number>();
  const netMap = new Map<string, number>();
  sales.forEach((sale) => {
    if (!sale.createdAt) return;
    const date = new Date(sale.createdAt);
    const key = getDateKey(date);
    grossMap.set(key, (grossMap.get(key) || 0) + (sale.subtotal || sale.total || 0));
    const invoiced = sale.total || 0;
    const deductions = ['Family/Relatives', 'Charity', 'Employee'].includes(sale.saleType || '') ? invoiced : 0;
    netMap.set(key, (netMap.get(key) || 0) + (invoiced - deductions));
  });
  returns.forEach((ret) => {
    if (!ret.createdAt) return;
    const date = new Date(ret.createdAt);
    const key = getDateKey(date);
    netMap.set(key, (netMap.get(key) || 0) - (ret.total || 0));
  });

  const data: { day: string; value: number; net: number }[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = getDateKey(d);
    const label = d.toLocaleString('default', { month: 'short', day: 'numeric' });
    data.push({ 
      day: label, 
      value: grossMap.get(key) || 0,
      net: Math.max(0, netMap.get(key) || 0)
    });
  }
  return data;
};

const getDefaultKpiDates = () => {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const toLocalIso = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  return { from: toLocalIso(firstDay), to: toLocalIso(now) };
};

const Dashboard = () => {
  const { setHeader } = useDashboardHeader();
  const [pharmacySettings] = useState<PharmacySettings>(() => getStoredPharmacySettings());
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [medicines, setMedicines] = useState<MedicineRecord[]>([]);
  const [allSaleReturns, setAllSaleReturns] = useState<any[]>([]);
  const [saleReturnsTotal, setSaleReturnsTotal] = useState<number>(0);
  const [range, setRange] = useState<'this_month' | 'last_month' | 'this_year'>('this_month');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const defaultDates = getDefaultKpiDates();
  const [kpiFromDate, setKpiFromDate] = useState<string>(defaultDates.from);
  const [kpiToDate, setKpiToDate] = useState<string>(defaultDates.to);
  const [recentOrdersPage, setRecentOrdersPage] = useState(1);
  const [spark12m, setSpark12m] = useState<SalesOverviewSparkMonth[] | null>(null);
  const RECENT_ORDERS_PER_PAGE = 20;
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
        <div className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl border border-white/20 dark:border-gray-700/50 p-3 rounded-xl shadow-2xl space-y-0 min-w-[140px] z-[1000] ring-1 ring-black/5 dark:ring-white/30">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700/50 pb-1.5 mb-1">
            <p className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">{label}</p>
            <div className={`w-1.5 h-1.5 rounded-full ${isAboveAvg ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          </div>
          
          <div className="space-y-0">
            <p className="text-[9px] font-medium text-gray-900 dark:text-gray-200 uppercase tracking-wide">Gross Sales (Exc. Returns)</p>
            <p className="text-base font-bold text-gray-900 dark:text-white leading-none">
              {formatCurrency(value)}
            </p>
          </div>

          <div className="space-y-0 pt-2 border-t border-gray-100 dark:border-gray-700/50">
            <p className="text-[9px] font-medium text-[#077531]/80 dark:text-[#10B981] uppercase tracking-wide">Net Sales</p>
            <p className="text-sm font-bold text-[#077531]/80 dark:text-[#10B981]/80 leading-none">
              {formatCurrency(payload[0].payload.net || 0)}
            </p>
          </div>

          <div className="space-y-0 pt-2 border-t border-gray-100 dark:border-gray-700/50 mt-2">
            <p className="text-[9px] font-medium text-purple-600/70 dark:text-purple-400/70 uppercase tracking-wide">Net Profit</p>
            <p className="text-sm font-bold text-purple-700 dark:text-purple-400 leading-none">
              {formatCurrency(payload[0].payload.profit || 0)}
            </p>
          </div>

          <div className={`mt-2 flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-wider ${
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

  // Load sale returns filtered by date range
  const loadSaleReturns = useCallback(async () => {
    try {
      const returns = await invokeIpc<any[]>(
        'sale-return-get-by-date-range',
        'sale-return-get-by-date-range-reply',
        [kpiFromDate, kpiToDate]
      );
      const total = (returns || []).reduce((sum: number, ret: any) => sum + (ret.total || 0), 0);
      setSaleReturnsTotal(total);
    } catch (err) {
      console.error('Failed to load sale returns:', err);
      setSaleReturnsTotal(0);
    }
  }, [kpiFromDate, kpiToDate]);

  const loadSparkSeries = useCallback(async () => {
    if (!kpiFromDate || !kpiToDate) return;
    try {
      const sparkSeries = await invokeIpc<SalesOverviewSparkMonth[]>(
        'financial-get-spark-range',
        'financial-get-spark-range-reply',
        [kpiFromDate, kpiToDate]
      );
      setSpark12m(Array.isArray(sparkSeries) && sparkSeries.length ? sparkSeries : null);
    } catch (sparkErr) {
      console.error('Failed to load sales overview spark:', sparkErr);
      setSpark12m(null);
    }
  }, [kpiFromDate, kpiToDate]);

  const loadSparkSeriesRef = useRef(loadSparkSeries);
  loadSparkSeriesRef.current = loadSparkSeries;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [salesData, purchaseData, medicineData, allReturnsData] = await Promise.all([
        invokeIpc<SaleRecord[]>('sale-get-all', 'sale-get-all-reply'),
        invokeIpc<PurchaseRecord[]>('purchase-get-all', 'purchase-get-all-reply'),
        invokeIpc<MedicineRecord[]>('medicine-get-all', 'medicine-get-all-reply'),
        invokeIpc<any[]>('sale-return-get-by-date-range', 'sale-return-get-by-date-range-reply', ['2000-01-01', '2100-01-01'])
      ]);
      setSales(salesData || []);
      setPurchases(purchaseData || []);
      setMedicines(medicineData || []);
      setAllSaleReturns(allReturnsData || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load dashboard data.');
    } finally {
      setLoading(false);
    }
    // After the dashboard is allowed to render, load spark in a separate tick so a slow / stuck
    // financial spark IPC never blocks setLoading(false) (avoids endless “Loading live metrics…”).
    queueMicrotask(() => {
      void loadSparkSeriesRef.current();
    });
  }, []);

  useEffect(() => {
    loadSaleReturns();
  }, [loadSaleReturns]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!kpiFromDate || !kpiToDate) return;
    void loadSparkSeriesRef.current();
  }, [kpiFromDate, kpiToDate]);

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

  const filteredSales = useMemo(() => {
    if (!kpiFromDate && !kpiToDate) return sales;
    return sales.filter((s) => {
      if (!s.createdAt) return false;
      const d = s.createdAt.slice(0, 10);
      return (!kpiFromDate || d >= kpiFromDate) && (!kpiToDate || d <= kpiToDate);
    });
  }, [sales, kpiFromDate, kpiToDate]);

  const filteredPurchases = useMemo(() => {
    if (!kpiFromDate && !kpiToDate) return purchases;
    return purchases.filter((p) => {
      if (!p.createdAt) return false;
      const d = p.createdAt.slice(0, 10);
      return (!kpiFromDate || d >= kpiFromDate) && (!kpiToDate || d <= kpiToDate);
    });
  }, [purchases, kpiFromDate, kpiToDate]);

  const totals = useMemo(() => {
    // For accurate profit calculation matching Financial Summary,
    // we should use the backend calculation instead of estimating locally
    // However, for now we'll use the local calculation with filtered data
    return buildTotals(filteredSales, filteredPurchases, medicines, saleReturnsTotal);
  }, [filteredSales, filteredPurchases, medicines, saleReturnsTotal]);

  /** Same date range as KPI strip — matches Financial Summary / sales.service aggregates */
  const [financialRange, setFinancialRange] = useState<FinancialRangeKpis | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchFinancialRange = async () => {
      try {
        const response = await invokeIpc<FinancialRangeKpis & { saleReturnsTotal?: number }>(
          'financial-get-date-range',
          'financial-get-date-range-reply',
          [kpiFromDate, kpiToDate]
        );
        if (cancelled || !response || response.profit === undefined) return;
        const family = response.familyTotal ?? 0;
        const charity = response.charityTotal ?? 0;
        const employee = response.employeeTotal ?? 0;
        const company = family + charity + employee;
        const gross = response.grossSubtotal ?? 0;
        const selling = response.sellingTotal ?? 0;
        const returns = response.saleReturnsTotal ?? 0;
        const netSalesGrossBasis =
          response.netSalesGrossBasis ??
          Math.max(0, gross - company - returns);
        setFinancialRange({
          purchasingTotal: response.purchasingTotal ?? 0,
          grossSubtotal: gross,
          sellingTotal: selling,
          netSalesGrossBasis,
          netRevenue: response.netRevenue ?? Math.max(0, selling - company - returns),
          familyTotal: family,
          charityTotal: charity,
          employeeTotal: employee,
          saleReturnsTotal: returns,
          profit: response.profit,
          trend: response.trend,
        });
      } catch (err) {
        console.error('Failed to fetch financial summary for KPI range:', err);
        if (!cancelled) setFinancialRange(null);
      }
    };
    fetchFinancialRange();
    return () => {
      cancelled = true;
    };
  }, [kpiFromDate, kpiToDate]);

  const displayTotals = useMemo(() => {
    if (!financialRange) return totals;
    return {
      ...totals,
      purchasesTotal: financialRange.purchasingTotal,
      grossSubtotal: financialRange.grossSubtotal,
      revenue: financialRange.sellingTotal,
      netSalesGrossBasis: financialRange.netSalesGrossBasis,
      netRevenue: financialRange.netRevenue,
      familyTotal: financialRange.familyTotal,
      charityTotal: financialRange.charityTotal,
      employeeTotal: financialRange.employeeTotal,
      saleReturnsTotal: financialRange.saleReturnsTotal,
      profit: financialRange.profit,
    };
  }, [totals, financialRange]);

  const metrics = useMemo(
    () => [
      {
        id: 'purchases',
        title: 'Purchases',
        value: formatCurrency(displayTotals.purchasesTotal),
        icon: <FiPackage />,
      },
      {
        id: 'revenue',
        title: 'Gross Sales',
        value: formatCurrency(displayTotals.grossSubtotal ?? displayTotals.revenue),
        icon: <FiDollarSign />,
      },
      {
        id: 'netRevenue',
        title: 'Net Sales',
        value: formatCurrency(displayTotals.netSalesGrossBasis ?? displayTotals.netRevenue),
        icon: <FiShoppingBag />,
      },
      {
        id: 'profit',
        title: displayTotals.profit >= 0 ? 'Net Profit' : 'Net Loss',
        value: formatCurrency(Math.abs(displayTotals.profit)),
        icon: <FiTrendingUp />,
      },
      {
        id: 'inventory',
        title: 'Medicines',
        value: formatNumber(displayTotals.totalMedicines),
        icon: <FiPackage />,
      },
      {
        id: 'family',
        title: 'Relative',
        value: formatCurrency(displayTotals.familyTotal),
        icon: <FiUsers />,
      },
      {
        id: 'charity',
        title: 'Charity',
        value: formatCurrency(displayTotals.charityTotal),
        icon: <FiPackage />,
      },
      {
        id: 'employee',
        title: 'Employee',
        value: formatCurrency(displayTotals.employeeTotal),
        icon: <FiUsers />,
      },
      {
        id: 'saleReturns',
        title: 'Return Amount',
        value: formatCurrency(displayTotals.saleReturnsTotal),
        icon: <FiRefreshCw />,
      },
    ],
    [displayTotals]
  );

  const chartData = useMemo(() => {
    // If we have accurate trend data from the backend KPI fetch, use it!
    if (financialRange?.trend && financialRange.trend.length > 0) {
      return financialRange.trend.map(t => ({
        day: t.date.split('-').length > 2 ? t.date.slice(5) : t.date, // Format date for label
        gross: t.grossSales,
        net: t.netSales,
        profit: t.profit,
        value: t.grossSales // Keep 'value' for backward compatibility if needed
      }));
    }
    // Fallback to local calculation
    return buildSalesSeries(sales, allSaleReturns, range).map(d => ({ ...d, gross: d.value, profit: 0 }));
  }, [financialRange, sales, allSaleReturns, range]);
  const sparkData = useMemo(
    () => (spark12m && spark12m.length > 0 ? spark12m : []),
    [spark12m]
  );
  const totalRecentPages = useMemo(() => Math.max(1, Math.ceil(sales.length / RECENT_ORDERS_PER_PAGE)), [sales]);
  const recentOrders = useMemo(() => {
    const start = (recentOrdersPage - 1) * RECENT_ORDERS_PER_PAGE;
    return sales.slice(start, start + RECENT_ORDERS_PER_PAGE);
  }, [sales, recentOrdersPage]);

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
                  metric.id === 'netRevenue' ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-600/50' :
                  metric.id === 'profit' ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-600/50' :
                  metric.id === 'purchases' ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-600/50' :
                  metric.id === 'customers' ? 'bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-600/50' :
                  metric.id === 'family' ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-600/50' :
                  metric.id === 'charity' ? 'bg-pink-50 dark:bg-pink-900/20 border-pink-200 dark:border-pink-600/50' :
                  metric.id === 'employee' ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-600/50' :
                  metric.id === 'saleReturns' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-600/50' :
                  'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-600/50'
                }`}>
                  <div className={
                    metric.id === 'revenue' ? 'text-blue-500' :
                    metric.id === 'netRevenue' ? 'text-emerald-500' :
                    metric.id === 'profit' ? 'text-teal-500' :
                    metric.id === 'purchases' ? 'text-orange-500' :
                    metric.id === 'customers' ? 'text-sky-500' :
                    metric.id === 'family' ? 'text-purple-500' :
                    metric.id === 'charity' ? 'text-pink-500' :
                    metric.id === 'employee' ? 'text-orange-500' :
                    metric.id === 'saleReturns' ? 'text-red-500' :
                    'text-amber-500'
                  }>
                    {React.cloneElement(metric.icon as React.ReactElement, { className: 'w-3.5 h-3.5' })}
                  </div>
                  <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                    {metric.title}
                  </span>
                  <span className={`text-xs font-bold ml-1 ${
                    metric.id === 'revenue' ? 'text-blue-600 dark:text-blue-400' :
                    metric.id === 'netRevenue' ? 'text-emerald-600 dark:text-emerald-400' :
                    metric.id === 'profit' ? 'text-teal-600 dark:text-teal-400' :
                    metric.id === 'purchases' ? 'text-orange-600 dark:text-orange-400' :
                    metric.id === 'customers' ? 'text-sky-600 dark:text-sky-400' :
                    metric.id === 'family' ? 'text-purple-600 dark:text-purple-400' :
                    metric.id === 'charity' ? 'text-pink-600 dark:text-pink-400' :
                    metric.id === 'employee' ? 'text-orange-600 dark:text-orange-400' :
                    metric.id === 'saleReturns' ? 'text-red-600 dark:text-red-400' :
                    'text-amber-600 dark:text-amber-400'
                  }`}>
                    {metric.value}
                  </span>
                </div>
              </div>
            ))}
            
            <div className="ml-auto flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Period:</span>
              <input
                type="date"
                value={kpiFromDate}
                max={kpiToDate || undefined}
                onChange={(e) => { setKpiFromDate(e.target.value); setRecentOrdersPage(1); }}
                className="px-2 py-1 text-[11px] border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:ring-1 focus:ring-emerald-500 outline-none"
              />
              <span className="text-[10px] text-gray-400">to</span>
              <input
                type="date"
                value={kpiToDate}
                min={kpiFromDate || undefined}
                onChange={(e) => { setKpiToDate(e.target.value); setRecentOrdersPage(1); }}
                className="px-2 py-1 text-[11px] border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:ring-1 focus:ring-emerald-500 outline-none"
              />
              <button
                onClick={() => { const d = getDefaultKpiDates(); setKpiFromDate(d.from); setKpiToDate(d.to); setRecentOrdersPage(1); }}
                className="px-2 py-1 text-[11px] bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 text-gray-600 dark:text-gray-200 rounded-md border border-gray-200 dark:border-gray-500 font-semibold transition-colors"
              >
                This Month
              </button>
              <button
                onClick={loadData}
                className="px-3 py-1.5 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-xs font-semibold rounded-md transition-colors uppercase tracking-wide flex items-center gap-1.5 shadow-sm"
              >
                <FiRefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
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
                      <linearGradient id="netGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#077531ff" stopOpacity={1} />
                        <stop offset="100%" stopColor="#0284c7" stopOpacity={0.9} />
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
                      offset={30}
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
                    
                    {/* Main Interactive Bar - Gross */}
                    <Bar 
                      dataKey="gross" 
                      radius={[4, 4, 0, 0]} 
                      barSize={range === 'this_year' ? 20 : 10}
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

                    {/* Main Interactive Bar - Net */}
                    <Bar 
                      dataKey="net" 
                      radius={[4, 4, 0, 0]} 
                      barSize={range === 'this_year' ? 18 : 8}
                      animationDuration={1500}
                      animationEasing="ease-out"
                    >
                      {chartData.map((entry, index) => (
                        <Cell 
                          key={`cell-net-${index}`} 
                          fill="url(#netGradient)"
                          filter="url(#barShadow)"
                        />
                      ))}
                    </Bar>

                    {/* Main Interactive Bar - Profit */}
                    <Bar 
                      dataKey="profit" 
                      radius={[4, 4, 0, 0]} 
                      barSize={range === 'this_year' ? 12 : 6}
                      fill="#8b5cf6"
                      fillOpacity={0.8}
                      animationDuration={1500}
                      animationEasing="ease-out"
                    />
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
                <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1">
                    <div className="text-xl font-black text-blue-600 dark:text-blue-400 tracking-tight">
                      {formatCurrency(displayTotals.grossSubtotal ?? displayTotals.revenue)}
                    </div>
                    <div className="text-[10px] text-blue-600/70 dark:text-blue-400/80 font-bold uppercase tracking-widest leading-tight">
                      Gross Sales <span className="text-[8px] text-gray-500 normal-case font-medium block opacity-60">(Before disc. & returns)</span>
                    </div>
                  </div>
                  <div className="flex-1 sm:text-center">
                    <div className="text-xl font-black text-[#077531] dark:text-[#10B981] tracking-tight">
                      {formatCurrency(displayTotals.netRevenue)}
                    </div>
                    <div className="text-[10px] text-[#077531]/80 dark:text-[#10B981]/80 font-bold uppercase tracking-widest leading-tight">
                      Net Sales <span className="text-[8px] text-gray-500 normal-case font-medium block opacity-60">(After disc. & returns)</span>
                    </div>
                  </div>
                  <div className="flex-1 sm:text-right">
                    <div className="text-xl font-black text-purple-600 dark:text-purple-400 tracking-tight">
                      {formatCurrency(displayTotals.profit)}
                    </div>
                    <div className="text-[10px] text-purple-600/80 dark:text-purple-400/80 font-bold uppercase tracking-widest leading-tight">
                      Net Profit <span className="text-[8px] text-gray-500 normal-case font-medium block opacity-60">(Actual gain)</span>
                    </div>
                  </div>
                </div>

                <div className="h-[120px] w-full flex-shrink-0 mb-4">
                  {sparkData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={sparkData}>
                        <defs>
                          <linearGradient id="colorGross" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <Tooltip
                          offset={30}
                          contentStyle={{
                            borderRadius: '8px',
                            border: 'none',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                            fontSize: '10px',
                          }}
                          formatter={(value: any, name: any) => {
                            const n = Number(value) || 0;
                            const label =
                              name === 'gross'
                                ? 'Gross Sales'
                                : name === 'net'
                                  ? 'Net Sales'
                                  : n < 0
                                    ? 'Net Loss'
                                    : 'Net Profit';
                            return [formatCurrency(n), label];
                          }}
                          labelStyle={{ display: 'none' }}
                        />
                        <Area
                          type="monotone"
                          dataKey="gross"
                          stroke="#3B82F6"
                          fill="url(#colorGross)"
                          strokeWidth={2}
                          dot={{ r: 2, fill: '#3B82F6' }}
                          activeDot={{ r: 4 }}
                        />
                        <Area
                          type="monotone"
                          dataKey="net"
                          stroke="#10B981"
                          fill="url(#colorNet)"
                          strokeWidth={1.5}
                          dot={{ r: 1, fill: '#10B981' }}
                          activeDot={{ r: 3 }}
                        />
                        <Area
                          type="monotone"
                          dataKey="profit"
                          stroke="#8B5CF6"
                          fill="url(#colorProfit)"
                          strokeWidth={1}
                          dot={{ r: 1, fill: '#8B5CF6' }}
                          activeDot={{ r: 3 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full min-h-[120px] items-center justify-center text-xs italic text-gray-400 dark:text-gray-500">
                      Sales trend chart unavailable
                    </div>
                  )}
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
                      <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {displayTotals.profit >= 0 ? 'Net Profit' : 'Net Loss'}
                      </div>
                      <div className={`text-sm font-bold ${displayTotals.profit >= 0 ? 'text-gray-900 dark:text-white' : 'text-red-600 dark:text-red-400'}`}>
                        {formatCurrency(Math.abs(displayTotals.profit))}
                      </div>
                    </div>
                    <div className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      displayTotals.profit >= 0 ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
                    }`}>
                      {displayTotals.profit >= 0 ? 'PROFIT' : 'LOSS'}
                    </div>
                  </div>

                  {/* <div className="grid grid-cols-2 gap-2">
                    <div className="p-2.5 bg-purple-50/50 dark:bg-purple-900/10 rounded-lg border border-purple-100/50 dark:border-purple-800/30">
                      <div className="text-[9px] font-bold text-purple-600/70 dark:text-purple-400/70 uppercase tracking-wider mb-0.5">Relative</div>
                      <div className="text-xs font-bold text-purple-700 dark:text-purple-300">{formatCurrency(totals.familyTotal)}</div>
                    </div>
                    <div className="p-2.5 bg-pink-50/50 dark:bg-pink-900/10 rounded-lg border border-pink-100/50 dark:border-pink-800/30">
                      <div className="text-[9px] font-bold text-pink-600/70 dark:text-pink-400/70 uppercase tracking-wider mb-0.5">Charity</div>
                      <div className="text-xs font-bold text-pink-700 dark:text-pink-300">{formatCurrency(totals.charityTotal)}</div>
                    </div>
                  </div> */}
                </div>
              </div>
            </div>
          </section>

          <section className="mt-4 flex-shrink-0">
            <div className="bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md flex flex-col overflow-hidden">
              <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-800/10 border-b border-blue-200/50 dark:border-blue-800/30 flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide flex items-center gap-2">
                  <FiShoppingBag className="text-blue-500" />
                  Recent Sales
                  <span className="text-[10px] font-medium text-gray-400 normal-case">({sales.length} total)</span>
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setRecentOrdersPage((p) => Math.max(1, p - 1))}
                    disabled={recentOrdersPage === 1}
                    className="px-2 py-1 text-[11px] bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded font-semibold disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                  >
                    ‹ Prev
                  </button>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">
                    {recentOrdersPage} / {totalRecentPages}
                  </span>
                  <button
                    onClick={() => setRecentOrdersPage((p) => Math.min(totalRecentPages, p + 1))}
                    disabled={recentOrdersPage === totalRecentPages}
                    className="px-2 py-1 text-[11px] bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded font-semibold disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                  >
                    Next ›
                  </button>
                </div>
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
