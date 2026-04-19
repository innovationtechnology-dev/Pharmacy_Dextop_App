'use client';

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  FiCalendar,
  FiTrendingUp,
  FiTrendingDown,
  FiPieChart,
  FiDollarSign,
  FiPackage,
  FiRefreshCw,
  FiUsers,
  FiShoppingBag,
} from 'react-icons/fi';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { invokeIpc } from '../../utils/ipcHelpers';
import { useDashboardHeader } from './useDashboardHeader';
import { PharmacySettings, getStoredPharmacySettings } from '../../types/pharmacy';
import { getCurrencySymbol as getSymbol } from '../../../common/currency';

type FinancialData = {
  purchasingTotal: number;
  /** Sum of sale subtotals (qty × price) before line discounts */
  grossSubtotal?: number;
  /** Sum of invoice totals after discounts & tax (includes charity / employee / relative) */
  sellingTotal: number;
  saleReturnsTotal: number;
  purchaseDiscountTotal: number;
  saleDiscountTotal: number;
  /** Discount portion refunded with returned items */
  saleReturnDiscountTotal?: number;
  purchaseTaxTotal: number;
  saleTaxTotal: number;
  /** Tax portion refunded with returned items */
  saleReturnTaxTotal?: number;
  familyTotal: number;
  charityTotal: number;
  employeeTotal: number;
  /** Gross list − charity / relative / employee − returns (same formula as Net sales card) */
  netSalesGrossBasis?: number;
  /** Invoiced counter revenue: selling total − charity/relative/employee − returns (basis for profit) */
  netRevenue?: number;
  profit: number;
  trend: { date: string; sales: number; profit: number }[];
};

const FinancialSummary = () => {
  const { setHeader } = useDashboardHeader();
  const [pharmacySettings] = useState<PharmacySettings>(() => getStoredPharmacySettings());
  const today = useMemo(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }, []);

  const monthStart = useMemo(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-01`;
  }, []);

  const [fromDate, setFromDate] = useState<string>(monthStart);
  const [toDate, setToDate] = useState<string>(today);
  const [loading, setLoading] = useState(true);
  const [financialData, setFinancialData] = useState<FinancialData>({
    purchasingTotal: 0,
    grossSubtotal: 0,
    sellingTotal: 0,
    saleReturnsTotal: 0,
    purchaseDiscountTotal: 0,
    saleDiscountTotal: 0,
    saleReturnDiscountTotal: 0,
    purchaseTaxTotal: 0,
    saleTaxTotal: 0,
    saleReturnTaxTotal: 0,
    familyTotal: 0,
    charityTotal: 0,
    employeeTotal: 0,
    netSalesGrossBasis: 0,
    netRevenue: 0,
    profit: 0,
    trend: [],
  });

  const companyExpenses = useMemo(() => {
    return (financialData.familyTotal || 0) + (financialData.charityTotal || 0) + (financialData.employeeTotal || 0);
  }, [financialData.familyTotal, financialData.charityTotal, financialData.employeeTotal]);

  /** Total at checkout list prices — before discounts, returns and any deductions. */
  const grossSalesDisplay = useMemo(
    () => Math.max(0, financialData.grossSubtotal ?? 0),
    [financialData.grossSubtotal]
  );

  /** Invoiced net (after line discounts) — matches backend profit; charity/relative/employee are invoice totals */
  const invoicedNetSales = useMemo(() => {
    return Math.max(0, (financialData.sellingTotal || 0) - companyExpenses - (financialData.saleReturnsTotal || 0));
  }, [financialData.sellingTotal, financialData.saleReturnsTotal, companyExpenses]);

  /**
   * Net sales (KPI): list value after returns, minus charity / relative / employee programme invoices.
   * Matches backend netSalesGrossBasis (grossSubtotal − returns − company expenses).
   */
  const netSales = useMemo(() => {
    const fromApi = financialData.netSalesGrossBasis;
    if (typeof fromApi === 'number' && !Number.isNaN(fromApi)) {
      return Math.max(0, fromApi);
    }
    return Math.max(0, grossSalesDisplay - (financialData.saleDiscountTotal ?? 0) - companyExpenses - (financialData.saleReturnsTotal ?? 0));
  }, [financialData.netSalesGrossBasis, grossSalesDisplay, financialData.saleDiscountTotal, financialData.saleReturnsTotal, companyExpenses]);

  /** Key totals for donut — matches detailed breakdown emphasis */
  const pieBreakdown = useMemo(() => {
    const items = [
      { name: 'Purchases', value: Math.max(0, financialData.purchasingTotal), color: '#3B82F6' },
      { name: 'Net sales', value: Math.max(0, netSales), color: '#14B8A6' },
      { name: 'Returns', value: Math.max(0, financialData.saleReturnsTotal), color: '#EF4444' },
      { name: 'Net profit', value: Math.max(0, financialData.profit), color: '#10B981' },
    ].filter((x) => x.value > 0);
    const sum = items.reduce((a, b) => a + b.value, 0);
    return { items, sum };
  }, [financialData, netSales]);

  const chartPalette = useMemo(
    () => ({
      profitLine: '#0d9488',
      volUp: '#16a34a',
      volDown: '#dc2626',
    }),
    []
  );

  /** Volume bar colors: day-over-day sales change (up = green, down = red) */
  const trendChartData = useMemo(() => {
    const { volUp, volDown } = chartPalette;
    const t = financialData.trend || [];
    return t.map((row, i) => {
      if (i === 0) {
        return { ...row, barFill: volUp };
      }
      const prevSales = t[i - 1].sales;
      const salesUp = row.sales >= prevSales;
      return {
        ...row,
        barFill: salesUp ? volUp : volDown,
      };
    });
  }, [financialData.trend, chartPalette]);

  const getCurrencySymbol = () => getSymbol(pharmacySettings.currency || 'USD');

  const formatCurrency = (value: number) => {
    const sym = getCurrencySymbol().trim();
    const num = value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${sym} ${num}`;
  };

  const formatAxisCompact = (value: number) => {
    const sym = getCurrencySymbol().trim();
    const v = Math.abs(value);
    if (v >= 1_000_000) return `${sym} ${(value / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${sym} ${(value / 1_000).toFixed(1)}k`;
    return `${sym} ${Math.round(value)}`;
  };

  const TradingTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="min-w-[180px] rounded-lg border border-gray-200 bg-white px-3 py-2.5 shadow-lg backdrop-blur-sm dark:border-gray-600 dark:bg-gray-800">
        <p className="mb-2 border-b border-gray-100 pb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:border-gray-600 dark:text-gray-400">
          {new Date(label).toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>
        {payload.map((p: any) => (
          <div key={String(p.dataKey)} className="flex justify-between gap-6 text-[11px]">
            <span className="font-semibold capitalize" style={{ color: p.color }}>
              {p.name}
            </span>
            <span className="font-mono font-bold tabular-nums text-gray-900 dark:text-gray-100">
              {formatCurrency(Number(p.value))}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const PieTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const p = payload[0];
    const pct = pieBreakdown.sum > 0 ? ((p.value / pieBreakdown.sum) * 100).toFixed(1) : '0';
    return (
      <div className="rounded-xl border border-gray-200/80 bg-white/95 px-3 py-2.5 text-xs shadow-xl backdrop-blur-sm dark:border-gray-600 dark:bg-gray-800/95">
        <p className="font-bold text-gray-900 dark:text-white">{p.name}</p>
        <p className="mt-0.5 font-mono text-gray-600 dark:text-gray-300">
          {formatCurrency(p.value)} <span className="text-gray-400">({pct}%)</span>
        </p>
      </div>
    );
  };

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const loadFinancialData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invokeIpc<FinancialData>(
        'financial-get-date-range',
        'financial-get-date-range-reply',
        [fromDate, toDate]
      );
      if (data) setFinancialData(data);
    } catch (error) {
      console.error('Failed to load financial data:', error);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    loadFinancialData();
  }, [loadFinancialData]);

  useEffect(() => {
    setHeader({
      title: 'Financial Summary',
      subtitle: `${formatDisplayDate(fromDate)} - ${formatDisplayDate(toDate)}`,
    });
    return () => setHeader(null);
  }, [setHeader, fromDate, toDate]);

  const handleDateRangeChange = () => {
    loadFinancialData();
  };

  const toLocalIso = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const setCurrentMonth = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    setFromDate(toLocalIso(start));
    setToDate(toLocalIso(now));
  };

  const setCurrentYear = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    setFromDate(toLocalIso(start));
    setToDate(toLocalIso(now));
  };

  return (
    <div className="flex flex-col h-auto md:h-[calc(100vh-80px)] w-full bg-gradient-to-br from-gray-50 via-gray-50 to-gray-100/50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 overflow-visible md:overflow-hidden px-4 pb-4 md:pb-0">
      <div className="flex-1 flex flex-col min-h-0">

        {/* Stats Bar */}
        <div className="bg-gradient-to-br from-white via-white to-gray-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-gray-800/90 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-3 mb-2 flex flex-wrap items-center gap-3 flex-shrink-0">
          <div className="flex items-center gap-1.5 bg-orange-50 dark:bg-orange-900/20 px-2.5 py-1.5 rounded-md border border-orange-200 dark:border-orange-600/50 shadow-sm">
            <FiPackage className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Purchases</span>
            <span className="text-xs font-bold text-orange-600 dark:text-orange-400 ml-1">
              {formatCurrency(financialData.purchasingTotal)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1.5 rounded-md border border-blue-200 dark:border-blue-600/50 shadow-sm">
            <FiDollarSign className="w-3.5 h-3.5 text-blue-500" />
            <span
              className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide"
              title="Total at checkout list prices, before discounts, returns and deductions."
            >
              Gross sales
            </span>
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 ml-1">
              {formatCurrency(grossSalesDisplay)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1.5 rounded-md border border-emerald-200 dark:border-emerald-600/50 shadow-sm">
            <FiShoppingBag className="w-3.5 h-3.5 text-emerald-500" />
            <span
              className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide"
              title="Gross sales minus discounts, returns and deductions."
            >
              Net sales
            </span>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 ml-1">
              {formatCurrency(netSales)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-900/20 px-2.5 py-1.5 rounded-md border border-red-200 dark:border-red-600/50 shadow-sm">
            <FiTrendingDown className="w-3.5 h-3.5 text-red-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Returns</span>
            <span className="text-xs font-bold text-red-600 dark:text-red-400 ml-1">
              {formatCurrency(financialData.saleReturnsTotal)}
            </span>
          </div>

          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border shadow-sm ${financialData.profit >= 0 ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-600/50' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-600/50'}`}>
            <FiDollarSign className={`w-3.5 h-3.5 ${financialData.profit >= 0 ? 'text-teal-500' : 'text-red-500'}`} />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              {financialData.profit >= 0 ? 'Net Profit' : 'Net Loss'}
            </span>
            <span className={`text-xs font-bold ml-1 ${financialData.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {formatCurrency(Math.abs(financialData.profit))}
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-purple-50 dark:bg-purple-900/20 px-2.5 py-1.5 rounded-md border border-purple-200 dark:border-purple-600/50 shadow-sm">
            <FiUsers className="w-3.5 h-3.5 text-purple-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Relative</span>
            <span className="text-xs font-bold text-purple-600 dark:text-purple-400 ml-1">
              {formatCurrency(financialData.familyTotal)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-pink-50 dark:bg-pink-900/20 px-2.5 py-1.5 rounded-md border border-pink-200 dark:border-pink-600/50 shadow-sm">
            <FiPieChart className="w-3.5 h-3.5 text-pink-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Charity</span>
            <span className="text-xs font-bold text-pink-600 dark:text-pink-400 ml-1">
              {formatCurrency(financialData.charityTotal)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-orange-50 dark:bg-orange-900/20 px-2.5 py-1.5 rounded-md border border-orange-200 dark:border-orange-600/50 shadow-sm">
            <FiUsers className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Employee</span>
            <span className="text-xs font-bold text-orange-600 dark:text-orange-400 ml-1">
              {formatCurrency(financialData.employeeTotal)}
            </span>
          </div>

          <button
            onClick={loadFinancialData}
            className="ml-auto px-3 py-1.5 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-xs font-semibold rounded-md transition-colors uppercase tracking-wide flex items-center gap-1.5 shadow-sm"
          >
            <FiRefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Date Selection */}
        <div className="bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md p-3 mb-2 flex-shrink-0">
          <div className="flex items-center justify-between flex-wrap gap-4 px-2">
            <div className="flex items-center gap-2">
              <FiCalendar className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Reporting Period</span>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">From</span>
                <input
                  type="date"
                  value={fromDate}
                  max={today}
                  onChange={(e) => setFromDate(e.target.value)}
                  onBlur={handleDateRangeChange}
                  className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">To</span>
                <input
                  type="date"
                  value={toDate}
                  max={today}
                  onChange={(e) => setToDate(e.target.value)}
                  onBlur={handleDateRangeChange}
                  className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div className="flex items-center gap-1.5 ml-2 border-l border-gray-200 dark:border-gray-700 pl-3">
                <button
                  onClick={setCurrentMonth}
                  className="px-2.5 py-1 text-[10px] font-bold bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded transition-colors uppercase"
                >
                  This Month
                </button>
                <button
                  onClick={setCurrentYear}
                  className="px-2.5 py-1 text-[10px] font-bold bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded transition-colors uppercase"
                >
                  This Year
                </button>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-gray-600 dark:text-gray-400 text-sm">Analysing financials...</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2 flex-1 overflow-hidden min-h-0">
            {/* Left: Detailed Breakdown */}
            <div className="flex h-full min-h-0 flex-col self-stretch pr-1">
              <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-gray-200 bg-white shadow-md dark:border-gray-700 dark:bg-gray-800 overflow-hidden">

                {/* Panel header */}
                <div className="shrink-0 flex items-center gap-3 px-5 py-4 border-b-2 border-gray-200 dark:border-gray-600 bg-gradient-to-r from-slate-50 to-white dark:from-gray-800/60 dark:to-gray-800">
                  <FiPieChart className="w-5 h-5 text-blue-600 shrink-0" />
                  <div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-gray-50 leading-tight">Detailed breakdown</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">These figures use the dates you selected above</p>
                  </div>
                </div>

                {/* Body — comfortable spacing; KPI grid does not stretch vertically */}
                <div className="flex flex-1 flex-col gap-4 p-5 min-h-0 overflow-y-auto">

                  {/* Primary KPIs */}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Purchasing total', value: financialData.purchasingTotal, accent: 'border-l-blue-500', val: 'text-blue-700 dark:text-blue-300', bg: 'bg-blue-50/60 dark:bg-blue-950/30', icon: <FiPackage className="w-4 h-4 text-blue-500 shrink-0" /> },
                      {
                        label: 'Gross sales',
                        sub: 'Total at checkout list prices (before discounts, returns and deductions)',
                        value: grossSalesDisplay,
                        accent: 'border-l-amber-500',
                        val: 'text-amber-700 dark:text-amber-300',
                        bg: 'bg-amber-50/60 dark:bg-amber-950/30',
                        icon: <FiDollarSign className="w-4 h-4 text-amber-500 shrink-0" />,
                      },
                      { label: 'Return amount', value: financialData.saleReturnsTotal, accent: 'border-l-red-500', val: 'text-red-700 dark:text-red-300', bg: 'bg-red-50/60 dark:bg-red-950/30', icon: <FiTrendingDown className="w-4 h-4 text-red-500 shrink-0" /> },
                      {
                        label: 'Net sales',
                        sub: 'Gross sales minus discounts, returns and charity/relative/employee deductions',
                        value: netSales,
                        accent: 'border-l-teal-500',
                        val: 'text-teal-700 dark:text-teal-300',
                        bg: 'bg-teal-50/60 dark:bg-teal-950/30',
                        icon: <FiTrendingUp className="w-4 h-4 text-teal-500 shrink-0" />,
                      },
                    ].map((item) => (
                      <div key={item.label} className={`flex flex-col rounded-xl border border-gray-200 dark:border-gray-600 border-l-4 ${item.accent} ${item.bg} px-4 py-4 shadow-sm`}>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 leading-snug block">{item.label}</span>
                            {'sub' in item && item.sub ? (
                              <span className="text-[11px] text-gray-600 dark:text-gray-400 leading-snug mt-0.5 block">{item.sub}</span>
                            ) : null}
                          </div>
                          {item.icon}
                        </div>
                        <span className={`text-xl font-bold tabular-nums tracking-tight ${item.val}`}>{formatCurrency(item.value)}</span>
                      </div>
                    ))}
                  </div>


                  {/* Discounts and taxes */}
                  <div className="shrink-0 rounded-xl border-2 border-gray-200 bg-slate-50/90 dark:border-gray-600 dark:bg-gray-800/90 px-4 py-4">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 pb-2 border-b border-gray-200 dark:border-gray-600">Discounts and taxes</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'Purchase discounts', value: financialData.purchaseDiscountTotal, color: 'text-emerald-700 dark:text-emerald-300' },
                        { label: 'Sale discounts', value: Math.max(0, (financialData.saleDiscountTotal ?? 0) - (financialData.saleReturnDiscountTotal ?? 0)), color: 'text-amber-700 dark:text-amber-300' },
                        { label: 'Purchase taxes', value: financialData.purchaseTaxTotal, color: 'text-red-700 dark:text-red-300' },
                        { label: 'Sale taxes', value: Math.max(0, (financialData.saleTaxTotal ?? 0) - (financialData.saleReturnTaxTotal ?? 0)), color: 'text-blue-700 dark:text-blue-300' },
                      ].map((d) => (
                        <div key={d.label} className="min-w-0 rounded-lg bg-white dark:bg-gray-900/50 px-3 py-2.5 border border-gray-200 dark:border-gray-600">
                          <p className="text-xs font-medium text-gray-800 dark:text-gray-100 leading-snug">{d.label}</p>
                          <p className={`mt-2 text-base font-semibold tabular-nums ${d.color}`}>{formatCurrency(d.value)}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Relative, charity, employee */}
                  <div className="shrink-0 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { label: 'Relative', value: financialData.familyTotal, border: 'border-violet-300 dark:border-violet-600', bg: 'bg-violet-50 dark:bg-violet-950/40', label_c: 'text-violet-900 dark:text-violet-100', val_c: 'text-violet-950 dark:text-white' },
                      { label: 'Charity', value: financialData.charityTotal, border: 'border-pink-300 dark:border-pink-600', bg: 'bg-pink-50 dark:bg-pink-950/40', label_c: 'text-pink-900 dark:text-pink-100', val_c: 'text-pink-950 dark:text-white' },
                      { label: 'Employee', value: financialData.employeeTotal, border: 'border-orange-300 dark:border-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40', label_c: 'text-orange-900 dark:text-orange-100', val_c: 'text-orange-950 dark:text-white' },
                    ].map((b) => (
                      <div key={b.label} className={`rounded-xl border-2 ${b.border} ${b.bg} px-4 py-3`}>
                        <p className={`text-xs font-semibold ${b.label_c}`}>{b.label}</p>
                        <p className={`mt-2 text-base font-bold tabular-nums ${b.val_c}`}>{formatCurrency(b.value)}</p>
                      </div>
                    ))}
                  </div>

                  {/* Net profit */}
                  <div className={`shrink-0 rounded-xl border-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-5 py-5 shadow-md ${
                    financialData.profit >= 0
                      ? 'border-emerald-300 bg-gradient-to-r from-emerald-50 to-teal-50 dark:border-emerald-600 dark:from-emerald-950/50 dark:to-teal-950/30'
                      : 'border-red-300 bg-gradient-to-r from-red-50 to-rose-50 dark:border-red-600 dark:from-red-950/50 dark:to-rose-950/30'
                  }`}>
                    <div>
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                        {financialData.profit >= 0 ? 'Net profit' : 'Net loss'}
                      </p>
                      <p className={`text-3xl font-bold tabular-nums leading-tight mt-1 ${financialData.profit >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                        {formatCurrency(Math.abs(financialData.profit))}
                      </p>
                    </div>
                    <div className="text-left sm:text-right border-t sm:border-t-0 border-gray-300/80 dark:border-gray-600 pt-3 sm:pt-0 sm:pl-6 sm:border-l sm:border-gray-300/80 dark:sm:border-gray-600">
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Profit margin</p>
                      <p className={`text-3xl font-bold tabular-nums leading-tight mt-1 ${financialData.profit >= 0 ? 'text-gray-900 dark:text-white' : 'text-red-700'}`}>
                        {(financialData.netRevenue ?? invoicedNetSales) > 0
                          ? Math.round((financialData.profit / (financialData.netRevenue ?? invoicedNetSales)) * 100)
                          : 0 }%
                      </p>
                    </div>
                  </div>

                </div>
              </div>
            </div>

            {/* Right: trading-style trend + composition pie */}
            <div className="flex h-full min-h-0 flex-col gap-4 self-stretch overflow-y-auto">
              <div className="flex min-h-[360px] flex-1 flex-col overflow-hidden rounded-xl border border-blue-200/50 bg-gradient-to-br from-white via-white to-blue-50/30 shadow-md dark:border-blue-800/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200/70 px-4 py-3 dark:border-gray-700/80">
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-gray-800 dark:text-gray-100">
                      <FiTrendingUp className="text-teal-600" />
                      Sales &amp; profit
                    </h3>
                    <p className="mt-1 max-w-md text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                      Bars show each day&apos;s sales (green if higher than the day before, red if lower). The teal line is net profit.
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-3 text-xs font-medium text-gray-700 dark:text-gray-300">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-sm"
                        style={{ backgroundColor: chartPalette.profitLine }}
                      />
                      Net profit
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-sm"
                        style={{ backgroundColor: chartPalette.volUp }}
                      />
                      Sales up
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-sm"
                        style={{ backgroundColor: chartPalette.volDown }}
                      />
                      Sales down
                    </span>
                  </div>
                </div>
                <div className="relative mx-3 mb-3 mt-1 min-h-[280px] flex-1 rounded-lg border border-gray-200 bg-white px-2 pb-2 pt-2 shadow-inner dark:border-gray-600 dark:bg-gray-800/80">
                  {trendChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={trendChartData}
                        margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid stroke="#cbd5e1" strokeDasharray="3 3" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tick={{ fill: '#64748b', fontSize: 10, fontWeight: 500 }}
                          axisLine={{ stroke: '#cbd5e1' }}
                          tickLine={false}
                          tickFormatter={(val) =>
                            new Date(val).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })
                          }
                          minTickGap={28}
                        />
                        <YAxis
                          yAxisId="profit"
                          orientation="left"
                          tick={{ fill: '#64748b', fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={formatAxisCompact}
                          width={58}
                        />
                        <YAxis
                          yAxisId="vol"
                          orientation="right"
                          tick={{ fill: '#64748b', fontSize: 9 }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={formatAxisCompact}
                          width={54}
                        />
                        <Tooltip
                          content={<TradingTooltip />}
                          cursor={{ fill: 'rgba(13, 148, 136, 0.12)' }}
                        />
                        <Bar
                          yAxisId="vol"
                          dataKey="sales"
                          name="Daily sales"
                          radius={[2, 2, 0, 0]}
                          maxBarSize={32}
                        >
                          {trendChartData.map((entry, index) => (
                            <Cell
                              key={`${entry.date}-${index}`}
                              fill={entry.barFill}
                              fillOpacity={0.72}
                            />
                          ))}
                        </Bar>
                        <Line
                          yAxisId="profit"
                          type="monotone"
                          dataKey="profit"
                          name="Net profit"
                          stroke={chartPalette.profitLine}
                          strokeWidth={2.5}
                          dot={false}
                          isAnimationActive={false}
                          activeDot={{
                            r: 5,
                            strokeWidth: 2,
                            stroke: '#fff',
                            fill: chartPalette.profitLine,
                          }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full min-h-[220px] items-center justify-center text-xs italic text-gray-400 dark:text-gray-500">
                      No trend data for selected range
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-blue-200/50 bg-gradient-to-br from-white via-white to-emerald-50/25 p-4 shadow-md dark:border-blue-800/30 dark:from-gray-800 dark:via-gray-800 dark:to-emerald-950/25">
                <h3 className="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-gray-800 dark:text-gray-100">
                  <FiPieChart className="text-emerald-500" />
                  Period composition
                </h3>
                <p className="mb-4 text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Share of purchases, net sales, returns &amp; net profit (same period)
                </p>
                {pieBreakdown.items.length > 0 && pieBreakdown.sum > 0 ? (
                  <div className="flex flex-col items-stretch gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="mx-auto h-[260px] w-full max-w-[300px] lg:mx-0 lg:flex-1">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieBreakdown.items}
                            cx="50%"
                            cy="50%"
                            innerRadius="56%"
                            outerRadius="86%"
                            paddingAngle={2}
                            dataKey="value"
                            nameKey="name"
                            label={false}
                          >
                            {pieBreakdown.items.map((entry) => (
                              <Cell
                                key={entry.name}
                                fill={entry.color}
                                stroke="rgba(255,255,255,0.12)"
                                strokeWidth={1}
                              />
                            ))}
                          </Pie>
                          <Tooltip content={<PieTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <ul className="flex w-full min-w-0 flex-col gap-2 lg:max-w-[220px]">
                      {pieBreakdown.items.map((item) => {
                        const pct = ((item.value / pieBreakdown.sum) * 100).toFixed(1);
                        return (
                          <li
                            key={item.name}
                            className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-white/80 px-3 py-2.5 text-[11px] shadow-sm dark:border-gray-600 dark:bg-gray-800/70"
                          >
                            <span className="flex min-w-0 items-center gap-2 font-semibold text-gray-700 dark:text-gray-200">
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: item.color }}
                              />
                              <span className="truncate">{item.name}</span>
                            </span>
                            <span className="shrink-0 font-mono text-xs font-bold tabular-nums text-gray-900 dark:text-white">
                              {pct}%
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : (
                  <div className="flex h-36 items-center justify-center rounded-lg border border-dashed border-gray-200 text-xs italic text-gray-400 dark:border-gray-600 dark:text-gray-500">
                    No amounts to chart for this period
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FinancialSummary;
