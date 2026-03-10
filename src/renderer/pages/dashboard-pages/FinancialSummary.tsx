'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  FiCalendar,
  FiTrendingUp,
  FiTrendingDown,
  FiPieChart,
  FiDollarSign,
  FiPackage,
  FiRefreshCw,
} from 'react-icons/fi';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import { invokeIpc } from '../../utils/ipcHelpers';
import { useDashboardHeader } from './useDashboardHeader';
import { PharmacySettings, getStoredPharmacySettings } from '../../types/pharmacy';
import { getCurrencySymbol as getSymbol } from '../../../common/currency';

type FinancialData = {
  purchasingTotal: number;
  sellingTotal: number;
  saleReturnsTotal: number;
  purchaseDiscountTotal: number;
  saleDiscountTotal: number;
  purchaseTaxTotal: number;
  saleTaxTotal: number;
  profit: number;
  trend: { date: string; sales: number; profit: number }[];
};

const FinancialSummary = () => {
  const { setHeader } = useDashboardHeader();
  const [pharmacySettings] = useState<PharmacySettings>(() => getStoredPharmacySettings());
  const [fromDate, setFromDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(1); // Start of month
    return d.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [financialData, setFinancialData] = useState<FinancialData>({
    purchasingTotal: 0,
    sellingTotal: 0,
    saleReturnsTotal: 0,
    purchaseDiscountTotal: 0,
    saleDiscountTotal: 0,
    purchaseTaxTotal: 0,
    saleTaxTotal: 0,
    profit: 0,
    trend: [],
  });

  const getCurrencySymbol = () => getSymbol(pharmacySettings.currency || 'USD');

  const formatCurrency = (value: number) => {
    return `${getCurrencySymbol()}${value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
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
        'financial-get-summary',
        'financial-get-summary-reply',
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

  const setCurrentMonth = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    setFromDate(start.toISOString().split('T')[0]);
    setToDate(now.toISOString().split('T')[0]);
  };

  const setCurrentYear = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    setFromDate(start.toISOString().split('T')[0]);
    setToDate(now.toISOString().split('T')[0]);
  };

  return (
    <div className="flex flex-col h-auto md:h-[calc(100vh-80px)] w-full bg-gradient-to-br from-gray-50 via-gray-50 to-gray-100/50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 overflow-visible md:overflow-hidden px-4 pb-4 md:pb-0">
      <div className="flex-1 flex flex-col min-h-0">
        
        {/* Stats Bar */}
        <div className="bg-gradient-to-br from-white via-white to-gray-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-gray-800/90 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-3 mb-2 flex flex-wrap items-center gap-3 flex-shrink-0">
          <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1.5 rounded-md border border-blue-200 dark:border-blue-600/50 shadow-sm">
            <FiPackage className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Purchases</span>
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 ml-1">
              {formatCurrency(financialData.purchasingTotal)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1.5 rounded-md border border-emerald-200 dark:border-emerald-600/50 shadow-sm">
            <FiDollarSign className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Gross Sales</span>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 ml-1">
              {formatCurrency(financialData.sellingTotal)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-900/20 px-2.5 py-1.5 rounded-md border border-red-200 dark:border-red-600/50 shadow-sm">
            <FiTrendingDown className="w-3.5 h-3.5 text-red-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Returns</span>
            <span className="text-xs font-bold text-red-600 dark:text-red-400 ml-1">
              {formatCurrency(financialData.saleReturnsTotal)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-teal-50 dark:bg-teal-900/20 px-2.5 py-1.5 rounded-md border border-teal-200 dark:border-teal-600/50 shadow-sm">
            <FiDollarSign className="w-3.5 h-3.5 text-teal-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Net Profit</span>
            <span className={`text-xs font-bold ml-1 ${financialData.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {formatCurrency(financialData.profit)}
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 overflow-hidden min-h-0">
            {/* Left side: Breakdown */}
            <div className="flex flex-col gap-4 overflow-y-auto pr-1">
              <div className="bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md p-4 flex flex-col min-h-0">
                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-4 flex items-center gap-2">
                  <FiPieChart className="text-blue-500" />
                  Detailed Breakdown
                </h3>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-blue-50/50 dark:bg-blue-900/10 p-3 rounded-lg border border-blue-100 dark:border-blue-800/30">
                      <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1">Purchasing total</div>
                      <div className="text-lg font-black text-blue-600 dark:text-blue-400">{formatCurrency(financialData.purchasingTotal)}</div>
                    </div>
                    <div className="bg-emerald-50/50 dark:bg-emerald-900/10 p-3 rounded-lg border border-emerald-100 dark:border-emerald-800/30">
                      <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1">Gross sales</div>
                      <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(financialData.sellingTotal)}</div>
                    </div>
                  </div>

                  <div className="bg-gradient-to-r from-gray-50 to-gray-100/50 dark:from-gray-800 dark:to-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Purchase Discounts</p>
                        <p className="text-sm font-bold text-green-600">{formatCurrency(financialData.purchaseDiscountTotal)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Sale Discounts</p>
                        <p className="text-sm font-bold text-orange-600">{formatCurrency(financialData.saleDiscountTotal)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Purchase Taxes</p>
                        <p className="text-sm font-bold text-red-600">{formatCurrency(financialData.purchaseTaxTotal)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Sale Taxes</p>
                        <p className="text-sm font-bold text-blue-600">{formatCurrency(financialData.saleTaxTotal)}</p>
                      </div>
                    </div>
                  </div>

                  <div className={`p-4 rounded-lg border flex items-center justify-between ${
                    financialData.profit >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
                  }`}>
                    <div>
                      <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Net Profit Margin</p>
                      <p className={`text-2xl font-black ${financialData.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {formatCurrency(financialData.profit)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Margin %</p>
                      <p className="text-xl font-bold text-gray-700 dark:text-gray-300">
                         {financialData.sellingTotal > 0 ? Math.round((financialData.profit / financialData.sellingTotal) * 100) : 0}%
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right side: Trend */}
            <div className="flex flex-col gap-4 overflow-y-auto">
              <div className="bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md p-4 flex-1 flex flex-col min-h-0">
                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-4 flex items-center gap-2">
                  <FiTrendingUp className="text-emerald-500" />
                  Profit Trend
                </h3>
                
                <div className="flex-1 min-h-0">
                  {financialData.trend?.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={financialData.trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                        <XAxis 
                          dataKey="date" 
                          axisLine={false} 
                          tickLine={false}
                          tick={{ fill: '#9CA3AF', fontSize: 10 }}
                          tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false}
                          tick={{ fill: '#9CA3AF', fontSize: 10 }}
                          tickFormatter={(val) => formatCurrency(val)}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            borderRadius: '8px', 
                            border: 'none', 
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                            fontSize: '11px'
                          }}
                        />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                        <Line type="monotone" dataKey="sales" stroke="#3B82F6" strokeWidth={3} dot={false} />
                        <Line type="monotone" dataKey="profit" stroke="#10B981" strokeWidth={3} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-gray-400 text-xs italic">
                      No trend data for selected range
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FinancialSummary;
