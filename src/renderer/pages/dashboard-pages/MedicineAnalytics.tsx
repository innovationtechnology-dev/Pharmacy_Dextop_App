'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FiSearch, FiPackage, FiTrendingUp, FiTrendingDown, FiRefreshCw,
  FiDollarSign, FiBarChart2, FiAlertCircle, FiCalendar, FiX, FiShoppingCart, FiTag, FiBox, FiActivity
} from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { invokeIpc } from '../../utils/ipcHelpers';
import { useDashboardHeader } from './useDashboardHeader';
import { PharmacySettings, getStoredPharmacySettings } from '../../types/pharmacy';
import { getCurrencySymbol as getSymbol } from '../../../common/currency';

/* ─── types ─────────────────────────────────────────────────────────────── */
interface Medicine {
  id: number;
  name: string;
  barcode?: string;
  pillQuantity?: number;
  status?: string;
}

interface MedicineFinancialDetails {
  totalPurchasedQty: number;
  totalPurchaseCost: number;
  totalSoldQty: number;
  totalSaleRevenue: number;
  totalReturnedQty: number;
  totalReturnAmount: number;
  remainingStock: number;
  netRevenue: number;
  totalProfit: number;
}

/* ─── component ─────────────────────────────────────────────────────────── */
const MedicineAnalytics: React.FC = () => {
  const { setHeader } = useDashboardHeader();
  const navigate = useNavigate();
  const [pharmacySettings] = useState<PharmacySettings>(() => getStoredPharmacySettings());

  /* search state */
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Medicine[]>([]);
  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  /* date state */
  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showCustomDates, setShowCustomDates] = useState(false);

  /* data state */
  const [details, setDetails] = useState<MedicineFinancialDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ── formatting ─────────────────────────────────────────────────────── */
  const getCurrencySymbol = () => getSymbol(pharmacySettings.currency || 'USD');
  const formatCurrency = useCallback((value: number) => {
    const sym = getCurrencySymbol().trim();
    const num = Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${sym} ${num}`;
  }, [pharmacySettings.currency]);

  const formatQty = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatIntQty = (n: number) => n.toLocaleString();

  /* ── header ─────────────────────────────────────────────────────────── */
  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return 'All Time';
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  useEffect(() => {
    const dateRangeStr = fromDate && toDate ? `${formatDisplayDate(fromDate)} - ${formatDisplayDate(toDate)}` : 'All Time';
    setHeader({
      title: 'Medicine Analytics',
      subtitle: selectedMedicine 
        ? `Financial performance for ${selectedMedicine.name} (${dateRangeStr})`
        : `Select a medicine to analyze financial performance (${dateRangeStr})`,
    });
    return () => setHeader(null);
  }, [setHeader, fromDate, toDate, selectedMedicine]);

  /* ── click-outside to close dropdown ────────────────────────────────── */
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  /* ── search medicines ───────────────────────────────────────────────── */
  useEffect(() => {
    // DO NOT search if the term is empty or exactly the name of the selected medicine
    if (!searchTerm.trim() || searchTerm.length < 1 || (selectedMedicine && searchTerm === selectedMedicine.name)) {
      if (!searchTerm.trim()) setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const results = await invokeIpc<Medicine[]>('medicine-search', 'medicine-search-reply', [searchTerm]);
        setSearchResults(results || []);
        setShowDropdown(true);
      } catch {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, selectedMedicine]);

  /* ── fetch financial details ─────────────────────────────────────────── */
  const fetchDetails = useCallback(async (medicine: Medicine, from: string, to: string) => {
    setLoading(true);
    setError(null);
    setDetails(null);
    try {
      const data = await invokeIpc<MedicineFinancialDetails>(
        'medicine-get-financial-details',
        'medicine-get-financial-details-reply',
        [medicine.id, from, to]
      );
      setDetails(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSelect = (medicine: Medicine) => {
    setSelectedMedicine(medicine);
    setSearchTerm(medicine.name);
    setShowDropdown(false);
    fetchDetails(medicine, fromDate, toDate);
  };

  const handleClearSelection = () => {
    setSelectedMedicine(null);
    setSearchTerm('');
    setDetails(null);
    setError(null);
  };

  const handleApplyDates = () => {
    if (selectedMedicine) fetchDetails(selectedMedicine, fromDate, toDate);
  };

  /* ── chart data ────────────────────────────────────────────────────── */
  const pieData = useMemo(() => {
    if (!details) return [{ name: 'N/A', value: 100, color: '#e5e7eb' }];
    const revenue = Math.max(0, details.netRevenue);
    const profit = Math.max(0, details.totalProfit);
    const cost = Math.max(0, revenue - profit);
    
    return [
      { name: 'Profit', value: profit, color: '#10b981' }, // Emerald
      { name: 'Cost', value: cost || 1, color: '#3b82f6' }, // Blue
    ];
  }, [details]);

  /* ── render ──────────────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col h-auto md:h-[calc(100vh-80px)] w-full bg-gradient-to-br from-gray-50 via-gray-50 to-gray-100/50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800/80 overflow-visible md:overflow-hidden px-4 pb-4 md:pb-0 font-sans">
      
      {/* ── Top Filter Bar ── */}
      <div className="bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md p-3 mb-2 flex flex-wrap items-center gap-3 shrink-0">
        
        {/* Medicine search */}
        <div className="flex-1 min-w-[300px] relative" ref={searchRef}>
          <div className="relative flex items-center">
            <FiSearch className="absolute left-3 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                if (!e.target.value) handleClearSelection();
              }}
              placeholder="Search medicine, batch, or invoice..."
              className="w-full pl-9 pr-9 py-1.5 h-9 text-xs font-semibold border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 outline-none shadow-sm transition-all font-sans"
            />
            {searchTerm && (
              <button
                onClick={handleClearSelection}
                className="absolute right-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <FiX className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Dropdown */}
          {showDropdown && searchResults.length > 0 && (
            <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl overflow-hidden max-h-64 overflow-y-auto font-sans">
              {searchResults.map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleSelect(m)}
                  className="w-full text-left px-4 py-3 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 flex items-center gap-3 border-b border-gray-100 dark:border-gray-700 last:border-b-0 transition-colors group"
                >
                  <span className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                    <FiPackage className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors truncate font-sans">
                      {m.name}
                    </p>
                    {m.barcode && (
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 font-mono tracking-tighter truncate max-w-full" title={m.barcode}>
                        {m.barcode}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 hidden sm:block" />

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCustomDates(!showCustomDates)}
            className={`px-4 py-1.5 h-9 border rounded-md text-xs font-semibold uppercase tracking-wide transition-all font-sans flex items-center gap-2 shadow-sm ${
              showCustomDates 
                ? 'bg-emerald-600 text-white border-emerald-600' 
                : 'bg-white dark:bg-gray-700 text-black dark:text-white border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
            }`}
          >
            <FiCalendar className={`w-3.5 h-3.5 ${showCustomDates ? 'text-white' : 'text-black dark:text-white'}`} />
            Custom
          </button>

          {showCustomDates && (
            <div className="flex items-center gap-3 animate-fadeIn font-sans bg-gray-50 dark:bg-gray-800/50 p-1 rounded-md border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 px-2">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-black dark:text-gray-400">From</span>
                <input
                  type="date"
                  value={fromDate}
                  max={today}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="px-2 py-1.5 h-7 text-xs font-semibold border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                />
              </div>

              <div className="flex items-center gap-2 px-2">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-black dark:text-gray-400">To</span>
                <input
                  type="date"
                  value={toDate}
                  max={today}
                  onChange={(e) => setToDate(e.target.value)}
                  className="px-2 py-1.5 h-7 text-xs font-semibold border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                />
              </div>

              <button
                onClick={handleApplyDates}
                disabled={!selectedMedicine || loading}
                className="px-3 py-1 h-7 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold uppercase tracking-widest rounded shadow-sm transition-all active:scale-95 font-sans"
              >
                Apply
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => selectedMedicine && fetchDetails(selectedMedicine, '', '')}
          disabled={!selectedMedicine || loading}
          className="px-4 py-1.5 h-9 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600 text-black dark:text-white text-xs font-semibold uppercase tracking-wide rounded-md shadow-sm transition-all font-sans"
        >
          All Time
        </button>

        <button
          onClick={() => selectedMedicine && fetchDetails(selectedMedicine, fromDate, toDate)}
          disabled={!selectedMedicine || loading}
          className="ml-auto px-3 py-1.5 h-9 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600 text-black dark:text-white text-xs font-semibold uppercase tracking-wide rounded-md transition-colors flex items-center gap-1.5 shadow-sm font-sans"
        >
          <FiRefreshCw className={`w-3.5 h-3.5 text-black dark:text-white ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* ── Main Content Area ── */}
      <div className="flex flex-col md:flex-row gap-3 flex-1 overflow-hidden min-h-0 font-sans">
        
        {/* Left Side: Financial Performance */}
        <div className="w-full md:w-1/3 flex flex-col overflow-hidden min-h-0 font-sans">
          <div className="bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-3 bg-gradient-to-r from-gray-50 to-gray-100/50 dark:from-gray-900/20 dark:to-gray-800/10 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3">
              <FiActivity className="w-4 h-4 text-emerald-500" />
              <h3 className="text-[11px] font-semibold text-black dark:text-white uppercase tracking-widest">Financial Performance</h3>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center overflow-y-auto no-scrollbar">
              {details ? (
                <>
                  <div className="relative w-full max-w-[220px] aspect-square">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius="75%"
                          outerRadius="85%"
                          startAngle={90}
                          endAngle={-270}
                          paddingAngle={0}
                          dataKey="value"
                          stroke="none"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <p className="text-[10px] font-semibold text-black dark:text-gray-400 uppercase tracking-widest mb-1">Net Profit</p>
                      <p className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                        {formatCurrency(details.totalProfit)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-8">
                    <p className="text-[10px] font-semibold text-black dark:text-gray-400 uppercase tracking-widest mb-1">Net Revenue</p>
                    <p className="text-4xl font-bold text-emerald-600 dark:text-emerald-400 tracking-tighter">
                      {formatCurrency(details.netRevenue)}
                    </p>
                  </div>

                  {/* Info Note - Moved to Left Side */}
                  <div className="mt-auto pt-6 w-full">
                    <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-200/50 dark:border-blue-800/30 rounded-lg p-3 flex items-start gap-3">
                      <FiAlertCircle className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                      <p className="text-[10px] text-blue-700 dark:text-blue-300 font-medium text-left leading-relaxed">
                        <strong className="font-bold text-black dark:text-blue-300">Inventory Analytics:</strong> Data is aggregated from purchase history, sales records, and return logs. 
                        Stock levels are real-time, while financial metrics are filtered by your selected reporting period.
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="opacity-50 flex flex-col items-center group transition-opacity max-w-[200px]">
                  <FiBarChart2 className="w-16 h-16 mb-4 text-gray-500 dark:text-gray-400 group-hover:scale-110 transition-transform duration-500" />
                  <p className="text-xs font-bold uppercase tracking-[0.3em] text-black dark:text-white mb-2">No Selection</p>
                  <p className="text-[10px] font-medium text-gray-600 dark:text-gray-400 leading-relaxed">
                    Select a medicine above to visualize profit vs cost analysis.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Detailed Breakdown */}
        <div className="w-full md:w-2/3 flex flex-col overflow-hidden min-h-0 font-sans">
          <div className="bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-800/10 border-b border-blue-200/50 dark:border-blue-800/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FiPackage className="w-4 h-4 text-blue-500" />
                <h3 className="text-[11px] font-semibold text-black dark:text-white uppercase tracking-widest font-sans">Inventory & Sales Breakdown</h3>
              </div>
              {selectedMedicine && (
                <span className="text-[10px] font-semibold bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 px-2 py-0.5 rounded uppercase tracking-widest border border-blue-200 dark:border-blue-800">
                  {selectedMedicine.name}
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-4 font-sans">
              {!details ? (
                <div className="h-full flex flex-col items-center justify-center opacity-40">
                  <FiPackage className="w-12 h-12 mb-4 text-gray-400" />
                  <p className="text-xl font-semibold uppercase tracking-[0.4em] text-black dark:text-white font-sans mb-3">Awaiting Data</p>
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-400 leading-relaxed">
                    Search and select a medicine to view detailed inventory breakdown, sales history, and revenue metrics.
                  </p>
                </div>
              ) : (
                <>
                  {/* KPI Cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { label: 'Total Purchased', value: formatIntQty(details.totalPurchasedQty), icon: <FiShoppingCart />, accent: 'border-blue-500', iconColor: 'text-blue-500' },
                      { label: 'Total Sold', value: formatIntQty(details.totalSoldQty), icon: <FiTag />, accent: 'border-emerald-500', iconColor: 'text-emerald-500' },
                      { label: 'Total Returned', value: formatIntQty(details.totalReturnedQty), icon: <FiRefreshCw />, accent: 'border-rose-500', iconColor: 'text-rose-500' },
                      { label: 'Remaining Stock', value: formatIntQty(details.remainingStock), icon: <FiBox />, accent: 'border-amber-500', iconColor: 'text-amber-500' },
                    ].map((card) => (
                      <div key={card.label} className={`bg-white dark:bg-gray-700/40 border border-gray-200 dark:border-gray-600 border-l-4 ${card.accent} p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-lg ${card.iconColor}`}>{card.icon}</span>
                          <span className="text-[10px] font-semibold text-black dark:text-gray-400 uppercase tracking-widest">{card.label}</span>
                        </div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">{card.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Financial Metrics Table */}
                  <div className="bg-white dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
                    <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center text-[10px] font-semibold text-black dark:text-gray-400 uppercase tracking-widest">
                      <span>Financial Metric</span>
                      <span>Value ({getCurrencySymbol().trim()})</span>
                    </div>
                    <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                      <MetricRow label="Total Purchase Cost" value={formatCurrency(details.totalPurchaseCost)} valueColor="text-blue-600 dark:text-blue-400" />
                      <MetricRow label="Gross Sale Revenue" value={formatCurrency(details.totalSaleRevenue)} valueColor="text-emerald-600 dark:text-emerald-400" />
                      <MetricRow label="Total Refund Amount" value={formatCurrency(details.totalReturnAmount)} valueColor="text-rose-600 dark:text-rose-400" />
                      <MetricRow label="Net Revenue (After Returns)" value={formatCurrency(details.netRevenue)} valueColor="text-teal-600 dark:text-teal-400" />
                      
                      <div className="p-4 bg-emerald-50/50 dark:bg-emerald-900/10 flex justify-between items-center">
                        <span className="text-xs font-semibold text-black dark:text-slate-200 uppercase tracking-widest">Net Profit Calculation</span>
                        <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(details.totalProfit)}
                        </span>
                      </div>
                    </div>
                  </div>

                </>
              )}
            </div>

            <div className="px-4 py-2 bg-gray-50/50 dark:bg-gray-900/40 border-t border-gray-200 dark:border-gray-700 text-center">
              <span className="text-[10px] text-black dark:text-gray-500 font-semibold uppercase tracking-widest">Medicine Financial Analytics</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── helper components ─────────────────────────────────────────────────── */
const MetricRow = ({ label, value, valueColor = 'text-gray-900 dark:text-white' }: { label: string; value: string; valueColor?: string }) => (
  <div className="flex justify-between items-center py-4 px-8 hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors group">
    <span className="text-xs font-medium text-black dark:text-gray-400 group-hover:text-black dark:group-hover:text-gray-200 font-sans">{label}</span>
    <span className={`text-[14px] font-bold tabular-nums ${valueColor}`}>{value}</span>
  </div>
);

export default MedicineAnalytics;
