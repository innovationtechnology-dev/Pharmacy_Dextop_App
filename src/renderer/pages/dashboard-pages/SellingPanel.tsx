import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import {
  FiSearch,
  FiX,
  FiPlus,
  FiMinus,
  FiTrash2,
  FiMaximize2,
  FiDollarSign,
  FiPackage,
  FiCheck,
  FiPrinter,
  FiClock,
  FiCalendar,
  FiUsers,
  FiChevronLeft,
  FiChevronRight,
  FiChevronDown,
  FiRotateCcw,
  FiRefreshCw,
} from 'react-icons/fi';
import { FaPercent } from 'react-icons/fa';
import { useDashboardHeader } from './useDashboardHeader';
import {
  PharmacySettings,
  getStoredPharmacySettings,
} from '../../types/pharmacy';
import { getSalesFlatRows, FlatSaleRow, updateSale } from '../../utils/sales';
import { createSaleReturn, getSaleReturnsBySaleId, SaleReturnItem } from '../../utils/sale-return';
import { Link } from 'react-router-dom';
import { getAuthUser } from '../../utils/auth';
import { currencySymbols, getCurrencySymbol as getSymbol } from '../../../common/currency';
import { buildThermalReceiptHtml } from '../../utils/thermalReceipt';
import { useToast, ToastContainer } from '../../components/common/Toast';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import {
  looksLikeBarcodeInput,
  normalizeScannedBarcode,
} from '../../../common/barcodeLookup';

// Toggle this flag to switch between in-app preview and real printing.
// true  => show thermal receipt inside the app (for design tweaking)
// false => send to browser/Electron print dialog
const RECEIPT_PREVIEW_MODE = false;

// Constants
const BARCODE_SCAN_TIMEOUT_MS = 200;
const BARCODE_MIN_LENGTH = 4;
const SALES_HISTORY_LIMIT = 20;
const SEARCH_DEBOUNCE_MS = 300;
const SUCCESS_MESSAGE_DURATION_MS = 2000;
const DROPDOWN_BLUR_DELAY_MS = 200;
const PRINT_FRAME_CLEANUP_MS = 500;
const FEFO_CACHE_TTL_MS = 30000;

type MedicineStatus = 'active' | 'inactive' | 'discontinued';

interface Medicine {
  id: number;
  barcode?: string;
  name: string;
  pillQuantity: number;
  status: MedicineStatus;
  manufacturer?: string;
  brandName?: string;
  sellablePills?: number;
  totalAvailablePills?: number;
  normalExpiryPills?: number;
  nearExpiryPills?: number;
  criticalExpiryPills?: number;
  nextExpiryDate?: string | null;
  averageSellablePricePerPill?: number | null;
}

export interface Customer {
  id?: number;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  notes?: string;
}

interface FefoBatch {
  availablePills: number;
  sellPrice: number;
}

interface CartItem {
  medicine: Medicine;
  pills: number;
  unitPrice: number;
  discount: number;
  tax: number;
  subtotal: number;
  discountAmount?: number;
  taxAmount?: number;
  finalPrice: number;
  /** FEFO batches loaded at add-to-cart time, used to compute per-batch prices */
  fefoBatches?: FefoBatch[];
  /**
   * Per-batch price segments for this cart item.
   * e.g. [{pills:5, price:10}, {pills:5, price:15}] means 5 pills at 10 and 5 at 15.
   * When set, subtotal is computed from this breakdown (not unitPrice × pills).
   */
  batchBreakdown?: Array<{ pills: number; price: number }>;
}

/**
 * Split qty across FEFO batches and return per-segment {pills, price} pairs.
 * Consecutive segments with the same price are merged.
 */
function computeBatchBreakdown(
  batches: FefoBatch[],
  qty: number
): Array<{ pills: number; price: number }> {
  if (!batches || batches.length === 0 || qty <= 0) return [];
  let remaining = qty;
  const raw: Array<{ pills: number; price: number }> = [];
  for (const batch of batches) {
    if (remaining <= 0) break;
    const consume = Math.min(batch.availablePills, remaining);
    if (consume > 0) raw.push({ pills: consume, price: batch.sellPrice });
    remaining -= consume;
  }
  if (remaining > 0 && batches.length > 0) {
    raw.push({ pills: remaining, price: batches[batches.length - 1].sellPrice });
  }
  // Merge adjacent segments with identical price
  return raw.reduce<Array<{ pills: number; price: number }>>((acc, seg) => {
    if (acc.length > 0 && acc[acc.length - 1].price === seg.price) {
      acc[acc.length - 1] = { pills: acc[acc.length - 1].pills + seg.pills, price: seg.price };
    } else {
      acc.push({ ...seg });
    }
    return acc;
  }, []);
}

/**
 * Blended (weighted average) price — kept for the unit-price input field display.
 */
function computeBlendedPrice(batches: FefoBatch[], qty: number): number {
  if (!batches || batches.length === 0 || qty <= 0) return 0;
  let remaining = qty;
  let totalCost = 0;
  for (const batch of batches) {
    if (remaining <= 0) break;
    const consume = Math.min(batch.availablePills, remaining);
    totalCost += consume * batch.sellPrice;
    remaining -= consume;
  }
  if (remaining > 0) totalCost += remaining * batches[batches.length - 1].sellPrice;
  return totalCost / qty;
}


/** Pills to add for a new line / each cart add — matches medicine "pills per packet" (pillQuantity). */
const defaultSaleQuantity = (medicine: Medicine): number =>
  Math.max(1, medicine.pillQuantity || 1);

const BARCODE_PREVIEW_MAX = 12;

/** Short barcode/label for UI (e.g. `010896110177...`). Full value stays in data/receipts. */
const formatBarcodePreview = (barcode: string | undefined | null): string => {
  if (barcode == null || String(barcode).trim() === '') return '—';
  const t = String(barcode).trim();
  if (t.length <= BARCODE_PREVIEW_MAX) return t;
  return `${t.slice(0, BARCODE_PREVIEW_MAX)}...`;
};

const medicineCompanyLine = (m: {
  manufacturer?: string;
  brandName?: string;
}): string => {
  const a = m.manufacturer?.trim();
  const b = m.brandName?.trim();
  if (a && b) return `${a} · ${b}`;
  return a || b || '—';
};

const recalculateSaleItem = (item: CartItem): CartItem => {
  const discountPercent = Math.min(Math.max(item.discount || 0, 0), 100);
  const taxPercent = Math.min(Math.max(item.tax || 0, 0), 100);
  // Use exact per-batch total when breakdown is available; fall back to blended unit price.
  const subtotal =
    item.batchBreakdown && item.batchBreakdown.length > 0
      ? item.batchBreakdown.reduce((sum, seg) => sum + seg.pills * seg.price, 0)
      : item.unitPrice * item.pills;
  const discountAmount = (subtotal * discountPercent) / 100;
  const discountedAmount = subtotal - discountAmount;
  const taxAmount = (discountedAmount * taxPercent) / 100;
  const finalPrice = discountedAmount + taxAmount;

  return {
    ...item,
    discount: discountPercent,
    tax: taxPercent,
    subtotal,
    discountAmount,
    taxAmount,
    finalPrice,
  };
};

const SellingPanel: React.FC = () => {
  const { refreshExpiringAlerts } = useDashboardHeader();
  const { toasts, removeToast, warning, error } = useToast();
  const expiryWarningShownRef = useRef<Set<number>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  /** Draft qty while typing — committed on blur to avoid fighting the native number spinner / controlled state */
  const [qtyInputDraft, setQtyInputDraft] = useState<Record<number, string>>({});
  /** Draft discount while typing */
  const [discountInputDraft, setDiscountInputDraft] = useState<Record<number, string>>({});
  /** Draft tax while typing */
  const [taxInputDraft, setTaxInputDraft] = useState<Record<number, string>>({});

  const clearQtyDraft = useCallback((medicineId: number) => {
    setQtyInputDraft((prev) => {
      if (!(medicineId in prev)) return prev;
      const next = { ...prev };
      delete next[medicineId];
      return next;
    });
  }, []);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [receivedAmount, setReceivedAmount] = useState<string>('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [saleType, setSaleType] = useState<string>('Regular');
  const [prescriptionNumber, setPrescriptionNumber] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [processing, setProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [barcodeScanMode, setBarcodeScanMode] = useState(false);
  const [showSeedButton, setShowSeedButton] = useState(false);
  const [pharmacyInfo] = useState<PharmacySettings>(() => {
    try {
      return getStoredPharmacySettings();
    } catch (error) {
      console.error('Error loading pharmacy settings:', error);
      return {} as PharmacySettings;
    }
  });
  const [salesHistory, setSalesHistory] = useState<FlatSaleRow[]>([]);
  const [selectedSaleId, setSelectedSaleId] = useState<number | null>(null);
  const [currentBillIndex, setCurrentBillIndex] = useState<number>(-1); // -1 means new bill, 0+ means viewing a bill
  const [recentlySelectedMedicines, setRecentlySelectedMedicines] = useState<
    number[]
  >(() => {
    // Load from localStorage if available
    try {
      const stored = localStorage.getItem('recentlySelectedMedicines');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading recently selected medicines:', error);
      return [];
    }
  });
  const [invoiceNumber, setInvoiceNumber] = useState<string>('INV-01');
  const [currentDate, setCurrentDate] = useState<string>(() => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = now.toLocaleString('default', { month: 'short' });
    const year = now.getFullYear();
    return `${day}/${month}/${year}`;
  });
  const [currentTime, setCurrentTime] = useState<string>(() => {
    const now = new Date();
    return now.toLocaleTimeString('en-US', {
      hour12: true,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  });
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnItems, setReturnItems] = useState<Array<{
    medicineId: number;
    medicineName: string;
    originalPills: number;
    availableToReturn: number;
    returnPills: number;
    unitPrice: number;
    discountPerUnit: number;
    taxPerUnit: number;
    reason?: string;
  }>>([]);
  const [returnReason, setReturnReason] = useState('');
  const [returnNotes, setReturnNotes] = useState('');
  const [processingReturn, setProcessingReturn] = useState(false);
  const [returnedQuantities, setReturnedQuantities] = useState<Map<number, number>>(new Map());
  const [currentSaleReturnTotal, setCurrentSaleReturnTotal] = useState<number>(0);
  const [receiptPreviewHtml, setReceiptPreviewHtml] = useState<string | null>(null);
  const [saleDeleteConfirm, setSaleDeleteConfirm] = useState<{
    saleId: number;
    saleDate: string;
  } | null>(null);
  const [removeLineConfirm, setRemoveLineConfirm] = useState<{
    medicineId: number;
    itemName: string;
    returnedQty: number;
  } | null>(null);
  const isCashier = getAuthUser()?.role === 'cashier';

  const isWithin24Hours = useCallback((dateString?: string): boolean => {
    if (!dateString) return true;
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    return diffHours <= 24;
  }, []);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const barcodeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const globalBarcodeBufferRef = useRef<string>('');
  const globalBarcodeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const dropdownItemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const searchRequestSeqRef = useRef(0);
  const returnsRequestSeqRef = useRef(0);
  const fefoCacheRef = useRef<Map<number, { ts: number; batches: FefoBatch[] }>>(new Map());
  const fefoInFlightRef = useRef<Map<number, Promise<FefoBatch[]>>>(new Map());

  // Define functions first using useCallback
  const loadMedicines = useCallback(async () => {
    try {
      window.electron.ipcRenderer.once(
        'medicine-get-all-reply',
        (response: any) => {
          if (response.success) {
            const available = (response.data || []).filter(
              (medicine: Medicine) => (medicine.sellablePills ?? 0) > 0
            );
            setMedicines(available);
          }
        }
      );
      window.electron.ipcRenderer.sendMessage('medicine-get-all', []);
    } catch (error) {
      console.error('Error loading medicines:', error);
    }
  }, []);

  const getFefoBatches = useCallback(async (medicineId: number): Promise<FefoBatch[]> => {
    const now = Date.now();
    const cached = fefoCacheRef.current.get(medicineId);
    if (cached && now - cached.ts <= FEFO_CACHE_TTL_MS) {
      return cached.batches;
    }

    const inflight = fefoInFlightRef.current.get(medicineId);
    if (inflight) return inflight;

    const request = window.electron.ipcRenderer
      .invoke('medicine-get-fefo-sell-batches', medicineId)
      .then((resp: any) => {
        if (!resp?.success || !Array.isArray(resp.data)) return [] as FefoBatch[];
        const batches: FefoBatch[] = resp.data;
        fefoCacheRef.current.set(medicineId, { ts: Date.now(), batches });
        return batches;
      })
      .catch(() => [] as FefoBatch[])
      .finally(() => {
        fefoInFlightRef.current.delete(medicineId);
      });

    fefoInFlightRef.current.set(medicineId, request);
    return request;
  }, []);

  const addToCart = useCallback((medicine: Medicine, quantityParam?: number) => {
    const available = medicine.sellablePills ?? 0;
    if (available <= 0) {
      const totalAvailable = medicine.totalAvailablePills ?? 0;
      if (totalAvailable > 0) {
        error(
          `Stock for "${medicine.name}" is expired, so it can't be sold.`
        );
      } else {
        error(`No stock available for "${medicine.name}".`);
      }
      return;
    }

    // Expiry policy warnings (non-blocking toast, once per medicine per session)
    if ((medicine.criticalExpiryPills ?? 0) > 0) {
      if (!expiryWarningShownRef.current.has(medicine.id)) {
        expiryWarningShownRef.current.add(medicine.id);
        warning(
          `"${medicine.name}" has critical expiry stock (≤7 days). Sale allowed — use FEFO.`
        );
      }
    } else if ((medicine.nearExpiryPills ?? 0) > 0) {
      if (!expiryWarningShownRef.current.has(medicine.id)) {
        expiryWarningShownRef.current.add(medicine.id);
        warning(
          `"${medicine.name}" has near-expiry stock (≤30 days). Sale allowed — use FEFO.`
        );
      }
    }

    let quantity = quantityParam ?? defaultSaleQuantity(medicine);
    if (available < quantity) {
      warning(`Only ${available} pills available for sale!`);
      quantity = available;
    }

    setCart((prevCart) => {
      const existingItem = prevCart.find(
        (item) => item.medicine.id === medicine.id
      );

      if (existingItem) {
        const newQuantity = existingItem.pills + quantity;
        if (newQuantity > available) {
          warning(`Only ${available} pills available for sale!`);
          return prevCart;
        }
        const updatedItem: CartItem = recalculateSaleItem({
          ...existingItem,
          pills: newQuantity,
        });
        return prevCart.map((item) =>
          item.medicine.id === medicine.id ? updatedItem : item
        );
      }
      const defaultUnitPrice = medicine.averageSellablePricePerPill || 0;
      const newItem: CartItem = recalculateSaleItem({
        medicine,
        pills: quantity,
        unitPrice: defaultUnitPrice,
        discount: 0,
        tax: 0,
        subtotal: 0,
        finalPrice: 0,
      });
      return [...prevCart, newItem];
    });

    // Track recently selected medicine
    setRecentlySelectedMedicines((prev) => {
      const updated = [
        medicine.id,
        ...prev.filter((id) => id !== medicine.id),
      ].slice(0, 10); // Keep last 10
      localStorage.setItem(
        'recentlySelectedMedicines',
        JSON.stringify(updated)
      );
      return updated;
    });

    // Clear search after adding
    setSearchTerm('');
    setShowSearchResults(false);

    // Background: fetch FEFO batch prices — compute per-batch breakdown + blended display price
    void getFefoBatches(medicine.id).then((batches) => {
      if (batches.length === 0) return;
      setCart((prev) =>
        prev.map((item) => {
          if (item.medicine.id !== medicine.id) return item;
          const breakdown = computeBatchBreakdown(batches, item.pills);
          const blended = computeBlendedPrice(batches, item.pills);
          if (blended <= 0 && breakdown.length === 0) return item;
          return recalculateSaleItem({
            ...item,
            unitPrice: blended > 0 ? blended : item.unitPrice,
            fefoBatches: batches,
            batchBreakdown: breakdown,
          });
        })
      );
    });
  }, [error, warning, getFefoBatches]);

  const handleSearch = useCallback(async (term: string) => {
    if (!term || term.trim().length === 0) {
      setShowSearchResults(false);
      return;
    }

    const requestSeq = ++searchRequestSeqRef.current;
    setIsSearching(true);
    setShowSearchResults(true);

    try {
      window.electron.ipcRenderer.once(
        'medicine-search-reply',
        (response: any) => {
          if (requestSeq !== searchRequestSeqRef.current) return;
          setIsSearching(false);
          if (response.success) {
            // Hide expired items from the selling panel search.
            const filtered = (response.data || []).filter(
              (medicine: Medicine) => (medicine.sellablePills ?? 0) > 0
            );
            setMedicines(filtered.slice(0, 100));
          }
        }
      );
      window.electron.ipcRenderer.sendMessage('medicine-search', [term.trim()]);
    } catch (error) {
      console.error('Error searching medicines:', error);
      if (requestSeq === searchRequestSeqRef.current) {
        setIsSearching(false);
      }
    }
  }, []);

  const handleBarcodeScan = useCallback(
    async (barcode: string) => {
      const normalized = normalizeScannedBarcode(barcode);
      if (!normalized) return;

      try {
        const response = (await window.electron.ipcRenderer.invoke(
          'medicine-get-by-barcode',
          normalized
        )) as {
          success: boolean;
          data?: Medicine | null;
          error?: string;
        };

        if (!response?.success) {
          error(response?.error || 'Error looking up barcode. Please try again.');
          setBarcodeInput('');
          return;
        }

        if (response.data) {
          const medicine = response.data as Medicine;
          if ((medicine.sellablePills ?? 0) > 0) {
            addToCart(medicine);
            setIsScanning(true);
            setBarcodeInput('');
            setSearchTerm('');
            setShowSearchResults(false);
            setHighlightedIndex(-1);
            setTimeout(() => {
              setIsScanning(false);
              setBarcodeScanMode(false);
              searchInputRef.current?.focus();
            }, 1000);
          } else {
            warning(
              `Medicine "${medicine.name}" is not eligible for sale (expired or insufficient stock).`
            );
            setBarcodeInput('');
            setSearchTerm('');
            setShowSearchResults(false);
            setHighlightedIndex(-1);
          }
        } else {
          error(`Medicine with barcode "${normalized}" not found!`);
          setBarcodeInput('');
          setSearchTerm('');
          setShowSearchResults(false);
          setHighlightedIndex(-1);
        }
      } catch (err) {
        console.error('Error scanning barcode:', err);
        error('Error looking up barcode. Please try again.');
        setBarcodeInput('');
      }
    },
    [addToCart, error, warning]
  );

  const updateCartItemField = useCallback(
    (medicineId: number, field: keyof CartItem, value: any) => {
      setCart((prevCart) =>
        prevCart.map((item) => {
          if (item.medicine.id !== medicineId) {
            return item;
          }

          let nextValue = value;
          if (field === 'pills') {
            if (value === '') {
              nextValue = 0;
            } else {
              nextValue = Math.max(0, parseInt(value, 10) || 0);
              const available = item.medicine.sellablePills ?? Infinity;
              if (nextValue > available) {
                warning(`Only ${available} pills available for sale!`);
                return item;
              }
            }
          }
          if (
            field === 'unitPrice' ||
            field === 'discount' ||
            field === 'tax'
          ) {
            if (field === 'discount' || field === 'tax') {
              // Round discount and tax to whole numbers
              nextValue = value === '' ? 0 : Math.max(0, Math.round(parseFloat(value) || 0));
            } else {
              nextValue = value === '' ? 0 : Math.max(0, parseFloat(value) || 0);
            }
          }

          const updatedItem: CartItem = recalculateSaleItem({
            ...item,
            [field]: nextValue,
          });
          return updatedItem;
        })
      );
    },
    [warning]
  );

  // Scroll highlighted item into view and focus it
  useEffect(() => {
    if (highlightedIndex >= 0 && dropdownItemRefs.current[highlightedIndex]) {
      const item = dropdownItemRefs.current[highlightedIndex];
      item?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
      // Focus the item for keyboard navigation
      item?.focus();
    }
  }, [highlightedIndex]);

  // Load medicines on mount
  useEffect(() => {
    loadMedicines();
  }, [loadMedicines]);

  // Load sales history with pagination (last 25 only for better performance)
  const loadSalesHistory = useCallback(async () => {
    try {
      const response = await getSalesFlatRows();
      if (response.success && response.data) {
        // Get recent sales (last 25) - already sorted by date
        const recent = response.data
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
          .slice(0, SALES_HISTORY_LIMIT);
        setSalesHistory(recent);
      }
    } catch (error) {
      console.error('Error loading sales history:', error);
    }
  }, []);

  // Load sales history on mount and after successful sale
  useEffect(() => {
    loadSalesHistory();
  }, [loadSalesHistory]);

  const loadCustomers = useCallback(() => {
    window.electron.ipcRenderer.once('customer-get-all-reply', (response: any) => {
      if (response.success) {
        setCustomers(response.data || []);
      }
    });
    window.electron.ipcRenderer.sendMessage('customer-get-all', []);
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  // Sync accurate next invoice number for new bills
  useEffect(() => {
    if (selectedSaleId === null) {
      if (salesHistory.length > 0) {
        const highestId = Math.max(...salesHistory.map((s) => s.saleId), 0);
        setInvoiceNumber(`INV-${String(highestId + 1).padStart(2, '0')}`);
      } else {
        setInvoiceNumber('INV-01');
      }
    }
  }, [salesHistory, selectedSaleId]);

  // Function to clear form for new bill
  const clearFormForNewBill = useCallback(() => {
    setSelectedSaleId(null);
    setQtyInputDraft({});
    setCart([]);
    setReturnedQuantities(new Map());
    setCurrentSaleReturnTotal(0);
    setCustomerName('');
    setCustomerPhone('');
    setSaleType('Regular');
    setPrescriptionNumber('');
    setDoctorName('');
    setReceivedAmount('');
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = now.toLocaleString('default', { month: 'short' });
    const year = now.getFullYear();
    setCurrentDate(`${day}/${month}/${year}`);
    setCurrentTime(
      now.toLocaleTimeString('en-US', {
        hour12: true,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    );
  }, []);

  // Group sales by saleId for history display
  const [saleReturnsMap, setSaleReturnsMap] = useState<Map<number, number>>(new Map());

  const salesHistoryList = useMemo(() => {
    const groupedSales = salesHistory.reduce((acc, sale) => {
      if (!acc[sale.saleId]) {
        acc[sale.saleId] = {
          saleId: sale.saleId,
          createdAt: sale.createdAt,
          customerName: sale.customerName || '',
          customerPhone: sale.customerPhone || '-',
          saleType: sale.saleType || 'Regular',
          additionalDiscount: sale.additionalDiscount || 0,
          additionalDiscountAmount: sale.additionalDiscountAmount || 0,
          items: [],
          total: 0,
        };
      }
      acc[sale.saleId].items.push(sale);
      acc[sale.saleId].total += sale.total;
      return acc;
    }, {} as Record<number, { saleId: number; createdAt: string; customerName: string; customerPhone: string; saleType?: string; additionalDiscount?: number; additionalDiscountAmount?: number; items: FlatSaleRow[]; total: number }>);

    // Subtract additional discount from each sale's total
    Object.values(groupedSales).forEach(sale => {
      const discountAmount = sale.additionalDiscountAmount ?? 0;
      if (discountAmount > 0) {
        sale.total -= discountAmount;
      }
    });

    return Object.values(groupedSales).sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [salesHistory]);

  const selectedSale = useMemo(() => {
    if (selectedSaleId === null) return null;
    return salesHistoryList.find((s) => s.saleId === selectedSaleId);
  }, [selectedSaleId, salesHistoryList]);

  // Load returns for all sales in history to show net totals
  useEffect(() => {
    const requestSeq = ++returnsRequestSeqRef.current;
    if (salesHistoryList.length === 0) {
      setSaleReturnsMap(new Map());
      return;
    }

    const loadReturnsForAllSales = async () => {
      const results = await Promise.all(
        salesHistoryList.map(async (sale) => {
          const returnsResponse = await getSaleReturnsBySaleId(sale.saleId);
          if (!returnsResponse.success || !returnsResponse.data) {
            return [sale.saleId, 0] as const;
          }
          const returnTotal = returnsResponse.data.reduce((sum, ret) => sum + ret.total, 0);
          return [sale.saleId, returnTotal] as const;
        })
      );

      if (requestSeq !== returnsRequestSeqRef.current) return;
      setSaleReturnsMap(new Map(results));
    };

    void loadReturnsForAllSales();
  }, [salesHistoryList]); // Fixed: Use full salesHistoryList instead of just length

  // Reset to new bill when sales history is loaded and no bill is selected
  useEffect(() => {
    if (
      salesHistoryList.length > 0 &&
      currentBillIndex === -1 &&
      selectedSaleId === null &&
      cart.length === 0
    ) {
      // Ensure date is today when starting fresh
      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const month = now.toLocaleString('default', { month: 'short' });
      const year = now.getFullYear();
      setCurrentDate(`${day}/${month}/${year}`);
    }
  }, [
    salesHistoryList.length,
    currentBillIndex,
    selectedSaleId,
    cart.length,
  ]);

  // Update time every second and date when it changes
  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();

      // Update date/time only when creating a new sale (no need to tick while viewing old ones)
      if (currentBillIndex === -1) {
        setCurrentTime(
          now.toLocaleTimeString('en-US', {
            hour12: true,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
        );
        const day = String(now.getDate()).padStart(2, '0');
        const month = now.toLocaleString('default', { month: 'short' });
        const year = now.getFullYear();
        const newDate = `${day}/${month}/${year}`;

        // Only update if date has changed
        if (currentDate !== newDate) {
          setCurrentDate(newDate);
        }
      }
    };

    // Update immediately
    updateDateTime();

    // Then update every second
    const timer = setInterval(updateDateTime, 1000);
    return () => clearInterval(timer);
  }, [currentBillIndex, currentDate]);

  // Check if medicines exist after loading, show seed button if empty
  useEffect(() => {
    const checkMedicines = () => {
      window.electron.ipcRenderer.once(
        'medicine-get-all-reply',
        (response: any) => {
          if (response.success) {
            const meds = response.data || [];
            setShowSeedButton(meds.length === 0);
          }
        }
      );
      window.electron.ipcRenderer.sendMessage('medicine-get-all', []);
    };

    // Check after initial load
    const timer = setTimeout(checkMedicines, 500);
    return () => clearTimeout(timer); // Cleanup timeout
  }, []);

  const seedSampleMedicines = useCallback(async () => {
    try {
      window.electron.ipcRenderer.once(
        'medicine-seed-sample-reply',
        (response: any) => {
          if (response.success) {
            alert(
              `Successfully added ${response.data.count} sample medicines!`
            );
            setShowSeedButton(false);
            loadMedicines(); // Reload medicines
          } else {
            alert(
              `Error adding sample medicines: ${response.error || 'Unknown error'
              }`
            );
          }
        }
      );
      window.electron.ipcRenderer.sendMessage('medicine-seed-sample', []);
    } catch (error) {
      console.error('Error seeding medicines:', error);
    }
  }, [loadMedicines]);

  // Auto-focus barcode input
  useEffect(() => {
    if (barcodeInputRef.current && !isScanning) {
      barcodeInputRef.current.focus();
    }
  }, [isScanning]);

  // Handle barcode scanning - Most scanners send data quickly, so we use a debounce
  // Only activate when barcode scan mode is enabled
  useEffect(() => {
    if (barcodeScanMode && barcodeInput.length > 0) {
      // Clear existing timeout
      if (barcodeTimeoutRef.current) {
        clearTimeout(barcodeTimeoutRef.current);
      }

      // Set new timeout - if no input for 200ms, treat as complete barcode
      // Barcode scanners typically send data very quickly, so this timeout catches the end
      barcodeTimeoutRef.current = setTimeout(() => {
        if (barcodeInput.trim().length > 0) {
          handleBarcodeScan(barcodeInput);
        }
      }, BARCODE_SCAN_TIMEOUT_MS);
    }

    return () => {
      if (barcodeTimeoutRef.current) {
        clearTimeout(barcodeTimeoutRef.current);
      }
    };
  }, [barcodeInput, handleBarcodeScan, barcodeScanMode]);

  // F2 — focus product search (label says F2; scanners often work without clicking the field)
  useEffect(() => {
    const onF2 = (event: KeyboardEvent) => {
      if (event.key !== 'F2') return;
      event.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    window.addEventListener('keydown', onF2, true);
    return () => window.removeEventListener('keydown', onF2, true);
  }, []);

  // Global barcode scanner: capture phase so keys are not lost when focus is outside Product (F2).
  // `data-wedge-typing` marks areas where normal keyboard typing must reach inputs (customer, cart, etc.).
  useEffect(() => {
    const SCAN_END_MS = BARCODE_SCAN_TIMEOUT_MS;

    const isWedgeTypingField = (el: EventTarget | null) =>
      el instanceof Element && el.closest('[data-wedge-typing="true"]') != null;

    const flushGlobalBarcode = (raw: string) => {
      const normalized = normalizeScannedBarcode(raw);
      if (!normalized || normalized.length < BARCODE_MIN_LENGTH) {
        globalBarcodeBufferRef.current = '';
        return;
      }
      globalBarcodeBufferRef.current = '';
      setSearchTerm(normalized);
      setShowSearchResults(true);
      setHighlightedIndex(-1);
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
      void handleBarcodeScan(normalized);
    };

    const handleGlobalKeydown = (event: KeyboardEvent) => {
      if (barcodeScanMode) return;

      const target = event.target as HTMLElement | null;
      if (target?.id === 'product-search' || target?.id === 'barcode-input') {
        return;
      }

      if (isWedgeTypingField(target)) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const tag = target?.tagName?.toLowerCase();
      const isEditable =
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        target?.isContentEditable;

      // Don't intercept typing in editable fields
      if (isEditable) {
        return;
      }

      if (event.key === 'Enter') {
        if (globalBarcodeBufferRef.current.length >= BARCODE_MIN_LENGTH) {
          flushGlobalBarcode(globalBarcodeBufferRef.current);
          event.preventDefault();
          event.stopPropagation();
        } else {
          globalBarcodeBufferRef.current = '';
        }
        return;
      }

      // Only capture single printable characters (not special keys)
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        event.stopPropagation();
        globalBarcodeBufferRef.current += event.key;
        if (globalBarcodeTimerRef.current) {
          clearTimeout(globalBarcodeTimerRef.current);
        }
        globalBarcodeTimerRef.current = setTimeout(() => {
          if (globalBarcodeBufferRef.current.length >= BARCODE_MIN_LENGTH) {
            flushGlobalBarcode(globalBarcodeBufferRef.current);
          } else {
            globalBarcodeBufferRef.current = '';
          }
        }, SCAN_END_MS);
      }
    };

    window.addEventListener('keydown', handleGlobalKeydown, true);

    return () => {
      window.removeEventListener('keydown', handleGlobalKeydown, true);
      if (globalBarcodeTimerRef.current) {
        clearTimeout(globalBarcodeTimerRef.current);
      }
      globalBarcodeBufferRef.current = '';
    };
  }, [handleBarcodeScan, barcodeScanMode]);

  // Debounce search to prevent firing on every keystroke
  const debouncedSearch = useRef<NodeJS.Timeout | null>(null);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setSearchTerm(value);
    setHighlightedIndex(-1); // Reset highlight when search changes

    // Clear previous timeout
    if (debouncedSearch.current) {
      clearTimeout(debouncedSearch.current);
    }

    // Set new timeout - only search after 300ms of no typing
    debouncedSearch.current = setTimeout(() => {
      handleSearch(value);
    }, SEARCH_DEBOUNCE_MS);
  };

  // Cleanup debounced search on unmount
  useEffect(() => {
    return () => {
      if (debouncedSearch.current) {
        clearTimeout(debouncedSearch.current);
      }
    };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab' && showSearchResults && medicines.length > 0) {
      // Prevent default Tab behavior to keep dropdown open
      e.preventDefault();
      if (highlightedIndex === -1) {
        // First Tab: move to first item
        setHighlightedIndex(0);
        setShowSearchResults(true);
      } else if (e.shiftKey) {
        // Shift+Tab: move to previous item or back to input
        if (highlightedIndex > 0) {
          setHighlightedIndex(highlightedIndex - 1);
        } else {
          setHighlightedIndex(-1);
        }
        return;
      }
      // Tab: move to next item
      if (highlightedIndex < medicines.length - 1) {
        setHighlightedIndex(highlightedIndex + 1);
      }
      return;
    }

    // Enter: prefer explicit dropdown selection; else barcode (scanner types into this field)
    if (e.key === 'Enter') {
      if (showSearchResults && medicines.length > 0 && highlightedIndex >= 0) {
        e.preventDefault();
        const medicine = medicines[highlightedIndex];
        if (medicine && (medicine.sellablePills ?? 0) > 0) {
          addToCart(medicine);
          setSearchTerm('');
          setShowSearchResults(false);
          setHighlightedIndex(-1);
        }
        return;
      }
      if (looksLikeBarcodeInput(searchTerm)) {
        e.preventDefault();
        handleBarcodeScan(searchTerm);
        return;
      }
      if (showSearchResults && medicines.length === 1) {
        const medicine = medicines[0];
        if (medicine && (medicine.sellablePills ?? 0) > 0) {
          e.preventDefault();
          addToCart(medicine);
          setSearchTerm('');
          setShowSearchResults(false);
          setHighlightedIndex(-1);
        }
        return;
      }
    }

    if (!showSearchResults || medicines.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < medicines.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Escape') {
      setShowSearchResults(false);
      setHighlightedIndex(-1);
    }
  };

  const addToCartWithFeedback = useCallback(
    (medicine: Medicine, quantity?: number) => {
      addToCart(medicine, quantity);
      setShowSearchResults(false);
      setSearchTerm('');
      if (searchInputRef.current) {
        searchInputRef.current.focus();
      }
    },
    [addToCart]
  );

  const removeFromCart = async (medicineId: number) => {
    clearQtyDraft(medicineId);

    const nextCart = cart.filter((item) => item.medicine.id !== medicineId);

    // New bill: local cart removal only.
    if (currentBillIndex < 0 || !selectedSaleId) {
      setCart(nextCart);
      return;
    }

    // Editing a history sale: persist immediately.
    if (isCashier && !isWithin24Hours(selectedSale?.createdAt)) {
      return;
    }

    // Warn if this medicine has return records that will also be deleted.
    const returnedQtyForItem = returnedQuantities.get(medicineId) || 0;
    if (returnedQtyForItem > 0) {
      const itemName = cart.find(i => i.medicine.id === medicineId)?.medicine.name || 'this medicine';
      setRemoveLineConfirm({
        medicineId,
        itemName,
        returnedQty: returnedQtyForItem,
      });
      return;
    }

    await performPersistedLineRemoval(medicineId);
  };

  const updateCartQuantity = (medicineId: number, change: number) => {
    clearQtyDraft(medicineId);
    setCart((prevCart) => {
      return prevCart
        .map((item) => {
          if (item.medicine.id === medicineId) {
            const available = item.medicine.sellablePills ?? Infinity;
            const newQuantity = item.pills + change;
            if (newQuantity <= 0) return null;
            if (newQuantity > available) {
              warning(`Only ${available} pills available in stock!`);
              return item;
            }
            const blended = item.fefoBatches ? computeBlendedPrice(item.fefoBatches, newQuantity) : 0;
            const breakdown = item.fefoBatches ? computeBatchBreakdown(item.fefoBatches, newQuantity) : undefined;
            return recalculateSaleItem({
              ...item,
              pills: newQuantity,
              ...(blended > 0 ? { unitPrice: blended } : {}),
              batchBreakdown: breakdown,
            });
          }
          return item;
        })
        .filter((item): item is CartItem => item !== null);
    });
  };

  const setCartItemQuantity = (medicineId: number, quantity: number) => {
    clearQtyDraft(medicineId);
    const finalQuantity = isNaN(quantity) ? 0 : quantity;

    setCart((prevCart) => {
      return prevCart.map((item) => {
        if (item.medicine.id === medicineId) {
          const available = item.medicine.sellablePills ?? Infinity;
          const clampedQty = finalQuantity > available ? available : finalQuantity;
          if (finalQuantity > available) {
            warning(`Only ${available} pills available in stock!`);
          }
          const blended = item.fefoBatches ? computeBlendedPrice(item.fefoBatches, clampedQty) : 0;
          const breakdown = item.fefoBatches ? computeBatchBreakdown(item.fefoBatches, clampedQty) : undefined;
          return recalculateSaleItem({
            ...item,
            pills: clampedQty,
            ...(blended > 0 ? { unitPrice: blended } : {}),
            batchBreakdown: breakdown,
          });
        }
        return item;
      });
    });
  };

  const calculateTotal = () => {
    return grandTotal;
  };

  const handleCheckout = async () => {
    if (cart.length === 0) {
      alert('Cart is empty!');
      return;
    }

    setProcessing(true);

    try {
      // Flatten cart items: multi-batch items become separate sale_items with exact batch prices.
      const saleItems = cart.flatMap((item) => {
        const breakdown = item.batchBreakdown;
        if (breakdown && breakdown.length > 1) {
          return breakdown.map((seg) => {
            const segSubtotal = seg.pills * seg.price;
            const discountAmt = (segSubtotal * (item.discount || 0)) / 100;
            const taxAmt = ((segSubtotal - discountAmt) * (item.tax || 0)) / 100;
            return {
              medicineId: item.medicine.id,
              medicineName: item.medicine.name,
              pills: seg.pills,
              unitPrice: seg.price,
              discountAmount: discountAmt,
              taxAmount: taxAmt,
            };
          });
        }
        return [{
          medicineId: item.medicine.id,
          medicineName: item.medicine.name,
          pills: item.pills,
          unitPrice: item.batchBreakdown && item.batchBreakdown.length === 1
            ? item.batchBreakdown[0].price
            : item.unitPrice,
          discountAmount: item.discountAmount || 0,
          taxAmount: item.taxAmount || 0,
        }];
      });

      const sale = {
        items: saleItems,
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        saleType: saleType || 'Regular',
        additionalDiscount: 0,
        prescriptionNumber: prescriptionNumber.trim() || undefined,
        doctorName: doctorName.trim() || undefined,
      };

      // Check if we're updating an existing sale or creating a new one
      if (currentBillIndex >= 0 && selectedSaleId) {
        // Update existing sale
        const result = await updateSale(selectedSaleId, sale);
        setProcessing(false);
        if (result.success) {
          setShowSuccess(true);
          loadMedicines(); // Reload medicines to update quantities
          loadSalesHistory(); // Reload sales history
          refreshExpiringAlerts();
          // Keep viewing the updated sale
          setTimeout(() => {
            setShowSuccess(false);
          }, SUCCESS_MESSAGE_DURATION_MS);
        } else {
          alert(`Error updating sale: ${result.error || 'Unknown error'}`);
        }
      } else {
        // Create new sale
        window.electron.ipcRenderer.once('sale-create-reply', (response: any) => {
          setProcessing(false);
          if (response.success) {
            // Print a thermal receipt for this sale before clearing the cart
            try {
              handlePrintInvoice();
            } catch (printError) {
              console.error('Error printing thermal receipt:', printError);
            }

            setShowSuccess(true);
            setCart([]);
            setReturnedQuantities(new Map());
            setCustomerName('');
            setCustomerPhone('');
            setBarcodeInput('');
            setSelectedSaleId(null); // Clear selection after successful sale
            setCurrentBillIndex(-1); // Reset to new bill
            // Generate new invoice number
            const timestamp = Date.now();
            setInvoiceNumber(`INV-${timestamp.toString().slice(-6)}`);
            loadMedicines(); // Reload medicines to update quantities
            loadSalesHistory(); // Reload sales history
            refreshExpiringAlerts();
            setTimeout(() => {
              setShowSuccess(false);
              if (barcodeInputRef.current) {
                barcodeInputRef.current.focus();
              }
            }, SUCCESS_MESSAGE_DURATION_MS);
          } else {
            alert(`Error processing sale: ${response.error || 'Unknown error'}`);
          }
        });

        window.electron.ipcRenderer.sendMessage('sale-create', [sale]);
      }
    } catch (error) {
      console.error('Error processing sale:', error);
      setProcessing(false);
      alert('Error processing sale. Please try again.');
    }
  };

  const handlePrintInvoice = useCallback(() => {
    if (cart.length === 0) {
      alert('Add medicines to the cart to print an invoice.');
      return;
    }
    // Always read latest from Settings so receipt reflects current pharmacy details
    const pharmacyInfo = getStoredPharmacySettings();

    // Calculate values locally to avoid dependency issues
    const localSubtotal = cart.reduce((sum, item) => {
      const returned = returnedQuantities.get(item.medicine.id) || 0;
      const netPills = item.pills - (currentBillIndex >= 0 ? returned : 0);
      return sum + (item.unitPrice * netPills);
    }, 0);

    const localDiscount = cart.reduce((sum, item) => {
      const returned = returnedQuantities.get(item.medicine.id) || 0;
      const netPills = item.pills - (currentBillIndex >= 0 ? returned : 0);
      const itemSubtotal = item.unitPrice * netPills;
      return sum + ((itemSubtotal * item.discount) / 100);
    }, 0);

    const localTax = cart.reduce((sum, item) => {
      const returned = returnedQuantities.get(item.medicine.id) || 0;
      const netPills = item.pills - (currentBillIndex >= 0 ? returned : 0);
      const itemSubtotal = item.unitPrice * netPills;
      const itemDiscount = (itemSubtotal * item.discount) / 100;
      const discountedAmount = itemSubtotal - itemDiscount;
      return sum + ((discountedAmount * item.tax) / 100);
    }, 0);

    const amountGivenForReceipt =
      currentBillIndex === -1 && receivedAmount && !Number.isNaN(Number(receivedAmount))
        ? Number(receivedAmount)
        : localSubtotal - localDiscount + localTax;

    const html = buildThermalReceiptHtml(
      {
        cart: cart.map((item) => ({
          medicine: {
            id: item.medicine.id,
            name: item.medicine.name,
            barcode: item.medicine.barcode,
          },
          pills: item.pills,
          unitPrice: item.unitPrice,
          discount: item.discount,
          tax: item.tax,
        })),
        pharmacyInfo: {
          pharmacyName: pharmacyInfo.pharmacyName,
          address: pharmacyInfo.address,
          phone: pharmacyInfo.phone,
          email: pharmacyInfo.email,
          website: pharmacyInfo.website,
          taxId: pharmacyInfo.taxId,
          tagline: pharmacyInfo.tagline,
          logoUrl: pharmacyInfo.logoUrl,
          currency: pharmacyInfo.currency,
          invoiceNotes: pharmacyInfo.invoiceNotes,
        },
        customerName,
        customerPhone,
        currentBillIndex,
        returnedQuantities,
        saleType,
        additionalDiscount: 0,
        amountGiven: amountGivenForReceipt,
      },
      // The HTML printer script + our iframe onload print can both fire.
      // We only print from the iframe onload handler.
      { includePrintScript: false, showBarcode: RECEIPT_PREVIEW_MODE }
    );
    if (!html) return;
    if (RECEIPT_PREVIEW_MODE) {
      setReceiptPreviewHtml(html);
    } else {
      const printFrame = document.createElement('iframe');
      printFrame.style.cssText =
        'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
      document.body.appendChild(printFrame);
      const frameDoc = printFrame.contentWindow?.document;
      if (!frameDoc) {
        alert('Unable to prepare invoice for printing.');
        document.body.removeChild(printFrame);
        return;
      }
      printFrame.onload = () => {
        printFrame.contentWindow?.focus();
        printFrame.contentWindow?.print();
        setTimeout(() => document.body.removeChild(printFrame), PRINT_FRAME_CLEANUP_MS);
      };
      frameDoc.open();
      frameDoc.write(html);
      frameDoc.close();
    }
  }, [cart, customerName, customerPhone, currentBillIndex, returnedQuantities, receivedAmount, saleType]);

  const clearCart = () => {
    if (window.confirm('Clear cart and start a new sale?')) {
      setCart([]);
      setReturnedQuantities(new Map());
      setSelectedSaleId(null);
      setCurrentBillIndex(-1);
      clearFormForNewBill();
    }
  };

  // Memoize cart totals to prevent recalculation on every render
  const subtotalValue = useMemo(() => {
    return cart.reduce((sum, item) => {
      // item.pills = originalPills when viewing history; net pills for new bills
      return sum + (item.unitPrice * item.pills);
    }, 0);
  }, [cart]);

  const discountValue = useMemo(() => {
    return cart.reduce((sum, item) => {
      const netPills = item.pills;
      const itemSubtotal = item.unitPrice * netPills;
      return sum + ((itemSubtotal * item.discount) / 100);
    }, 0);
  }, [cart]);

  const taxValue = useMemo(() => {
    return cart.reduce((sum, item) => {
      const netPills = item.pills;
      const itemSubtotal = item.unitPrice * netPills;
      const itemDiscount = (itemSubtotal * item.discount) / 100;
      const discountedAmount = itemSubtotal - itemDiscount;
      return sum + ((discountedAmount * item.tax) / 100); // Tax on discounted amount
    }, 0);
  }, [cart]);

  const grandTotal = useMemo(() => {
    return subtotalValue - discountValue + taxValue;
  }, [subtotalValue, discountValue, taxValue]);

  // Memoize net payable: grandTotal holds original total (based on originalPills),
  // so we subtract the returned amount to get the true net payable.
  const netPayable = useMemo(() => {
    return Math.max(0, grandTotal - currentSaleReturnTotal);
  }, [grandTotal, currentSaleReturnTotal]);

  // Memoize return amount calculation
  const returnAmount = useMemo(() => {
    if (!receivedAmount || receivedAmount === '') return 0;
    return Number(receivedAmount) - netPayable;
  }, [receivedAmount, netPayable]);

  const formatCurrency = useCallback((value: number) => {
    const currency = pharmacyInfo.currency || 'USD';
    const symbol = getSymbol(currency);
    if (currency === 'INR' || currency === 'PKR') {
      return `${symbol}${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
  }, [pharmacyInfo.currency]);

  // Function to load sale details into the form
  const loadSaleDetails = useCallback(
      async (sale: { saleId: number; createdAt: string; customerName: string; customerPhone: string; saleType?: string; items: FlatSaleRow[]; total: number }, index?: number) => {
        setSelectedSaleId(sale.saleId);

        // Set customer information
        setCustomerName(sale.customerName || '');
        setCustomerPhone(sale.customerPhone || '0000');
        setSaleType(sale.saleType || 'Regular');
        setInvoiceNumber(`INV-${sale.saleId}`);

        // Set date and time from sale
        const saleDate = new Date(sale.createdAt);
        const day = String(saleDate.getDate()).padStart(2, '0');
        const month = saleDate.toLocaleString('default', { month: 'short' });
        const year = saleDate.getFullYear();
        setCurrentDate(`${day}/${month}/${year}`);
        setCurrentTime(
          saleDate.toLocaleTimeString('en-US', {
            hour12: true,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
        );

        // Fetch returns for this sale to show returned quantities
        const returnsResponse = await getSaleReturnsBySaleId(sale.saleId);
        const returnedByMedicine = new Map<number, number>();
        let totalReturned = 0;

        if (returnsResponse.success && returnsResponse.data) {
          returnsResponse.data.forEach((ret) => {
            totalReturned += ret.total;
            ret.items.forEach((item) => {
              const current = returnedByMedicine.get(item.medicineId) || 0;
              returnedByMedicine.set(item.medicineId, current + item.pills);
            });
          });
        }

        // Load cart items from sale items
        const cartItems: CartItem[] = sale.items.map((item) => {
          // Find the medicine in the medicines list
          const medicine = medicines.find((m) => m.id === item.medicineId);

          // If medicine not found, create a placeholder medicine object
          const medicineObj: Medicine = medicine || {
            id: item.medicineId,
            name: item.medicineName,
            pillQuantity: 0,
            status: 'active',
            sellablePills: 0,
            totalAvailablePills: 0,
            averageSellablePricePerPill: item.unitPrice,
          };

          // Use ORIGINAL quantities so QTY column shows what was actually sold (e.g. 10)
          // The RET. column shows how many were returned (e.g. 8)
          // Amount column computes net: (origPills - returnedQty) × unitPrice
          const origPills = item.originalPills || item.pills;
          const origDiscountAmt = item.originalDiscountAmount ?? item.discountAmount;
          const origTaxAmt = item.originalTaxAmount ?? item.taxAmount;
          const origTotal = item.originalTotal ?? item.total;

          // The user specifically requested that historical bills show the PRE-DISCOUNT
          // original per-pill price, even if the database occasionally stores it as a net value.
          // By reversing the subtotal, we guarantee the display matches the original sale expectation.
          const originalSubtotal = item.originalSubtotal || item.subtotal;
          const derivedUnitPrice = origPills > 0 ? Number((originalSubtotal / origPills).toFixed(2)) : item.unitPrice;

          const subtotal = derivedUnitPrice * origPills;
          const discountPercent =
            subtotal > 0 ? (origDiscountAmt / subtotal) * 100 : 0;

          const taxableBase = subtotal - origDiscountAmt;
          const taxPercent =
            taxableBase > 0 ? (origTaxAmt / taxableBase) * 100 : 0;

          const cartItem: CartItem = {
            medicine: medicineObj,
            pills: origPills,
            unitPrice: derivedUnitPrice,
            discount: discountPercent,
            tax: taxPercent,
            subtotal,
            discountAmount: origDiscountAmt,
            taxAmount: origTaxAmt,
            finalPrice: origTotal,
          };

          return recalculateSaleItem(cartItem);
        });

        setQtyInputDraft({});
        setCart(cartItems);
        setReturnedQuantities(returnedByMedicine);
        setCurrentSaleReturnTotal(totalReturned);

        // Set current bill index if provided
        if (index !== undefined) {
          setCurrentBillIndex(index);
        }

        // Scroll to top of cart section
        setTimeout(() => {
          const cartSection = document.querySelector('[data-cart-section]');
          if (cartSection) {
            cartSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 100);
      },
      [medicines]
    );

  // Navigate to previous bill
  const navigateToPreviousBill = useCallback(() => {
    if (salesHistoryList.length === 0) return;

    let newIndex: number;
    if (currentBillIndex === -1) {
      // Currently on new bill, go to latest (index 0)
      newIndex = 0;
    } else if (currentBillIndex < salesHistoryList.length - 1) {
      // Go to previous (older) bill - move to higher index
      newIndex = currentBillIndex + 1;
    } else {
      // Already at oldest, do nothing
      return;
    }

    const sale = salesHistoryList[newIndex];
    if (sale) {
      loadSaleDetails(sale, newIndex);
    }
  }, [currentBillIndex, salesHistoryList, loadSaleDetails]);

  // Navigate to next bill
  const navigateToNextBill = useCallback(() => {
    if (salesHistoryList.length === 0) return;

    if (currentBillIndex === -1) {
      // Already at new bill, do nothing
      return;
    }

    if (currentBillIndex > 0) {
      // Go to next (newer) bill - move to lower index
      const newIndex = currentBillIndex - 1;
      const sale = salesHistoryList[newIndex];
      if (sale) {
        loadSaleDetails(sale, newIndex);
      }
    } else {
      // At latest bill, go to new bill
      clearFormForNewBill();
      setCurrentBillIndex(-1);
    }
  }, [
    currentBillIndex,
    salesHistoryList,
    loadSaleDetails,
    clearFormForNewBill,
  ]);

  // Handle opening return modal
  const handleOpenReturnModal = useCallback(async () => {
    if (!selectedSaleId || !selectedSale || selectedSale.items.length === 0) {
      alert('Please select a sale first');
      return;
    }

    // Check for existing returns
    try {
      const existingReturns = await getSaleReturnsBySaleId(selectedSaleId);
      if (existingReturns.success && existingReturns.data) {
        // Calculate already returned quantities
        const returnedByMedicine = new Map<number, number>();
        existingReturns.data.forEach((ret) => {
          ret.items.forEach((item) => {
            const current = returnedByMedicine.get(item.medicineId) || 0;
            returnedByMedicine.set(item.medicineId, current + item.pills);
          });
        });

        const soldByMedicine = new Map<number, {
          medicineId: number;
          medicineName: string;
          soldPills: number;
          subtotal: number;
          discountAmount: number;
          taxAmount: number;
        }>();
        selectedSale.items.forEach((item) => {
          const soldPills = item.originalPills || item.pills || 0;
          const subtotal = item.originalSubtotal || item.subtotal || 0;
          const discountAmount = item.originalDiscountAmount ?? item.discountAmount ?? 0;
          const taxAmount = item.originalTaxAmount ?? item.taxAmount ?? 0;
          const existing = soldByMedicine.get(item.medicineId);
          if (existing) {
            existing.soldPills += soldPills;
            existing.subtotal += subtotal;
            existing.discountAmount += discountAmount;
            existing.taxAmount += taxAmount;
          } else {
            soldByMedicine.set(item.medicineId, {
              medicineId: item.medicineId,
              medicineName: item.medicineName,
              soldPills,
              subtotal,
              discountAmount,
              taxAmount,
            });
          }
        });

        const items = Array.from(soldByMedicine.values()).map((item) => {
          const alreadyReturned = returnedByMedicine.get(item.medicineId) || 0;
          const availableToReturn = Math.max(0, item.soldPills - alreadyReturned);
          const unitPrice = item.soldPills > 0 ? item.subtotal / item.soldPills : 0;
          const discountPerUnit = item.soldPills > 0 ? item.discountAmount / item.soldPills : 0;
          const taxPerUnit = item.soldPills > 0 ? item.taxAmount / item.soldPills : 0;
          return {
            medicineId: item.medicineId,
            medicineName: item.medicineName,
            originalPills: item.soldPills,
            availableToReturn,
            returnPills: 0,
            unitPrice,
            discountPerUnit,
            taxPerUnit,
            reason: '',
          };
        }).filter(item => item.availableToReturn > 0);

        if (items.length === 0) {
          alert('No items available to return from this sale');
          return;
        }

        setReturnItems(items);
        setShowReturnModal(true);
      }
    } catch (error) {
      console.error('Error checking existing returns:', error);
      // Still allow return creation (start with 0 - user selects)
      const soldByMedicine = new Map<number, {
        medicineId: number;
        medicineName: string;
        soldPills: number;
        subtotal: number;
        discountAmount: number;
        taxAmount: number;
      }>();
      selectedSale.items.forEach((item) => {
        const soldPills = item.originalPills || item.pills || 0;
        const subtotal = item.originalSubtotal || item.subtotal || 0;
        const discountAmount = item.originalDiscountAmount ?? item.discountAmount ?? 0;
        const taxAmount = item.originalTaxAmount ?? item.taxAmount ?? 0;
        const existing = soldByMedicine.get(item.medicineId);
        if (existing) {
          existing.soldPills += soldPills;
          existing.subtotal += subtotal;
          existing.discountAmount += discountAmount;
          existing.taxAmount += taxAmount;
        } else {
          soldByMedicine.set(item.medicineId, {
            medicineId: item.medicineId,
            medicineName: item.medicineName,
            soldPills,
            subtotal,
            discountAmount,
            taxAmount,
          });
        }
      });

      const items = Array.from(soldByMedicine.values()).map((item) => {
        const unitPrice = item.soldPills > 0 ? item.subtotal / item.soldPills : 0;
        const discountPerUnit = item.soldPills > 0 ? item.discountAmount / item.soldPills : 0;
        const taxPerUnit = item.soldPills > 0 ? item.taxAmount / item.soldPills : 0;
        return {
          medicineId: item.medicineId,
          medicineName: item.medicineName,
          originalPills: item.soldPills,
          availableToReturn: item.soldPills,
          returnPills: 0,
          unitPrice,
          discountPerUnit,
          taxPerUnit,
          reason: '',
        };
      }).filter(item => item.availableToReturn > 0);
      setReturnItems(items);
      setShowReturnModal(true);
    }
  }, [selectedSaleId, selectedSale]);

  // Handle processing return
  const handleProcessReturn = useCallback(async () => {
    if (!selectedSaleId) {
      alert('No sale selected');
      return;
    }

    const itemsToReturn = returnItems.filter(item => item.returnPills > 0);
    if (itemsToReturn.length === 0) {
      alert('Please select at least one item to return');
      return;
    }

    setProcessingReturn(true);
    try {
      const returnData = {
        saleId: selectedSaleId,
        items: itemsToReturn.map(item => ({
          medicineId: item.medicineId,
          medicineName: item.medicineName,
          pills: item.returnPills,
          unitPrice: Number(item.unitPrice.toFixed(2)),
          discountAmount: Number((item.discountPerUnit * item.returnPills).toFixed(2)),
          taxAmount: Number((item.taxPerUnit * item.returnPills).toFixed(2)),
          reason: item.reason || undefined,
        })),
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        reason: returnReason || undefined,
        notes: returnNotes || undefined,
      };

      const result = await createSaleReturn(returnData);
      if (result.success) {
        alert('Return processed successfully!');
        setShowReturnModal(false);
        setReturnItems([]);
        setReturnReason('');
        setReturnNotes('');

        // Refresh local returned quantities for the current sale immediately
        if (selectedSaleId) {
          const returnsResp = await getSaleReturnsBySaleId(selectedSaleId);
          if (returnsResp.success && returnsResp.data) {
            const returnedByMed = new Map<number, number>();
            returnsResp.data.forEach((ret) => {
              ret.items.forEach((it) => {
                const cur = returnedByMed.get(it.medicineId) || 0;
                returnedByMed.set(it.medicineId, cur + it.pills);
              });
            });
            setReturnedQuantities(returnedByMed);
          }
        }

        loadMedicines(); // Reload medicines to update stock
        loadSalesHistory(); // Reload sales history list
        refreshExpiringAlerts();
      } else {
        alert(`Error processing return: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error processing return:', error);
      alert('Error processing return. Please try again.');
    } finally {
      setProcessingReturn(false);
    }
  }, [selectedSaleId, returnItems, customerName, customerPhone, returnReason, returnNotes, loadMedicines, loadSalesHistory, refreshExpiringAlerts]);

  // Helper function to check if a date is today
  const isToday = (dateString: string): boolean => {
    try {
      const date = new Date(dateString);
      const today = new Date();

      // Compare year, month, and day
      return (
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate()
      );
    } catch (error) {
      console.error('Error checking if date is today:', error);
      return false;
    }
  };

  const canCurrentUserDeleteSale = useCallback((saleDate: string): boolean => {
    if (!isCashier) {
      return isToday(saleDate);
    }
    return isWithin24Hours(saleDate);
  }, [isCashier, isWithin24Hours]);

  const requestDeleteSale = useCallback((saleId: number, saleDate: string) => {
    if (!canCurrentUserDeleteSale(saleDate)) {
      alert(isCashier ? 'Cashiers can only delete sales created within 24 hours' : 'You can only delete sales created today');
      return;
    }
    setSaleDeleteConfirm({ saleId, saleDate });
  }, [canCurrentUserDeleteSale, isCashier]);

  // Handle delete sale
  const handleDeleteSale = useCallback(async (saleId: number) => {
    try {
      window.electron.ipcRenderer.once('sale-delete-reply', (response: any) => {
        setSaleDeleteConfirm(null);
        if (response.success) {
          alert('Sale deleted successfully!');
          // If the deleted sale was selected, clear the form
          if (selectedSaleId === saleId) {
            clearFormForNewBill();
            setCurrentBillIndex(-1);
            setSelectedSaleId(null);
          }
          loadMedicines(); // Reload medicines to update stock
          loadSalesHistory(); // Reload sales history
          refreshExpiringAlerts();
        } else {
          alert(`Error deleting sale: ${response.error || 'Unknown error'}`);
        }
      });
      window.electron.ipcRenderer.sendMessage('sale-delete', [saleId]);
    } catch (error) {
      console.error('Error deleting sale:', error);
      alert('Error deleting sale. Please try again.');
    }
  }, [selectedSaleId, loadMedicines, loadSalesHistory, refreshExpiringAlerts, clearFormForNewBill]);

  /** After user confirms (or when no return rows exist), persist removing one line from an edited sale. */
  const performPersistedLineRemoval = useCallback(
    async (medicineId: number) => {
      const nextCart = cart.filter((item) => item.medicine.id !== medicineId);

      if (nextCart.length === 0) {
        if (selectedSale) {
          requestDeleteSale(selectedSale.saleId, selectedSale.createdAt);
        }
        return;
      }

      setProcessing(true);
      try {
        const saleItems = nextCart.flatMap((item) => {
          const breakdown = item.batchBreakdown;
          if (breakdown && breakdown.length > 1) {
            return breakdown.map((seg) => {
              const segSubtotal = seg.pills * seg.price;
              const discountAmt = (segSubtotal * (item.discount || 0)) / 100;
              const taxAmt = ((segSubtotal - discountAmt) * (item.tax || 0)) / 100;
              return {
                medicineId: item.medicine.id,
                medicineName: item.medicine.name,
                pills: seg.pills,
                unitPrice: seg.price,
                discountAmount: discountAmt,
                taxAmount: taxAmt,
              };
            });
          }
          return [{
            medicineId: item.medicine.id,
            medicineName: item.medicine.name,
            pills: item.pills,
            unitPrice: item.batchBreakdown && item.batchBreakdown.length === 1
              ? item.batchBreakdown[0].price
              : item.unitPrice,
            discountAmount: item.discountAmount || 0,
            taxAmount: item.taxAmount || 0,
          }];
        });

        const sale = {
          items: saleItems,
          customerName: customerName || undefined,
          customerPhone: customerPhone || undefined,
          saleType: saleType || 'Regular',
          additionalDiscount: 0,
          prescriptionNumber: prescriptionNumber.trim() || undefined,
          doctorName: doctorName.trim() || undefined,
        };

        const result = await updateSale(selectedSaleId!, sale);
        if (result.success) {
          setCart(nextCart);
          loadMedicines();
          loadSalesHistory();
          refreshExpiringAlerts();
        } else {
          alert(`Error updating sale: ${result.error || 'Unknown error'}`);
        }
      } catch (error) {
        console.error('Error updating sale after removing item:', error);
        alert('Error updating sale. Please try again.');
      } finally {
        setProcessing(false);
      }
    },
    [
      cart,
      selectedSale,
      selectedSaleId,
      customerName,
      customerPhone,
      saleType,
      prescriptionNumber,
      doctorName,
      requestDeleteSale,
      loadMedicines,
      loadSalesHistory,
      refreshExpiringAlerts,
    ]
  );

  const currencyCode = pharmacyInfo.currency || 'USD';
  const symbol = getSymbol(currencyCode);

  /** Active new sale: larger, spaced summary (not viewing history / returns). */
  const expandedSaleSummary = currentBillIndex === -1 && cart.length > 0;

  return (
    <div className="h-[calc(100vh-80px)] w-full bg-gradient-to-br from-gray-50 via-gray-50 to-gray-100/50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800/80 overflow-hidden flex flex-col p-2 relative">
      <div className="fixed top-20 right-4 z-[100] pointer-events-none">
        <div className="pointer-events-auto">
          <ToastContainer toasts={toasts} onClose={removeToast} />
        </div>
      </div>
      {/* Success Message */}
      {showSuccess && (
        <div className="fixed top-4 right-4 z-50 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm">
          <FiCheck className="w-4 h-4" />
          <span className="font-medium">Sale completed successfully!</span>
        </div>
      )}

      {/* Add Medicine Modal - Removed, using inline dropdown instead */}
      {false && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Add Medicine
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setShowSearchResults(false);
                  }}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <FiX className="w-6 h-6 text-gray-600 dark:text-gray-300" />
                </button>
              </div>
            </div>
            <div className="p-6 flex-1 overflow-y-auto">
              <div className="relative mb-4">
                <FiSearch className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  onChange={handleSearchChange}
                  onFocus={() => setShowSearchResults(true)}
                  onInput={(e) => {
                    if ((e.target as HTMLInputElement).value) {
                      setShowSearchResults(true);
                    }
                  }}
                  placeholder="Search medicines by name, barcode, or description..."
                  className="w-full pl-12 pr-4 py-3 border-2 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                />
                {isSearching && (
                  <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
                    <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>

              {/* Recently Selected Medicines */}
              {!searchTerm && recentlySelectedMedicines.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">
                    Recently Selected
                  </h3>
                  <div className="grid grid-cols-1 gap-1.5 max-h-80 overflow-y-auto">
                    {recentlySelectedMedicines
                      .slice(0, 10)
                      .map((medicineId) => {
                        const medicine = medicines.find(
                          (m) => m.id === medicineId
                        );
                        if (!medicine) return null;
                        return (
                          <div
                            key={medicine.id}
                            role="button"
                            tabIndex={0}
                            className="p-2.5 border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors flex items-center justify-between"
                            onClick={() => addToCart(medicine)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                addToCart(medicine);
                              }
                            }}
                          >
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {medicine.name}
                                {medicineCompanyLine(medicine) !== '—' && (
                                  <span className="font-normal text-gray-500 dark:text-gray-400">
                                    {' '}
                                    — {medicineCompanyLine(medicine)}
                                  </span>
                                )}
                              </h3>
                              <div className="flex items-center gap-3 mt-1 flex-wrap">
                                {medicine.barcode && (
                                  <p
                                    className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[10rem]"
                                    title={medicine.barcode}
                                  >
                                    Barcode: {formatBarcodePreview(medicine.barcode)}
                                  </p>
                                )}
                                <span className="text-xs font-semibold text-green-600 dark:text-green-400">
                                  {(
                                    medicine.averageSellablePricePerPill || 0
                                  ).toFixed(1)}
                                </span>
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${(medicine.sellablePills ?? 0) > 0
                                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                    }`}
                                >
                                  {(medicine.sellablePills ?? 0) > 0
                                    ? (medicine.criticalExpiryPills ?? 0) > 0
                                      ? `Critical: ${medicine.sellablePills ?? 0}`
                                      : (medicine.nearExpiryPills ?? 0) > 0
                                        ? `Near expiry: ${medicine.sellablePills ?? 0}`
                                        : `Stock: ${medicine.sellablePills ?? 0}`
                                    : (medicine.totalAvailablePills ?? 0) > 0
                                      ? 'Out of date / expired'
                                      : 'Stock: 0'}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                addToCart(medicine);
                              }}
                              disabled={(medicine.sellablePills ?? 0) === 0}
                              className="ml-3 px-3 py-1.5 bg-emerald-600 dark:bg-emerald-500 text-white rounded-md hover:bg-emerald-700 dark:hover:bg-emerald-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 text-xs font-medium flex-shrink-0"
                            >
                              <FiPlus className="w-3 h-3" />
                              Add
                            </button>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Search Results */}
              {showSearchResults && searchTerm && medicines.length > 0 && (
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg max-h-96 overflow-y-auto">
                  {medicines.map((medicine) => (
                    <div
                      key={medicine.id}
                      role="button"
                      tabIndex={0}
                      className="p-4 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                      onClick={() => addToCart(medicine)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          addToCart(medicine);
                        }
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                            {medicine.name}
                            {medicineCompanyLine(medicine) !== '—' && (
                              <span className="font-normal text-gray-500 dark:text-gray-400 font-medium">
                                {' '}
                                — {medicineCompanyLine(medicine)}
                              </span>
                            )}
                          </h3>
                          {medicine.barcode && (
                            <p
                              className="text-sm text-gray-500 dark:text-gray-400 truncate"
                              title={medicine.barcode}
                            >
                              Barcode: {formatBarcodePreview(medicine.barcode)}
                            </p>
                          )}
                          <div className="flex items-center gap-4 mt-2">
                            <span className="text-sm font-bold text-green-600 dark:text-green-400">
                              Avg pill price:{' '}
                              {(
                                medicine.averageSellablePricePerPill || 0
                              ).toFixed(2)}
                            </span>
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium ${(medicine.sellablePills ?? 0) > 0
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                                : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                                }`}
                            >
                              {(medicine.sellablePills ?? 0) > 0
                                ? (medicine.criticalExpiryPills ?? 0) > 0
                                  ? `Critical: ${medicine.sellablePills ?? 0} pills`
                                  : (medicine.nearExpiryPills ?? 0) > 0
                                    ? `Near expiry: ${medicine.sellablePills ?? 0} pills`
                                    : `Sellable Pills: ${medicine.sellablePills ?? 0}`
                                : (medicine.totalAvailablePills ?? 0) > 0
                                  ? 'Not sellable (expired)'
                                  : `Sellable Pills: 0`}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            addToCart(medicine);
                          }}
                          disabled={(medicine.sellablePills ?? 0) === 0}
                          className="ml-4 px-4 py-2 bg-emerald-600 dark:bg-emerald-500 text-white rounded-lg hover:bg-emerald-700 dark:hover:bg-emerald-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                        >
                          <FiPlus className="w-4 h-4" />
                          Add
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {showSearchResults &&
                searchTerm &&
                !isSearching &&
                medicines.length === 0 && (
                  <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                    <FiPackage className="w-16 h-16 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                    <p>No medicines found matching &quot;{searchTerm}&quot;</p>
                  </div>
                )}
              {/* {!searchTerm && (
                                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                                    <FiSearch className="w-16 h-16 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                                    <p className="mb-4">Start typing to search for medicines</p>
                                    {showSeedButton && (
                                        <button
                                            onClick={seedSampleMedicines}
                                            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2 mx-auto"
                                        >
                                            <FiPlus className="w-5 h-5" />
                                            Add Sample Medicines (For Testing)
                                        </button>
                                    )}
                                </div>
                            )} */}
            </div>
          </div>
        </div>
      )}

      {/* Barcode Scan Modal */}
      {barcodeScanMode && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Barcode Scanner
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setBarcodeScanMode(false);
                    setBarcodeInput('');
                    setIsScanning(false);
                  }}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <FiX className="w-6 h-6 text-gray-600 dark:text-gray-300" />
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="mb-4">
                <label
                  htmlFor="barcode-input"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Scan or Type Barcode
                </label>
                <input
                  id="barcode-input"
                  ref={barcodeInputRef}
                  type="text"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (barcodeInput.trim()) {
                        handleBarcodeScan(barcodeInput);
                      }
                    }
                  }}
                  placeholder="Scan barcode or type barcode number..."
                  className="w-full px-4 py-3 text-lg border-2 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                />
                {isScanning && (
                  <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg">
                    <p className="text-sm text-green-700 dark:text-green-300 font-medium flex items-center gap-2">
                      <FiCheck className="w-4 h-4" />
                      Medicine added to cart successfully!
                    </p>
                  </div>
                )}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Connect your barcode scanner and scan the medicine barcode. The
                medicine will be automatically added to the cart.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="w-full flex-1 flex flex-col overflow-hidden min-h-0">
        {/* Main Content: Left (Products/Cart) and Right (Summary/History) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1 overflow-hidden min-h-0">
          {/* Left Side: Products and Cart */}
          <div className="lg:col-span-8 flex flex-col overflow-hidden min-h-0 gap-3">
            {/* Top Section: Invoice, Date, Time, Customer Info */}
            <div
              data-wedge-typing="true"
              className="bg-gradient-to-br from-white via-white to-gray-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-gray-800/90 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-3 flex-shrink-0"
            >

              {/* TOP GRID ROW */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">

                {/* Invoice Number + Navigation */}
                <div className="flex items-center gap-2 min-w-0">
                  <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase whitespace-nowrap">
                    Invoice # (F1)
                  </label>

                  <div className="flex items-center gap-1 flex-1 min-w-0">

                    {/* PREVIOUS */}
                    <button
                      type="button"
                      onClick={navigateToPreviousBill}
                      disabled={
                        (currentBillIndex === -1 && salesHistoryList.length === 0) ||
                        (currentBillIndex >= 0 && currentBillIndex >= salesHistoryList.length - 1)
                      }
                      className="h-8 w-8 flex items-center justify-center border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700/50 text-gray-700 dark:text-white rounded-md hover:bg-gray-100 dark:hover:bg-gray-600 disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 disabled:cursor-not-allowed transition"
                    >
                      <FiChevronLeft className="w-4 h-4" />
                    </button>

                    {/* INVOICE INPUT */}
                    <input
                      type="text"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      className="flex-1 min-w-0 h-8 px-2.5 text-xs font-semibold border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700/50 dark:text-white rounded-md focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition"
                    />

                    {/* NEXT */}
                    <button
                      type="button"
                      onClick={navigateToNextBill}
                      disabled={
                        currentBillIndex === -1 ||
                        (currentBillIndex >= 0 && currentBillIndex === 0)
                      }
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

                {/* CUSTOMER NAME */}
                <div className="flex items-center gap-2 min-w-0">
                  <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase whitespace-nowrap">
                    Customer
                  </label>
                  <div className="flex-1 min-w-0 relative">
                    <input
                      id="customer-search-input"
                      type="text"
                      value={customerName}
                      placeholder="CASH CUSTOMER"
                      onChange={(e) => {
                        setCustomerName(e.target.value);
                        setShowCustomerDropdown(true);
                        setSaleType('Regular');
                      }}
                      onFocus={() => setShowCustomerDropdown(true)}
                      onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                      className="w-full h-8 pl-2.5 pr-8 text-xs font-semibold border-2 border-emerald-500/40 dark:border-emerald-500/40 bg-white dark:bg-gray-700/50 dark:text-white rounded-md focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition"
                    />
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 dark:text-gray-500">
                      <FiChevronDown className="w-3.5 h-3.5" />
                    </div>
                    {showCustomerDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-[100] max-h-48 overflow-y-auto">
                        <div
                          className="px-3 py-2 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 cursor-pointer text-xs font-medium text-emerald-600 dark:text-emerald-400 border-b border-gray-100 dark:border-gray-700 flex items-center gap-1.5"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setCustomerName('');
                            document.getElementById('customer-search-input')?.focus();
                          }}
                        >
                          <FiSearch className="w-3 h-3" /> Registered Customer
                        </div>
                        <div
                          className="px-3 py-2 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 cursor-pointer text-xs font-medium text-gray-700 dark:text-gray-300 border-b border-gray-100 dark:border-gray-700"
                          onMouseDown={(e) => { e.preventDefault(); setCustomerName('');setSaleType('Regular'); setShowCustomerDropdown(false); }}
                        >
                          CASH CUSTOMER
                        </div>
                        <div
                          className="px-3 py-2 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 cursor-pointer text-xs font-medium text-gray-700 dark:text-gray-300 border-b border-gray-100 dark:border-gray-700"
                          onMouseDown={(e) => { e.preventDefault(); setCustomerName('Family/Relatives'); setSaleType('Family/Relatives'); setShowCustomerDropdown(false); }}
                        >
                          Family/Relatives
                        </div>
                        <div
                          className="px-3 py-2 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 cursor-pointer text-xs font-medium text-gray-700 dark:text-gray-300 border-b border-gray-100 dark:border-gray-700"
                          onMouseDown={(e) => { e.preventDefault(); setCustomerName('Charity'); setSaleType('Charity'); setShowCustomerDropdown(false); }}
                        >
                          Charity
                        </div>
                        <div
                          className="px-3 py-2 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 cursor-pointer text-xs font-medium text-gray-700 dark:text-gray-300 border-b border-gray-100 dark:border-gray-700"
                          onMouseDown={(e) => { e.preventDefault(); setCustomerName('Employee'); setSaleType('Employee'); setShowCustomerDropdown(false); }}
                        >
                          Employee
                        </div>
                        {customerName.trim() !== '' && customers.filter(c => c.name.toLowerCase().includes(customerName.toLowerCase())).map(customer => (
                          <div
                            key={customer.id}
                            className="px-3 py-2 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 cursor-pointer text-xs font-medium text-gray-700 dark:text-gray-300 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50"
                            onMouseDown={(e) => { e.preventDefault(); setCustomerName(customer.name); setCustomerPhone(customer.phone || ''); setSaleType('Regular'); setShowCustomerDropdown(false); }}
                          >
                            {customer.name} {customer.phone ? `(${customer.phone})` : ''}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* SECOND ROW */}
              <div className="mt-3 pt-3 flex flex-wrap items-center gap-4 border-t border-gray-200 dark:border-gray-700">
                {/* MOBILE */}
                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase whitespace-nowrap">
                    Mobile #
                  </label>
                  <input
                    type="tel"
                    value={customerPhone || '-'}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-28 h-8 px-2.5 text-xs font-semibold border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700/50 dark:text-white rounded-md focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition"
                  />
                </div>

                {/* PRESCRIPTION */}
                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase whitespace-nowrap">
                    Rx #
                  </label>
                  <input
                    type="text"
                    value={prescriptionNumber}
                    onChange={(e) => setPrescriptionNumber(e.target.value)}
                    placeholder="Prescription no."
                    className="w-32 h-8 px-2.5 text-xs font-semibold border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700/50 dark:text-white rounded-md focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition"
                  />
                </div>

                {/* DOCTOR */}
                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase whitespace-nowrap">
                    Dr.
                  </label>
                  <input
                    type="text"
                    value={doctorName}
                    onChange={(e) => setDoctorName(e.target.value)}
                    placeholder="Doctor name"
                    className="w-32 h-8 px-2.5 text-xs font-semibold border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700/50 dark:text-white rounded-md focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition"
                  />
                </div>

                <div className="flex-1"></div>

                {/* NEW SALE BTN */}
                <button
                  type="button"
                  onClick={() => {
                    clearFormForNewBill();
                    setCurrentBillIndex(-1);
                    setSelectedSaleId(null);
                  }}
                  className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all shadow-md flex items-center gap-2"
                >
                  NEW SALE
                </button>

                {/* HISTORY BTN */}
                <Link
                  to="/sales"
                  className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-all shadow-sm border border-gray-200 dark:border-gray-600"
                >
                  HISTORY
                </Link>
              </div>
            </div>
            {/* Product Search Section */}
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
                    onKeyDown={handleKeyDown}
                    onFocus={() => {
                      if (searchTerm) {
                        setShowSearchResults(true);
                      }
                    }}
                    onBlur={(e) => {
                      // Don't close if focus is moving to a dropdown item
                      const relatedTarget = e.relatedTarget as HTMLElement;
                      if (
                        relatedTarget &&
                        relatedTarget.closest('[data-dropdown-item]')
                      ) {
                        return;
                      }
                      // Delay hiding to allow click on dropdown items
                      setTimeout(() => {
                        // Check if focus is still not on dropdown
                        if (
                          !document.activeElement?.closest(
                            '[data-dropdown-item]'
                          )
                        ) {
                          setShowSearchResults(false);
                          setHighlightedIndex(-1);
                        }
                      }, DROPDOWN_BLUR_DELAY_MS);
                    }}
                    placeholder="Search or scan product..."
                    className="w-full pl-10 pr-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-600 dark:bg-gray-700/50 dark:text-white rounded-md focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none transition-all bg-white"
                  />
                  {/* Dropdown Results */}
                  {showSearchResults && searchTerm && medicines.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-50 max-h-64 overflow-y-auto">
                      {medicines.map((medicine, index) => (
                        <div
                          key={medicine.id}
                          data-dropdown-item
                          ref={(el) => {
                            dropdownItemRefs.current[index] = el;
                          }}
                          tabIndex={highlightedIndex === index ? 0 : -1}
                          className={`p-2.5 border-b border-gray-100 dark:border-gray-700 cursor-pointer transition-colors flex items-center justify-between ${highlightedIndex === index
                            ? 'bg-emerald-50 dark:bg-emerald-900/20 ring-2 ring-emerald-500/30'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                          onMouseEnter={() => setHighlightedIndex(index)}
                          onFocus={() => setHighlightedIndex(index)}
                          onMouseDown={(e) => {
                            e.preventDefault(); // Prevent input blur
                            addToCart(medicine);
                            setSearchTerm('');
                            setShowSearchResults(false);
                            setHighlightedIndex(-1);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              if ((medicine.sellablePills ?? 0) > 0) {
                                addToCart(medicine);
                                setSearchTerm('');
                                setShowSearchResults(false);
                                setHighlightedIndex(-1);
                              }
                            } else if (e.key === 'Tab') {
                              e.preventDefault();
                              if (e.shiftKey) {
                                // Shift+Tab: move to previous item
                                if (index > 0) {
                                  setHighlightedIndex(index - 1);
                                  dropdownItemRefs.current[index - 1]?.focus();
                                } else {
                                  // Back to input
                                  setHighlightedIndex(-1);
                                  searchInputRef.current?.focus();
                                }
                                return;
                              }
                              // Tab: move to next item
                              if (index < medicines.length - 1) {
                                setHighlightedIndex(index + 1);
                                dropdownItemRefs.current[index + 1]?.focus();
                              }
                            }
                          }}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {medicine.name}
                              {medicineCompanyLine(medicine) !== '—' && (
                                <span className="font-normal text-gray-500 dark:text-gray-400">
                                  {' '}
                                  — {medicineCompanyLine(medicine)}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                              {medicine.barcode && (
                                <span
                                  className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[10rem]"
                                  title={medicine.barcode}
                                >
                                  Barcode: {formatBarcodePreview(medicine.barcode)}
                                </span>
                              )}
                              <span className="text-xs font-semibold text-green-600 dark:text-green-400">
                                Price:{' '}
                                {(
                                  medicine.averageSellablePricePerPill || 0
                                ).toFixed(1)}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${(medicine.sellablePills ?? 0) > 0
                                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                  : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                  }`}
                              >
                                {(medicine.sellablePills ?? 0) > 0
                                  ? (medicine.criticalExpiryPills ?? 0) > 0
                                    ? `Critical: ${medicine.sellablePills ?? 0}`
                                    : (medicine.nearExpiryPills ?? 0) > 0
                                      ? `Near expiry: ${medicine.sellablePills ?? 0}`
                                      : `Stock: ${medicine.sellablePills ?? 0}`
                                  : (medicine.totalAvailablePills ?? 0) > 0
                                    ? 'Out of date / expired'
                                    : 'Stock: 0'}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              addToCart(medicine);
                              setSearchTerm('');
                              setShowSearchResults(false);
                            }}
                            disabled={(medicine.sellablePills ?? 0) === 0}
                            className="ml-3 px-2.5 py-1 bg-emerald-600 dark:bg-emerald-500 text-white rounded-md hover:bg-emerald-700 dark:hover:bg-emerald-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors flex items-center gap-1 text-xs font-medium flex-shrink-0"
                          >
                            <FiPlus className="w-3 h-3" />
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

            {/* Cart Items - Scrollable */}
            <div
              data-cart-section
              data-wedge-typing="true"
              className="flex-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200/60 dark:border-gray-700/60 shadow-md overflow-hidden flex flex-col min-h-0 max-h-full backdrop-blur-sm"
            >
              <div className="px-4 py-3 bg-gradient-to-r from-gray-50 to-gray-100/50 dark:from-gray-700/50 dark:to-gray-700/30 border-b border-gray-200/60 dark:border-gray-600/60 flex-shrink-0 z-10">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wide">
                    Current Bill Items
                  </h3>

                </div>
              </div>
              <div className="flex-1 overflow-x-auto overflow-y-auto min-h-0 overscroll-contain">
                {cart.length === 0 ? (
                  <div className="p-12 text-center">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 mb-4">
                      <FiPackage className="w-10 h-10 text-gray-400 dark:text-gray-500" />
                    </div>
                    <p className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      No items in cart
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Add products to start selling
                    </p>
                  </div>
                ) : (
                  <div className="min-w-0 border border-gray-200/80 dark:border-gray-600/80 rounded-b-lg overflow-hidden">
                    {/* Table Header — grid lines match Purchasing Panel */}
                    {(() => {
                      const showRetCol = currentBillIndex >= 0 && returnedQuantities.size > 0;
                      return (
                    <div
                      className="grid w-full min-w-[720px] grid-cols-[44px_repeat(13,minmax(0,1fr))] gap-0 items-center bg-gradient-to-r from-gray-50/90 to-gray-100/60 dark:from-gray-700/50 dark:to-gray-700/30 border-b-2 border-gray-300 dark:border-gray-500 text-[10px] font-bold text-gray-700 dark:text-gray-300 sticky top-0 z-10 uppercase tracking-wider [&>div]:border-r [&>div]:border-gray-200 dark:[&>div]:border-gray-600 [&>div:last-child]:border-r-0 [&>div]:px-2 [&>div]:sm:px-2.5 [&>div]:py-2.5"
                    >
                      <div className="col-span-1 text-left">Sr#</div>
                      <div className="col-span-2 text-left">Product</div>
                      <div className="col-span-2 text-left">Company</div>
                      <div className="col-span-1 text-center">Pill QTY</div>
                      {showRetCol && (
                        <div className="col-span-1 text-center text-rose-600 dark:text-rose-400">Ret. Pill Qty</div>
                      )}
                      <div className={`${showRetCol ? 'col-span-1' : 'col-span-2'} text-center`}>Pill Price</div>
                      <div className="col-span-1 text-center">Disc%</div>
                      <div className="col-span-1 text-center">Tax%</div>
                      <div className="col-span-3 text-right pr-1">Amount</div>
                      <div className="col-span-1 text-center">Remove</div>
                    </div>
                      );
                    })()}
                    {/* Cart Items */}
                    {cart.map((item, index) => {
                      const companyLabel = medicineCompanyLine(item.medicine);
                      const showRetCol = currentBillIndex >= 0 && returnedQuantities.size > 0;
                      const returnedQty = returnedQuantities.get(item.medicine.id) || 0;
                      return (
                      <div
                        key={item.medicine.id}
                        className="grid w-full min-w-[720px] grid-cols-[44px_repeat(13,minmax(0,1fr))] gap-0 items-stretch hover:bg-gradient-to-r hover:from-emerald-50/30 hover:to-transparent dark:hover:from-emerald-900/10 dark:hover:to-transparent transition-colors text-xs border-b border-gray-200 dark:border-gray-600 last:border-b-0 [&>div]:border-r [&>div]:border-gray-200 dark:[&>div]:border-gray-600 [&>div:last-child]:border-r-0 [&>div]:px-2 [&>div]:sm:px-2.5 [&>div]:py-2 [&>div]:min-h-[3rem]"
                      >
                        <div className="col-span-1 text-gray-600 dark:text-gray-400 text-[11px] font-medium">
                          {index + 1}
                        </div>
                        <div className="col-span-2 min-w-0">
                          <div className="font-medium text-gray-900 dark:text-white truncate text-[11px]">
                            {item.medicine.name}
                          </div>
                          <div
                            className="text-[10px] text-gray-500 dark:text-gray-500 truncate"
                            title={item.medicine.barcode || undefined}
                          >
                            {formatBarcodePreview(item.medicine.barcode)}
                          </div>
                        </div>
                        <div
                          className="col-span-2 min-w-0 text-[10px] text-gray-700 dark:text-gray-300 truncate"
                          title={companyLabel !== '—' ? companyLabel : undefined}
                        >
                          {companyLabel}
                        </div>
                        <div className="col-span-1">
                          <div className="flex items-center gap-0.5 justify-center">
                            <button
                              type="button"
                              onClick={() =>
                                updateCartQuantity(item.medicine.id, -1)
                              }
                              className="p-0.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded transition-colors"
                              disabled={item.pills <= 1 || (isCashier && currentBillIndex >= 0 && !isWithin24Hours(selectedSale?.createdAt))}
                            >
                              <FiMinus className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            </button>
                            <input
                              type="text"
                              inputMode="numeric"
                              autoComplete="off"
                              aria-label="Pill quantity"
                              value={
                                qtyInputDraft[item.medicine.id] ??
                                (item.pills === 0 ? '' : String(item.pills))
                              }
                              readOnly={isCashier && currentBillIndex >= 0 && !isWithin24Hours(selectedSale?.createdAt)}
                              onFocus={(e) => e.target.select()}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                if (isCashier && currentBillIndex >= 0 && !isWithin24Hours(selectedSale?.createdAt)) return;
                                const v = e.target.value;
                                const id = item.medicine.id;
                                if (v === '') {
                                  setQtyInputDraft((prev) => ({
                                    ...prev,
                                    [id]: v,
                                  }));
                                } else if (/^\d+$/.test(v)) {
                                  const numVal = parseInt(v, 10);
                                  setQtyInputDraft((prev) => ({
                                    ...prev,
                                    [id]: v,
                                  }));
                                  if (numVal >= 1) {
                                    const maxAvail = item.medicine.sellablePills;
                                    if (typeof maxAvail === 'number' && numVal > maxAvail) {
                                      warning(`Only ${maxAvail} pills available for sale!`);
                                      setCartItemQuantity(id, maxAvail);
                                    } else {
                                      setCartItemQuantity(id, numVal);
                                    }
                                  }
                                }
                              }}
                              onBlur={() => {
                                if (isCashier && currentBillIndex >= 0 && !isWithin24Hours(selectedSale?.createdAt)) return;
                                const id = item.medicine.id;
                                const draft = qtyInputDraft[id];
                                setQtyInputDraft((prev) => {
                                  const next = { ...prev };
                                  delete next[id];
                                  return next;
                                });
                                if (draft === undefined) return;
                                const trimmed = draft.trim();
                                const line = cart.find((x) => x.medicine.id === id);
                                if (!line) return;
                                let val = parseInt(trimmed, 10);
                                if (trimmed === '' || Number.isNaN(val) || val < 1) {
                                  val = Math.max(1, line.pills);
                                }
                                const maxAvail = line.medicine.sellablePills;
                                if (typeof maxAvail === 'number' && val > maxAvail) {
                                  warning(`Only ${maxAvail} pills available for sale!`);
                                  val = maxAvail;
                                }
                                setCartItemQuantity(id, val);
                              }}
                              className={`w-12 px-1 py-1 text-center text-[11px] font-semibold border border-gray-300 dark:border-gray-600 dark:bg-gray-700/50 dark:text-white rounded focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all tabular-nums ${isCashier && currentBillIndex >= 0 && !isWithin24Hours(selectedSale?.createdAt) ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed' : ''}`}
                            />
                            <button
                              type="button"
                              onClick={() =>
                                updateCartQuantity(item.medicine.id, 1)
                              }
                              className="p-0.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded transition-colors"
                              disabled={
                                (isCashier && currentBillIndex >= 0 && !isWithin24Hours(selectedSale?.createdAt)) ||
                                (typeof item.medicine.sellablePills === 'number'
                                  ? item.pills >= item.medicine.sellablePills
                                  : false)
                              }
                            >
                            <FiPlus className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            </button>
                          </div>
                        </div>
                        {/* RET. column — dedicated returned qty cell */}
                        {showRetCol && (
                          <div className="col-span-1 text-center">
                            {returnedQty > 0 ? (
                              <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 border border-rose-300 dark:border-rose-700">
                                -{returnedQty}
                              </span>
                            ) : (
                              <span className="text-gray-300 dark:text-gray-600 text-[10px]">—</span>
                            )}
                          </div>
                        )}
                        <div className={`${showRetCol ? 'col-span-1' : 'col-span-2'} text-center min-w-0`}>
                          {item.batchBreakdown && item.batchBreakdown.length > 1 ? (
                            /* Multi-batch: stacked rows, one per batch (old/new stock split by FEFO). */
                            <div
                              className="w-full border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 rounded overflow-hidden divide-y divide-amber-200 dark:divide-amber-700 tabular-nums"
                              title={item.batchBreakdown.map((seg) => `${seg.pills}x ${symbol}${seg.price.toFixed(1)}`).join(' + ')}
                            >
                              {item.batchBreakdown.map((seg, segIdx) => {
                                const stockLabel = segIdx === 0 ? '(old)' : '(new)';
                                return (
                                  <div
                                    key={segIdx}
                                    className="flex items-center justify-between gap-1 px-1.5 py-0.5 text-[10px] font-semibold"
                                  >
                                    <span className="text-amber-600 dark:text-amber-500 text-[9px] font-normal">
                                      {stockLabel}
                                    </span>
                                    <span>{seg.pills}</span>
                                    <span>{symbol}{seg.price.toFixed(1)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={(item.batchBreakdown && item.batchBreakdown.length === 1
                                ? item.batchBreakdown[0].price
                                : item.unitPrice
                              ).toFixed(1)}
                              readOnly
                            className="w-full px-1.5 py-1 text-center text-[11px] font-semibold border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded cursor-not-allowed"
                            />
                          )}
                        </div>
                        <div className="col-span-1 text-center">
                          <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            aria-label="Discount"
                            value={
                              discountInputDraft[item.medicine.id] ??
                              (item.discount === 0 ? '' : String(Math.round(item.discount)))
                            }
                            onFocus={(e) => e.target.select()}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                              const v = e.target.value;
                              const id = item.medicine.id;
                              // Only allow digits and check if value is <= 100
                              if (v === '') {
                                setDiscountInputDraft((prev) => ({
                                  ...prev,
                                  [id]: v,
                                }));
                                updateCartItemField(id, 'discount', 0);
                              } else if (/^\d+$/.test(v)) {
                                const numVal = parseInt(v, 10);
                                if (numVal <= 100) {
                                  setDiscountInputDraft((prev) => ({
                                    ...prev,
                                    [id]: v,
                                  }));
                                  updateCartItemField(id, 'discount', numVal);
                                }
                              }
                            }}
                            onBlur={() => {
                              const id = item.medicine.id;
                              const draft = discountInputDraft[id];
                              setDiscountInputDraft((prev) => {
                                const next = { ...prev };
                                delete next[id];
                                return next;
                              });
                              if (draft === undefined) return;
                              const trimmed = draft.trim();
                              let val = parseInt(trimmed, 10);
                              if (trimmed === '' || Number.isNaN(val) || val < 0) {
                                val = 0;
                              }
                              if (val > 100) val = 100;
                              updateCartItemField(id, 'discount', val);
                            }}
                            className="w-full px-1.5 py-1 text-center text-[11px] font-semibold border border-gray-300 dark:border-gray-600 dark:bg-gray-700/50 dark:text-white rounded focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all"
                            placeholder="0"
                          />
                        </div>
                        <div className="col-span-1 text-center">
                          <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            aria-label="Tax"
                            value={
                              taxInputDraft[item.medicine.id] ??
                              (item.tax === 0 ? '' : String(Math.round(item.tax)))
                            }
                            onFocus={(e) => e.target.select()}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                              const v = e.target.value;
                              const id = item.medicine.id;
                              // Only allow digits and check if value is <= 100
                              if (v === '') {
                                setTaxInputDraft((prev) => ({
                                  ...prev,
                                  [id]: v,
                                }));
                                updateCartItemField(id, 'tax', 0);
                              } else if (/^\d+$/.test(v)) {
                                const numVal = parseInt(v, 10);
                                if (numVal <= 100) {
                                  setTaxInputDraft((prev) => ({
                                    ...prev,
                                    [id]: v,
                                  }));
                                  updateCartItemField(id, 'tax', numVal);
                                }
                              }
                            }}
                            onBlur={() => {
                              const id = item.medicine.id;
                              const draft = taxInputDraft[id];
                              setTaxInputDraft((prev) => {
                                const next = { ...prev };
                                delete next[id];
                                return next;
                              });
                              if (draft === undefined) return;
                              const trimmed = draft.trim();
                              let val = parseInt(trimmed, 10);
                              if (trimmed === '' || Number.isNaN(val) || val < 0) {
                                val = 0;
                              }
                              if (val > 100) val = 100;
                              updateCartItemField(id, 'tax', val);
                            }}
                            className="w-full px-1.5 py-1 text-center text-[11px] font-semibold border border-gray-300 dark:border-gray-600 dark:bg-gray-700/50 dark:text-white rounded focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all"
                            placeholder="0"
                          />
                        </div>
                        <div className="col-span-3 flex items-center justify-end pr-1 font-bold text-emerald-600 dark:text-emerald-400 text-[11px] min-w-0 tabular-nums whitespace-nowrap">
                          {symbol}{item.finalPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="col-span-1 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              if (isCashier && currentBillIndex >= 0 && !isWithin24Hours(selectedSale?.createdAt)) return;
                              removeFromCart(item.medicine.id);
                            }}
                            disabled={isCashier && currentBillIndex >= 0 && !isWithin24Hours(selectedSale?.createdAt)}
                            className={`p-1.5 transition-all border border-transparent ${
                              isCashier && currentBillIndex >= 0 && !isWithin24Hours(selectedSale?.createdAt)
                                ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                                : 'text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-300 rounded hover:border-red-300 dark:hover:border-red-700'
                            }`}
                            title={isCashier && currentBillIndex >= 0 && !isWithin24Hours(selectedSale?.createdAt) ? 'Cashiers cannot modify old sales' : 'Remove from cart'}
                          >
                            <FiTrash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                    })}
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Right Side: Summary (Top Half) and History (Bottom Half) */}
          <div
            data-wedge-typing="true"
            className="lg:col-span-4 flex flex-col gap-2 overflow-hidden min-h-0 h-full"
          >
            {/* Sale Summary - Top Half */}
            <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col overflow-hidden min-h-0">
              <div
                className={`px-4 bg-gradient-to-r from-gray-50 to-gray-100/50 dark:from-gray-700/50 dark:to-gray-700/30 border-b border-gray-200 dark:border-gray-600 flex-shrink-0 ${
                  expandedSaleSummary ? 'py-3' : 'py-2.5'
                }`}
              >
                <h3
                  className={`font-bold text-gray-900 dark:text-white uppercase tracking-wide ${
                    expandedSaleSummary ? 'text-base' : 'text-sm'
                  }`}
                >
                  Sale Summary
                </h3>
              </div>
              <div
                className={`flex-1 flex flex-col min-h-0 ${
                  expandedSaleSummary ? 'p-2.5 gap-2' : 'p-2.5 gap-2'
                }`}
              >
                {/* Net Payable - Most Prominent */}
                <div
                  className={`bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-500 dark:from-emerald-600 dark:via-emerald-700 dark:to-emerald-600 border border-emerald-600 dark:border-emerald-500 shadow-lg flex-shrink-0 rounded-xl ${
                    expandedSaleSummary ? 'p-2.5' : 'p-2'
                  }`}
                >
                  <div className={`flex items-center justify-between ${expandedSaleSummary ? 'mb-1' : 'mb-0'}`}>
                    <div
                      className={`font-bold text-white/95 uppercase tracking-wide ${
                        expandedSaleSummary ? 'text-xs' : 'text-xs font-semibold text-white/90'
                      }`}
                    >
                      Net Payable
                    </div>
                    <div
                      className={`bg-white/20 dark:bg-white/10 rounded-full ${
                        expandedSaleSummary ? 'px-2.5 py-1' : 'px-2 py-0.5'
                      }`}
                    >
                      <span
                        className={`font-bold text-white ${expandedSaleSummary ? 'text-xs sm:text-sm' : 'text-[10px]'}`}
                      >
                        {cart.length} {cart.length === 1 ? 'Item' : 'Items'}
                      </span>
                    </div>
                    {currentSaleReturnTotal > 0 && (
                      <div className="ml-2 px-2 py-0.5 bg-rose-500 text-white text-[10px] font-black rounded border border-white/40 animate-pulse shadow-sm">
                        HAS RETURNS
                      </div>
                    )}
                  </div>
                  <div
                    className={`font-bold text-white tracking-tight ${
                      expandedSaleSummary ? 'text-2xl sm:text-3xl leading-tight' : 'text-2xl'
                    }`}
                  >
                    {formatCurrency(netPayable)}
                  </div>
                  {currentSaleReturnTotal > 0 && selectedSale && (
                    <div className="mt-2 pt-2 border-t border-white/20">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white/80">Original Total:</span>
                        <span className="text-white/90 font-semibold">{formatCurrency(selectedSale.items.reduce((sum, i) => sum + (i.originalTotal || 0), 0))}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs mt-1">
                        <span className="text-white/80">Returned:</span>
                        <span className="text-red-200 font-semibold">-{formatCurrency(selectedSale.items.reduce((sum, i) => sum + (i.returnedTotal || 0), 0))}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs mt-1 pt-1 border-t border-white/10">
                        <span className="text-white/80 font-semibold">Net Total:</span>
                        <span className="text-white font-bold">{formatCurrency(netPayable)}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Summary breakdown + given/return — expanded layout fills space on active new sale */}
                {currentBillIndex === -1 && cart.length > 0 && (
                  <div
                    className={
                      expandedSaleSummary
                        ? 'flex flex-col gap-2.5'
                        : ''
                    }
                  >
                    <div
                      className={`grid ${expandedSaleSummary ? 'gap-2' : 'gap-2'}`}
                      style={{ gridTemplateColumns: '1fr 1fr', gridAutoRows: '1fr' }}
                    >
                      {/* Block 1: Discounts & Taxes */}
                      <div
                        className={`h-full bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 ${
                          expandedSaleSummary
                            ? 'p-2 rounded-lg flex flex-col gap-2 shadow-sm dark:shadow-none'
                            : 'p-2 rounded-lg flex flex-col space-y-2'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div
                            className={`font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide ${
                              expandedSaleSummary ? 'text-xs' : 'text-[10px] font-semibold'
                            }`}
                          >
                            Disc
                          </div>
                          <div
                            className={`font-bold text-red-600 dark:text-red-400 tabular-nums ${
                              expandedSaleSummary ? 'text-sm' : 'text-sm'
                            }`}
                          >
                            -{formatCurrency(discountValue)}
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-4">
                          <div
                            className={`font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide ${
                              expandedSaleSummary ? 'text-xs' : 'text-[10px] font-semibold'
                            }`}
                          >
                            Tax
                          </div>
                          <div
                            className={`font-bold text-blue-600 dark:text-blue-400 tabular-nums ${
                              expandedSaleSummary ? 'text-sm' : 'text-sm'
                            }`}
                          >
                            +{formatCurrency(taxValue)}
                          </div>
                        </div>

                      </div>

                      {/* Block 2: Values & Final Total */}
                      <div
                        className={`h-full bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 ${
                          expandedSaleSummary
                            ? 'p-2 rounded-lg flex flex-col gap-2 shadow-sm dark:shadow-none'
                            : 'p-2 rounded-lg flex flex-col space-y-2'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div
                            className={`font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide ${
                              expandedSaleSummary ? 'text-xs' : 'text-[10px] font-semibold'
                            }`}
                          >
                            Subtotal
                          </div>
                          <div
                            className={`font-bold text-gray-900 dark:text-white tabular-nums ${
                              expandedSaleSummary ? 'text-sm' : 'text-sm'
                            }`}
                          >
                            {formatCurrency(subtotalValue)}
                          </div>
                        </div>

                        <div className={`flex items-center justify-between gap-4 border-t border-gray-200 dark:border-gray-600 ${expandedSaleSummary ? 'pt-1 mt-0' : 'pt-1.5 mt-1.5'}`}>
                          <div
                            className={`font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide ${
                              expandedSaleSummary ? 'text-xs' : 'text-[10px] font-semibold'
                            }`}
                          >
                            Total
                          </div>
                          <div
                            className={`font-black text-emerald-600 dark:text-emerald-400 tabular-nums ${
                              expandedSaleSummary ? 'text-base' : 'text-sm'
                            }`}
                          >
                            {formatCurrency(grandTotal)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Given & Return Amounts - Calculator */}
                    <div
                      className={`grid grid-cols-2 ${
                        expandedSaleSummary
                          ? 'gap-2'
                          : 'gap-2 mt-2 pt-2 border-t border-gray-100 dark:border-gray-700'
                      }`}
                    >
                      <div
                        className={`bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/50 flex items-center gap-2 ${
                          expandedSaleSummary ? 'p-2 rounded-lg' : 'p-2 rounded-lg'
                        }`}
                      >
                        <div
                          className={`font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide leading-tight ${
                            expandedSaleSummary
                              ? 'text-xs'
                              : 'text-[10px] font-semibold'
                          }`}
                        >
                          <div>Given</div>
                          <div>Amount</div>
                        </div>
                        <input
                          type="number"
                          value={receivedAmount}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => setReceivedAmount(e.target.value)}
                          placeholder="0.00"
                          className={`bg-white dark:bg-gray-800 border-2 border-emerald-200 dark:border-emerald-700 rounded-lg font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500/40 outline-none transition-all tabular-nums ${
                            expandedSaleSummary
                              ? 'px-2.5 py-1.5 text-base w-32'
                              : 'px-2 py-1 text-sm w-28'
                          }`}
                        />
                      </div>
                      <div
                        className={`border transition-colors flex items-center gap-2 ${
                          expandedSaleSummary ? 'p-2 rounded-lg' : 'p-2 rounded-lg'
                        } ${
                          returnAmount >= 0
                            ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800/50'
                            : 'bg-red-50/50 dark:bg-red-900/10 border-red-200 dark:border-red-800/50'
                        }`}
                      >
                        <div
                          className={`font-bold uppercase tracking-wide leading-tight ${
                            expandedSaleSummary ? 'text-xs' : 'text-[10px] font-semibold'
                          } ${
                            returnAmount >= 0
                              ? 'text-blue-700 dark:text-blue-400'
                              : 'text-red-700 dark:text-red-400'
                          }`}
                        >
                          <div>Return</div>
                          <div>Amount</div>
                        </div>
                        <div
                          className={`text-right font-black tabular-nums ${
                            expandedSaleSummary ? 'text-lg w-32' : 'text-sm w-28'
                          } ${
                            returnAmount >= 0
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {formatCurrency(returnAmount)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Action Buttons Section */}
                <div
                  className={`mt-auto border-t border-gray-200 dark:border-gray-700 space-y-2 flex-shrink-0 ${
                    expandedSaleSummary ? 'pt-2.5' : 'pt-2'
                  }`}
                >
                  {currentBillIndex >= 0 ? (
                    // When viewing a previous sale
                    <>
                      {((currentSaleReturnTotal > 0) || (isCashier && currentBillIndex >= 0 && !isWithin24Hours(selectedSale?.createdAt))) && (
                        <div className={`px-3 py-2 border rounded-lg ${(isCashier && currentBillIndex >= 0 && !isWithin24Hours(selectedSale?.createdAt)) ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'}`}>
                          <p className={`text-xs text-center ${(isCashier && currentBillIndex >= 0 && !isWithin24Hours(selectedSale?.createdAt)) ? 'text-blue-700 dark:text-blue-400' : 'text-orange-700 dark:text-orange-400'}`}>
                            {(isCashier && currentBillIndex >= 0 && !isWithin24Hours(selectedSale?.createdAt)) ? 'Cashiers cannot modify existing sales after 24 hours' : 'This sale has returns and cannot be modified'}
                          </p>
                        </div>
                      )}

                      {/* Update, Delete and Print buttons row - Only show if no returns AND not cashier */}
                      {currentSaleReturnTotal === 0 && (!isCashier || currentBillIndex === -1 || isWithin24Hours(selectedSale?.createdAt)) && (
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={handleCheckout}
                            disabled={processing || cart.length === 0}
                            className="py-2.5 bg-blue-600 dark:bg-blue-700 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 dark:hover:bg-blue-600 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-1.5"
                          >
                            {processing ? (
                              <>
                                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                <span>Updating...</span>
                              </>
                            ) : (
                              <>
                                <FiCheck className="w-3.5 h-3.5" />
                                <span>Update</span>
                              </>
                            )}
                          </button>

                          {(() => {
                            const sale = salesHistoryList.find(s => s.saleId === selectedSaleId);
                            const canDelete = !!(sale && canCurrentUserDeleteSale(sale.createdAt));
                            return (
                              <button
                                type="button"
                                onClick={() => {
                                  if (sale) {
                                    requestDeleteSale(sale.saleId, sale.createdAt);
                                  }
                                }}
                                disabled={!canDelete}
                                className={`py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-1.5 ${
                                  canDelete
                                    ? 'bg-red-600 dark:bg-red-700 text-white hover:bg-red-700 dark:hover:bg-red-600'
                                    : 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-500 cursor-not-allowed'
                                }`}
                                title={
                                  canDelete
                                    ? 'Delete this sale'
                                    : (isCashier
                                      ? 'Cashiers can only delete sales created within 24 hours'
                                      : 'Can only delete today\'s sales')
                                }
                              >
                                <FiTrash2 className="w-3.5 h-3.5" />
                                <span>Delete</span>
                              </button>
                            );
                          })()}

                          <button
                            type="button"
                            onClick={handlePrintInvoice}
                            disabled={cart.length === 0}
                            className="py-2.5 bg-gray-900 dark:bg-gray-800 text-white rounded-lg text-sm font-semibold hover:bg-black dark:hover:bg-gray-900 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-1.5"
                          >
                            <FiPrinter className="w-3.5 h-3.5" />
                            <span>Print</span>
                          </button>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={handleOpenReturnModal}
                        className="w-full py-2.5 bg-gradient-to-r from-orange-600 to-orange-500 dark:from-orange-700 dark:to-orange-600 text-white rounded-lg text-sm font-semibold hover:from-orange-700 hover:to-orange-600 dark:hover:from-orange-800 dark:hover:to-orange-700 transition-all shadow-md hover:shadow-lg transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
                      >
                        <FiRotateCcw className="w-4 h-4" />
                        <span>Return Items</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          clearFormForNewBill();
                          setCurrentBillIndex(-1);
                          setSelectedSaleId(null);
                        }}
                        className="w-full py-2.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-600 transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2 border border-gray-300 dark:border-gray-600"
                      >
                        <FiX className="w-4 h-4" />
                        <span>Cancel / New Sale</span>
                      </button>
                    </>
                  ) : (
                    // When creating new sale - Show Checkout Actions
                    <div className={`flex ${expandedSaleSummary ? 'gap-3' : 'gap-2'}`}>
                      <button
                        type="button"
                        onClick={clearCart}
                        disabled={cart.length === 0}
                        className={`w-[30%] bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-600 dark:from-emerald-700 dark:via-emerald-600 dark:to-emerald-700 text-white rounded-xl font-bold hover:from-emerald-700 hover:via-emerald-600 hover:to-emerald-700 dark:hover:from-emerald-800 dark:hover:via-emerald-700 dark:hover:to-emerald-800 disabled:from-gray-400 disabled:via-gray-400 disabled:to-gray-400 dark:disabled:from-gray-600 dark:disabled:via-gray-600 dark:disabled:to-gray-600 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 ${
                          expandedSaleSummary ? 'py-2.5 text-sm rounded-lg' : 'py-2.5 text-sm rounded-lg'
                        }`}
                      >
                        <FiRefreshCw className={expandedSaleSummary ? 'w-4 h-4' : 'w-4 h-4'} />
                        <span>CLEAR</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleCheckout}
                        disabled={processing || cart.length === 0}
                        className={`w-[70%] bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-600 dark:from-emerald-700 dark:via-emerald-600 dark:to-emerald-700 text-white rounded-xl font-bold hover:from-emerald-700 hover:via-emerald-600 hover:to-emerald-700 dark:hover:from-emerald-800 dark:hover:via-emerald-700 dark:hover:to-emerald-800 disabled:from-gray-400 disabled:via-gray-400 disabled:to-gray-400 dark:disabled:from-gray-600 dark:disabled:via-gray-600 dark:disabled:to-gray-600 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 ${
                          expandedSaleSummary ? 'py-2.5 text-sm rounded-lg' : 'py-2.5 text-sm rounded-lg'
                        }`}
                      >
                        {processing ? (
                          <>
                            <div
                              className={`border-2 border-white border-t-transparent rounded-full animate-spin ${
                                expandedSaleSummary ? 'w-4 h-4' : 'w-5 h-5'
                              }`}
                            />
                            <span>PROCESSING...</span>
                          </>
                        ) : (
                          <>
                            <FiCheck className={expandedSaleSummary ? 'w-4 h-4' : 'w-5 h-5'} />
                            <span>COMPLETE SALE</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Selling History - Bottom Half */}
            <div className="h-[200px] bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col overflow-hidden flex-shrink-0">
            <div className="px-3 py-2.5 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-600 flex-shrink-0">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Selling History
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-3 min-h-0">
              {salesHistoryList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4">
                  <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-3">
                    <FiPackage className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                  </div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                    No sales yet
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500">
                    Recent sales will appear here
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {salesHistoryList.map((sale) => {
                    const saleDate = new Date(sale.createdAt);
                    const formattedDate = saleDate.toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    });
                    const formattedTime = saleDate.toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    const isSelected = selectedSaleId === sale.saleId;

                    return (
                      <div
                        key={sale.saleId}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          const index = salesHistoryList.findIndex(
                            (s) => s.saleId === sale.saleId
                          );
                          loadSaleDetails(sale, index);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            const index = salesHistoryList.findIndex(
                              (s) => s.saleId === sale.saleId
                            );
                            loadSaleDetails(sale, index);
                          }
                        }}
                        className={`rounded-lg border-2 transition-all duration-300 cursor-pointer group overflow-hidden relative ${isSelected
                          ? 'border-emerald-500 dark:border-emerald-400 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/30 dark:from-emerald-900/30 dark:via-gray-800 dark:to-emerald-900/20 shadow-lg ring-4 ring-emerald-500/30 dark:ring-emerald-400/30 transform scale-[1.02]'
                          : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700/30 hover:bg-gray-50 dark:hover:bg-gray-700/60 hover:border-gray-300 dark:hover:border-gray-500 hover:shadow-md'
                          }`}
                      >
                        {/* Active indicator bar on left */}
                        {isSelected && (
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-emerald-500 to-emerald-600 dark:from-emerald-400 dark:to-emerald-500 rounded-l-lg" />
                        )}

                        {/* Header with Invoice and Date */}
                        <div
                          className={`px-2.5 py-1.5 border-b transition-colors ${isSelected
                            ? 'bg-gradient-to-r from-emerald-50/80 to-emerald-50/40 dark:from-emerald-900/40 dark:to-emerald-900/20 border-emerald-200/50 dark:border-emerald-700/50'
                            : 'bg-gradient-to-r from-gray-50 to-white dark:from-gray-700/50 dark:to-gray-700/30 border-gray-100 dark:border-gray-600/50'
                            }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div
                                className={`rounded-full transition-all duration-300 ${isSelected
                                  ? 'w-2.5 h-2.5 bg-emerald-600 dark:bg-emerald-400 ring-2 ring-emerald-300 dark:ring-emerald-500/50 ring-offset-1'
                                  : 'w-1.5 h-1.5 bg-emerald-500'
                                  }`}
                              />
                              <span
                                className={`text-xs font-bold transition-colors ${isSelected
                                  ? 'text-emerald-700 dark:text-emerald-300'
                                  : 'text-gray-900 dark:text-white'
                                  }`}
                              >
                                #{sale.saleId}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`text-[10px] font-medium transition-colors whitespace-nowrap ${isSelected
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-gray-600 dark:text-gray-400'
                                  }`}
                              >
                                {formattedDate}
                              </span>
                              <span
                                className={`text-[10px] transition-colors whitespace-nowrap ${isSelected
                                  ? 'text-emerald-500 dark:text-emerald-500'
                                  : 'text-gray-500 dark:text-gray-500'
                                  }`}
                              >
                                {formattedTime}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Content */}
                        <div className="px-2.5 py-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <FiPackage
                                  className={`w-3 h-3 flex-shrink-0 transition-colors ${isSelected
                                    ? 'text-emerald-500 dark:text-emerald-400'
                                    : 'text-gray-400 dark:text-gray-500'
                                    }`}
                                />
                                <span
                                  className={`text-xs transition-colors whitespace-nowrap ${isSelected
                                    ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                                    : 'text-gray-600 dark:text-gray-400'
                                    }`}
                                >
                                  {sale.items.length}{' '}
                                  {sale.items.length === 1 ? 'item' : 'items'}
                                </span>
                              </div>
                              {/* Additional Discount Badge */}
                              {(sale.additionalDiscount ?? 0) > 0 && (
                                <div className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded">
                                  <span className="text-[9px] font-bold text-amber-700 dark:text-amber-400">
                                    Special Disc. -{sale.additionalDiscount}% ({symbol}{((sale.total + (sale.additionalDiscountAmount ?? 0)) * (sale.additionalDiscount ?? 0) / 100).toFixed(2)})
                                  </span>
                                </div>
                              )}
                              {/* Return Status Badge */}
                              {(saleReturnsMap.get(sale.saleId) || 0) > 0 && (
                                <div className="flex items-center gap-1 px-1.5 py-0.5 bg-rose-100 dark:bg-rose-900/30 border border-rose-300 dark:border-rose-700 rounded animate-pulse">
                                  <span className="text-[9px] font-black text-rose-700 dark:text-rose-400 uppercase tracking-tighter">
                                    Item Returned
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span
                                className={`text-[10px] font-semibold uppercase tracking-wide transition-colors ${isSelected
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-gray-500 dark:text-gray-500'
                                  }`}
                              >
                                Total:
                              </span>
                              <span
                                className={`text-sm font-bold transition-all duration-300 whitespace-nowrap ${isSelected
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-emerald-600 dark:text-emerald-400 group-hover:text-emerald-700 dark:group-hover:text-emerald-300'
                                  }`}
                              >
                                {symbol}
                                {sale.total.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          </div>
        </div>
      </div>

      {removeLineConfirm && (
        <ConfirmDialog
          isOpen
          onClose={() => setRemoveLineConfirm(null)}
          onConfirm={() => {
            if (!removeLineConfirm) return;
            void performPersistedLineRemoval(removeLineConfirm.medicineId);
          }}
          title="Remove line item"
          message={`"${removeLineConfirm.itemName}" has ${removeLineConfirm.returnedQty} pill(s) already returned.

Removing it will permanently delete:
• The sale record for this item
• All associated return records

Are you sure you want to continue?`}
          confirmText="Continue"
          cancelText="Cancel"
          type="danger"
        />
      )}

      {/* Return Modal */}
      {saleDeleteConfirm && (
        <div className="fixed inset-0 z-[110] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-5">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Delete Sale
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
              Are you sure you want to delete this sale? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setSaleDeleteConfirm(null)}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteSale(saleDeleteConfirm.saleId)}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showReturnModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => {
            setShowReturnModal(false);
            setReturnItems([]);
            setReturnReason('');
            setReturnNotes('');
          }} />

          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] max-w-4xl w-full max-h-[90vh] flex flex-col relative animate-in fade-in zoom-in duration-300 overflow-hidden border border-gray-100/50 dark:border-gray-700">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-gradient-to-br from-red-500 via-red-600 to-orange-500 flex items-center justify-between shadow-lg shadow-red-500/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-md">
                  <FiRotateCcw className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-white tracking-tight">Create Sale Return</h2>
                  <p className="text-xs text-red-50/90 font-medium">Process refunds or item returns for this sale</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowReturnModal(false);
                  setReturnItems([]);
                  setReturnReason('');
                  setReturnNotes('');
                }}
                className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full text-white transition-all hover:rotate-90"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <div data-wedge-typing="true" className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Top inputs section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-widest block ml-1">
                    Return Reason
                  </label>
                  <input
                    type="text"
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    placeholder="e.g., Defective, Wrong item, Customer request..."
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl dark:text-white focus:ring-4 focus:ring-red-500/10 focus:border-red-500 outline-none transition-all placeholder:text-gray-400"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-widest block ml-1">
                    Return Notes
                  </label>
                  <textarea
                    value={returnNotes}
                    onChange={(e) => setReturnNotes(e.target.value)}
                    placeholder="Provide additional context for this return..."
                    rows={1}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl dark:text-white focus:ring-4 focus:ring-red-500/10 focus:border-red-500 outline-none transition-all resize-none min-h-[42px] placeholder:text-gray-400"
                  />
                </div>
              </div>

              {/* Items Section header */}
              <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
                      <FiPackage className="w-3.5 h-3.5 text-emerald-500" />
                    </div>
                    <h3 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.15em]">
                      Items In Sale
                    </h3>
                  </div>
                  <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-lg gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        const newItems = returnItems.map(item => ({
                          ...item,
                          returnPills: item.availableToReturn
                        }));
                        setReturnItems(newItems);
                      }}
                      className="text-[10px] font-semibold px-3 py-1.5 rounded-md hover:bg-white dark:hover:bg-gray-600 text-blue-600 dark:text-blue-400 transition-all"
                    >
                      SELECT ALL
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const newItems = returnItems.map(item => ({
                          ...item,
                          returnPills: 0
                        }));
                        setReturnItems(newItems);
                      }}
                      className="text-[10px] font-semibold px-3 py-1.5 rounded-md hover:bg-white dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400 transition-all"
                    >
                      CLEAR ALL
                    </button>
                  </div>
                </div>

                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {returnItems.map((item, index) => {
                    const isSelected = item.returnPills > 0;
                    const subtotal = item.unitPrice * item.returnPills;
                    const discountAmount = item.discountPerUnit * item.returnPills;
                    const taxAmount = item.taxPerUnit * item.returnPills;
                    const total = subtotal - discountAmount + taxAmount;

                    return (
                      <div
                        key={item.medicineId}
                        className={`group rounded-xl border transition-all duration-300 p-2.5 ${
                          isSelected
                            ? 'border-red-500/30 bg-gradient-to-br from-white to-red-50/30 dark:from-gray-800 dark:to-red-900/5 shadow-md shadow-red-500/5'
                            : 'border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800/40 opacity-90 hover:opacity-100 hover:border-red-200 hover:shadow-sm'
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          <div className="mt-1 flex-shrink-0">
                            <label className="relative flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    const newItems = [...returnItems];
                                    newItems[index].returnPills = e.target.checked ? item.availableToReturn : 0;
                                    setReturnItems(newItems);
                                  }}
                                  className="peer sr-only"
                                />
                                <div className="w-6 h-6 bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-lg transition-all peer-checked:border-red-500 peer-checked:bg-red-500 flex items-center justify-center shadow-sm">
                                    <FiCheck className={`w-3.5 h-3.5 text-white transition-transform duration-300 ${isSelected ? 'scale-100' : 'scale-0'}`} />
                                </div>
                            </label>
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className={`text-[15px] font-semibold tracking-tight truncate ${isSelected ? 'text-red-700 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                                  {item.medicineName}
                                </h4>
                                <div className="flex items-center gap-2 mt-1.5">
                                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-100/80 dark:bg-gray-700/50 rounded-full text-[9px] font-semibold text-gray-500 dark:text-gray-400">
                                    <div className={`w-1 h-1 rounded-full ${item.availableToReturn > 0 ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                    {item.availableToReturn} PILLS AVAILABLE
                                  </div>
                                  <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                                    {symbol}{item.unitPrice.toFixed(1)} / unit
                                  </div>

                                  {/* Compact Financial Stats */}
                                  <div className={`flex items-center gap-2 transition-all duration-300 ${isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-95 w-0 overflow-hidden'}`}>
                                    <div className="h-3 w-px bg-gray-200 dark:bg-gray-700 mx-1" />
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[9px] font-bold text-orange-400 uppercase">Discount:</span>
                                      <span className="text-[10px] font-bold text-orange-500">-{symbol}{discountAmount.toFixed(2)}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[9px] font-bold text-blue-400 uppercase">Tax:</span>
                                      <span className="text-[10px] font-bold text-blue-500">+{symbol}{taxAmount.toFixed(2)}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[9px] font-bold text-gray-400 uppercase">Sub Total:</span>
                                      <span className="text-[10px] font-bold text-gray-700 dark:text-gray-300">{symbol}{subtotal.toFixed(2)}</span>
                                    </div>

                                  </div>

                                  {item.availableToReturn < item.originalPills && (
                                    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-red-100/50 dark:bg-red-900/20 rounded-full text-[9px] font-bold text-red-500 uppercase animate-pulse">
                                      {item.originalPills - item.availableToReturn} RETURNED
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className={`text-right transition-opacity duration-300 ${isSelected ? 'opacity-100' : 'opacity-0'}`}>
                                <div className="text-[9px] font-bold text-red-600/50 dark:text-red-400/50 uppercase tracking-tighter">Refund Amount</div>
                                <div className="text-lg font-bold text-red-600 dark:text-red-400 tabular-nums">
                                    {symbol}{total.toFixed(2)}
                                </div>
                              </div>
                            </div>

                            {isSelected && (
                              <div className="mt-2 animate-in slide-in-from-top-2 duration-300">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-2 dark:border-red-900/20">
                                    <div className="space-y-1.5">
                                      <label className="text-[9px] font-bold text-red-600/60 dark:text-red-400/60 uppercase tracking-widest ml-1">Quantity To Return</label>
                                      <div className="relative flex items-center w-32">
                                        <input
                                          type="number"
                                          min={1}
                                          max={item.availableToReturn}
                                          value={item.returnPills}
                                          onChange={(e) => {
                                            const newItems = [...returnItems];
                                            newItems[index].returnPills = Math.max(1, Math.min(item.availableToReturn, parseInt(e.target.value) || 1));
                                            setReturnItems(newItems);
                                          }}
                                          className="w-full pl-3 pr-14 py-2 bg-white dark:bg-gray-900 border border-red-200 dark:border-red-800 rounded-xl text-sm font-semibold text-gray-900 dark:text-white focus:ring-4 focus:ring-red-500/5 focus:border-red-500 outline-none transition-all shadow-inner"
                                        />
                                        <div className="absolute right-3 text-[9px] font-bold text-red-600/30">MAX: {item.availableToReturn}</div>
                                      </div>
                                    </div>
                                    <div className="space-y-1.5">
                                      <label className="text-[9px] font-bold text-red-600/60 dark:text-red-400/60 uppercase tracking-widest ml-1">Item Specific Reason</label>
                                      <input
                                        type="text"
                                        value={item.reason || ''}
                                        onChange={(e) => {
                                          const newItems = [...returnItems];
                                          newItems[index].reason = e.target.value;
                                          setReturnItems(newItems);
                                        }}
                                        placeholder="Reason for this specific item..."
                                        className="w-full px-4 py-2 bg-white dark:bg-gray-900 border border-red-200 dark:border-red-800 rounded-xl text-sm text-gray-700 dark:text-gray-300 focus:ring-4 focus:ring-red-500/5 focus:border-red-500 outline-none transition-all shadow-inner"
                                      />
                                    </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Footer with summary & actions */}
            <div className="px-5 py-5 bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950 dark:border-gray-800 flex flex-col md:flex-row items-center justify-between gap-6 shadow-[0_-10px_20px_rgba(0,0,0,0.02)]">
              <div className="flex items-center gap-6">
                <div className="relative group">
                    <div className="absolute -inset-2 bg-red-500/5 rounded-2xl blur-lg transition duration-500 group-hover:bg-red-500/10" />
                    <div className="relative flex items-center gap-4 bg-white dark:bg-gray-800 py-2.5 px-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
                        <div className="text-right border-r pr-4 border-gray-100 dark:border-gray-700">
                            <span className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] block mb-0.5">Total Refund</span>
                            <span className="text-xl font-black text-red-600 dark:text-red-400 tabular-nums leading-none">
                              {symbol}
                              {returnItems
                                .reduce((sum, item) => {
                                  const subtotal = item.unitPrice * item.returnPills;
                                  const discountAmount = item.discountPerUnit * item.returnPills;
                                  const taxAmount = item.taxPerUnit * item.returnPills;
                                  return sum + subtotal - discountAmount + taxAmount;
                                }, 0)
                                .toFixed(2)}
                            </span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-gray-800 dark:text-gray-200 leading-none">
                                {returnItems.filter(i => i.returnPills > 0).length} ITEMS
                            </span>
                            <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-tighter mt-1">SELECTED</span>
                        </div>
                    </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowReturnModal(false);
                    setReturnItems([]);
                    setReturnReason('');
                    setReturnNotes('');
                  }}
                  className="px-5 py-2.5 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-xl font-semibold text-sm border border-gray-200 dark:border-gray-600 hover:bg-gray-50 transition-all active:scale-95"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleProcessReturn}
                  disabled={processingReturn || returnItems.filter(item => item.returnPills > 0).length === 0}
                  className="px-7 py-2.5 bg-gradient-to-r from-red-600 to-red-500 text-white rounded-xl font-semibold text-sm shadow-lg shadow-red-500/20 hover:shadow-red-500/30 transition-all active:scale-95 disabled:opacity-50 disabled:shadow-none flex items-center gap-2"
                >
                  {processingReturn ? (
                    <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <FiRotateCcw className="w-4 h-4" />
                  )}
                  <span>Process Return</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {receiptPreviewHtml && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-[380px] max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide">
                Thermal Receipt Preview
              </span>
              <button
                type="button"
                onClick={() => setReceiptPreviewHtml(null)}
                className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-800 p-3">
              <iframe
                title="Thermal receipt preview"
                srcDoc={receiptPreviewHtml}
                className="mx-auto bg-white border-0"
                style={{ width: 302, minHeight: 480 }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SellingPanel;


