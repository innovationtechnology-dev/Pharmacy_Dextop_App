'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FiPackage, FiSearch, FiX, FiMinus, FiRefreshCw, FiMaximize2, FiClock, FiCalendar, FiChevronRight, FiAlertCircle, FiCreditCard, FiFileText, FiChevronDown, FiTrash2, FiChevronLeft } from 'react-icons/fi';
import { FaPlus, FaTrashAlt, FaDollarSign, FaCheck, FaPercent, FaList, FaEdit, FaEye } from 'react-icons/fa';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useDashboardHeader } from './useDashboardHeader';
import { PharmacySettings, getStoredPharmacySettings } from '../../types/pharmacy';
import { useToast, ToastContainer } from '../../components/common/Toast';
import { currencySymbols, getCurrencySymbol as getSymbol } from '../../../common/currency';
import { getAuthUser } from '../../utils/auth';

type MedicineStatus = 'active' | 'inactive' | 'discontinued';

interface Medicine {
  id: number;
  barcode?: string;
  name: string;
  pillQuantity: number;
  status: MedicineStatus;
  sellablePills?: number;
  totalAvailablePills?: number;
}

interface Supplier {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  contactPerson?: string;
  company?: string;
  companyName?: string;
}

const MIN_EXPIRY_DAYS = 90;

interface PurchaseItem {
  medicine: Medicine;
  packetQuantity: number;
  pillsPerPacket: number;
  totalPills: number;
  totalAmount: number; // NEW: Total amount paid for all packets
  pricePerPacket: number; // Calculated from totalAmount
  pricePerPill: number; // Calculated from totalAmount
  discount: number;
  tax: number;
  discountAmount?: number;
  taxAmount?: number;
  expiryDate: string;
  lineSubtotal: number;
  lineTotal: number;
}

const recalculatePurchaseItem = (item: PurchaseItem): PurchaseItem => {
  const packetQuantity = Math.max(0, item.packetQuantity || 0);
  const pillsPerPacket = Math.max(1, item.pillsPerPacket || 1);
  const totalAmount = Math.max(0, item.totalAmount || 0);
  const discountPercent = Math.min(Math.max(item.discount || 0, 0), 100);
  const taxPercent = Math.min(Math.max(item.tax || 0, 0), 100);
  
  // Calculate price per packet from total amount
  const pricePerPacket = packetQuantity > 0 ? totalAmount / packetQuantity : 0;
  
  const totalPills = packetQuantity * pillsPerPacket;
  const pricePerPill = totalPills > 0 ? totalAmount / totalPills : 0;
  
  // Line subtotal is the total amount entered
  const lineSubtotal = totalAmount;
  const discountAmount = (lineSubtotal * discountPercent) / 100;
  const taxableBase = lineSubtotal - discountAmount;
  const taxAmount = (taxableBase * taxPercent) / 100;
  const lineTotal = taxableBase + taxAmount;

  return {
    ...item,
    packetQuantity,
    pillsPerPacket,
    totalAmount,
    pricePerPacket,
    discount: discountPercent,
    tax: taxPercent,
    totalPills,
    pricePerPill,
    lineSubtotal,
    discountAmount,
    taxAmount,
    lineTotal,
  };
};

const PurchasingPanel: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toasts, removeToast, success, error, warning, info } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [cart, setCart] = useState<PurchaseItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [showAddMedicineModal, setShowAddMedicineModal] = useState(false);
  const [barcodeScanMode, setBarcodeScanMode] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showValidationError, setShowValidationError] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer' | 'check' | 'online'>('cash');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const today = useMemo(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }, []);

  const [paymentDate, setPaymentDate] = useState<string>(today);
  const [paymentNotes, setPaymentNotes] = useState('');
  const [pastPurchases, setPastPurchases] = useState<any[]>([]);
  const [loadingPurchases, setLoadingPurchases] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [viewPurchase, setViewPurchase] = useState<any | null>(null);
  const [editingPurchaseId, setEditingPurchaseId] = useState<number | null>(null);
  const [purchaseHistoryList, setPurchaseHistoryList] = useState<any[]>([]);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<number | null>(null);
  const [currentPurchaseIndex, setCurrentPurchaseIndex] = useState<number>(-1);
  const [showPaymentSection, setShowPaymentSection] = useState(false);
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>(() => {
    const now = new Date();
    return now.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  });
  const [currentTime, setCurrentTime] = useState<string>(() => {
    const now = new Date();
    return now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  });
  
  const isCashier = getAuthUser()?.role === 'cashier';

  // Update time every minute
  useEffect(() => {
    if (selectedPurchaseId !== null) return; // Don't update if viewing a specific purchase

    const interval = setInterval(() => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
        })
      );
    }, 60000);
    return () => clearInterval(interval);
  }, [selectedPurchaseId]);
  const [pharmacySettings] = useState<PharmacySettings>(() => getStoredPharmacySettings());
  
  const selectedPurchase = useMemo(() => {
    if (selectedPurchaseId === null) return null;
    return purchaseHistoryList.find(p => p.id === selectedPurchaseId);
  }, [selectedPurchaseId, purchaseHistoryList]);

  const isSelectedUpdate = selectedPurchase?.updatedAt && selectedPurchase?.updatedAt !== selectedPurchase?.createdAt;

  const { setHeader, refreshExpiringAlerts } = useDashboardHeader();

  const searchInputRef = useRef<HTMLInputElement>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const minExpiryDate = useMemo(() => {
    const min = new Date();
    min.setDate(min.getDate() + MIN_EXPIRY_DAYS);
    return min.toISOString().split('T')[0];
  }, []);

  const isExpiryValid = useCallback((value: string) => {
    const expDate = new Date(value);
    if (Number.isNaN(expDate.getTime())) {
      return false;
    }
    const min = new Date();
    min.setDate(min.getDate() + MIN_EXPIRY_DAYS);
    return expDate >= min;
  }, []);

  const barcodeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const globalBarcodeBufferRef = useRef<string>('');
  const globalBarcodeTimerRef = useRef<NodeJS.Timeout | null>(null);

  const loadMedicines = useCallback(async () => {
    try {
      window.electron.ipcRenderer.once('medicine-get-all-reply', (response: any) => {
        if (response.success) {
          setMedicines(response.data || []);
        }
      });
      window.electron.ipcRenderer.sendMessage('medicine-get-all', []);
    } catch (error) {
      console.error('Error loading medicines:', error);
    }
  }, []);

  const loadSuppliers = useCallback(async () => {
    try {
      window.electron.ipcRenderer.once('supplier-get-all-reply', (response: any) => {
        if (response.success) {
          setSuppliers(response.data || []);
        }
      });
      window.electron.ipcRenderer.sendMessage('supplier-get-all', []);
    } catch (error) {
      console.error('Error loading suppliers:', error);
    }
  }, []);

  useEffect(() => {
    loadMedicines();
    loadSuppliers();
  }, [loadMedicines, loadSuppliers]);

  // Reload suppliers when navigating back to this page
  useEffect(() => {
    if (location.pathname === '/purchasing-panel') {
      loadSuppliers();
    }
  }, [location.pathname, loadSuppliers]);

  // Ensure supplier is loaded when selectedSupplierId changes
  useEffect(() => {
    if (selectedSupplierId) {
      setSuppliers(currentSuppliers => {
        const supplierExists = currentSuppliers.find(s => s.id === selectedSupplierId);
        if (!supplierExists && currentSuppliers.length >= 0) {
          // Supplier not in list, fetch it
          window.electron.ipcRenderer.once('supplier-get-by-id-reply', (response: any) => {
            if (response.success && response.data) {
              setSuppliers(prev => {
                const exists = prev.find(s => s.id === response.data.id);
                if (!exists) {
                  return [...prev, response.data];
                }
                return prev;
              });
            }
          });
          window.electron.ipcRenderer.sendMessage('supplier-get-by-id', [selectedSupplierId]);
        }
        return currentSuppliers;
      });
    }
  }, [selectedSupplierId]);

  const handleSearch = useCallback(async (term: string) => {
    if (!term || term.trim().length === 0) {
      setShowSearchResults(false);
      return;
    }

    setIsSearching(true);
    setShowSearchResults(true);

    try {
      window.electron.ipcRenderer.once('medicine-search-reply', (response: any) => {
        setIsSearching(false);
        if (response.success) {
          setMedicines(response.data || []);
        }
      });
      window.electron.ipcRenderer.sendMessage('medicine-search', [term.trim()]);
    } catch (error) {
      console.error('Error searching medicines:', error);
      setIsSearching(false);
    }
  }, []);

  const addToCart = useCallback((medicine: Medicine) => {
    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.medicine.id === medicine.id);

      if (existingItem) {
        const updatedItem = recalculatePurchaseItem({
          ...existingItem,
          packetQuantity: existingItem.packetQuantity + 1,
        });
        return prevCart.map((item) =>
          item.medicine.id === medicine.id ? updatedItem : item
        );
      }

      const baseItem: PurchaseItem = recalculatePurchaseItem({
        medicine,
        packetQuantity: 1,
        pillsPerPacket: medicine.pillQuantity || 1,
        totalPills: 0,
        totalAmount: 0,
        pricePerPacket: 0,
        pricePerPill: 0,
        discount: 0,
        tax: 0,
        expiryDate: '',
        lineSubtotal: 0,
        lineTotal: 0,
      });

      return [...prevCart, baseItem];
    });

    setShowAddMedicineModal(false);
    setSearchTerm('');
    setShowSearchResults(false);
  }, []);

  const handleBarcodeScan = useCallback(
    (code: string) => {
      const normalized = code.trim();
      if (!normalized) return;

      const medicine = medicines.find(
        (item) => item.barcode?.toLowerCase() === normalized.toLowerCase()
      );

      if (!medicine) {
        error(`Medicine with barcode "${normalized}" not found!`);
        return;
      }

      addToCart(medicine);
      setBarcodeScanMode(false);
      setBarcodeInput('');
    },
    [medicines, addToCart]
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    handleSearch(value);
  };

  const updateCartItemField = useCallback(
    (medicineId: number, field: keyof PurchaseItem, value: any) => {
      setCart((prevCart) =>
        prevCart.map((item) => {
          if (item.medicine.id !== medicineId) {
            return item;
          }
          return recalculatePurchaseItem({
            ...item,
            [field]: value,
          });
        })
      );
    },
    []
  );

  const adjustPacketQuantity = (medicineId: number, delta: number) => {
    setCart((prevCart) =>
      prevCart
        .map((item) => {
          if (item.medicine.id !== medicineId) {
            return item;
          }
          const nextQuantity = Math.max(0, item.packetQuantity + delta);
          if (nextQuantity === 0) {
            return null;
          }
          return recalculatePurchaseItem({
            ...item,
            packetQuantity: nextQuantity,
          });
        })
        .filter((item): item is PurchaseItem => item !== null)
    );
  };

  const removeFromCart = (medicineId: number) => {
    setCart((prevCart) => prevCart.filter((item) => item.medicine.id !== medicineId));
  };

  const calculateSubtotal = () =>
    cart.reduce((sum, item) => sum + item.lineSubtotal, 0);

  const calculateDiscountTotal = () =>
    cart.reduce((sum, item) => sum + (item.discountAmount || 0), 0);

  const calculateTaxTotal = () =>
    cart.reduce((sum, item) => sum + (item.taxAmount || 0), 0);

  const calculateGrandTotal = () =>
    calculateSubtotal() - calculateDiscountTotal() + calculateTaxTotal();

  const handlePurchase = async () => {
    if (cart.length === 0) {
      setValidationMessage('Cart is empty! Please add items to purchase.');
      setShowValidationError(true);
      setTimeout(() => {
        setShowValidationError(false);
      }, 3000);
      return;
    }

    if (!selectedSupplierId) {
      setValidationMessage('Please select a supplier!');
      setShowValidationError(true);
      setTimeout(() => {
        setShowValidationError(false);
      }, 3000);
      return;
    }

    const selectedSupplier = suppliers.find((s) => s.id === selectedSupplierId);
    if (!selectedSupplier) {
      error('Selected supplier not found!');
      return;
    }

    setProcessing(true);

    try {
      if (cart.some((item) => !item.expiryDate)) {
        warning('Please set an expiry date for every medicine in the purchase.');
        setProcessing(false);
        return;
      }

      for (const item of cart) {
        if (!isExpiryValid(item.expiryDate)) {
          warning(
            `"${item.medicine.name}" must have an expiry date at least ${Math.round(
              MIN_EXPIRY_DAYS / 30
            )} months from today.`
          );
          setProcessing(false);
          return;
        }
      }

      const subtotal = calculateSubtotal();
      const discountTotal = calculateDiscountTotal();
      const taxTotal = calculateTaxTotal();
      const total = calculateGrandTotal();

      // Validate payment amount
      if (paymentAmount < 0) {
        error('Payment amount cannot be negative');
        setProcessing(false);
        return;
      }
      if (paymentAmount > total) {
        error(`Payment amount (${paymentAmount.toFixed(2)}) cannot be greater than grand total (${total.toFixed(2)})`);
        setProcessing(false);
        return;
      }

      const purchasePayload = {
        supplierId: selectedSupplierId,
        supplierName: selectedSupplier.name,
        items: cart.map((item) => ({
          medicineId: item.medicine.id,
          medicineName: item.medicine.name,
          packetQuantity: item.packetQuantity,
          pillsPerPacket: item.pillsPerPacket,
          pricePerPacket: item.pricePerPacket,
          discountAmount: item.discountAmount || 0,
          taxAmount: item.taxAmount || 0,
          expiryDate: item.expiryDate,
        })),
        paymentAmount: paymentAmount || 0,
        notes: notes || undefined,
        // Payment details for creating payment record
        paymentDetails: paymentAmount > 0 ? {
          paymentMethod: paymentMethod,
          referenceNumber: referenceNumber || undefined,
          checkNumber: checkNumber || undefined,
          bankName: bankName || undefined,
          accountNumber: accountNumber || undefined,
          paymentDate: paymentDate,
          notes: paymentNotes || undefined,
        } : undefined,
      };

      if (editingPurchaseId) {
        // Update existing purchase
        window.electron.ipcRenderer.once('purchase-update-reply', (response: any) => {
          setProcessing(false);
          if (response.success) {
            setShowSuccess(true);
            setCart([]);
            setSelectedSupplierId(null);
            setNotes('');
            setPaymentAmount(0);
            setPaymentMethod('cash');
            setReferenceNumber('');
            setCheckNumber('');
            setBankName('');
            setAccountNumber('');
            setPaymentDate(new Date().toISOString().split('T')[0]);
            setPaymentNotes('');
            setEditingPurchaseId(null);
            setSearchTerm('');
            loadMedicines(); // Reload medicines to update quantities
            refreshExpiringAlerts();
            loadPastPurchases();

            setTimeout(() => {
              setShowSuccess(false);
            }, 2000);
          } else {
            error('Error updating purchase: ' + (response.error || 'Unknown error'));
          }
        });

        window.electron.ipcRenderer.sendMessage('purchase-update', [editingPurchaseId, purchasePayload]);
      } else {
        // Create new purchase
        window.electron.ipcRenderer.once('purchase-create-reply', (response: any) => {
          setProcessing(false);
          if (response.success) {
            setShowSuccess(true);
            setCart([]);
            setSelectedSupplierId(null);
            setNotes('');
            setPaymentAmount(0);
            setPaymentMethod('cash');
            setReferenceNumber('');
            setCheckNumber('');
            setBankName('');
            setAccountNumber('');
            setPaymentDate(new Date().toISOString().split('T')[0]);
            setPaymentNotes('');
            setSearchTerm('');
            loadMedicines(); // Reload medicines to update quantities
            refreshExpiringAlerts();
            loadPastPurchases(); // Reload purchase history

            setTimeout(() => {
              setShowSuccess(false);
            }, 2000);
          } else {
            error('Error processing purchase: ' + (response.error || 'Unknown error'));
          }
        });

        window.electron.ipcRenderer.sendMessage('purchase-create', [purchasePayload]);
      }
    } catch (err) {
      console.error('Error processing purchase:', err);
      setProcessing(false);
      error('Error processing purchase. Please try again.');
    }
  };

  const clearForm = useCallback(() => {
    setCart([]);
    setSelectedSupplierId(null);
    setNotes('');
    setPaymentAmount(0);
    setPaymentMethod('cash');
    setReferenceNumber('');
    setCheckNumber('');
    setBankName('');
    setAccountNumber('');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentNotes('');
    setEditingPurchaseId(null);
    setSelectedPurchaseId(null);
    setCurrentPurchaseIndex(-1);
    setPurchaseOrderNumber('');
    
    const now = new Date();
    setCurrentDate(now.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }));
    setCurrentTime(now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    }));
  }, []);

  const handleReset = useCallback(() => {
    if (window.confirm('Are you sure you want to reset the form? All data will be cleared.')) {
      clearForm();
    }
  }, [clearForm]);

  const openAddMedicineModal = useCallback(() => {
    setShowAddMedicineModal(true);
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
  }, []);

  const loadPastPurchases = useCallback(async () => {
    setLoadingPurchases(true);
    try {
      window.electron.ipcRenderer.once('purchase-get-all-reply', (response: any) => {
        setLoadingPurchases(false);
        if (response.success) {
          let purchases = response.data || [];
          // Sort by date descending (newest first)
          purchases.sort((a: any, b: any) => {
            const dateA = new Date(a.createdAt || 0).getTime();
            const dateB = new Date(b.createdAt || 0).getTime();
            return dateB - dateA;
          });
          setPastPurchases(purchases);
          setPurchaseHistoryList(purchases);
        }
      });
      window.electron.ipcRenderer.sendMessage('purchase-get-all', []);
    } catch (err) {
      setLoadingPurchases(false);
    }
  }, []);

  const handleDeletePurchase = async (purchaseId: number) => {
    if (!window.confirm(`Are you sure you want to delete purchase PO-${purchaseId}? This action cannot be undone.`)) {
      return;
    }

    try {
      window.electron.ipcRenderer.once('purchase-delete-reply', (response: any) => {
        setDeleteConfirm(null);
        if (response.success) {
          loadPastPurchases();
          success('Purchase deleted successfully!');
        } else {
          error('Error deleting purchase: ' + (response.error || 'Unknown error'));
        }
      });
      window.electron.ipcRenderer.sendMessage('purchase-delete', [purchaseId]);
    } catch (err) {
      setDeleteConfirm(null);
      error('Error deleting purchase. Please try again.');
    }
  };


  const formatCurrency = (value: number) => {
    const currency = pharmacySettings.currency || 'USD';
    const symbol = getSymbol(currency);
    return `${symbol}${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (value?: string) =>
    value ? new Date(value).toLocaleDateString() : '—';

  const isWithin24Hours = (dateString?: string): boolean => {
    if (!dateString) return true;
    const purchaseDate = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - purchaseDate.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    return diffHours <= 24;
  };

  const loadPurchaseForEdit = useCallback(async (purchaseId: number) => {
    try {
      // Ensure suppliers are loaded first
      loadSuppliers();

      window.electron.ipcRenderer.once('purchase-get-by-id-reply', (response: any) => {
        if (response.success && response.data) {
          const purchase = response.data;
          // Load purchase data into form
          setSelectedSupplierId(purchase.supplierId);
          setNotes(purchase.notes || '');
          setPaymentAmount(purchase.paymentAmount || 0);

          // Convert purchase items to cart format
          const cartItems: PurchaseItem[] = purchase.items.map((item: any) => {
            const lineSubtotal = item.lineSubtotal || (item.packetQuantity * item.pricePerPacket);
            const discountAmount = item.discountAmount || 0;
            const taxAmount = item.taxAmount || 0;
            const taxableBase = lineSubtotal - discountAmount;

            // Calculate discount percentage
            const discountPercent = lineSubtotal > 0 ? (discountAmount / lineSubtotal) * 100 : 0;

            // Calculate tax percentage (tax is applied to taxable base after discount)
            const taxPercent = taxableBase > 0 ? (taxAmount / taxableBase) * 100 : 0;

            // Calculate totalAmount from existing data
            // For old purchases, totalAmount = packetQuantity * pricePerPacket
            const totalAmount = item.totalAmount || (item.packetQuantity * item.pricePerPacket);

            return recalculatePurchaseItem({
              medicine: {
                id: item.medicineId,
                name: item.medicineName,
                barcode: '',
                pillQuantity: item.pillsPerPacket,
                status: 'active' as MedicineStatus,
                totalAvailablePills: item.availablePills || item.totalPills,
              },
              packetQuantity: item.packetQuantity,
              pillsPerPacket: item.pillsPerPacket,
              totalAmount: totalAmount,
              pricePerPacket: item.pricePerPacket,
              discount: discountPercent,
              tax: taxPercent,
              expiryDate: item.expiryDate,
              totalPills: item.totalPills,
              pricePerPill: item.pricePerPill,
              lineSubtotal: lineSubtotal,
              lineTotal: item.lineTotal,
            });
          });

          setCart(cartItems);
          setEditingPurchaseId(purchaseId);
        } else {
          error('Failed to load purchase: ' + (response.error || 'Unknown error'));
        }
      });
      window.electron.ipcRenderer.sendMessage('purchase-get-by-id', [purchaseId]);
    } catch (err) {
      error('Error loading purchase. Please try again.');
    }
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingPurchaseId(null);
    setCart([]);
    setSelectedSupplierId(null);
    setNotes('');
    setPaymentAmount(0);
  }, []);

  // Load purchase history on mount
  useEffect(() => {
    loadPastPurchases();
  }, [loadPastPurchases]);

  // Load purchase details when selected
  const loadPurchaseDetails = useCallback((purchase: any, index: number) => {
    setSelectedPurchaseId(purchase.id);
    setCurrentPurchaseIndex(index);
    setPurchaseOrderNumber(`PO-${purchase.id}`);
    
    // Use updatedAt if available, otherwise createdAt
    const dateToUse = purchase.updatedAt || purchase.createdAt;
    
    if (dateToUse) {
      const dbDate = new Date(dateToUse);
      const formattedDate = dbDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
      const formattedTime = dbDate.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
      setCurrentDate(formattedDate);
      setCurrentTime(formattedTime);
    }
    
    // Reload suppliers to ensure they're up to date
    loadSuppliers();
    loadPurchaseForEdit(purchase.id);
  }, [loadPurchaseForEdit, loadSuppliers]);

  // Navigate to previous/next purchase
  const navigateToPreviousPurchase = useCallback(() => {
    if (currentPurchaseIndex < purchaseHistoryList.length - 1) {
      const nextIndex = currentPurchaseIndex + 1;
      const purchase = purchaseHistoryList[nextIndex];
      loadPurchaseDetails(purchase, nextIndex);
    }
  }, [currentPurchaseIndex, purchaseHistoryList, loadPurchaseDetails]);

  const navigateToNextPurchase = useCallback(() => {
    if (currentPurchaseIndex > 0) {
      const prevIndex = currentPurchaseIndex - 1;
      const purchase = purchaseHistoryList[prevIndex];
      loadPurchaseDetails(purchase, prevIndex);
    }
  }, [currentPurchaseIndex, purchaseHistoryList, loadPurchaseDetails]);

  useEffect(() => {
    setHeader({
      title: 'Purchasing Panel',
      subtitle: 'Create purchase orders and restock inventory',
      actions: null,
    });

    return () => setHeader(null);
  }, [setHeader]);

  const selectedSupplier = suppliers.find((s) => s.id === selectedSupplierId);
  const subtotal = calculateSubtotal();
  const discountTotal = calculateDiscountTotal();
  const taxTotal = calculateTaxTotal();
  const grandTotal = calculateGrandTotal();

  useEffect(() => {
    if (barcodeScanMode) {
      const timeout = setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timeout);
    }
    setBarcodeInput('');
    return undefined;
  }, [barcodeScanMode]);

  useEffect(() => {
    if (barcodeScanMode && barcodeInput.length > 0) {
      if (barcodeTimeoutRef.current) {
        clearTimeout(barcodeTimeoutRef.current);
      }
      barcodeTimeoutRef.current = setTimeout(() => {
        if (barcodeInput.trim().length > 0) {
          handleBarcodeScan(barcodeInput);
        }
      }, 200);
    }

    return () => {
      if (barcodeTimeoutRef.current) {
        clearTimeout(barcodeTimeoutRef.current);
      }
    };
  }, [barcodeInput, barcodeScanMode, handleBarcodeScan]);

  useEffect(() => {
    const MIN_BARCODE_LENGTH = 4;

    const handleGlobalKeydown = (event: KeyboardEvent) => {
      if (barcodeScanMode) return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isEditable =
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        target?.isContentEditable;

      if (isEditable) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key === 'Enter') {
        if (globalBarcodeBufferRef.current.length >= MIN_BARCODE_LENGTH) {
          const barcodeValue = globalBarcodeBufferRef.current;
          globalBarcodeBufferRef.current = '';
          handleBarcodeScan(barcodeValue);
        } else {
          globalBarcodeBufferRef.current = '';
        }
        event.preventDefault();
        return;
      }

      if (event.key.length === 1) {
        globalBarcodeBufferRef.current += event.key;
        if (globalBarcodeTimerRef.current) {
          clearTimeout(globalBarcodeTimerRef.current);
        }
        globalBarcodeTimerRef.current = setTimeout(() => {
          if (globalBarcodeBufferRef.current.length >= MIN_BARCODE_LENGTH) {
            const barcodeValue = globalBarcodeBufferRef.current;
            globalBarcodeBufferRef.current = '';
            handleBarcodeScan(barcodeValue);
          } else {
            globalBarcodeBufferRef.current = '';
          }
        }, 120);
      }
    };

    window.addEventListener('keydown', handleGlobalKeydown);

    return () => {
      window.removeEventListener('keydown', handleGlobalKeydown);
      if (globalBarcodeTimerRef.current) {
        clearTimeout(globalBarcodeTimerRef.current);
      }
      globalBarcodeBufferRef.current = '';
    };
  }, [barcodeScanMode, handleBarcodeScan]);

  const currencyCode = pharmacySettings.currency || 'USD';
  const symbol = getSymbol(currencyCode);

  return (
    <div className="h-[calc(100vh-80px)] w-full bg-gradient-to-br from-gray-50 via-gray-50 to-gray-100/50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800/80 overflow-hidden flex flex-col p-2">
      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
      
      {/* Success Message */}
      {showSuccess && (
        <div className="fixed top-4 right-4 z-50 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm animate-slideInRight">
          <FaCheck className="w-4 h-4" />
          <span className="font-medium">Purchase completed successfully!</span>
        </div>
      )}

      {/* Validation Error Message */}
      {showValidationError && (
        <div className="fixed top-4 right-4 z-50 bg-orange-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm animate-slideInRight">
          <FiAlertCircle className="w-4 h-4" />
          <span className="font-medium">{validationMessage}</span>
        </div>
      )}

      {/* Add Medicine Modal */}
      {showAddMedicineModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Add Medicine to Purchase</h2>
                <button
                  onClick={() => {
                    setShowAddMedicineModal(false);
                    setSearchTerm('');
                    setShowSearchResults(false);
                  }}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 dark:hover:bg-gray-600 dark:bg-gray-700 rounded-lg transition-colors"
                >
                  <FiX className="w-6 h-6 text-gray-600 dark:text-gray-400 dark:text-gray-500" />
                </button>
              </div>
            </div>
            <div className="p-6 flex-1 overflow-y-auto">
              <div className="relative mb-4">
                <FiSearch className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  onChange={handleSearchChange}
                  onFocus={() => setShowSearchResults(true)}
                  placeholder="Search medicines by name, barcode, or description..."
                  className="w-full pl-12 pr-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  autoFocus
                />
                {isSearching && (
                  <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
                    <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
              </div>

              {/* Search Results */}
              {showSearchResults && searchTerm && medicines.length > 0 && (
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg max-h-96 overflow-y-auto">
                  {medicines.map((medicine) => (
                    <div
                      key={medicine.id}
                      className="p-4 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 dark:hover:bg-gray-600 dark:bg-gray-700/50 cursor-pointer transition-colors"
                      onClick={() => addToCart(medicine)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900 dark:text-white">{medicine.name}</h3>
                          {medicine.barcode && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">Barcode: {medicine.barcode}</p>
                          )}
                          <div className="flex items-center gap-4 mt-2">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-500">
                              Pills / Packet: {medicine.pillQuantity}
                            </span>
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                              Available Pills: {(medicine.totalAvailablePills ?? 0).toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            addToCart(medicine);
                          }}
                          className="ml-4 px-4 py-2 bg-emerald-600 dark:bg-emerald-500 text-white rounded-lg hover:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors flex items-center gap-2"
                        >
                          <FaPlus className="w-4 h-4" />
                          Add
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {showSearchResults && searchTerm && !isSearching && medicines.length === 0 && (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400 dark:text-gray-500">
                  <FiPackage className="w-16 h-16 mx-auto mb-3 text-gray-300 dark:text-gray-500" />
                  <p>No medicines found matching "{searchTerm}"</p>
                </div>
              )}
              {!searchTerm && (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400 dark:text-gray-500">
                  <FiSearch className="w-16 h-16 mx-auto mb-3 text-gray-300 dark:text-gray-500" />
                  <p className="mb-2">Start typing to search for medicines</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Note: Only existing medicines can be purchased. Add new medicines from the Medicines page first.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Barcode Scan Modal */}
      {barcodeScanMode && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Scan Barcode</h2>
              <button
                onClick={() => {
                  setBarcodeScanMode(false);
                  setBarcodeInput('');
                }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 dark:hover:bg-gray-600 dark:bg-gray-700 rounded-lg transition-colors"
              >
                <FiX className="w-6 h-6 text-gray-600 dark:text-gray-400 dark:text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-400 dark:text-gray-500">
                Scan or type a medicine barcode. If it exists in your catalogue it will be added to the purchase cart automatically so you can restock it.
              </p>
              <input
                ref={barcodeInputRef}
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleBarcodeScan(barcodeInput);
                  }
                }}
                placeholder="Scan or type barcode..."
                className="w-full px-4 py-3 text-lg border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setBarcodeScanMode(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 dark:hover:bg-gray-600 dark:bg-gray-700/50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleBarcodeScan(barcodeInput)}
                  className="px-4 py-2 rounded-lg bg-blue-600 dark:bg-blue-500 text-white font-semibold hover:bg-blue-700 dark:hover:bg-blue-600"
                >
                  Search
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="w-full flex-1 flex flex-col overflow-hidden min-h-0">
        {/* Main Content: Left (Products/Cart) and Right (Summary/History) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1 overflow-hidden min-h-0">
          {/* Left Side: Products and Cart */}
          <div className="lg:col-span-8 flex flex-col overflow-hidden min-h-0 gap-3">
            {/* Top Section: PO, Date, Time, Supplier Info */}
            <div className="bg-gradient-to-br from-white via-white to-gray-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-gray-800/90 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-3 flex-shrink-0">
              
              {/* TOP GRID ROW */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                
                {/* Order Number + Navigation */}
                <div className="flex items-center gap-2 min-w-0">
                  <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase whitespace-nowrap">
                    Order # (F1)
                  </label>

                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    {/* PREVIOUS */}
                    <button
                      type="button"
                      onClick={navigateToPreviousPurchase}
                      disabled={
                        (currentPurchaseIndex === -1 && purchaseHistoryList.length === 0) ||
                        (currentPurchaseIndex >= 0 && currentPurchaseIndex >= purchaseHistoryList.length - 1)
                      }
                      className="h-8 w-8 flex items-center justify-center border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700/50 text-gray-700 dark:text-white rounded-md hover:bg-gray-100 dark:hover:bg-gray-600 disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 disabled:cursor-not-allowed transition"
                    >
                      <FiChevronLeft className="w-4 h-4" />
                    </button>

                    {/* PO INPUT */}
                    <input
                      type="text"
                      value={purchaseOrderNumber || (editingPurchaseId ? `PO-${editingPurchaseId}` : '')}
                      readOnly
                      placeholder="New"
                      className="flex-1 min-w-0 h-8 px-2.5 text-xs font-semibold border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700/50 dark:text-white rounded-md focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition text-center"
                    />

                    {/* NEXT */}
                    <button
                      type="button"
                      onClick={navigateToNextPurchase}
                      disabled={currentPurchaseIndex <= 0 || currentPurchaseIndex === -1}
                      className="h-8 w-8 flex items-center justify-center border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700/50 text-gray-700 dark:text-white rounded-md hover:bg-gray-100 dark:hover:bg-gray-600 disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 disabled:cursor-not-allowed transition"
                    >
                      <FiChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* DATE */}
                <div className="flex items-center gap-2 min-w-0">
                  <FiCalendar className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase whitespace-nowrap">
                    Date
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={currentDate}
                    className="flex-1 min-w-0 h-8 px-2.5 text-xs font-semibold border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/40 text-gray-700 dark:text-gray-300 rounded-md"
                  />
                </div>

                {/* TIME */}
                <div className="flex items-center gap-2 min-w-0">
                  <FiClock className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase whitespace-nowrap">
                    Time
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={currentTime}
                    className="flex-1 min-w-0 h-8 px-2.5 text-xs font-semibold border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/40 text-gray-700 dark:text-gray-300 rounded-md"
                  />
                </div>

                {/* SUPPLIER SELECT */}
                <div className="flex items-center gap-2 min-w-0">
                  <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase whitespace-nowrap">
                    Supplier
                  </label>
                  <div className="flex-1 min-w-0 relative">
                    <select
                      value={selectedSupplierId || ''}
                      onChange={(e) => setSelectedSupplierId(e.target.value ? parseInt(e.target.value) : null)}
                      className="w-full h-8 pl-2.5 pr-8 text-xs font-semibold border-2 border-emerald-500/40 dark:border-emerald-500/40 bg-white dark:bg-gray-700/50 dark:text-white rounded-md focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition appearance-none cursor-pointer"
                    >
                      <option value="">Select Supplier...</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 dark:text-gray-500">
                      <FiChevronDown className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECOND ROW: Contact, Company, Actions */}
              <div className="mt-3 pt-3 flex flex-wrap items-center gap-4 border-t border-gray-200 dark:border-gray-700">
                {/* CONTACT */}
                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase whitespace-nowrap">
                    Contact
                  </label>
                  <input
                    type="text"
                    value={selectedSupplierId ? (suppliers.find(s => s.id === selectedSupplierId)?.phone || 'N/A') : ''}
                    readOnly
                    className="w-32 h-8 px-2.5 text-xs font-semibold border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/40 text-gray-700 dark:text-gray-300 rounded-md"
                  />
                </div>

                {/* COMPANY */}
                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase whitespace-nowrap">
                    Company
                  </label>
                  <input
                    type="text"
                    value={selectedSupplierId ? (suppliers.find(s => s.id === selectedSupplierId)?.company || suppliers.find(s => s.id === selectedSupplierId)?.companyName || 'N/A') : ''}
                    readOnly
                    className="w-40 h-8 px-2.5 text-xs font-semibold border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/40 text-gray-700 dark:text-gray-300 rounded-md"
                  />
                </div>

                <div className="flex-1"></div>

                {/* ACTION BUTTONS */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={clearForm}
                    className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-md hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition shadow-sm border border-emerald-200 dark:border-emerald-800"
                  >
                    New Purchase
                  </button>
                  <Link
                    to="/purchases"
                    className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition shadow-sm"
                  >
                    History
                  </Link>
                </div>
              </div>
            </div>            {/* Product Search Section */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-2.5 flex-shrink-0 relative">
              <div className="flex items-center gap-2.5">
                <label
                  htmlFor="product-search"
                  className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap"
                >
                  Product (F2)
                </label>
                <div className="flex-1 relative">
                  <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-3.5 h-3.5 z-10" />
                  <input
                    id="product-search"
                    ref={searchInputRef}
                    type="text"
                    value={searchTerm}
                    onChange={handleSearchChange}
                    onFocus={() => {
                      if (searchTerm) {
                        setShowSearchResults(true);
                      }
                    }}
                    onBlur={(e) => {
                      const relatedTarget = e.relatedTarget as HTMLElement;
                      if (relatedTarget && relatedTarget.closest('[data-dropdown-item]')) {
                        return;
                      }
                      setTimeout(() => {
                        setShowSearchResults(false);
                      }, 200);
                    }}
                    placeholder="Search or scan product..."
                    className="w-full pl-10 pr-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-600 dark:bg-gray-700/50 dark:text-white rounded-md focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none transition-all bg-white"
                  />
                  {/* Dropdown Results */}
                  {showSearchResults && searchTerm && medicines.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-50 max-h-64 overflow-y-auto">
                      {medicines.map((medicine) => (
                        <div
                          key={medicine.id}
                          data-dropdown-item
                          className="p-2.5 border-b border-gray-100 dark:border-gray-700 cursor-pointer transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-900/20 flex items-center justify-between"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            addToCart(medicine);
                            setSearchTerm('');
                            setShowSearchResults(false);
                          }}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <h4 className="font-semibold text-gray-900 dark:text-white text-sm break-words leading-tight" title={medicine.name}>{medicine.name}</h4>
                            </div>
                            {medicine.barcode && (
                              <div className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400 break-words">
                                {medicine.barcode}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            className="ml-3 px-2.5 py-1 bg-emerald-600 dark:bg-emerald-500 text-white rounded-md hover:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors flex items-center gap-1 text-xs font-medium flex-shrink-0"
                          >
                            <FaPlus className="w-3 h-3" />
                            Add
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {showSearchResults &&
                    searchTerm &&
                    !isSearching &&
                    medicines.length === 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-50 p-4 text-center">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          No medicines found
                        </p>
                      </div>
                    )}
                  {isSearching && searchTerm && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-50 p-4 text-center">
                      <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setBarcodeScanMode(true)}
                  className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide bg-blue-600 dark:bg-blue-700 text-white rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 transition-all shadow-sm flex items-center gap-1.5"
                >
                  <FiMaximize2 className="w-3 h-3" />
                  Scan
                </button>
              </div>
            </div>

            {/* Cart Items Section */}
            <div className="flex-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200/60 dark:border-gray-700/60 shadow-md overflow-hidden flex flex-col min-h-0 max-h-full backdrop-blur-sm">
              <div className="px-4 py-3 bg-gradient-to-r from-gray-50 to-gray-100/50 dark:from-gray-700/50 dark:to-gray-700/30 border-b border-gray-200/60 dark:border-gray-600/60 flex-shrink-0 z-10">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wide">
                  Current Purchase Items
                </h3>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0 overscroll-contain">
                {cart.length === 0 ? (
                  <div className="p-12 text-center text-gray-500 dark:text-gray-400">
                    <FiPackage className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="text-sm">No items in purchase order</p>
                  </div>
                ) : (
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
                    {/* Header */}
                    <div className="grid grid-cols-[40px_1fr_80px_80px_100px_60px_60px_140px_120px] gap-2 px-3 py-2.5 bg-gradient-to-r from-gray-50/80 to-gray-100/50 dark:from-gray-700/40 dark:to-gray-700/20 border-b-2 border-gray-200/60 dark:border-gray-600/60 text-[10px] font-bold text-gray-700 dark:text-gray-300 sticky top-0 uppercase tracking-wider z-10">
                      <div className="flex justify-center">Sr#</div>
                      <div>Product</div>
                      <div className="text-center">Pkt</div>
                      <div className="text-center">Pills/Pkt</div>
                      <div className="text-center">Price</div>
                      <div className="text-center">Disc%</div>
                      <div className="text-center">Tax%</div>
                      <div className="text-center">Expiry</div>
                      <div className="text-right pr-9">Amount</div>
                    </div>
                    {/* Medicine Items */}
                    <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                      {cart.map((item, index) => (
                        <div key={item.medicine.id} className="grid grid-cols-[40px_1fr_80px_80px_100px_60px_60px_140px_120px] gap-2 px-4 py-3 hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-all items-center border-b border-gray-100 dark:border-gray-700/50">
                          {/* S.No */}
                          <div className="flex justify-center text-[11px] text-gray-400 font-bold">
                            {index + 1}
                          </div>

                          {/* Medicine Name and Info */}
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900 dark:text-white truncate text-[11px]" title={item.medicine.name}>
                              {item.medicine.name}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                {symbol}{item.pricePerPacket.toFixed(2)}
                              </span>
                              {item.medicine.barcode && (
                                <span className="text-[10px] text-gray-500 dark:text-gray-500 truncate">
                                  {item.medicine.barcode}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Packets */}
                          <div>
                            <input
                              type="number"
                              min="0"
                              value={item.packetQuantity || ''}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => {
                                if (isCashier && editingPurchaseId !== null && !isWithin24Hours(selectedPurchase?.createdAt)) return;
                                const val = e.target.value;
                                updateCartItemField(item.medicine.id, 'packetQuantity', val === '' ? '' as any : parseInt(val));
                              }}
                              className="w-full h-8 text-center text-[12px] font-bold bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-lg focus:border-emerald-500 outline-none transition-all dark:text-white shadow-sm"
                            />
                          </div>

                          {/* Pills per packet */}
                          <div className="text-center text-[12px] font-bold text-gray-500 dark:text-gray-400">
                            {item.pillsPerPacket}
                          </div>

                          {/* Total Amount Input */}
                          <div>
                            <input
                              type="number"
                              min="0"
                              value={item.totalAmount || ''}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => {
                                if (isCashier && editingPurchaseId !== null && !isWithin24Hours(selectedPurchase?.createdAt)) return;
                                const numVal = parseFloat(e.target.value) || 0;
                                updateCartItemField(item.medicine.id, 'totalAmount', numVal);
                              }}
                              className="w-full h-8 text-center text-[12px] font-bold bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-lg focus:border-emerald-500 outline-none transition-all dark:text-white shadow-sm"
                            />
                          </div>

                          {/* Discount */}
                          <div>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={item.discount || ''}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => {
                                if (isCashier && editingPurchaseId !== null && !isWithin24Hours(selectedPurchase?.createdAt)) return;
                                updateCartItemField(item.medicine.id, 'discount', e.target.value === '' ? 0 : parseFloat(e.target.value));
                              }}
                              className="w-full h-7 text-center text-[11px] font-bold bg-transparent border-b border-gray-200 dark:border-gray-700 focus:border-emerald-500 outline-none transition-all dark:text-white"
                              placeholder="0"
                            />
                          </div>

                          {/* Tax */}
                          <div>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={item.tax || ''}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => {
                                if (isCashier && editingPurchaseId !== null && !isWithin24Hours(selectedPurchase?.createdAt)) return;
                                updateCartItemField(item.medicine.id, 'tax', e.target.value === '' ? 0 : parseFloat(e.target.value));
                              }}
                              className="w-full h-7 text-center text-[11px] font-bold bg-transparent border-b border-gray-200 dark:border-gray-700 focus:border-red-500 outline-none transition-all dark:text-white"
                              placeholder="0"
                            />
                          </div>

                          {/* Expiry */}
                          <div>
                            <input
                              type="date"
                              value={item.expiryDate}
                              min={minExpiryDate}
                              onChange={(e) => {
                                if (isCashier && editingPurchaseId !== null && !isWithin24Hours(selectedPurchase?.createdAt)) return;
                                updateCartItemField(item.medicine.id, 'expiryDate', e.target.value);
                              }}
                              className="w-full h-8 px-2 text-[10px] font-bold bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-lg focus:border-emerald-500 outline-none transition-all dark:text-white shadow-sm"
                            />
                          </div>

                          {/* Action / Trash */}
                          <div className="flex items-center justify-end gap-3 pr-2">
                             <div className="text-right font-bold text-emerald-600 dark:text-emerald-400 text-[11px]">
                              {symbol} {item.lineTotal.toFixed(2)}
                            </div>
                            <button
                              type="button"
                              onClick={() => removeFromCart(item.medicine.id)}
                              className="p-1.5 text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-all"
                              title="Remove"
                            >
                              <FiTrash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* Right Side: Summary & History */}
          <div className="lg:col-span-4 flex flex-col gap-3 overflow-hidden min-h-0 h-full">
            {/* Payment Summary Section */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 flex-shrink-0 space-y-4">
              <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-widest border-b border-gray-100 dark:border-gray-700 pb-2">
                Order Summary
              </h3>

              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500 dark:text-gray-400 uppercase font-medium">Subtotal</span>
                  <span className="text-gray-900 dark:text-white font-bold">{formatCurrency(subtotal)}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 pb-1">
                  <div className="flex justify-between items-center text-[12px]">
                    <span className="text-orange-600 dark:text-orange-400 font-bold uppercase tracking-tight">Discount</span>
                    <span className="text-orange-700 dark:text-orange-400 font-bold">-{formatCurrency(discountTotal)}</span>
                  </div>
                  <div className="flex justify-between items-center text-[12px] border-l border-gray-100 dark:border-gray-700 pl-3">
                    <span className="text-blue-600 dark:text-blue-400 font-bold uppercase tracking-tight">Tax</span>
                    <span className="text-blue-700 dark:text-blue-400 font-bold">+{formatCurrency(taxTotal)}</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
                  <span className="text-gray-900 dark:text-white font-bold uppercase text-md">Grand Total</span>
                  <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(grandTotal)}
                  </span>
                </div>
              </div>

              {/* Payment Section Toggle */}
              <button
                type="button"
                onClick={() => setShowPaymentSection(!showPaymentSection)}
                className="w-full flex items-center justify-between p-3 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-lg border border-emerald-100 dark:border-emerald-800/30 group transition-all hover:bg-emerald-100/50 dark:hover:bg-emerald-900/20"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-white dark:bg-emerald-800 rounded-md shadow-sm">
                    <FiCreditCard className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">
                   Make Payment
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {!showPaymentSection && paymentAmount > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-600 text-white rounded-full animate-in fade-in scale-in">
                      {symbol}{paymentAmount.toFixed(2)}
                    </span>
                  )}
                  <FiChevronDown 
                    className={`w-4 h-4 text-emerald-600/80 transition-transform duration-300 ${showPaymentSection ? 'rotate-180' : ''}`} 
                  />
                </div>
              </button>

              {/* Payment Input Section - Collapsible */}
              {showPaymentSection && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="bg-emerald-50/30 dark:bg-emerald-900/10 rounded-lg p-3 border border-emerald-100 dark:border-emerald-800/30 space-y-3">
                    <div className="relative">
                      <label className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase mb-1.5 block">
                        Payment Amount
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-600 dark:text-emerald-500 font-bold">{symbol}</span>
                        <input
                          type="number"
                          min="0"
                          max={grandTotal}
                          step="0.01"
                          value={paymentAmount || ''}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            if (val <= grandTotal) {
                              setPaymentAmount(val);
                            }
                          }}
                          className="w-full bg-white dark:bg-gray-800 border-2 border-emerald-200 dark:border-emerald-700 rounded-lg py-2 pl-8 pr-3 text-lg font-black text-emerald-700 dark:text-emerald-400 outline-none focus:ring-4 focus:ring-emerald-500/20 transition-all"
                          placeholder="0.00"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="relative">
                        <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 block">
                          Method
                        </label>
                        <div className="relative">
                          <select
                            value={paymentMethod}
                            onChange={(e) => setPaymentMethod(e.target.value as any)}
                            className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md py-1.5 pl-2 pr-7 text-xs font-bold text-gray-700 dark:text-gray-300 outline-none appearance-none"
                          >
                            <option value="cash">Cash</option>
                            <option value="bank_transfer">Bank</option>
                            <option value="check">Check</option>
                            <option value="online">Online</option>
                          </select>
                          <FiChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        </div>
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 block">
                          Balance
                        </label>
                        <div className="h-[34px] flex items-center px-2 bg-gray-100 dark:bg-gray-700/50 rounded-md text-[11px] font-black text-red-600 dark:text-red-400 border border-gray-200 dark:border-gray-600">
                          {formatCurrency(Math.max(0, grandTotal - (paymentAmount || 0)))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={handlePurchase}
                  disabled={processing || cart.length === 0 || (isCashier && editingPurchaseId !== null && !isWithin24Hours(selectedPurchase?.createdAt))}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-md shadow-emerald-500/30 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-80 disabled:cursor-not-allowed"
                >
                  {processing ? (
                    <FiRefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <FiCreditCard className="w-5 h-5" />
                  )}
                  {editingPurchaseId ? 'UPDATE PURCHASE' : 'COMPLETE PURCHASE'}
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('New purchase? Cart will be cleared.')) {
                        clearForm();
                      }
                    }}
                    className="py-2.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold hover:bg-gray-200 dark:hover:bg-gray-600 transition-all flex items-center justify-center gap-1.5"
                  >
                    <FaPlus className="w-3 h-3" />
                    NEW
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="py-2.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold hover:bg-gray-200 dark:hover:bg-gray-600 transition-all flex items-center justify-center gap-1.5"
                  >
                    <FiRefreshCw className="w-3 h-3" />
                    RESET
                  </button>
                </div>
              </div>
            </div>

            {/* Purchase History List - Scrollable */}
            <div className="flex-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col overflow-hidden min-h-0">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <h3 className="text-xs font-bold text-gray-800 dark:text-white uppercase tracking-widest">
                  History
                </h3>
                <FiClock className="text-gray-400 w-3.5 h-3.5" />
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
                {purchaseHistoryList.length === 0 ? (
                  <div className="py-8 text-center text-gray-400 text-xs">
                    No recent purchases
                  </div>
                ) : (
                  purchaseHistoryList.map((purchase) => {
                    const isSelected = selectedPurchaseId === purchase.id;
                    const dateObj = new Date(purchase.createdAt);
                    return (
                      <div
                        key={purchase.id}
                        onClick={() => {
                          const index = purchaseHistoryList.findIndex(p => p.id === purchase.id);
                          loadPurchaseDetails(purchase, index);
                        }}
                        className={`p-3 rounded-lg border transition-all cursor-pointer ${isSelected
                          ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 shadow-sm'
                          : 'bg-white dark:bg-gray-800/50 border-gray-100 dark:border-gray-700 hover:border-emerald-200 dark:hover:border-emerald-800'
                          }`}
                      >
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-bold text-xs text-gray-900 dark:text-white">PO-{purchase.id}</span>
                          <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(purchase.grandTotal)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] text-gray-500 dark:text-gray-400 capitalize">{purchase.supplierName}</span>
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">{dateObj.toLocaleDateString()}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* View Purchase Details Modal */}
      {
        viewPurchase && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Purchase Details - PO-{viewPurchase.id}</h3>
                <button
                  onClick={() => setViewPurchase(null)}
                  className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-gray-400 dark:text-gray-500"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500">Supplier</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{viewPurchase.supplierName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500">Date</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{formatDate(viewPurchase.createdAt)}</p>
                  </div>
                </div>
                {viewPurchase.items && viewPurchase.items.length > 0 && (
                  <div className="border-t pt-4">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Items:</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-700/50">
                          <tr>
                            <th className="px-3 py-2 text-left">Medicine</th>
                            <th className="px-3 py-2 text-center">Packets</th>
                            <th className="px-3 py-2 text-center">Pills/Packet</th>
                            <th className="px-3 py-2 text-center">Total Pills</th>
                            <th className="px-3 py-2 text-right">Price/Packet</th>
                            <th className="px-3 py-2 text-right">Line Total</th>
                            <th className="px-3 py-2 text-center">Expiry</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                          {viewPurchase.items.map((item: any, idx: number) => (
                            <tr key={idx}>
                              <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{item.medicineName}</td>
                              <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-400 dark:text-gray-500">{item.packetQuantity}</td>
                              <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-400 dark:text-gray-500">{item.pillsPerPacket}</td>
                              <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-400 dark:text-gray-500">{item.totalPills?.toLocaleString()}</td>
                              <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300 dark:text-gray-500">{formatCurrency(item.pricePerPacket)}</td>
                              <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-white">{formatCurrency(item.lineTotal)}</td>
                              <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-400 dark:text-gray-500">{formatDate(item.expiryDate)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                <div className="border-t pt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400 dark:text-gray-500">Subtotal:</span>
                    <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(viewPurchase.subtotal || 0)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400 dark:text-gray-500">Discount Total:</span>
                    <span className="font-medium text-orange-600 dark:text-orange-400">{formatCurrency(viewPurchase.discountTotal || 0)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400 dark:text-gray-500">Tax Total:</span>
                    <span className="font-medium text-blue-600 dark:text-blue-400">{formatCurrency(viewPurchase.taxTotal || 0)}</span>
                  </div>
                  <div className="flex justify-between text-base font-bold border-t pt-2">
                    <span className="text-gray-900 dark:text-white">Grand Total:</span>
                    <span className="text-emerald-600 dark:text-emerald-400">{formatCurrency(viewPurchase.grandTotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400 dark:text-gray-500">Payment Amount:</span>
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">{formatCurrency(viewPurchase.paymentAmount || 0)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400 dark:text-gray-500">Remaining Balance:</span>
                    <span className="font-medium text-red-600 dark:text-red-400">{formatCurrency(Math.max(0, (viewPurchase.grandTotal || 0) - (viewPurchase.paymentAmount || 0)))}</span>
                  </div>
                </div>
                {viewPurchase.notes && (
                  <div className="border-t pt-4">
                    <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-1">Notes:</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300 dark:text-gray-500">{viewPurchase.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      }

      {/* Delete Confirmation Modal */}
      {
        deleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Delete Purchase</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 dark:text-gray-500 mb-6">
                Are you sure you want to delete purchase PO-{deleteConfirm}? This action cannot be undone and will remove all associated items.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 dark:text-gray-500 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 dark:hover:bg-gray-600 dark:bg-gray-700/50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeletePurchase(deleteConfirm)}
                  className="flex-1 px-4 py-2 bg-red-600 dark:bg-red-500 text-white rounded-lg hover:bg-red-700 dark:hover:bg-red-600 transition-colors font-medium"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
};

export default PurchasingPanel;

