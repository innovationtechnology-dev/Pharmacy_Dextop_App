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
  FiRotateCcw,
} from 'react-icons/fi';
import { useDashboardHeader } from './useDashboardHeader';
import {
  PharmacySettings,
  getStoredPharmacySettings,
} from '../../types/pharmacy';
import { getSalesFlatRows, FlatSaleRow, updateSale } from '../../utils/sales';
import { createSaleReturn, getSaleReturnsBySaleId, SaleReturnItem } from '../../utils/sale-return';
import { Link } from 'react-router-dom';
import { currencySymbols, getCurrencySymbol as getSymbol } from '../../../common/currency';

type MedicineStatus = 'active' | 'inactive' | 'discontinued';

interface Medicine {
  id: number;
  barcode?: string;
  name: string;
  pillQuantity: number;
  status: MedicineStatus;
  sellablePills?: number;
  totalAvailablePills?: number;
  averageSellablePricePerPill?: number | null;
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
}


const recalculateSaleItem = (item: CartItem): CartItem => {
  const discountPercent = Math.min(Math.max(item.discount || 0, 0), 100);
  const taxPercent = Math.min(Math.max(item.tax || 0, 0), 100);
  const subtotal = item.unitPrice * item.pills;
  const discountAmount = (subtotal * discountPercent) / 100;
  const taxableBase = subtotal - discountAmount;
  const taxAmount = (taxableBase * taxPercent) / 100;
  const finalPrice = taxableBase + taxAmount;

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
  const [searchTerm, setSearchTerm] = useState('');
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
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
  const [invoiceNumber, setInvoiceNumber] = useState<string>(() => {
    const timestamp = Date.now();
    return `INV-${timestamp.toString().slice(-6)}`;
  });
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
    returnPills: number;
    unitPrice: number;
    discountAmount: number;
    taxAmount: number;
    reason?: string;
  }>>([]);
  const [returnReason, setReturnReason] = useState('');
  const [returnNotes, setReturnNotes] = useState('');
  const [processingReturn, setProcessingReturn] = useState(false);
  const [returnedQuantities, setReturnedQuantities] = useState<Map<number, number>>(new Map());

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const barcodeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const globalBarcodeBufferRef = useRef<string>('');
  const globalBarcodeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const dropdownItemRefs = useRef<(HTMLDivElement | null)[]>([]);

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

  const addToCart = useCallback((medicine: Medicine, quantityParam = 1) => {
    const available = medicine.sellablePills ?? 0;
    if (available <= 0) {
      alert(`No sellable stock available for ${medicine.name}.`);
      return;
    }
    let quantity = quantityParam;
    if (available < quantity) {
      alert(`Only ${available} pills available for sale!`);
      quantity = available;
    }

    setCart((prevCart) => {
      const existingItem = prevCart.find(
        (item) => item.medicine.id === medicine.id
      );

      if (existingItem) {
        const newQuantity = existingItem.pills + quantity;
        if (newQuantity > available) {
          alert(`Only ${available} pills available for sale!`);
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
  }, []);

  const handleSearch = useCallback(async (term: string) => {
    if (!term || term.trim().length === 0) {
      setShowSearchResults(false);
      return;
    }

    setIsSearching(true);
    setShowSearchResults(true);

    try {
      window.electron.ipcRenderer.once(
        'medicine-search-reply',
        (response: any) => {
          setIsSearching(false);
          if (response.success) {
            setMedicines(response.data || []);
          }
        }
      );
      window.electron.ipcRenderer.sendMessage('medicine-search', [term.trim()]);
    } catch (error) {
      console.error('Error searching medicines:', error);
      setIsSearching(false);
    }
  }, []);

  const handleBarcodeScan = useCallback(
    async (barcode: string) => {
      if (!barcode || barcode.trim().length === 0) return;

      try {
        window.electron.ipcRenderer.once(
          'medicine-get-by-barcode-reply',
          (response: any) => {
            if (response.success && response.data) {
              const medicine = response.data as Medicine;
              if ((medicine.sellablePills ?? 0) > 0) {
                // Automatically add to cart when barcode is scanned
                addToCart(medicine, 1);
                setIsScanning(true);
                // Clear barcode input and show success feedback
                setBarcodeInput('');
                // Close barcode scan modal after successful scan
                setTimeout(() => {
                  setIsScanning(false);
                  setBarcodeScanMode(false);
                }, 1000);
              } else {
                alert(
                  `Medicine "${medicine.name}" is not eligible for sale (insufficient stock or near expiry).`
                );
                setBarcodeInput('');
              }
            } else {
              // Show message if barcode not found
              alert(`Medicine with barcode "${barcode}" not found!`);
              setBarcodeInput('');
            }
          }
        );
        window.electron.ipcRenderer.sendMessage('medicine-get-by-barcode', [
          barcode.trim(),
        ]);
      } catch (error) {
        console.error('Error scanning barcode:', error);
        setBarcodeInput('');
      }
    },
    [addToCart]
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
            nextValue = Math.max(1, parseInt(value, 10) || 1);
            const available = item.medicine.sellablePills ?? Infinity;
            if (nextValue > available) {
              alert(`Only ${available} pills available for sale!`);
              return item;
            }
          }
          if (
            field === 'unitPrice' ||
            field === 'discount' ||
            field === 'tax'
          ) {
            nextValue = Math.max(0, parseFloat(value) || 0);
          }

          const updatedItem: CartItem = recalculateSaleItem({
            ...item,
            [field]: nextValue,
          });
          return updatedItem;
        })
      );
    },
    []
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

  // Load sales history
  const loadSalesHistory = useCallback(async () => {
    try {
      const response = await getSalesFlatRows();
      if (response.success && response.data) {
        // Get recent sales (last 50)
        const recent = response.data
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
          .slice(0, 50);
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

  // Function to clear form for new bill
  const clearFormForNewBill = useCallback(() => {
    setSelectedSaleId(null);
    setCart([]);
    setReturnedQuantities(new Map());
    setCustomerName('');
    setCustomerPhone('');
    const timestamp = Date.now();
    setInvoiceNumber(`INV-${timestamp.toString().slice(-6)}`);
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
  const salesHistoryList = useMemo(() => {
    const groupedSales = salesHistory.reduce((acc, sale) => {
      if (!acc[sale.saleId]) {
        acc[sale.saleId] = {
          saleId: sale.saleId,
          createdAt: sale.createdAt,
          customerName: sale.customerName || 'Walk-in Customer',
          customerPhone: sale.customerPhone || '-',
          items: [],
          total: 0,
        };
      }
      acc[sale.saleId].items.push(sale);
      acc[sale.saleId].total += sale.total;
      return acc;
    }, {} as Record<number, { saleId: number; createdAt: string; customerName: string; customerPhone: string; items: FlatSaleRow[]; total: number }>);

    return Object.values(groupedSales).sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [salesHistory]);

  // Reset to new bill when sales history is loaded and no bill is selected
  useEffect(() => {
    if (
      salesHistoryList.length > 0 &&
      currentBillIndex === -1 &&
      selectedSaleId === null
    ) {
      // Ensure we're on new bill state
      clearFormForNewBill();
    }
  }, [
    salesHistoryList.length,
    currentBillIndex,
    selectedSaleId,
    clearFormForNewBill,
  ]);

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-US', {
          hour12: true,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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
    return () => clearTimeout(timer);
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
      }, 200);
    }

    return () => {
      if (barcodeTimeoutRef.current) {
        clearTimeout(barcodeTimeoutRef.current);
      }
    };
  }, [barcodeInput, handleBarcodeScan, barcodeScanMode]);

  // Global barcode scanner listener (works without opening scan modal)
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

      // Ignore modifier combinations
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
  }, [handleBarcodeScan, barcodeScanMode]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setSearchTerm(value);
    setHighlightedIndex(-1); // Reset highlight when search changes
    handleSearch(value);
  };

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

    if (!showSearchResults || medicines.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < medicines.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
      e.preventDefault();
      const medicine = medicines[highlightedIndex];
      if (medicine && (medicine.sellablePills ?? 0) > 0) {
        addToCart(medicine, 1);
        setSearchTerm('');
        setShowSearchResults(false);
        setHighlightedIndex(-1);
      }
    } else if (e.key === 'Escape') {
      setShowSearchResults(false);
      setHighlightedIndex(-1);
    }
  };

  const addToCartWithFeedback = useCallback(
    (medicine: Medicine, quantity = 1) => {
      addToCart(medicine, quantity);
      setShowSearchResults(false);
      setSearchTerm('');
      if (searchInputRef.current) {
        searchInputRef.current.focus();
      }
    },
    [addToCart]
  );

  const removeFromCart = (medicineId: number) => {
    setCart((prevCart) =>
      prevCart.filter((item) => item.medicine.id !== medicineId)
    );
  };

  const updateCartQuantity = (medicineId: number, change: number) => {
    setCart((prevCart) => {
      return prevCart
        .map((item) => {
          if (item.medicine.id === medicineId) {
            const available = item.medicine.sellablePills ?? Infinity;
            const newQuantity = item.pills + change;
            if (newQuantity <= 0) return null;
            if (newQuantity > available) {
              alert(`Only ${available} pills available in stock!`);
              return item;
            }
            const updatedItem = recalculateSaleItem({
              ...item,
              pills: newQuantity,
            });
            return updatedItem;
          }
          return item;
        })
        .filter((item): item is CartItem => item !== null);
    });
  };

  const setCartItemQuantity = (medicineId: number, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(medicineId);
      return;
    }

    setCart((prevCart) => {
      return prevCart.map((item) => {
        if (item.medicine.id === medicineId) {
          const available = item.medicine.sellablePills ?? Infinity;
          if (quantity > available) {
            alert(`Only ${available} pills available in stock!`);
            return item;
          }
          const updatedItem = recalculateSaleItem({
            ...item,
            pills: quantity,
          });
          return updatedItem;
        }
        return item;
      });
    });
  };

  const calculateTotal = () => {
    return cart.reduce((sum, item) => sum + item.finalPrice, 0);
  };

  const handleCheckout = async () => {
    if (cart.length === 0) {
      alert('Cart is empty!');
      return;
    }

    setProcessing(true);

    try {
      const sale = {
        items: cart.map((item) => ({
          medicineId: item.medicine.id,
          medicineName: item.medicine.name,
          pills: item.pills,
          unitPrice: item.unitPrice,
          discountAmount: item.discountAmount || 0,
          taxAmount: item.taxAmount || 0,
        })),
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
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
          }, 2000);
        } else {
          alert(`Error updating sale: ${result.error || 'Unknown error'}`);
        }
      } else {
        // Create new sale
        window.electron.ipcRenderer.once('sale-create-reply', (response: any) => {
          setProcessing(false);
          if (response.success) {
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
            }, 2000);
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

    const profile = pharmacyInfo;
    const currencyCode = profile.currency || 'USD';
    const symbol = getSymbol(currencyCode);
    const subtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
    const discountTotal = cart.reduce(
      (sum, item) => sum + (item.discountAmount || 0),
      0
    );
    const taxTotal = cart.reduce((sum, item) => sum + (item.taxAmount || 0), 0);
    const grandTotal = subtotal - discountTotal + taxTotal;
    const printInvoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
    const now = new Date();
    const dateString = now.toLocaleDateString();
    const timeString = now.toLocaleTimeString();

    const rows = cart
      .map(
        (item, index) => `
                <tr>
                    <td>${index + 1}</td>
                    <td>
                        <strong>${item.medicine.name}</strong><br/>
                        <small>${item.medicine.barcode || '—'}</small>
                    </td>
                    <td>${item.pills}</td>
                    <td>${symbol}${item.unitPrice.toFixed(2)}</td>
                    <td>${symbol}${item.subtotal.toFixed(2)}</td>
                </tr>
            `
      )
      .join('');

    const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>${printInvoiceNumber}</title>
                <style>
                    body { font-family: 'Inter', sans-serif; margin: 0; padding: 32px; background: #f3f4f6; color: #111827; }
                    .invoice { background: #fff; border-radius: 16px; padding: 32px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); }
                    .header { display:flex; justify-content:space-between; }
                    .brand { display:flex; gap:16px; }
                    .logo {
                        width:56px; height:56px; border-radius:16px;
                        background: linear-gradient(135deg, #059669, #10b981);
                        color:#fff; display:flex; align-items:center; justify-content:center;
                        font-size:22px; font-weight:700;
                    }
                    table { width:100%; border-collapse:collapse; margin-top:24px; }
                    th, td { padding:12px; border-bottom:1px solid #e5e7eb; text-align:left; font-size:14px; }
                    th { background:#f9fafb; text-transform:uppercase; font-size:12px; color:#6b7280; letter-spacing:0.05em; }
                    .totals { width:320px; margin-left:auto; margin-top:24px; }
                    .totals td { border:none; padding:6px 0; }
                    .grand { font-size:20px; font-weight:700; color:#059669; }
                    .notes { margin-top:24px; font-size:13px; color:#374151; }
                    .footer { margin-top:24px; padding-top:16px; border-top:1px dashed #d1d5db; color:#6b7280; font-size:12px; }
                    @media print { body { background:#fff; padding:0; } .invoice { box-shadow:none; border-radius:0; } }
                </style>
            </head>
            <body>
                <div class="invoice">
                    <div class="header">
                        <div class="brand">
                            ${profile.logoUrl
        ? `<img src="${profile.logoUrl}" alt="logo" style="width:56px;height:56px;border-radius:16px;object-fit:cover;" />`
        : `<div class="logo">${profile.pharmacyName?.[0]?.toUpperCase() ||
        'P'
        }</div>`
      }
                            <div>
                                <h1 style="margin:0;font-size:24px;">${profile.pharmacyName || 'Your Pharmacy'
      }</h1>
                                <p style="margin:4px 0 0;color:#6b7280;">${profile.tagline ||
      'Complete care for every prescription.'
      }</p>
                            </div>
                        </div>
                        <div style="text-align:right;">
                            <p style="margin:0;">Invoice <strong>${printInvoiceNumber}</strong></p>
                            <p style="margin:4px 0 0;">${dateString} ${timeString}</p>
                        </div>
                    </div>

                    <table style="margin-top:16px;">
                        <tr>
                            <td style="vertical-align:top;padding-right:24px;">
                                <p style="font-size:12px;text-transform:uppercase;color:#9ca3af;letter-spacing:0.05em;margin-bottom:4px;">Bill To</p>
                                <p style="margin:0;font-weight:600;">${customerName || 'Walk-in Customer'
      }</p>
                                <p style="margin:2px 0 0;color:#6b7280;">${customerPhone || 'No phone provided'
      }</p>
                            </td>
                            <td style="vertical-align:top;">
                                <p style="font-size:12px;text-transform:uppercase;color:#9ca3af;letter-spacing:0.05em;margin-bottom:4px;">Pharmacy</p>
                                <p style="margin:0;font-weight:600;">${profile.pharmacyName || 'Your Pharmacy'
      }</p>
                                <p style="margin:2px 0 0;color:#6b7280;">${profile.address || 'Address not configured'
      }</p>
                                <p style="margin:2px 0 0;color:#6b7280;">${profile.phone || ''
      }${profile.email ? ` • ${profile.email}` : ''
      }</p>
                                ${profile.taxId
        ? `<p style="margin:2px 0 0;color:#6b7280;">Tax ID: ${profile.taxId}</p>`
        : ''
      }
                                ${profile.website
        ? `<p style="margin:2px 0 0;color:#6b7280;">${profile.website}</p>`
        : ''
      }
                            </td>
                        </tr>
                    </table>

                    <table>
                        <thead>
                            <tr>
                                <th style="width:40px;">#</th>
                                <th>Medicine</th>
                                <th style="width:70px;">Qty</th>
                                <th style="width:120px;">Unit Price</th>
                                <th style="width:120px;">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>

                    <div class="totals">
                        <table>
                            <tr><td>Subtotal</td><td style="text-align:right;">${symbol}${subtotal.toFixed(
        2
      )}</td></tr>
                            <tr><td>Discount</td><td style="text-align:right;">-${symbol}${discountTotal.toFixed(
        2
      )}</td></tr>
                            <tr><td>Tax</td><td style="text-align:right;">+${symbol}${taxTotal.toFixed(
        2
      )}</td></tr>
                            <tr><td colspan="2"><hr style="border:none;border-top:1px solid #e5e7eb;margiPn:8px 0;"></td></tr>
                            <tr><td class="grand">Grand Total</td><td class="grand" style="text-align:right;">${symbol}${grandTotal.toFixed(
        2
      )}</td></tr>
                        </table>
                    </div>

                    <div class="notes">
                        ${profile.invoiceNotes ||
      'Thank you for choosing us. Please reach out if you have any questions about your prescription.'
      }
                    </div>

                    <div class="footer">
                        Generated on ${dateString} at ${timeString}. This is a computer-generated invoice and does not require a signature.
                    </div>
                </div>
                <script>
                    window.onload = function() {
                        window.print();
                    };
                </script>
            </body>
            </html>
        `;

    const printFrame = document.createElement('iframe');
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = '0';
    document.body.appendChild(printFrame);

    const frameDoc = printFrame.contentWindow?.document;
    if (!frameDoc) {
      alert('Unable to prepare invoice for printing.');
      document.body.removeChild(printFrame);
      return;
    }

    frameDoc.open();
    frameDoc.write(html);
    frameDoc.close();

    printFrame.onload = () => {
      printFrame.contentWindow?.focus();
      printFrame.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(printFrame);
      }, 500);
    };
  }, [cart, pharmacyInfo, customerName, customerPhone]);

  const clearCart = () => {
    if (window.confirm('Clear cart and start a new sale?')) {
      setCart([]);
      setReturnedQuantities(new Map());
      setSelectedSaleId(null);
      setCurrentBillIndex(-1); // Reset to new bill
      clearFormForNewBill();
    }
  };

  const subtotalValue = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const discountValue = cart.reduce(
    (sum, item) => sum + (item.discountAmount || 0),
    0
  );
  const taxValue = cart.reduce((sum, item) => sum + (item.taxAmount || 0), 0);
  const grandTotal = subtotalValue - discountValue + taxValue;

  const formatCurrency = (value: number) => {
    const currency = pharmacyInfo.currency || 'USD';
    const symbol = getSymbol(currency);
    if (currency === 'INR' || currency === 'PKR') {
      return `${symbol}${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
  };

  // Function to load sale details into the form
  const loadSaleDetails = useCallback(
      async (sale: { saleId: number; createdAt: string; customerName: string; customerPhone: string; items: FlatSaleRow[]; total: number }, index?: number) => {
        setSelectedSaleId(sale.saleId);

        // Set customer information
        setCustomerName(sale.customerName || 'CASH CUSTOMER');
        setCustomerPhone(sale.customerPhone || '0000');
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

        if (returnsResponse.success && returnsResponse.data) {
          returnsResponse.data.forEach((ret) => {
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

          // Calculate discount percentage from discount amount
          const subtotal = item.unitPrice * item.pills;
          const discountPercent =
            subtotal > 0 ? (item.discountAmount / subtotal) * 100 : 0;

          // Calculate tax percentage from tax amount
          const taxableBase = subtotal - item.discountAmount;
          const taxPercent =
            taxableBase > 0 ? (item.taxAmount / taxableBase) * 100 : 0;

          const cartItem: CartItem = {
            medicine: medicineObj,
            pills: item.pills,
            unitPrice: item.unitPrice,
            discount: discountPercent,
            tax: taxPercent,
            subtotal,
            discountAmount: item.discountAmount,
            taxAmount: item.taxAmount,
            finalPrice: item.total,
          };

          return recalculateSaleItem(cartItem);
        });

        setCart(cartItems);
        setReturnedQuantities(returnedByMedicine);

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
    if (!selectedSaleId || cart.length === 0) {
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

        // Initialize return items from cart (all items, but not pre-selected)
        const items = cart.map((item) => {
          const alreadyReturned = returnedByMedicine.get(item.medicine.id) || 0;
          const availableToReturn = item.pills - alreadyReturned;
          return {
            medicineId: item.medicine.id,
            medicineName: item.medicine.name,
            originalPills: item.pills,
            returnPills: 0, // Start with 0 - user will select which items to return
            unitPrice: item.unitPrice,
            discountAmount: item.discountAmount || 0,
            taxAmount: item.taxAmount || 0,
            reason: '',
          };
        }).filter(item => item.originalPills > 0);

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
      const items = cart.map((item) => ({
        medicineId: item.medicine.id,
        medicineName: item.medicine.name,
        originalPills: item.pills,
        returnPills: 0, // Start with 0 - user will select which items to return
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount || 0,
        taxAmount: item.taxAmount || 0,
        reason: '',
      }));
      setReturnItems(items);
      setShowReturnModal(true);
    }
  }, [selectedSaleId, cart]);

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
          unitPrice: item.unitPrice,
          discountAmount: item.discountAmount,
          taxAmount: item.taxAmount,
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
        loadMedicines(); // Reload medicines to update quantities
        loadSalesHistory(); // Reload sales history
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

  const currencyCode = pharmacyInfo.currency || 'USD';
  const symbol = getSymbol(currencyCode);

  return (
    <div className="h-[calc(100vh-80px)] w-full bg-gradient-to-br from-gray-50 via-gray-50 to-gray-100/50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800/80 overflow-hidden flex flex-col p-2">
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
                            onClick={() => addToCart(medicine, 1)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                addToCart(medicine, 1);
                              }
                            }}
                          >
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {medicine.name}
                              </h3>
                              <div className="flex items-center gap-3 mt-1">
                                {medicine.barcode && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Barcode: {medicine.barcode}
                                  </p>
                                )}
                                <span className="text-xs font-semibold text-green-600 dark:text-green-400">
                                  {(
                                    medicine.averageSellablePricePerPill || 0
                                  ).toFixed(2)}
                                </span>
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${(medicine.sellablePills ?? 0) > 0
                                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                    }`}
                                >
                                  Stock: {medicine.sellablePills ?? 0}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                addToCart(medicine, 1);
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
                      onClick={() => addToCart(medicine, 1)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          addToCart(medicine, 1);
                        }
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900 dark:text-white">
                            {medicine.name}
                          </h3>
                          {medicine.barcode && (
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              Barcode: {medicine.barcode}
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
                              Sellable Pills: {medicine.sellablePills ?? 0}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            addToCart(medicine, 1);
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
            <div className="bg-gradient-to-br from-white via-white to-gray-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-gray-800/90 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-3 flex-shrink-0">

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
                  <input
                    type="text"
                    value={customerName || 'CASH CUSTOMER'}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="flex-1 min-w-0 h-8 px-2.5 text-xs font-semibold border-2 border-emerald-500/40 dark:border-emerald-500/40 bg-white dark:bg-gray-700/50 dark:text-white rounded-md focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition"
                  />
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
                    value={customerPhone || '0000'}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-28 h-8 px-2.5 text-xs font-semibold border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700/50 dark:text-white rounded-md focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition"
                  />
                </div>

                {/* VISITS */}
                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase whitespace-nowrap">
                    Visits
                  </label>
                  <input
                    type="text"
                    value="0"
                    readOnly
                    className="w-16 h-8 px-2.5 text-xs font-semibold border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/40 text-gray-700 dark:text-gray-300 rounded-md"
                  />
                </div>

                {/* HISTORY BTN */}
                <Link
                  to="/sales"
                  className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition shadow-sm"
                >
                  History
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
                      }, 200);
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
                            addToCart(medicine, 1);
                            setSearchTerm('');
                            setShowSearchResults(false);
                            setHighlightedIndex(-1);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              if ((medicine.sellablePills ?? 0) > 0) {
                                addToCart(medicine, 1);
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
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                              {medicine.barcode && (
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  Barcode: {medicine.barcode}
                                </span>
                              )}
                              <span className="text-xs font-semibold text-green-600 dark:text-green-400">
                                Price:{' '}
                                {(
                                  medicine.averageSellablePricePerPill || 0
                                ).toFixed(2)}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${(medicine.sellablePills ?? 0) > 0
                                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                  : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                  }`}
                              >
                                Stock: {medicine.sellablePills ?? 0}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              addToCart(medicine, 1);
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
              className="flex-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200/60 dark:border-gray-700/60 shadow-md overflow-hidden flex flex-col min-h-0 max-h-full backdrop-blur-sm"
            >
              <div className="px-4 py-3 bg-gradient-to-r from-gray-50 to-gray-100/50 dark:from-gray-700/50 dark:to-gray-700/30 border-b border-gray-200/60 dark:border-gray-600/60 flex-shrink-0 z-10">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wide">
                    Current Bill Items
                  </h3>
                  {currentBillIndex >= 0 && (
                    <div className="text-[10px] px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 rounded border border-yellow-300 dark:border-yellow-700">
                      Viewing old sale - Use trash icon to remove items
                    </div>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0 overscroll-contain">
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
                  <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {/* Table Header */}
                    <div className="grid grid-cols-12 gap-1.5 px-3 py-2.5 bg-gradient-to-r from-gray-50/80 to-gray-100/50 dark:from-gray-700/40 dark:to-gray-700/20 border-b-2 border-gray-200/60 dark:border-gray-600/60 text-[10px] font-bold text-gray-700 dark:text-gray-300 sticky top-0 uppercase tracking-wider">
                      <div className="col-span-1">Sr#</div>
                      <div className="col-span-3">Product</div>
                      <div className="col-span-1 text-center">Qty</div>
                      <div className="col-span-1 text-center">Price</div>
                      <div className="col-span-1 text-center">Disc%</div>
                      <div className="col-span-1 text-center">Tax%</div>
                      <div className="col-span-2 text-center">Amount</div>
                      <div className="col-span-1 text-center">Action</div>
                    </div>
                    {/* Cart Items */}
                    {cart.map((item, index) => (
                      <div
                        key={item.medicine.id}
                        className="grid grid-cols-12 gap-1.5 px-3 py-2.5 hover:bg-gradient-to-r hover:from-emerald-50/30 hover:to-transparent dark:hover:from-emerald-900/10 dark:hover:to-transparent transition-all items-center text-xs border-b border-gray-100/50 dark:border-gray-700/30"
                      >
                        <div className="col-span-1 text-gray-600 dark:text-gray-400 text-[11px] font-medium">
                          {index + 1}
                        </div>
                        <div className="col-span-3">
                          <div className="font-medium text-gray-900 dark:text-white truncate text-[11px]">
                            {item.medicine.name}
                          </div>
                          <div className="text-[10px] text-gray-500 dark:text-gray-500 truncate">
                            {item.medicine.barcode || '-'}
                          </div>
                        </div>
                        <div className="col-span-1">
                          {currentBillIndex >= 0 ? (
                            // Read-only display for old sales
                            <div className="text-center">
                              <div className="text-[11px] font-semibold text-gray-900 dark:text-white">
                                {item.pills}
                              </div>
                              {returnedQuantities.get(item.medicine.id) && returnedQuantities.get(item.medicine.id)! > 0 && (
                                <div className="text-[9px] text-red-600 dark:text-red-400 font-semibold">
                                  -{returnedQuantities.get(item.medicine.id)} ret
                                </div>
                              )}
                            </div>
                          ) : (
                            // Editable for new sales
                            <div className="flex items-center gap-0.5 justify-center">
                              <button
                                type="button"
                                onClick={() =>
                                  updateCartQuantity(item.medicine.id, -1)
                                }
                                className="p-0.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded transition-colors"
                                disabled={item.pills <= 1}
                              >
                                <FiMinus className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                              </button>
                              <input
                                type="number"
                                min={1}
                                max={
                                  typeof item.medicine.sellablePills === 'number'
                                    ? item.medicine.sellablePills
                                    : undefined
                                }
                                value={item.pills}
                                onChange={(
                                  e: React.ChangeEvent<HTMLInputElement>
                                ) => {
                                  let val = parseInt(e.target.value, 10);
                                  if (Number.isNaN(val) || val < 1) val = 1;
                                  if (
                                    typeof item.medicine.sellablePills ===
                                    'number' &&
                                    val > item.medicine.sellablePills
                                  ) {
                                    val = item.medicine.sellablePills;
                                  }
                                  setCartItemQuantity(item.medicine.id, val);
                                }}
                                className="w-12 px-1 py-1 text-center text-[11px] font-semibold border border-gray-300 dark:border-gray-600 dark:bg-gray-700/50 dark:text-white rounded focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  updateCartQuantity(item.medicine.id, 1)
                                }
                                className="p-0.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded transition-colors"
                                disabled={
                                  typeof item.medicine.sellablePills === 'number'
                                    ? item.pills >= item.medicine.sellablePills
                                    : false
                                }
                              >
                                <FiPlus className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="col-span-1 text-center">

                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={item.unitPrice}
                            readOnly
                            className="w-full px-1.5 py-1 text-[11px] font-semibold border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded cursor-not-allowed"
                          />
                        </div>
                        <div className="col-span-1 text-center">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            value={item.discount || 0}
                            onChange={(
                              e: React.ChangeEvent<HTMLInputElement>
                            ) =>
                              updateCartItemField(
                                item.medicine.id,
                                'discount',
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="w-full px-1.5 py-1 text-[11px] font-semibold border border-gray-300 dark:border-gray-600 dark:bg-gray-700/50 dark:text-white rounded focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all"
                            placeholder="0"
                          />
                        </div>
                        <div className="col-span-1 text-center">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            value={item.tax || 0}
                            onChange={(
                              e: React.ChangeEvent<HTMLInputElement>
                            ) =>
                              updateCartItemField(
                                item.medicine.id,
                                'tax',
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="w-full px-1.5 py-1 text-[11px] font-semibold border border-gray-300 dark:border-gray-600 dark:bg-gray-700/50 dark:text-white rounded focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all"
                            placeholder="0"
                          />
                        </div>
                        <div className="col-span-2 text-center font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                          {symbol}{item.finalPrice.toFixed(2)}
                        </div>
                        <div className="col-span-1 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              // Always allow removal - works for both new sale and viewing old sale
                              removeFromCart(item.medicine.id);
                            }}
                            className="p-1.5 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-300 rounded transition-all border border-transparent hover:border-red-300 dark:hover:border-red-700"
                            title="Remove from cart"
                          >
                            <FiTrash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Right Side: Summary (Top Half) and History (Bottom Half) */}
          <div className="lg:col-span-4 flex flex-col gap-3 overflow-hidden min-h-0 h-full">
            {/* Sale Summary - Top Half */}
            <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col overflow-hidden min-h-0">
              <div className="px-4 py-2.5 bg-gradient-to-r from-gray-50 to-gray-100/50 dark:from-gray-700/50 dark:to-gray-700/30 border-b border-gray-200 dark:border-gray-600 flex-shrink-0">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wide">
                  Sale Summary
                </h3>
              </div>
              <div className="flex-1 flex flex-col p-3 gap-3 min-h-0 overflow-y-auto">
                {/* Net Payable - Most Prominent */}
                <div className="bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-500 dark:from-emerald-600 dark:via-emerald-700 dark:to-emerald-600 rounded-lg p-4 border border-emerald-600 dark:border-emerald-500 shadow-lg">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs font-semibold text-white/90 uppercase tracking-wide">
                      Net Payable
                    </div>
                    <div className="px-2 py-0.5 bg-white/20 dark:bg-white/10 rounded-full">
                      <span className="text-[10px] font-bold text-white">
                        {cart.length} {cart.length === 1 ? 'Item' : 'Items'}
                      </span>
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-white tracking-tight">
                    {formatCurrency(calculateTotal())}
                  </div>
                </div>

                {/* Summary Breakdown Grid */}
                <div className="space-y-2">
                  {/* Subtotal Row */}
                  <div className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-200 dark:border-gray-600">
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                      Subtotal
                    </span>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">
                      {formatCurrency(subtotalValue)}
                    </span>
                  </div>

                  {/* Discount and Tax Row */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center justify-between py-2 px-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                      <span className="text-[10px] font-semibold text-orange-700 dark:text-orange-400 uppercase tracking-wide">
                        Discount
                      </span>
                      <span className="text-sm font-bold text-orange-600 dark:text-orange-400">
                        -{formatCurrency(discountValue)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-2 px-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                      <span className="text-[10px] font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide">
                        Tax
                      </span>
                      <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                        +{formatCurrency(taxValue)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons Section */}
                <div className="mt-auto pt-2 border-t border-gray-200 dark:border-gray-700 space-y-2">
                  {currentBillIndex >= 0 ? (
                    // When viewing a previous sale
                    <>
                      {/* Primary Action: Update Sale */}
                      <button
                        type="button"
                        onClick={handleCheckout}
                        disabled={processing || cart.length === 0}
                        className="w-full py-3 bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-600 dark:from-emerald-700 dark:via-emerald-600 dark:to-emerald-700 text-white rounded-lg text-sm font-bold hover:from-emerald-700 hover:via-emerald-600 hover:to-emerald-700 dark:hover:from-emerald-800 dark:hover:via-emerald-700 dark:hover:to-emerald-800 disabled:from-gray-400 disabled:via-gray-400 disabled:to-gray-400 dark:disabled:from-gray-600 dark:disabled:via-gray-600 dark:disabled:to-gray-600 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
                      >
                        {processing ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Updating Sale...</span>
                          </>
                        ) : (
                          <>
                              <FiCheck className="w-4 h-4" />
                            <span>Update Sale</span>
                          </>
                        )}
                      </button>

                      {/* Secondary Actions Grid */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={handleOpenReturnModal}
                          className="py-2.5 bg-gradient-to-r from-red-600 to-red-500 dark:from-red-700 dark:to-red-600 text-white rounded-lg text-xs font-semibold hover:from-red-700 hover:to-red-600 dark:hover:from-red-800 dark:hover:to-red-700 transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-1.5"
                        >
                          <FiRotateCcw className="w-3.5 h-3.5" />
                          <span>Return</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm('Start a new sale? This will clear the current cart.')) {
                              clearFormForNewBill();
                              setCurrentBillIndex(-1);
                              setSelectedSaleId(null);
                            }
                          }}
                          className="py-2.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold hover:bg-gray-50 dark:hover:bg-gray-600 transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-1.5 border border-gray-300 dark:border-gray-600"
                        >
                          <FiPlus className="w-3.5 h-3.5" />
                          <span>New Sale</span>
                        </button>
                      </div>
                    </>
                  ) : (
                      // When creating new sale
                    <button
                      type="button"
                      onClick={handleCheckout}
                      disabled={processing || cart.length === 0}
                        className="w-full py-4 bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-600 dark:from-emerald-700 dark:via-emerald-600 dark:to-emerald-700 text-white rounded-lg text-base font-bold hover:from-emerald-700 hover:via-emerald-600 hover:to-emerald-700 dark:hover:from-emerald-800 dark:hover:via-emerald-700 dark:hover:to-emerald-800 disabled:from-gray-400 disabled:via-gray-400 disabled:to-gray-400 dark:disabled:from-gray-600 dark:disabled:via-gray-600 dark:disabled:to-gray-600 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
                      >
                        {processing ? (
                          <>
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Processing Sale...</span>
                          </>
                        ) : (
                          <>
                              <FiCheck className="w-5 h-5" />
                              <span>Complete Sale</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* Utility Actions */}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handlePrintInvoice}
                      disabled={cart.length === 0}
                      className="flex-1 py-2 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold hover:bg-gray-50 dark:hover:bg-gray-600 transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-1.5 border border-gray-300 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <FiPrinter className="w-3.5 h-3.5" />
                      <span>Print</span>
                    </button>
                    <button
                      type="button"
                      onClick={clearCart}
                      className="flex-1 py-2 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold hover:bg-gray-50 dark:hover:bg-gray-600 transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-1.5 border border-gray-300 dark:border-gray-600"
                    >
                      <FiRotateCcw className="w-3.5 h-3.5" />
                      <span>Reset</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Selling History - Bottom Half */}
            <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col overflow-hidden min-h-0">
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

      {/* Return Modal */}
      {showReturnModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <FiRotateCcw className="w-5 h-5 text-red-500" />
                Create Sale Return
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowReturnModal(false);
                  setReturnItems([]);
                  setReturnReason('');
                  setReturnNotes('');
                }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <FiX className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Return Reason (Optional)
                </label>
                <input
                  type="text"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="e.g., Defective, Wrong item, Customer request..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Notes (Optional)
                </label>
                <textarea
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  placeholder="Additional notes about the return..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                />
              </div>

              <div className="mb-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Items to Return
                  </h3>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const newItems = returnItems.map(item => ({
                          ...item,
                          returnPills: item.originalPills
                        }));
                        setReturnItems(newItems);
                      }}
                      className="text-xs px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                    >
                      Select All
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
                      className="text-xs px-2 py-1 bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {returnItems.map((item, index) => {
                    const isSelected = item.returnPills > 0;
                    const subtotal = item.unitPrice * item.returnPills;
                    const total = subtotal - item.discountAmount + item.taxAmount;
                    return (
                      <div
                        key={item.medicineId}
                        className={`border-2 rounded-lg p-3 transition-all ${
                          isSelected
                            ? 'border-red-400 dark:border-red-600 bg-red-50 dark:bg-red-900/20 shadow-md'
                            : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 opacity-75'
                        }`}
                      >
                        <div className="flex items-start gap-3 mb-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              const newItems = [...returnItems];
                              newItems[index].returnPills = e.target.checked ? item.originalPills : 0;
                              setReturnItems(newItems);
                            }}
                            className="mt-1 w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500 focus:ring-2 cursor-pointer"
                          />
                          <div className="flex-1">
                            <div className={`font-semibold ${isSelected ? 'text-red-900 dark:text-red-200' : 'text-gray-900 dark:text-white'}`}>
                              {item.medicineName}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              Original: {item.originalPills} pills | Unit Price: {symbol}{item.unitPrice.toFixed(2)}
                            </div>
                            {isSelected && (
                              <div className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
                                ✓ Selected for return
                              </div>
                            )}
                          </div>
                        </div>
                        {isSelected && (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 pt-3 border-t border-red-200 dark:border-red-800">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                Return Quantity
                              </label>
                              <input
                                type="number"
                                min={1}
                                max={item.originalPills}
                                value={item.returnPills}
                                onChange={(e) => {
                                  const newItems = [...returnItems];
                                  newItems[index].returnPills = Math.max(1, Math.min(item.originalPills, parseInt(e.target.value) || 1));
                                  setReturnItems(newItems);
                                }}
                                className="w-full px-2 py-1 text-sm border border-red-300 dark:border-red-700 rounded dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                              />
                              <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                                Max: {item.originalPills}
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                Reason (Optional)
                              </label>
                              <input
                                type="text"
                                value={item.reason || ''}
                                onChange={(e) => {
                                  const newItems = [...returnItems];
                                  newItems[index].reason = e.target.value;
                                  setReturnItems(newItems);
                                }}
                                placeholder="Item reason..."
                                className="w-full px-2 py-1 text-sm border border-red-300 dark:border-red-700 rounded dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                              />
                            </div>
                            <div className="col-span-2">
                              <div className="text-xs text-gray-600 dark:text-gray-400">
                                <div>Subtotal: {symbol}{subtotal.toFixed(2)}</div>
                                <div>Discount: {symbol}{item.discountAmount.toFixed(2)}</div>
                                <div>Tax: {symbol}{item.taxAmount.toFixed(2)}</div>
                                <div className="font-semibold text-red-700 dark:text-red-300 mt-1">
                                  Total: {symbol}{total.toFixed(2)}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {returnItems.filter(item => item.returnPills > 0).length === 0 && (
                  <div className="text-center py-4 text-sm text-gray-500 dark:text-gray-400">
                    No items selected. Check the boxes above to select items for return.
                  </div>
                )}
              </div>

              <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-gray-900 dark:text-white">
                    Total Return Amount:
                  </span>
                  <span className="text-lg font-bold text-red-600 dark:text-red-400">
                    {symbol}
                    {returnItems
                      .reduce((sum, item) => {
                        const subtotal = item.unitPrice * item.returnPills;
                        return sum + subtotal - item.discountAmount + item.taxAmount;
                      }, 0)
                      .toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowReturnModal(false);
                  setReturnItems([]);
                  setReturnReason('');
                  setReturnNotes('');
                }}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleProcessReturn}
                disabled={processingReturn || returnItems.filter(item => item.returnPills > 0).length === 0}
                className="flex-1 px-4 py-2 bg-red-600 dark:bg-red-700 text-white rounded-md font-semibold hover:bg-red-700 dark:hover:bg-red-600 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {processingReturn ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <FiRotateCcw className="w-4 h-4" />
                    Process Return
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SellingPanel;


