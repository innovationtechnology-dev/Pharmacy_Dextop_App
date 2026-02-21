import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useDashboardHeader } from './useDashboardHeader';
import { FiPlus } from 'react-icons/fi';
import { PharmacySettings, getStoredPharmacySettings } from '../../types/pharmacy';

const currencySymbols: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  PKR: '₨',
  INR: '₹',
};

type MedicineStatus = 'active' | 'inactive' | 'discontinued';

interface Medicine {
  id: number;
  name: string;
  barcode?: string;
  pillQuantity: number;
  status: MedicineStatus;
  totalAvailablePills: number;
  sellablePills: number;
  averageSellablePricePerPill?: number | null;
}

type BackendMedicine = {
  id?: number;
  name?: string;
  barcode?: string | null;
  pillQuantity?: number;
  status?: MedicineStatus;
  totalAvailablePills?: number;
  sellablePills?: number;
  averageSellablePricePerPill?: number | null;
};

type IpcResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

type MedicineFormState = {
  name: string;
  pillQuantity: string;
  barcode: string;
  status: MedicineStatus;
};

const STATUS_LIBRARY: MedicineStatus[] = ['active', 'inactive', 'discontinued'];
const DEFAULT_STATUS: MedicineStatus = 'active';

const emptyMedicineForm: MedicineFormState = {
  name: '',
  pillQuantity: '',
  barcode: '',
  status: DEFAULT_STATUS,
};

const formatNumericId = (id?: number) => {
  if (typeof id === 'number' && Number.isFinite(id)) {
    return `#${String(id).padStart(3, '0')}`;
  }
  return '#---';
};

const mapBackendMedicine = (record: BackendMedicine): Medicine => {
  return {
    id: record.id ?? 0,
    name: record.name ?? 'Untitled medicine',
    barcode: record.barcode ?? undefined,
    pillQuantity: record.pillQuantity ?? 0,
    status: record.status ?? DEFAULT_STATUS,
    totalAvailablePills: record.totalAvailablePills ?? 0,
    sellablePills: record.sellablePills ?? 0,
    averageSellablePricePerPill: record.averageSellablePricePerPill ?? null,
  };
};

export default function MedicinesPage() {
  const { expiringAlerts, alertThresholdDays } = useDashboardHeader();
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | MedicineStatus>('all');
  const [newMedicine, setNewMedicine] =
    useState<MedicineFormState>(emptyMedicineForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [editingMedicineId, setEditingMedicineId] = useState<number | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [pharmacySettings] = useState<PharmacySettings>(() => getStoredPharmacySettings());

  // Get currency symbol
  const getCurrencySymbol = () => {
    const currency = pharmacySettings.currency || 'USD';
    return currencySymbols[currency] || currency;
  };
  const loadMedicines = useCallback(() => {
    if (!window?.electron) {
      setLoadError('Electron bridge unavailable. Please restart the app.');
      return;
    }

    setIsLoading(true);
    window.electron.ipcRenderer.once(
      'medicine-get-all-reply',
      (...args: unknown[]) => {
        setIsLoading(false);
        const response = args[0] as IpcResponse<BackendMedicine[]>;

        if (!response?.success || !Array.isArray(response.data)) {
          setLoadError(response?.error ?? 'Unable to load medicines.');
          return;
        }

        setLoadError(null);
        const backendMedicines = response.data as BackendMedicine[];
        setMedicines(backendMedicines.map((record) => mapBackendMedicine(record)));
      }
    );

    window.electron.ipcRenderer.sendMessage('medicine-get-all', []);
  }, []);

  useEffect(() => {
    loadMedicines();
  }, [loadMedicines]);

  const handleNewMedicineChange = (
    field: keyof MedicineFormState,
    value: string
  ) => {
    setNewMedicine((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleAddMedicine = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (
      !newMedicine.name.trim() ||
      !newMedicine.pillQuantity.trim() ||
      !newMedicine.barcode.trim()
    ) {
      setFormError('Medicine name, pill quantity, and barcode are required.');
      return;
    }

    const pillQuantity = Number(newMedicine.pillQuantity);

    if (Number.isNaN(pillQuantity) || pillQuantity <= 0) {
      setFormError('Pill quantity must be a positive number.');
      return;
    }

    if (!window?.electron) {
      setFormError(
        'Electron bridge unavailable. Please restart the application.'
      );
      return;
    }

    const payload = {
      name: newMedicine.name.trim(),
      pillQuantity,
      barcode: newMedicine.barcode.trim(),
      status: newMedicine.status,
    };

    setIsSubmitting(true);

    if (editingMedicineId) {
      // Update existing medicine
      window.electron.ipcRenderer.once(
        'medicine-update-reply',
        (...args: unknown[]) => {
          setIsSubmitting(false);
          const response = args[0] as IpcResponse<{ id: number }>;

          if (!response?.success) {
            setFormError(response?.error ?? 'Failed to update medicine.');
            return;
          }

          setFormSuccess(`${payload.name} has been updated.`);
          setFeedbackMessage(`${payload.name} updated successfully.`);
          setNewMedicine(emptyMedicineForm);
          setEditingMedicineId(null);
          loadMedicines();
        }
      );
      window.electron.ipcRenderer.sendMessage('medicine-update', [editingMedicineId, payload]);
    } else {
      // Create new medicine
      window.electron.ipcRenderer.once(
        'medicine-create-reply',
        (...args: unknown[]) => {
          setIsSubmitting(false);
          const response = args[0] as IpcResponse<{ id: number }>;

          if (!response?.success) {
            setFormError(response?.error ?? 'Failed to save medicine.');
            return;
          }

          setFormSuccess(`${payload.name} has been added.`);
          setFeedbackMessage(`${payload.name} saved to inventory.`);
          setNewMedicine(emptyMedicineForm);
          loadMedicines();
        }
      );
      window.electron.ipcRenderer.sendMessage('medicine-create', [payload]);
    }
  };

  const stats = useMemo(() => {
    const readyForSale = medicines.filter((medicine) => medicine.sellablePills > 0).length;
    const inactive = medicines.filter((medicine) => medicine.status !== 'active').length;
    const lowStockItems = medicines.filter(
      (medicine) =>
        medicine.totalAvailablePills > 0 && medicine.totalAvailablePills < medicine.pillQuantity
    ).length;
    const totalSellablePills = medicines.reduce(
      (sum, medicine) => sum + medicine.sellablePills,
      0
    );

    return {
      totalProducts: medicines.length,
      readyForSale,
      inactive,
      lowStockItems,
      expiringSoon: expiringAlerts.length,
      totalSellablePills,
    };
  }, [medicines, expiringAlerts.length]);

  const filteredMedicines = useMemo(() => {
    const normalizedTerm = searchTerm.trim().toLowerCase();
    return medicines.filter((medicine) => {
      const matchesSearch =
        normalizedTerm.length === 0 ||
        medicine.name.toLowerCase().includes(normalizedTerm) ||
        formatNumericId(medicine.id).toLowerCase().includes(normalizedTerm) ||
        medicine.barcode?.toLowerCase().includes(normalizedTerm);

      const matchesStatus =
        statusFilter === 'all' || medicine.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [medicines, searchTerm, statusFilter]);

  const handleStatusChange = useCallback(
    (medicineId: number, newStatus: MedicineStatus) => {
      setMedicines((prev) =>
        prev.map((medicine) =>
          medicine.id === medicineId ? { ...medicine, status: newStatus } : medicine
        )
      );

      if (!window?.electron) return;
      window.electron.ipcRenderer.once(
        'medicine-update-reply',
        (...args: unknown[]) => {
          const response = args[0] as IpcResponse<unknown>;
          if (!response?.success) {
            setFeedbackMessage('Unable to update status. Reloading latest data.');
            loadMedicines();
          }
        }
      );
      window.electron.ipcRenderer.sendMessage('medicine-update', [
        medicineId,
        { status: newStatus },
      ]);
    },
    [loadMedicines]
  );

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] w-full bg-gradient-to-br from-gray-50 via-gray-50 to-gray-100/50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800/80 overflow-hidden px-4">
      {feedbackMessage && (
        <div className="mb-2 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/30 px-4 py-3 text-sm text-green-800 dark:text-green-300 flex items-center justify-between gap-3">
          <span>{feedbackMessage}</span>
          <button
            type="button"
            className="text-green-700 dark:text-green-400 hover:text-green-900 dark:hover:text-green-200"
            onClick={() => setFeedbackMessage(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {expiringAlerts.length > 0 && (
        <div className="mb-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 px-4 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                {expiringAlerts.length} medicine{expiringAlerts.length > 1 ? 's' : ''} expiring in the next {alertThresholdDays} days
              </h3>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Restock or remove these batches before they expire.
              </p>
            </div>
          </div>
          <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
            {expiringAlerts.slice(0, 5).map((alert) => (
              <div
                key={alert.id}
                className="flex items-center justify-between rounded-md border border-amber-100 dark:border-amber-800 bg-white/80 dark:bg-gray-800/80 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
              >
                <div>
                  <p className="font-semibold">{alert.name}</p>
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    Barcode: {alert.barcode || '—'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">
                    {new Date(alert.nextExpiryDate).toLocaleDateString()}
                  </p>
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    {Math.max(alert.daysUntilExpiry, 0)} days • {alert.availablePills} pills
                  </p>
                </div>
              </div>
            ))}
            {expiringAlerts.length > 5 && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                +{expiringAlerts.length - 5} more medicines are nearing expiry.
              </p>
            )}
          </div>
        </div>
      )}

      {loadError && (
        <div className="mb-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-800 dark:text-red-300">
          {loadError}
        </div>
      )}


      {/* Compact Stats Header - Single Row Design matching Selling Panel */}
      <div className="bg-gradient-to-br from-white via-white to-gray-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-gray-800/90 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-3 mb-2 flex flex-wrap items-center gap-3">

        {/* Total Products */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
            Total Products
          </span>
          <input
            type="text"
            value={stats.totalProducts.toLocaleString()}
            readOnly
            className="w-20 px-2.5 py-1.5 bg-white dark:bg-gray-700/50 border border-blue-300 dark:border-blue-600/50 rounded-md text-xs text-blue-600 dark:text-blue-400 font-bold text-center shadow-sm"
          />
        </div>

        {/* Low Stock */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-yellow-50 dark:bg-yellow-900/20 px-2.5 py-1.5 rounded-md border border-yellow-200 dark:border-yellow-600/50 shadow-sm">
            <svg className="w-3.5 h-3.5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              Low Stock
            </span>
            <span className="text-xs font-bold text-yellow-600 dark:text-yellow-400 ml-1">
              {stats.lowStockItems}
            </span>
          </div>
        </div>

        {/* Expiring */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1.5 rounded-md border border-amber-200 dark:border-amber-600/50 shadow-sm">
            <svg className="w-3.5 h-3.5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              Expiring (≤{alertThresholdDays}d)
            </span>
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400 ml-1">
              {stats.expiringSoon.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Ready for Sale */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
            Ready for Sale
          </span>
          <input
            type="text"
            value={stats.readyForSale.toLocaleString()}
            readOnly
            className="w-20 px-2.5 py-1.5 bg-white dark:bg-gray-700/50 border border-green-300 dark:border-green-600/50 rounded-md text-xs text-green-600 dark:text-green-400 font-bold text-center shadow-sm"
          />
        </div>

        {/* Sellable Pills */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
            Sellable Pills
          </span>
          <input
            type="text"
            value={stats.totalSellablePills.toLocaleString()}
            readOnly
            className="w-28 px-2.5 py-1.5 bg-white dark:bg-gray-700/50 border border-indigo-300 dark:border-indigo-600/50 rounded-md text-xs text-indigo-600 dark:text-indigo-400 font-bold text-center shadow-sm"
          />
        </div>

        {/* Inactive */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
            Inactive
          </span>
          <input
            type="text"
            value={stats.inactive.toLocaleString()}
            readOnly
            className="w-20 px-2.5 py-1.5 bg-white dark:bg-gray-700/50 border border-orange-300 dark:border-orange-600/50 rounded-md text-xs text-orange-600 dark:text-orange-400 font-bold text-center shadow-sm"
          />
        </div>

        {/* Refresh Button */}
        <button
          onClick={() => loadMedicines()}
          className="ml-auto px-3 py-1.5 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-xs font-semibold rounded-md transition-colors uppercase tracking-wide flex items-center gap-1.5 shadow-sm"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Refresh
        </button>

      </div>

      {/* Main Content: Vertical Layout */}
      <div className="flex flex-col gap-3 flex-1 overflow-hidden min-h-0">
        {/* Top: Medicine Form (Horizontal) */}
        <div className="flex-shrink-0">
          <div className="bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md">
            {/* Form Header */}
            <div className="px-4 py-2 bg-gradient-to-r from-green-50 to-green-100/50 dark:from-blue-900/20 dark:to-blue-800/10 border-b border-blue-200/50 dark:border-blue-800/30">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600">

                  <FiPlus className="w-4 h-4 text-white" />
                </div>

                <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wide">
                  {editingMedicineId ? 'Edit Medicine' : 'Add Medicine'}
                </h3>
              </div>
            </div>

            {/* Form Content */}
            <form onSubmit={handleAddMedicine} className="p-3">

              {/* Success & Error */}
              {formError && (
                <div className="mb-2 p-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs rounded border border-red-200 dark:border-red-800">
                  {formError}
                </div>
              )}
              {formSuccess && (
                <div className="mb-2 p-2 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-xs rounded border border-green-200 dark:border-green-800">
                  {formSuccess}
                </div>
              )}

              {/* ---------------- ROW 1 ---------------- */}
              <div className="flex flex-col lg:flex-row gap-3 items-end mb-3">
                {/* Medicine Name */}
                <div className="flex-1 w-full">
                  <label className="block text-[10px] font-bold mb-1 uppercase tracking-wide">
                    Medicine Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newMedicine.name}
                    onChange={(e) => handleNewMedicineChange('name', e.target.value)}
                    placeholder="Enter medicine name"
                    className="w-full px-3 py-1.5 text-xs bg-white dark:bg-gray-700 
        border border-gray-300 dark:border-gray-600 rounded focus:ring-2 
        focus:ring-green-500 focus:border-green-500 outline-none"
                  />
                </div>

                {/* Pills/Packet */}
                <div className="w-full lg:w-32">
                  <label className="block text-[10px] font-bold mb-1 uppercase tracking-wide">
                    Pills/Packet
                  </label>
                  <input
                    type="number"
                    value={newMedicine.pillQuantity}
                    onChange={(e) => handleNewMedicineChange('pillQuantity', e.target.value)}
                    placeholder="e.g. 10"
                    className="w-full px-3 py-1.5 text-xs bg-white dark:bg-gray-700 
        border border-gray-300 dark:border-gray-600 rounded focus:ring-2 
        focus:ring-green-500 focus:border-green-500 outline-none"
                  />
                </div>

                {/* Barcode */}
                <div className="w-full lg:w-48">
                  <label className="block text-[10px] font-bold mb-1 uppercase tracking-wide">
                    Barcode
                  </label>
                  <input
                    type="text"
                    value={newMedicine.barcode}
                    onChange={(e) => handleNewMedicineChange('barcode', e.target.value)}
                    placeholder="Scan or enter"
                    className="w-full px-3 py-1.5 text-xs bg-white dark:bg-gray-700 
        border border-gray-300 dark:border-gray-600 rounded focus:ring-2 
        focus:ring-green-500 focus:border-green-500 outline-none"
                  />
                </div>
              </div>

              {/* ---------------- ROW 2 ---------------- */}
              <div className="flex w-full items-end justify-between gap-2">

                {/* Status (Left side) */}
                <div className="w-full lg:w-32">
                  <label className="block text-[10px] font-bold mb-1 uppercase tracking-wide">
                    Status
                  </label>
                  <select
                    value={newMedicine.status}
                    onChange={(e) => handleNewMedicineChange('status', e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-white dark:bg-gray-700 
      border border-gray-300 dark:border-gray-600 rounded focus:ring-2 
      focus:ring-green-500 focus:border-green-500 outline-none"
                  >
                    {STATUS_LIBRARY.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>

                {/* Buttons (Right side) */}
                <div className="flex gap-2">

                  <button
                    type="button"
                    onClick={() => {
                      setNewMedicine(emptyMedicineForm);
                      setEditingMedicineId(null);
                    }}
                    className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 
      rounded hover:bg-gray-200 dark:hover:bg-gray-600 font-semibold text-xs uppercase tracking-wide"
                  >
                    Clear
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex items-center justify-center gap-2 px-4 py-1.5 bg-gradient-to-r 
      from-green-600 to-green-500 text-white rounded hover:from-green-700 hover:to-green-600 
      shadow-sm hover:shadow-md font-semibold text-xs uppercase tracking-wide disabled:opacity-50"
                  >
                    <span>{editingMedicineId ? '✎' : '✓'}</span>
                    {editingMedicineId ? 'Update' : 'Save'}
                  </button>

                </div>

              </div>


            </form>

          </div>
        </div>

        {/* Bottom: Medicines Table */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          <div className="bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md flex-1 flex flex-col overflow-hidden">
            {/* Search Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-green-50 to-green-100/50 dark:from-green-900/20 dark:to-green-800/10 border-b border-blue-200/50 dark:border-blue-800/30 flex-shrink-0">
              <div className="flex items-center gap-2">
                <label htmlFor="medicine-search" className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">
                  Search Medicines
                </label>
                <div className="flex-1 relative">
                  <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  </div>
                  <input
                    id="medicine-search"
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by name or barcode..."
                    className="w-full pl-10 pr-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-600 dark:bg-gray-700/50 dark:text-white rounded-md focus:ring-2 focus:ring-green-500/30 focus:border-green-500 outline-none transition-all bg-white"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'all' | MedicineStatus)}
                  className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500"
                >
                  <option value="all">All Statuses</option>
                  {STATUS_LIBRARY.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Medicines Table */}
            <div className="flex-1 overflow-y-auto">
              {isLoading && (
                <div className="px-4 lg:px-6 py-6 text-sm text-gray-500 dark:text-gray-400">Loading medicines...</div>
              )}
              {!isLoading && filteredMedicines.length === 0 && (
                <div className="px-4 lg:px-6 py-6 text-sm text-gray-500 dark:text-gray-400">No medicines found.</div>
              )}
              {!isLoading && filteredMedicines.map((medicine) => (
                <div key={medicine.id} className="grid grid-cols-12 gap-3 px-3 py-2 border-b border-gray-100 dark:border-gray-700 text-[10px] items-center hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <div className="col-span-2 font-semibold text-gray-900 dark:text-white">
                    {medicine.barcode ?? '—'}
                    <div className="text-[11px] text-gray-500 dark:text-gray-400">{formatNumericId(medicine.id)}</div>
                  </div>
                  <div className="col-span-3">
                    <div className="font-medium text-gray-900 dark:text-white">{medicine.name}</div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400">
                      Avg. Pill Cost: {medicine.averageSellablePricePerPill ? `${getCurrencySymbol()}${medicine.averageSellablePricePerPill.toFixed(2)}` : '—'}
                    </div>
                  </div>
                  <div className="col-span-2 text-center">
                    <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold">
                      {medicine.pillQuantity}
                    </span>
                  </div>
                  <div className="col-span-2 text-center">
                    <div className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{medicine.sellablePills.toLocaleString()}</div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400">Total: {medicine.totalAvailablePills.toLocaleString()}</div>
                  </div>
                  <div className="col-span-1 text-center">
                    <select
                      value={medicine.status}
                      onChange={(e) => handleStatusChange(medicine.id, e.target.value as MedicineStatus)}
                      className={`w-full px-2 py-1 rounded-full text-xs font-medium border border-transparent focus:ring-2 focus:ring-blue-500 cursor-pointer ${medicine.status === 'active' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300' :
                        medicine.status === 'inactive' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300' :
                          'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                        }`}
                    >
                      {STATUS_LIBRARY.map((status) => (
                        <option key={`${medicine.id}-${status}`} value={status}>{status}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2 text-center flex justify-center gap-1">
                    <button
                      onClick={() => {
                        setNewMedicine({
                          name: medicine.name,
                          pillQuantity: medicine.pillQuantity.toString(),
                          barcode: medicine.barcode || '',
                          status: medicine.status,
                        });
                        setEditingMedicineId(medicine.id);
                        // Focus on form input?
                      }}
                      className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                      title="Edit Medicine"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Are you sure you want to delete "${medicine.name}"? This action cannot be undone.`)) {
                          window.electron.ipcRenderer.once('medicine-delete-reply', (response: any) => {
                            if (response.success) {
                              loadMedicines();
                              setFeedbackMessage('Medicine deleted successfully!');
                              setTimeout(() => setFeedbackMessage(null), 3000);
                            } else {
                              setFeedbackMessage('Error deleting medicine: ' + (response.error || 'Unknown error'));
                              setTimeout(() => setFeedbackMessage(null), 3000);
                            }
                          });
                          window.electron.ipcRenderer.sendMessage('medicine-delete', [medicine.id]);
                        }
                      }}
                      className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                      title="Delete Medicine"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
