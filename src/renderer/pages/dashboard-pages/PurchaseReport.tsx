import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useDashboardHeader } from './useDashboardHeader';
import { FiCalendar, FiSearch, FiRefreshCw, FiEye, FiX, FiPhone, FiUser, FiFileText, FiTruck } from 'react-icons/fi';
import { FaArrowDown, FaCreditCard, FaShoppingBag, FaList, FaExclamationTriangle, FaFileInvoiceDollar, FaFilePdf, FaFileExcel, FaChevronDown, FaArrowLeft, FaUndo } from 'react-icons/fa';
import ReportDetailModal from '../../components/common/DetailModal';
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [showDownloadDropdown, setShowDownloadDropdown] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const pageSize = 10;
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { setHeader } = useDashboardHeader();
  const [pharmacySettings] = useState<PharmacySettings>(() => getStoredPharmacySettings());
  const isCashier = getAuthUser()?.role === 'cashier';

  // Get currency symbol
  const getCurrencySymbol = () => getSymbol(pharmacySettings.currency || 'USD');
  // Set header
  useEffect(() => {
    setHeader({
      title: 'Purchase Records',
      subtitle: 'View and manage all purchase transactions',
    });
    return () => setHeader(null);
  }, [setHeader]);

  const fetchPurchases = useCallback(async () => {
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
      window.electron.ipcRenderer.sendMessage('purchase-get-all', []);
    } catch (err) {
      setError('An unexpected error occurred');
      console.error(err);
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchPurchases();
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

  const [showPdfOptions, setShowPdfOptions] = useState(false);
  const [pdfExportOptions, setPdfExportOptions] = useState({
    // Supplier details
    includeName: true,
    includeCompany: true,
    includePhone: true,
    includeAddress: true,
    includeEmail: true,
    // Table columns
    includeDate: true,
    includeSupplier: true,
    includeItems: true,
    includePills: true,
    includeGrandTotal: true,
    includePaid: true,
    includeOutstanding: true
  });

  const handleDownloadPdf = async () => {
    setShowPdfOptions(false);
    try {
      const res = await exportPurchasesPdf(fromDate, toDate, pdfExportOptions);
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
      const res = await exportPurchasesCsv();
      if (!res.success) {
        alert('Failed to export CSV: ' + (res.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('Failed to export CSV');
    }
  };

  // Filter purchases based on search and date range
  const filteredPurchases = useMemo(() => {
    let filtered = purchases;

    // Filter by date range
    if (fromDate || toDate) {
      filtered = filtered.filter(purchase => {
        if (!purchase.createdAt) return true;
        const purchaseDate = new Date(purchase.createdAt);
        const from = fromDate ? new Date(fromDate) : null;
        const to = toDate ? new Date(toDate) : null;

        if (from && purchaseDate < from) return false;
        if (to) {
          const toEnd = new Date(to);
          toEnd.setHours(23, 59, 59, 999);
          if (purchaseDate > toEnd) return false;
        }
        return true;
      });
    }

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
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl border border-gray-200 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
              <h3 className="text-lg font-bold text-gray-800 dark:text-white">PDF Export Options</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Customize your purchase report export</p>
            </div>

            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Supplier Details Section */}
              <div>
                <h4 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3 pb-2 border-b border-gray-200 dark:border-gray-600">
                  Supplier Details
                </h4>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pdfExportOptions.includeName}
                      onChange={e => setPdfExportOptions({ ...pdfExportOptions, includeName: e.target.checked })}
                      className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Supplier Name</span>
                  </label>

                  <label className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pdfExportOptions.includeCompany}
                      onChange={e => setPdfExportOptions({ ...pdfExportOptions, includeCompany: e.target.checked })}
                      className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Company Name</span>
                  </label>

                  <label className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pdfExportOptions.includePhone}
                      onChange={e => setPdfExportOptions({ ...pdfExportOptions, includePhone: e.target.checked })}
                      className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Phone / Mobile</span>
                  </label>

                  <label className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pdfExportOptions.includeEmail}
                      onChange={e => setPdfExportOptions({ ...pdfExportOptions, includeEmail: e.target.checked })}
                      className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Email</span>
                  </label>

                  <label className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pdfExportOptions.includeAddress}
                      onChange={e => setPdfExportOptions({ ...pdfExportOptions, includeAddress: e.target.checked })}
                      className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Address</span>
                  </label>
                </div>
              </div>

              {/* Table Columns Section */}
              <div>
                <h4 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3 pb-2 border-b border-gray-200 dark:border-gray-600">
                  Table Columns
                </h4>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pdfExportOptions.includeDate}
                      onChange={e => setPdfExportOptions({ ...pdfExportOptions, includeDate: e.target.checked })}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Date / PO</span>
                  </label>

                  <label className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pdfExportOptions.includeSupplier}
                      onChange={e => setPdfExportOptions({ ...pdfExportOptions, includeSupplier: e.target.checked })}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Supplier</span>
                  </label>

                  <label className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pdfExportOptions.includeItems}
                      onChange={e => setPdfExportOptions({ ...pdfExportOptions, includeItems: e.target.checked })}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Items</span>
                  </label>

                  <label className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pdfExportOptions.includePills}
                      onChange={e => setPdfExportOptions({ ...pdfExportOptions, includePills: e.target.checked })}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Pills</span>
                  </label>

                  <label className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pdfExportOptions.includeGrandTotal}
                      onChange={e => setPdfExportOptions({ ...pdfExportOptions, includeGrandTotal: e.target.checked })}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Grand Total</span>
                  </label>

                  <label className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pdfExportOptions.includePaid}
                      onChange={e => setPdfExportOptions({ ...pdfExportOptions, includePaid: e.target.checked })}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Paid</span>
                  </label>

                  <label className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pdfExportOptions.includeOutstanding}
                      onChange={e => setPdfExportOptions({ ...pdfExportOptions, includeOutstanding: e.target.checked })}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Outstanding</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3 sticky bottom-0 bg-white dark:bg-gray-800">
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

        {/* Back to Purchasing Button */}
        <button
          onClick={() => window.location.hash = '#/purchasing-panel'}
          className="ml-auto px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 border border-emerald-500 text-white text-xs font-semibold rounded-md transition-colors uppercase tracking-wide flex items-center gap-1.5 shadow-sm"
        >
          <FaArrowLeft className="w-3.5 h-3.5" />
          Back to Purchasing
        </button>

        {/* Refresh Button */}
        <button
          onClick={fetchPurchases}
          className="px-3 py-1.5 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-xs font-semibold rounded-md transition-colors uppercase tracking-wide flex items-center gap-1.5 shadow-sm"
        >
          {renderIcon(FiRefreshCw, { className: `w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}` })}
          Refresh
        </button>
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
              <button
                onClick={fetchPurchases}
                disabled={loading}
                className="w-full sm:w-auto px-4 py-1.5 bg-gradient-to-r from-green-600 to-green-500 text-white rounded hover:from-green-700 hover:to-green-600 shadow-sm hover:shadow-md font-semibold text-xs uppercase tracking-wide disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? renderIcon(FiRefreshCw, { className: "animate-spin" }) : renderIcon(FiSearch, {})}
                Fetch Records
              </button>
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
                {/* Download Dropdown - Hidden for Cashiers */}
                {!isCashier && (
                  <div className="relative w-full sm:w-auto" ref={dropdownRef}>
                    <button
                      onClick={() => setShowDownloadDropdown(!showDownloadDropdown)}
                      className="w-full sm:w-auto px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded hover:bg-red-100 dark:hover:bg-red-900/40 font-semibold text-xs uppercase tracking-wide flex items-center justify-center gap-2 transition-colors"
                    >
                      {renderIcon(FaArrowDown, { className: "w-3.5 h-3.5" })}
                      Download
                      {renderIcon(FaChevronDown, { className: `w-3 h-3 transition-transform ${showDownloadDropdown ? 'rotate-180' : ''}` })}
                    </button>

                    {/* Dropdown Menu */}
                    {showDownloadDropdown && (
                      <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 overflow-hidden">
                        <button
                          onClick={() => { setShowDownloadDropdown(false); setShowPdfOptions(true); }}
                          className="w-full px-4 py-2.5 text-left text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3 transition-colors border-b border-gray-100 dark:border-gray-700"
                        >
                          {renderIcon(FaFilePdf, { className: "w-4 h-4 text-red-500" })}
                          <div>
                            <div className="font-bold">Export as PDF</div>
                            <div className="text-[10px] text-gray-500 dark:text-gray-400">Formatted report</div>
                          </div>
                        </button>
                        <button
                          onClick={handleDownloadCsv}
                          className="w-full px-4 py-2.5 text-left text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-green-50 dark:hover:bg-green-900/20 flex items-center gap-3 transition-colors"
                        >
                          {renderIcon(FaFileExcel, { className: "w-4 h-4 text-green-500" })}
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
                pagedPurchases.map((purchase) => (
                  <div key={purchase.id} className="contents border-b border-gray-100 dark:border-gray-700">
                    <div 
                      className="grid grid-cols-12 gap-3 px-3 py-2 text-[10px] items-center hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-all duration-200"
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
                            setSelectedPurchase(purchase);
                            setShowDetailModal(true);
                          }}
                          className="px-2.5 py-1.5 bg-blue-50 dark:bg-blue-900 text-white rounded-md hover:bg-blue-600 dark:hover:bg-blue-600 transition-colors shadow-sm"
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
      <ReportDetailModal
        isOpen={showDetailModal && !!selectedPurchase}
        onClose={() => setShowDetailModal(false)}
        title="Purchase Record"
        icon={FaShoppingBag}
        colorTheme="emerald"
        headerBadges={[
          { label: 'PO #', value: String(selectedPurchase?.id || '') },
          { label: 'Invoice', value: selectedPurchase?.invoiceNumber || 'N/A', isItalic: true }
        ]}
        infoCards={[
          { 
            title: 'Supplier Details', 
            value: selectedPurchase?.supplierName || 'N/A', 
            icon: FiTruck, 
            theme: 'emerald' 
          },
          { 
            title: 'Date & Status', 
            value: selectedPurchase?.createdAt ? new Date(selectedPurchase.createdAt).toLocaleDateString() : 'N/A', 
            icon: FiCalendar, 
            theme: 'blue',
            badge: {
              label: selectedPurchase?.status || 'Ordered',
              color: selectedPurchase?.status === 'received' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' :
                     selectedPurchase?.status === 'completed' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                     'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
            }
          },
          { 
            title: 'Internal Notes', 
            value: selectedPurchase?.notes || 'No notes provided.', 
            icon: FiFileText, 
            theme: 'purple' 
          }
        ]}
        tableTitle="Medicines Breakdown"
        tableItemsCount={selectedPurchase?.items.length || 0}
        tableHeaders={['#', 'Medicine Name', 'Pack Info', 'Qty', 'Unit Price', 'Subtotal']}
        items={selectedPurchase?.items || []}
        renderTableRow={(item, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-3 px-5 py-3.5 items-center hover:bg-gray-50/80 dark:hover:bg-gray-800/30 transition-all group">
            <div className="col-span-1 text-center font-normal text-gray-300 dark:text-gray-600">
              {String(idx + 1).padStart(2, '0')}
            </div>
            <div className="col-span-4 translate-x-1">
              <div className="text-[11px] font-normal text-gray-700 dark:text-gray-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{item.medicineName}</div>
              <div className="text-[9px] text-gray-400 dark:text-gray-500 mt-0.5 font-normal flex items-center gap-2">
                 <span>ID: #{item.medicineId}</span>
                 <span className="w-0.5 h-0.5 rounded-full bg-gray-300 dark:bg-gray-600"></span>
                 <span className="text-orange-500/80 italic">Exp: {item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : 'N/A'}</span>
              </div>
            </div>
            <div className="col-span-2 text-center">
              <div className="inline-block px-1.5 py-0.5 bg-gray-50/50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded text-[9px] font-normal text-gray-500 dark:text-gray-400">
                {item.pillsPerPacket} pills/pack
              </div>
            </div>
            <div className="col-span-1 text-right">
              <span className="text-[11px] font-normal text-gray-600 dark:text-gray-300">
                {item.packetQuantity}
              </span>
            </div>
            <div className="col-span-2 text-right">
              <div className="text-[11px] font-normal text-gray-600 dark:text-gray-300">
                {getCurrencySymbol()}{item.pricePerPacket.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="col-span-2 text-right">
              <div className="text-[11px] font-medium text-gray-900 dark:text-white">
                {getCurrencySymbol()}{item.lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        )}
        remarks={{
          title: 'Remarks',
          content: (
            <p className="text-[10px] leading-relaxed text-gray-500 dark:text-gray-400">
              Verified purchase record. Refer to PO# {selectedPurchase?.id} for any discrepancies.
            </p>
          )
        }}
        summaryItems={[
          { label: 'Gross Total', value: `${getCurrencySymbol()}${selectedPurchase?.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
          { label: 'Discount', type: 'discount', value: `${getCurrencySymbol()}${selectedPurchase?.discountTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
          { label: 'Tax', type: 'tax', value: `${getCurrencySymbol()}${selectedPurchase?.taxTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
          { label: 'Net Total', type: 'total', value: `${getCurrencySymbol()}${selectedPurchase?.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}` }
        ]}
        footerStatus={{
          label: 'System Record Verified',
          color: 'blue'
        }}
      >
        {/* Payment Progress */}
        <div className="p-4 rounded-2xl border border-blue-50 dark:border-blue-900/20 bg-blue-50/10 dark:bg-blue-900/5 mt-3">
          <div className="flex items-center justify-between gap-3 mb-3 px-1">
            <div className="flex-1">
              <div className="flex justify-between text-[8px] font-medium text-blue-400 uppercase tracking-widest mb-1.5">
                <span>Progress</span>
                <span className="italic">{selectedPurchase?.remainingBalance === 0 ? 'Fully Paid' : 'Pending'}</span>
              </div>
              <div className="h-1 bg-white dark:bg-gray-800 rounded-full overflow-hidden border border-blue-50 dark:border-blue-900/10">
                <div 
                  className="h-full bg-blue-400 transition-all duration-500"
                   style={{ width: `${Math.min(100, ((selectedPurchase?.paymentAmount || 0) / (selectedPurchase?.grandTotal || 1)) * 100)}%` }}
                ></div>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1 bg-white/50 dark:bg-gray-800/50 p-2 rounded-lg border border-blue-50 dark:border-gray-700/30">
              <div className="text-[8px] font-medium text-gray-400 uppercase leading-none mb-1">Paid</div>
              <div className="text-[10px] font-medium text-blue-600 dark:text-blue-400">{getCurrencySymbol()}{(selectedPurchase?.paymentAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            </div>
            <div className="flex-1 bg-white/50 dark:bg-gray-800/50 p-2 rounded-lg border border-orange-50 dark:border-gray-700/30">
              <div className="text-[8px] font-medium text-gray-400 uppercase leading-none mb-1">Due</div>
              <div className="text-[10px] font-medium text-orange-600 dark:text-orange-400">{getCurrencySymbol()}{(selectedPurchase?.remainingBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            </div>
          </div>
        </div>
      </ReportDetailModal>
    </div>
  );
}
