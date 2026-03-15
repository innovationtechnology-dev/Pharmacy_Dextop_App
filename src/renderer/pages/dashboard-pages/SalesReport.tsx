import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { getSalesFlatRowsByRange, FlatSaleRow, exportSalesPdf, exportSalesCsvByRange } from '../../utils/sales';
import { useDashboardHeader } from './useDashboardHeader';
import { getAuthUser } from '../../utils/auth';
import { FiCalendar, FiSearch, FiRefreshCw, FiEye, FiX, FiUser, FiPhone, FiFileText } from 'react-icons/fi';
import { FaArrowDown, FaCreditCard, FaShoppingCart, FaList, FaPercent, FaFileAlt, FaFilePdf, FaFileExcel, FaUndo, FaArrowLeft } from 'react-icons/fa';
import ReportDetailModal from '../../components/common/DetailModal';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
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

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Simulate a small delay for the animation effect if the fetch is too fast
      await new Promise(resolve => setTimeout(resolve, 500));

      const res = await getSalesFlatRowsByRange(fromDate, toDate);
      if (res.success && res.data) {
        setReportRows(res.data);
        setPage(1); // Reset to first page on new fetch
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

  // Initial fetch
  useEffect(() => {
    fetchReport();
  }, []); // Run once on mount

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
          items: [row]
        });
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
      }
    });

    const groupedData = Array.from(map.values()).map(row => ({
      ...row,
      displayMedicineName: row.itemDetails.join(', '), 
      isGrouped: row.itemDetails.length > 1,
      children: row.items
    }));

    // Step 2: Filter based on search
    if (!searchQuery.trim()) return groupedData;
    const q = searchQuery.toLowerCase();
    return groupedData.filter(row =>
      row.displayMedicineName.toLowerCase().includes(q) ||
      (row.customerName && row.customerName.toLowerCase().includes(q)) ||
      (row.saleType && row.saleType.toLowerCase().includes(q)) ||
      row.saleId.toString().includes(q)
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

  return (
    <div className="flex flex-col h-auto md:h-[calc(100vh-80px)] w-full bg-gradient-to-br from-gray-50 via-gray-50 to-gray-100/50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800/80 overflow-visible md:overflow-hidden px-4 pb-4 md:pb-0">

      {/* Stats Header - Single Row Design matching Medicines Page */}
      <div className="bg-gradient-to-br from-white via-white to-gray-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-gray-800/90 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-3 mb-2 flex flex-wrap items-center gap-3">

        {/* Total Revenue */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1.5 rounded-md border border-emerald-200 dark:border-emerald-600/50 shadow-sm">
            <FaCreditCard className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              Revenue
            </span>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 ml-1">
              {getCurrencySymbol()}{totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Medicines Sold */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1.5 rounded-md border border-blue-200 dark:border-blue-600/50 shadow-sm">
            <FaShoppingCart className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              Sold Medicine
            </span>
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 ml-1">
              {totalItemsSold.toLocaleString()}
            </span>
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


        {/* Back to Selling Button */}
        <button
          onClick={() => window.location.hash = '#/selling-panel'}
          className="ml-auto px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 border border-emerald-500 text-white text-xs font-semibold rounded-md transition-colors uppercase tracking-wide flex items-center gap-1.5 shadow-sm"
        >
          <FaArrowLeft className="w-3.5 h-3.5" />
          Back to Selling
        </button>

        {/* Refresh Button */}
        <button
          onClick={fetchReport}
          className="px-3 py-1.5 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-xs font-semibold rounded-md transition-colors uppercase tracking-wide flex items-center gap-1.5 shadow-sm"
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
              <button
                onClick={fetchReport}
                disabled={loading}
                className="w-full sm:w-auto px-4 py-1.5 bg-gradient-to-r from-green-600 to-green-500 text-white rounded hover:from-green-700 hover:to-green-600 shadow-sm hover:shadow-md font-semibold text-xs uppercase tracking-wide disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <FiRefreshCw className="animate-spin" /> : <FiSearch />}
                Fetch Reports
              </button>
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
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
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
                pagedRows.map((row) => (
                  <div key={row.saleId} className="contents border-b border-gray-100 dark:border-gray-700">
                    <div 
                      className="grid grid-cols-12 gap-3 px-3 py-2 text-[10px] items-center hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-all duration-200"
                    >
                      <div className="col-span-2 font-semibold text-gray-900 dark:text-white">
                        <div className="text-[11px] text-gray-500 dark:text-gray-400 font-bold">Sale #{row.saleId}</div>
                        <div className="text-[9px] mt-1 text-gray-500">{new Date(row.createdAt).toLocaleDateString()}</div>
                      </div>
                      <div className="col-span-3">
                        <div className="font-medium text-gray-900 dark:text-white truncate" title={row.displayMedicineName}>{row.displayMedicineName}</div>
                      </div>
                      <div className="col-span-2 text-gray-600 dark:text-gray-300 truncate" title={`${row.customerName || 'Walk-in'} - ${row.saleType || 'Regular'}`}>
                        <div>{row.customerName || 'Walk-in Customer'}</div>
                      </div>
                      <div className="col-span-1 text-right text-gray-600 dark:text-gray-300">
                        {row.isGrouped ? (
                          <span className="text-gray-400 italic text-[9px]">Multiple</span>
                        ) : (
                          <>{getCurrencySymbol()}{row.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>
                        )}
                      </div>
                      <div className="col-span-1 text-center">
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-semibold">
                          {row.pills}
                        </span>
                      </div>
                      <div className="col-span-2 text-right">
                        <div className="font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">{getCurrencySymbol()}{row.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                      <div className="col-span-1 text-center">
                        <button
                          onClick={() => {
                            setSelectedSale(row);
                            setShowDetailModal(true);
                          }}
                          className="px-2.5 py-1.5 bg-blue-400 dark:bg-blue-900/20 text-white rounded-md hover:bg-blue-600 dark:hover:bg-blue-600 transition-colors shadow-sm"
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

      {/* Detail Modal */}
      <ReportDetailModal
        isOpen={showDetailModal && !!selectedSale}
        onClose={() => setShowDetailModal(false)}
        title="Sale Transaction"
        icon={FaShoppingCart}
        colorTheme="emerald"
        headerBadges={[
          { label: 'Transaction #', value: String(selectedSale?.saleId || '') },
          { label: 'Pharmacy Records', value: '', isItalic: true }
        ]}
        infoCards={[
          { 
            title: 'Customer', 
            value: selectedSale?.customerName || 'Walk-in Customer', 
            icon: FiUser, 
            theme: 'blue' 
          },
          { 
            title: 'Sale Info', 
            value: selectedSale?.createdAt ? new Date(selectedSale.createdAt).toLocaleDateString() : 'N/A', 
            icon: FiCalendar, 
            theme: 'emerald',
            badge: {
              label: selectedSale?.paymentMethod || 'Cash',
              color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
            }
          },
          { 
            title: 'Contact Detail', 
            value: selectedSale?.customerPhone || 'N/A', 
            icon: FiPhone, 
            theme: 'purple' 
          }
        ]}
        tableTitle="Sold Products"
        tableItemsCount={selectedSale?.children.length || 0}
        tableHeaders={['#', 'Medicine Product', 'Qty', 'Unit Price', 'Disc.', 'Subtotal']}
        items={selectedSale?.children || []}
        renderTableRow={(item: any, idx: number) => (
          <div key={idx} className="grid grid-cols-12 gap-3 px-5 py-3.5 items-center hover:bg-gray-50/80 dark:hover:bg-gray-800/30 transition-all group">
            <div className="col-span-1 text-center font-normal text-gray-300 dark:text-gray-600">
              {String(idx + 1).padStart(2, '0')}
            </div>
            <div className="col-span-5 translate-x-1">
              <div className="text-[11px] font-normal text-gray-700 dark:text-gray-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{item.medicineName}</div>
              <div className="text-[9px] text-gray-400 dark:text-gray-500 mt-0.5 font-normal italic">ID: #{item.medicineId}</div>
            </div>
            <div className="col-span-1 text-right">
              <span className="text-[11px] font-normal text-gray-600 dark:text-gray-300">
                {item.pills}
              </span>
            </div>
            <div className="col-span-2 text-right">
              <div className="text-[11px] font-normal text-gray-600 dark:text-gray-300">
                {getCurrencySymbol()}{item.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="col-span-1 text-right">
              <div className="text-[11px] font-normal text-red-500">
                -{getCurrencySymbol()}{item.discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="col-span-2 text-right">
              <div className="text-[11px] font-medium text-gray-900 dark:text-white">
                {getCurrencySymbol()}{item.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        )}
        remarks={{
          title: 'Remarks',
          content: (
            <p className="text-[10px] leading-relaxed text-gray-500 dark:text-gray-400">
              {selectedSale?.notes || 'No customer remarks recorded.'}
            </p>
          )
        }}
        summaryItems={[
          { label: 'Subtotal', value: `${getCurrencySymbol()}${selectedSale?.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
          { label: 'Discount', type: 'discount', value: `${getCurrencySymbol()}${selectedSale?.discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
          { label: 'Tax', type: 'tax', value: `${getCurrencySymbol()}${selectedSale?.taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
          { label: 'Net Amount', type: 'total', value: `${getCurrencySymbol()}${selectedSale?.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }
        ]}
        footerStatus={{
          label: 'Transaction Finalized',
          color: 'emerald'
        }}
      />

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
