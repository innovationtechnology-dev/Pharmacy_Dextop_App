'use client';

import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { useDebouncedSearch } from '../../hooks/useDebounce';
import {
  FiRefreshCw,
  FiCreditCard,
  FiCheck,
  FiAlertCircle,
  FiPlus,
  FiTrash2,
  FiX,
  FiSearch,
  FiCalendar,
  FiFilter,
  FiDownload,
  FiDollarSign,
  FiTrendingUp,
  FiTrendingDown,
  FiFileText,
  FiUsers,
  FiPhone,
  FiMail,
  FiEye,
  FiChevronDown,
  FiChevronUp,
  FiCheckCircle,
  FiShoppingCart,
} from 'react-icons/fi';
import { useDashboardHeader } from './useDashboardHeader';
import PDFPreviewModal from '../../components/common/PDFPreviewModal';
import { KpiCard } from '../../components/reports/ReportUI';
import { PharmacySettings, getStoredPharmacySettings } from '../../types/pharmacy';
import { currencySymbols, getCurrencySymbol as getSymbol } from '../../../common/currency';

// Types
type PaymentMethod = 'cash' | 'bank_transfer' | 'check' | 'online';
type PeriodType = 'all' | 'today' | 'week' | 'month' | 'year' | 'custom';

interface Purchase {
  id: number;
  supplierId: number;
  supplierName: string;
  grandTotal: number;
  paymentAmount: number;
  remainingBalance: number;
  createdAt?: string;
}

interface Supplier {
  id: number;
  name: string;
  companyName?: string;
  phone?: string;
  email?: string;
}

interface PaymentRecord {
  id: number;
  purchaseId: number;
  supplierId: number;
  supplierName: string;
  companyName?: string;
  amount: number;
  paymentMethod: PaymentMethod;
  referenceNumber?: string;
  checkNumber?: string;
  bankName?: string;
  accountNumber?: string;
  notes?: string;
  paymentDate: string;
  createdAt?: string;
  /** Shared by the pieces of one payment that was split across several POs. */
  batchId?: string;
  purchaseTotal?: number;
  /** Still unpaid on this PO right after this piece. */
  remainingAfter?: number;
}

/** One payment as the cashier made it: total plus the pieces it was split into. */
interface PaymentGroup {
  key: string;
  at: string;
  supplierName: string;
  companyName?: string;
  paymentMethod: PaymentMethod;
  referenceNumber?: string;
  checkNumber?: string;
  bankName?: string;
  total: number;
  /** In the order the money was applied (oldest purchase first). */
  pieces: PaymentRecord[];
}

interface PaymentSummary {
  totalPurchases: number;
  totalPaid: number;
  totalRemaining: number;
  cashPayments: number;
  bankTransferPayments: number;
  checkPayments: number;
  onlinePayments: number;
  paymentCount: number;
}

interface SupplierLedgerRow {
  kind: 'purchase' | 'payment';
  eventAt: string;
  purchaseId: number;
  paymentId?: number;
  supplierId: number;
  supplierName: string;
  debit: number;
  credit: number;
  balanceBefore?: number;
  balanceAfter: number;
  grandTotal?: number;
  paymentAmount?: number;
  remainingBalance?: number;
  /** Unpaid on this PO right after the event (replay order). */
  poRemainingAfter?: number;
  paymentMethod?: string;
  reference?: string;
  notes?: string;
  /** Shared by all PO slices of one supplier payment. */
  batchId?: string;
}

/** Ledger display item: a single row, or one supplier payment that was split across several POs. */
type LedgerItem =
  | { type: 'row'; row: SupplierLedgerRow }
  | { type: 'batch'; key: string; rows: SupplierLedgerRow[] };

interface SupplierAccount {
  supplierId: number;
  supplierName: string;
  companyName?: string;
  phone?: string;
  email?: string;
  totalPurchases: number;
  totalPaid: number;
  totalRemaining: number;
  purchaseCount: number;
  lastPaymentDate?: string;
  lastPaymentAmount?: number;
}

/** One row in Add Payment: total open balance per supplier (FIFO applied on save). */
interface SupplierPayTarget {
  supplierId: number;
  supplierName: string;
  totalDue: number;
  openPoCount: number;
  latestPurchaseId: number;
}


const paymentMethodLabels: Record<string, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  bank_deposit: 'Bank Transfer',
  check: 'Check / Cheque',
  cheque: 'Check / Cheque',
  online: 'Online Payment',
  card: 'Online Payment',
  other: 'Other',
};

const paymentMethodColors: Record<string, { bg: string; text: string; border: string }> = {
  cash: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', border: 'border-green-300 dark:border-green-700' },
  bank_transfer: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-300 dark:border-blue-700' },
  bank_deposit: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-300 dark:border-blue-700' },
  check: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-300 dark:border-amber-700' },
  cheque: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-300 dark:border-amber-700' },
  online: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-300 dark:border-purple-700' },
  card: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-300 dark:border-purple-700' },
  other: { bg: 'bg-gray-100 dark:bg-gray-700/30', text: 'text-gray-700 dark:text-gray-300', border: 'border-gray-300 dark:border-gray-600' },
};

// Helper function to get payment method colors safely
const getPaymentMethodColor = (method: string) => {
  return paymentMethodColors[method] || paymentMethodColors.other;
};

// Helper function to get payment method label safely
const getPaymentMethodLabel = (method: string) => {
  return paymentMethodLabels[method] || method;
};

const toLocalIsoDate = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/** Supplier ledger columns: When | What happened | Amount | Owed after | Actions */
const supplierLedgerGridStyle: React.CSSProperties = {
  gridTemplateColumns: 'minmax(110px, 0.7fr) minmax(320px, 3fr) minmax(150px, 1fr) minmax(170px, 1.1fr) 104px',
};

const ledgerGridHeaderClass =
  'grid w-full items-center gap-4 px-4 py-2.5 border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/40 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400';

const ledgerGridRowClass =
  'grid w-full items-center gap-4 px-4 py-3 border-b border-gray-100 dark:border-gray-700/70 last:border-b-0 transition-colors hover:bg-gray-50/80 dark:hover:bg-gray-700/20';

const Payments: React.FC = () => {
  const { setHeader } = useDashboardHeader();

  // Core state
  const [pharmacySettings] = useState<PharmacySettings>(() => getStoredPharmacySettings());
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [paymentRecords, setPaymentRecords] = useState<PaymentRecord[]>([]);
  const [supplierAccounts, setSupplierAccounts] = useState<SupplierAccount[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [supplierLedger, setSupplierLedger] = useState<SupplierLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasePage, setPurchasePage] = useState(1);
  const [totalPurchases, setTotalPurchases] = useState(0);
  const [hasMorePurchases, setHasMorePurchases] = useState(true);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Filter state
  const [activeTab, setActiveTab] = useState<'payments' | 'records' | 'accounts'>('payments');
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);
  const [periodType, setPeriodType] = useState<PeriodType>('all'); // Default to all to show all payment records
  const [customFromDate, setCustomFromDate] = useState<string>('');
  const [customToDate, setCustomToDate] = useState<string>('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [purchaseFilter, setPurchaseFilter] = useState<'all' | 'pending' | 'paid'>('all');
  const [ledgerOrder, setLedgerOrder] = useState<'newest' | 'oldest'>('newest');
  const { searchTerm, setSearchTerm, handleSearchChange, immediateSearchTerm } = useDebouncedSearch('', 300);

  // Modal state (supplier-level total; payment is allocated oldest PO first on the server)
  const [paymentModalSupplier, setPaymentModalSupplier] = useState<SupplierPayTarget | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [senderNumber, setSenderNumber] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const today = useMemo(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }, []);

  const [paymentDate, setPaymentDate] = useState(today);
  const [processing, setProcessing] = useState(false);
  const [viewPaymentHistory, setViewPaymentHistory] = useState<Purchase | null>(null);
  /** Ledger payment row opened via eye icon (full method / ref / notes). */
  const [viewLedgerPayment, setViewLedgerPayment] = useState<SupplierLedgerRow | null>(null);
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
  const [purchasePayments, setPurchasePayments] = useState<PaymentRecord[]>([]);
  const [loadingPurchasePayments, setLoadingPurchasePayments] = useState(false);
  const [expandedAccount, setExpandedAccount] = useState<number | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportSupplierId, setExportSupplierId] = useState<number | null>(null);
  const [exportFromDate, setExportFromDate] = useState<string>('');
  const [exportToDate, setExportToDate] = useState<string>('');
  const [exportFormat, setExportFormat] = useState<'pdf' | 'csv'>('pdf');
  const [showPreview, setShowPreview] = useState(false);
  const [pdfHtmlContent, setPdfHtmlContent] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(30);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());
  const LEDGER_ROWS_PER_PAGE = 20;
  
  // View mode state
  const [recordsViewMode, setRecordsViewMode] = useState<'table' | 'timeline'>('table');

  // Format helpers
  const formatCurrency = useCallback((value: number) => {
    const currency = pharmacySettings.currency || 'USD';
    const symbol = getSymbol(currency);
    if (currency === 'INR' || currency === 'PKR') {
      return `${symbol}${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
  }, [pharmacySettings.currency]);

  const formatDate = useCallback((value?: string) => {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }, []);

  const formatDateTime = useCallback((value?: string) => {
    if (!value) return '—';
    return new Date(value)
      .toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
      .replace(/\b(am|pm)\b/, (m) => m.toUpperCase());
  }, []);

  const isToday = useCallback((dateString?: string) => {
    if (!dateString) return false;
    const date = new Date(dateString);
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  }, []);

  // Load data
  const loadPurchases = useCallback(async (page: number = 1, append: boolean = false) => {
    return new Promise<void>((resolve, reject) => {
      try {
        // Build date filters for purchases
        let fromDate: string | undefined;
        let toDate: string | undefined;
        
        if (periodType !== 'all') {
          const today = new Date();
          toDate = toLocalIsoDate(today);
          
          switch (periodType) {
            case 'today':
              fromDate = toDate;
              break;
            case 'week':
              const weekAgo = new Date(today);
              weekAgo.setDate(weekAgo.getDate() - 7);
              fromDate = toLocalIsoDate(weekAgo);
              break;
            case 'month':
              fromDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
              break;
            case 'year':
              fromDate = `${today.getFullYear()}-01-01`;
              break;
            case 'custom':
              if (customFromDate && customToDate) {
                fromDate = customFromDate;
              }
              break;
          }
        }

        window.electron.ipcRenderer.once('purchase-get-all-reply', (response: any) => {
          if (response.success) {
            const purchases = response.data || [];
            if (append) {
              setPurchases(prev => [...prev, ...purchases]);
            } else {
              setPurchases(purchases);
            }
            // Check if there are more records
            setHasMorePurchases(purchases.length === recordsPerPage);
            resolve();
          } else {
            console.error('Error loading purchases:', response.error);
            reject(response.error);
          }
        });

        // Get total count for purchases
        window.electron.ipcRenderer.once('purchase-get-count-reply', (countResponse: any) => {
          if (countResponse.success) {
            setTotalPurchases(countResponse.data || 0);
          }
        });

        // Pass date range and pagination parameters
        const offset = (page - 1) * recordsPerPage;
        window.electron.ipcRenderer.sendMessage('purchase-get-all', [fromDate, toDate, recordsPerPage, offset]);
        window.electron.ipcRenderer.sendMessage('purchase-get-count', [fromDate, toDate]);
      } catch (err) {
        console.error('Error loading purchases:', err);
        reject(err);
      }
    });
  }, [periodType, customFromDate, customToDate, recordsPerPage]);

  const loadMorePurchases = useCallback(() => {
    if (!hasMorePurchases || loading) return;
    const nextPage = purchasePage + 1;
    setPurchasePage(nextPage);
    loadPurchases(nextPage, true);
  }, [purchasePage, hasMorePurchases, loading, loadPurchases]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMorePurchases && !loading) {
          loadMorePurchases();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    observerRef.current = observer;

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMorePurchases, loading, loadMorePurchases]);

  const loadSuppliers = useCallback(async () => {
    return new Promise<void>((resolve, reject) => {
      try {
        window.electron.ipcRenderer.once('supplier-get-all-reply', (response: any) => {
          if (response.success) {
            setSuppliers(response.data || []);
            resolve();
          } else {
            reject(response.error);
          }
        });
        window.electron.ipcRenderer.sendMessage('supplier-get-all', []);
      } catch (err) {
        console.error('Error loading suppliers:', err);
        reject(err);
      }
    });
  }, []);

  const loadPaymentRecords = useCallback(async () => {
    return new Promise<void>((resolve, reject) => {
      try {
        const filters: any = {
          page: currentPage,
          limit: recordsPerPage,
        };
        if (selectedSupplierId) filters.supplierId = selectedSupplierId;
        if (selectedPaymentMethod) filters.paymentMethod = selectedPaymentMethod;
        if (periodType !== 'all') {
          filters.periodType = periodType;
          if (periodType === 'custom' && customFromDate && customToDate) {
            filters.fromDate = customFromDate;
            filters.toDate = customToDate;
          }
        } else {
          // If 'all' is selected, still apply default date range for performance
          filters.fromDate = customFromDate;
          filters.toDate = customToDate;
          filters.periodType = 'custom';
        }

        window.electron.ipcRenderer.once('payment-get-all-reply' as any, (response: any) => {
          if (response.success) {
            if (response.data.data) {
              // Paginated response
              setPaymentRecords(response.data.data || []);
              setTotalRecords(response.data.total || 0);
              setTotalPages(response.data.totalPages || 1);
            } else {
              // Non-paginated response (fallback)
              setPaymentRecords(response.data || []);
              setTotalRecords(response.data?.length || 0);
              setTotalPages(1);
            }
            resolve();
          } else {
            console.error('Error loading payment records:', response.error);
            reject(response.error);
          }
        });
        // Not paginated: pieces of one payment are grouped on screen, so paging happens per payment.
        window.electron.ipcRenderer.sendMessage('payment-get-all' as any, [filters, false]);
      } catch (err) {
        console.error('Error loading payment records:', err);
        reject(err);
      }
    });
  }, [selectedSupplierId, selectedPaymentMethod, periodType, customFromDate, customToDate, currentPage, recordsPerPage]);

  const loadPaymentSummary = useCallback(async () => {
    return new Promise<void>((resolve, reject) => {
      try {
        const filters: any = {};
        if (selectedSupplierId) filters.supplierId = selectedSupplierId;
        if (periodType !== 'all') {
          filters.periodType = periodType;
          if (periodType === 'custom' && customFromDate && customToDate) {
            filters.fromDate = customFromDate;
            filters.toDate = customToDate;
          }
        }

        window.electron.ipcRenderer.once('payment-get-summary-reply' as any, (response: any) => {
          if (response.success) {
            setPaymentSummary(response.data);
            resolve();
          } else {
            reject(response.error);
          }
        });
        window.electron.ipcRenderer.sendMessage('payment-get-summary' as any, [filters]);
      } catch (err) {
        console.error('Error loading payment summary:', err);
        reject(err);
      }
    });
  }, [selectedSupplierId, periodType, customFromDate, customToDate]);

  const loadSupplierLedger = useCallback(async () => {
    return new Promise<void>((resolve, reject) => {
      try {
        const filters: Record<string, unknown> = {};
        if (selectedSupplierId) filters.supplierId = selectedSupplierId;
        if (periodType !== 'all') {
          filters.periodType = periodType;
          if (periodType === 'custom' && customFromDate && customToDate) {
            filters.fromDate = customFromDate;
            filters.toDate = customToDate;
          }
        }

        window.electron.ipcRenderer.once('payment-get-supplier-ledger-reply' as any, (response: any) => {
          if (response.success) {
            setSupplierLedger(response.data || []);
            resolve();
          } else {
            reject(response.error);
          }
        });
        window.electron.ipcRenderer.sendMessage('payment-get-supplier-ledger' as any, [filters]);
      } catch (err) {
        console.error('Error loading supplier ledger:', err);
        reject(err);
      }
    });
  }, [selectedSupplierId, periodType, customFromDate, customToDate]);

  const loadSupplierAccounts = useCallback(async () => {
    return new Promise<void>((resolve, reject) => {
      try {
        window.electron.ipcRenderer.once('payment-get-supplier-accounts-reply' as any, (response: any) => {
          if (response.success) {
            setSupplierAccounts(response.data || []);
            resolve();
          } else {
            reject(response.error);
          }
        });
        window.electron.ipcRenderer.sendMessage('payment-get-supplier-accounts' as any, []);
      } catch (err) {
        console.error('Error loading supplier accounts:', err);
        reject(err);
      }
    });
  }, []);

  const loadPurchasePayments = useCallback(async (purchaseId: number) => {
    return new Promise<void>((resolve, reject) => {
      setLoadingPurchasePayments(true);
      try {
        window.electron.ipcRenderer.once('payment-get-by-purchase-reply' as any, (response: any) => {
          setLoadingPurchasePayments(false);
          if (response.success) {
            setPurchasePayments(response.data || []);
            resolve();
          } else {
            reject(response.error);
          }
        });
        window.electron.ipcRenderer.sendMessage('payment-get-by-purchase' as any, [purchaseId]);
      } catch (err) {
        setLoadingPurchasePayments(false);
        console.error('Error loading purchase payments:', err);
        reject(err);
      }
    });
  }, []);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([
        loadPurchases(),
        loadSuppliers(),
        loadPaymentRecords(),
        loadPaymentSummary(),
        loadSupplierLedger(),
        loadSupplierAccounts(),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [loadPurchases, loadSuppliers, loadPaymentRecords, loadPaymentSummary, loadSupplierLedger, loadSupplierAccounts]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedSupplierId, selectedPaymentMethod, periodType, customFromDate, customToDate]);

  // Reload data when filters or pagination change
  useEffect(() => {
    loadPurchases();
    loadPaymentRecords();
    loadPaymentSummary();
    loadSupplierLedger();
  }, [loadPurchases, loadPaymentRecords, loadPaymentSummary, loadSupplierLedger]);

  // Header effect
  useEffect(() => {
    setHeader({
      title: 'Payments & Transactions',
      subtitle: 'Track payments, manage supplier accounts, and view transaction history',
      actions: (
        <div className="flex items-center gap-2">
        <button
            onClick={() => {
              setExportSupplierId(selectedSupplierId);
              setExportFromDate(customFromDate || '');
              setExportToDate(customToDate || '');
              setShowExportDialog(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-100 dark:bg-gray-700 px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 shadow hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <FiDownload className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={loadAllData}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 dark:bg-emerald-500 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors"
          >
            <FiRefreshCw className="w-4 h-4" />
          Refresh
        </button>
        </div>
      ),
    });
    return () => setHeader(null);
  }, [setHeader, loadAllData, selectedSupplierId, periodType, pharmacySettings]);

  // Initial data load
  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const ledgerPurchaseStats = useMemo(() => {
    const purchaseRows = supplierLedger.filter(r => r.kind === 'purchase');
    return {
      all: purchaseRows.length,
      pending: purchaseRows.filter(r => (r.remainingBalance ?? 0) > 0).length,
      paid: purchaseRows.filter(r => (r.remainingBalance ?? 0) <= 0).length,
    };
  }, [supplierLedger]);

  const filteredLedger = useMemo(() => {
    let rows = supplierLedger;
    if (purchaseFilter === 'pending') {
      const remainingByPurchase = new Map<number, number>();
      supplierLedger.forEach(r => {
        if (r.kind === 'purchase') remainingByPurchase.set(r.purchaseId, r.remainingBalance ?? 0);
      });
      const hasOutstanding = (purchaseId: number) => (remainingByPurchase.get(purchaseId) ?? 0) > 0;
      rows = rows.filter(r =>
        r.kind === 'purchase' ? (r.remainingBalance ?? 0) > 0 : hasOutstanding(r.purchaseId)
      );
    } else if (purchaseFilter === 'paid') {
      const remainingByPurchase = new Map<number, number>();
      supplierLedger.forEach(r => {
        if (r.kind === 'purchase') remainingByPurchase.set(r.purchaseId, r.remainingBalance ?? 0);
      });
      rows = rows.filter(r =>
        r.kind === 'purchase'
          ? (r.remainingBalance ?? 0) <= 0
          : (remainingByPurchase.get(r.purchaseId) ?? 0) <= 0
      );
    }

    if (searchTerm) {
      const term = searchTerm.trim().toLowerCase();
      const searchWords = term.split(/\s+/).filter(word => word.length > 0);
      rows = rows.filter(r =>
        searchWords.every(word => {
          const poLabel = `po-${r.purchaseId}`;
          return (
            r.supplierName.toLowerCase().includes(word) ||
            String(r.purchaseId).includes(word) ||
            poLabel.includes(word) ||
            (r.reference && r.reference.toLowerCase().includes(word)) ||
            (r.notes && r.notes.toLowerCase().includes(word)) ||
            (r.paymentMethod && r.paymentMethod.toLowerCase().includes(word))
          );
        })
      );
    }

    return rows;
  }, [supplierLedger, purchaseFilter, searchTerm]);

  // Collapse PO slices of one payment into a single item, placed where its newest slice appears.
  const ledgerItems = useMemo<LedgerItem[]>(() => {
    const batchSizes = new Map<string, number>();
    filteredLedger.forEach(r => {
      if (r.kind === 'payment' && r.batchId) batchSizes.set(r.batchId, (batchSizes.get(r.batchId) || 0) + 1);
    });
    const items: LedgerItem[] = [];
    const batchItems = new Map<string, { type: 'batch'; key: string; rows: SupplierLedgerRow[] }>();
    filteredLedger.forEach(r => {
      if (r.kind === 'payment' && r.batchId && (batchSizes.get(r.batchId) || 0) > 1) {
        const existing = batchItems.get(r.batchId);
        if (existing) {
          existing.rows.push(r);
        } else {
          const item = { type: 'batch' as const, key: r.batchId, rows: [r] };
          batchItems.set(r.batchId, item);
          items.push(item);
        }
      } else {
        items.push({ type: 'row', row: r });
      }
    });
    return ledgerOrder === 'oldest' ? items.reverse() : items;
  }, [filteredLedger, ledgerOrder]);

  const ledgerTotalPages = useMemo(
    () => Math.max(1, Math.ceil(ledgerItems.length / LEDGER_ROWS_PER_PAGE)),
    [ledgerItems.length],
  );

  const pagedLedgerItems = useMemo(() => {
    const start = (ledgerPage - 1) * LEDGER_ROWS_PER_PAGE;
    return ledgerItems.slice(start, start + LEDGER_ROWS_PER_PAGE);
  }, [ledgerItems, ledgerPage]);

  const toggleBatch = useCallback((key: string) => {
    setExpandedBatches(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  useEffect(() => {
    setLedgerPage(1);
  }, [selectedSupplierId, periodType, customFromDate, customToDate, purchaseFilter, searchTerm]);

  useEffect(() => {
    if (ledgerPage > ledgerTotalPages) {
      setLedgerPage(ledgerTotalPages);
    }
  }, [ledgerPage, ledgerTotalPages]);

  const filteredPaymentRecords = useMemo(() => {
    if (!searchTerm) return paymentRecords;
    const term = searchTerm.trim().toLowerCase();
    const searchWords = term.split(/\s+/).filter(word => word.length > 0);
    return paymentRecords.filter(r =>
      searchWords.every(word =>
        r.supplierName.toLowerCase().includes(word) ||
        r.companyName?.toLowerCase().includes(word) ||
        r.referenceNumber?.toLowerCase().includes(word) ||
        r.checkNumber?.toLowerCase().includes(word) ||
        String(r.purchaseId).includes(word)
      )
    );
  }, [paymentRecords, searchTerm]);

  // Show filtered results if search is active, otherwise show paginated results
  const displayRecords = searchTerm ? filteredPaymentRecords : paymentRecords;

  // Group records by date for timeline view
  const recordsByDate = useMemo(() => {
    const grouped: Record<string, { records: PaymentRecord[]; totalAmount: number; date: Date }> = {};
    displayRecords.forEach(record => {
      const recordDate = new Date(record.paymentDate);
      const dateKey = recordDate.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
      if (!grouped[dateKey]) {
        grouped[dateKey] = { records: [], totalAmount: 0, date: recordDate };
      }
      grouped[dateKey].records.push(record);
      grouped[dateKey].totalAmount += record.amount;
    });
    // Sort dates in descending order using the actual date object
    return Object.entries(grouped).sort((a, b) => {
      return b[1].date.getTime() - a[1].date.getTime();
    });
  }, [displayRecords]);

  const paymentGroups = useMemo<PaymentGroup[]>(() => {
    const groups: PaymentGroup[] = [];
    const byKey = new Map<string, PaymentGroup>();
    displayRecords.forEach((record) => {
      const key = record.batchId || `single-${record.id}`;
      let group = byKey.get(key);
      if (!group) {
        group = {
          key,
          at: record.paymentDate,
          supplierName: record.supplierName,
          companyName: record.companyName,
          paymentMethod: record.paymentMethod,
          referenceNumber: record.referenceNumber,
          checkNumber: record.checkNumber,
          bankName: record.bankName,
          total: 0,
          pieces: [],
        };
        byKey.set(key, group);
        groups.push(group);
      }
      group.total += Number(record.amount) || 0;
      group.pieces.push(record);
    });
    // Records arrive newest first; the money was applied oldest purchase first.
    groups.forEach((g) => g.pieces.reverse());
    return groups;
  }, [displayRecords]);

  const groupPages = Math.max(1, Math.ceil(paymentGroups.length / recordsPerPage));
  const pagedPaymentGroups = useMemo(() => {
    const page = Math.min(currentPage, groupPages);
    return paymentGroups.slice((page - 1) * recordsPerPage, page * recordsPerPage);
  }, [paymentGroups, currentPage, groupPages, recordsPerPage]);

  const paymentGroupsByDate = useMemo(() => {
    const days: { key: string; date: Date; total: number; groups: PaymentGroup[] }[] = [];
    paymentGroups.forEach((g) => {
      const date = new Date(g.at);
      const key = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      let day = days.find((d) => d.key === key);
      if (!day) {
        day = { key, date, total: 0, groups: [] };
        days.push(day);
      }
      day.total += g.total;
      day.groups.push(g);
    });
    return days;
  }, [paymentGroups]);

  const filteredSupplierAccounts = useMemo(() => {
    if (!searchTerm) return supplierAccounts;
    const term = searchTerm.trim().toLowerCase();
    const searchWords = term.split(/\s+/).filter(word => word.length > 0);
    return supplierAccounts.filter(a =>
      searchWords.every(word =>
        a.supplierName.toLowerCase().includes(word) ||
        a.companyName?.toLowerCase().includes(word)
      )
    );
  }, [supplierAccounts, searchTerm]);

  /** One option per supplier: sum of remaining on all open POs (dropdown shows total due). */
  const payableSuppliersForModal = useMemo(() => {
    type Acc = SupplierPayTarget & { latestTs: number };
    const map = new Map<number, Acc>();
    for (const p of purchases) {
      if (!p.id || p.remainingBalance <= 0) continue;
      const ts = new Date(p.createdAt || 0).getTime();
      const cur = map.get(p.supplierId);
      if (!cur) {
        map.set(p.supplierId, {
          supplierId: p.supplierId,
          supplierName: p.supplierName,
          totalDue: p.remainingBalance,
          openPoCount: 1,
          latestPurchaseId: p.id,
          latestTs: ts,
        });
      } else {
        cur.totalDue += p.remainingBalance;
        cur.openPoCount += 1;
        if (ts >= cur.latestTs) {
          cur.latestTs = ts;
          cur.latestPurchaseId = p.id;
        }
      }
    }
    return [...map.values()]
      .sort((a, b) => b.latestTs - a.latestTs)
      .map(({ latestTs: _t, ...row }) => row);
  }, [purchases]);

  const purchaseFromLedgerRow = useCallback((row: SupplierLedgerRow): Purchase => ({
    id: row.purchaseId,
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    grandTotal: row.grandTotal ?? 0,
    paymentAmount: row.paymentAmount ?? 0,
    remainingBalance: row.remainingBalance ?? 0,
    createdAt: row.eventAt,
  }), []);

  // Handlers
  const handleViewPaymentHistory = (purchase: Purchase) => {
    setViewPaymentHistory(purchase);
    loadPurchasePayments(purchase.id);
  };

  const handleViewLedgerPaymentDetail = (row: SupplierLedgerRow) => {
    if (row.kind !== 'payment' || row.paymentId == null) return;
    setViewLedgerPayment(row);
  };

  const resetPaymentForm = () => {
    setPaymentModalSupplier(null);
    setPaymentAmount('');
    setPaymentMethod('cash');
    setReferenceNumber('');
    setCheckNumber('');
    setBankName('');
    setAccountNumber('');
    setSenderNumber('');
    setPaymentNotes('');
    setPaymentDate(toLocalIsoDate(new Date()));
  };

  const handleSubmitPayment = async () => {
    if (!paymentModalSupplier) return;
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid payment amount');
      return;
    }
    if (amount > paymentModalSupplier.totalDue + 0.0001) {
      alert(`Payment amount cannot exceed total open balance of ${formatCurrency(paymentModalSupplier.totalDue)}`);
      return;
    }

    setProcessing(true);
    try {
      const supplier = suppliers.find(s => s.id === paymentModalSupplier.supplierId);

      const t = (s: string) => s.trim();
      const detailLines: string[] = [];
      if (t(bankName)) detailLines.push(`Bank / wallet name: ${t(bankName)}`);
      if (t(accountNumber)) detailLines.push(`Account / IBAN / number: ${t(accountNumber)}`);
      if (t(referenceNumber)) detailLines.push(`Transaction ref: ${t(referenceNumber)}`);
      if (t(checkNumber)) detailLines.push(`Cheque number: ${t(checkNumber)}`);
      if (t(senderNumber)) detailLines.push(`Sender / TXID: ${t(senderNumber)}`);
      if (t(paymentNotes)) detailLines.push(t(paymentNotes));
      const fullNotes = detailLines.length > 0 ? detailLines.join('\n') : undefined;

      const primaryReference =
        t(referenceNumber) || t(checkNumber) || t(senderNumber) || undefined;

      const paymentData = {
        allocateAcrossOpenPos: true,
        supplierId: paymentModalSupplier.supplierId,
        supplierName: paymentModalSupplier.supplierName,
        companyName: supplier?.companyName || '',
        amount,
        paymentMethod,
        referenceNumber: primaryReference,
        checkNumber: checkNumber || undefined,
        bankName: bankName || undefined,
        accountNumber: accountNumber || undefined,
        notes: fullNotes,
        paymentDate,
      };

      window.electron.ipcRenderer.once('payment-create-reply' as any, async (response: any) => {
        setProcessing(false);
        if (response.success) {
          resetPaymentForm();
          setShowAddPaymentModal(false);
          await loadAllData();
        } else {
          alert('Error recording payment: ' + (response.error || 'Unknown error'));
        }
      });
      window.electron.ipcRenderer.sendMessage('payment-create' as any, [paymentData]);
    } catch (err) {
      setProcessing(false);
      alert('Error recording payment. Please try again.');
    }
  };

  const handleDeletePaymentRecord = async (paymentId: number) => {
    if (!window.confirm('Are you sure you want to delete this payment record? This will reverse the payment.')) {
      return;
    }
    
    setProcessing(true);
    try {
      window.electron.ipcRenderer.once('payment-delete-reply' as any, (response: any) => {
        setProcessing(false);
        if (response.success) {
          loadAllData();
          if (viewPaymentHistory) {
            loadPurchasePayments(viewPaymentHistory.id);
          }
          alert('Payment record deleted successfully!');
        } else {
          alert('Error deleting payment: ' + (response.error || 'Unknown error'));
        }
      });
      window.electron.ipcRenderer.sendMessage('payment-delete' as any, [paymentId]);
    } catch (err) {
      setProcessing(false);
      alert('Error deleting payment. Please try again.');
    }
  };

  const handleDownloadFromPreview = async () => {
    if (!pdfHtmlContent) return;
    try {
      const filters: any = {};
      if (exportSupplierId) filters.supplierId = exportSupplierId;
      if (exportFromDate && exportToDate) {
        filters.fromDate = exportFromDate;
        filters.toDate = exportToDate;
        filters.periodType = 'custom';
      }
      
      window.electron.ipcRenderer.once('payment-export-pdf-reply', (response: any) => {
        if (response.success) {
          setPdfHtmlContent(null);
          alert('Payment records downloaded successfully!');
        } else if (response.error !== 'canceled') {
          alert('Error downloading: ' + (response.error || 'Unknown error'));
        }
      });
      window.electron.ipcRenderer.sendMessage('payment-export-pdf', [filters, pharmacySettings, false]);
    } catch (err) {
      console.error(err);
      alert('Failed to download PDF');
    }
  };

  const clearFilters = () => {
    setSelectedSupplierId(null);
    setSelectedPaymentMethod(null);
    setPeriodType('today'); // Reset to today
    setCustomFromDate('');
    setCustomToDate('');
    setSearchTerm('');
    setPurchaseFilter('all');
    setShowDatePicker(false);
  };

  const hasActiveFilters = selectedSupplierId || selectedPaymentMethod || periodType !== 'all' || searchTerm;

  const PAID_EPSILON = 0.005;

  /** Purchase rows: where this purchase stands now (same wording as Purchase Records). */
  const renderPurchaseStatus = (row: SupplierLedgerRow) => {
    const total = row.grandTotal ?? row.debit;
    const due = Math.max(0, row.remainingBalance ?? 0);
    if (due <= PAID_EPSILON) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-50 dark:bg-green-900/25 px-2 py-0.5 text-xs font-semibold text-green-700 dark:text-green-300">
          <FiCheckCircle className="w-3 h-3" /> Fully paid
        </span>
      );
    }
    if (due >= total - PAID_EPSILON) {
      return (
        <span className="inline-flex items-center rounded-full bg-red-50 dark:bg-red-900/25 px-2 py-0.5 text-xs font-semibold text-red-700 dark:text-red-300">
          Unpaid
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 dark:bg-amber-900/25 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
        {formatCurrency(due)} still due
      </span>
    );
  };

  /** Payment slice: what this money did to its purchase. */
  const renderSliceOutcome = (row: SupplierLedgerRow) => {
    const left = Math.max(0, row.poRemainingAfter ?? 0);
    return left <= PAID_EPSILON ? (
      <span className="inline-flex items-center gap-0.5 text-green-700 dark:text-green-400 font-semibold">
        <FiCheckCircle className="w-3 h-3" /> now fully paid
      </span>
    ) : (
      <span className="text-amber-700 dark:text-amber-400 font-semibold">{formatCurrency(left)} left</span>
    );
  };

  const renderMethodChip = (row: SupplierLedgerRow) => {
    const mc = row.paymentMethod ? getPaymentMethodColor(row.paymentMethod) : null;
    if (!mc) return null;
    return (
      <span className={`inline-flex w-fit max-w-full truncate rounded border px-1.5 py-0.5 text-[9px] font-bold ${mc.bg} ${mc.text} ${mc.border}`}>
        {getPaymentMethodLabel(row.paymentMethod || '')}
      </span>
    );
  };

  const renderWhen = (eventAt: string, indent = false) => {
    const d = new Date(eventAt);
    const valid = !Number.isNaN(d.getTime());
    return (
      <div className={`min-w-0 leading-tight ${indent ? 'pl-5' : ''}`}>
        <p className="text-[13px] font-medium text-gray-800 dark:text-gray-100 whitespace-nowrap">
          {valid ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
          {valid ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''}
        </p>
      </div>
    );
  };

  const renderEventIcon = (kind: 'purchase' | 'payment', small = false) => (
    <span
      className={`flex-shrink-0 rounded-full flex items-center justify-center ${small ? 'w-7 h-7' : 'w-9 h-9'} ${
        kind === 'purchase'
          ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400'
          : 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400'
      }`}
    >
      {kind === 'purchase' ? (
        <FiShoppingCart className={small ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
      ) : (
        <FiCreditCard className={small ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
      )}
    </span>
  );

  /** Signed amount: + adds to what you owe, − is money paid. */
  const renderAmount = (kind: 'purchase' | 'payment', amount: number, label?: string) => (
    <div className="min-w-0 text-right leading-tight">
      <p
        className={`text-[15px] font-bold tabular-nums whitespace-nowrap ${
          kind === 'purchase' ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
        }`}
      >
        {kind === 'purchase' ? '+ ' : '− '}
        {formatCurrency(amount)}
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {label ?? (kind === 'purchase' ? 'added to bill' : 'paid')}
      </p>
    </div>
  );

  const renderOwedAfter = (after: number, before?: number) => (
    <div className="min-w-0 text-right leading-tight">
      {after <= PAID_EPSILON ? (
        <p className="text-[15px] font-bold text-green-700 dark:text-green-400">Nothing owed</p>
      ) : (
        <p className="text-[15px] font-bold tabular-nums text-gray-900 dark:text-white whitespace-nowrap">
          {formatCurrency(after)}
        </p>
      )}
      {typeof before === 'number' && (
        <p className="text-xs text-gray-500 dark:text-gray-400 tabular-nums whitespace-nowrap">
          was {formatCurrency(before)}
        </p>
      )}
    </div>
  );

  const iconButton =
    'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:text-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors';

  const renderLedgerRow = (row: SupplierLedgerRow, child = false) => {
    const key = row.kind === 'payment' && row.paymentId != null
      ? `pay-${row.paymentId}`
      : `pur-${row.purchaseId}-${row.eventAt}`;
    const isPurchase = row.kind === 'purchase';
    const purchase = isPurchase ? purchaseFromLedgerRow(row) : null;

    return (
      <div
        key={key}
        className={`${ledgerGridRowClass} ${
          child
            ? 'bg-gray-100/90 dark:bg-gray-900/50 hover:!bg-gray-100 dark:hover:!bg-gray-900/60 border-l-4 border-l-gray-300 dark:border-l-gray-600 text-gray-600'
            : ''
        }`}
        style={supplierLedgerGridStyle}
      >
        {renderWhen(row.eventAt, child)}

        <div className={`min-w-0 flex items-start gap-3 ${child ? 'pl-5' : ''}`}>
          {renderEventIcon(row.kind, child)}
          <div className="min-w-0 space-y-1">
            {isPurchase ? (
              <>
                <p className="text-sm text-gray-800 dark:text-gray-100">
                  New purchase <span className="font-semibold">PO-{row.purchaseId}</span> from{' '}
                  <span className="font-semibold">{row.supplierName}</span>
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {renderPurchaseStatus(row)}
                  {(row.notes || '').trim() ? (
                    <span className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1" title={row.notes}>
                      {row.notes}
                    </span>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-800 dark:text-gray-100">
                  {child ? 'Part paid to ' : (
                    <>
                      Paid <span className="font-semibold">{row.supplierName}</span> for{' '}
                    </>
                  )}
                  <span className="font-semibold">PO-{row.purchaseId}</span>
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center rounded-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-2 py-0.5">
                    <span className="mr-1">PO-{row.purchaseId}:</span>
                    {renderSliceOutcome(row)}
                  </span>
                  {!child && renderMethodChip(row)}
                  {!child && row.reference ? (
                    <span className="text-gray-500 dark:text-gray-400 truncate" title={row.reference}>
                      Ref {row.reference}
                    </span>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>

        {renderAmount(row.kind, isPurchase ? row.debit : row.credit, child ? 'part of payment' : undefined)}
        {renderOwedAfter(row.balanceAfter, row.balanceBefore)}

        <div className="flex items-center justify-end gap-1.5">
          {isPurchase && purchase && (
            <button
              type="button"
              onClick={() => handleViewPaymentHistory(purchase)}
              className={iconButton}
              title="View purchase payment history"
            >
              <FiEye className="w-4 h-4" />
            </button>
          )}
          {!isPurchase && row.paymentId != null && (
            <>
              <button
                type="button"
                onClick={() => handleViewLedgerPaymentDetail(row)}
                className={iconButton}
                title="View payment details"
              >
                <FiEye className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleDeletePaymentRecord(row.paymentId!)}
                disabled={processing}
                className={`${iconButton} hover:!text-red-600 hover:!bg-red-50 dark:hover:!bg-red-950/25 disabled:opacity-40`}
                title="Delete payment"
              >
                <FiTrash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  /** One supplier payment split across several POs: one row with the total and where it went. */
  const renderLedgerBatch = (item: { key: string; rows: SupplierLedgerRow[] }) => {
    const { rows } = item;
    const newest = rows[0];
    const oldest = rows[rows.length - 1];
    const total = rows.reduce((sum, r) => sum + (Number(r.credit) || 0), 0);
    const expanded = expandedBatches.has(item.key);
    // rows are newest first; money was applied to the oldest purchase first.
    const slicesInPayOrder = [...rows].reverse();

    return (
      <React.Fragment key={`batch-${item.key}`}>
        <div
          className={`${ledgerGridRowClass} ${
            expanded
              ? 'bg-gray-100/90 dark:bg-gray-900/50 hover:!bg-gray-100 dark:hover:!bg-gray-900/60 border-l-4 border-l-gray-400 dark:border-l-gray-500 !border-b-gray-200 dark:!border-b-gray-700'
              : ''
          }`}
          style={supplierLedgerGridStyle}
        >
          {renderWhen(newest.eventAt)}

          <div className="min-w-0 flex items-start gap-3">
            {renderEventIcon('payment')}
            <div className="min-w-0 space-y-1.5">
              <p className="text-sm text-gray-800 dark:text-gray-100">
                Paid <span className="font-semibold">{newest.supplierName}</span>{' '}
                <span className="font-semibold">{formatCurrency(total)}</span> — covered {rows.length} purchases
              </p>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {slicesInPayOrder.map((slice) => (
                  <span
                    key={`slice-${slice.paymentId ?? slice.purchaseId}`}
                    className="inline-flex items-center gap-1 rounded-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-2 py-0.5 text-gray-700 dark:text-gray-200"
                  >
                    <span className="font-semibold">PO-{slice.purchaseId}</span>
                    <span className="tabular-nums">{formatCurrency(Number(slice.credit) || 0)}</span>
                    <span className="text-gray-400">→</span>
                    {renderSliceOutcome(slice)}
                  </span>
                ))}
                {renderMethodChip(newest)}
              </div>
            </div>
          </div>

          {renderAmount('payment', total, `paid · ${rows.length} purchases`)}
          {renderOwedAfter(newest.balanceAfter, oldest.balanceBefore)}

          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => toggleBatch(item.key)}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-600 px-2.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/60"
              title={expanded ? 'Hide the separate parts' : 'Show each part (view or delete)'}
            >
              {expanded ? <FiChevronUp className="w-3.5 h-3.5" /> : <FiChevronDown className="w-3.5 h-3.5" />}
              Parts
            </button>
          </div>
        </div>
        {expanded && (ledgerOrder === 'oldest' ? slicesInPayOrder : rows).map(r => renderLedgerRow(r, true))}
      </React.Fragment>
    );
  };

  const recordsGridStyle: React.CSSProperties = {
    gridTemplateColumns: 'minmax(110px, 0.7fr) minmax(170px, 1.2fr) minmax(300px, 2.6fr) minmax(150px, 1fr) 48px',
  };

  /** Where one piece of a payment went, and what it left on that purchase. */
  const renderPaymentPiece = (piece: PaymentRecord, canDelete: boolean) => {
    const left = Math.max(0, piece.remainingAfter ?? 0);
    return (
      <div
        key={piece.id}
        className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-gray-700 dark:text-gray-200"
      >
        <span className="inline-flex min-w-[52px] font-semibold text-gray-900 dark:text-white">PO-{piece.purchaseId}</span>
        <span className="tabular-nums text-green-700 dark:text-green-400 font-medium">{formatCurrency(Number(piece.amount) || 0)}</span>
        <span className="text-gray-300 dark:text-gray-600">→</span>
        {left <= PAID_EPSILON ? (
          <span className="inline-flex items-center gap-1 font-semibold text-green-700 dark:text-green-400">
            <FiCheckCircle className="w-3.5 h-3.5" /> now fully paid
          </span>
        ) : (
          <span className="font-semibold text-amber-700 dark:text-amber-400">{formatCurrency(left)} still due</span>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={() => handleDeletePaymentRecord(piece.id)}
            className="ml-1 p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
            title="Delete this part (today only)"
          >
            <FiTrash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  };

  const renderPaymentGroupRow = (group: PaymentGroup) => {
    const d = new Date(group.at);
    const methodColor = getPaymentMethodColor(group.paymentMethod);
    const split = group.pieces.length > 1;
    const deletable = isToday(group.at);
    return (
      <div
        key={group.key}
        className="grid items-center gap-4 px-4 py-3.5 border-b border-gray-100 dark:border-gray-700/70 hover:bg-gray-50/80 dark:hover:bg-gray-700/20 transition-colors"
        style={recordsGridStyle}
      >
        <div className="leading-tight">
          <p className="text-[13px] font-medium text-gray-800 dark:text-gray-100 whitespace-nowrap">
            {d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
            {d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{group.supplierName}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${methodColor.bg} ${methodColor.text}`}>
              {getPaymentMethodLabel(group.paymentMethod)}
            </span>
            {(group.checkNumber || group.referenceNumber) && (
              <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {group.checkNumber ? `Cheque ${group.checkNumber}` : `Ref ${group.referenceNumber}`}
              </span>
            )}
          </div>
        </div>

        <div className="min-w-0 space-y-1">
          {split && (
            <p className="text-xs text-gray-600 dark:text-gray-300">
              You paid <span className="font-bold text-gray-900 dark:text-white">{formatCurrency(group.total)}</span> at once
              {' — '}split automatically, oldest purchase first:
            </p>
          )}
          {group.pieces.map((piece) => renderPaymentPiece(piece, split && deletable))}
        </div>

        <div className="text-right leading-tight">
          <p className="text-[15px] font-bold tabular-nums text-green-600 dark:text-green-400 whitespace-nowrap">
            {formatCurrency(group.total)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {split ? `paid · ${group.pieces.length} purchases` : 'paid'}
          </p>
        </div>

        <div className="flex justify-end">
          {!split && deletable && (
            <button
              type="button"
              onClick={() => handleDeletePaymentRecord(group.pieces[0].id)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
              title="Delete payment (today only)"
            >
              <FiTrash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-auto md:h-[calc(100vh-80px)] w-full bg-gradient-to-br from-gray-50 via-gray-50 to-gray-100/50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800/80 overflow-visible md:overflow-hidden px-4 pb-4 md:pb-0">
      {/* Tab navigation */}
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
        <div className="flex">
        <button
            className={`px-5 py-3 text-sm font-semibold transition-all ${
              activeTab === 'payments'
                ? 'border-b-2 border-emerald-600 text-emerald-600 dark:text-emerald-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          onClick={() => setActiveTab('payments')}
        >
            <FiCreditCard className="w-4 h-4 inline mr-2" />
            Make Payments
        </button>
        <button
            className={`px-5 py-3 text-sm font-semibold transition-all ${
              activeTab === 'records'
                ? 'border-b-2 border-emerald-600 text-emerald-600 dark:text-emerald-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
            onClick={() => setActiveTab('records')}
          >
            <FiFileText className="w-4 h-4 inline mr-2" />
            Payment Records
          </button>
          <button
            className={`px-5 py-3 text-sm font-semibold transition-all ${
              activeTab === 'accounts'
                ? 'border-b-2 border-emerald-600 text-emerald-600 dark:text-emerald-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          onClick={() => setActiveTab('accounts')}
        >
            <FiUsers className="w-4 h-4 inline mr-2" />
            Supplier Accounts
        </button>
        </div>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mr-4"
          >
            <FiX className="w-3 h-3" />
            Clear Filters
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Summary: three plain numbers */}
      <div className="flex-shrink-0 grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
        <KpiCard
          tone="blue"
          icon={<FiShoppingCart className="w-4 h-4" />}
          label="Total bought"
          value={loading ? '…' : formatCurrency(paymentSummary?.totalPurchases || 0)}
          hint="All purchases in this period"
        />
        <KpiCard
          tone="emerald"
          icon={<FiCheckCircle className="w-4 h-4" />}
          label="Total paid"
          value={loading ? '…' : formatCurrency(paymentSummary?.totalPaid || 0)}
          hint={loading ? undefined : `Cash ${formatCurrency(paymentSummary?.cashPayments || 0)}`}
        />
        <KpiCard
          tone={(paymentSummary?.totalRemaining || 0) > 0 ? 'rose' : 'emerald'}
          icon={<FiAlertCircle className="w-4 h-4" />}
          label="You still owe"
          value={loading ? '…' : formatCurrency(paymentSummary?.totalRemaining || 0)}
          hint={(paymentSummary?.totalRemaining || 0) > 0 ? 'Unpaid to suppliers' : 'Everything is paid'}
        />
      </div>

      {/* One toolbar: search, supplier, period, (status), add payment */}
      <div className="flex-shrink-0 mt-3 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 shadow-sm">
        <div className="relative flex-1 min-w-[220px]">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search supplier, PO number or reference…"
            value={immediateSearchTerm}
            onChange={handleSearchChange}
            className="w-full h-9 pl-9 pr-3 text-sm bg-white dark:bg-gray-900/40 border border-gray-200 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 placeholder:text-gray-400"
          />
        </div>

        <select
          value={selectedSupplierId || ''}
          onChange={(e) => setSelectedSupplierId(e.target.value ? parseInt(e.target.value) : null)}
          className="h-9 px-3 text-sm bg-white dark:bg-gray-900/40 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-emerald-500/30 cursor-pointer"
          title="Supplier"
        >
          <option value="">All suppliers</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} {s.companyName ? `(${s.companyName})` : ''}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2 h-9 px-3 bg-white dark:bg-gray-900/40 border border-gray-200 dark:border-gray-600 rounded-lg">
          <FiCalendar className="w-4 h-4 text-gray-400" />
          <select
            value={periodType}
            onChange={(e) => {
              const next = e.target.value as PeriodType;
              setPeriodType(next);
              if (next === 'custom') {
                setShowDatePicker(true);
                if (!customFromDate || !customToDate) {
                  setCustomFromDate(today);
                  setCustomToDate(today);
                }
              } else {
                setShowDatePicker(false);
                setCustomFromDate('');
                setCustomToDate('');
              }
            }}
            className="bg-transparent text-sm text-gray-700 dark:text-gray-200 outline-none cursor-pointer"
            title="Period"
          >
            <option value="all">All time</option>
            <option value="today">Today</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
            <option value="year">This year</option>
            <option value="custom">Pick dates…</option>
          </select>
        </div>

        {periodType === 'custom' && (
          <div className="flex items-center gap-2 h-9 px-3 bg-white dark:bg-gray-900/40 border border-gray-200 dark:border-gray-600 rounded-lg">
            <input
              type="date"
              aria-label="From date"
              value={customFromDate}
              max={today}
              onChange={(e) => setCustomFromDate(e.target.value)}
              className="bg-transparent text-sm text-gray-700 dark:text-gray-200 outline-none"
            />
            <span className="text-gray-300">→</span>
            <input
              type="date"
              aria-label="To date"
              value={customToDate}
              max={today}
              onChange={(e) => setCustomToDate(e.target.value)}
              className="bg-transparent text-sm text-gray-700 dark:text-gray-200 outline-none"
            />
          </div>
        )}

        {activeTab === 'records' && (
          <select
            value={selectedPaymentMethod || ''}
            onChange={(e) => setSelectedPaymentMethod(e.target.value as PaymentMethod || null)}
            className="h-9 px-3 text-sm bg-white dark:bg-gray-900/40 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 outline-none cursor-pointer"
            title="Payment method"
          >
            <option value="">All methods</option>
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="check">Cheque</option>
            <option value="online">Online</option>
          </select>
        )}

        {activeTab === 'payments' && (
          <>
            <div className="inline-flex h-9 items-center rounded-lg bg-gray-100 dark:bg-gray-900/60 p-1">
              {([
                ['all', `All (${ledgerPurchaseStats.all})`],
                ['pending', `Still owed (${ledgerPurchaseStats.pending})`],
                ['paid', `Paid off (${ledgerPurchaseStats.paid})`],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPurchaseFilter(id)}
                  className={`h-7 px-3 rounded-md text-xs font-semibold transition-all ${
                    purchaseFilter === id
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                resetPaymentForm();
                setShowAddPaymentModal(true);
              }}
              className="ml-auto inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
            >
              <FiPlus className="h-4 w-4" />
              Pay supplier
            </button>
          </>
        )}
      </div>

      {/* Make Payments Tab */}
      {activeTab === 'payments' && (
        // Fills the remaining height; only the ledger rows scroll (no second, outer scrollbar).
        <div className="flex-1 min-h-0 flex flex-col gap-3 pb-4">

          {/* Supplier ledger — grid lines (Selling / Purchasing style) */}
          <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
            <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              <div>
                <h2 className="text-sm font-bold text-gray-900 dark:text-white">Supplier account history</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Purchases <span className="font-semibold text-red-600 dark:text-red-400">add</span> to what you owe, payments{' '}
                  <span className="font-semibold text-green-600 dark:text-green-400">reduce</span> it. A payment always clears the oldest unpaid purchase first.
                </p>
              </div>
              <select
                value={ledgerOrder}
                onChange={(e) => setLedgerOrder(e.target.value as 'newest' | 'oldest')}
                className="h-8 px-2.5 text-xs font-medium bg-white dark:bg-gray-900/40 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 outline-none cursor-pointer"
                title="Order"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-14">
                <div className="flex flex-col items-center gap-3 text-gray-500 dark:text-gray-400">
                  <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm font-medium">Loading ledger...</span>
                </div>
              </div>
            ) : filteredLedger.length === 0 ? (
              <div className="p-12 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 mb-4">
                  <FiCreditCard className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                </div>
                <p className="text-base font-semibold text-gray-700 dark:text-gray-300">No ledger rows match</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-md mx-auto">
                  {purchaseFilter === 'pending' ? 'No outstanding purchases in this view.' : purchaseFilter === 'paid' ? 'No fully settled activity in this view.' : 'Try another date range or supplier.'}
                </p>
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col overflow-x-hidden">
                <div className="flex-1 min-h-0 flex flex-col w-full">
                  <div className={`${ledgerGridHeaderClass} flex-shrink-0`} style={supplierLedgerGridStyle}>
                    <div>When</div>
                    <div>What happened</div>
                    <div className="text-right">Amount</div>
                    <div className="text-right">You owe after</div>
                    <div />
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto">
                  {pagedLedgerItems.map((item) =>
                    item.type === 'row' ? renderLedgerRow(item.row) : renderLedgerBatch(item),
                  )}
                  </div>
                  {filteredLedger.length > 0 && (
                    <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-600 px-3 py-2 flex items-center justify-between gap-2 text-xs text-gray-600 dark:text-gray-300">
                      <span>
                        Showing {((ledgerPage - 1) * LEDGER_ROWS_PER_PAGE) + 1} to{' '}
                        {Math.min(ledgerPage * LEDGER_ROWS_PER_PAGE, ledgerItems.length)} of {ledgerItems.length}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setLedgerPage(1)}
                          disabled={ledgerPage <= 1}
                          className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40"
                        >
                          {'<<'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setLedgerPage(p => Math.max(1, p - 1))}
                          disabled={ledgerPage <= 1}
                          className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40"
                        >
                          {'<'}
                        </button>
                        <span className="px-2 font-semibold">
                          {ledgerPage} / {ledgerTotalPages}
                        </span>
                        <button
                          type="button"
                          onClick={() => setLedgerPage(p => Math.min(ledgerTotalPages, p + 1))}
                          disabled={ledgerPage >= ledgerTotalPages}
                          className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40"
                        >
                          {'>'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setLedgerPage(ledgerTotalPages)}
                          disabled={ledgerPage >= ledgerTotalPages}
                          className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40"
                        >
                          {'>>'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {showAddPaymentModal && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
              role="presentation"
              onClick={() => {
                resetPaymentForm();
                setShowAddPaymentModal(false);
              }}
            >
              <div
                className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-gray-800"
                role="dialog"
                aria-modal="true"
                aria-labelledby="add-payment-modal-title"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                  <div className="min-w-0">
                    <h3 id="add-payment-modal-title" className="text-lg font-bold text-gray-900 dark:text-white">
                      Add Payment
                    </h3>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Pick a supplier (total open balance). Amount applies to oldest unpaid POs first. The ledger refreshes after you save.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      resetPaymentForm();
                      setShowAddPaymentModal(false);
                    }}
                    className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                    aria-label="Close"
                  >
                    <FiX className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-4 p-5">
                  <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                        Supplier (total due)
                      </label>
                      <select
                        value={paymentModalSupplier?.supplierId ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!v) {
                            setPaymentModalSupplier(null);
                            setPaymentAmount('');
                            return;
                          }
                          const id = Number(v);
                          const opt = payableSuppliersForModal.find(s => s.supplierId === id);
                          if (opt) {
                            setPaymentModalSupplier(opt);
                            setPaymentAmount('');
                          }
                        }}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      >
                        <option value="">— Select supplier —</option>
                        {payableSuppliersForModal.map(s => (
                          <option key={s.supplierId} value={s.supplierId}>
                            {s.supplierName} · Total due {formatCurrency(s.totalDue)}
                            {s.openPoCount > 1 ? ` · ${s.openPoCount} open POs` : ''}
                            {` · Latest PO-${s.latestPurchaseId}`}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                        Payment date
                      </label>
                      <input
                        type="date"
                        value={paymentDate}
                        max={today}
                        onChange={(e) => setPaymentDate(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      />
                    </div>
                  </div>

                  {paymentModalSupplier && (
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        {
                          label: 'Total due',
                          value: paymentModalSupplier.totalDue,
                          color: 'text-orange-600 dark:text-orange-400',
                          bg: 'bg-orange-50/60 dark:bg-orange-950/20',
                          border: 'border-orange-200 dark:border-orange-800',
                        },
                        {
                          label: 'Open POs',
                          value: paymentModalSupplier.openPoCount,
                          color: 'text-gray-800 dark:text-white',
                          bg: 'bg-gray-50 dark:bg-gray-700/50',
                          border: 'border-gray-200 dark:border-gray-600',
                          format: 'int' as const,
                        },
                        {
                          label: 'Latest PO',
                          value: paymentModalSupplier.latestPurchaseId,
                          color: 'text-gray-800 dark:text-white',
                          bg: 'bg-gray-50 dark:bg-gray-700/50',
                          border: 'border-gray-200 dark:border-gray-600',
                          format: 'po' as const,
                        },
                      ].map(s => (
                        <div
                          key={s.label}
                          className={`rounded-lg border px-3 py-2 ${s.bg} ${s.border}`}
                        >
                          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{s.label}</p>
                          <p className={`text-sm font-extrabold tabular-nums ${s.color}`}>
                            {s.format === 'int'
                              ? String(s.value)
                              : s.format === 'po'
                                ? `PO-${s.value}`
                                : formatCurrency(s.value as number)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                        Amount
                      </label>
                      <input
                        type="number"
                        min="0"
                        max={paymentModalSupplier?.totalDue}
                        step="0.01"
                        value={paymentAmount}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (paymentModalSupplier && parseFloat(val) > paymentModalSupplier.totalDue + 0.0001) {
                            setPaymentAmount(paymentModalSupplier.totalDue.toString());
                          } else {
                            setPaymentAmount(val);
                          }
                        }}
                        placeholder="0.00"
                        disabled={!paymentModalSupplier}
                        className={`w-full rounded-lg border bg-white px-3 py-2.5 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 disabled:opacity-40 dark:bg-gray-700 dark:text-gray-100 ${
                          paymentModalSupplier && parseFloat(paymentAmount) > paymentModalSupplier.totalDue + 0.0001
                            ? 'border-red-400 focus:ring-red-400'
                            : 'border-gray-300 focus:ring-emerald-500 dark:border-gray-600'
                        }`}
                      />
                      {paymentModalSupplier && parseFloat(paymentAmount) > paymentModalSupplier.totalDue + 0.0001 && (
                        <p className="mt-1 text-[10px] font-medium text-red-500">
                          Cannot exceed {formatCurrency(paymentModalSupplier.totalDue)}
                        </p>
                      )}
                      {paymentModalSupplier &&
                        !(parseFloat(paymentAmount) > paymentModalSupplier.totalDue + 0.0001) && (
                        <button
                          type="button"
                          onClick={() => setPaymentAmount(paymentModalSupplier.totalDue.toString())}
                          className="mt-1 text-[10px] font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                        >
                          Pay full open balance — {formatCurrency(paymentModalSupplier.totalDue)}
                        </button>
                      )}
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                        Payment method
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {(['cash', 'bank_transfer', 'check', 'online'] as PaymentMethod[]).map(m => {
                          const c = getPaymentMethodColor(m);
                          const active = paymentMethod === m;
                          return (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setPaymentMethod(m)}
                              className={`rounded-lg border px-2 py-2 text-xs font-semibold transition-all ${active ? `${c.bg} ${c.text} ${c.border} shadow-sm` : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300 dark:border-gray-600 dark:bg-gray-700/40 dark:text-gray-400 dark:hover:border-gray-500'}`}
                            >
                              {getPaymentMethodLabel(m)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {(paymentMethod === 'bank_transfer' || paymentMethod === 'online') && (
                    <div className="grid grid-cols-1 gap-3 rounded-lg border border-blue-100 bg-blue-50/60 p-3 dark:border-blue-900/40 dark:bg-blue-950/20 md:grid-cols-3">
                      <div className="flex flex-col justify-end">
                        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">
                          {paymentMethod === 'online' ? 'Account / wallet name' : 'Bank account name'}
                        </label>
                        <input
                          type="text"
                          value={bankName}
                          onChange={(e) => setBankName(e.target.value)}
                          placeholder={paymentMethod === 'online' ? 'e.g. JazzCash' : 'e.g. HBL Current'}
                          className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm dark:border-blue-800 dark:bg-gray-700 dark:text-gray-100"
                        />
                      </div>
                      <div className="flex flex-col justify-end">
                        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">
                          {paymentMethod === 'online' ? 'Account / wallet number' : 'Account / IBAN'}
                        </label>
                        <input
                          type="text"
                          value={accountNumber}
                          onChange={(e) => setAccountNumber(e.target.value)}
                          placeholder={paymentMethod === 'online' ? 'e.g. 03001234567' : 'e.g. PK36...'}
                          className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm dark:border-blue-800 dark:bg-gray-700 dark:text-gray-100"
                        />
                      </div>
                      <div className="flex flex-col justify-end">
                        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">
                          {paymentMethod === 'online' ? 'Sender / TxID' : 'Transaction ref'}
                        </label>
                        <input
                          type="text"
                          value={senderNumber}
                          onChange={(e) => setSenderNumber(e.target.value)}
                          placeholder="e.g. TXN-..."
                          className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm dark:border-blue-800 dark:bg-gray-700 dark:text-gray-100"
                        />
                      </div>
                    </div>
                  )}

                  {paymentMethod === 'check' && (
                    <div className="grid grid-cols-1 gap-3 rounded-lg border border-amber-100 bg-amber-50/60 p-3 dark:border-amber-900/40 dark:bg-amber-950/20 md:grid-cols-2">
                      <div className="flex flex-col justify-end">
                        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">Cheque number</label>
                        <input
                          type="text"
                          value={checkNumber}
                          onChange={(e) => setCheckNumber(e.target.value)}
                          placeholder="e.g. 001234"
                          className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm dark:border-amber-800 dark:bg-gray-700 dark:text-gray-100"
                        />
                      </div>
                      <div className="flex flex-col justify-end">
                        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">Bank name</label>
                        <input
                          type="text"
                          value={bankName}
                          onChange={(e) => setBankName(e.target.value)}
                          placeholder="e.g. MCB, HBL"
                          className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm dark:border-amber-800 dark:bg-gray-700 dark:text-gray-100"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                      Notes (optional)
                    </label>
                    <input
                      type="text"
                      value={paymentNotes}
                      onChange={(e) => setPaymentNotes(e.target.value)}
                      placeholder="Any additional notes..."
                      disabled={!paymentModalSupplier}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-40 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 px-5 py-4 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={() => {
                      resetPaymentForm();
                      setShowAddPaymentModal(false);
                    }}
                    className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                  {paymentModalSupplier && (
                    <button
                      type="button"
                      onClick={() => resetPaymentForm()}
                      className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      Clear form
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSubmitPayment}
                    disabled={
                      processing ||
                      !paymentModalSupplier ||
                      !paymentAmount ||
                      parseFloat(paymentAmount) <= 0 ||
                      (!!paymentModalSupplier &&
                        parseFloat(paymentAmount) > paymentModalSupplier.totalDue + 0.0001)
                    }
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {processing ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <FiCheck className="h-4 w-4" />
                        Record payment
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Payment Records Tab: one row per payment, with how it was split */}
      {activeTab === 'records' && (
        <div className="flex-1 min-h-0 flex flex-col pb-4">
          <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
            <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              <div>
                <h2 className="text-sm font-bold text-gray-900 dark:text-white">Payments made</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Each row is one payment. When you pay a supplier, the money automatically clears their{' '}
                  <span className="font-semibold">oldest unpaid purchase first</span>, then the next one.
                </p>
              </div>
              <div className="inline-flex rounded-lg bg-gray-100 dark:bg-gray-900/60 p-1">
                {(['table', 'timeline'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setRecordsViewMode(mode)}
                    className={`h-7 px-3 rounded-md text-xs font-semibold transition-all ${
                      recordsViewMode === mode
                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    {mode === 'table' ? 'List' : 'By day'}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-3 text-gray-500 dark:text-gray-400">
                  <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm font-medium">Loading payments…</span>
                </div>
              </div>
            ) : paymentGroups.length === 0 ? (
              <div className="p-12 text-center">
                <FiFileText className="w-14 h-14 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-700 dark:text-gray-300 font-semibold">No payments found</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {periodType !== 'all' || selectedSupplierId || selectedPaymentMethod || searchTerm
                    ? 'Nothing matches these filters. Try another period or clear the filters.'
                    : 'Payments will appear here after you pay a supplier.'}
                </p>
                {(periodType !== 'all' || selectedSupplierId || selectedPaymentMethod || searchTerm) && (
                  <button
                    onClick={clearFilters}
                    className="mt-4 px-4 py-2 text-sm text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg font-medium inline-flex items-center gap-2"
                  >
                    <FiX className="w-4 h-4" />
                    Clear filters
                  </button>
                )}
              </div>
            ) : recordsViewMode === 'table' ? (
              <>
                <div
                  className="flex-shrink-0 grid items-center gap-4 px-4 py-2.5 border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/40 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                  style={recordsGridStyle}
                >
                  <div>When</div>
                  <div>Paid to</div>
                  <div>Where the money went</div>
                  <div className="text-right">Amount</div>
                  <div />
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto">
                  {pagedPaymentGroups.map(renderPaymentGroupRow)}
                </div>
              </>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto">
                {paymentGroupsByDate.map((day) => (
                  <div key={day.key}>
                    <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2 bg-gray-50/95 dark:bg-gray-700/80 backdrop-blur border-b border-gray-200 dark:border-gray-600">
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                        {day.key}
                        <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                          {day.groups.length} payment{day.groups.length !== 1 ? 's' : ''}
                        </span>
                      </span>
                      <span className="text-sm font-bold tabular-nums text-green-700 dark:text-green-400">
                        {formatCurrency(day.total)}
                      </span>
                    </div>
                    {day.groups.map(renderPaymentGroupRow)}
                  </div>
                ))}
              </div>
            )}

            {!loading && paymentGroups.length > 0 && (
              <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  <span className="font-semibold">{paymentGroups.length}</span> payment{paymentGroups.length !== 1 ? 's' : ''} ·
                  total paid{' '}
                  <span className="font-bold text-green-700 dark:text-green-400 tabular-nums">
                    {formatCurrency(paymentGroups.reduce((sum, g) => sum + g.total, 0))}
                  </span>
                </span>
                {recordsViewMode === 'table' && groupPages > 1 && (
                  <div className="flex items-center gap-2 text-sm">
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <span className="px-2 font-medium text-gray-700 dark:text-gray-300">
                      Page {Math.min(currentPage, groupPages)} of {groupPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.min(groupPages, p + 1))}
                      disabled={currentPage >= groupPages}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Supplier Accounts Tab */}
      {activeTab === 'accounts' && (
        <div className="space-y-3 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
              <div className="flex flex-col items-center gap-3 text-gray-500 dark:text-gray-400">
                <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium">Loading supplier accounts...</span>
              </div>
            </div>
          ) : filteredSupplierAccounts.length === 0 ? (
            <div className="p-12 text-center bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
              <FiUsers className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">No supplier accounts found</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                Supplier accounts will appear here after making purchases
              </p>
            </div>
          ) : (
            filteredSupplierAccounts.map((account) => (
              <div
                key={account.supplierId}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden"
              >
                <div
                  className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  onClick={() => setExpandedAccount(expandedAccount === account.supplierId ? null : account.supplierId)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white font-bold text-lg">
                        {account.supplierName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">{account.supplierName}</h3>
                        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {account.companyName && <span>{account.companyName}</span>}
                          {account.phone && (
                            <span className="flex items-center gap-1">
                              <FiPhone className="w-3 h-3" /> {account.phone}
                            </span>
                          )}
                          {account.email && (
                            <span className="flex items-center gap-1">
                              <FiMail className="w-3 h-3" /> {account.email}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-xs text-gray-500 dark:text-gray-400">Total Purchases</div>
                        <div className="font-semibold text-gray-900 dark:text-white">{formatCurrency(account.totalPurchases)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500 dark:text-gray-400">Total Paid</div>
                        <div className="font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(account.totalPaid)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500 dark:text-gray-400">Outstanding</div>
                        <div className={`font-bold text-lg ${account.totalRemaining > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}`}>
                          {formatCurrency(account.totalRemaining)}
                        </div>
                      </div>
                      <div className="ml-2">
                        {expandedAccount === account.supplierId ? (
                          <FiChevronUp className="w-5 h-5 text-gray-400" />
                        ) : (
                          <FiChevronDown className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                
                {expandedAccount === account.supplierId && (
                  <div className="border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 p-4">
                    <div className="grid grid-cols-4 gap-4 mb-4">
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                        <div className="text-xs text-gray-500 dark:text-gray-400">Purchase Orders</div>
                        <div className="text-xl font-bold text-gray-900 dark:text-white">{account.purchaseCount}</div>
                      </div>
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                        <div className="text-xs text-gray-500 dark:text-gray-400">Payment Rate</div>
                        <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                          {account.totalPurchases > 0 ? ((account.totalPaid / account.totalPurchases) * 100).toFixed(1) : 0}%
                        </div>
                      </div>
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                        <div className="text-xs text-gray-500 dark:text-gray-400">Last Payment</div>
                        <div className="text-lg font-bold text-gray-900 dark:text-white">
                          {account.lastPaymentDate ? formatDate(account.lastPaymentDate) : '—'}
                        </div>
                      </div>
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                        <div className="text-xs text-gray-500 dark:text-gray-400">Last Amount</div>
                        <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                          {account.lastPaymentAmount ? formatCurrency(account.lastPaymentAmount) : '—'}
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => {
                          setSelectedSupplierId(account.supplierId);
                          setActiveTab('records');
                        }}
                        className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                      >
                        View Payment History
                      </button>
                      <button
                        onClick={() => {
                          setSelectedSupplierId(account.supplierId);
                          setPurchaseFilter('pending');
                          setActiveTab('payments');
                        }}
                        className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
                      >
                        Make Payment
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}


      {/* Ledger payment detail (bank / EasyPaisa / ref / notes) */}
      {viewLedgerPayment && viewLedgerPayment.kind === 'payment' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={() => setViewLedgerPayment(null)}
        >
          <div
            className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-800"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ledger-payment-detail-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
              <div className="min-w-0">
                <h3 id="ledger-payment-detail-title" className="text-lg font-bold text-gray-900 dark:text-white">
                  Payment details
                </h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {formatDateTime(viewLedgerPayment.eventAt)} · {viewLedgerPayment.supplierName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewLedgerPayment(null)}
                className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Close"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 px-5 py-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">PO</p>
                  <p className="font-semibold text-gray-900 dark:text-white tabular-nums">PO-{viewLedgerPayment.purchaseId}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Amount</p>
                  <p className="font-bold text-green-600 dark:text-green-400 tabular-nums">{formatCurrency(viewLedgerPayment.credit)}</p>
                </div>
              </div>
              {viewLedgerPayment.paymentMethod ? (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Method</p>
                  <span
                    className={`mt-1 inline-flex rounded border px-2 py-1 text-xs font-bold ${getPaymentMethodColor(viewLedgerPayment.paymentMethod).bg} ${getPaymentMethodColor(viewLedgerPayment.paymentMethod).text} ${getPaymentMethodColor(viewLedgerPayment.paymentMethod).border}`}
                  >
                    {getPaymentMethodLabel(viewLedgerPayment.paymentMethod)}
                  </span>
                </div>
              ) : null}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Reference / transaction ID
                </p>
                <p className="mt-0.5 break-words text-gray-900 dark:text-gray-100">
                  {(viewLedgerPayment.reference || '').trim() || '—'}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Notes and account details
                </p>
                <p className="mt-0.5 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-800 dark:border-gray-600 dark:bg-gray-900/40 dark:text-gray-200">
                  {(viewLedgerPayment.notes || '').trim() || '—'}
                </p>
              </div>
              {viewLedgerPayment.paymentId != null && (
                <p className="text-[10px] text-gray-400 dark:text-gray-500">Payment record #{viewLedgerPayment.paymentId}</p>
              )}
            </div>
            <div className="border-t border-gray-200 px-5 py-3 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setViewLedgerPayment(null)}
                className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment History Modal */}
      {viewPaymentHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Payment History</h3>
                <button
                  onClick={() => {
                    setViewPaymentHistory(null);
                    setPurchasePayments([]);
                  }}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <FiX className="w-5 h-5 text-gray-500" />
                </button>
            </div>
              <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                PO-{viewPaymentHistory.id} • {viewPaymentHistory.supplierName}
              </div>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 grid grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Grand Total</div>
                <div className="font-semibold text-gray-900 dark:text-white">{formatCurrency(viewPaymentHistory.grandTotal)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Total Paid</div>
                <div className="font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(viewPaymentHistory.paymentAmount)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Remaining</div>
                <div className={`font-bold ${viewPaymentHistory.remainingBalance > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}`}>
                  {formatCurrency(viewPaymentHistory.remainingBalance)}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {loadingPurchasePayments ? (
                <div className="py-8 text-center text-gray-500 dark:text-gray-400 flex flex-col items-center gap-3">
                  <FiRefreshCw className="w-6 h-6 animate-spin text-emerald-500" />
                  <span className="text-sm font-medium">Loading payment history...</span>
                </div>
              ) : purchasePayments.length === 0 ? (
                <div className="py-8 text-center text-gray-500 dark:text-gray-400">
                  <FiFileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No payment records found for this purchase</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {purchasePayments.map((payment, index) => {
                    const methodColor = getPaymentMethodColor(payment.paymentMethod);
                    return (
                      <div
                        key={payment.id}
                        className="flex items-center justify-between p-4 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold">
                            {index + 1}
                          </div>
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white">{formatDate(payment.paymentDate)}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${methodColor.bg} ${methodColor.text}`}>
                                {getPaymentMethodLabel(payment.paymentMethod)}
                              </span>
                              {(payment.checkNumber || payment.referenceNumber) && (
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {payment.checkNumber ? `Check: ${payment.checkNumber}` : `Ref: ${payment.referenceNumber}`}
                                </span>
                              )}
                            </div>
                            {payment.notes && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{payment.notes}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(payment.amount)}</div>
                          </div>
                          {isToday(payment.paymentDate) && (
                            <button
                              onClick={() => handleDeletePaymentRecord(payment.id)}
                              className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                              title="Delete Payment (Today Only)"
                            >
                              <FiTrash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
              <button
                onClick={() => {
                  setViewPaymentHistory(null);
                  setPurchasePayments([]);
                }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Dialog */}
      {showExportDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Export Payment Records</h3>
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

              {/* Supplier Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Supplier / Company (Optional)
                </label>
                <select
                  value={exportSupplierId || ''}
                  onChange={(e) => setExportSupplierId(e.target.value ? parseInt(e.target.value) : null)}
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Date Range</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">From Date</label>
                    <input
                      type="date"
                      value={exportFromDate}
                      max={today}
                      onChange={(e) => setExportFromDate(e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white dark:bg-gray-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">To Date</label>
                    <input
                      type="date"
                      value={exportToDate}
                      max={today}
                      onChange={(e) => setExportToDate(e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white dark:bg-gray-700"
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
                onClick={async () => {
                  setExporting(true);
                  try {
                    const filters: any = {};
                    if (exportSupplierId) filters.supplierId = exportSupplierId;
                    if (exportFromDate && exportToDate) {
                      filters.fromDate = exportFromDate;
                      filters.toDate = exportToDate;
                      filters.periodType = 'custom';
                    }

                    if (exportFormat === 'pdf') {
                      window.electron.ipcRenderer.once('payment-export-pdf-reply', (response: any) => {
                        setExporting(false);
                        if (response.success) {
                          if (showPreview && response.data?.htmlContent) {
                            // Show preview
                            setPdfHtmlContent(response.data.htmlContent);
                            setShowExportDialog(false);
                          } else {
                            setShowExportDialog(false);
                            alert('Payment records exported successfully!');
                          }
                        } else if (response.error !== 'canceled') {
                          alert('Error exporting: ' + (response.error || 'Unknown error'));
                        }
                      });
                      window.electron.ipcRenderer.sendMessage('payment-export-pdf', [filters, pharmacySettings, showPreview]);
                    } else {
                      window.electron.ipcRenderer.once('payment-export-csv-reply', (response: any) => {
                        setExporting(false);
                        if (response.success) {
                          setShowExportDialog(false);
                          alert('Payment records exported successfully!');
                        } else if (response.error !== 'canceled') {
                          alert('Error exporting: ' + (response.error || 'Unknown error'));
                        }
                      });
                      window.electron.ipcRenderer.sendMessage('payment-export-csv', [filters, pharmacySettings]);
                    }
                  } catch (err) {
                    setExporting(false);
                    alert('Error exporting. Please try again.');
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
                    <FiDownload className="w-4 h-4" />
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
        title="Payment Report Preview"
      />
    </div>
  );
};

export default Payments;
