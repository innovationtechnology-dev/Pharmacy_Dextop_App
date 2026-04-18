
import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useDebouncedSearch } from '../../hooks/useDebounce';
import { getSalesFlatRowsByRange, FlatSaleRow, exportSalesPdf, exportSalesCsvByRange } from '../../utils/sales';
import { useDashboardHeader } from './useDashboardHeader';
import { getAuthUser } from '../../utils/auth';
import { FiCalendar, FiSearch, FiRefreshCw, FiEye, FiX, FiUser, FiPhone, FiFileText } from 'react-icons/fi';
import { FaArrowDown, FaCreditCard, FaShoppingCart, FaList, FaPercent, FaFileAlt, FaFilePdf, FaFileExcel, FaUndo, FaArrowLeft } from 'react-icons/fa';
import PDFPreviewModal from '../../components/common/PDFPreviewModal';
import { PharmacySettings, getStoredPharmacySettings } from '../../types/pharmacy';
import { currencySymbols, getCurrencySymbol as getSymbol } from '../../../common/currency';


export default function SalesReport() {
  const today = useMemo(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }, []);

  const [fromDate, setFromDate] = useState<string>(today);
  const [toDate, setToDate] = useState<string>(today);

  // Calculate limit for cashier (1 month ago)
  const minFromDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }, []);

  const [reportRows, setReportRows] = useState<FlatSaleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const { searchTerm: searchQuery, setSearchTerm: setSearchQuery, handleSearchChange, immediateSearchTerm } = useDebouncedSearch('', 300);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'csv'>('pdf');
  const [exportFromDate, setExportFromDate] = useState<string>('');
  const [exportToDate, setExportToDate] = useState<string>('');
  const [showPreview, setShowPreview] = useState(false);
  const [pdfHtmlContent, setPdfHtmlContent] = useState<string | null>(null);
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const pageSize = 15;
  const isCashier = getAuthUser()?.role === 'cashier';

  const { setHeader } = useDashboardHeader();
  const [pharmacySettings] = useState<PharmacySettings>(() => getStoredPharmacySettings());

  // Get currency symbol
  const getCurrencySymbol = () => getSymbol(pharmacySettings.currency || 'USD');

  // Set header
  useEffect(() => {
    setHeader({
      title: 'Sales Report',
      subtitle: 'View and export detailed sales reports',
    });
    return () => setHeader(null);
  }, [setHeader]);

  const fetchReport = useCallback(async (overrideFrom?: string, overrideTo?: string) => {
    setLoading(true);
    setError(null);
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      const res = await getSalesFlatRowsByRange(overrideFrom || fromDate, overrideTo || toDate);
      if (res.success && res.data) {
        setReportRows(res.data);
        setPage(1);
      } else {
        setError(res.error || 'Failed to fetch sales data');
        setReportRows([]);
      }
    } catch (err) {
      setError('An unexpected error occurred');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  const handleTodayFilter = () => {
    setFromDate(today);
    setToDate(today);
    fetchReport(today, today);
  };

  const handleMonthFilter = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const mm = String(firstDay.getMonth() + 1).padStart(2, '0');
    const dd = String(firstDay.getDate()).padStart(2, '0');
    const fDate = `${firstDay.getFullYear()}-${mm}-${dd}`;
    setFromDate(fDate);
    setToDate(today);
    fetchReport(fDate, today);
  };

  const handleYearFilter = () => {
    const now = new Date();
    const fDate = `${now.getFullYear()}-01-01`;
    setFromDate(fDate);
    setToDate(today);
    fetchReport(fDate, today);
  };

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDownloadPdf = async () => {
    setExporting(true);
    try {
      // Use export dates if provided, otherwise empty strings for all records
      const fromDateToUse = exportFromDate || '';
      const toDateToUse = exportToDate || '';
      const res = await exportSalesPdf(fromDateToUse, toDateToUse, showPreview);
      setExporting(false);
      if (!res.success) {
        alert('Failed to export PDF: ' + (res.error || 'Unknown error'));
      } else if (showPreview && res.data?.htmlContent) {
        setPdfHtmlContent(res.data.htmlContent);
        setShowExportDialog(false);
      } else {
        setShowExportDialog(false);
        alert('Sales report exported successfully!');
      }
    } catch (err) {
      setExporting(false);
      console.error(err);
      alert('Failed to export PDF');
    }
  };

  const handleDownloadFromPreview = async () => {
    if (!pdfHtmlContent) return;
    try {
      const fromDateToUse = exportFromDate || '';
      const toDateToUse = exportToDate || '';
      const res = await exportSalesPdf(fromDateToUse, toDateToUse, false);
      if (res.success) {
        setPdfHtmlContent(null);
        alert('Sales report downloaded successfully!');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to download PDF');
    }
  };

  const handleDownloadCsv = async () => {
    setExporting(true);
    try {
      const fromDateToUse = exportFromDate || '';
      const toDateToUse = exportToDate || '';
      const res = await exportSalesCsvByRange(fromDateToUse, toDateToUse);
      setExporting(false);
      if (!res.success) {
        alert('Failed to export CSV: ' + (res.error || 'Unknown error'));
      } else {
        setShowExportDialog(false);
        alert('Sales report exported successfully!');
      }
    } catch (err) {
      setExporting(false);
      console.error(err);
      alert('Failed to export CSV');
    }
  };

  // Filter and Group rows
  const filteredRows = useMemo(() => {
    // Step 1: Group flat rows by saleId
    const map = new Map<number, FlatSaleRow & { itemDetails: string[]; items: FlatSaleRow[] }>();

    reportRows.forEach(row => {
      const itemDetail = `${row.medicineName}`;
      
      if (!map.has(row.saleId)) {
        map.set(row.saleId, {
          ...row,
          itemDetails: [itemDetail],
          items: [row],
          returnedPills: row.returnedPills || 0,
          returnedTotal: row.returnedTotal || 0,
        } as FlatSaleRow & { itemDetails: string[]; items: FlatSaleRow[] });
      } else {
        const existing = map.get(row.saleId)!;
        existing.itemDetails.push(itemDetail);
        existing.items.push(row);
        
        // Accumulate totals for the header row
        existing.pills += row.pills;
        existing.total += row.total;
        existing.subtotal += row.subtotal;
        existing.discountAmount += row.discountAmount;
        existing.taxAmount += row.taxAmount;
        existing.returnedPills = (existing.returnedPills || 0) + (row.returnedPills || 0);
        existing.returnedTotal = (existing.returnedTotal || 0) + (row.returnedTotal || 0);
      }
    });

    const groupedData = Array.from(map.values()).map(row => {
      // Calculate net additional discount based on percentage, not fixed original amount
      const extraDisc = (row.total * (row.additionalDiscount || 0)) / 100;
      const finalTotal = row.total - extraDisc;
      return {
        ...row,
        total: finalTotal,
        displayMedicineName: row.itemDetails.join(', '), 
        isGrouped: row.itemDetails.length > 1,
        children: row.items
      };
    });

    // Step 2: Filter based on search
    if (!searchQuery.trim()) return groupedData;
    const q = searchQuery.trim().toLowerCase();
    const searchWords = q.split(/\s+/).filter(word => word.length > 0);
    return groupedData.filter(row =>
      searchWords.every(word =>
        row.displayMedicineName.toLowerCase().includes(word) ||
        (row.customerName && row.customerName.toLowerCase().includes(word)) ||
        (row.saleType && row.saleType.toLowerCase().includes(word)) ||
        row.saleId.toString().includes(word)
      )
    );
  }, [reportRows, searchQuery]);

  // Pagination
  const totalPages = Math.ceil(filteredRows.length / pageSize);
  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  // Stats
  const totalRevenue = useMemo(() => filteredRows.reduce((sum, row) => sum + row.total, 0), [filteredRows]);
  const totalItemsSold = useMemo(() => filteredRows.reduce((sum, row) => sum + row.pills, 0), [filteredRows]);
  const totalTax = useMemo(() => filteredRows.reduce((sum, row) => sum + (row.taxAmount || 0), 0), [filteredRows]);
  const totalDiscount = useMemo(() => filteredRows.reduce((sum, row) => sum + (row.discountAmount || 0), 0), [filteredRows]);
  const totalReturnsValue = useMemo(
    () => filteredRows.reduce((sum, row) => sum + (row.returnedTotal || 0), 0),
    [filteredRows]
  );

  /** Original invoice line totals in range (net kept + returned); clarifies revenue vs gross. */
  const totalGrossInvoice = useMemo(
    () => totalRevenue + totalReturnsValue,
    [totalRevenue, totalReturnsValue]
  );

  const totalReturnedUnits = useMemo(
    () => filteredRows.reduce((sum, row) => sum + (row.returnedPills || 0), 0),
    [filteredRows]
  );

  return (
    <div className="flex flex-col h-auto md:h-[calc(100vh-80px)] w-full bg-gradient-to-br from-gray-50 via-gray-50 to-gray-100/50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800/80 overflow-visible md:overflow-hidden px-4 pb-4 md:pb-0">

      {/* Stats Header - Single Row Design matching Medicines Page */}
      <div className="bg-gradient-to-br from-white via-white to-gray-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-gray-800/90 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-3 mb-2 flex flex-wrap items-center gap-3">

        {/* Net revenue (after returns) — primary KPI */}
        <div className="flex items-center gap-2">
          <div
            className="flex flex-col gap-0.5 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1.5 rounded-md border border-emerald-200 dark:border-emerald-600/50 shadow-sm"
            title="Total of kept invoice lines after returns (what stayed sold in this period)."
          >
            <div className="flex items-center gap-1.5">
              <FaCreditCard className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                Net revenue
              </span>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 ml-1 tabular-nums">
                {getCurrencySymbol()}{totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            {totalReturnsValue > 0 && (
              <span className="text-[9px] font-medium text-gray-500 dark:text-gray-400 pl-5 leading-tight">
                After returns (excludes returned value)
              </span>
            )}
          </div>
        </div>

        {/* Gross invoice total when returns exist — original rang-up before returns */}
        {totalReturnsValue > 0 && (
          <div className="flex items-center gap-2">
            <div
              className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1.5 rounded-md border border-amber-200 dark:border-amber-600/50 shadow-sm"
              title="Net revenue + returns in this report: total originally invoiced before customer returns."
            >
              <FaCreditCard className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                Gross invoice
              </span>
              <span className="text-xs font-bold text-amber-700 dark:text-amber-300 ml-1 tabular-nums">
                {getCurrencySymbol()}{totalGrossInvoice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        )}

        {/* Medicines Sold */}
        <div className="flex items-center gap-2">
          <div
            className="flex flex-col gap-0.5 bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1.5 rounded-md border border-blue-200 dark:border-blue-600/50 shadow-sm"
            title={
              totalReturnedUnits > 0
                ? `Net units kept after returns. Invoiced before returns: ${(totalItemsSold + totalReturnedUnits).toLocaleString()}.`
                : 'Units sold in this report (net of returns).'
            }
          >
            <div className="flex items-center gap-1.5">
              <FaShoppingCart className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                Units (net)
              </span>
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400 ml-1 tabular-nums">
                {totalItemsSold.toLocaleString()}
              </span>
            </div>
            {totalReturnedUnits > 0 && (
              <span className="text-[9px] font-medium text-gray-500 dark:text-gray-400 pl-5 leading-tight">
                {totalItemsSold + totalReturnedUnits} invoiced before returns
              </span>
            )}
          </div>
        </div>

        {/* Transactions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-purple-50 dark:bg-purple-900/20 px-2.5 py-1.5 rounded-md border border-purple-200 dark:border-purple-600/50 shadow-sm">
            <FaList className="w-3.5 h-3.5 text-purple-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              Transactions
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
              {getCurrencySymbol()}{totalTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
              {getCurrencySymbol()}{totalDiscount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Returns (value of returned goods in range) */}
        {totalReturnsValue > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-rose-50 dark:bg-rose-900/20 px-2.5 py-1.5 rounded-md border border-rose-200 dark:border-rose-600/50 shadow-sm">
              <FaUndo className="w-3.5 h-3.5 text-rose-500" />
              <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                Returns
              </span>
              <span className="text-xs font-bold text-rose-600 dark:text-rose-400 ml-1">
                {getCurrencySymbol()}{totalReturnsValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Back to Selling Button */}
          {isCashier && (
            <button
              onClick={() => window.location.hash = '#/selling-panel'}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 border border-emerald-500 text-white text-xs font-semibold rounded-md transition-colors uppercase tracking-wide flex items-center gap-1.5 shadow-sm"
            >
              <FaArrowLeft className="w-3.5 h-3.5" />
              Back to Selling
            </button>
          )}

          {/* Refresh Button */}
          <button
            onClick={() => fetchReport()}
            className="px-3 py-1.5 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-xs font-semibold rounded-md transition-colors uppercase tracking-wide flex items-center gap-1.5 shadow-sm"
          >
            <FiRefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Main Content: Vertical Layout */}
      <div className="flex flex-col gap-3 flex-1 overflow-hidden min-h-0">

        {/* Top: Date Range Filter (Styled like Medicine Form) */}
        <div className="flex-shrink-0">
          <div className="bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md">
            {/* Header */}
            <div className="px-4 py-2 bg-gradient-to-r from-green-50 to-green-100/50 dark:from-blue-900/20 dark:to-blue-800/10 border-b border-blue-200/50 dark:border-blue-800/30">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600">
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
                  max={today}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full sm:w-40 px-3 py-1.5 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                />
              </div>
              <div className="w-full sm:w-auto">
                <label className="block text-[10px] font-bold mb-1 uppercase tracking-wide text-gray-600 dark:text-gray-400">
                  To Date
                </label>
                <input
                  type="date"
                  value={toDate}
                  max={today}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full sm:w-40 px-3 py-1.5 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                />
              </div>
              <div className="flex-1 flex gap-2 sm:justify-end">
                <button
                  onClick={() => handleTodayFilter()}
                  className={`px-3 py-1.5 text-xs font-bold uppercase border rounded transition-colors shadow-sm ${
                    fromDate === today && toDate === today
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white dark:bg-gray-700 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/30'
                  }`}
                >
                  Today
                </button>
                <button
                  onClick={() => handleMonthFilter()}
                  className={`px-3 py-1.5 text-xs font-bold uppercase border rounded transition-colors shadow-sm ${
                    fromDate === `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01` && toDate === today
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white dark:bg-gray-700 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/30'
                  }`}
                >
                  Month
                </button>
                {!isCashier && (
                  <button
                    onClick={() => handleYearFilter()}
                    className={`px-3 py-1.5 text-xs font-bold uppercase border rounded transition-colors shadow-sm ${
                      fromDate === `${new Date().getFullYear()}-01-01` && toDate === today
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white dark:bg-gray-700 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/30'
                    }`}
                  >
                    Year
                  </button>
                )}
                <div className="w-px h-8 bg-gray-200 dark:bg-gray-700 mx-1 hidden sm:block"></div>
                <button
                  onClick={() => fetchReport()}
                  disabled={loading}
                  className="flex-1 sm:flex-none px-4 py-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 shadow-sm hover:shadow-md font-semibold text-xs uppercase tracking-wide disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? <FiRefreshCw className="animate-spin" /> : <FiSearch />}
                  Fetch Reports
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom: Sales Table */}
        <div className="flex-1 flex flex-col overflow-visible md:overflow-hidden min-h-0">
          <div className="bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md flex-1 flex flex-col overflow-visible md:overflow-hidden">

            {/* Table Header / Actions */}
            <div className="px-4 py-3 bg-gradient-to-r from-green-50 to-green-100/50 dark:from-green-900/20 dark:to-green-800/10 border-b border-blue-200/50 dark:border-blue-800/30 flex-shrink-0">
              <div className="flex flex-col sm:flex-row items-center gap-3 justify-between">
                <div className="flex items-center gap-2 w-full sm:w-auto flex-1">
                  <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap hidden sm:block">
                    Search Sales
                  </label>
                  <div className="flex-1 relative max-w-md">
                    <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500">
                      <FiSearch className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="text"
                      value={immediateSearchTerm}
                      onChange={handleSearchChange}
                      placeholder="Search by medicine, customer, or ID..."
                      className="w-full pl-10 pr-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-600 dark:bg-gray-700/50 dark:text-white rounded-md focus:ring-2 focus:ring-green-500/30 focus:border-green-500 outline-none transition-all bg-white"
                    />
                  </div>
                </div>
                {/* Download Button - Hidden for Cashier */}
                {!isCashier && (
                  <button
                    onClick={() => setShowExportDialog(true)}
                    className="w-full sm:w-auto px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded hover:bg-red-100 dark:hover:bg-red-900/40 font-semibold text-xs uppercase tracking-wide flex items-center justify-center gap-2 transition-colors"
                  >
                    <FaArrowDown className="w-3.5 h-3.5" />
                    Download
                  </button>
                )}
              </div>
            </div>

            {/* Table Header Row */}
            <div className="grid grid-cols-12 gap-3 px-3 py-2 bg-gray-50/50 dark:bg-gray-700/30 border-b border-gray-100 dark:border-gray-700 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              <div className="col-span-2">Date / ID</div>
              <div className="col-span-3">Medicine</div>
              <div className="col-span-2">Customer / Type</div>
              <div className="col-span-1 text-right">Price</div>
              <div className="col-span-1 text-center">Qty</div>
              <div className="col-span-2 text-right">Total</div>
              <div className="col-span-1 text-center">Actions</div>
            </div>

            {/* Table Body */}
            <div className="flex-1 overflow-visible md:overflow-y-auto">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                  <FiRefreshCw className="w-8 h-8 animate-spin mb-2 text-emerald-500" />
                  <p className="text-xs">Loading sales data...</p>
                </div>
              ) : error ? (
                <div className="flex items-center justify-center h-full text-red-500 dark:text-red-400 text-sm">
                  {error}
                </div>
              ) : pagedRows.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 text-sm">
                  No sales found for the selected range.
                </div>
              ) : (
                (selectedSale ? pagedRows.filter(r => r.saleId === selectedSale.saleId) : pagedRows).map((row) => (
                  <React.Fragment key={row.saleId}>
                    <div 
                      className={`grid grid-cols-12 gap-3 px-3 py-2 text-[10px] items-center border-b transition-all duration-200 ${selectedSale?.saleId === row.saleId ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/30 dark:bg-emerald-900/10' : 'border-gray-50 dark:border-gray-800 hover:bg-emerald-50/20 dark:hover:bg-emerald-900/5'}`}
                    >
                      <div className="col-span-2 font-semibold text-gray-900 dark:text-white">
                        <div className="text-[11px] text-gray-500 dark:text-gray-400 font-bold">Sale #{row.saleId}</div>
                        <div className="text-[9px] mt-1 text-gray-500">{new Date(row.createdAt).toLocaleDateString()}</div>
                      </div>
                      <div className="col-span-3">
                        <div className="font-medium text-gray-900 dark:text-white truncate" title={row.displayMedicineName}>{row.displayMedicineName}</div>
                      </div>
                      <div className="col-span-2 text-gray-600 dark:text-gray-300 truncate" title={`${row.customerName || 'Walk-in'} - ${row.saleType || 'Regular'}`}>
                        <div className="flex items-center gap-2">
                          <span>{row.customerName || 'Walk-in Customer'}</span>
                          {(row.additionalDiscount ?? 0) > 0 && (
                            <span className="inline-flex items-center px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded text-[8px] font-bold text-amber-700 dark:text-amber-400 whitespace-nowrap">
                              Special Disc. -{row.additionalDiscount}%
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="col-span-1 text-right text-gray-600 dark:text-gray-300">
                        {row.isGrouped ? (
                          <span className="text-gray-400 italic text-[9px]">Multiple</span>
                        ) : (
                          <>{getCurrencySymbol()}{row.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>
                        )}
                      </div>
                      <div className="col-span-1 text-center">
                        <div className="flex flex-col items-center">
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-semibold">
                            {row.pills}
                          </span>
                          {(row.returnedPills ?? 0) > 0 && (
                            <span className="text-[8px] font-black text-rose-500 mt-0.5 uppercase tracking-tighter">
                              {row.returnedPills} Ret.
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="col-span-2 text-right">
                        <div className="font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">{getCurrencySymbol()}{row.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                      <div className="col-span-1 text-center">
                        <button
                          onClick={() => {
                            if (selectedSale?.saleId === row.saleId) {
                              setSelectedSale(null);
                            } else {
                              setSelectedSale(row);
                            }
                          }}
                          className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded shadow-sm transition-colors ${selectedSale?.saleId === row.saleId ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800' : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 border border-blue-200 dark:border-blue-800'}`}
                          title={selectedSale?.saleId === row.saleId ? "Close Details" : "View Details"}
                        >
                          {selectedSale?.saleId === row.saleId ? "Close" : "View"}
                        </button>
                      </div>
                    </div>

                    {/* Inline Details expansion */}
                    {selectedSale?.saleId === row.saleId && (
                      <div className="border-b border-gray-100 dark:border-gray-800 animate-in slide-in-from-top-1 fade-in duration-200 bg-gray-50/50 dark:bg-gray-800/30 shadow-inner w-full flex flex-col">
                        
                        {/* Inline header info */}
                        <div className="grid grid-cols-12 gap-3 px-8 py-3 bg-white dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-800">
                           <div className="col-span-3">
                              <span className="text-[10px] text-gray-400 font-bold block mb-0.5 uppercase tracking-wide">Customer</span>
                              <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{row.customerName || 'Walk-in Customer'}</span>
                           </div>
                           <div className="col-span-3">
                              <span className="text-[10px] text-gray-400 font-bold block mb-0.5 uppercase tracking-wide">Sale Info</span>
                              <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{new Date(row.createdAt).toLocaleDateString()}</span>
                              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/40 border border-emerald-300 dark:border-emerald-700 rounded text-[8px] font-bold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                                {(row as any).paymentMethod || 'CASH'}
                              </span>
                           </div>
                           <div className="col-span-3">
                              <span className="text-[10px] text-gray-400 font-bold block mb-0.5 uppercase tracking-wide">Contact</span>
                              <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{row.customerPhone || 'N/A'}</span>
                           </div>
                           {(row as any).notes && (
                           <div className="col-span-3">
                              <span className="text-[10px] text-gray-400 font-bold block mb-0.5 uppercase tracking-wide">Remarks</span>
                              <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400 italic line-clamp-2" title={(row as any).notes}>{(row as any).notes}</span>
                           </div>
                           )}
                        </div>

                        {/* Inline Table Header */}
                        <div className="grid grid-cols-12 gap-3 px-8 py-2 bg-gray-100/50 dark:bg-gray-800 text-[9px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-widest border-y border-gray-200 dark:border-gray-700">
                          <div className="col-span-1 text-center font-bold">#</div>
                          <div className="col-span-5 font-bold">Medicine Product</div>
                          <div className="col-span-2 text-center font-bold">Qty</div>
                          <div className="col-span-2 text-right font-bold">Price / Disc.</div>
                          <div className="col-span-2 text-right font-bold">Subtotal</div>
                        </div>

                        {/* Inline Table Body */}
                        <div className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900/40">
                           {row.children?.map((item: any, idx: number) => (
                             <div key={idx} className="grid grid-cols-12 gap-3 px-8 py-3 items-center hover:bg-gray-50/80 dark:hover:bg-gray-800/30 transition-all">
                                <div className="col-span-1 text-center text-[10px] text-gray-400">
                                   {(idx + 1).toString().padStart(2, '0')}
                                </div>
                                <div className="col-span-5">
                                   <div className="text-[11px] font-semibold text-gray-800 dark:text-gray-200">{item.medicineName}</div>
                                   <div className="text-[9px] text-gray-500">ID: #{item.medicineId}</div>
                                </div>
                                 <div className="col-span-2 text-center text-[11px] font-medium text-gray-600 dark:text-gray-400">
                                    <div className="flex flex-col items-center">
                                      <span>{item.pills}</span>
                                      {item.returnedPills > 0 && (
                                        <span className="text-[9px] text-gray-400 line-through decoration-red-400">Orig: {item.originalPills}</span>
                                      )}
                                    </div>
                                 </div>
                                <div className="col-span-2 text-right">
                                   <div className="text-[11px] font-medium text-gray-700 dark:text-gray-300">
                                      {getCurrencySymbol()}{item.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                   </div>
                                   {item.discountAmount > 0 && (
                                     <div className="text-[9px] text-red-500">
                                        -{getCurrencySymbol()}{item.discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                     </div>
                                   )}
                                </div>
                                <div className="col-span-2 text-right text-[11px] font-bold text-gray-900 dark:text-white">
                                   {getCurrencySymbol()}{item.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                             </div>
                           ))}
                        </div>

                        {/* Inline Footer */}
                        <div className="px-8 py-3 bg-emerald-50/80 dark:bg-emerald-900/10 border-b border-emerald-100/50 dark:border-emerald-900/30 flex flex-wrap justify-between gap-6 text-[10px] text-emerald-800 dark:text-emerald-400 tracking-wide">
                            <div className="flex flex-wrap gap-6 items-center">
                              {(() => {
                                const ch = row.children || [];
                                const detailReturns = ch.reduce((s, it) => s + (it.returnedTotal || 0), 0);
                                const grossTotal = ch.reduce((s, it) => s + (it.originalTotal ?? 0), 0);
                                const hasReturns = detailReturns > 0;
                                return (
                                  <>
                                    {hasReturns && grossTotal > 0 && (
                                      <div className="text-gray-800 dark:text-gray-200">
                                        <span className="font-bold opacity-70 uppercase mr-1">Gross total:</span>
                                        {getCurrencySymbol()}
                                        {grossTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        <span className="ml-1 text-[9px] font-medium opacity-60 normal-case">(before returns)</span>
                                      </div>
                                    )}
                                    <div>
                                      <span className="font-bold opacity-70 uppercase mr-1">
                                        {hasReturns ? 'Net subtotal:' : 'Subtotal:'}
                                      </span>
                                      {getCurrencySymbol()}
                                      {(row.subtotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </div>
                                  </>
                                );
                              })()}
                              <div><span className="font-bold opacity-70 uppercase mr-1">Tax:</span> +{getCurrencySymbol()}{(row.taxAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                              <div><span className="font-bold opacity-70 uppercase mr-1">Discount:</span> -{getCurrencySymbol()}{(row.discountAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                              {(row.children || []).reduce((s, it) => s + (it.returnedTotal || 0), 0) > 0 && (
                                <div className="text-rose-700 dark:text-rose-400">
                                  <span className="font-bold opacity-70 uppercase mr-1">Returns:</span>
                                  -{getCurrencySymbol()}
                                  {(row.children || []).reduce((s, it) => s + (it.returnedTotal || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                              )}
                              {(row.additionalDiscountAmount ?? 0) > 0 && (
                                <div><span className="font-bold opacity-70 uppercase mr-1">Extra Disc:</span> -{getCurrencySymbol()}{row.additionalDiscountAmount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                              )}
                            </div>
                            <div className="flex items-center gap-4 ml-auto">
                              <div className="text-xs"><span className="font-bold opacity-70 uppercase mr-1">Net Total:</span> <span className="font-black">{getCurrencySymbol()}{(row.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                            </div>
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                ))
              )}
            </div>

            {/* Totals Footer Row */}
            {!loading && !error && filteredRows.length > 0 && (
              <div className="grid grid-cols-12 gap-3 px-3 py-2.5 bg-gray-100 dark:bg-gray-700/50 border-t-2 border-gray-200 dark:border-gray-600 text-[11px] font-bold uppercase tracking-wide">
                <div className="col-span-10 text-right text-gray-600 dark:text-gray-300 pr-4">Grand Total</div>
                <div className="col-span-2 text-right text-emerald-700 dark:text-emerald-400">
                  {getCurrencySymbol()}{totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

      {/* Detail Modal removed in favor of Inline expansion */}

      {/* Export Dialog */}
      {showExportDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Export Sales Report</h3>
                <button
                  onClick={() => setShowExportDialog(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <FiX className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Export Format */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Export Format</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setExportFormat('pdf')}
                    className={`flex-1 px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                      exportFormat === 'pdf'
                        ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                    }`}
                  >
                    PDF
                  </button>
                  <button
                    onClick={() => setExportFormat('csv')}
                    className={`flex-1 px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                      exportFormat === 'csv'
                        ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                    }`}
                  >
                    CSV
                  </button>
                </div>
                {exportFormat === 'pdf' && (
                  <div className="mt-3">
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={showPreview}
                        onChange={(e) => setShowPreview(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Preview before Export PDF</span>
                    </label>
                  </div>
                )}
              </div>

              {/* Date Range */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Date Range
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">From Date</label>
                    <input
                      type="date"
                      value={exportFromDate}
                      onChange={(e) => setExportFromDate(e.target.value)}
                      placeholder={fromDate}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white dark:bg-gray-700 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">To Date</label>
                    <input
                      type="date"
                      value={exportToDate}
                      onChange={(e) => setExportToDate(e.target.value)}
                      placeholder={toDate}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white dark:bg-gray-700 text-sm"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Leave empty to export all records
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex gap-3">
              <button
                onClick={() => setShowExportDialog(false)}
                className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (exportFormat === 'pdf') {
                    handleDownloadPdf();
                  } else {
                    handleDownloadCsv();
                  }
                }}
                disabled={exporting}
                className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
              >
                {exporting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <FaArrowDown className="w-4 h-4" />
                    Export {exportFormat.toUpperCase()}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Preview Modal */}
      <PDFPreviewModal
        isOpen={!!pdfHtmlContent}
        htmlContent={pdfHtmlContent}
        onClose={() => setPdfHtmlContent(null)}
        onDownload={handleDownloadFromPreview}
        title="Sales Report Preview"
      />
    </div>
  );
}
