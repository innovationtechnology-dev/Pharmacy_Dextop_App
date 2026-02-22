import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useDashboardHeader } from './useDashboardHeader';
import {
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiX,
  FiSave,
  FiPackage,
  FiTrendingUp,
  FiAlertCircle,
  FiCheckCircle,
  FiClock,
} from 'react-icons/fi';
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

  const handleEdit = useCallback((medicine: Medicine) => {
    setNewMedicine({
      name: medicine.name,
      pillQuantity: medicine.pillQuantity.toString(),
      barcode: medicine.barcode || '',
      status: medicine.status,
    });
    setEditingMedicineId(medicine.id);
  }, []);

  const resetForm = useCallback(() => {
    setNewMedicine(emptyMedicineForm);
    setEditingMedicineId(null);
    setFormError(null);
    setFormSuccess(null);
  }, []);

  const handleDelete = async (medicineId: number, medicineName: string) => {
    if (!window.confirm(`Are you sure you want to delete "${medicineName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      window.electron.ipcRenderer.once('medicine-delete-reply', (response: any) => {
        if (response.success) {
          loadMedicines();
          if (editingMedicineId === medicineId) {
            resetForm();
          }
          setFeedbackMessage('Medicine deleted successfully!');
          setTimeout(() => setFeedbackMessage(null), 3000);
        } else {
          setFeedbackMessage('Error deleting medicine: ' + (response.error || 'Unknown error'));
          setTimeout(() => setFeedbackMessage(null), 3000);
        }
      });
      window.electron.ipcRenderer.sendMessage('medicine-delete', [medicineId]);
    } catch (error) {
      console.error('Error deleting medicine:', error);
      setFeedbackMessage('Error deleting medicine. Please try again.');
      setTimeout(() => setFeedbackMessage(null), 3000);
    }
  };

  const { setHeader } = useDashboardHeader();

  const headerActions = useMemo(
    () => (
      <button
        type="button"
        onClick={resetForm}
        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-600 dark:from-emerald-500 dark:via-emerald-600 dark:to-emerald-500 text-white rounded-lg hover:from-emerald-700 hover:via-emerald-600 hover:to-emerald-700 dark:hover:from-emerald-600 dark:hover:via-emerald-700 dark:hover:to-emerald-600 transition-all duration-200 shadow-md hover:shadow-lg"
      >
        <FiPlus className="w-5 h-5" />
        <span className="hidden sm:inline">New Medicine</span>
      </button>
    ),
    [resetForm]
  );

  useEffect(() => {
    setHeader({
      title: 'Medicine Management',
      subtitle: 'Manage your medicine inventory and stock levels',
      actions: headerActions,
    });
    return () => setHeader(null);
  }, [setHeader, headerActions]);

  return (
    <div className="h-[calc(100vh-80px)] w-full bg-gradient-to-br from-gray-50 via-gray-50 to-gray-100/50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800/80 overflow-hidden flex flex-col p-2">
      {/* Success/Feedback Message */}
      {feedbackMessage && (
        <div className="fixed top-4 right-4 z-50 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm">
          <FiCheckCircle className="w-4 h-4" />
          <span className="font-medium">{feedbackMessage}</span>
        </div>
      )}

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3 flex-shrink-0">
        <div className="bg-gradient-to-br from-white to-emerald-50/50 dark:from-gray-800 dark:to-emerald-900/20 rounded-lg shadow-sm border border-emerald-100/50 dark:border-emerald-800/30 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-md">
              <FiPackage className="w-4 h-4 text-white" />
            </div>
            <FiTrendingUp className="w-4 h-4 text-emerald-400 dark:text-emerald-500" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-0.5">
            {stats.totalProducts}
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">Total Products</p>
        </div>

        <div className="bg-gradient-to-br from-white to-green-50/50 dark:from-gray-800 dark:to-green-900/20 rounded-lg shadow-sm border border-green-100/50 dark:border-green-800/30 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-green-500 to-green-600 shadow-md">
              <FiCheckCircle className="w-4 h-4 text-white" />
            </div>
            <FiCheckCircle className="w-4 h-4 text-green-400 dark:text-green-500" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-0.5">
            {stats.readyForSale}
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">Ready for Sale</p>
        </div>

        <div className="bg-gradient-to-br from-white to-yellow-50/50 dark:from-gray-800 dark:to-yellow-900/20 rounded-lg shadow-sm border border-yellow-100/50 dark:border-yellow-800/30 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-yellow-500 to-yellow-600 shadow-md">
              <FiAlertCircle className="w-4 h-4 text-white" />
            </div>
            <FiAlertCircle className="w-4 h-4 text-yellow-400 dark:text-yellow-500" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-0.5">
            {stats.lowStockItems}
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">Low Stock</p>
        </div>

        <div className="bg-gradient-to-br from-white to-amber-50/50 dark:from-gray-800 dark:to-amber-900/20 rounded-lg shadow-sm border border-amber-100/50 dark:border-amber-800/30 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 shadow-md">
              <FiClock className="w-4 h-4 text-white" />
            </div>
            <FiClock className="w-4 h-4 text-amber-400 dark:text-amber-500" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-0.5">
            {stats.expiringSoon}
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">Expiring (≤{alertThresholdDays}d)</p>
        </div>
      </div>
      {/* Main Content: Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 flex-1 overflow-hidden min-h-0">
        {/* Left Side: Medicine Form */}
        <div className="lg:col-span-1 flex flex-col overflow-hidden min-h-0">
          <div className="bg-gradient-to-br from-white via-white to-emerald-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-emerald-900/10 rounded-lg border border-emerald-200/50 dark:border-emerald-800/30 shadow-md flex-1 flex flex-col overflow-hidden">
            {/* Form Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-emerald-50 to-emerald-100/50 dark:from-emerald-900/20 dark:to-emerald-800/10 border-b border-emerald-200/50 dark:border-emerald-800/30 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600">
                    {editingMedicineId ? (
                      <FiEdit2 className="w-4 h-4 text-white" />
                    ) : (
                      <FiPlus className="w-4 h-4 text-white" />
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wide">
                    {editingMedicineId ? 'Edit Medicine' : 'New Medicine'}
                  </h3>
                </div>
                {editingMedicineId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="p-1.5 hover:bg-white/50 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    title="Clear Form"
                  >
                    <FiX className="w-3.5 h-3.5 text-gray-600 dark:text-gray-400" />
                  </button>
                )}
              </div>
            </div>

            {/* Form Content */}
            <form onSubmit={handleAddMedicine} className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Success & Error */}
              {formError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm rounded border border-red-200 dark:border-red-800">
                  {formError}
                </div>
              )}
              {formSuccess && (
                <div className="p-3 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-sm rounded border border-green-200 dark:border-green-800">
                  {formSuccess}
                </div>
              )}

              <div>
                <label
                  htmlFor="medicine-name"
                  className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide"
                >
                  Medicine Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="medicine-name"
                  type="text"
                  value={newMedicine.name}
                  onChange={(e) => handleNewMedicineChange('name', e.target.value)}
                  className="w-full px-4 py-3 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                  required
                  placeholder="Enter medicine name"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="medicine-barcode"
                    className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide"
                  >
                    Barcode <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="medicine-barcode"
                    type="text"
                    value={newMedicine.barcode}
                    onChange={(e) => handleNewMedicineChange('barcode', e.target.value)}
                    className="w-full px-4 py-3 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    placeholder="Scan or enter"
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="medicine-pill-quantity"
                    className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide"
                  >
                    Pills/Packet <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="medicine-pill-quantity"
                    type="number"
                    value={newMedicine.pillQuantity}
                    onChange={(e) => handleNewMedicineChange('pillQuantity', e.target.value)}
                    className="w-full px-4 py-3 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    placeholder="e.g. 10"
                    required
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="medicine-status"
                  className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide"
                >
                  Status
                </label>
                <select
                  id="medicine-status"
                  value={newMedicine.status}
                  onChange={(e) => handleNewMedicineChange('status', e.target.value)}
                  className="w-full px-4 py-3 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                >
                  {STATUS_LIBRARY.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                {editingMedicineId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-4 bg-gradient-to-r from-red-600 to-red-500 text-white rounded-md hover:from-red-700 hover:to-red-600 transition-all duration-200 shadow-sm hover:shadow-md font-semibold text-sm"
                  >
                    <FiX className="w-4 h-4" />
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-4 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white rounded-md hover:from-emerald-700 hover:to-emerald-600 transition-all duration-200 shadow-sm hover:shadow-md font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FiSave className="w-4 h-4" />
                  {isSubmitting
                    ? 'Saving...'
                    : editingMedicineId
                      ? 'Update Medicine'
                      : 'Save Medicine'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Side: Medicines List */}
        <div className="lg:col-span-2 flex flex-col overflow-hidden min-h-0">
          <div className="bg-gradient-to-br from-white via-white to-emerald-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-emerald-900/10 rounded-lg border border-emerald-200/50 dark:border-emerald-800/30 shadow-md flex-1 flex flex-col overflow-hidden">
            {/* Search Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-emerald-50 to-emerald-100/50 dark:from-emerald-900/20 dark:to-emerald-800/10 border-b border-emerald-200/50 dark:border-emerald-800/30 flex-shrink-0">
              <div className="flex items-center gap-2">
                <label
                  htmlFor="medicine-search"
                  className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap"
                >
                  Search Medicines
                </label>
                <div className="flex-1 relative">
                  <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-3.5 h-3.5 z-10" />
                  <input
                    id="medicine-search"
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by name, barcode, or ID..."
                    className="w-full pl-10 pr-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-600 dark:bg-gray-700/50 dark:text-white rounded-md focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none transition-all bg-white"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                    >
                      <FiX className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                    </button>
                  )}
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'all' | MedicineStatus)}
                  className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                >
                  <option value="all">All Statuses</option>
                  {STATUS_LIBRARY.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Medicines Table */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Loading medicines...
                    </p>
                  </div>
                </div>
              ) : loadError ? (
                <div className="p-12 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-red-100 to-red-200 dark:from-red-900/50 dark:to-red-800/50 mb-4">
                    <FiAlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
                    Error Loading Medicines
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    {loadError}
                  </p>
                  <button
                    onClick={loadMedicines}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors text-sm"
                  >
                    Try Again
                  </button>
                </div>
              ) : filteredMedicines.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-200 dark:from-emerald-900/50 dark:to-emerald-800/50 mb-4">
                    <FiPackage className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
                    {searchTerm ? 'No medicines found' : 'No medicines yet'}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    {searchTerm
                      ? 'Try adjusting your search terms'
                      : 'Get started by adding your first medicine'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {/* Table Header */}
                  <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-gradient-to-r from-gray-50/80 to-gray-100/50 dark:from-gray-700/40 dark:to-gray-700/20 border-b-2 border-gray-200/60 dark:border-gray-600/60 text-[10px] font-bold text-gray-700 dark:text-gray-300 sticky top-0 uppercase tracking-wider z-10">
                    <div className="col-span-1">#</div>
                    <div className="col-span-2">Barcode</div>
                    <div className="col-span-3">Medicine</div>
                    <div className="col-span-1 text-center">Pills/Pack</div>
                    <div className="col-span-2 text-center">Stock</div>
                    <div className="col-span-2 text-center">Status</div>
                    <div className="col-span-1 text-center">Actions</div>
                  </div>

                  {/* Medicines Rows */}
                  {filteredMedicines.map((medicine, index) => (
                    <div
                      key={medicine.id}
                      onClick={() => handleEdit(medicine)}
                      className={`grid grid-cols-12 gap-2 px-4 py-3 cursor-pointer transition-all items-center text-xs border-b border-gray-100/50 dark:border-gray-700/30 ${editingMedicineId === medicine.id
                        ? 'bg-gradient-to-r from-emerald-50/50 to-transparent dark:from-emerald-900/20 dark:to-transparent ring-2 ring-emerald-500/30'
                        : 'hover:bg-gradient-to-r hover:from-emerald-50/30 hover:to-transparent dark:hover:from-emerald-900/10 dark:hover:to-transparent'
                        }`}
                    >
                      <div className="col-span-1 text-gray-600 dark:text-gray-400 text-[11px] font-medium">
                        {index + 1}
                      </div>
                      <div className="col-span-2">
                        <div className="text-[11px] text-gray-900 dark:text-white truncate font-semibold">
                          {medicine.barcode || '—'}
                        </div>
                        <div className="text-[10px] text-gray-500 dark:text-gray-500 truncate">
                          {formatNumericId(medicine.id)}
                        </div>
                      </div>
                      <div className="col-span-3">
                        <div className="font-semibold text-gray-900 dark:text-white truncate text-[11px]">
                          {medicine.name}
                        </div>
                        <div className="text-[10px] text-gray-500 dark:text-gray-500 truncate">
                          Avg: {medicine.averageSellablePricePerPill ? `${getCurrencySymbol()}${medicine.averageSellablePricePerPill.toFixed(2)}` : '—'}
                        </div>
                      </div>
                      <div className="col-span-1 text-center">
                        <span className="inline-flex items-center justify-center px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-[11px]">
                          {medicine.pillQuantity}
                        </span>
                      </div>
                      <div className="col-span-2 text-center">
                        <div className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                          {medicine.sellablePills.toLocaleString()}
                        </div>
                        <div className="text-[10px] text-gray-500 dark:text-gray-500">
                          Total: {medicine.totalAvailablePills.toLocaleString()}
                        </div>
                      </div>
                      <div className="col-span-2 text-center">
                        <select
                          value={medicine.status}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleStatusChange(medicine.id, e.target.value as MedicineStatus);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className={`w-full px-2 py-1 rounded-full text-xs font-medium border border-transparent focus:ring-2 focus:ring-emerald-500 cursor-pointer ${medicine.status === 'active' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300' :
                            medicine.status === 'inactive' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300' :
                              'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                            }`}
                        >
                          {STATUS_LIBRARY.map((status) => (
                            <option key={`${medicine.id}-${status}`} value={status}>{status}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-1 flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(medicine);
                          }}
                          className="p-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded transition-colors"
                          title="Edit"
                        >
                          <FiEdit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (medicine.id) {
                              handleDelete(medicine.id, medicine.name);
                            }
                          }}
                          className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                          title="Delete"
                        >
                          <FiTrash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
