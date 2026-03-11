'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiShield,
  FiUsers,
  FiKey,
  FiDatabase,
  FiLogOut,
  FiEdit,
  FiTrash2,
  FiPlus,
  FiDownload,
  FiRefreshCw,
  FiSave,
  FiX,
  FiCheck,
  FiAlertCircle,
  FiLock,
  FiMenu,
  FiUpload
} from 'react-icons/fi';
import {
  superAdminLogout,
  isSuperAdminAuthenticated,
  getAllUsers,
  createUser,
  updateUser,
  updateUserPassword,
  deleteUser,
  getAllLicenses,
  getAllActivationCodes,
  updateLicense,
  deleteLicense,
  updateActivationCode,
  deleteActivationCode,
  getAllGeneratedLicenses,
  revokeGeneratedLicense,
  deleteGeneratedLicense,
  downloadDatabase,
  importDatabase,
  User,
  License,
  ActivationCode,
  GeneratedLicense,
} from '../../utils/super-admin';
import { ToastContainer, useToast } from '../../components/common/Toast';

type Tab = 'database' | 'users' | 'licenses' | 'activation-codes' | 'generated-keys';

const SuperAdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('database');
  const [loading, setLoading] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [loadingText, setLoadingText] = useState('Loading...');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { toasts, success, error, removeToast } = useToast();

  // Check authentication on mount
  useEffect(() => {
    if (!isSuperAdminAuthenticated()) {
      navigate('/login');
    }
  }, [navigate]);

  // Users state
  const [users, setUsers] = useState<User[]>([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState({ name: '', email: '', password: '' });
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordUserId, setPasswordUserId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState('');

  // Licenses state
  const [licenses, setLicenses] = useState<License[]>([]);
  const [editingLicense, setEditingLicense] = useState<License | null>(null);
  const [licenseForm, setLicenseForm] = useState({ expiryDate: '', isActive: true });

  // Activation codes state
  const [activationCodes, setActivationCodes] = useState<ActivationCode[]>([]);
  const [editingCode, setEditingCode] = useState<ActivationCode | null>(null);
  const [codeForm, setCodeForm] = useState({ code: '', expiryDate: '', isUsed: false });

  // Generated licenses state
  const [generatedLicenses, setGeneratedLicenses] = useState<GeneratedLicense[]>([]);
  const [glFilter, setGlFilter] = useState<'all' | 'used' | 'unused'>('all');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setLoadingText('Fetching users...');
    try {
      const data = await getAllUsers();
      setUsers(data);
    } catch (error) {
      // Error loading users
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLicenses = useCallback(async () => {
    setLoading(true);
    setLoadingText('Fetching licenses...');
    try {
      const data = await getAllLicenses();
      setLicenses(data);
    } catch (error) {
      // Error loading licenses
    } finally {
      setLoading(false);
    }
  }, []);

  const loadActivationCodes = useCallback(async () => {
    setLoading(true);
    setLoadingText('Fetching activation codes...');
    try {
      const data = await getAllActivationCodes();
      setActivationCodes(data);
    } catch (error) {
      // Error loading activation codes
    } finally {
      setLoading(false);
    }
  }, []);

  const loadGeneratedLicenses = useCallback(async () => {
    setLoading(true);
    setLoadingText('Fetching generated license keys...');
    try {
      const data = await getAllGeneratedLicenses();
      setGeneratedLicenses(data);
    } catch (err) {
      // Error loading generated licenses
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'users') {
      loadUsers();
    } else if (activeTab === 'licenses') {
      loadLicenses();
    } else if (activeTab === 'activation-codes') {
      loadActivationCodes();
    } else if (activeTab === 'generated-keys') {
      loadGeneratedLicenses();
    }
  }, [activeTab, loadUsers, loadLicenses, loadActivationCodes, loadGeneratedLicenses]);

  const handleLogout = () => {
    superAdminLogout();
    navigate('/login');
  };

  const handleDownloadDatabase = async () => {
    setLoading(true);
    setShowOverlay(true);
    setLoadingText('Preparing database download...');
    try {
      const result = await downloadDatabase();
      if (result.success) {
        success(`Database downloaded successfully!`);
      } else {
        error(result.error || 'Failed to download database');
      }
    } catch (err) {
      error('Failed to download database');
    } finally {
      setLoading(false);
      setShowOverlay(false);
    }
  };
  const handleImportDatabase = async () => {
    if (!confirm('Warning: Importing a new database will replace your current data. It is highly recommended to download a backup of your current database first. Are you sure you want to proceed?')) {
      return;
    }

    setLoading(true);
    setShowOverlay(true);
    setLoadingText('Importing database... Please do not close the application.');
    try {
      const result = await importDatabase();
      if (result.success) {
        setLoadingText('Import successful! Preparing to reload...');
        success(`Database imported successfully! The application will reload to apply changes.`);
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        error(result.error || 'Failed to import database');
        setLoading(false);
        setShowOverlay(false);
      }
    } catch (err) {
      error('Failed to import database');
      setLoading(false);
      setShowOverlay(false);
    }
  };

  // User Management Functions
  const handleCreateUser = async () => {
    if (!userForm.name || !userForm.email || !userForm.password) {
      error('Please fill all fields');
      return;
    }

    setLoading(true);
    try {
      const result = await createUser(userForm.name, userForm.email, userForm.password);
      if (result.success) {
        setShowUserModal(false);
        setUserForm({ name: '', email: '', password: '' });
        loadUsers();
        success('User created successfully!');
      } else {
        error(result.error || 'Failed to create user');
      }
    } catch (err) {
      error('Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setUserForm({ name: user.name, email: user.email, password: '' });
    setShowUserModal(true);
  };

  const handleUpdateUser = async () => {
    if (!editingUser || !userForm.name || !userForm.email) {
      error('Please fill all fields');
      return;
    }

    setLoading(true);
    try {
      const result = await updateUser(editingUser.id, userForm.name, userForm.email);
      if (result.success) {
        setShowUserModal(false);
        setEditingUser(null);
        setUserForm({ name: '', email: '', password: '' });
        loadUsers();
        success('User updated successfully!');
      } else {
        error(result.error || 'Failed to update user');
      }
    } catch (err) {
      error('Failed to update user');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Are you sure you want to delete this user?')) return;

    setLoading(true);
    try {
      const result = await deleteUser(userId);
      if (result.success) {
        loadUsers();
        success('User deleted successfully!');
      } else {
        error(result.error || 'Failed to delete user');
      }
    } catch (err) {
      error('Failed to delete user');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!passwordUserId || !newPassword) {
      error('Please enter a new password');
      return;
    }

    setLoading(true);
    try {
      const result = await updateUserPassword(passwordUserId, newPassword);
      if (result.success) {
        setShowPasswordModal(false);
        setPasswordUserId(null);
        setNewPassword('');
        success('Password updated successfully!');
      } else {
        error(result.error || 'Failed to update password');
      }
    } catch (err) {
      error('Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  // License Management Functions
  const handleEditLicense = (license: License) => {
    setEditingLicense(license);
    setLicenseForm({
      expiryDate: license.expiry_date.split('T')[0],
      isActive: license.is_active === 1,
    });
  };

  const handleUpdateLicense = async () => {
    if (!editingLicense) return;

    setLoading(true);
    try {
      const expiryDateTime = new Date(licenseForm.expiryDate).toISOString();
      const result = await updateLicense(editingLicense.id, expiryDateTime, licenseForm.isActive);
      if (result.success) {
        setEditingLicense(null);
        setLicenseForm({ expiryDate: '', isActive: true });
        loadLicenses();
        success('License updated successfully!');
      } else {
        error(result.error || 'Failed to update license');
      }
    } catch (err) {
      error('Failed to update license');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteLicense = async (licenseId: number) => {
    if (!confirm('Are you sure you want to delete this license?')) return;

    setLoading(true);
    try {
      const result = await deleteLicense(licenseId);
      if (result.success) {
        loadLicenses();
        success('License deleted successfully!');
      } else {
        error(result.error || 'Failed to delete license');
      }
    } catch (err) {
      error('Failed to delete license');
    } finally {
      setLoading(false);
    }
  };

  // Activation Code Management Functions
  const handleEditCode = (code: ActivationCode) => {
    setEditingCode(code);
    setCodeForm({
      code: code.code,
      expiryDate: code.expiry_date.split('T')[0],
      isUsed: code.is_used === 1,
    });
  };

  const handleUpdateCode = async () => {
    if (!editingCode) return;

    setLoading(true);
    try {
      const expiryDateTime = new Date(codeForm.expiryDate).toISOString();
      const result = await updateActivationCode(
        editingCode.id,
        codeForm.code,
        expiryDateTime,
        codeForm.isUsed
      );
      if (result.success) {
        setEditingCode(null);
        setCodeForm({ code: '', expiryDate: '', isUsed: false });
        loadActivationCodes();
        success('Activation code updated successfully!');
      } else {
        error(result.error || 'Failed to update activation code');
      }
    } catch (err) {
      error('Failed to update activation code');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCode = async (codeId: number) => {
    if (!confirm('Are you sure you want to delete this activation code?')) return;

    setLoading(true);
    try {
      const result = await deleteActivationCode(codeId);
      if (result.success) {
        loadActivationCodes();
        success('Activation code deleted successfully!');
      } else {
        error(result.error || 'Failed to delete activation code');
      }
    } catch (err) {
      error('Failed to delete activation code');
    } finally {
      setLoading(false);
    }
  };

  // Generated License Handlers
  const handleRevokeGeneratedLicense = async (id: number, code: string) => {
    if (!confirm(`Revoke key ${code}?\n\nThis will mark it as unused so the client can re-activate.`)) return;
    setLoading(true);
    try {
      const result = await revokeGeneratedLicense(id);
      if (result.success) {
        loadGeneratedLicenses();
        success('License key revoked — client can re-activate.');
      } else {
        error(result.error || 'Failed to revoke key');
      }
    } catch (err) {
      error('Failed to revoke key');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGeneratedLicense = async (id: number) => {
    if (!confirm('Permanently delete this generated license key? This cannot be undone.')) return;
    setLoading(true);
    try {
      const result = await deleteGeneratedLicense(id);
      if (result.success) {
        loadGeneratedLicenses();
        success('License key deleted.');
      } else {
        error(result.error || 'Failed to delete key');
      }
    } catch (err) {
      error('Failed to delete key');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <ToastContainer toasts={toasts} onClose={removeToast} />
      
      {/* Professional Loading Overlay */}
      {showOverlay && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-md flex flex-col items-center justify-center z-[100] animate-in fade-in duration-300">
          <div className="bg-white/95 dark:bg-gray-800/95 p-10 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.2)] flex flex-col items-center gap-8 max-w-[400px] w-full mx-4 border border-white/20">
            <div className="relative flex items-center justify-center">
              {/* Pulsating outer ring */}
              <div className="absolute w-24 h-24 bg-red-500/10 rounded-full animate-ping"></div>
              <div className="absolute w-20 h-20 bg-red-500/5 rounded-full animate-pulse decoration-8"></div>
              
              {/* Main Spinner */}
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 border-[3px] border-gray-100 dark:border-gray-700 rounded-full"></div>
                <div className="absolute inset-0 border-[3px] border-t-red-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
                <div className="absolute inset-2 border-[2px] border-gray-50 dark:border-gray-700/50 rounded-full opacity-50"></div>
                <div className="absolute inset-2 border-[2px] border-b-red-400 border-t-transparent border-r-transparent border-l-transparent rounded-full animate-[spin_1.5s_linear_infinite_reverse]"></div>
              </div>
              
              {/* Action Icon */}
              <div className="absolute">
                <FiDatabase className="w-5 h-5 text-red-500/80 animate-pulse" />
              </div>
            </div>

            <div className="text-center space-y-3">
              <h3 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                Processing
              </h3>
              <p className="text-gray-500 dark:text-gray-400 font-medium leading-relaxed px-4">
                {loadingText}
              </p>
            </div>

            <div className="w-full space-y-2">
              <div className="flex justify-between text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">
                <span>System Task</span>
                <span className="animate-pulse">Active</span>
              </div>
              <div className="w-full bg-gray-100 dark:bg-gray-700 h-1.5 rounded-full overflow-hidden">
                <div className="bg-gradient-to-r from-red-500 via-red-400 to-red-600 h-full w-[40%] animate-[premium-loading_2s_easeInOutQuad_infinite] rounded-full shadow-[0_0_10px_rgba(239,68,68,0.5)]"></div>
              </div>
            </div>
            
            <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium italic">
              Please do not disconnect or refresh
            </p>
          </div>
          
          <style dangerouslySetInnerHTML={{ __html: `
            @keyframes premium-loading {
              0% { transform: translateX(-120%) scaleX(0.5); }
              50% { transform: translateX(50%) scaleX(1.5); }
              100% { transform: translateX(250%) scaleX(0.5); }
            }
          `}} />
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <FiMenu className="w-5 h-5 text-gray-700" />
            </button>
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-red-500 to-red-600 rounded-lg flex items-center justify-center">
              <FiShield className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-gray-900">Super Admin Panel</h1>
              <p className="text-xs sm:text-sm text-gray-500 hidden sm:block">
                Role: <span className="font-semibold text-red-600">Super Admin</span> · System Administration
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="flex relative">
        {/* Sidebar Overlay for Mobile */}
        {sidebarOpen && (
          <button
            type="button"
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          />
        )}

        {/* Sidebar */}
        <aside
          className={`fixed lg:static inset-y-0 left-0 z-50 lg:z-auto w-64 bg-white border-r border-gray-200 min-h-[calc(100vh-73px)] transform transition-transform duration-300 ease-in-out flex flex-col ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
            }`}
        >
          <nav className="p-4 space-y-2 flex-grow">
            <button
              type="button"
              onClick={() => {
                setActiveTab('database');
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                activeTab === 'database'
                  ? 'bg-red-50 text-red-600 font-semibold'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <FiDatabase className="w-5 h-5" />
              Database
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('users');
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                activeTab === 'users'
                  ? 'bg-red-50 text-red-600 font-semibold'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <FiUsers className="w-5 h-5" />
              Users
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('licenses');
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                activeTab === 'licenses'
                  ? 'bg-red-50 text-red-600 font-semibold'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <FiKey className="w-5 h-5" />
              Licenses
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('activation-codes');
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                activeTab === 'activation-codes'
                  ? 'bg-red-50 text-red-600 font-semibold'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <FiKey className="w-5 h-5" />
              Activation Codes
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('generated-keys');
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                activeTab === 'generated-keys'
                  ? 'bg-red-50 text-red-600 font-semibold'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <FiShield className="w-5 h-5" />
              Generated Keys
            </button>
          </nav>

          <div className="p-4 border-t border-gray-200 mt-auto">
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-600 hover:bg-red-50 transition-colors font-semibold"
            >
              <FiLogOut className="w-5 h-5 transition-transform group-hover:scale-110" />
              Logout
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-4 sm:p-6 w-full lg:w-auto">
          {/* Database Tab */}
          {activeTab === 'database' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Database Management</h2>
              </div>
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4 sm:p-6 border border-gray-200">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-4">
                    <FiDatabase className="w-6 h-6 sm:w-8 sm:h-8 text-gray-600 flex-shrink-0" />
                    <div className="flex-1">
                      <h3 className="text-base sm:text-lg font-semibold text-gray-900">Download Database</h3>
                      <p className="text-xs sm:text-sm text-gray-600">
                        Download a copy of the SQLite database file
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadDatabase}
                    disabled={loading}
                    className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 text-sm sm:text-base mb-4"
                  >
                    <FiDownload className="w-4 h-4 sm:w-5 sm:h-5" />
                    {loading ? 'Downloading...' : 'Download Database'}
                  </button>

                  <div className="border-t border-gray-200 pt-6 mt-6">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-4">
                      <FiUpload className="w-6 h-6 sm:w-8 sm:h-8 text-gray-600 flex-shrink-0" />
                      <div className="flex-1">
                        <h3 className="text-base sm:text-lg font-semibold text-gray-900">Import Database</h3>
                        <p className="text-xs sm:text-sm text-gray-600">
                          Upload a valid SQLite database file. This will REPLACE the current data.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleImportDatabase}
                      disabled={loading}
                      className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 text-sm sm:text-base"
                    >
                      <FiUpload className="w-4 h-4 sm:w-5 sm:h-5" />
                      {loading ? 'Processing...' : 'Import Database'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Users Tab */}
          {activeTab === 'users' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 sm:mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900">User Management</h2>
                <button
                  type="button"
                  onClick={() => {
                    setEditingUser(null);
                    setUserForm({ name: '', email: '', password: '' });
                    setShowUserModal(true);
                  }}
                  className="w-full sm:w-auto px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
                >
                  <FiPlus className="w-4 h-4" />
                  Create User
                </button>
              </div>

              {loading && users.length === 0 ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
                </div>
              ) : (
                  <div className="overflow-x-auto -mx-4 sm:mx-0">
                    <table className="w-full min-w-[640px]">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          ID
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Name
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Email
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Created
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {users.map((user) => (
                        <tr key={user.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-900">{user.id}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{user.name}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{user.email}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {formatDate(user.created_at)}
                          </td>
                          <td className="px-4 py-3 text-sm text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleEditUser(user)}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Edit User"
                              >
                                <FiEdit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setPasswordUserId(user.id);
                                  setNewPassword('');
                                  setShowPasswordModal(true);
                                }}
                                className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                title="Change Password"
                              >
                                <FiLock className="w-4 h-4" />
                              </button>
                              {user.email !== 'admin@pharmacy.com' && (
                                <button
                                  onClick={() => handleDeleteUser(user.id)}
                                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Delete User"
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
          )}

          {/* Licenses Tab */}
          {activeTab === 'licenses' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 sm:mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900">License Management</h2>
                <button
                  type="button"
                  onClick={loadLicenses}
                  className="w-full sm:w-auto px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
                >
                  <FiRefreshCw className="w-4 h-4" />
                  Refresh
                </button>
              </div>

              {loading && licenses.length === 0 ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
                </div>
              ) : (
                  <div className="overflow-x-auto -mx-4 sm:mx-0">
                    <table className="w-full min-w-[640px]">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          ID
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          User ID
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Activation Code
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Expiry Date
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Status
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {licenses.map((license) => (
                        <tr key={license.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-900">{license.id}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{license.user_id}</td>
                          <td className="px-4 py-3 text-sm font-mono text-gray-900">
                            {license.activation_code}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {formatDate(license.expiry_date)}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium ${
                                license.is_active === 1
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {license.is_active === 1 ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleEditLicense(license)}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Edit License"
                              >
                                <FiEdit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteLicense(license.id)}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete License"
                              >
                                <FiTrash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Edit License Modal */}
              {editingLicense && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-bold text-gray-900">Edit License</h3>
                      <button
                        onClick={() => {
                          setEditingLicense(null);
                          setLicenseForm({ expiryDate: '', isActive: true });
                        }}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                      >
                        <FiX className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Expiry Date
                        </label>
                        <input
                          type="date"
                          value={licenseForm.expiryDate}
                          onChange={(e) =>
                            setLicenseForm({ ...licenseForm, expiryDate: e.target.value })
                          }
                          className="w-full border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={licenseForm.isActive}
                            onChange={(e) =>
                              setLicenseForm({ ...licenseForm, isActive: e.target.checked })
                            }
                            className="w-4 h-4"
                          />
                          <span className="text-sm text-gray-700">Active</span>
                        </label>
                      </div>
                      <div className="flex gap-3">
                        <button
                          onClick={handleUpdateLicense}
                          disabled={loading}
                          className="flex-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setEditingLicense(null);
                            setLicenseForm({ expiryDate: '', isActive: true });
                          }}
                          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Generated Keys Tab */}
          {activeTab === 'generated-keys' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 sm:mb-6">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Generated License Keys</h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    14-char keys issued by the desktop. Revoke to allow re-activation; delete to remove entirely.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {/* Filter */}
                  <select
                    value={glFilter}
                    onChange={(e) => setGlFilter(e.target.value as 'all' | 'used' | 'unused')}
                    className="text-xs border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-700 focus:ring-2 focus:ring-red-500 outline-none"
                  >
                    <option value="all">All keys</option>
                    <option value="unused">Unused only</option>
                    <option value="used">Used only</option>
                  </select>
                  <button
                    type="button"
                    onClick={loadGeneratedLicenses}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 text-sm"
                  >
                    <FiRefreshCw className="w-4 h-4" />
                    Refresh
                  </button>
                </div>
              </div>

              {/* Stats bar */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 text-center">
                  <div className="text-2xl font-bold text-gray-900">{generatedLicenses.length}</div>
                  <div className="text-xs text-gray-500 mt-0.5">Total Keys</div>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100 text-center">
                  <div className="text-2xl font-bold text-emerald-700">
                    {generatedLicenses.filter((k) => k.is_used === 0).length}
                  </div>
                  <div className="text-xs text-emerald-600 mt-0.5">Available</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-3 border border-blue-100 text-center">
                  <div className="text-2xl font-bold text-blue-700">
                    {generatedLicenses.filter((k) => k.is_used === 1).length}
                  </div>
                  <div className="text-xs text-blue-600 mt-0.5">Activated</div>
                </div>
              </div>

              {loading && generatedLicenses.length === 0 ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500" />
                </div>
              ) : (
                <div className="space-y-3">
                  {generatedLicenses
                    .filter((k) => {
                      if (glFilter === 'used') return k.is_used === 1;
                      if (glFilter === 'unused') return k.is_used === 0;
                      return true;
                    })
                    .map((gl) => (
                      <div
                        key={gl.id}
                        className={`rounded-xl border p-4 transition-all ${
                          gl.is_used === 1
                            ? 'border-blue-200 bg-blue-50/40'
                            : 'border-gray-200 bg-white hover:border-emerald-200'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                          {/* Key + status */}
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <span className="font-mono text-sm font-bold tracking-[0.18em] text-gray-900 select-all">
                                {gl.code.replace(/(.{4})/g, '$1 ').trim()}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  gl.is_used === 1
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-emerald-100 text-emerald-700'
                                }`}
                              >
                                {gl.is_used === 1 ? 'Activated' : 'Available'}
                              </span>
                            </div>

                            {/* Pharmacy details grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5 text-xs text-gray-600">
                              {gl.pharmacy_name && (
                                <div><span className="text-gray-400">Pharmacy:</span> {gl.pharmacy_name}</div>
                              )}
                              {gl.doctor_name && (
                                <div><span className="text-gray-400">Doctor:</span> {gl.doctor_name}</div>
                              )}
                              {gl.email && (
                                <div><span className="text-gray-400">Email:</span> {gl.email}</div>
                              )}
                              {gl.phone && (
                                <div><span className="text-gray-400">Phone:</span> {gl.phone}</div>
                              )}
                              {(gl.city || gl.country) && (
                                <div>
                                  <span className="text-gray-400">Location:</span>{' '}
                                  {[gl.city, gl.country].filter(Boolean).join(', ')}
                                </div>
                              )}
                              {gl.address && (
                                <div className="sm:col-span-2">
                                  <span className="text-gray-400">Address:</span> {gl.address}
                                </div>
                              )}
                            </div>

                            {/* Dates */}
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-gray-400">
                              <span>Generated: {formatDate(gl.generated_at)}</span>
                              {gl.is_used === 1 && gl.used_at && (
                                <span className="text-blue-500">
                                  Activated: {formatDate(gl.used_at)}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2 shrink-0">
                            {gl.is_used === 1 && (
                              <button
                                type="button"
                                onClick={() => handleRevokeGeneratedLicense(gl.id, gl.code)}
                                disabled={loading}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-700 transition-colors disabled:opacity-50"
                                title="Revoke — reset to unused so client can re-activate"
                              >
                                <FiAlertCircle className="w-3.5 h-3.5" />
                                Revoke
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteGeneratedLicense(gl.id)}
                              disabled={loading}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                              title="Delete key permanently"
                            >
                              <FiTrash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}

                  {generatedLicenses.filter((k) => {
                    if (glFilter === 'used') return k.is_used === 1;
                    if (glFilter === 'unused') return k.is_used === 0;
                    return true;
                  }).length === 0 && (
                    <div className="py-12 text-center text-gray-400 text-sm">
                      No keys found for the selected filter.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Activation Codes Tab */}
          {activeTab === 'activation-codes' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 sm:mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Activation Codes</h2>
                <button
                  type="button"
                  onClick={loadActivationCodes}
                  className="w-full sm:w-auto px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
                >
                  <FiRefreshCw className="w-4 h-4" />
                  Refresh
                </button>
              </div>

              {loading && activationCodes.length === 0 ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
                </div>
              ) : (
                  <div className="overflow-x-auto -mx-4 sm:mx-0">
                    <table className="w-full min-w-[640px]">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          ID
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Code
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Expiry Date
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Status
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Used By
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {activationCodes.map((code) => (
                        <tr key={code.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-900">{code.id}</td>
                          <td className="px-4 py-3 text-sm font-mono text-gray-900">{code.code}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {formatDate(code.expiry_date)}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium ${
                                code.is_used === 1
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              {code.is_used === 1 ? 'Used' : 'Available'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {code.used_by_user_id || '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleEditCode(code)}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Edit Code"
                              >
                                <FiEdit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteCode(code.id)}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete Code"
                              >
                                <FiTrash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Edit Code Modal */}
              {editingCode && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-bold text-gray-900">Edit Activation Code</h3>
                      <button
                        onClick={() => {
                          setEditingCode(null);
                          setCodeForm({ code: '', expiryDate: '', isUsed: false });
                        }}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                      >
                        <FiX className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Code</label>
                        <input
                          type="text"
                          value={codeForm.code}
                          onChange={(e) => setCodeForm({ ...codeForm, code: e.target.value })}
                          className="w-full border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Expiry Date
                        </label>
                        <input
                          type="date"
                          value={codeForm.expiryDate}
                          onChange={(e) =>
                            setCodeForm({ ...codeForm, expiryDate: e.target.value })
                          }
                          className="w-full border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={codeForm.isUsed}
                            onChange={(e) =>
                              setCodeForm({ ...codeForm, isUsed: e.target.checked })
                            }
                            className="w-4 h-4"
                          />
                          <span className="text-sm text-gray-700">Mark as Used</span>
                        </label>
                      </div>
                      <div className="flex gap-3">
                        <button
                          onClick={handleUpdateCode}
                          disabled={loading}
                          className="flex-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setEditingCode(null);
                            setCodeForm({ code: '', expiryDate: '', isUsed: false });
                          }}
                          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* User Modal */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">
                {editingUser ? 'Edit User' : 'Create User'}
              </h3>
              <button
                onClick={() => {
                  setShowUserModal(false);
                  setEditingUser(null);
                  setUserForm({ name: '', email: '', password: '' });
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
                <input
                  type="text"
                  value={userForm.name}
                  onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <input
                  type="email"
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                />
              </div>
              {!editingUser && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                  <input
                    type="password"
                    value={userForm.password}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                  />
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={editingUser ? handleUpdateUser : handleCreateUser}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {editingUser ? 'Update' : 'Create'}
                </button>
                <button
                  onClick={() => {
                    setShowUserModal(false);
                    setEditingUser(null);
                    setUserForm({ name: '', email: '', password: '' });
                  }}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Change Password</h3>
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordUserId(null);
                  setNewPassword('');
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleUpdatePassword}
                  disabled={loading || !newPassword}
                  className="flex-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  Update Password
                </button>
                <button
                  onClick={() => {
                    setShowPasswordModal(false);
                    setPasswordUserId(null);
                    setNewPassword('');
                  }}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminDashboard;
