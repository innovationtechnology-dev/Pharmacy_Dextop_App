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
  FiUpload,
  FiEye,
  FiEyeOff
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
  updateLicense,
  deleteLicense,
  getAllGeneratedLicenses,
  revokeGeneratedLicense,
  deleteGeneratedLicense,
  downloadDatabase,
  importDatabase,
  getAvailableBackups,
  restoreFromBackup,
  cleanupOldBackups,
  User,
  License,
  GeneratedLicense,
  DatabaseBackup,
} from '../../utils/super-admin';
import { ToastContainer, useToast } from '../../components/common/Toast';

type Tab = 'database' | 'users' | 'licenses' | 'generated-keys';

const SuperAdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('database');
  const [loading, setLoading] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [loadingText, setLoadingText] = useState('Loading...');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { toasts, success, error, removeToast } = useToast();
  
  // Ref to prevent multiple simultaneous loads
  const isLoadingRef = React.useRef(false);

  // Check authentication on mount
  useEffect(() => {
    if (!isSuperAdminAuthenticated()) {
      navigate('/login');
    }
  }, [navigate]);

  // Handle window visibility to prevent freezing on minimize/restore
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Window is minimized or hidden - cancel any ongoing operations
        setLoading(false);
        setShowOverlay(false);
        isLoadingRef.current = false;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Users state
  const [users, setUsers] = useState<User[]>([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState({ name: '', email: '', password: '', role: 'cashier' });
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordUserId, setPasswordUserId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Licenses state
  const [licenses, setLicenses] = useState<License[]>([]);
  const [editingLicense, setEditingLicense] = useState<License | null>(null);
  const [licenseForm, setLicenseForm] = useState({ expiryDate: '', isActive: true });

  // Generated licenses state
  const [generatedLicenses, setGeneratedLicenses] = useState<GeneratedLicense[]>([]);
  const [glFilter, setGlFilter] = useState<'all' | 'used' | 'unused'>('all');

  // Backup management state
  const [backups, setBackups] = useState<DatabaseBackup[]>([]);
  const [showBackupsModal, setShowBackupsModal] = useState(false);

  // Reset system state
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [tableCounts, setTableCounts] = useState({
    sales: 0,
    purchases: 0,
    medicines: 0,
    customers: 0,
    suppliers: 0,
    saleReturns: 0,
  });

  const loadUsers = useCallback(async () => {
    if (isLoadingRef.current || document.hidden) return;
    isLoadingRef.current = true;
    setLoading(true);
    setLoadingText('Fetching users...');
    try {
      const data = await getAllUsers();
      if (!document.hidden) {
        setUsers(data);
      }
    } catch (error) {
      // Error loading users
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  }, []);

  const loadLicenses = useCallback(async () => {
    if (isLoadingRef.current || document.hidden) return;
    isLoadingRef.current = true;
    setLoading(true);
    setLoadingText('Fetching licenses...');
    try {
      const data = await getAllLicenses();
      if (!document.hidden) {
        setLicenses(data);
      }
    } catch (error) {
      // Error loading licenses
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  }, []);

  const loadGeneratedLicenses = useCallback(async () => {
    if (isLoadingRef.current || document.hidden) return;
    isLoadingRef.current = true;
    setLoading(true);
    setLoadingText('Fetching generated license keys...');
    try {
      const data = await getAllGeneratedLicenses();
      if (!document.hidden) {
        setGeneratedLicenses(data);
      }
    } catch (err) {
      // Error loading generated licenses
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'users') {
      loadUsers();
    } else if (activeTab === 'licenses') {
      loadLicenses();
    } else if (activeTab === 'generated-keys') {
      loadGeneratedLicenses();
    }
  }, [activeTab, loadUsers, loadLicenses, loadGeneratedLicenses]);

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
        setLoadingText('Download complete!');
        success(`Database downloaded successfully!`);
        // Keep overlay visible briefly so user sees the toast
        await new Promise(resolve => setTimeout(resolve, 1500));
      } else {
        error(result.error || 'Failed to download database');
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    } catch (err) {
      error('Failed to download database');
      await new Promise(resolve => setTimeout(resolve, 1500));
    } finally {
      setLoading(false);
      setShowOverlay(false);
    }
  };
  const handleImportDatabase = async () => {
    if (!confirm('Warning: Importing a new database will replace your current data. A timestamped backup will be created automatically. Are you sure you want to proceed?')) {
      return;
    }

    setLoading(true);
    setShowOverlay(true);
    setLoadingText('Validating and importing database...');
    try {
      const result = await importDatabase();
      if (result.success) {
        setLoadingText('Import successful! Preparing to reload...');
        
        // Show success toast
        if (result.summary) {
          success(`Database imported successfully! Users: ${result.summary.users}, Medicines: ${result.summary.medicines}, Sales: ${result.summary.sales}. Reloading...`);
        } else {
          success('Database imported successfully! The application will reload to apply changes.');
        }
        
        // Keep overlay visible so user sees the toast
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Reload the application
        window.location.reload();
      } else {
        error(result.error || 'Failed to import database');
        // Keep overlay visible briefly so user sees the toast
        await new Promise(resolve => setTimeout(resolve, 1500));
        setLoading(false);
        setShowOverlay(false);
      }
    } catch (err) {
      error('Failed to import database');
      // Keep overlay visible briefly so user sees the toast
      await new Promise(resolve => setTimeout(resolve, 1500));
      setLoading(false);
      setShowOverlay(false);
    }
  };

  // Reset System Functions
  const fetchTableCounts = async () => {
    try {
      const counts = await new Promise<any>((resolve) => {
        window.electron.ipcRenderer.once('get-table-counts-reply', (response: any) => {
          resolve(response);
        });
        window.electron.ipcRenderer.sendMessage('get-table-counts', []);
      });
      
      if (counts.success) {
        setTableCounts(counts.data);
      }
    } catch (err) {
      console.error('Failed to fetch table counts:', err);
    }
  };

  const handleResetSystem = async () => {
    await fetchTableCounts();
    setShowResetModal(true);
  };

  const confirmResetSystem = async () => {
    if (resetConfirmText !== 'DELETE ALL DATA') {
      error('You must type "DELETE ALL DATA" exactly to confirm.');
      return;
    }

    setShowResetModal(false);
    setResetConfirmText('');

    const finalConfirm = confirm('Are you absolutely sure? This is your last chance to cancel!');
    if (!finalConfirm) {
      return;
    }

    setLoading(true);
    setShowOverlay(true);
    setLoadingText('Resetting system data...');
    
    console.log('Sending system-reset-all-data message...');
    
    try {
      // Set up the listener first
      window.electron.ipcRenderer.once('system-reset-all-data-reply', async (response: any) => {
        console.log('Received system-reset-all-data-reply:', response);
        
        if (response.success) {
          setLoadingText('Reset complete! Reloading...');
          success('System reset successfully! All data has been deleted. The page will now reload.');
          // Keep overlay visible so user sees the toast
          await new Promise(resolve => setTimeout(resolve, 2000));
          window.location.reload();
        } else {
          error('Failed to reset system: ' + (response.error || 'Unknown error'));
          // Keep overlay visible briefly so user sees the toast
          await new Promise(resolve => setTimeout(resolve, 1500));
          setLoading(false);
          setShowOverlay(false);
        }
      });
      
      // Then send the message
      window.electron.ipcRenderer.sendMessage('system-reset-all-data', []);
      console.log('Message sent successfully');
    } catch (err) {
      console.error('Error in confirmResetSystem:', err);
      setLoading(false);
      setShowOverlay(false);
      error('Failed to reset system. Please try again.');
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
      const result = await createUser(userForm.name, userForm.email, userForm.password, userForm.role);
      if (result.success) {
        setShowUserModal(false);
        setUserForm({ name: '', email: '', password: '', role: 'cashier' });
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
    setUserForm({ name: user.name, email: user.email, password: '', role: user.role || 'cashier' });
    setShowUserModal(true);
  };

  const handleUpdateUser = async () => {
    if (!editingUser || !userForm.name || !userForm.email) {
      error('Please fill all fields');
      return;
    }

    setLoading(true);
    try {
      const result = await updateUser(editingUser.id, userForm.name, userForm.email, userForm.role);
      if (result.success) {
        setShowUserModal(false);
        setEditingUser(null);
        setUserForm({ name: '', email: '', password: '', role: 'cashier' });
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

  // Backup Management Functions
  const loadBackups = async () => {
    try {
      const data = await getAvailableBackups();
      setBackups(data);
    } catch (err) {
      error('Failed to load backups');
    }
  };

  const handleRestoreBackup = async (backupPath: string, filename: string) => {
    if (!confirm(`Restore database from backup "${filename}"?\n\nThis will replace your current database. A new backup of the current state will be created automatically.`)) {
      return;
    }

    setLoading(true);
    setShowOverlay(true);
    setLoadingText('Restoring database from backup...');
    setShowBackupsModal(false);
    
    try {
      const result = await restoreFromBackup(backupPath);
      if (result.success) {
        setLoadingText('Restore successful! Preparing to reload...');
        
        // Show success toast with summary
        if (result.summary) {
          success(`Database restored! Users: ${result.summary.users}, Medicines: ${result.summary.medicines}, Sales: ${result.summary.sales}. Reloading...`);
        } else {
          success('Database restored successfully! The application will reload.');
        }
        
        // Keep overlay visible so user sees the toast
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Reload the application
        window.location.reload();
      } else {
        error(result.error || 'Failed to restore backup');
        // Keep overlay visible briefly so user sees the toast
        await new Promise(resolve => setTimeout(resolve, 1500));
        setLoading(false);
        setShowOverlay(false);
      }
    } catch (err) {
      error('Failed to restore backup');
      // Keep overlay visible briefly so user sees the toast
      await new Promise(resolve => setTimeout(resolve, 1500));
      setLoading(false);
      setShowOverlay(false);
    }
  };

  const handleCleanupBackups = async () => {
    if (!confirm('Delete old backups, keeping only the 3 most recent?\n\nThis action cannot be undone.')) {
      return;
    }

    setLoading(true);
    setShowOverlay(true);
    setLoadingText('Cleaning up old backups...');
    try {
      const result = await cleanupOldBackups(3);
      if (result.success) {
        setLoadingText('Cleanup complete!');
        success(`Cleaned up ${result.deletedCount} old backup(s)`);
        loadBackups();
        // Keep overlay visible briefly so user sees the toast
        await new Promise(resolve => setTimeout(resolve, 1500));
      } else {
        error('Failed to cleanup backups');
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    } catch (err) {
      error('Failed to cleanup backups');
      await new Promise(resolve => setTimeout(resolve, 1500));
    } finally {
      setLoading(false);
      setShowOverlay(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
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
      <header className="bg-gradient-to-r from-red-600 via-red-500 to-red-600 border-b border-red-700/30 shadow-lg">
        <div className="px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 hover:bg-red-700/30 rounded-lg transition-colors"
            >
              <FiMenu className="w-5 h-5 text-white" />
            </button>
            <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center border border-white/30">
              <FiShield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-white">Super Admin Panel</h1>
              <p className="text-xs text-red-100 hidden sm:block">
                System Administration & Management
              </p>
            </div>
          </div>
          {/* <button
            type="button"
            onClick={handleLogout}
            className="hidden sm:flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white rounded-lg transition-colors font-medium text-sm border border-white/20"
          >
            <FiLogOut className="w-4 h-4" />
            Logout
          </button> */}
        </div>
      </header>

      <div className="flex flex-1 relative overflow-hidden" style={{ height: 'calc(100vh - 73px)' }}>
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
          className={`fixed lg:static inset-y-0 left-0 z-50 lg:z-auto w-64 bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 border-r border-gray-200 dark:border-gray-700 h-full overflow-y-auto transform transition-transform duration-300 ease-in-out flex flex-col shadow-xl lg:shadow-none ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
            }`}
        >
          <nav className="p-4 space-y-2 flex-grow">
            <button
              type="button"
              onClick={() => {
                setActiveTab('database');
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                activeTab === 'database'
                  ? 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/30 font-semibold'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'
              }`}
            >
              <FiDatabase className="w-5 h-5" />
              <span>Database</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('users');
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                activeTab === 'users'
                  ? 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/30 font-semibold'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'
              }`}
            >
              <FiUsers className="w-5 h-5" />
              <span>Users</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('licenses');
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                activeTab === 'licenses'
                  ? 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/30 font-semibold'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'
              }`}
            >
              <FiLock className="w-5 h-5" />
              <span>Licenses</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('generated-keys');
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                activeTab === 'generated-keys'
                  ? 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/30 font-semibold'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'
              }`}
            >
              <FiKey className="w-5 h-5" />
              <span>Generated Keys</span>
            </button>
          </nav>

          <div className="p-4 border-t border-gray-200 dark:border-gray-700 mt-auto">
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors font-semibold"
            >
              <FiLogOut className="w-5 h-5" />
              <span>Logout</span>
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-4 sm:p-6 w-full lg:w-auto overflow-y-auto bg-gray-50 dark:bg-gray-900">
          {/* Database Tab */}
          {activeTab === 'database' && (
            <div className="space-y-6">
              {/* Header Card */}
              <div className="bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-xl border border-blue-200/50 dark:border-blue-800/30 shadow-md">
                <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-800/10 border-b border-blue-200/50 dark:border-blue-800/30 rounded-t-xl">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-600 rounded-xl">
                      <FiDatabase className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-900 dark:text-white">Database Management</h2>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                        Manage database backups, imports, and system data
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  {/* Download and Import Database - Side by Side */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Download Database */}
                    <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-900/20 dark:to-emerald-800/10 rounded-xl p-5 border border-emerald-200/50 dark:border-emerald-800/30">
                      <div className="flex items-start gap-3 mb-4">
                        <div className="p-2 bg-emerald-600 rounded-lg">
                          <FiDownload className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-base font-bold text-gray-900 dark:text-white">Download Database</h3>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            Export a copy of the SQLite database file
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleDownloadDatabase}
                        disabled={loading}
                        className="w-full px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 text-sm shadow-lg shadow-emerald-600/30"
                      >
                        <FiDownload className="w-4 h-4" />
                        {loading ? 'Downloading...' : 'Download Database'}
                      </button>
                    </div>

                    {/* Import Database */}
                    <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-900/20 dark:to-amber-800/10 rounded-xl p-5 border border-amber-200/50 dark:border-amber-800/30">
                      <div className="flex items-start gap-3 mb-4">
                        <div className="p-2 bg-amber-600 rounded-lg">
                          <FiUpload className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-base font-bold text-gray-900 dark:text-white">Import Database</h3>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            Upload a database file (auto-backup created)
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleImportDatabase}
                        disabled={loading}
                        className="w-full px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 text-sm shadow-lg shadow-amber-600/30"
                      >
                        <FiUpload className="w-4 h-4" />
                        {loading ? 'Processing...' : 'Import Database'}
                      </button>
                    </div>
                  </div>

                  {/* Backup Management and Reset System - Side by Side */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Backup Management */}
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-800/10 rounded-xl p-5 border border-blue-200/50 dark:border-blue-800/30">
                      <div className="flex items-start gap-3 mb-4">
                        <div className="p-2 bg-blue-600 rounded-lg">
                          <FiRefreshCw className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-base font-bold text-gray-900 dark:text-white">Backup Management</h3>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            View, restore, and manage database backups
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          loadBackups();
                          setShowBackupsModal(true);
                        }}
                        disabled={loading}
                        className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 text-sm shadow-lg shadow-blue-600/30"
                      >
                        <FiDatabase className="w-4 h-4" />
                        Manage Backups
                      </button>
                    </div>

                    {/* Danger Zone - Reset System */}
                    <div className="bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-900/20 dark:to-red-800/10 rounded-xl p-5 border border-red-200/50 dark:border-red-800/30">
                      <div className="flex items-start gap-3 mb-4">
                        <div className="p-2 bg-red-600 rounded-lg">
                          <FiTrash2 className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-base font-bold text-red-900 dark:text-red-400">Reset All System Data</h3>
                          <p className="text-xs text-red-700 dark:text-red-400 mt-1">
                            Delete all data (users preserved)
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleResetSystem}
                        disabled={loading}
                        className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 text-sm shadow-lg shadow-red-600/30"
                      >
                        <FiTrash2 className="w-4 h-4" />
                        Reset System
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Users Tab */}
          {activeTab === 'users' && (
            <div className="space-y-6">
              {/* Header Card */}
              <div className="bg-gradient-to-br from-white via-white to-purple-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-purple-900/10 rounded-xl border border-purple-200/50 dark:border-purple-800/30 shadow-md">
                <div className="px-6 py-4 bg-gradient-to-r from-purple-50 to-purple-100/50 dark:from-purple-900/20 dark:to-purple-800/10 border-b border-purple-200/50 dark:border-purple-800/30 rounded-t-xl">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-purple-600 rounded-xl">
                        <FiUsers className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">User Management</h2>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                          Manage system users and permissions
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingUser(null);
                        setUserForm({ name: '', email: '', password: '', role: 'cashier' });
                        setShowUserModal(true);
                      }}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold transition-colors flex items-center gap-2 text-sm shadow-lg shadow-emerald-600/30"
                    >
                      <FiPlus className="w-4 h-4" />
                      Create User
                    </button>
                  </div>
                </div>

                <div className="p-6">
                  {loading && users.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500" />
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">Loading users...</p>
                    </div>
                  ) : users.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-full mb-4">
                        <FiUsers className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                      </div>
                      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
                        No users found
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Create your first user to get started
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {users.map((user) => (
                        <div
                          key={user.id}
                          className="bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-700/50 dark:to-gray-700/30 rounded-xl p-4 border border-gray-200/50 dark:border-gray-600/30 hover:border-purple-200 dark:hover:border-purple-700 transition-all"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-start gap-3 flex-1">
                              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                                <FiUsers className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate">
                                    {user.name}
                                  </h3>
                                  {user.role && (
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                                      user.role === 'superadmin' 
                                        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                                        : user.role === 'admin'
                                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400'
                                    }`}>
                                      {user.role}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                                  {user.email}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-col items-center gap-2">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleEditUser(user)}
                                  className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors border border-transparent hover:border-blue-200 dark:hover:border-blue-800"
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
                                  className="p-2 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors border border-transparent hover:border-amber-200 dark:hover:border-amber-800"
                                  title="Change Password"
                                >
                                  <FiLock className="w-4 h-4" />
                                </button>
                                {user.email !== 'superadmin@pharmacy.com' && (
                                  <button
                                    onClick={() => handleDeleteUser(user.id)}
                                    className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors border border-transparent hover:border-red-200 dark:hover:border-red-800"
                                    title="Delete User"
                                  >
                                    <FiTrash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                              <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center whitespace-nowrap">
                                Created: {formatDate(user.created_at)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Licenses Tab */}
          {activeTab === 'licenses' && (
            <div className="space-y-6">
              {/* Header Card */}
              <div className="bg-gradient-to-br from-white via-white to-emerald-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-emerald-900/10 rounded-xl border border-emerald-200/50 dark:border-emerald-800/30 shadow-md">
                <div className="px-6 py-4 bg-gradient-to-r from-emerald-50 to-emerald-100/50 dark:from-emerald-900/20 dark:to-emerald-800/10 border-b border-emerald-200/50 dark:border-emerald-800/30 rounded-t-xl">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-600 rounded-xl">
                        <FiLock className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">License Management</h2>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                          Manage system licenses and activation codes
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={loadLicenses}
                      className="px-3 py-2 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors flex items-center gap-2 text-xs border border-gray-300 dark:border-gray-600"
                    >
                      <FiRefreshCw className="w-3.5 h-3.5" />
                      Refresh
                    </button>
                  </div>
                </div>

                <div className="p-6">
                  {loading && licenses.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500" />
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">Loading licenses...</p>
                    </div>
                  ) : licenses.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-full mb-4">
                        <FiLock className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                      </div>
                      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
                        No licenses found
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Activate a license key to get started
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {licenses.map((license) => (
                        <div
                          key={license.id}
                          className={`rounded-xl p-4 border transition-all ${
                            license.is_active === 1
                              ? 'bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-900/20 dark:to-emerald-800/10 border-emerald-200/50 dark:border-emerald-800/30'
                              : 'bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-700/50 dark:to-gray-700/30 border-gray-200/50 dark:border-gray-600/30'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-start gap-3 flex-1">
                              <div className={`p-2 rounded-lg ${
                                license.is_active === 1
                                  ? 'bg-emerald-600'
                                  : 'bg-gray-400'
                              }`}>
                                <FiLock className="w-5 h-5 text-white" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                                    license.is_active === 1
                                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                                      : 'bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                                  }`}>
                                    {license.is_active === 1 ? 'Active' : 'Inactive'}
                                  </span>
                                  <span className="px-2 py-0.5 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-full text-[10px] font-semibold">
                                    ID: {license.id}
                                  </span>
                                </div>
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-400 dark:text-gray-500 font-medium min-w-[80px]">Activation Code:</span>
                                    <span className="font-mono text-xs text-gray-900 dark:text-white font-semibold">
                                      {license.activation_code}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-400 dark:text-gray-500 font-medium min-w-[80px]">Activated by User ID</span>
                                    <span className="text-xs text-gray-700 dark:text-gray-300">
                                      {license.user_id}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-400 dark:text-gray-500 font-medium min-w-[80px]">Expires:</span>
                                    <span className="text-xs text-gray-700 dark:text-gray-300">
                                      {formatDate(license.expiry_date)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleEditLicense(license)}
                                className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors border border-transparent hover:border-blue-200 dark:hover:border-blue-800"
                                title="Edit License"
                              >
                                <FiEdit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteLicense(license.id)}
                                className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors border border-transparent hover:border-red-200 dark:hover:border-red-800"
                                title="Delete License"
                              >
                                <FiTrash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Generated Keys Tab - Already updated above */}

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

          {/* Generated Keys Tab */}
          {activeTab === 'generated-keys' && (
            <div className="space-y-6">
              {/* Header Card */}
              <div className="bg-gradient-to-br from-white via-white to-purple-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-purple-900/10 rounded-xl border border-purple-200/50 dark:border-purple-800/30 shadow-md">
                <div className="px-6 py-4 bg-gradient-to-r from-purple-50 to-purple-100/50 dark:from-purple-900/20 dark:to-purple-800/10 border-b border-purple-200/50 dark:border-purple-800/30 rounded-t-xl">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-purple-600 rounded-xl">
                        <FiKey className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Generated License Keys</h2>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                          Manage 14-character activation keys for pharmacy installations
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={glFilter}
                        onChange={(e) => setGlFilter(e.target.value as 'all' | 'used' | 'unused')}
                        className="text-xs border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-purple-500 outline-none"
                      >
                        <option value="all">All keys</option>
                        <option value="unused">Available</option>
                        <option value="used">Activated</option>
                      </select>
                      <button
                        type="button"
                        onClick={loadGeneratedLicenses}
                        className="px-3 py-2 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 text-xs border border-gray-300 dark:border-gray-600"
                      >
                        <FiRefreshCw className="w-3.5 h-3.5" />
                        Refresh
                      </button>
                    </div>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="p-6">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-700/50 dark:to-gray-700/30 rounded-xl p-4 border border-gray-200/50 dark:border-gray-600/30">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-gray-600 dark:bg-gray-500 rounded-lg">
                          <FiKey className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-gray-900 dark:text-white">{generatedLicenses.length}</div>
                          <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">Total Keys</div>
                        </div>
                      </div>
                    </div>
                    <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-900/20 dark:to-emerald-800/10 rounded-xl p-4 border border-emerald-200/50 dark:border-emerald-800/30">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-600 dark:bg-emerald-500 rounded-lg">
                          <FiCheck className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                            {generatedLicenses.filter((k) => k.is_used === 0).length}
                          </div>
                          <div className="text-xs text-emerald-600 dark:text-emerald-500 font-medium">Available</div>
                        </div>
                      </div>
                    </div>
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-800/10 rounded-xl p-4 border border-blue-200/50 dark:border-blue-800/30">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-600 dark:bg-blue-500 rounded-lg">
                          <FiLock className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                            {generatedLicenses.filter((k) => k.is_used === 1).length}
                          </div>
                          <div className="text-xs text-blue-600 dark:text-blue-500 font-medium">Activated</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* License Keys List */}
              {loading && generatedLicenses.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12">
                  <div className="flex flex-col items-center justify-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500" />
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">Loading license keys...</p>
                  </div>
                </div>
              ) : generatedLicenses.filter((k) => {
                  if (glFilter === 'used') return k.is_used === 1;
                  if (glFilter === 'unused') return k.is_used === 0;
                  return true;
                }).length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12">
                  <div className="flex flex-col items-center justify-center text-center">
                    <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-full mb-4">
                      <FiKey className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                    </div>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
                      No keys found
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {glFilter === 'used' ? 'No activated keys yet' : glFilter === 'unused' ? 'No available keys' : 'No license keys generated yet'}
                    </p>
                  </div>
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
                        className={`rounded-lg border transition-all ${
                          gl.is_used === 1
                            ? 'border-blue-200 dark:border-blue-800/50 bg-blue-50/30 dark:bg-blue-900/5'
                            : 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/30 dark:bg-emerald-900/5 hover:border-emerald-300 dark:hover:border-emerald-700'
                        }`}
                      >
                        <div className="p-3">
                          {/* Header: Key + Status + Actions */}
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <FiKey className={`w-4 h-4 shrink-0 ${gl.is_used === 1 ? 'text-blue-600 dark:text-blue-400' : 'text-emerald-600 dark:text-emerald-400'}`} />
                              <span className="font-mono text-sm font-bold tracking-wider text-gray-900 dark:text-white select-all">
                                {gl.code.replace(/(.{4})/g, '$1 ').trim()}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide shrink-0 ${
                                  gl.is_used === 1
                                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                    : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                                }`}
                              >
                                {gl.is_used === 1 ? 'Activated' : 'Available'}
                              </span>
                            </div>
                            
                            {/* Actions */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              {gl.is_used === 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRevokeGeneratedLicense(gl.id, gl.code)}
                                  disabled={loading}
                                  className="p-1.5 rounded-md bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-400 transition-colors disabled:opacity-50"
                                  title="Revoke"
                                >
                                  <FiRefreshCw className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeleteGeneratedLicense(gl.id)}
                                disabled={loading}
                                className="p-1.5 rounded-md bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 transition-colors disabled:opacity-50"
                                title="Delete"
                              >
                                <FiTrash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Details - Compact Grid */}
                          {(gl.pharmacy_name || gl.doctor_name || gl.email || gl.phone) && (
                            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] mb-2 pl-6">
                              {gl.pharmacy_name && (
                                <div className="flex gap-1.5">
                                  <span className="text-gray-400 dark:text-gray-500">Pharmacy:</span>
                                  <span className="text-gray-700 dark:text-gray-300 font-medium truncate">{gl.pharmacy_name}</span>
                                </div>
                              )}
                              {gl.doctor_name && (
                                <div className="flex gap-1.5">
                                  <span className="text-gray-400 dark:text-gray-500">Doctor:</span>
                                  <span className="text-gray-700 dark:text-gray-300 truncate">{gl.doctor_name}</span>
                                </div>
                              )}
                              {gl.email && (
                                <div className="flex gap-1.5">
                                  <span className="text-gray-400 dark:text-gray-500">Email:</span>
                                  <span className="text-gray-700 dark:text-gray-300 truncate">{gl.email}</span>
                                </div>
                              )}
                              {gl.phone && (
                                <div className="flex gap-1.5">
                                  <span className="text-gray-400 dark:text-gray-500">Phone:</span>
                                  <span className="text-gray-700 dark:text-gray-300">{gl.phone}</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Footer: Dates */}
                          <div className="flex items-center gap-3 text-[10px] text-gray-400 dark:text-gray-500 pl-6">
                            <span>Generated: {formatDate(gl.generated_at)}</span>
                            {gl.is_used === 1 && gl.used_at && (
                              <span className="text-blue-500 dark:text-blue-400">Activated: {formatDate(gl.used_at)}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
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
                  setUserForm({ name: '', email: '', password: '', role: 'cashier' });
                  setShowPassword(false);
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
                <select
                  value={userForm.role}
                  onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none bg-white"
                >
                  <option value="cashier">Cashier</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              {!editingUser && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={userForm.password}
                      onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 pr-10 text-gray-900 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                    >
                      {showPassword ? <FiEyeOff className="w-5 h-5" /> : <FiEye className="w-5 h-5" />}
                    </button>
                  </div>
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
                    setUserForm({ name: '', email: '', password: '', role: 'cashier' });
                    setShowPassword(false);
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
                  setShowNewPassword(false);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">New Password</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 pr-10 text-gray-900 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                  >
                    {showNewPassword ? <FiEyeOff className="w-5 h-5" /> : <FiEye className="w-5 h-5" />}
                  </button>
                </div>
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
                    setShowNewPassword(false);
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

      {/* Backup Management Modal */}
      {showBackupsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h3 className="text-2xl font-bold text-gray-900">Database Backups</h3>
                <p className="text-sm text-gray-600 mt-1">Manage timestamped database backups</p>
              </div>
              <button
                onClick={() => setShowBackupsModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <FiX className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {backups.length === 0 ? (
                <div className="text-center py-12">
                  <FiDatabase className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 font-medium">No backups found</p>
                  <p className="text-sm text-gray-400 mt-2">
                    Backups are created automatically when you import a database
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {backups.map((backup, index) => (
                    <div
                      key={backup.path}
                      className="bg-gray-50 border border-gray-200 rounded-lg p-4 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <FiDatabase className="w-5 h-5 text-blue-600 flex-shrink-0" />
                            <h4 className="font-semibold text-gray-900 truncate">
                              {backup.filename}
                            </h4>
                            {index === 0 && (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded">
                                Latest
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                            <div className="text-gray-600">
                              <span className="font-medium">Created:</span> {new Date(backup.timestamp).toLocaleString()}
                            </div>
                            <div className="text-gray-600">
                              <span className="font-medium">Size:</span> {formatFileSize(backup.size)}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRestoreBackup(backup.path, backup.filename)}
                          disabled={loading}
                          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50 flex-shrink-0"
                        >
                          <FiRefreshCw className="w-4 h-4" />
                          Restore
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-gray-200 p-6 bg-gray-50 rounded-b-xl">
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm text-gray-600">
                  <p className="font-medium">Total backups: {backups.length}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Backups are created automatically on database import
                  </p>
                </div>
                <div className="flex gap-3">
                  {backups.length > 3 && (
                    <button
                      onClick={handleCleanupBackups}
                      disabled={loading}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      <FiTrash2 className="w-4 h-4" />
                      Cleanup Old
                    </button>
                  )}
                  <button
                    onClick={() => setShowBackupsModal(false)}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reset System Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-red-200">
            {/* Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-red-50 to-red-100/50 border-b border-red-200 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-600 rounded-xl">
                  <FiTrash2 className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Reset All System Data</h3>
                  <p className="text-xs text-gray-600">This action cannot be undone</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm font-semibold text-red-800 mb-3">
                  WARNING: This will permanently delete ALL data including:
                </p>
                <ul className="space-y-1.5 text-xs text-red-700">
                  <li className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                      All Sales Records
                    </div>
                    <span className="font-semibold text-red-800">({tableCounts.sales.toLocaleString()})</span>
                  </li>
                  <li className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                      All Purchases
                    </div>
                    <span className="font-semibold text-red-800">({tableCounts.purchases.toLocaleString()})</span>
                  </li>
                  <li className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                      All Medicines
                    </div>
                    <span className="font-semibold text-red-800">({tableCounts.medicines.toLocaleString()})</span>
                  </li>
                  <li className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                      All Customers
                    </div>
                    <span className="font-semibold text-red-800">({tableCounts.customers.toLocaleString()})</span>
                  </li>
                  <li className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                      All Suppliers
                    </div>
                    <span className="font-semibold text-red-800">({tableCounts.suppliers.toLocaleString()})</span>
                  </li>
                  <li className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                      All Sale Returns
                    </div>
                    <span className="font-semibold text-red-800">({tableCounts.saleReturns.toLocaleString()})</span>
                  </li>
                </ul>
                <p className="text-xs text-red-600 mt-3 font-medium">
                  User accounts will NOT be deleted.
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Type <span className="text-red-600 font-mono">DELETE ALL DATA</span> to confirm:
                </label>
                <input
                  type="text"
                  value={resetConfirmText}
                  onChange={(e) => setResetConfirmText(e.target.value)}
                  placeholder="DELETE ALL DATA"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all font-mono"
                  autoFocus
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-b-2xl flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowResetModal(false);
                  setResetConfirmText('');
                }}
                className="px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmResetSystem}
                disabled={resetConfirmText !== 'DELETE ALL DATA'}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FiTrash2 className="w-4 h-4" />
                Reset System
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminDashboard;
