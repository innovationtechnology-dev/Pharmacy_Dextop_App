import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { getSaleReturnsFlatRowsByRange, FlatSaleReturnRow, exportSaleReturnsPdf, exportSaleReturnsCsv } from '../../utils/sale-return';
import { useDashboardHeader } from './useDashboardHeader';
import { FiCalendar, FiSearch, FiRefreshCw } from 'react-icons/fi';
import { FaArrowDown, FaUndo, FaShoppingCart, FaList, FaPercent, FaFileAlt, FaFilePdf, FaFileExcel, FaChevronDown } from 'react-icons/fa';
import { PharmacySettings, getStoredPharmacySettings } from '../../types/pharmacy';

const currencySymbols: Record<string, string> = {
  USD: 'Rs.',
  EUR: 'Rs.',
  GBP: 'Rs.',
  PKR: 'Rs.',
  INR: 'Rs.',
};

export default function SaleReturn() {
  const [fromDate, setFromDate] = useState<string>(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  });
  const [toDate, setToDate] = useState<string>(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  });

  const [reportRows, setReportRows] = useState<FlatSaleReturnRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [showDownloadDropdown, setShowDownloadDropdown] = useState(false);
  const pageSize = 15;
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { setHeader } = useDashboardHeader();
  const [pharmacySettings] = useState<PharmacySettings>(() => getStoredPharmacySettings());

  // Get currency symbol
  const getCurrencySymbol = () => {
    const currency = pharmacySettings.currency || 'USD';
    return currencySymbols[currency] || currency;
  };

  // Set header
  useEffect(() => {
    setHeader({
      title: 'Sale Returns',
      subtitle: 'View and export detailed sale return reports',
    });
    return () => setHeader(null);
  }, [setHeader]);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Simulate a small delay for the animation effect if the fetch is too fast
      await new Promise(resolve => setTimeout(resolve, 500));

      const res = await getSaleReturnsFlatRowsByRange(fromDate, toDate);
      if (res.success && res.data) {
        setReportRows(res.data);
        setPage(1); // Reset to first page on new fetch
      } else {
        setError(res.error || 'Failed to fetch sale return data');
        setReportRows([]);
      }
    } catch (err) {
      setError('An unexpected error occurred');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  // Initial fetch
  useEffect(() => {
    fetchReport();
  }, []); // Run once on mount

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDownloadDropdown(false);
      }
    };

    if (showDownloadDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDownloadDropdown]);

  const handleDownloadPdf = async () => {
    setShowDownloadDropdown(false);
    try {
      const res = await exportSaleReturnsPdf(fromDate, toDate);
      if (!res.success) {
        alert('Failed to export PDF: ' + (res.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('Failed to export PDF');
    }
  };

  const handleDownloadCsv = async () => {
    setShowDownloadDropdown(false);
    try {
      const res = await exportSaleReturnsCsv(fromDate, toDate);
      if (!res.success) {
        alert('Failed to export CSV: ' + (res.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('Failed to export CSV');
    }
  };

  // Filter rows based on search
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return reportRows;
    const q = searchQuery.toLowerCase();
    return reportRows.filter(row =>
      row.medicineName.toLowerCase().includes(q) ||
      (row.customerName && row.customerName.toLowerCase().includes(q)) ||
      row.saleId.toString().includes(q) ||
      row.saleReturnId.toString().includes(q) ||
      (row.reason && row.reason.toLowerCase().includes(q))
    );
  }, [reportRows, searchQuery]);

  // Pagination
  const totalPages = Math.ceil(filteredRows.length / pageSize);
  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  // Stats
  const totalReturned = useMemo(() => filteredRows.reduce((sum, row) => sum + row.total, 0), [filteredRows]);
  const totalItemsReturned = useMemo(() => filteredRows.reduce((sum, row) => sum + row.pills, 0), [filteredRows]);
  const totalTax = useMemo(() => filteredRows.reduce((sum, row) => sum + (row.taxAmount || 0), 0), [filteredRows]);
  const totalDiscount = useMemo(() => filteredRows.reduce((sum, row) => sum + (row.discountAmount || 0), 0), [filteredRows]);

  return (
    <div className="flex flex-col h-auto md:h-[calc(100vh-80px)] w-full bg-gradient-to-br from-gray-50 via-gray-50 to-gray-100/50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800/80 overflow-visible md:overflow-hidden px-4 pb-4 md:pb-0">

      {/* Stats Header - Single Row Design matching Medicines Page */}
      <div className="bg-gradient-to-br from-white via-white to-gray-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-gray-800/90 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-3 mb-2 flex flex-wrap items-center gap-3">

        {/* Total Returned */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-900/20 px-2.5 py-1.5 rounded-md border border-red-200 dark:border-red-600/50 shadow-sm">
            <FaUndo className="w-3.5 h-3.5 text-red-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              Returned
            </span>
            <span className="text-xs font-bold text-red-600 dark:text-red-400 ml-1">
              {getCurrencySymbol()}{totalReturned.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Items Returned */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1.5 rounded-md border border-blue-200 dark:border-blue-600/50 shadow-sm">
            <FaShoppingCart className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              Items Returned
            </span>
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 ml-1">
              {totalItemsReturned.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Returns Count */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-purple-50 dark:bg-purple-900/20 px-2.5 py-1.5 rounded-md border border-purple-200 dark:border-purple-600/50 shadow-sm">
            <FaList className="w-3.5 h-3.5 text-purple-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              Returns
            </span>
            <span className="text-xs font-bold text-purple-600 dark:text-purple-400 ml-1">
              {filteredRows.length}
            </span>
          </div>
        </div>

        {/* Tax */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-orange-50 dark:bg-orange-900/20 px-2.5 py-1.5 rounded-md border border-orange-200 dark:border-orange-600/50 shadow-sm">
            <FaFileAlt className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              Tax
            </span>
            <span className="text-xs font-bold text-orange-600 dark:text-orange-400 ml-1">
              {getCurrencySymbol()}{totalTax.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Discount */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-pink-50 dark:bg-pink-900/20 px-2.5 py-1.5 rounded-md border border-pink-200 dark:border-pink-600/50 shadow-sm">
            <FaPercent className="w-3.5 h-3.5 text-pink-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              Discount
            </span>
            <span className="text-xs font-bold text-pink-600 dark:text-pink-400 ml-1">
              {getCurrencySymbol()}{totalDiscount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Refresh Button */}
        <button
          onClick={fetchReport}
          className="ml-auto px-3 py-1.5 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-xs font-semibold rounded-md transition-colors uppercase tracking-wide flex items-center gap-1.5 shadow-sm"
        >
          <FiRefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Main Content: Vertical Layout */}
      <div className="flex flex-col gap-3 flex-1 overflow-hidden min-h-0">

        {/* Top: Date Range Filter (Styled like Medicine Form) */}
        <div className="flex-shrink-0">
          <div className="bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md">
            {/* Header */}
            <div className="px-4 py-2 bg-gradient-to-r from-red-50 to-red-100/50 dark:from-red-900/20 dark:to-red-800/10 border-b border-blue-200/50 dark:border-blue-800/30">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-red-500 to-red-600">
                  <FiCalendar className="w-4 h-4 text-white" />
                </div>
                <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wide">
                  Report Criteria
                </h3>
              </div>
            </div>

            {/* Content */}
            <div className="p-3 flex flex-col sm:flex-row gap-3 items-end">
              <div className="w-full sm:w-auto">
                <label className="block text-[10px] font-bold mb-1 uppercase tracking-wide text-gray-600 dark:text-gray-400">
                  From Date
                </label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full sm:w-40 px-3 py-1.5 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                />
              </div>
              <div className="w-full sm:w-auto">
                <label className="block text-[10px] font-bold mb-1 uppercase tracking-wide text-gray-600 dark:text-gray-400">
                  To Date
                </label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full sm:w-40 px-3 py-1.5 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                />
              </div>
              <button
                onClick={fetchReport}
                disabled={loading}
                className="w-full sm:w-auto px-4 py-1.5 bg-gradient-to-r from-red-600 to-red-500 text-white rounded hover:from-red-700 hover:to-red-600 shadow-sm hover:shadow-md font-semibold text-xs uppercase tracking-wide disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <FiRefreshCw className="animate-spin" /> : <FiSearch />}
                Fetch Reports
              </button>
            </div>
          </div>
        </div>

        {/* Bottom: Returns Table */}
        <div className="flex-1 flex flex-col overflow-visible md:overflow-hidden min-h-0">
          <div className="bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md flex-1 flex flex-col overflow-visible md:overflow-hidden">

            {/* Table Header / Actions */}
            <div className="px-4 py-3 bg-gradient-to-r from-red-50 to-red-100/50 dark:from-red-900/20 dark:to-red-800/10 border-b border-blue-200/50 dark:border-blue-800/30 flex-shrink-0">
              <div className="flex flex-col sm:flex-row items-center gap-3 justify-between">
                <div className="flex items-center gap-2 w-full sm:w-auto flex-1">
                  <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap hidden sm:block">
                    Search Returns
                  </label>
                  <div className="flex-1 relative max-w-md">
                    <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500">
                      <FiSearch className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by medicine, customer, sale ID, or reason..."
                      className="w-full pl-10 pr-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-600 dark:bg-gray-700/50 dark:text-white rounded-md focus:ring-2 focus:ring-red-500/30 focus:border-red-500 outline-none transition-all bg-white"
                    />
                  </div>
                </div>
                {/* Download Dropdown */}
                <div className="relative w-full sm:w-auto" ref={dropdownRef}>
                  <button
                    onClick={() => setShowDownloadDropdown(!showDownloadDropdown)}
                    className="w-full sm:w-auto px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded hover:bg-red-100 dark:hover:bg-red-900/40 font-semibold text-xs uppercase tracking-wide flex items-center justify-center gap-2 transition-colors"
                  >
                    <FaArrowDown className="w-3.5 h-3.5" />
                    Download
                    <FaChevronDown className={`w-3 h-3 transition-transform ${showDownloadDropdown ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Dropdown Menu */}
                  {showDownloadDropdown && (
                    <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 overflow-hidden">
                      <button
                        onClick={handleDownloadPdf}
                        className="w-full px-4 py-2.5 text-left text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3 transition-colors border-b border-gray-100 dark:border-gray-700"
                      >
                        <FaFilePdf className="w-4 h-4 text-red-500" />
                        <div>
                          <div className="font-bold">Export as PDF</div>
                          <div className="text-[10px] text-gray-500 dark:text-gray-400">Formatted report</div>
                        </div>
                      </button>
                      <button
                        onClick={handleDownloadCsv}
                        className="w-full px-4 py-2.5 text-left text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-green-50 dark:hover:bg-green-900/20 flex items-center gap-3 transition-colors"
                      >
                        <FaFileExcel className="w-4 h-4 text-green-500" />
                        <div>
                          <div className="font-bold">Export as CSV</div>
                          <div className="text-[10px] text-gray-500 dark:text-gray-400">Excel compatible</div>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Table Header Row */}
            <div className="grid grid-cols-12 gap-3 px-3 py-2 bg-gray-50/50 dark:bg-gray-700/30 border-b border-gray-100 dark:border-gray-700 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              <div className="col-span-2">Date / IDs</div>
              <div className="col-span-3">Medicine</div>
              <div className="col-span-2">Customer</div>
              <div className="col-span-2 text-right">Price</div>
              <div className="col-span-1 text-center">Qty</div>
              <div className="col-span-2 text-right">Total</div>
            </div>

            {/* Table Body */}
            <div className="flex-1 overflow-visible md:overflow-y-auto">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                  <FiRefreshCw className="w-8 h-8 animate-spin mb-2 text-red-500" />
                  <p className="text-xs">Loading sale return data...</p>
                </div>
              ) : error ? (
                <div className="flex items-center justify-center h-full text-red-500 dark:text-red-400 text-sm">
                  {error}
                </div>
              ) : pagedRows.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 text-sm">
                  No sale returns found for the selected range.
                </div>
              ) : (
                pagedRows.map((row, idx) => (
                  <div key={`${row.saleReturnId}-${idx}`} className="grid grid-cols-12 gap-3 px-3 py-2 border-b border-gray-100 dark:border-gray-700 text-[10px] items-center hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <div className="col-span-2 font-semibold text-gray-900 dark:text-white">
                      <div className="text-[11px] text-gray-500 dark:text-gray-400">Return #{row.saleReturnId}</div>
                      <div className="text-[10px] text-gray-400 dark:text-gray-500">Sale #{row.saleId}</div>
                      {new Date(row.createdAt).toLocaleDateString()}
                    </div>
                    <div className="col-span-3">
                      <div className="font-medium text-gray-900 dark:text-white truncate" title={row.medicineName}>{row.medicineName}</div>
                      {row.reason && (
                        <div className="text-[9px] text-gray-500 dark:text-gray-400 italic truncate" title={row.reason}>
                          Reason: {row.reason}
                        </div>
                      )}
                    </div>
                    <div className="col-span-2 text-gray-600 dark:text-gray-300 truncate" title={row.customerName || 'Walk-in'}>
                      {row.customerName || 'Walk-in'}
                    </div>
                    <div className="col-span-2 text-right text-gray-600 dark:text-gray-300">
                      {getCurrencySymbol()}{row.unitPrice.toLocaleString()}
                    </div>
                    <div className="col-span-1 text-center">
                      <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-semibold">
                        {row.pills}
                      </span>
                    </div>
                    <div className="col-span-2 text-right">
                      <div className="font-bold text-red-600 dark:text-red-400">{getCurrencySymbol()}{row.total.toLocaleString()}</div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Totals Footer Row */}
            {!loading && !error && filteredRows.length > 0 && (
              <div className="grid grid-cols-12 gap-3 px-3 py-2.5 bg-gray-100 dark:bg-gray-700/50 border-t-2 border-gray-200 dark:border-gray-600 text-[11px] font-bold uppercase tracking-wide">
                <div className="col-span-10 text-right text-gray-600 dark:text-gray-300 pr-4">Grand Total</div>
                <div className="col-span-2 text-right text-red-700 dark:text-red-400">
                  {getCurrencySymbol()}{totalReturned.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
            )}

            {/* Pagination Footer */}
            {!loading && !error && totalPages > 1 && (
              <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-2 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-[10px] hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-2 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-[10px] hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

