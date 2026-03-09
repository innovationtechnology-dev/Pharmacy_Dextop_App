import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { getSaleReturnsFlatRowsByRange, FlatSaleReturnRow, exportSaleReturnsPdf, exportSaleReturnsCsv } from '../../utils/sale-return';
import { getAuthUser } from '../../utils/auth';
import { useDashboardHeader } from './useDashboardHeader';
import { FiCalendar, FiSearch, FiRefreshCw, FiEye, FiX, FiPhone, FiUser, FiFileText } from 'react-icons/fi';
import { FaArrowDown, FaUndo, FaShoppingCart, FaList, FaPercent, FaFileAlt, FaFilePdf, FaFileExcel, FaChevronDown } from 'react-icons/fa';
import ReportDetailModal from '../../components/common/DetailModal';
import { PharmacySettings, getStoredPharmacySettings } from '../../types/pharmacy';
import { currencySymbols, getCurrencySymbol as getSymbol } from '../../../common/currency';


export default function SaleReturn() {
  const isCashier = getAuthUser()?.role === 'cashier';

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

  // Calculate limit for cashier (1 month ago)
  const minFromDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }, []);

  const [reportRows, setReportRows] = useState<FlatSaleReturnRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [showDownloadDropdown, setShowDownloadDropdown] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const pageSize = 15;
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { setHeader } = useDashboardHeader();
  const [pharmacySettings] = useState<PharmacySettings>(() => getStoredPharmacySettings());

  // Get currency symbol
  const getCurrencySymbol = () => getSymbol(pharmacySettings.currency || 'USD');

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

  // Filter and Group rows
  const filteredRows = useMemo(() => {
    // Step 1: Group flat rows by saleReturnId
    const map = new Map<number, FlatSaleReturnRow & { itemDetails: string[]; items: FlatSaleReturnRow[] }>();

    reportRows.forEach(row => {


      // Improved formatting with a dot or colon between name and quantity
      const itemDetail = `${row.medicineName}`;
      
      if (!map.has(row.saleReturnId)) {
        map.set(row.saleReturnId, {
          ...row,
          itemDetails: [itemDetail],
          items: [row]
        });
      } else {
        const existing = map.get(row.saleReturnId)!;
        existing.itemDetails.push(itemDetail);
        existing.items.push(row);
        
        // Accumulate totals for the header row
        existing.pills += row.pills;
        existing.total += row.total;
        existing.subtotal += row.subtotal;
        existing.discountAmount += row.discountAmount;
        existing.taxAmount += row.taxAmount;
      }
    });

    const groupedData = Array.from(map.values()).map(row => ({
      ...row,
      displayMedicineName: row.itemDetails.join('\n'), // Use newline for vertical listing
      isGrouped: row.itemDetails.length > 1,
      children: row.items
    }));

    // Step 2: Filter based on search
    if (!searchQuery.trim()) return groupedData;
    const q = searchQuery.toLowerCase();
    return groupedData.filter(row =>
      row.displayMedicineName.toLowerCase().includes(q) ||
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
          <div className="flex items-center gap-1.5 bg-orange-50 dark:bg-orange-900/20 px-2.5 py-1.5 rounded-md border border-orange-200 dark:border-orange-500 shadow-sm">
            <FaUndo className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              Returned
            </span>
            <span className="text-xs font-bold text-orange-600 dark:text-orange-400 ml-1">
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
          <div className="flex items-center gap-1.5 bg-yellow-50 dark:bg-yellow-900/20 px-2.5 py-1.5 rounded-md border border-yellow-200 dark:border-yellow-600/50 shadow-sm">
            <FaFileAlt className="w-3.5 h-3.5 text-yellow-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              Tax
            </span>
            <span className="text-xs font-bold text-yellow-600 dark:text-yellow-400 ml-1">
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
            <div className="px-4 py-2 bg-gradient-to-r from-orange-50 to-orange-100/50 dark:from-orange-900/20 dark:to-orange-800/10 border-b border-blue-200/50 dark:border-blue-800/30">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600">
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
                  min={isCashier ? minFromDate : undefined}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full sm:w-40 px-3 py-1.5 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all"
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
                  className="w-full sm:w-40 px-3 py-1.5 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all"
                />
              </div>
              <button
                onClick={fetchReport}
                disabled={loading}
                className="w-full sm:w-auto px-4 py-1.5 bg-gradient-to-r from-orange-600 to-orange-500 text-white rounded hover:from-orange-700 hover:to-orange-600 shadow-sm hover:shadow-md font-semibold text-xs uppercase tracking-wide disabled:opacity-50 flex items-center justify-center gap-2"
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
            <div className="px-4 py-3 bg-gradient-to-r from-orange-50 to-orange-100/50 dark:from-orange-900/20 dark:to-orange-800/10 border-b border-blue-200/50 dark:border-blue-800/30 flex-shrink-0">
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
                      className="w-full pl-10 pr-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-600 dark:bg-gray-700/50 dark:text-white rounded-md focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 outline-none transition-all bg-white"
                    />
                  </div>
                </div>
                {/* Download Dropdown */}
                {!isCashier && (
                  <div className="relative w-full sm:w-auto" ref={dropdownRef}>
                    <button
                      onClick={() => setShowDownloadDropdown(!showDownloadDropdown)}
                      className="w-full sm:w-auto px-3 py-1.5 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border border-orange-500 dark:border-orange-500 rounded hover:bg-orange-100 dark:hover:bg-orange-900/40 font-semibold text-xs uppercase tracking-wide flex items-center justify-center gap-2 transition-colors"
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
                          className="w-full px-4 py-2.5 text-left text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-orange-50 dark:hover:bg-orange-900/20 flex items-center gap-3 transition-colors border-b border-gray-100 dark:border-gray-700"
                        >
                          <FaFilePdf className="w-4 h-4 text-orange-500" />
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
                )}
              </div>
            </div>

            {/* Table Header Row */}
            <div className="grid grid-cols-12 gap-3 px-3 py-2 bg-gray-50/50 dark:bg-gray-700/30 border-b border-gray-100 dark:border-gray-700 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              <div className="col-span-2">Date / IDs</div>
              <div className="col-span-3">Medicine</div>
              <div className="col-span-2">Customer</div>
              <div className="col-span-1 text-right">Price</div>
              <div className="col-span-1 text-center">Qty</div>
              <div className="col-span-2 text-right">Total</div>
              <div className="col-span-1 text-center">Actions</div>
            </div>

            {/* Table Body */}
            <div className="flex-1 overflow-visible md:overflow-y-auto">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                  <FiRefreshCw className="w-8 h-8 animate-spin mb-2 text-orange-500" />
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
                pagedRows.map((row) => (
                  <div key={row.saleReturnId} className="contents border-b border-gray-100 dark:border-gray-700">
                    <div 
                      className="grid grid-cols-12 gap-3 px-3 py-2 text-[10px] items-center hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-all duration-200"
                    >
                      <div className="col-span-2 font-semibold text-gray-900 dark:text-white">
                        <div>
                          <div className="text-[11px] text-gray-500 dark:text-gray-400 font-bold">Return #{row.saleReturnId}</div>
                          <div className="text-[10px] text-gray-400 dark:text-gray-500">Sale #{row.saleId}</div>
                          <div className="text-[9px] mt-1 text-gray-500">{new Date(row.createdAt).toLocaleDateString()}</div>
                        </div>
                      </div>
                      <div className="col-span-3">
                        <div className="font-medium text-gray-900 dark:text-white whitespace-pre-wrap leading-tight" title={row.displayMedicineName}>{row.displayMedicineName}</div>
                        {row.reason && (
                          <div className="text-[9px] text-gray-500 dark:text-gray-400 italic truncate" title={row.reason}>
                            Reason: {row.reason}
                          </div>
                        )}
                      </div>
                      <div className="col-span-2 text-gray-600 dark:text-gray-300 truncate" title={row.customerName || 'Walk-in'}>
                        {row.customerName || 'Walk-in'}
                      </div>
                      <div className="col-span-1 text-right text-gray-600 dark:text-gray-300">
                        {row.isGrouped ? (
                          <span className="text-gray-400 italic">Multiple</span>
                        ) : (
                          <>{getCurrencySymbol()}{row.unitPrice.toLocaleString()}</>
                        )}
                      </div>
                      <div className="col-span-1 text-center">
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 font-semibold">
                          {row.pills}
                        </span>
                      </div>
                      <div className="col-span-2 text-right">
                        <div className="font-bold text-orange-600 dark:text-orange-400 whitespace-nowrap">{getCurrencySymbol()}{row.total.toLocaleString()}</div>
                      </div>
                      <div className="col-span-1 text-center">
                        <button
                          onClick={() => {
                            setSelectedReturn(row);
                            setShowDetailModal(true);
                          }}
                          className="p-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors shadow-sm"
                          title="View Details"
                        >
                          View 
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Totals Footer Row */}
            {!loading && !error && filteredRows.length > 0 && (
              <div className="grid grid-cols-12 gap-3 px-3 py-2.5 bg-gray-100 dark:bg-gray-700/50 border-t-2 border-gray-200 dark:border-gray-600 text-[11px] font-bold uppercase tracking-wide">
                <div className="col-span-10 text-right text-gray-600 dark:text-gray-300 pr-4">Grand Total</div>
                <div className="col-span-2 text-right text-orange-700 dark:text-orange-400">
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

      {/* Detail Modal */}
      <ReportDetailModal
        isOpen={showDetailModal && !!selectedReturn}
        onClose={() => setShowDetailModal(false)}
        title="Return Details"
        icon={FaUndo}
        colorTheme="orange"
        headerBadges={[
          { label: 'Return #', value: String(selectedReturn?.saleReturnId || '') },
          { label: 'Sale Reference', value: `#${selectedReturn?.saleId}`, isItalic: true }
        ]}
        infoCards={[
          { 
            title: 'Customer', 
            value: selectedReturn?.customerName || 'Walk-in Customer', 
            icon: FiUser, 
            theme: 'blue' 
          },
          { 
            title: 'Return Info', 
            value: selectedReturn?.createdAt ? new Date(selectedReturn.createdAt).toLocaleDateString() : 'N/A', 
            icon: FiCalendar, 
            theme: 'orange',
            badge: {
              label: `REF #${selectedReturn?.saleId}`,
              color: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'
            }
          },
          { 
            title: 'Contact Detail', 
            value: selectedReturn?.customerPhone || 'N/A', 
            icon: FiPhone, 
            theme: 'purple' 
          }
        ]}
        tableTitle="Returned Items"
        tableItemsCount={selectedReturn?.children.length || 0}
        tableHeaders={['#', 'Medicine Product', 'Qty', 'Unit Price', 'Disc.', 'Subtotal']}
        items={selectedReturn?.children || []}
        renderTableRow={(item: any, idx: number) => (
          <div key={idx} className="grid grid-cols-12 gap-3 px-5 py-3.5 items-center hover:bg-gray-50/80 dark:hover:bg-gray-800/30 transition-all group">
            <div className="col-span-1 text-center font-normal text-gray-300 dark:text-gray-600">
              {String(idx + 1).padStart(2, '0')}
            </div>
            <div className="col-span-5 translate-x-1">
              <div className="text-[11px] font-normal text-gray-700 dark:text-gray-100 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">{item.medicineName}</div>
              <div className="text-[9px] text-gray-400 dark:text-gray-500 mt-0.5 font-normal italic">ID: #{item.medicineId}</div>
            </div>
            <div className="col-span-1 text-right">
              <span className="text-[11px] font-normal text-gray-600 dark:text-gray-300">
                {item.pills}
              </span>
            </div>
            <div className="col-span-2 text-right">
              <div className="text-[11px] font-normal text-gray-600 dark:text-gray-300">
                {getCurrencySymbol()}{item.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="col-span-1 text-right">
              <div className="text-[11px] font-normal text-red-500">
                 -{getCurrencySymbol()}{item.discountAmount.toLocaleString()}
              </div>
            </div>
            <div className="col-span-2 text-right">
              <div className="text-[11px] font-medium text-gray-900 dark:text-white">
                {getCurrencySymbol()}{item.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        )}
        remarks={{
          title: 'Remarks',
          content: (
            <p className="text-[10px] leading-relaxed text-gray-500 dark:text-gray-400 whitespace-pre-wrap">
              {selectedReturn?.reason || 'No specific return reason Recorded.'}
            </p>
          )
        }}
        summaryItems={[
          { label: 'Gross Value', value: `${getCurrencySymbol()}${selectedReturn?.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
          { label: 'Adjustment', type: 'discount', value: `${getCurrencySymbol()}${selectedReturn?.discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
          { label: 'Tax Reversal', type: 'tax', value: `${getCurrencySymbol()}${selectedReturn?.taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
          { label: 'Refund Amount', type: 'total', value: `${getCurrencySymbol()}${selectedReturn?.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}` }
        ]}
        footerStatus={{
          label: 'Return Processed',
          color: 'orange'
        }}
      />
    </div>
  );
}

