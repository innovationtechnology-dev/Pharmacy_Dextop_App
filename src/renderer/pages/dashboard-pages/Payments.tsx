'use client';

import React, { useCallback, useEffect, useState, useMemo } from 'react';
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

const Payments: React.FC = () => {
  const { setHeader } = useDashboardHeader();

  // Core state
  const [pharmacySettings] = useState<PharmacySettings>(() => getStoredPharmacySettings());
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [paymentRecords, setPaymentRecords] = useState<PaymentRecord[]>([]);
  const [supplierAccounts, setSupplierAccounts] = useState<SupplierAccount[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  console.log("Payment Summary",paymentSummary);
  
  // Filter state
  const [activeTab, setActiveTab] = useState<'payments' | 'records' | 'accounts'>('payments');
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);
  const [periodType, setPeriodType] = useState<PeriodType>('today'); // Default to today
  const [customFromDate, setCustomFromDate] = useState<string>('');
  const [customToDate, setCustomToDate] = useState<string>('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [purchaseFilter, setPurchaseFilter] = useState<'all' | 'pending' | 'paid'>('all');
  
  // Modal state
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [processing, setProcessing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [viewPaymentHistory, setViewPaymentHistory] = useState<Purchase | null>(null);
  const [purchasePayments, setPurchasePayments] = useState<PaymentRecord[]>([]);
  const [expandedAccount, setExpandedAccount] = useState<number | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportSupplierId, setExportSupplierId] = useState<number | null>(null);
  const [exportFromDate, setExportFromDate] = useState<string>('');
  const [exportToDate, setExportToDate] = useState<string>('');
  const [exportFormat, setExportFormat] = useState<'pdf' | 'csv'>('pdf');
  const [exporting, setExporting] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(50);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  
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

  const isToday = useCallback((dateString?: string) => {
    if (!dateString) return false;
    const date = new Date(dateString);
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  }, []);

  // Load data
  const loadPurchases = useCallback(async () => {
    try {
      // Build date filters for purchases
      let fromDate: string | undefined;
      let toDate: string | undefined;
      
      if (periodType !== 'all') {
        const today = new Date();
        toDate = today.toISOString().split('T')[0];
        
        switch (periodType) {
          case 'today':
            fromDate = toDate;
            break;
          case 'week':
            const weekAgo = new Date(today);
            weekAgo.setDate(weekAgo.getDate() - 7);
            fromDate = weekAgo.toISOString().split('T')[0];
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
              toDate = customToDate;
            }
            break;
        }
      }

      window.electron.ipcRenderer.once('purchase-get-all-reply', (response: any) => {
        if (response.success) {
          setPurchases(response.data || []);
        } else {
          console.error('Error loading purchases:', response.error);
        }
      });
      // Pass date range to filter purchases
      window.electron.ipcRenderer.sendMessage('purchase-get-all', [fromDate, toDate]);
    } catch (err) {
      console.error('Error loading purchases:', err);
    }
  }, [periodType, customFromDate, customToDate]);

  const loadSuppliers = useCallback(async () => {
    try {
      window.electron.ipcRenderer.once('supplier-get-all-reply', (response: any) => {
        if (response.success) {
          setSuppliers(response.data || []);
        }
      });
      window.electron.ipcRenderer.sendMessage('supplier-get-all', []);
    } catch (err) {
      console.error('Error loading suppliers:', err);
    }
  }, []);

  const loadPaymentRecords = useCallback(async () => {
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
        } else {
          console.error('Error loading payment records:', response.error);
        }
      });
      window.electron.ipcRenderer.sendMessage('payment-get-all' as any, [filters, true]); // true = paginated
    } catch (err) {
      console.error('Error loading payment records:', err);
    }
  }, [selectedSupplierId, selectedPaymentMethod, periodType, customFromDate, customToDate, currentPage, recordsPerPage]);

  const loadPaymentSummary = useCallback(async () => {
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
        }
      });
      window.electron.ipcRenderer.sendMessage('payment-get-summary' as any, [filters]);
    } catch (err) {
      console.error('Error loading payment summary:', err);
    }
  }, [selectedSupplierId, periodType, customFromDate, customToDate]);

  const loadSupplierAccounts = useCallback(async () => {
    try {
      window.electron.ipcRenderer.once('payment-get-supplier-accounts-reply' as any, (response: any) => {
        if (response.success) {
          setSupplierAccounts(response.data || []);
        }
      });
      window.electron.ipcRenderer.sendMessage('payment-get-supplier-accounts' as any, []);
    } catch (err) {
      console.error('Error loading supplier accounts:', err);
    }
  }, []);

  const loadPurchasePayments = useCallback(async (purchaseId: number) => {
    try {
      window.electron.ipcRenderer.once('payment-get-by-purchase-reply' as any, (response: any) => {
        if (response.success) {
          setPurchasePayments(response.data || []);
        }
      });
      window.electron.ipcRenderer.sendMessage('payment-get-by-purchase' as any, [purchaseId]);
    } catch (err) {
      console.error('Error loading purchase payments:', err);
    }
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
        loadSupplierAccounts(),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [loadPurchases, loadSuppliers, loadPaymentRecords, loadPaymentSummary, loadSupplierAccounts]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedSupplierId, selectedPaymentMethod, periodType, customFromDate, customToDate]);

  // Reload data when filters or pagination change
  useEffect(() => {
    loadPurchases();
    loadPaymentRecords();
    loadPaymentSummary();
  }, [loadPurchases, loadPaymentRecords, loadPaymentSummary]);

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

  // Filtered data
  const filteredPurchases = useMemo(() => {
    let filtered = purchases;
    
    if (selectedSupplierId !== null) {
      filtered = filtered.filter(p => p.supplierId === selectedSupplierId);
    }
    
    if (purchaseFilter === 'pending') {
      filtered = filtered.filter(p => p.remainingBalance > 0);
    } else if (purchaseFilter === 'paid') {
      filtered = filtered.filter(p => p.remainingBalance <= 0);
    }
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(p => 
        p.supplierName.toLowerCase().includes(term) ||
        String(p.id).includes(term)
      );
    }
    
    return filtered;
  }, [purchases, purchaseFilter, selectedSupplierId, searchTerm]);

  const filteredPaymentRecords = useMemo(() => {
    if (!searchTerm) return paymentRecords;
    const term = searchTerm.toLowerCase();
    return paymentRecords.filter(r =>
      r.supplierName.toLowerCase().includes(term) ||
      r.companyName?.toLowerCase().includes(term) ||
      r.referenceNumber?.toLowerCase().includes(term) ||
      r.checkNumber?.toLowerCase().includes(term) ||
      String(r.purchaseId).includes(term)
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
    const term = searchTerm.toLowerCase();
    return supplierAccounts.filter(a =>
      a.supplierName.toLowerCase().includes(term) ||
      a.companyName?.toLowerCase().includes(term)
    );
  }, [supplierAccounts, searchTerm]);

  const totalStats = useMemo(() => {
    const totalPurchases = purchases.reduce((sum, p) => sum + p.grandTotal, 0);
    const totalPaid = purchases.reduce((sum, p) => sum + p.paymentAmount, 0);
    const totalRemaining = purchases.reduce((sum, p) => sum + p.remainingBalance, 0);
    const pendingCount = purchases.filter(p => p.remainingBalance > 0).length;
    const paidCount = purchases.filter(p => p.remainingBalance <= 0).length;
    return { totalPurchases, totalPaid, totalRemaining, pendingCount, paidCount };
  }, [purchases]);

  // Handlers
  const handleMakePayment = (purchase: Purchase) => {
    setSelectedPurchase(purchase);
    setPaymentAmount('');
    setPaymentMethod('cash');
    setReferenceNumber('');
    setCheckNumber('');
    setBankName('');
    setAccountNumber('');
    setPaymentNotes('');
    setPaymentDate(new Date().toISOString().split('T')[0]);
  };

  const handleViewPaymentHistory = (purchase: Purchase) => {
    setViewPaymentHistory(purchase);
    loadPurchasePayments(purchase.id);
  };

  const resetPaymentForm = () => {
    setSelectedPurchase(null);
    setPaymentAmount('');
    setPaymentMethod('cash');
    setReferenceNumber('');
    setCheckNumber('');
    setBankName('');
    setAccountNumber('');
    setPaymentNotes('');
    setPaymentDate(new Date().toISOString().split('T')[0]);
  };

  const handleSubmitPayment = async () => {
    if (!selectedPurchase) return;
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid payment amount');
      return;
    }
    if (amount > selectedPurchase.remainingBalance) {
      alert(`Payment amount cannot exceed remaining balance of ${formatCurrency(selectedPurchase.remainingBalance)}`);
      return;
    }

    setProcessing(true);
    try {
      // Get supplier info
      const supplier = suppliers.find(s => s.id === selectedPurchase.supplierId);
      
      const paymentData = {
        purchaseId: selectedPurchase.id,
        supplierId: selectedPurchase.supplierId,
        supplierName: selectedPurchase.supplierName,
        companyName: supplier?.companyName || '',
        amount,
        paymentMethod,
        referenceNumber: referenceNumber || undefined,
        checkNumber: checkNumber || undefined,
        bankName: bankName || undefined,
        accountNumber: accountNumber || undefined,
        notes: paymentNotes || undefined,
        paymentDate,
      };

      window.electron.ipcRenderer.once('payment-create-reply' as any, (response: any) => {
        setProcessing(false);
        if (response.success) {
          resetPaymentForm();
          loadAllData();
          alert('Payment recorded successfully!');
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


      {/* Date Selection - Prominent */}
      <div className="bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md p-3 mb-2 flex-shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-4">
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
            <button
              onClick={() => {
                setShowDatePicker(!showDatePicker);
                if (!showDatePicker) {
                  setPeriodType('custom');
                  if (!customFromDate || !customToDate) {
                    const today = new Date();
                    const lastMonth = new Date();
                    lastMonth.setMonth(lastMonth.getMonth() - 1);
                    setCustomFromDate(lastMonth.toISOString().split('T')[0]);
                    setCustomToDate(today.toISOString().split('T')[0]);
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
        
        {/* Custom Date Picker */}
        {showDatePicker && periodType === 'custom' && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">From:</label>
              <input
                type="date"
                value={customFromDate}
                onChange={(e) => setCustomFromDate(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white dark:bg-gray-700"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">To:</label>
              <input
                type="date"
                value={customToDate}
                onChange={(e) => setCustomToDate(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white dark:bg-gray-700"
              />
            </div>
            <button
              onClick={() => setShowDatePicker(false)}
              className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              <FiX className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Other Filters */}
      <div className="flex flex-wrap gap-3 items-center bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search supplier, PO#, reference..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white dark:bg-gray-700"
            />
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <FiFilter className="w-4 h-4 text-gray-400" />
          <select
            value={selectedSupplierId || ''}
            onChange={(e) => setSelectedSupplierId(e.target.value ? parseInt(e.target.value) : null)}
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white dark:bg-gray-700 min-w-[180px]"
          >
            <option value="">All Suppliers</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} {s.companyName ? `(${s.companyName})` : ''}
              </option>
            ))}
          </select>
        </div>
        
        {activeTab === 'records' && (
          <select
            value={selectedPaymentMethod || ''}
            onChange={(e) => setSelectedPaymentMethod(e.target.value as PaymentMethod || null)}
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white dark:bg-gray-700"
          >
            <option value="">All Methods</option>
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="check">Check</option>
            <option value="online">Online</option>
          </select>
        )}
      </div>

      {/* Make Payments Tab */}
      {activeTab === 'payments' && (
        <>
          {/* Status Filter Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setPurchaseFilter('all')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                purchaseFilter === 'all'
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              All ({purchases.length})
            </button>
            <button
              onClick={() => setPurchaseFilter('pending')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                purchaseFilter === 'pending'
                  ? 'bg-orange-600 text-white'
                  : 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-900/50'
              }`}
            >
              Pending ({totalStats.pendingCount})
            </button>
            <button
              onClick={() => setPurchaseFilter('paid')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                purchaseFilter === 'paid'
                  ? 'bg-green-600 text-white'
                  : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
              }`}
            >
              Fully Paid ({totalStats.paidCount})
            </button>
          </div>

          {/* Purchases Table */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-3 text-gray-500 dark:text-gray-400">
                  <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm font-medium">Loading purchases...</span>
                </div>
              </div>
            ) : filteredPurchases.length === 0 ? (
              <div className="p-12 text-center">
                <FiCreditCard className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 dark:text-gray-400 font-medium">No purchases found</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                  {purchaseFilter === 'pending' ? 'All purchases are fully paid' : purchaseFilter === 'paid' ? 'No fully paid purchases yet' : 'No purchases recorded yet'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">PO #</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Supplier</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Grand Total</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Paid</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Remaining</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredPurchases.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white">PO-{p.id}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{p.supplierName}</td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-white">{formatCurrency(p.grandTotal)}</td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-emerald-600 dark:text-emerald-400">{formatCurrency(p.paymentAmount)}</td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-orange-600 dark:text-orange-400">{formatCurrency(p.remainingBalance)}</td>
                        <td className="px-4 py-3 text-center">
                          {p.remainingBalance <= 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                              <FiCheck className="w-3 h-3" /> Paid
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
                              <FiAlertCircle className="w-3 h-3" /> Pending
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{formatDate(p.createdAt)}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleViewPaymentHistory(p)}
                              className="inline-flex items-center justify-center w-8 h-8 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                              title="View Payment History"
                            >
                              <FiEye className="w-4 h-4" />
                            </button>
                            {p.remainingBalance > 0 && (
                              <button
                                onClick={() => handleMakePayment(p)}
                                className="inline-flex items-center justify-center w-8 h-8 text-white bg-emerald-600 dark:bg-emerald-500 rounded-lg hover:bg-emerald-700 dark:hover:bg-emerald-600"
                                title="Make Payment"
                              >
                                <FiPlus className="w-4 h-4" />
                              </button>
                            )}
                            {isToday(p.createdAt) && (
                              <button
                                onClick={() => setDeleteConfirm(p.id)}
                                className="inline-flex items-center justify-center w-8 h-8 text-white bg-red-600 dark:bg-red-500 rounded-lg hover:bg-red-700 dark:hover:bg-red-600"
                                title="Delete Purchase (Today Only)"
                              >
                                <FiTrash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Payment Records Tab */}
      {activeTab === 'records' && (
        <div className="space-y-4">
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
                Payment records will appear here when you make payments
              </p>
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
        <div className="space-y-3">
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

      {/* Payment Modal */}
          {selectedPurchase && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Record Payment</h3>
                <button
                  onClick={resetPaymentForm}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <FiX className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                PO-{selectedPurchase.id} • {selectedPurchase.supplierName}
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Purchase Summary */}
              <div className="grid grid-cols-3 gap-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                  <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Grand Total</div>
                  <div className="font-semibold text-gray-900 dark:text-white">{formatCurrency(selectedPurchase.grandTotal)}</div>
                  </div>
                    <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Already Paid</div>
                  <div className="font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(selectedPurchase.paymentAmount)}</div>
                    </div>
                    <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Remaining</div>
                  <div className="font-bold text-orange-600 dark:text-orange-400">{formatCurrency(selectedPurchase.remainingBalance)}</div>
                    </div>
                    </div>

              {/* Payment Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Payment Date</label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white dark:bg-gray-700"
                />
                  </div>

              {/* Payment Amount */}
                  <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Payment Amount</label>
                    <input
                      type="number"
                      min="0"
                      max={selectedPurchase.remainingBalance}
                      step="0.01"
                      value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                      placeholder="0.00"
                  className="w-full px-4 py-2.5 text-lg font-semibold border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white dark:bg-gray-700"
                    />
                    <button
                      type="button"
                      onClick={() => setPaymentAmount(selectedPurchase.remainingBalance.toString())}
                      className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 font-medium"
                    >
                  Pay Full Amount ({formatCurrency(selectedPurchase.remainingBalance)})
                    </button>
                  </div>

              {/* Payment Method */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Payment Method</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['cash', 'bank_transfer', 'check', 'online'] as PaymentMethod[]).map((method) => {
                    const colors = getPaymentMethodColor(method);
                    return (
                    <button
                        key={method}
                        onClick={() => setPaymentMethod(method)}
                        className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                          paymentMethod === method
                            ? `${colors.bg} ${colors.text} ${colors.border} ring-2 ring-offset-2 ring-emerald-500`
                            : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                        }`}
                      >
                        {getPaymentMethodLabel(method)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Conditional Fields based on Payment Method */}
              {paymentMethod === 'check' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Check Number</label>
                    <input
                      type="text"
                      value={checkNumber}
                      onChange={(e) => setCheckNumber(e.target.value)}
                      placeholder="Enter check number"
                      className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white dark:bg-gray-700"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bank Name</label>
                    <input
                      type="text"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      placeholder="Enter bank name"
                      className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white dark:bg-gray-700"
                    />
                  </div>
                </div>
              )}

              {paymentMethod === 'bank_transfer' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reference Number</label>
                    <input
                      type="text"
                      value={referenceNumber}
                      onChange={(e) => setReferenceNumber(e.target.value)}
                      placeholder="Transaction reference"
                      className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white dark:bg-gray-700"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bank / Account</label>
                    <input
                      type="text"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      placeholder="Bank name or account"
                      className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white dark:bg-gray-700"
                    />
                  </div>
                </div>
              )}

              {paymentMethod === 'online' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Transaction Reference</label>
                  <input
                    type="text"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder="Online transaction ID"
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white dark:bg-gray-700"
                  />
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes (Optional)</label>
                <textarea
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="Add any additional notes..."
                  rows={2}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white dark:bg-gray-700 resize-none"
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex gap-3">
              <button
                onClick={resetPaymentForm}
                className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSubmitPayment}
                      disabled={processing || !paymentAmount || parseFloat(paymentAmount) <= 0}
                className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
                    >
                      {processing ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Processing...
                        </>
                      ) : (
                  <>
                    <FiCheck className="w-4 h-4" />
                    Record Payment
                  </>
                      )}
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
              {purchasePayments.length === 0 ? (
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

            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-between">
              <button
                onClick={() => {
                  setViewPaymentHistory(null);
                  setPurchasePayments([]);
                }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
              >
                Close
              </button>
              {viewPaymentHistory.remainingBalance > 0 && (
                <button
                  onClick={() => {
                    handleMakePayment(viewPaymentHistory);
                    setViewPaymentHistory(null);
                    setPurchasePayments([]);
                  }}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium flex items-center gap-2"
                >
                  <FiPlus className="w-4 h-4" />
                  Add Payment
                </button>
              )}
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
                      onChange={(e) => setExportFromDate(e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white dark:bg-gray-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">To Date</label>
                    <input
                      type="date"
                      value={exportToDate}
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
                          setShowExportDialog(false);
                          alert('Payment records exported successfully!');
                        } else if (response.error !== 'canceled') {
                          alert('Error exporting: ' + (response.error || 'Unknown error'));
                        }
                      });
                      window.electron.ipcRenderer.sendMessage('payment-export-pdf', [filters, pharmacySettings]);
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
    </div>
  );
};

export default Payments;
