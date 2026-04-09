import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useDashboardHeader } from './useDashboardHeader';
import { FiCalendar, FiSearch, FiRefreshCw, FiEye, FiX, FiPhone, FiUser, FiFileText, FiTruck } from 'react-icons/fi';
import { FaArrowDown, FaCreditCard, FaShoppingBag, FaList, FaExclamationTriangle, FaFileInvoiceDollar, FaFilePdf, FaFileExcel, FaArrowLeft, FaUndo } from 'react-icons/fa';
import ReportDetailModal from '../../components/common/DetailModal';
import PDFPreviewModal from '../../components/common/PDFPreviewModal';
import { exportPurchasesPdf, exportPurchasesCsv } from '../../utils/purchases';
import { PharmacySettings, getStoredPharmacySettings } from '../../types/pharmacy';
import { currencySymbols, getCurrencySymbol as getSymbol } from '../../../common/currency';
import { getAuthUser } from '../../utils/auth';


interface PurchaseItem {
  medicineId: number;
  medicineName: string;
  packetQuantity: number;
  pillsPerPacket: number;
  totalPills: number;
  pricePerPacket: number;
  pricePerPill: number;
  discountAmount: number;
  taxAmount: number;
  lineSubtotal: number;
  lineTotal: number;
  expiryDate: string;
}

interface Purchase {
  id: number;
  supplierId: number;
  supplierName: string;
  items: PurchaseItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  paymentAmount: number;
  remainingBalance: number;
  notes?: string;
  status?: 'ordered' | 'received' | 'completed';
  invoiceNumber?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface Supplier {
  id: number;
  name: string;
  companyName?: string;
  phone?: string;
  email?: string;
  website?:string;
  address?: string;
}

const renderIcon = (Icon: any, props: any) => <Icon {...props} />;

export default function Purchases() {
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

  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'csv'>('pdf');
  const [exportSupplierId, setExportSupplierId] = useState<number | undefined>(undefined);
  const [exportFromDate, setExportFromDate] = useState<string>('');
  const [exportToDate, setExportToDate] = useState<string>('');
  const [exporting, setExporting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [pdfHtmlContent, setPdfHtmlContent] = useState<string | null>(null);
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [showPdfOptions, setShowPdfOptions] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | undefined>(undefined);
  const pageSize = 10;

  const { setHeader } = useDashboardHeader();
  const [pharmacySettings] = useState<PharmacySettings>(() => getStoredPharmacySettings());
  const isCashier = getAuthUser()?.role === 'cashier';
  // Get currency symbol
  const getCurrencySymbol = () => getSymbol(pharmacySettings.currency || 'PKR');
  // Set header
  useEffect(() => {
    setHeader({
      title: 'Purchase Records',
      subtitle: 'View and manage all purchase transactions',
    });
    return () => setHeader(null);
  }, [setHeader]);

  const handleTodayFilter = () => {
    setFromDate(today);
    setToDate(today);
    fetchPurchases(today, today);
  };

  const handleMonthFilter = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const mm = String(firstDay.getMonth() + 1).padStart(2, '0');
    const dd = String(firstDay.getDate()).padStart(2, '0');
    const fDate = `${firstDay.getFullYear()}-${mm}-${dd}`;
    setFromDate(fDate);
    setToDate(today);
    fetchPurchases(fDate, today);
  };

  const handleYearFilter = () => {
    const now = new Date();
    const fDate = `${now.getFullYear()}-01-01`;
    setFromDate(fDate);
    setToDate(today);
    fetchPurchases(fDate, today);
  };

  const fetchPurchases = useCallback(async (overrideFrom?: string, overrideTo?: string) => {
    setLoading(true);
    setError(null);
    try {
      // Simulate a small delay for the animation effect
      await new Promise(resolve => setTimeout(resolve, 500));

      window.electron.ipcRenderer.once('purchase-get-all-reply', (response: any) => {
        setLoading(false);
        if (response.success) {
          setPurchases(response.data || []);
          setPage(1); // Reset to first page on new fetch
        } else {
          setError(response.error || 'Failed to load purchases');
          setPurchases([]);
        }
      });
      // Pass the date range to the backend
      window.electron.ipcRenderer.sendMessage('purchase-get-all', [overrideFrom || fromDate, overrideTo || toDate]);
    } catch (err) {
      setError('An unexpected error occurred');
      console.error(err);
      setLoading(false);
    }
  }, [fromDate, toDate]);

  // Initial fetch
  useEffect(() => {
    fetchPurchases();
    // Fetch suppliers list
    window.electron.ipcRenderer.once('supplier-get-all-reply', (response: any) => {
      if (response.success) {
        setSuppliers(response.data || []);
      }
    });
    window.electron.ipcRenderer.sendMessage('supplier-get-all', []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  const handleDownloadPdf = async () => {
    setExporting(true);
    try {
      // Use export dates if provided, otherwise use empty strings to export all
      const fromDateToUse = exportFromDate || '';
      const toDateToUse = exportToDate || '';
      const res = await exportPurchasesPdf(fromDateToUse, toDateToUse, exportSupplierId, showPreview);
      setExporting(false);
      if (!res.success) {
        alert('Failed to export PDF: ' + (res.error || 'Unknown error'));
      } else if (showPreview && res.data?.htmlContent) {
        setPdfHtmlContent(res.data.htmlContent);
        setShowExportDialog(false);
      } else {
        setShowExportDialog(false);
        alert('Purchase report exported successfully!');
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
      const res = await exportPurchasesPdf(fromDateToUse, toDateToUse, exportSupplierId, false);
      if (res.success) {
        setPdfHtmlContent(null);
        alert('Purchase report downloaded successfully!');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to download PDF');
    }
  };

  const handleDownloadCsv = async () => {
    setExporting(true);
    try {
      // Use export dates if provided, otherwise use empty strings to export all
      const fromDateToUse = exportFromDate || '';
      const toDateToUse = exportToDate || '';
      const res = await exportPurchasesCsv(exportSupplierId, fromDateToUse, toDateToUse);
      setExporting(false);
      if (!res.success) {
        alert('Failed to export CSV: ' + (res.error || 'Unknown error'));
      } else {
        setShowExportDialog(false);
        alert('Purchase report exported successfully!');
      }
    } catch (err) {
      setExporting(false);
      console.error(err);
      alert('Failed to export CSV');
    }
  };

  // Filter purchases based on search query only (dates are handled by backend fetch)
  const filteredPurchases = useMemo(() => {
    let filtered = purchases;

    // Filter by search query
    if (!searchQuery.trim()) return filtered;
    const q = searchQuery.toLowerCase();
    return filtered.filter(purchase =>
      purchase.supplierName.toLowerCase().includes(q) ||
      purchase.id.toString().includes(q) ||
      purchase.items.some(item => item.medicineName.toLowerCase().includes(q))
    );
  }, [purchases, searchQuery]);

  // Pagination
  const totalPages = Math.ceil(filteredPurchases.length / pageSize);
  const pagedPurchases = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredPurchases.slice(start, start + pageSize);
  }, [filteredPurchases, page, pageSize]);

  // Stats
  const totalPurchaseAmount = useMemo(() => filteredPurchases.reduce((sum, p) => sum + p.grandTotal, 0), [filteredPurchases]);
  const totalPaid = useMemo(() => filteredPurchases.reduce((sum, p) => sum + p.paymentAmount, 0), [filteredPurchases]);
  const totalRemaining = useMemo(() => filteredPurchases.reduce((sum, p) => sum + p.remainingBalance, 0), [filteredPurchases]);
  const totalItems = useMemo(() => filteredPurchases.reduce((sum, p) => sum + p.items.reduce((s, i) => s + i.totalPills, 0), 0), [filteredPurchases]);

  return (
    <div className="flex flex-col h-auto md:h-[calc(100vh-80px)] w-full bg-gradient-to-br from-gray-50 via-gray-50 to-gray-100/50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800/80 overflow-visible md:overflow-hidden px-4 pb-4 md:pb-0">

      {/* PDF Export Options Modal */}
      {showPdfOptions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md border border-gray-200 dark:border-gray-700">
            <div className="p-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-800 dark:text-white">Export Purchase Report</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Select supplier filter for your report</p>
            </div>

            <div className="p-4">
              {/* Supplier Filter Section */}
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                <h4 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
                  <FiTruck className="w-4 h-4 text-blue-600" />
                  Supplier Filter
                </h4>
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                    Select Supplier
                  </label>
                  <select
                    value={selectedSupplierId || ''}
                    onChange={(e) => setSelectedSupplierId(e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  >
                    <option value="">All Suppliers</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name} {supplier.companyName ? `(${supplier.companyName})` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {selectedSupplierId 
                      ? '📋 Report will show individual medicine items from selected supplier' 
                      : '📋 Report will show all suppliers grouped together with their medicine items'}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3 bg-gray-50 dark:bg-gray-900/50">
              <button
                onClick={() => setShowPdfOptions(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDownloadPdf}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md shadow-sm transition-colors flex items-center gap-2"
              >
                {renderIcon(FaFilePdf, { className: "w-3.5 h-3.5" })}
                Export PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Header - Single Row Design matching Sales Report */}
      <div className="bg-gradient-to-br from-white via-white to-gray-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-gray-800/90 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-3 mb-2 flex flex-wrap items-center gap-3">

        {/* Total Purchases */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1.5 rounded-md border border-emerald-200 dark:border-emerald-600/50 shadow-sm">
            {renderIcon(FaShoppingBag, { className: "w-3.5 h-3.5 text-emerald-500" })}
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              Total Purchases
            </span>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 ml-1">
              {getCurrencySymbol()}{totalPurchaseAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Total Paid */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1.5 rounded-md border border-blue-200 dark:border-blue-600/50 shadow-sm">
            {renderIcon(FaCreditCard, { className: "w-3.5 h-3.5 text-blue-500" })}
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              Paid
            </span>
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 ml-1">
              {getCurrencySymbol()}{totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Outstanding */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-orange-50 dark:bg-orange-900/20 px-2.5 py-1.5 rounded-md border border-orange-200 dark:border-orange-600/50 shadow-sm">
            {renderIcon(FaExclamationTriangle, { className: "w-3.5 h-3.5 text-orange-500" })}
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              Outstanding
            </span>
            <span className="text-xs font-bold text-orange-600 dark:text-orange-400 ml-1">
              {getCurrencySymbol()}{totalRemaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Transactions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-purple-50 dark:bg-purple-900/20 px-2.5 py-1.5 rounded-md border border-purple-200 dark:border-purple-600/50 shadow-sm">
            {renderIcon(FaList, { className: "w-3.5 h-3.5 text-purple-500" })}
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              Transactions
            </span>
            <span className="text-xs font-bold text-purple-600 dark:text-purple-400 ml-1">
              {filteredPurchases.length}
            </span>
          </div>
        </div>

        {/* Total Items */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-pink-50 dark:bg-pink-900/20 px-2.5 py-1.5 rounded-md border border-pink-200 dark:border-pink-600/50 shadow-sm">
            {renderIcon(FaFileInvoiceDollar, { className: "w-3.5 h-3.5 text-pink-500" })}
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              Total Pills
            </span>
            <span className="text-xs font-bold text-pink-600 dark:text-pink-400 ml-1">
              {totalItems.toLocaleString()}
            </span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Back to Purchasing Button */}
          {isCashier && (
            <button
              onClick={() => window.location.hash = '#/purchasing-panel'}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 border border-emerald-500 text-white text-xs font-semibold rounded-md transition-colors uppercase tracking-wide flex items-center gap-1.5 shadow-sm"
            >
              <FaArrowLeft className="w-3.5 h-3.5" />
              Back to Purchasing
            </button>
          )}

          {/* Refresh Button */}
          <button
            onClick={() => fetchPurchases()}
            className="px-3 py-1.5 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-xs font-semibold rounded-md transition-colors uppercase tracking-wide flex items-center gap-1.5 shadow-sm"
          >
            {renderIcon(FiRefreshCw, { className: `w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}` })}
            Refresh
          </button>
        </div>
      </div>

      {/* Main Content: Vertical Layout */}
      <div className="flex flex-col gap-3 flex-1 overflow-visible md:overflow-hidden min-h-0">

        {/* Top: Date Range Filter */}
        <div className="flex-shrink-0">
          <div className="bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md">
            {/* Header */}
            <div className="px-4 py-2 bg-gradient-to-r from-green-50 to-green-100/50 dark:from-blue-900/20 dark:to-blue-800/10 border-b border-blue-200/50 dark:border-blue-800/30">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600">
                  {renderIcon(FiCalendar, { className: "w-4 h-4 text-white" })}
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
                  onClick={() => fetchPurchases()}
                  disabled={loading}
                  className="flex-1 sm:flex-none px-4 py-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 shadow-sm hover:shadow-md font-semibold text-xs uppercase tracking-wide disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? renderIcon(FiRefreshCw, { className: "animate-spin" }) : renderIcon(FiSearch, {})}
                  Fetch Records
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom: Purchases Table */}
        <div className="flex-1 flex flex-col overflow-visible md:overflow-hidden min-h-0">
          <div className="bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md flex-1 flex flex-col overflow-visible md:overflow-hidden">

            {/* Table Header / Actions */}
            <div className="px-4 py-3 bg-gradient-to-r from-green-50 to-green-100/50 dark:from-green-900/20 dark:to-green-800/10 border-b border-blue-200/50 dark:border-blue-800/30 flex-shrink-0">
              <div className="flex flex-col sm:flex-row items-center gap-3 justify-between">
                <div className="flex items-center gap-2 w-full sm:w-auto flex-1">
                  <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap hidden sm:block">
                    Search Purchases
                  </label>
                  <div className="flex-1 relative max-w-md">
                    <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500">
                      {renderIcon(FiSearch, { className: "w-3.5 h-3.5" })}
                    </div>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by supplier, medicine, or ID..."
                      className="w-full pl-10 pr-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-600 dark:bg-gray-700/50 dark:text-white rounded-md focus:ring-2 focus:ring-green-500/30 focus:border-green-500 outline-none transition-all bg-white"
                    />
                  </div>
                </div>
                {/* Download Button - Hidden for Cashiers */}
                {!isCashier && (
                  <button
                    onClick={() => setShowExportDialog(true)}
                    className="w-full sm:w-auto px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded hover:bg-red-100 dark:hover:bg-red-900/40 font-semibold text-xs uppercase tracking-wide flex items-center justify-center gap-2 transition-colors"
                  >
                    {renderIcon(FaArrowDown, { className: "w-3.5 h-3.5" })}
                    Download
                  </button>
                )}
              </div>
            </div>

            {/* Table Header Row */}
            <div className="grid grid-cols-12 gap-3 px-3 py-2 bg-gray-50/50 dark:bg-gray-700/30 border-b border-gray-100 dark:border-gray-700 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              <div className="col-span-2">Date / PO</div>
              <div className="col-span-2">Supplier</div>
              <div className="col-span-1">Status</div>
              <div className="col-span-1">Invoice #</div>
              <div className="col-span-1 text-center">Items</div>
              <div className="col-span-1 text-right">Grand Total</div>
              <div className="col-span-1 text-right">Paid</div>
              <div className="col-span-2 text-right">Outstanding</div>
              <div className="col-span-1 text-center">Actions</div>
            </div>

            {/* Table Body */}
            <div className="flex-1 overflow-visible md:overflow-y-auto">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                  {renderIcon(FiRefreshCw, { className: "w-8 h-8 animate-spin mb-2 text-emerald-500" })}
                  <p className="text-xs">Loading purchase records...</p>
                </div>
              ) : error ? (
                <div className="flex items-center justify-center h-full text-red-500 dark:text-red-400 text-sm">
                  {error}
                </div>
              ) : pagedPurchases.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 text-sm">
                  No purchase records found for the selected range.
                </div>
              ) : (
                (selectedPurchase ? pagedPurchases.filter(p => p.id === selectedPurchase.id) : pagedPurchases).map((purchase) => (
                  <React.Fragment key={purchase.id}>
                    <div 
                      className={`grid grid-cols-12 gap-3 px-3 py-2 text-[10px] items-center border-b transition-all duration-200 ${selectedPurchase?.id === purchase.id ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/30 dark:bg-emerald-900/10' : 'border-gray-50 dark:border-gray-800 hover:bg-emerald-50/20 dark:hover:bg-emerald-900/5'}`}
                    >
                      <div className="col-span-2 font-semibold text-gray-900 dark:text-white">
                        <div className="text-[11px] text-gray-500 dark:text-gray-400">#{purchase.id}</div>
                        {purchase.createdAt ? new Date(purchase.createdAt).toLocaleDateString() : '—'}
                        {purchase.updatedAt && purchase.updatedAt !== purchase.createdAt && (
                          <div className="text-[9px] text-blue-600 dark:text-blue-400 font-bold mt-1 inline-flex items-center gap-1 px-1 py-0.5 bg-blue-50 dark:bg-blue-900/20 rounded uppercase tracking-tighter">
                            <FiRefreshCw className="w-2.5 h-2.5" />
                            Updated: {new Date(purchase.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </div>
                        )}
                      </div>
                      <div className="col-span-2">
                        <div className="font-medium text-gray-900 dark:text-white truncate" title={purchase.supplierName}>{purchase.supplierName}</div>
                      </div>
                      <div className="col-span-1">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium capitalize
                          ${purchase.status === 'received' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
                            purchase.status === 'completed' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
                              'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'}`}>
                          {purchase.status || 'Ordered'}
                        </span>
                      </div>
                      <div className="col-span-1 text-gray-500 dark:text-gray-400 truncate">
                        {purchase.invoiceNumber || '-'}
                      </div>
                      <div className="col-span-1 text-center">
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold">
                          {purchase.items.length}
                        </span>
                      </div>
                      <div className="col-span-1 text-right">
                        <div className="font-bold text-emerald-600 dark:text-emerald-400">{getCurrencySymbol()}{purchase.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                      <div className="col-span-1 text-right text-blue-600 dark:text-blue-400">
                        {getCurrencySymbol()}{purchase.paymentAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className="col-span-2 text-right">
                        {purchase.remainingBalance > 0 ? (
                          <span className="text-orange-600 dark:text-orange-400 font-medium">
                            {getCurrencySymbol()}{purchase.remainingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-green-500 dark:text-green-400 flex items-center justify-end gap-1 font-bold">
                            Paid Fully
                          </span>
                        )}
                      </div>
                      <div className="col-span-1 text-center">
                        <button
                          onClick={() => {
                            if (selectedPurchase?.id === purchase.id) {
                              setSelectedPurchase(null);
                            } else {
                              setSelectedPurchase(purchase);
                            }
                          }}
                          className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded shadow-sm transition-colors ${selectedPurchase?.id === purchase.id ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800' : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 border border-blue-200 dark:border-blue-800'}`}
                          title={selectedPurchase?.id === purchase.id ? "Close Details" : "View Details"}
                        >
                          {selectedPurchase?.id === purchase.id ? "Close" : "View"}
                        </button>
                      </div>
                    </div>

                    {/* Inline Details expansion */}
                    {selectedPurchase?.id === purchase.id && (
                      <div className="border-b border-gray-100 dark:border-gray-800 animate-in slide-in-from-top-1 fade-in duration-200 bg-gray-50/50 dark:bg-gray-800/30 shadow-inner w-full flex flex-col">
                        
                        {/* Header info */}
                        <div className="grid grid-cols-12 gap-3 px-8 py-3 bg-white dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-800">
                           <div className="col-span-3">
                              <span className="text-[10px] text-gray-400 font-bold block mb-0.5 uppercase tracking-wide">Supplier</span>
                              <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{purchase.supplierName || 'Unknown Supplier'}</span>
                           </div>
                           <div className="col-span-3">
                              <span className="text-[10px] text-gray-400 font-bold block mb-0.5 uppercase tracking-wide">PO & Date</span>
                              <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">PO #{purchase.id}</span>
                              <span className="ml-2 text-[9px] text-gray-500">{new Date(purchase.createdAt || '').toLocaleDateString()}</span>
                           </div>
                           <div className="col-span-3">
                              <span className="text-[10px] text-gray-400 font-bold block mb-0.5 uppercase tracking-wide">Status</span>
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider
                                ${purchase.status === 'received' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' :
                                  purchase.status === 'completed' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                                  'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'}`}>
                                {purchase.status || 'Ordered'}
                              </span>
                           </div>
                           {purchase.notes && (
                           <div className="col-span-3">
                              <span className="text-[10px] text-gray-400 font-bold block mb-0.5 uppercase tracking-wide">Internal Notes</span>
                              <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400 italic line-clamp-2" title={purchase.notes}>{purchase.notes}</span>
                           </div>
                           )}
                        </div>

                        {/* Payment Progress inline */}
                        <div className="px-8 py-2 bg-gray-50/50 dark:bg-gray-900/20 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-6">
                           <div className="flex-1 flex flex-col justify-center">
                              <div className="flex justify-between text-[8px] font-medium text-blue-500 dark:text-blue-400 uppercase tracking-widest mb-1">
                                <span>Payment Progress</span>
                                <span className="italic">{purchase.remainingBalance === 0 ? 'Fully Paid' : 'Pending'}</span>
                              </div>
                              <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden w-full max-w-sm">
                                <div 
                                  className="h-full bg-blue-500 transition-all duration-500"
                                  style={{ width: `${Math.min(100, ((purchase.paymentAmount || 0) / (purchase.grandTotal || 1)) * 100)}%` }}
                                ></div>
                              </div>
                           </div>
                           <div className="flex gap-4 items-center">
                              <div className="text-right">
                                <span className="text-[8px] font-medium text-gray-400 uppercase leading-none block">Paid</span>
                                <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400">{getCurrencySymbol()}{(purchase.paymentAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                              </div>
                              <div className="w-px h-6 bg-gray-200 dark:bg-gray-700"></div>
                              <div className="text-left">
                                <span className="text-[8px] font-medium text-gray-400 uppercase leading-none block">Due</span>
                                <span className="text-[10px] font-medium text-orange-600 dark:text-orange-400">{getCurrencySymbol()}{(purchase.remainingBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                              </div>
                           </div>
                        </div>

                        {/* Inner Table Header */}
                        <div className="grid grid-cols-12 gap-3 px-8 py-2 bg-gray-100/50 dark:bg-gray-800 text-[9px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-widest border-b border-gray-200 dark:border-gray-700">
                          <div className="col-span-1 text-center font-bold">#</div>
                          <div className="col-span-5 font-bold">Medicine Product</div>
                          <div className="col-span-2 text-center font-bold">Pack Info</div>
                          <div className="col-span-1 text-right font-bold">Qty</div>
                          <div className="col-span-1 text-right font-bold">Unit Price</div>
                          <div className="col-span-2 text-right font-bold">Subtotal</div>
                        </div>

                        {/* Inner Table Body */}
                        <div className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900/40">
                           {purchase.items?.map((item: any, idx: number) => (
                             <div key={idx} className="grid grid-cols-12 gap-3 px-8 py-3 items-center hover:bg-gray-50/80 dark:hover:bg-gray-800/30 transition-all">
                                <div className="col-span-1 text-center text-[10px] text-gray-400">
                                   {(idx + 1).toString().padStart(2, '0')}
                                </div>
                                <div className="col-span-5">
                                   <div className="text-[11px] font-semibold text-gray-800 dark:text-gray-200">{item.medicineName}</div>
                                   <div className="text-[9px] text-gray-500 flex flex-wrap gap-2 items-center">
                                     <span>ID: #{item.medicineId}</span>
                                     <span className="w-0.5 h-0.5 rounded-full bg-gray-300 dark:bg-gray-600"></span>
                                     <span className="text-orange-500/80 italic">Exp: {item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : 'N/A'}</span>
                                   </div>
                                </div>
                                <div className="col-span-2 text-center">
                                   <span className="inline-block px-1.5 py-0.5 bg-gray-50/50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded text-[9px] font-normal text-gray-500 dark:text-gray-400">
                                     {item.pillsPerPacket} pills/pack
                                   </span>
                                </div>
                                <div className="col-span-1 text-right text-[11px] font-medium text-gray-600 dark:text-gray-400">
                                   {item.packetQuantity}
                                </div>
                                <div className="col-span-1 text-right">
                                   <div className="text-[11px] font-medium text-gray-700 dark:text-gray-300">
                                      {getCurrencySymbol()}{item.pricePerPacket.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                   </div>
                                </div>
                                <div className="col-span-2 text-right text-[11px] font-bold text-gray-900 dark:text-white">
                                   {getCurrencySymbol()}{item.lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                             </div>
                           ))}
                        </div>

                        {/* Footer */}
                        <div className="px-8 py-3 bg-emerald-50/80 dark:bg-emerald-900/10 border-t border-b border-emerald-100/50 dark:border-emerald-900/30 flex flex-wrap justify-between gap-6 text-[10px] text-emerald-800 dark:text-emerald-400 tracking-wide">
                            <div className="flex flex-wrap gap-6 items-center">
                              <div><span className="font-bold opacity-70 uppercase mr-1">Gross Total:</span> {getCurrencySymbol()}{(purchase.subtotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                              <div><span className="font-bold opacity-70 uppercase mr-1">Discount:</span> -{getCurrencySymbol()}{(purchase.discountTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                              <div><span className="font-bold opacity-70 uppercase mr-1">Tax:</span> +{getCurrencySymbol()}{(purchase.taxTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                            </div>
                            <div className="flex items-center gap-4 ml-auto">
                              <div className="text-xs"><span className="font-bold opacity-70 uppercase mr-1">Net Total:</span> <span className="font-black">{getCurrencySymbol()}{(purchase.grandTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                            </div>
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                ))
              )}
            </div>

            {/* Totals Footer Row */}
            {!loading && !error && filteredPurchases.length > 0 && (
              <div className="grid grid-cols-12 gap-3 px-3 py-2.5 bg-gray-100 dark:bg-gray-700/50 border-t-2 border-gray-200 dark:border-gray-600 text-[11px] font-bold uppercase tracking-wide">
                <div className="col-span-6 text-right text-gray-600 dark:text-gray-300 pr-4">Total</div>
                <div className="col-span-1 text-right text-emerald-700 dark:text-emerald-400">
                  {getCurrencySymbol()}{totalPurchaseAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="col-span-1 text-right text-blue-700 dark:text-blue-400">
                  {getCurrencySymbol()}{totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="col-span-2 text-right text-orange-700 dark:text-orange-400">
                  {getCurrencySymbol()}{totalRemaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
      {/* Detail Modal removed in favor of Inline expansion */}

      {/* Export Dialog */}
      {showExportDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Export Purchase Records</h3>
                <button
                  onClick={() => setShowExportDialog(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  {renderIcon(FiX, { className: "w-5 h-5 text-gray-500" })}
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

              {/* Supplier Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Supplier (Optional)
                </label>
                <select
                  value={exportSupplierId || ''}
                  onChange={(e) => setExportSupplierId(e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white dark:bg-gray-700"
                >
                  <option value="">All Suppliers</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.companyName ? `(${s.companyName})` : ''}
                    </option>
                  ))}
                </select>
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
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white dark:bg-gray-700 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">To Date</label>
                    <input
                      type="date"
                      value={exportToDate}
                      onChange={(e) => setExportToDate(e.target.value)}
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
                    {renderIcon(FaArrowDown, { className: "w-4 h-4" })}
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
        title="Purchase Report Preview"
      />
    </div>
  );
}
