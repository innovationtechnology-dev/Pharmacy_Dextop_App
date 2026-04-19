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
} from 'react-icons/fi';
import { useDashboardHeader } from './useDashboardHeader';
import PDFPreviewModal from '../../components/common/PDFPreviewModal';
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
}

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

/** Column template for supplier ledger — grid lines align with Selling / Purchasing panels */
const supplierLedgerGridStyle: React.CSSProperties = {
  gridTemplateColumns:
    'minmax(142px, 1.2fr) 78px minmax(120px, 1.25fr) minmax(90px, 0.82fr) minmax(90px, 0.82fr) minmax(118px, 1.05fr) minmax(150px, 1.25fr) 90px',
};

const ledgerGridHeaderClass =
  'grid w-full gap-0 items-center border-b-2 border-gray-300 dark:border-gray-500 bg-gradient-to-r from-gray-50/90 to-gray-100/60 dark:from-gray-700/50 dark:to-gray-700/30 text-[10px] font-extrabold text-gray-700 dark:text-gray-300 uppercase tracking-wider [&>div]:flex [&>div]:items-center [&>div]:border-r [&>div]:border-gray-200 dark:[&>div]:border-gray-600 [&>div:last-child]:border-r-0 [&>div]:px-2.5 [&>div]:sm:px-3 [&>div]:py-2.5';

const ledgerGridRowClass =
  'grid w-full gap-0 items-center border-b border-gray-200 dark:border-gray-600 last:border-b-0 text-xs transition-colors hover:bg-gradient-to-r hover:from-emerald-50/30 hover:to-transparent dark:hover:from-emerald-900/10 dark:hover:to-transparent [&>div]:border-r [&>div]:border-gray-200 dark:[&>div]:border-gray-600 [&>div:last-child]:border-r-0 [&>div]:px-2.5 [&>div]:sm:px-3 [&>div]:py-2 [&>div]:min-h-[2.75rem] [&>div]:flex [&>div]:items-center';

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
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
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
    return new Date(value).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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
        window.electron.ipcRenderer.sendMessage('payment-get-all' as any, [filters, true]); // true = paginated
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

  const ledgerTotalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredLedger.length / LEDGER_ROWS_PER_PAGE)),
    [filteredLedger.length],
  );

  const pagedLedgerRows = useMemo(() => {
    const start = (ledgerPage - 1) * LEDGER_ROWS_PER_PAGE;
    return filteredLedger.slice(start, start + LEDGER_ROWS_PER_PAGE);
  }, [filteredLedger, ledgerPage]);

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

  const handleDeletePurchase = async (purchaseId: number) => {
    if (!window.confirm(`Are you sure you want to delete purchase PO-${purchaseId}? This action cannot be undone.`)) {
      return;
    }
    setProcessing(true);
    try {
      window.electron.ipcRenderer.once('purchase-delete-reply', (response: any) => {
        setProcessing(false);
        setDeleteConfirm(null);
        if (response.success) {
          loadAllData();
          alert('Purchase deleted successfully!');
        } else {
          alert('Error deleting purchase: ' + (response.error || 'Unknown error'));
        }
      });
      window.electron.ipcRenderer.sendMessage('purchase-delete', [purchaseId]);
    } catch (err) {
      setProcessing(false);
      setDeleteConfirm(null);
      alert('Error deleting purchase. Please try again.');
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

      {/* Stats Header - Matching Sales Report Design */}
      {loading ? (
        <div className="bg-gradient-to-br from-white via-white to-gray-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-gray-800/90 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-3 mb-2 flex flex-wrap items-center gap-3 flex-shrink-0">
          {/* Skeleton loaders for stats */}
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-700 px-2.5 py-1.5 rounded-md border border-gray-200 dark:border-gray-600 shadow-sm animate-pulse">
              <div className="w-3.5 h-3.5 bg-gray-300 dark:bg-gray-600 rounded" />
              <div className="w-16 h-3 bg-gray-300 dark:bg-gray-600 rounded mr-2" />
              <div className="w-24 h-3 bg-gray-300 dark:bg-gray-600 rounded" />
            </div>
          ))}
          <button
            onClick={loadAllData}
            disabled
            className="ml-auto px-3 py-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-xs font-semibold rounded-md uppercase tracking-wide flex items-center gap-1.5 shadow-sm opacity-50 cursor-not-allowed"
          >
            <FiRefreshCw className="w-3.5 h-3.5 animate-spin" />
            Refresh
          </button>
        </div>
      ) : (
        <div className="bg-gradient-to-br from-white via-white to-gray-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-gray-800/90 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-3 mb-2 flex flex-wrap items-center gap-3 flex-shrink-0">
          <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1.5 rounded-md border border-blue-200 dark:border-blue-600/50 shadow-sm">
            <FiDollarSign className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Purchases</span>
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 ml-1">
              {formatCurrency(paymentSummary?.totalPurchases || 0)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1.5 rounded-md border border-emerald-200 dark:border-emerald-600/50 shadow-sm">
            <FiTrendingUp className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Paid</span>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 ml-1">
              {formatCurrency(paymentSummary?.totalPaid || 0)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-orange-50 dark:bg-orange-900/20 px-2.5 py-1.5 rounded-md border border-orange-200 dark:border-orange-600/50 shadow-sm">
            <FiTrendingDown className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Outstanding</span>
            <span className="text-xs font-bold text-orange-600 dark:text-orange-400 ml-1">
              {formatCurrency(paymentSummary?.totalRemaining || 0)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-green-50 dark:bg-green-900/20 px-2.5 py-1.5 rounded-md border border-green-200 dark:border-green-600/50 shadow-sm">
            <FiDollarSign className="w-3.5 h-3.5 text-green-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Cash</span>
            <span className="text-xs font-bold text-green-600 dark:text-green-400 ml-1">
              {formatCurrency(paymentSummary?.cashPayments || 0)}
            </span>
          </div>

          <button
            onClick={loadAllData}
            className="ml-auto px-3 py-1.5 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-xs font-semibold rounded-md transition-colors uppercase tracking-wide flex items-center gap-1.5 shadow-sm"
          >
            <FiRefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      )}


      {/* Date Selection - Prominent */}
      <div className="bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md p-3 mb-2 flex-shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <FiCalendar className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Select Date Range:</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                setPeriodType('today');
                setCustomFromDate('');
                setCustomToDate('');
                setShowDatePicker(false);
              }}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                periodType === 'today'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => {
                setPeriodType('week');
                setCustomFromDate('');
                setCustomToDate('');
                setShowDatePicker(false);
              }}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                periodType === 'week'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              This Week
            </button>
            <button
              onClick={() => {
                setPeriodType('month');
                setCustomFromDate('');
                setCustomToDate('');
                setShowDatePicker(false);
              }}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                periodType === 'month'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              This Month
            </button>
            <button
              onClick={() => {
                setPeriodType('year');
                setCustomFromDate('');
                setCustomToDate('');
                setShowDatePicker(false);
              }}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                periodType === 'year'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              This Year
            </button>

            {/* Inline Custom Date Picker */}
            {showDatePicker && periodType === 'custom' && (
              <div className="flex items-center gap-2.5 animate-in fade-in slide-in-from-left-2 mx-1 px-3 border-l border-r border-gray-200 dark:border-gray-700/50">
                <div className="flex items-center gap-1.5">
                  <label className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-tighter">FROM:</label>
                  <input
                    type="date"
                    value={customFromDate}
                    max={today}
                    onChange={(e) => setCustomFromDate(e.target.value)}
                    className="appearance-none bg-gray-100 dark:bg-[#1a2130] text-gray-700 dark:text-white border border-gray-300 dark:border-gray-600 px-2.5 py-1 rounded-md text-[11px] font-bold outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-tighter">TO:</label>
                  <input
                    type="date"
                    value={customToDate}
                    max={today}
                    onChange={(e) => setCustomToDate(e.target.value)}
                    className="appearance-none bg-gray-100 dark:bg-[#1a2130] text-gray-700 dark:text-white border border-gray-300 dark:border-gray-600 px-2.5 py-1 rounded-md text-[11px] font-bold outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all"
                  />
                </div>
                <button
                  onClick={() => setShowDatePicker(false)}
                  className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  <FiX className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <button
              onClick={() => {
                setShowDatePicker(!showDatePicker);
                if (!showDatePicker) {
                  setPeriodType('custom');
                  if (!customFromDate || !customToDate) {
                    setCustomFromDate(today);
                    setCustomToDate(today);
                  }
                }
              }}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${
                periodType === 'custom'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <FiCalendar className="w-4 h-4" />
              Custom Date
            </button>
            <button
              onClick={() => {
                setPeriodType('all');
                setCustomFromDate('');
                setCustomToDate('');
                setShowDatePicker(false);
              }}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                periodType === 'all'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              All Time
            </button>
          </div>
        </div>
        

      </div>

      {/* Other Filters - Compact & Integrated */}
      <div className="flex flex-wrap gap-4 items-center px-1 py-1 mb-2">
        <div className="flex-1 min-w-[300px]">
          <div className="relative group">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-emerald-500 transition-colors" />
            <input
              type="text"
              placeholder="Search supplier, PO#, reference..."
              value={immediateSearchTerm}
              onChange={handleSearchChange}
              className="w-full pl-10 pr-4 py-2 text-sm bg-gray-100/50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/50 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-gray-100/50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/50 px-3 py-1.5 rounded-lg group focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-500/50 transition-all">
            <FiFilter className="w-3.5 h-3.5 text-gray-400 group-focus-within:text-emerald-500" />
            <select
              value={selectedSupplierId || ''}
              onChange={(e) => setSelectedSupplierId(e.target.value ? parseInt(e.target.value) : null)}
              className="bg-transparent text-sm text-gray-700 dark:text-gray-200 outline-none min-w-[160px] font-medium cursor-pointer"
            >
              <option value="" className="dark:bg-gray-800">All Suppliers</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id} className="dark:bg-gray-800">
                  {s.name} {s.companyName ? `(${s.companyName})` : ''}
                </option>
              ))}
            </select>
          </div>

          {activeTab === 'records' && (
            <div className="flex items-center gap-2 bg-gray-100/50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/50 px-3 py-1.5 rounded-lg group focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all">
              <select
                value={selectedPaymentMethod || ''}
                onChange={(e) => setSelectedPaymentMethod(e.target.value as PaymentMethod || null)}
                className="bg-transparent text-sm text-gray-700 dark:text-gray-200 outline-none font-medium cursor-pointer"
              >
                <option value="" className="dark:bg-gray-800">All Methods</option>
                <option value="cash" className="dark:bg-gray-800">Cash</option>
                <option value="bank_transfer" className="dark:bg-gray-800">Bank Transfer</option>
                <option value="check" className="dark:bg-gray-800">Check</option>
                <option value="online" className="dark:bg-gray-800">Online</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Make Payments Tab */}
      {activeTab === 'payments' && (
        <div className="overflow-y-auto space-y-3">

          {/* Ledger toolbar: filters + Add Payment */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/90 dark:bg-gray-800/80 p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setPurchaseFilter('all')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  purchaseFilter === 'all'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm ring-1 ring-gray-200/80 dark:ring-gray-600'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                All <span className="tabular-nums opacity-80">{ledgerPurchaseStats.all}</span>
              </button>
              <button
                type="button"
                onClick={() => setPurchaseFilter('pending')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  purchaseFilter === 'pending'
                    ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-100 shadow-sm ring-1 ring-amber-200/80 dark:ring-amber-800/60'
                    : 'text-gray-600 dark:text-gray-400 hover:text-amber-800 dark:hover:text-amber-200'
                }`}
              >
                Pending <span className="tabular-nums opacity-80">{ledgerPurchaseStats.pending}</span>
              </button>
              <button
                type="button"
                onClick={() => setPurchaseFilter('paid')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  purchaseFilter === 'paid'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100 shadow-sm ring-1 ring-emerald-200/80 dark:ring-emerald-800/50'
                    : 'text-gray-600 dark:text-gray-400 hover:text-emerald-800 dark:hover:text-emerald-200'
                }`}
              >
                Paid <span className="tabular-nums opacity-80">{ledgerPurchaseStats.paid}</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                resetPaymentForm();
                setShowAddPaymentModal(true);
              }}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
            >
              <FiPlus className="h-4 w-4" />
              Add Payment
            </button>
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50/60 dark:bg-gray-800/40 px-3 py-2 text-[11px] leading-relaxed text-gray-600 dark:text-gray-400">
            <span className="font-semibold text-gray-700 dark:text-gray-300">Newest first.</span>{' '}
            Balance = running payable after the row (see “Was” line for balance before the row). Debit / credit = this row only.
          </div>

          {/* Supplier ledger — grid lines (Selling / Purchasing style) */}
          <div className="rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
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
              <div className="overflow-x-hidden">
                <div className="w-full">
                  <div className={ledgerGridHeaderClass} style={supplierLedgerGridStyle}>
                    <div>{'Date & time'}</div>
                    <div className="justify-center text-center">Type</div>
                    <div className="min-w-0 justify-center text-center">Supplier</div>
                    <div className="justify-end text-right">Debit</div>
                    <div className="justify-end text-right">Credit</div>
                    <div className="justify-center text-center">Balance</div>
                    <div className="min-w-0 justify-center text-center">Notes</div>
                    <div className="justify-center">Act.</div>
                  </div>
                  <div className="max-h-[58vh] overflow-y-auto">
                  {pagedLedgerRows.map((row) => {
                    const key = row.kind === 'payment' && row.paymentId != null
                      ? `pay-${row.paymentId}`
                      : `pur-${row.purchaseId}-${row.eventAt}`;
                    const isPurchase = row.kind === 'purchase';
                    const purchase = isPurchase ? purchaseFromLedgerRow(row) : null;
                    const mc = row.paymentMethod ? getPaymentMethodColor(row.paymentMethod) : null;

                    return (
                      <div key={key} className={ledgerGridRowClass} style={supplierLedgerGridStyle}>
                        <div className="min-w-0 text-[11px] text-gray-600 dark:text-gray-400 font-medium tabular-nums whitespace-nowrap">
                          {formatDateTime(row.eventAt)}
                        </div>
                        <div className="min-w-0 flex justify-center">
                          {isPurchase ? (
                            <span
                              className="inline-flex items-center rounded-md border-2 border-red-200 bg-gradient-to-br from-red-50 to-orange-50/80 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-red-700 shadow-sm ring-1 ring-red-100 dark:border-red-800/70 dark:from-red-950/40 dark:to-red-950/20 dark:text-red-300 dark:ring-red-900/40"
                              title="Purchase (adds to supplier balance)"
                            >
                              Purchase
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center rounded-md border-2 border-green-300 bg-gradient-to-br from-green-50 to-emerald-50/90 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-green-700 shadow-sm ring-1 ring-green-100 dark:border-green-700 dark:from-green-950/45 dark:to-emerald-950/30 dark:text-green-300 dark:ring-green-900/35"
                              title="Payment (reduces supplier balance)"
                            >
                              Payment
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 justify-center text-center font-medium text-gray-900 dark:text-gray-100 truncate text-[11px]" title={row.supplierName}>
                          {row.supplierName}
                        </div>
                        <div className="min-w-0 justify-end text-right font-medium tabular-nums text-[11px]">
                          {row.debit > 0 ? (
                            <span className="text-red-600 dark:text-red-400">{formatCurrency(row.debit)}</span>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-500">—</span>
                          )}
                        </div>
                        <div className="min-w-0 justify-end text-right font-medium tabular-nums text-[11px]">
                          {row.credit > 0 ? (
                            <span className="text-green-600 dark:text-green-400">{formatCurrency(row.credit)}</span>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-500">—</span>
                          )}
                        </div>
                        <div className="min-w-0 flex flex-col items-end justify-center gap-0 leading-tight">
                          <span className={`font-semibold tabular-nums text-[11px] ${row.balanceAfter <= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-900 dark:text-white'}`}>
                            {formatCurrency(row.balanceAfter)}
                          </span>
                          {typeof row.balanceBefore === 'number' && (
                            <span className="text-[9px] font-medium text-gray-400 dark:text-gray-500 tabular-nums">
                              Was {formatCurrency(row.balanceBefore)}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex flex-col items-start justify-center gap-0.5 py-0.5">
                          {isPurchase ? (
                            <span className="text-[10px] text-gray-500 dark:text-gray-400 tabular-nums">PO-{row.purchaseId}</span>
                          ) : (
                            <>
                              <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300 tabular-nums">PO-{row.purchaseId}</span>
                              {mc ? (
                                <span className={`inline-flex w-fit max-w-full truncate rounded border px-1.5 py-0.5 text-[9px] font-bold ${mc.bg} ${mc.text} ${mc.border}`}>
                                  {getPaymentMethodLabel(row.paymentMethod || '')}
                                </span>
                              ) : null}
                              {row.reference ? (
                                <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-full" title={row.reference}>
                                  {row.reference}
                                </span>
                              ) : null}
                            </>
                          )}
                          {isPurchase && (row.notes || '').trim() ? (
                            <span className="text-[10px] text-gray-500 dark:text-gray-400 line-clamp-2 leading-snug" title={row.notes}>
                              {row.notes}
                            </span>
                          ) : null}
                        </div>
                        <div className="justify-center gap-0.5">
                          <div className="flex items-center justify-center gap-0.5 flex-wrap">
                            {isPurchase && purchase && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleViewPaymentHistory(purchase)}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/60"
                                  title="History"
                                >
                                  <FiEye className="w-3.5 h-3.5" />
                                </button>
                                {isToday(row.eventAt) && (
                                  <button
                                    type="button"
                                    onClick={() => setDeleteConfirm(row.purchaseId)}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                                    title="Delete PO (today)"
                                  >
                                    <FiTrash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </>
                            )}
                            {!isPurchase && row.paymentId != null && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleViewLedgerPaymentDetail(row)}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/60"
                                  title="View payment details"
                                >
                                  <FiEye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeletePaymentRecord(row.paymentId!)}
                                  disabled={processing}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-red-400 hover:border-red-200 hover:bg-red-50/80 dark:hover:bg-red-950/25 disabled:opacity-40"
                                  title="Delete payment"
                                >
                                  <FiTrash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                  {filteredLedger.length > 0 && (
                    <div className="border-t border-gray-200 dark:border-gray-600 px-3 py-2 flex items-center justify-between gap-2 text-xs text-gray-600 dark:text-gray-300">
                      <span>
                        Showing {((ledgerPage - 1) * LEDGER_ROWS_PER_PAGE) + 1} to{' '}
                        {Math.min(ledgerPage * LEDGER_ROWS_PER_PAGE, filteredLedger.length)} of {filteredLedger.length}
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

      {/* Payment Records Tab */}
      {activeTab === 'records' && (
        <div className="space-y-4 overflow-y-auto">
          {/* View Mode Toggle */}
          <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">View Mode:</span>
              <button
                onClick={() => setRecordsViewMode('table')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  recordsViewMode === 'table'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                <FiFileText className="w-4 h-4 inline mr-2" />
                Table View
              </button>
              <button
                onClick={() => setRecordsViewMode('timeline')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  recordsViewMode === 'timeline'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                <FiCalendar className="w-4 h-4 inline mr-2" />
                Timeline View
              </button>
            </div>
            {recordsViewMode === 'timeline' && (
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {recordsByDate.length} day{recordsByDate.length !== 1 ? 's' : ''} • {displayRecords.length} record{displayRecords.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
            {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3 text-gray-500 dark:text-gray-400">
                <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium">Loading payment records...</span>
              </div>
            </div>
          ) : displayRecords.length === 0 ? (
            <div className="p-12 text-center">
              <FiFileText className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">No payment records found</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                {periodType === 'today' 
                  ? 'No payments made today. Try changing the date filter to see more records.'
                  : periodType === 'week'
                  ? 'No payments made this week. Try changing the date filter to see more records.'
                  : periodType === 'month'
                  ? 'No payments made this month. Try changing the date filter to see more records.'
                  : selectedSupplierId || selectedPaymentMethod
                  ? 'No payment records match your current filters. Try adjusting or clearing filters.'
                  : 'Payment records will appear here when you make payments'}
              </p>
              {(periodType !== 'all' || selectedSupplierId || selectedPaymentMethod || searchTerm) && (
                <button
                  onClick={clearFilters}
                  className="mt-4 px-4 py-2 text-sm text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg font-medium transition-colors inline-flex items-center gap-2"
                >
                  <FiX className="w-4 h-4" />
                  Clear all filters
                </button>
              )}
            </div>
          ) : recordsViewMode === 'table' ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Supplier</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">PO #</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Method</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Reference</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Amount</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {displayRecords.map((record) => {
                    const methodColor = getPaymentMethodColor(record.paymentMethod);
                    return (
                      <tr key={record.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium">{formatDate(record.paymentDate)}</td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{record.supplierName}</div>
                          {record.companyName && (
                            <div className="text-xs text-gray-500 dark:text-gray-400">{record.companyName}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">PO-{record.purchaseId}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${methodColor.bg} ${methodColor.text}`}>
                            {getPaymentMethodLabel(record.paymentMethod)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                          {record.checkNumber && <div>Check: {record.checkNumber}</div>}
                          {record.referenceNumber && <div>Ref: {record.referenceNumber}</div>}
                          {record.bankName && <div className="text-xs">{record.bankName}</div>}
                          {!record.checkNumber && !record.referenceNumber && '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(record.amount)}</td>
                        <td className="px-4 py-3 text-center">
                          {isToday(record.paymentDate) && (
                            <button
                              onClick={() => handleDeletePaymentRecord(record.id)}
                              className="inline-flex items-center justify-center w-8 h-8 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                              title="Delete Payment (Today Only)"
                            >
                              <FiTrash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            ) : (
              /* Timeline View - Grouped by Date */
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {recordsByDate.map(([dateKey, group]) => (
                  <div key={dateKey} className="p-6 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    {/* Date Header */}
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
                          {group.date.getDate()}
                        </div>
                        <div>
                          <div className="font-semibold text-gray-900 dark:text-white text-lg">
                            {dateKey}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {group.records.length} payment{group.records.length !== 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Daily Total</div>
                        <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(group.totalAmount)}
                        </div>
                      </div>
                    </div>

                    {/* Records for this date */}
                    <div className="space-y-3">
                      {group.records.map((record: PaymentRecord) => {
                        const methodColor = getPaymentMethodColor(record.paymentMethod);
                        return (
                          <div
                            key={record.id}
                            className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          >
                            <div className="flex items-center gap-4 flex-1">
                              <div className="w-10 h-10 rounded-full bg-white dark:bg-gray-800 flex items-center justify-center border-2 border-gray-200 dark:border-gray-600">
                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${methodColor.bg} ${methodColor.text}`}>
                                  {getPaymentMethodLabel(record.paymentMethod).charAt(0)}
                                </span>
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-semibold text-gray-900 dark:text-white">
                                    {record.supplierName}
                                  </span>
                                  {record.companyName && (
                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                      ({record.companyName})
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
                                  <span className="flex items-center gap-1">
                                    <span className="font-medium">PO-{record.purchaseId}</span>
                                  </span>
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${methodColor.bg} ${methodColor.text}`}>
                                    {getPaymentMethodLabel(record.paymentMethod)}
                                  </span>
                                  {(record.checkNumber || record.referenceNumber) && (
                                    <span className="text-gray-500 dark:text-gray-400">
                                      {record.checkNumber ? `Check: ${record.checkNumber}` : `Ref: ${record.referenceNumber}`}
                                    </span>
                                  )}
                                </div>
                                {record.notes && (
                                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic">
                                    {record.notes}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                                  {formatCurrency(record.amount)}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {new Date(record.paymentDate).toLocaleTimeString('en-GB', {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </div>
                              </div>
                              {isToday(record.paymentDate) && (
                                <button
                                  onClick={() => handleDeletePaymentRecord(record.id)}
                                  className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
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
                  </div>
                ))}
                {recordsByDate.length === 0 && (
                  <div className="p-12 text-center">
                    <FiCalendar className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                    <p className="text-gray-500 dark:text-gray-400 font-medium">No records found for selected period</p>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Pagination Controls - Only show in table view when not searching */}
          {recordsViewMode === 'table' && !searchTerm && paymentRecords.length > 0 && totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Showing {((currentPage - 1) * recordsPerPage) + 1} to {Math.min(currentPage * recordsPerPage, totalRecords)} of {totalRecords} records
                </span>
                <select
                  value={recordsPerPage}
                  onChange={(e) => {
                    setRecordsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white dark:bg-gray-700"
                >
                  <option value={25}>25 per page</option>
                  <option value={50}>50 per page</option>
                  <option value={100}>100 per page</option>
                  <option value={200}>200 per page</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  First
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <span className="px-4 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Last
                </button>
              </div>
            </div>
          )}
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

      {/* Delete Confirmation Modal */}
          {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Delete Purchase</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Are you sure you want to delete purchase PO-{deleteConfirm}? This will also delete all associated payment records. This action cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDeletePurchase(deleteConfirm)}
                    disabled={processing}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    {processing ? 'Deleting...' : 'Delete'}
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
