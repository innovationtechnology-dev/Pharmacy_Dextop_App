import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  FiRefreshCw,
} from 'react-icons/fi';
import { PharmacySettings, getStoredPharmacySettings } from '../../types/pharmacy';
import { currencySymbols, getCurrencySymbol as getSymbol } from '../../../common/currency';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';


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
  const [editingMedicine, setEditingMedicine] = useState<Medicine | null>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [pharmacySettings] = useState<PharmacySettings>(() => getStoredPharmacySettings());
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; name: string } | null>(null);

  // Get currency symbol
  const getCurrencySymbol = () => getSymbol(pharmacySettings.currency || 'USD');
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
    // Focus barcode input on mount
    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 100);
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
            setTimeout(() => setFormError(null), 3000);
            return;
          }

          setFormSuccess(`${payload.name} has been updated.`);
          setTimeout(() => setFormSuccess(null), 3000);
          setFeedbackMessage(`${payload.name} updated successfully.`);
          setTimeout(() => setFeedbackMessage(null), 3000);
          setNewMedicine(emptyMedicineForm);
          setEditingMedicineId(null);
          loadMedicines();
          barcodeInputRef.current?.focus();
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
            setTimeout(() => setFormError(null), 3000);
            return;
          }

          setFormSuccess(`${payload.name} has been added.`);
          setTimeout(() => setFormSuccess(null), 3000);
          setFeedbackMessage(`${payload.name} saved to inventory.`);
          setTimeout(() => setFeedbackMessage(null), 3000);
          setNewMedicine(emptyMedicineForm);
          loadMedicines();
          barcodeInputRef.current?.focus();
        }
      );
      window.electron.ipcRenderer.sendMessage('medicine-create', [payload]);
    }
  };

  const stats = useMemo(() => {
    const active = medicines.filter((medicine) => medicine.status === 'active').length;
    const inactive = medicines.filter((medicine) => medicine.status === 'inactive').length;
    const discontinued = medicines.filter((medicine) => medicine.status === 'discontinued').length;
    const expiringSoon = expiringAlerts.length;

    return {
      totalProducts: medicines.length,
      active,
      inactive,
      discontinued,
      expiringSoon,
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
    setEditingMedicine(medicine);
  }, []);

  const resetForm = useCallback(() => {
    setNewMedicine(emptyMedicineForm);
    setEditingMedicineId(null);
    setEditingMedicine(null);
    setFormError(null);
    setFormSuccess(null);
    barcodeInputRef.current?.focus();
  }, []);

  // Check if editing medicine has been used in transactions
  const isEditingMedicineUsed = useMemo(() => {
    if (!editingMedicine) return false;
    return editingMedicine.totalAvailablePills > 0 || editingMedicine.sellablePills > 0;
  }, [editingMedicine]);

  const handleDelete = async (medicineId: number, medicineName: string) => {
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
    () => null,
    []
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
    <div className="flex flex-col h-auto md:h-[calc(100vh-80px)] w-full bg-gradient-to-br from-gray-50 via-gray-50 to-gray-100/50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800/80 overflow-visible md:overflow-hidden px-4 pb-4 md:pb-0">
      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => {
          if (deleteConfirm) {
            handleDelete(deleteConfirm.id, deleteConfirm.name);
          }
        }}
        title="Delete Medicine"
        message={`Are you sure you want to delete "${deleteConfirm?.name}"? This action cannot be undone and will remove all associated data.`}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />

      {/* Success/Feedback Message */}
      {feedbackMessage && (
        <div className="fixed top-4 right-4 z-50 animate-slideInRight">
          <div className="bg-green-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 min-w-[300px]">
            <FiCheckCircle className="w-5 h-5 flex-shrink-0" />
            <span className="font-medium flex-1">{feedbackMessage}</span>
            <button
              type="button"
              onClick={() => setFeedbackMessage(null)}
              className="p-1 hover:bg-green-600 rounded transition-colors"
            >
              <FiX className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Stats Header - Matching Sales Report Design */}
      <div className="bg-gradient-to-br from-white via-white to-gray-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-gray-800/90 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-3 mb-2 flex flex-wrap items-center gap-3">
        {/* Total Products */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1.5 rounded-md border border-blue-200 dark:border-blue-600/50 shadow-sm">
            <FiPackage className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              Total Products
            </span>
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 ml-1">
              {stats.totalProducts}
            </span>
          </div>
        </div>

        {/* Active */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1.5 rounded-md border border-emerald-200 dark:border-emerald-600/50 shadow-sm">
            <FiCheckCircle className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              Active
            </span>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 ml-1">
              {stats.active}
            </span>
          </div>
        </div>

        {/* Expiring Soon */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-orange-50 dark:bg-orange-900/20 px-2.5 py-1.5 rounded-md border border-orange-200 dark:border-orange-600/50 shadow-sm">
            <FiAlertCircle className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              Expiring Soon
            </span>
            <span className="text-xs font-bold text-orange-600 dark:text-orange-400 ml-1">
              {stats.expiringSoon}
            </span>
          </div>
        </div>

        {/* Discontinued */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-900/20 px-2.5 py-1.5 rounded-md border border-red-200 dark:border-red-600/50 shadow-sm">
            <FiX className="w-3.5 h-3.5 text-red-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              Discontinued
            </span>
            <span className="text-xs font-bold text-red-600 dark:text-red-400 ml-1">
              {stats.discontinued}
            </span>
          </div>
        </div>

        <button
          onClick={loadMedicines}
          className="ml-auto px-3 py-1.5 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-xs font-semibold rounded-md transition-colors uppercase tracking-wide flex items-center gap-1.5 shadow-sm"
        >
          <FiRefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>
      {/* Main Content: Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 flex-1 overflow-hidden min-h-0">
        {/* Left Side: Medicine Form */}
        <div className="lg:col-span-1 flex flex-col overflow-visible md:overflow-hidden min-h-0">
          <div className="bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md flex-1 flex flex-col overflow-visible md:overflow-hidden">
            {/* Form Header */}
            <div className="px-4 py-2 bg-gradient-to-r from-green-50 to-green-100/50 dark:from-blue-900/20 dark:to-blue-800/10 border-b border-blue-200/50 dark:border-blue-800/30">
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
              {/* Warning for editing used medicine */}
              {isEditingMedicineUsed && (
                <div className="p-3 bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-xs rounded border border-orange-200 dark:border-orange-800 flex items-start gap-2">
                  <FiAlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold mb-1">Limited Editing</div>
                    <div>This medicine has been used in transactions. You can only change its status. Name, barcode, and pills/packet are read-only to preserve data integrity.</div>
                  </div>
                </div>
              )}
              
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
                  htmlFor="medicine-barcode"
                  className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide"
                >
                  Barcode <span className="text-red-500">*</span>
                  {isEditingMedicineUsed && (
                    <span className="ml-2 text-[10px] text-orange-600 dark:text-orange-400 font-normal">(Read-only)</span>
                  )}
                </label>
                <input
                  id="medicine-barcode"
                  type="text"
                  ref={barcodeInputRef}
                  value={newMedicine.barcode}
                  onChange={(e) => handleNewMedicineChange('barcode', e.target.value)}
                  disabled={isEditingMedicineUsed}
                  className={`w-full px-4 py-3 text-sm border rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all ${
                    isEditingMedicineUsed
                      ? 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                      : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600'
                  }`}
                  placeholder="Scan or enter"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="medicine-name"
                    className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide"
                  >
                    Medicine Name <span className="text-red-500">*</span>
                    {isEditingMedicineUsed && (
                      <span className="ml-2 text-[10px] text-orange-600 dark:text-orange-400 font-normal">(Read-only - used in transactions)</span>
                    )}
                  </label>
                  <input
                    id="medicine-name"
                    type="text"
                    value={newMedicine.name}
                    onChange={(e) => handleNewMedicineChange('name', e.target.value)}
                    disabled={isEditingMedicineUsed}
                    className={`w-full px-4 py-3 text-sm border rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all ${
                      isEditingMedicineUsed
                        ? 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                        : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600'
                    }`}
                    required
                    placeholder="Enter medicine name"
                  />
                </div>
                <div>
                  <label
                    htmlFor="medicine-pill-quantity"
                    className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide"
                  >
                    Pills/Packet <span className="text-red-500">*</span>
                    {isEditingMedicineUsed && (
                      <span className="ml-2 text-[10px] text-orange-600 dark:text-orange-400 font-normal">(Read-only)</span>
                    )}
                  </label>
                  <input
                    id="medicine-pill-quantity"
                    type="number"
                    value={newMedicine.pillQuantity}
                    onChange={(e) => handleNewMedicineChange('pillQuantity', e.target.value)}
                    disabled={isEditingMedicineUsed}
                    className={`w-full px-4 py-3 text-sm border rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all ${
                      isEditingMedicineUsed
                        ? 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                        : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600'
                    }`}
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
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-200 shadow-sm hover:shadow-md font-semibold text-sm"
                >
                  <FiRefreshCw className="w-4 h-4" />
                  {editingMedicineId ? 'Cancel' : 'Clear'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-[2] flex items-center justify-center gap-2 px-4 py-4 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white rounded-md hover:from-emerald-700 hover:to-emerald-600 transition-all duration-200 shadow-sm hover:shadow-md font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="lg:col-span-2 flex flex-col overflow-visible md:overflow-hidden min-h-0">
          <div className="bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md flex-1 flex flex-col overflow-visible md:overflow-hidden">
            {/* Search Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-green-50 to-green-100/50 dark:from-green-900/20 dark:to-green-800/10 border-b border-blue-200/50 dark:border-blue-800/30 flex-shrink-0">
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
                    <div className="col-span-3">Medicine</div>
                    <div className="col-span-2">Barcode</div>
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
                      <div className="col-span-3">
                        <div className="font-semibold text-gray-900 dark:text-white truncate text-[11px]">
                          {medicine.name}
                        </div>
                        <div className="text-[10px] text-gray-500 dark:text-gray-500 truncate">
                          Avg: {medicine.averageSellablePricePerPill ? `${getCurrencySymbol()}${medicine.averageSellablePricePerPill.toFixed(2)}` : '—'}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-[11px] text-gray-900 dark:text-white truncate font-semibold">
                          {medicine.barcode || '—'}
                        </div>
                        <div className="text-[10px] text-gray-500 dark:text-gray-500 truncate">
                          {formatNumericId(medicine.id)}
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
                            // Check if medicine has any stock (has been purchased)
                            if (medicine.totalAvailablePills > 0 || medicine.sellablePills > 0) {
                              alert('Cannot edit medicine with existing stock. This medicine has been used in transactions. You can only change its status (active/inactive).');
                              return;
                            }
                            handleEdit(medicine);
                          }}
                          disabled={medicine.totalAvailablePills > 0 || medicine.sellablePills > 0}
                          className={`p-1.5 rounded transition-colors ${
                            medicine.totalAvailablePills > 0 || medicine.sellablePills > 0
                              ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-50'
                              : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30'
                          }`}
                          title={
                            medicine.totalAvailablePills > 0 || medicine.sellablePills > 0
                              ? 'Cannot edit: Medicine has been used in transactions (you can only change status)'
                              : 'Edit'
                          }
                        >
                          <FiEdit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (medicine.id) {
                              // Check if medicine has any stock (has been purchased)
                              if (medicine.totalAvailablePills > 0 || medicine.sellablePills > 0) {
                                alert('Cannot delete medicine with existing stock. This medicine has been used in transactions. You can mark it as inactive instead.');
                                return;
                              }
                              setDeleteConfirm({ id: medicine.id, name: medicine.name });
                            }
                          }}
                          disabled={medicine.totalAvailablePills > 0 || medicine.sellablePills > 0}
                          className={`p-1.5 rounded transition-colors ${
                            medicine.totalAvailablePills > 0 || medicine.sellablePills > 0
                              ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-50'
                              : 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30'
                          }`}
                          title={
                            medicine.totalAvailablePills > 0 || medicine.sellablePills > 0
                              ? 'Cannot delete: Medicine has been used in transactions'
                              : 'Delete'
                          }
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
