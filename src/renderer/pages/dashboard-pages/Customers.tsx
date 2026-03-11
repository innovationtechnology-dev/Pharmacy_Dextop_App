'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiX,
  FiSave,
  FiMail,
  FiPhone,
  FiMapPin,
  FiUser,
  FiFileText,
  FiCheck,
  FiTrendingUp,
  FiUsers,
  FiAlertCircle,
  FiRefreshCw,
} from 'react-icons/fi';
import { useDashboardHeader } from './useDashboardHeader';

interface Customer {
  id?: number;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

const Customers: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState<Customer>({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    notes: '',
  });
  const [showSuccess, setShowSuccess] = useState(false);
  const [processing, setProcessing] = useState(false);

  const { setHeader } = useDashboardHeader();

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      window.electron.ipcRenderer.once('customer-get-all-reply', (response: any) => {
        setLoading(false);
        if (response.success) {
          setCustomers(response.data || []);
        } else {
          console.error('Error loading customers:', response.error);
        }
      });
      window.electron.ipcRenderer.sendMessage('customer-get-all', []);
    } catch (error) {
      console.error('Error loading customers:', error);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const resetForm = useCallback(() => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      notes: '',
    });
    setEditingCustomer(null);
  }, []);

  const handleEdit = useCallback((customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      email: customer.email || '',
      phone: customer.phone || '',
      address: customer.address || '',
      city: customer.city || '',
      notes: customer.notes || '',
    });
  }, []);

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this customer?')) {
      return;
    }

    try {
      window.electron.ipcRenderer.once('customer-delete-reply', (response: any) => {
        if (response.success) {
          loadCustomers();
          if (editingCustomer?.id === id) {
            resetForm();
          }
        } else {
          alert('Error deleting customer: ' + (response.error || 'Unknown error'));
        }
      });
      window.electron.ipcRenderer.sendMessage('customer-delete', [id]);
    } catch (error) {
      console.error('Error deleting customer:', error);
      alert('Error deleting customer. Please try again.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert('Customer name is required');
      return;
    }

    if (!formData.phone?.trim()) {
      alert('Phone number is required');
      return;
    }

    setProcessing(true);

    try {
      if (editingCustomer?.id) {
        // Update
        const customerIdToUpdate = editingCustomer.id;
        window.electron.ipcRenderer.once('customer-update-reply', (response: any) => {
          setProcessing(false);
          if (response.success) {
            setShowSuccess(true);
            resetForm();
            // Update the customer in the local state immediately
            setCustomers((prevCustomers) =>
              prevCustomers.map((customer) =>
                customer.id === customerIdToUpdate
                  ? { ...customer, ...formData, id: customerIdToUpdate }
                  : customer
              )
            );
            // Also reload from server to ensure consistency
            loadCustomers();
            setTimeout(() => setShowSuccess(false), 2000);
          } else {
            alert('Error updating customer: ' + (response.error || 'Unknown error'));
          }
        });
        // Ensure all fields are strings
        const updateData = {
          ...formData,
          email: formData.email || '',
          phone: formData.phone || '',
          address: formData.address || '',
          city: formData.city || '',
          notes: formData.notes || '',
        };
        window.electron.ipcRenderer.sendMessage('customer-update', [
          editingCustomer.id,
          updateData,
        ]);
      } else {
        // Create
        window.electron.ipcRenderer.once('customer-create-reply', (response: any) => {
          setProcessing(false);
          if (response.success) {
            setShowSuccess(true);
            resetForm();
            loadCustomers();
            setTimeout(() => setShowSuccess(false), 2000);
          } else {
            alert('Error creating customer: ' + (response.error || 'Unknown error'));
          }
        });
        // Ensure all fields are strings
        const createData = {
          ...formData,
          email: formData.email || '',
          phone: formData.phone || '',
          address: formData.address || '',
          city: formData.city || '',
          notes: formData.notes || '',
        };
        window.electron.ipcRenderer.sendMessage('customer-create', [createData]);
      }
    } catch (error) {
      console.error('Error saving customer:', error);
      setProcessing(false);
      alert('Error saving customer. Please try again.');
    }
  };

  const filteredCustomers = useMemo(() => {
    return customers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.city?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [customers, searchTerm]);

  // Statistics
  const stats = useMemo(() => {
    const total = customers.length;
    const withEmail = customers.filter((c) => c.email).length;
    const withAddress = customers.filter((c) => c.address).length;
    const recent = customers.filter((c) => {
      if (!c.createdAt) return false;
      const created = new Date(c.createdAt);
      const daysDiff = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
      return daysDiff <= 30;
    }).length;

    return { total, withEmail, withAddress, recent };
  }, [customers]);

  const headerActions = useMemo(
    () => null,
    []
  );

  useEffect(() => {
    setHeader({
      title: 'Customer Management',
      subtitle: 'Manage your customer database and relationships',
      actions: headerActions,
    });
    return () => setHeader(null);
  }, [setHeader, headerActions]);

  return (
    <div className="flex flex-col h-auto md:h-[calc(100vh-80px)] w-full bg-gradient-to-br from-gray-50 via-gray-50 to-gray-100/50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800/80 overflow-visible md:overflow-hidden px-4 pb-4 md:pb-0">
      {/* Success Message */}
      {showSuccess && (
        <div className="fixed top-4 right-4 z-50 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm">
          <FiCheck className="w-4 h-4" />
          <span className="font-medium">
            Customer {editingCustomer ? 'updated' : 'created'} successfully!
          </span>
        </div>
      )}

      {/* Stats Header - Single Row Design matching Medicines Page */}
      <div className="bg-gradient-to-br from-white via-white to-gray-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-gray-800/90 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-3 mb-2 flex flex-wrap items-center gap-3">
        {/* Total Customers */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1.5 rounded-md border border-emerald-200 dark:border-emerald-600/50 shadow-sm">
            <FiUsers className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              Total Customers
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
          <div className="flex items-center gap-1.5 bg-orange-50 dark:bg-orange-900/20 px-2.5 py-1.5 rounded-md border border-orange-200 dark:border-orange-600/50 shadow-sm">
            <FiAlertCircle className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              Recent (30 Days)
            </span>
            <span className="text-xs font-bold text-orange-600 dark:text-orange-400 ml-1">
              {stats.recent}
            </span>
          </div>
        </div>

        {/* Refresh Button */}
        <button
          onClick={loadCustomers}
          className="ml-auto px-3 py-1.5 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-xs font-semibold rounded-md transition-colors uppercase tracking-wide flex items-center gap-1.5 shadow-sm"
        >
          <FiRefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Main Content: Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 flex-1 overflow-hidden min-h-0">
        {/* Left Side: Customer Form */}
        <div className="lg:col-span-2 flex flex-col overflow-hidden min-h-0">
          <div className="bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md flex-1 flex flex-col overflow-visible md:overflow-hidden">
            {/* Form Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-green-50 to-green-100/50 dark:from-blue-900/20 dark:to-blue-800/10 border-b border-blue-200/50 dark:border-blue-800/30 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600">
                    {editingCustomer ? (
                      <FiEdit2 className="w-4 h-4 text-white" />
                    ) : (
                      <FiPlus className="w-4 h-4 text-white" />
                    )}
                  </div>
                  <h3 className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                    {editingCustomer ? 'Edit Customer' : 'New Customer'}
                  </h3>
                </div>
                {editingCustomer && (
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
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-3">
              <div>
                <label
                  htmlFor="customer-name"
                  className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wide"
                >
                  Customer Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="customer-name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                  required
                  placeholder="Enter customer name"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label
                    htmlFor="customer-email"
                    className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wide"
                  >
                    <FiMail className="w-3 h-3 inline mr-1 text-emerald-500" />
                    Email
                  </label>
                  <input
                    id="customer-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    placeholder="email@example.com"
                  />
                </div>
                <div>
                  <label
                    htmlFor="customer-phone"
                    className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wide"
                  >
                    <FiPhone className="w-3 h-3 inline mr-1 text-emerald-500" />
                    Phone <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="customer-phone"
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

              <div>
                <label
                  htmlFor="customer-address"
                  className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wide"
                >
                  <FiMapPin className="w-3 h-3 inline mr-1 text-emerald-500" />
                  Address
                </label>
                <textarea
                  id="customer-address"
                  value={formData.address}
                  onChange={(e) =>
                    setFormData({ ...formData, address: e.target.value })
                  }
                  rows={2}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all resize-none"
                  placeholder="Enter full address"
                />
              </div>

              <div>
                <label
                  htmlFor="customer-city"
                  className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wide"
                >
                  <FiMapPin className="w-3 h-3 inline mr-1 text-emerald-500" />
                  City
                </label>
                <input
                  id="customer-city"
                  type="text"
                  value={formData.city}
                  onChange={(e) =>
                    setFormData({ ...formData, city: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                  placeholder="Enter city"
                />
              </div>

              <div>
                <label
                  htmlFor="customer-notes"
                  className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wide"
                >
                  <FiFileText className="w-3 h-3 inline mr-1 text-emerald-500" />
                  Notes
                </label>
                <textarea
                  id="customer-notes"
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  rows={2}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all resize-none"
                  placeholder="Additional notes"
                />
              </div>

              <div className="flex gap-2 pt-2">
                {editingCustomer && (
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
                    : editingCustomer
                      ? 'Update Customer'
                      : 'Save Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Side: Customers List */}
        <div className="lg:col-span-3 flex flex-col overflow-hidden min-h-0">
          <div className="bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md flex-1 flex flex-col overflow-hidden">
            {/* Search Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-green-50 to-green-100/50 dark:from-green-900/20 dark:to-green-800/10 border-b border-blue-200/50 dark:border-blue-800/30 flex-shrink-0">
              <div className="flex items-center gap-2">
                <label
                  htmlFor="customer-search"
                  className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap"
                >
                  Search Customers
                </label>
                <div className="flex-1 relative">
                  <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-3.5 h-3.5 z-10" />
                  <input
                    id="customer-search"
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by name, email, phone, city..."
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

            {/* Customers Table */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Loading customers...
                    </p>
                  </div>
                </div>
              ) : filteredCustomers.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-200 dark:from-emerald-900/50 dark:to-emerald-800/50 mb-4">
                    <FiUsers className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
                    {searchTerm ? 'No customers found' : 'No customers yet'}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    {searchTerm
                      ? 'Try adjusting your search terms'
                      : 'Get started by adding your first customer'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {/* Table Header */}
                  <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-gray-50/50 dark:bg-gray-700/30 border-b border-gray-100 dark:border-gray-700 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide sticky top-0 z-10">
                    <div className="col-span-1">#</div>
                    <div className="col-span-2">Customer</div>
                    <div className="col-span-2">Email</div>
                    <div className="col-span-2">Phone</div>
                    <div className="col-span-2">City</div>
                    <div className="col-span-2">Address</div>
                    <div className="col-span-1 text-center">Actions</div>
                  </div>

                  {/* Customers Rows */}
                  {filteredCustomers.map((customer, index) => (
                    <div
                      key={customer.id}
                      onClick={() => handleEdit(customer)}
                      className={`grid grid-cols-12 gap-2 px-4 py-3 cursor-pointer transition-all items-center text-xs border-b border-gray-100/50 dark:border-gray-700/30 ${editingCustomer?.id === customer.id
                          ? 'bg-gradient-to-r from-emerald-50/50 to-transparent dark:from-emerald-900/20 dark:to-transparent ring-2 ring-emerald-500/30'
                          : 'hover:bg-gradient-to-r hover:from-emerald-50/30 hover:to-transparent dark:hover:from-emerald-900/10 dark:hover:to-transparent'
                        }`}
                    >
                      <div className="col-span-1 text-gray-600 dark:text-gray-400 text-[11px] font-medium">
                        {index + 1}
                      </div>
                      <div className="col-span-2">
                        <div className="font-semibold text-gray-900 dark:text-white truncate text-[11px]">
                          {customer.name}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-[11px] text-gray-700 dark:text-gray-300 truncate flex items-center gap-1">
                          {customer.email ? (
                            <>
                              <FiMail className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                              <span className="truncate">{customer.email}</span>
                            </>
                          ) : (
                            '-'
                          )}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-[11px] text-gray-700 dark:text-gray-300 truncate flex items-center gap-1">
                          {customer.phone ? (
                            <>
                              <FiPhone className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                              <span className="truncate">{customer.phone}</span>
                            </>
                          ) : (
                            '-'
                          )}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-[11px] text-gray-700 dark:text-gray-300 truncate">
                          {customer.city || '-'}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-[11px] text-gray-700 dark:text-gray-300 truncate">
                          {customer.address || '-'}
                        </div>
                      </div>
                      <div className="col-span-1 flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(customer);
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
                            if (customer.id) {
                              handleDelete(customer.id);
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

export default Customers;

