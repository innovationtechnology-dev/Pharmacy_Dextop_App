'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiX,
  FiSave,
  FiBriefcase,
  FiMail,
  FiPhone,
  FiMapPin,
  FiUser,
  FiFileText,
  FiCheck,
  FiTrendingUp,
  FiUsers,
  FiCheckCircle,
  FiAlertCircle,
  FiRefreshCw,
} from 'react-icons/fi';
import { useDashboardHeader } from './useDashboardHeader';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';

interface Supplier {
  id?: number;
  name: string;
  companyName?: string;
  email?: string;
  phone?: string;
  address?: string;
  contactPerson?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

const Suppliers: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState<Supplier>({
    name: '',
    companyName: '',
    email: '',
    phone: '',
    address: '',
    contactPerson: '',
    notes: '',
  });
  const [showSuccess, setShowSuccess] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; name: string } | null>(null);

  const { setHeader } = useDashboardHeader();

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      window.electron.ipcRenderer.once('supplier-get-all-reply', (response: any) => {
        setLoading(false);
        if (response.success) {
          setSuppliers(response.data || []);
        } else {
          console.error('Error loading suppliers:', response.error);
        }
      });
      window.electron.ipcRenderer.sendMessage('supplier-get-all', []);
    } catch (error) {
      console.error('Error loading suppliers:', error);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  const resetForm = useCallback(() => {
    setFormData({
      name: '',
      companyName: '',
      email: '',
      phone: '',
      address: '',
      contactPerson: '',
      notes: '',
    });
    setEditingSupplier(null);
  }, []);

  const handleEdit = useCallback((supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      companyName: supplier.companyName || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      address: supplier.address || '',
      contactPerson: supplier.contactPerson || '',
      notes: supplier.notes || '',
    });
  }, []);

  const handleDelete = async (id: number) => {
    try {
      window.electron.ipcRenderer.once('supplier-delete-reply', (response: any) => {
        if (response.success) {
          loadSuppliers();
          if (editingSupplier?.id === id) {
            resetForm();
          }
        } else {
          alert('Error deleting supplier: ' + (response.error || 'Unknown error'));
        }
      });
      window.electron.ipcRenderer.sendMessage('supplier-delete', [id]);
    } catch (error) {
      console.error('Error deleting supplier:', error);
      alert('Error deleting supplier. Please try again.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert('Supplier name is required');
      return;
    }

    if (!formData.companyName?.trim()) {
      alert('Company name is required');
      return;
    }

    if (!formData.phone?.trim()) {
      alert('Phone number is required');
      return;
    }

    setProcessing(true);

    try {
      if (editingSupplier?.id) {
        // Update
        const supplierIdToUpdate = editingSupplier.id;
        window.electron.ipcRenderer.once('supplier-update-reply', (response: any) => {
          setProcessing(false);
          if (response.success) {
            setShowSuccess(true);
            resetForm();
            // Update the supplier in the local state immediately
            setSuppliers((prevSuppliers) =>
              prevSuppliers.map((supplier) =>
                supplier.id === supplierIdToUpdate
                  ? { ...supplier, ...formData, id: supplierIdToUpdate }
                  : supplier
              )
            );
            // Also reload from server to ensure consistency
            loadSuppliers();
            setTimeout(() => setShowSuccess(false), 2000);
          } else {
            alert('Error updating supplier: ' + (response.error || 'Unknown error'));
          }
        });
        // Ensure companyName is a string
        const updateData = {
          ...formData,
          companyName: formData.companyName || '',
        };
        window.electron.ipcRenderer.sendMessage('supplier-update', [
          editingSupplier.id,
          updateData,
        ]);
      } else {
        // Create
        window.electron.ipcRenderer.once('supplier-create-reply', (response: any) => {
          setProcessing(false);
          if (response.success) {
            setShowSuccess(true);
            resetForm();
            loadSuppliers();
            setTimeout(() => setShowSuccess(false), 2000);
          } else {
            alert('Error creating supplier: ' + (response.error || 'Unknown error'));
          }
        });
        // Ensure companyName is a string
        const createData = {
          ...formData,
          companyName: formData.companyName || '',
        };
        window.electron.ipcRenderer.sendMessage('supplier-create', [createData]);
      }
    } catch (error) {
      console.error('Error saving supplier:', error);
      setProcessing(false);
      alert('Error saving supplier. Please try again.');
    }
  };

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter(
      (supplier) =>
        supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        supplier.companyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        supplier.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        supplier.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        supplier.contactPerson?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [suppliers, searchTerm]);

  // Statistics
  const stats = useMemo(() => {
    const total = suppliers.length;
    const withEmail = suppliers.filter((s) => s.email).length;
    const withAddress = suppliers.filter((s) => s.address).length;
    const recent = suppliers.filter((s) => {
      if (!s.createdAt) return false;
      const created = new Date(s.createdAt);
      const daysDiff = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
      return daysDiff <= 30;
    }).length;

    return { total, withEmail, withAddress, recent };
  }, [suppliers]);

  const headerActions = useMemo(
    () => null,
    []
  );

  useEffect(() => {
    setHeader({
      title: 'Supplier Management',
      subtitle: 'Manage your supplier network and partnerships',
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
            handleDelete(deleteConfirm.id);
          }
        }}
        title="Delete Supplier"
        message={`Are you sure you want to delete "${deleteConfirm?.name}"? This action cannot be undone and will remove all associated data.`}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />

      {/* Success Message */}
      {showSuccess && (
        <div className="fixed top-4 right-4 z-50 animate-slideInRight">
          <div className="bg-green-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 min-w-[300px]">
            <FiCheck className="w-5 h-5 flex-shrink-0" />
            <span className="font-medium flex-1">
              Supplier {editingSupplier ? 'updated' : 'created'} successfully!
            </span>
            <button
              type="button"
              onClick={() => setShowSuccess(false)}
              className="p-1 hover:bg-green-600 rounded transition-colors"
            >
              <FiX className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Stats Header - Single Row Design matching Medicines Page */}
      <div className="bg-gradient-to-br from-white via-white to-gray-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-gray-800/90 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-3 mb-2 flex flex-wrap items-center gap-3">
        {/* Total Suppliers */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1.5 rounded-md border border-emerald-200 dark:border-emerald-600/50 shadow-sm">
            <FiBriefcase className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              Total Suppliers
            </span>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 ml-1">
              {stats.total}
            </span>
          </div>
        </div>

        {/* With Email */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1.5 rounded-md border border-blue-200 dark:border-blue-600/50 shadow-sm">
            <FiMail className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              With Email
            </span>
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 ml-1">
              {stats.withEmail}
            </span>
          </div>
        </div>

        {/* With Address */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-purple-50 dark:bg-purple-900/20 px-2.5 py-1.5 rounded-md border border-purple-200 dark:border-purple-600/50 shadow-sm">
            <FiMapPin className="w-3.5 h-3.5 text-purple-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              With Address
            </span>
            <span className="text-xs font-bold text-purple-600 dark:text-purple-400 ml-1">
              {stats.withAddress}
            </span>
          </div>
        </div>

        {/* Recent */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-teal-50 dark:bg-teal-900/20 px-2.5 py-1.5 rounded-md border border-teal-200 dark:border-teal-600/50 shadow-sm">
            <FiTrendingUp className="w-3.5 h-3.5 text-teal-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              Recent (30 Days)
            </span>
            <span className="text-xs font-bold text-teal-600 dark:text-teal-400 ml-1">
              {stats.recent}
            </span>
          </div>
        </div>

        {/* Refresh Button */}
        <button
          onClick={loadSuppliers}
          className="ml-auto px-3 py-1.5 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-xs font-semibold rounded-md transition-colors uppercase tracking-wide flex items-center gap-1.5 shadow-sm"
        >
          <FiRefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Main Content: Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 flex-1 overflow-hidden min-h-0">
        {/* Left Side: Supplier Form */}
        <div className="lg:col-span-1 flex flex-col overflow-hidden min-h-0">
          <div className="bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md flex-1 flex flex-col overflow-visible md:overflow-hidden">
            {/* Form Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-green-50 to-green-100/50 dark:from-blue-900/20 dark:to-blue-800/10 border-b border-blue-200/50 dark:border-blue-800/30 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600">
                    {editingSupplier ? (
                      <FiEdit2 className="w-4 h-4 text-white" />
                    ) : (
                      <FiPlus className="w-4 h-4 text-white" />
                    )}
                  </div>
                  <h3 className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                    {editingSupplier ? 'Edit Supplier' : 'New Supplier'}
                  </h3>
                </div>
                {editingSupplier && (
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
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <label
                  htmlFor="supplier-name"
                  className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wide"
                >
                  Supplier Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="supplier-name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                  required
                  placeholder="Enter supplier name"
                />
              </div>

            <div className="grid grid-cols-2 gap-3">

              <div>
                <label
                  htmlFor="company-name"
                  className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wide"
                >
                  Company Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="company-name"
                  type="text"
                  value={formData.companyName}
                  onChange={(e) =>
                    setFormData({ ...formData, companyName: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                  placeholder="Enter company name"
                  required
                />
              </div>
              <div>
                  <label
                    htmlFor="supplier-phone"
                    className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wide"
                  >
                    <FiPhone className="w-3 h-3 inline mr-1 text-emerald-500" />
                    Phone <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="supplier-phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    placeholder="+1234567890"
                    required
                  />
                </div>
            </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="supplier-email"
                    className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wide"
                  >
                    <FiMail className="w-3 h-3 inline mr-1 text-emerald-500" />
                    Email
                  </label>
                  <input
                    id="supplier-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    placeholder="email@company.com"
                  />
                </div>

                <div>
                <label
                  htmlFor="contact-person"
                  className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wide"
                >
                  <FiUser className="w-3 h-3 inline mr-1 text-emerald-500" />
                  Contact Person
                </label>
                <input
                  id="contact-person"
                  type="text"
                  value={formData.contactPerson}
                  onChange={(e) =>
                    setFormData({ ...formData, contactPerson: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                  placeholder="Primary contact person"
                />
              </div>
                
              </div>

              

              <div>
                <label
                  htmlFor="supplier-address"
                  className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wide"
                >
                  <FiMapPin className="w-3 h-3 inline mr-1 text-emerald-500" />
                  Address
                </label>
                <textarea
                  id="supplier-address"
                  value={formData.address}
                  onChange={(e) =>
                    setFormData({ ...formData, address: e.target.value })
                  }
                  rows={2}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all resize-none"
                  placeholder="Enter full address"
                />
              </div>

              <div>
                <label
                  htmlFor="supplier-notes"
                  className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wide"
                >
                  <FiFileText className="w-3 h-3 inline mr-1 text-emerald-500" />
                  Notes
                </label>
                <textarea
                  id="supplier-notes"
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  rows={2}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all resize-none"
                  placeholder="Additional notes"
                />
              </div>

              <div className="flex gap-2 pt-2">
                {editingSupplier && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-red-600 to-red-500 text-white rounded-md hover:from-red-700 hover:to-red-600 transition-all duration-200 shadow-sm hover:shadow-md font-semibold text-xs"
                  >
                    <FiX className="w-3.5 h-3.5" />
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={processing}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white rounded-md hover:from-emerald-700 hover:to-emerald-600 transition-all duration-200 shadow-sm hover:shadow-md font-semibold text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FiSave className="w-3.5 h-3.5" />
                  {processing
                    ? 'Saving...'
                    : editingSupplier
                      ? 'Update Supplier'
                      : 'Save Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Side: Suppliers List */}
        <div className="lg:col-span-2 flex flex-col overflow-hidden min-h-0">
          <div className="bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md flex-1 flex flex-col overflow-hidden">
            {/* Search Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-green-50 to-green-100/50 dark:from-green-900/20 dark:to-green-800/10 border-b border-blue-200/50 dark:border-blue-800/30 flex-shrink-0">
              <div className="flex items-center gap-2">
                <label
                  htmlFor="supplier-search"
                  className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap"
                >
                  Search Suppliers
                </label>
                <div className="flex-1 relative">
                  <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-3.5 h-3.5 z-10" />
                  <input
                    id="supplier-search"
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by name, company, email, phone..."
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
              </div>
            </div>

            {/* Suppliers Table */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Loading suppliers...
                    </p>
                  </div>
                </div>
              ) : filteredSuppliers.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-200 dark:from-emerald-900/50 dark:to-emerald-800/50 mb-4">
                    <FiBriefcase className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
                    {searchTerm ? 'No suppliers found' : 'No suppliers yet'}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    {searchTerm
                      ? 'Try adjusting your search terms'
                      : 'Get started by adding your first supplier'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {/* Table Header */}
                  <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-gray-50/50 dark:bg-gray-700/30 border-b border-gray-100 dark:border-gray-700 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide sticky top-0 z-10">
                    <div className="col-span-1">#</div>
                    <div className="col-span-2">Supplier</div>
                    <div className="col-span-2">Company</div>
                    <div className="col-span-2">Contact</div>
                    <div className="col-span-2">Email</div>
                    <div className="col-span-2">Phone</div>
                    <div className="col-span-1 text-center">Actions</div>
                  </div>

                  {/* Suppliers Rows */}
                  {filteredSuppliers.map((supplier, index) => (
                    <div
                      key={supplier.id}
                      onClick={() => handleEdit(supplier)}
                      className={`grid grid-cols-12 gap-2 px-4 py-3 cursor-pointer transition-all items-center text-xs border-b border-gray-100/50 dark:border-gray-700/30 ${editingSupplier?.id === supplier.id
                        ? 'bg-gradient-to-r from-emerald-50/50 to-transparent dark:from-emerald-900/20 dark:to-transparent ring-2 ring-emerald-500/30'
                        : 'hover:bg-gradient-to-r hover:from-emerald-50/30 hover:to-transparent dark:hover:from-emerald-900/10 dark:hover:to-transparent'
                        }`}
                    >
                      <div className="col-span-1 text-gray-600 dark:text-gray-400 text-[11px] font-medium">
                        {index + 1}
                      </div>
                      <div className="col-span-2">
                        <div className="font-semibold text-gray-900 dark:text-white truncate text-[11px]">
                          {supplier.name}
                        </div>
                        {supplier.contactPerson && (
                          <div className="text-[10px] text-gray-500 dark:text-gray-500 truncate flex items-center gap-1">
                            <FiUser className="w-2.5 h-2.5" />
                            {supplier.contactPerson}
                          </div>
                        )}
                      </div>
                      <div className="col-span-2">
                        <div className="text-[11px] text-gray-900 dark:text-white truncate">
                          {supplier.companyName || '-'}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-[11px] text-gray-700 dark:text-gray-300 truncate">
                          {supplier.contactPerson || '-'}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-[11px] text-gray-700 dark:text-gray-300 truncate flex items-center gap-1">
                          {supplier.email ? (
                            <>
                              <FiMail className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                              <span className="truncate">{supplier.email}</span>
                            </>
                          ) : (
                            '-'
                          )}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-[11px] text-gray-700 dark:text-gray-300 truncate flex items-center gap-1">
                          {supplier.phone ? (
                            <>
                              <FiPhone className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                              <span className="truncate">{supplier.phone}</span>
                            </>
                          ) : (
                            '-'
                          )}
                        </div>
                      </div>
                      <div className="col-span-1 flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(supplier);
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
                            if (supplier.id) {
                              setDeleteConfirm({ id: supplier.id, name: supplier.name });
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
};

export default Suppliers;
