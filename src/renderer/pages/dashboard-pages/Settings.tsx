import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
    FiSettings,
    FiUser,
    FiBell,
    FiShield,
    FiCheck,
    FiMoon,
    FiSun,
    FiSave,
    FiPackage,
    FiBriefcase,
    FiDollarSign,
    FiHome,
    FiCheckCircle,
    FiTrash2,
    FiUpload,
    FiShoppingBag,
    FiShoppingCart,
    FiDownload,
    FiDatabase,
    FiInfo,
    FiLock,
    FiEye,
    FiEyeOff,
} from 'react-icons/fi';
import { getAuthUser, updateProfile, setPasswordChangeRequired, changePassword, adminResetPassword } from '../../utils/auth';
import { useDashboardHeader } from './useDashboardHeader';
import { PharmacySettings, defaultPharmacySettings, getStoredPharmacySettings } from '../../types/pharmacy';
import { useTheme } from '../../contexts/ThemeContext';
import { colorThemes, ColorTheme } from '../../themes/colorThemes';

type SettingsSection = 'profile' | 'pharmacy' | 'notifications' | 'security' | 'appearance' | 'data-management';

interface ProfileData {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address: string;
    profilePicture?: string;
}

interface NotificationSettings {
    emailNotifications: boolean;
    lowStockAlerts: boolean;
    expiredMedicinesAlerts: boolean;
    salesAlerts: boolean;
    supplierNotifications: boolean;
    dailyReports: boolean;
    weeklyReports: boolean;
}

interface SecuritySettings {
    twoFactorAuth: boolean;
    sessionTimeout: number;
    passwordChangeRequired: boolean;
}

// Password Change Form Component
const PasswordChangeForm: React.FC<{ userId?: number }> = ({ userId }) => {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [changing, setChanging] = useState(false);
    const [error, setError] = useState('');

    const handleChangePassword = async () => {
        if (!userId) {
            setError('User not found');
            return;
        }

        if (!currentPassword || !newPassword || !confirmPassword) {
            setError('All fields are required');
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('New passwords do not match');
            return;
        }

        if (newPassword.length < 6) {
            setError('New password must be at least 6 characters');
            return;
        }

        setChanging(true);
        setError('');

        try {
            const result = await changePassword(userId, currentPassword, newPassword);
            if (result.success) {
                alert('Password changed successfully!');
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
            } else {
                setError(result.error || 'Failed to change password');
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred');
        } finally {
            setChanging(false);
        }
    };

    return (
        <div className="space-y-4">
            {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                </div>
            )}

            <div>
                <label className="block text-[10px] font-bold mb-1.5 uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Current Password
                </label>
                <div className="relative">
                    <input
                        type={showCurrentPassword ? 'text' : 'password'}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full px-4 py-2 pr-10 text-xs font-semibold bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none transition-all"
                        placeholder="Enter current password"
                    />
                    <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                        {showCurrentPassword ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            <div>
                <label className="block text-[10px] font-bold mb-1.5 uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    New Password
                </label>
                <div className="relative">
                    <input
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-4 py-2 pr-10 text-xs font-semibold bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none transition-all"
                        placeholder="Enter new password (min 6 characters)"
                    />
                    <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                        {showNewPassword ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            <div>
                <label className="block text-[10px] font-bold mb-1.5 uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Confirm New Password
                </label>
                <div className="relative">
                    <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-4 py-2 pr-10 text-xs font-semibold bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none transition-all"
                        placeholder="Confirm new password"
                    />
                    <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                        {showConfirmPassword ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            <button
                onClick={handleChangePassword}
                disabled={changing}
                className="w-full px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white rounded-lg hover:from-emerald-700 hover:to-emerald-600 shadow-sm hover:shadow-md font-semibold text-xs uppercase tracking-wide disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
            >
                {changing ? (
                    <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Changing Password...</span>
                    </>
                ) : (
                    <>
                        <FiLock className="w-4 h-4" />
                        <span>Change Password</span>
                    </>
                )}
            </button>

            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-[10px] text-blue-600 dark:text-blue-400">
                    <strong>Password Requirements:</strong> Minimum 6 characters. Use a strong, unique password for better security.
                </p>
            </div>
        </div>
    );
};

// Admin Password Reset Component (for admins to reset cashier passwords)
const AdminPasswordReset: React.FC<{ adminUserId: number }> = ({ adminUserId }) => {
    const [users, setUsers] = useState<any[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        setLoading(true);
        console.log('🔄 Loading users for admin password reset...');
        try {
            const response = await new Promise<any>((resolve) => {
                window.electron.ipcRenderer.once('auth-get-all-users-reply', (data: any) => {
                    console.log('📨 Received response from backend:', data);
                    resolve(data);
                });
                console.log('📤 Sending auth-get-all-users request...');
                window.electron.ipcRenderer.sendMessage('auth-get-all-users', []);
            });

            if (response.success && Array.isArray(response.users)) {
                const filteredUsers = response.users.filter((u: any) => u.role === 'cashier');
                console.log(`✅ Loaded ${filteredUsers.length} cashier users:`, filteredUsers);
                setUsers(filteredUsers);
            } else {
                console.error('❌ Failed to load users:', response);
                setUsers([]);
            }
        } catch (err) {
            console.error('❌ Error loading users:', err);
            setUsers([]);
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (userId: number) => {
        if (!newPassword || !confirmPassword) {
            setError('All fields are required');
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        if (newPassword.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        setResetting(true);
        setError('');

        try {
            const result = await adminResetPassword(adminUserId, userId, newPassword);
            if (result.success) {
                alert('Password reset successfully! The cashier can now login with the new password.');
                setSelectedUserId(null);
                setNewPassword('');
                setConfirmPassword('');
            } else {
                setError(result.error || 'Failed to reset password');
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred');
        } finally {
            setResetting(false);
        }
    };

    const handleCancelReset = () => {
        setSelectedUserId(null);
        setNewPassword('');
        setConfirmPassword('');
        setError('');
        setShowNewPassword(false);
        setShowConfirmPassword(false);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <div className="flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">Loading cashier users...</span>
                </div>
            </div>
        );
    }

    if (users.length === 0) {
        return (
            <div className="text-center py-8">
                <FiUser className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-sm text-gray-600 dark:text-gray-400">No cashier users found</p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Create cashier accounts to manage them here</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                </div>
            )}

            {/* Cashier Users Table */}
            <div className="overflow-hidden border border-gray-200 dark:border-gray-700 rounded-lg">
                <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-700/50">
                        <tr>
                            <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                                Cashier Name
                            </th>
                            <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                                Email
                            </th>
                            <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                                Role
                            </th>
                            <th className="px-4 py-3 text-center text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                                Action
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {users.map((user) => (
                            <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                <td className="px-4 py-3 text-xs font-semibold text-gray-900 dark:text-white">
                                    {user.name}
                                </td>
                                <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
                                    {user.email}
                                </td>
                                <td className="px-4 py-3">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                                        {user.role}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <button
                                        onClick={() => setSelectedUserId(user.id)}
                                        disabled={resetting}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded text-[10px] font-semibold uppercase tracking-wide transition-colors disabled:opacity-50"
                                    >
                                        <FiLock className="w-3 h-3" />
                                        Change Password
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Password Reset Modal */}
            {selectedUserId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-md mx-4 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700">
                        {/* Modal Header */}
                        <div className="px-6 py-4 bg-gradient-to-r from-orange-50 to-orange-100/50 dark:from-orange-900/20 dark:to-orange-800/10 border-b border-orange-200/50 dark:border-orange-800/30 rounded-t-xl">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600">
                                        <FiLock className="w-5 h-5 text-white" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                                            Reset Password
                                        </h3>
                                        <p className="text-[10px] text-gray-600 dark:text-gray-400 mt-0.5">
                                            {users.find(u => u.id === selectedUserId)?.name}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleCancelReset}
                                    disabled={resetting}
                                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Modal Content */}
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-[10px] font-bold mb-1.5 uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                    New Password
                                </label>
                                <div className="relative">
                                    <input
                                        type={showNewPassword ? 'text' : 'password'}
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="w-full px-4 py-2 pr-10 text-xs font-semibold bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 outline-none transition-all"
                                        placeholder="Enter new password (min 6 characters)"
                                        autoFocus
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowNewPassword(!showNewPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                    >
                                        {showNewPassword ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold mb-1.5 uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                    Confirm New Password
                                </label>
                                <div className="relative">
                                    <input
                                        type={showConfirmPassword ? 'text' : 'password'}
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="w-full px-4 py-2 pr-10 text-xs font-semibold bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 outline-none transition-all"
                                        placeholder="Confirm new password"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                    >
                                        {showConfirmPassword ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                                <p className="text-[10px] text-amber-700 dark:text-amber-400">
                                    <strong>Note:</strong> The cashier can use the new password immediately.
                                </p>
                            </div>

                            {/* Modal Actions */}
                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={handleCancelReset}
                                    disabled={resetting}
                                    className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 font-semibold text-xs uppercase tracking-wide disabled:opacity-50 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => handleResetPassword(selectedUserId)}
                                    disabled={resetting}
                                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-orange-600 to-orange-500 text-white rounded-lg hover:from-orange-700 hover:to-orange-600 shadow-sm hover:shadow-md font-semibold text-xs uppercase tracking-wide disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
                                >
                                    {resetting ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            <span>Resetting...</span>
                                        </>
                                    ) : (
                                        <>
                                            <FiShield className="w-4 h-4" />
                                            <span>Reset Password</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Database Backup/Restore Component
const DatabaseBackupRestore: React.FC = () => {
    const [downloading, setDownloading] = useState(false);
    const [importing, setImporting] = useState(false);

    const handleDownloadDatabase = async () => {
        if (downloading) return;
        
        const confirmed = window.confirm(
            'Download a copy of your database?\n\nThis will save your entire database to a file that you can import later.'
        );
        
        if (!confirmed) return;

        setDownloading(true);
        try {
            const result = await new Promise<{ success: boolean; path?: string; error?: string }>((resolve) => {
                window.electron.ipcRenderer.once('super-admin-download-database-reply', (response: any) => {
                    resolve(response);
                });
                window.electron.ipcRenderer.sendMessage('super-admin-download-database', []);
            });

            if (result.success) {
                alert(`Database downloaded successfully!\n\nSaved to: ${result.path}`);
            } else {
                if (result.error !== 'Save cancelled') {
                    alert(`Download failed: ${result.error || 'Unknown error'}`);
                }
            }
        } catch (error: any) {
            console.error('Error downloading database:', error);
            alert(`Download failed: ${error.message || 'Unknown error'}`);
        } finally {
            setDownloading(false);
        }
    };

    const handleImportDatabase = async () => {
        if (importing) return;
        
        const confirmed = window.confirm(
            '⚠️ WARNING: Import Database?\n\n' +
            'This will REPLACE your current database with the imported file.\n' +
            'All current data will be LOST!\n\n' +
            'A timestamped backup will be created automatically before importing.\n\n' +
            'Are you absolutely sure you want to continue?'
        );
        
        if (!confirmed) return;

        setImporting(true);
        try {
            const result = await new Promise<{ 
                success: boolean; 
                error?: string;
                summary?: {
                    users: number;
                    medicines: number;
                    customers: number;
                    sales: number;
                    purchases: number;
                    payments: number;
                };
            }>((resolve) => {
                window.electron.ipcRenderer.once('super-admin-import-database-reply', (response: any) => {
                    resolve(response);
                });
                window.electron.ipcRenderer.sendMessage('super-admin-import-database', []);
            });

            if (result.success) {
                let message = 'Database imported successfully!\n\n';
                if (result.summary) {
                    message += `Imported:\n`;
                    message += `- Users: ${result.summary.users}\n`;
                    message += `- Medicines: ${result.summary.medicines}\n`;
                    message += `- Customers: ${result.summary.customers}\n`;
                    message += `- Sales: ${result.summary.sales}\n`;
                    message += `- Purchases: ${result.summary.purchases}\n`;
                    message += `- Payments: ${result.summary.payments}\n\n`;
                }
                message += 'The application will now reload to apply changes.';
                
                alert(message);
                // Reload the application
                window.location.reload();
            } else {
                if (result.error !== 'Import cancelled') {
                    alert(`Import failed: ${result.error || 'Unknown error'}`);
                }
            }
        } catch (error: any) {
            console.error('Error importing database:', error);
            alert(`Import failed: ${error.message || 'Unknown error'}`);
        } finally {
            setImporting(false);
        }
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-gradient-to-r from-emerald-50 to-emerald-100/50 dark:from-emerald-900/20 dark:to-emerald-800/10 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                    <FiDatabase className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">Database Download & Import</h3>
                </div>
            </div>
            
            <div className="p-4 space-y-4">
                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-3">
                    <button
                        type="button"
                        onClick={handleDownloadDatabase}
                        disabled={downloading}
                        className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg transition-colors text-sm font-medium ${
                            importing
                                ? 'bg-gray-400 cursor-not-allowed'
                                : 'bg-emerald-600 hover:bg-emerald-700'
                        } text-white`}
                    >
                        {downloading ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                <span>Downloading...</span>
                            </>
                        ) : (
                            <>
                                <FiDownload className="w-4 h-4" />
                                <span>Download Database</span>
                            </>
                        )}
                    </button>

                    <button
                        type="button"
                        onClick={handleImportDatabase}
                        disabled={importing}
                        className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg transition-colors text-sm font-medium ${
                            downloading
                                ? 'bg-gray-400 cursor-not-allowed'
                                : 'bg-orange-600 hover:bg-orange-700'
                        } text-white`}
                    >
                        {importing ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                <span>Importing...</span>
                            </>
                        ) : (
                            <>
                                <FiUpload className="w-4 h-4" />
                                <span>Import Database</span>
                            </>
                        )}
                    </button>
                </div>

                {/* Help Text */}
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <p className="text-xs text-blue-900 dark:text-blue-100 leading-relaxed">
                        <strong>Download:</strong> Saves a complete copy of your database to a file.
                        <br />
                        <strong>Import:</strong> Replaces your current database with a previously downloaded file. A backup is created automatically before importing.
                    </p>
                </div>
            </div>
        </div>
    );
};

const Settings: React.FC = () => {
    const location = useLocation();
    const [activeSection, setActiveSection] = useState<SettingsSection>('profile');

    useEffect(() => {
        if (location.state?.section) {
            setActiveSection(location.state.section as SettingsSection);
        }
    }, [location.state]);

    const [user, setUser] = useState<any>(null);
    const { theme, setTheme, colorTheme, setColorTheme } = useTheme();
    const [saving, setSaving] = useState(false);

    // Data Management states
    const [showDeleteMedicineModal, setShowDeleteMedicineModal] = useState(false);
    const [showDeleteSaleModal, setShowDeleteSaleModal] = useState(false);
    const [showDeletePurchaseModal, setShowDeletePurchaseModal] = useState(false);
    const [medicines, setMedicines] = useState<any[]>([]);
    const [sales, setSales] = useState<any[]>([]);
    const [purchases, setPurchases] = useState<any[]>([]);
    const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
    const [deleting, setDeleting] = useState(false);

    const [profileData, setProfileData] = useState<ProfileData>({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        address: '',
    });

    const [pharmacySettings, setPharmacySettings] = useState<PharmacySettings>({
        ...defaultPharmacySettings,
    });

    const [notifications, setNotifications] = useState<NotificationSettings>({
        emailNotifications: true,
        lowStockAlerts: true,
        expiredMedicinesAlerts: true,
        salesAlerts: true,
        supplierNotifications: true,
        dailyReports: false,
        weeklyReports: true,
    });

    const [security, setSecurity] = useState<SecuritySettings>({
        twoFactorAuth: false,
        sessionTimeout: 30,
        passwordChangeRequired: false,
    });

    useEffect(() => {
        const fetchUser = async () => {
            const authUser = await getAuthUser();
            if (authUser) {
                setUser(authUser);
                setProfileData({
                    firstName: authUser.firstName || authUser.name?.split(' ')[0] || '',
                    lastName: authUser.lastName || authUser.name?.split(' ').slice(1).join(' ') || '',
                    email: authUser.email || '',
                    phone: authUser.phone || '',
                    address: authUser.address || '',
                    profilePicture: authUser.profilePicture || '',
                });

                // Fetch full user data to get security settings
                window.electron.ipcRenderer.sendMessage('auth-get-user', [authUser.id]);
                window.electron.ipcRenderer.once('auth-get-user-reply', (fullUser: any) => {
                    if (fullUser) {
                        setSecurity(prev => ({
                            ...prev,
                            passwordChangeRequired: fullUser.passwordChangeRequired || false
                        }));
                    }
                });
            }
        };
        fetchUser();

        // Load pharmacy settings from localStorage
        setPharmacySettings(getStoredPharmacySettings());
    }, []);

    // Load medicines when modal opens
    useEffect(() => {
        if (showDeleteMedicineModal) {
            loadMedicines();
        }
    }, [showDeleteMedicineModal]);

    // Load sales when modal opens
    useEffect(() => {
        if (showDeleteSaleModal) {
            loadSales();
        }
    }, [showDeleteSaleModal]);

    // Load purchases when modal opens
    useEffect(() => {
        if (showDeletePurchaseModal) {
            loadPurchases();
        }
    }, [showDeletePurchaseModal]);

    const handleThemeChange = (newTheme: 'light' | 'dark') => {
        setTheme(newTheme);
    };

    const handleProfileChange = (field: keyof ProfileData, value: string) => {
        setProfileData((prev) => ({ ...prev, [field]: value }));
    };

    const handlePharmacyChange = (field: keyof PharmacySettings, value: string | number | boolean) => {
        setPharmacySettings((prev) => ({ ...prev, [field]: value }));
    };

    const handleNotificationChange = (field: keyof NotificationSettings, value: boolean) => {
        setNotifications((prev) => ({ ...prev, [field]: value }));
    };

    const handleSecurityChange = (field: keyof SecuritySettings, value: boolean | number) => {
        setSecurity((prev) => ({ ...prev, [field]: value }));
    };

    const { setHeader } = useDashboardHeader();

    // Data Management handlers
    const loadMedicines = async () => {
        window.electron.ipcRenderer.sendMessage('medicine-get-all', []);
        window.electron.ipcRenderer.once('medicine-get-all-reply', (...args: unknown[]) => {
            const response = args[0] as any;
            if (response?.success && Array.isArray(response.data)) {
                setMedicines(response.data);
            } else {
                setMedicines([]);
            }
        });
    };

    const loadSales = async () => {
        window.electron.ipcRenderer.sendMessage('sale-get-all', []);
        window.electron.ipcRenderer.once('sale-get-all-reply', (...args: unknown[]) => {
            const response = args[0] as any;
            if (response?.success && Array.isArray(response.data)) {
                setSales(response.data);
            } else {
                setSales([]);
            }
        });
    };

    const loadPurchases = async () => {
        window.electron.ipcRenderer.sendMessage('purchase-get-all', []);
        window.electron.ipcRenderer.once('purchase-get-all-reply', (...args: unknown[]) => {
            const response = args[0] as any;
            if (response?.success && Array.isArray(response.data)) {
                setPurchases(response.data);
            } else {
                setPurchases([]);
            }
        });
    };

    const handleDeleteMedicine = async () => {
        if (selectedItemIds.length === 0) return;
        if (!confirm(`Are you sure you want to delete ${selectedItemIds.length} medicine(s)? This action cannot be undone.`)) return;
        
        setDeleting(true);
        let successCount = 0;
        let errorCount = 0;

        for (const id of selectedItemIds) {
            await new Promise<void>((resolve) => {
                window.electron.ipcRenderer.sendMessage('medicine-delete', [id]);
                window.electron.ipcRenderer.once('medicine-delete-reply', (...args: unknown[]) => {
                    const result = args[0] as any;
                    if (result.success) {
                        successCount++;
                    } else {
                        errorCount++;
                    }
                    resolve();
                });
            });
        }

        setDeleting(false);
        if (successCount > 0) {
            alert(`Successfully deleted ${successCount} medicine(s)${errorCount > 0 ? `, ${errorCount} failed` : ''}`);
            setShowDeleteMedicineModal(false);
            setSelectedItemIds([]);
            loadMedicines();
        } else {
            alert('Failed to delete medicines');
        }
    };

    const handleDeleteSale = async () => {
        if (selectedItemIds.length === 0) return;
        if (!confirm(`Are you sure you want to delete ${selectedItemIds.length} sale(s)? This will restore inventory.`)) return;
        
        setDeleting(true);
        let successCount = 0;
        let errorCount = 0;

        for (const id of selectedItemIds) {
            await new Promise<void>((resolve) => {
                window.electron.ipcRenderer.sendMessage('sale-delete', [id, user?.role]);
                window.electron.ipcRenderer.once('sale-delete-reply', (...args: unknown[]) => {
                    const result = args[0] as any;
                    if (result.success) {
                        successCount++;
                    } else {
                        errorCount++;
                        // Show specific error message for permission issues
                        if (result.error && result.error.includes('only delete sales from today')) {
                            console.error(`Sale #${id}: ${result.error}`);
                        }
                    }
                    resolve();
                });
            });
        }

        setDeleting(false);
        if (successCount > 0) {
            alert(`Successfully deleted ${successCount} sale(s)${errorCount > 0 ? `, ${errorCount} failed (check console for details)` : ''}`);
            setShowDeleteSaleModal(false);
            setSelectedItemIds([]);
            loadSales();
        } else {
            alert('Failed to delete sales. You may only delete today\'s sales.');
        }
    };

    const handleDeletePurchase = async () => {
        if (selectedItemIds.length === 0) return;
        if (!confirm(`Are you sure you want to delete ${selectedItemIds.length} purchase(s)? This will adjust inventory.`)) return;
        
        setDeleting(true);
        let successCount = 0;
        let errorCount = 0;

        for (const id of selectedItemIds) {
            await new Promise<void>((resolve) => {
                window.electron.ipcRenderer.sendMessage('purchase-delete', [id, user?.role]);
                window.electron.ipcRenderer.once('purchase-delete-reply', (...args: unknown[]) => {
                    const result = args[0] as any;
                    if (result.success) {
                        successCount++;
                    } else {
                        errorCount++;
                        // Show specific error message for permission issues
                        if (result.error && result.error.includes('only delete purchases from today')) {
                            console.error(`Purchase #${id}: ${result.error}`);
                        }
                    }
                    resolve();
                });
            });
        }

        setDeleting(false);
        if (successCount > 0) {
            alert(`Successfully deleted ${successCount} purchase(s)${errorCount > 0 ? `, ${errorCount} failed (check console for details)` : ''}`);
            setShowDeletePurchaseModal(false);
            setSelectedItemIds([]);
            loadPurchases();
        } else {
            alert('Failed to delete purchases. You may only delete today\'s purchases.');
        }
    };

    // Multi-select helper functions
    const toggleItemSelection = (id: number) => {
        setSelectedItemIds(prev => 
            prev.includes(id) ? prev.filter(itemId => itemId !== id) : [...prev, id]
        );
    };

    const toggleSelectAll = (items: any[]) => {
        if (selectedItemIds.length === items.length) {
            setSelectedItemIds([]);
        } else {
            setSelectedItemIds(items.map(item => item.id));
        }
    };

    const handleSave = useCallback(async () => {
        setSaving(true);
        try {
            if (activeSection === 'pharmacy') {
                localStorage.setItem('pharmacySettings', JSON.stringify(pharmacySettings));
                await new Promise((resolve) => setTimeout(resolve, 500));
                alert('Settings updated successfully!');
            } else if (activeSection === 'profile' && user?.id) {
                const fullName = [profileData.firstName, profileData.lastName].filter(Boolean).join(' ').trim() || user.name;
                const result = await updateProfile(user.id, {
                    name: fullName,
                    email: profileData.email,
                    phone: profileData.phone || undefined,
                    address: profileData.address || undefined,
                    profilePicture: profileData.profilePicture,
                });
                if (result.success) {
                    setUser(result.user ?? user);
                    // Dispatch custom event to notify other components
                    window.dispatchEvent(new CustomEvent('user-profile-updated', { detail: result.user }));
                    alert('Profile updated successfully!');
                } else {
                    alert(result.error || 'Failed to update profile.');
                }
            } else if (activeSection === 'security' && user?.id) {
                const result = await setPasswordChangeRequired(user.id, security.passwordChangeRequired);
                if (result.success) {
                    alert('Security settings updated successfully!');
                } else {
                    alert(result.error || 'Failed to update security settings.');
                }
            } else {
                await new Promise((resolve) => setTimeout(resolve, 500));
                alert('Settings updated successfully!');
            }
        } catch (error) {
            alert('Failed to update settings. Please try again.');
        } finally {
            setSaving(false);
        }
    }, [activeSection, pharmacySettings, profileData, user, security]);

    const handleProfilePictureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 1024 * 1024) {
                alert('File size must be less than 1MB');
                return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
                setProfileData((prev) => ({ ...prev, profilePicture: reader.result as string }));
            };
            reader.readAsDataURL(file);
        }
    };

    const settingsSections = [
        { id: 'profile' as SettingsSection, label: 'Profile', icon: FiUser },
        { id: 'pharmacy' as SettingsSection, label: 'Pharmacy', icon: FiHome },
        // { id: 'notifications' as SettingsSection, label: 'Notifications', icon: FiBell },
        { id: 'security' as SettingsSection, label: 'Users & Security', icon: FiShield },
        { id: 'appearance' as SettingsSection, label: 'Appearance', icon: theme === 'dark' ? FiMoon : FiSun },
        { id: 'data-management' as SettingsSection, label: 'Data Management', icon: FiTrash2 },
    ].filter(section => {
        if (user?.role === 'cashier') {
            return ['profile', 'pharmacy', 'appearance', 'security'].includes(section.id);
        }
        // Only admin can access data-management
        if (section.id === 'data-management' && user?.role !== 'admin') {
            return false;
        }
        return true;
    });

    // Toggle switch className - using template literal to properly escape quotes
    const toggleSwitchClass = `w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 dark:peer-focus:ring-emerald-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 dark:peer-checked:bg-emerald-500`;

    const renderContent = () => {
        switch (activeSection) {
            case 'profile':
                return (
                    <div className="space-y-6 animate-fadeIn">
                        {/* Profile Identity Card */}
                        <div className="bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md transition-all">
                            {/* Header */}
                            <div className="px-4 py-2 bg-gradient-to-r from-purple-50 to-purple-100/50 dark:from-purple-900/20 dark:to-purple-800/10 border-b border-blue-200/50 dark:border-blue-800/30">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600">
                                        <FiUser className="w-4 h-4 text-white" />
                                    </div>
                                    <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wide">
                                        Account Identity
                                    </h3>
                                </div>
                            </div>
                            {/* Content */}
                            <div className="p-6">
                                <div className="flex flex-col md:flex-row items-center gap-8 mb-8 pb-6 border-b border-gray-100 dark:border-gray-700">
                                    <div className="relative group" title="Upload Profile Picture">
                                        <div className="w-28 h-28 rounded-2xl bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white text-4xl font-bold shadow-lg shadow-purple-200 dark:shadow-none overflow-hidden border-4 border-white dark:border-gray-700">
                                            {profileData.profilePicture ? (
                                                <img
                                                    src={profileData.profilePicture}
                                                    alt="Profile"
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <span>
                                                    {profileData.firstName?.[0]?.toUpperCase() || 'U'}
                                                    {profileData.lastName?.[0]?.toUpperCase() || ''}
                                                </span>
                                            )}
                                        </div>
                                        <label className="absolute -bottom-2 -right-2 bg-emerald-500 hover:bg-emerald-600 text-white p-2 rounded-lg shadow-lg cursor-pointer transition-all transform hover:scale-110">
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={handleProfilePictureChange}
                                                className="hidden"
                                            />
                                            <FiUpload className="w-4 h-4"/>
                                        </label>
                                    </div>
                                    <div className="text-center md:text-left">
                                        <h4 className="text-lg font-bold text-gray-900 dark:text-white">
                                            {profileData.firstName} {profileData.lastName}
                                        </h4>
                                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2 italic">Format: JPG, PNG • Max size: 1MB</p>
                                        {profileData.profilePicture && (
                                            <button
                                                type="button"
                                                onClick={() => setProfileData(prev => ({ ...prev, profilePicture: '' }))}
                                                className="mt-3 flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 text-[10px] font-bold rounded-lg border border-red-200 dark:border-red-800 transition-all group"
                                            >
                                                <FiTrash2 className="w-3 h-3 group-hover:scale-110 transition-transform" />
                                                Remove Photo
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <div>
                                        <label className="block text-[10px] font-bold mb-1.5 uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                            First Name
                                        </label>
                                        <input
                                            type="text"
                                            value={profileData.firstName}
                                            onChange={(e) => handleProfileChange('firstName', e.target.value)}
                                            className="w-full px-4 py-2 text-xs font-semibold bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 outline-none transition-all"
                                            placeholder="Enter first name"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold mb-1.5 uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                            Last Name
                                        </label>
                                        <input
                                            type="text"
                                            value={profileData.lastName}
                                            onChange={(e) => handleProfileChange('lastName', e.target.value)}
                                            className="w-full px-4 py-2 text-xs font-semibold bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 outline-none transition-all"
                                            placeholder="Enter last name"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold mb-1.5 uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                            Email Address
                                        </label>
                                        <input
                                            type="email"
                                            value={profileData.email}
                                            onChange={(e) => handleProfileChange('email', e.target.value)}
                                            className="w-full px-4 py-2 text-xs font-semibold bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 outline-none transition-all"
                                            placeholder="Enter email address"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold mb-1.5 uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                            Phone Number
                                        </label>
                                        <input
                                            type="tel"
                                            value={profileData.phone}
                                            onChange={(e) => handleProfileChange('phone', e.target.value)}
                                            className="w-full px-4 py-2 text-xs font-semibold bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 outline-none transition-all"
                                            placeholder="Enter phone number"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-[10px] font-bold mb-1.5 uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                            Home Address
                                        </label>
                                        <textarea
                                            value={profileData.address}
                                            onChange={(e) => handleProfileChange('address', e.target.value)}
                                            rows={2}
                                            className="w-full px-4 py-2 text-xs font-semibold bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 outline-none transition-all resize-none"
                                            placeholder="Enter your permanent address"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );

            case 'pharmacy':
                return (
                    <div className="space-y-6 animate-fadeIn">
                        {/* Pharmacy Info Card */}
                        <div className="bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md transition-all">
                            {/* Header */}
                            <div className="px-4 py-2 bg-gradient-to-r from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-800/10 border-b border-blue-200/50 dark:border-blue-800/30">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600">
                                        <FiShoppingCart className="w-4 h-4 text-white" />
                                    </div>
                                    <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wide">
                                        Establishment Profile
                                    </h3>
                                </div>
                            </div>
                            {/* Content */}
                            <div className="p-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                                    <div>
                                        <label className="block text-[10px] font-bold mb-1.5 uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                            Pharmacy Name
                                        </label>
                                        <input
                                            type="text"
                                            value={pharmacySettings.pharmacyName}
                                            onChange={(e) => handlePharmacyChange('pharmacyName', e.target.value)}
                                            className="w-full px-4 py-2 text-xs font-semibold bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none transition-all"
                                            placeholder="Enter pharmacy name"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold mb-1.5 uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                            License Number
                                        </label>
                                        <input
                                            type="text"
                                            value={pharmacySettings.licenseNumber}
                                            onChange={(e) => handlePharmacyChange('licenseNumber', e.target.value)}
                                            className="w-full px-4 py-2 text-xs font-semibold bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none transition-all"
                                            placeholder="REG-XXX-XXX"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold mb-1.5 uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                            Contact Phone
                                        </label>
                                        <input
                                            type="tel"
                                            value={pharmacySettings.phone}
                                            onChange={(e) => handlePharmacyChange('phone', e.target.value)}
                                            className="w-full px-4 py-2 text-xs font-semibold bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none transition-all"
                                            placeholder="Support line"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold mb-1.5 uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                            Official Email
                                        </label>
                                        <input
                                            type="email"
                                            value={pharmacySettings.email}
                                            onChange={(e) => handlePharmacyChange('email', e.target.value)}
                                            className="w-full px-4 py-2 text-xs font-semibold bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none transition-all"
                                            placeholder="billing@pharmacy.com"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-[10px] font-bold mb-1.5 uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                            Business Address
                                        </label>
                                        <textarea
                                            value={pharmacySettings.address}
                                            onChange={(e) => handlePharmacyChange('address', e.target.value)}
                                            rows={2}
                                            className="w-full px-4 py-2 text-xs font-semibold bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none transition-all resize-none"
                                            placeholder="Store physical location"
                                        />
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                                    <label className="block text-[10px] font-bold mb-1.5 uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        Operational Currency
                                    </label>
                                    <div className="relative">
                                        <FiDollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
                                        <select
                                            value={pharmacySettings.currency}
                                            onChange={(e) => handlePharmacyChange('currency', e.target.value)}
                                            className="w-full pl-9 pr-4 py-2 text-xs font-bold bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded outline-none appearance-none focus:ring-2 focus:ring-blue-500/30"
                                        >
                                            <option value="PKR">PKR (Rs.) - Pakistani Rupee</option>
                                            <option value="USD">USD ($) - US Dollar</option>
                                            <option value="EUR">EUR (€) - Euro</option>
                                            <option value="GBP">GBP (£) - British Pound</option>
                                            <option value="INR">INR (Rs.) - Indian Rupee</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Branding Card */}
                        <div className="bg-gradient-to-br from-white via-white to-emerald-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-emerald-900/10 rounded-lg border border-emerald-200/50 dark:border-emerald-800/30 shadow-md transition-all">
                            {/* Header */}
                            <div className="px-4 py-2 bg-gradient-to-r from-emerald-50 to-emerald-100/50 dark:from-emerald-900/20 dark:to-emerald-800/10 border-b border-emerald-200/50 dark:border-emerald-800/30">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600">
                                        <FiPackage className="w-4 h-4 text-white" />
                                    </div>
                                    <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wide">
                                        Branding & Invoice
                                    </h3>
                                </div>
                            </div>
                            {/* Content */}
                            <div className="p-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-6">
                                    <div>
                                        <label className="block text-[10px] font-bold mb-1.5 uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                            Brand Tagline
                                        </label>
                                        <input
                                            type="text"
                                            value={pharmacySettings.tagline}
                                            onChange={(e) => handlePharmacyChange('tagline', e.target.value)}
                                            className="w-full px-4 py-2 text-xs font-semibold bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none transition-all"
                                            placeholder="Slogan for header"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold mb-1.5 uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                            Website URL
                                        </label>
                                        <input
                                            type="text"
                                            value={pharmacySettings.website}
                                            onChange={(e) => handlePharmacyChange('website', e.target.value)}
                                            className="w-full px-4 py-2 text-xs font-semibold bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none transition-all"
                                            placeholder="https://..."
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold mb-1.5 uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                            Tax / Registration ID
                                        </label>
                                        <input
                                            type="text"
                                            value={pharmacySettings.taxId}
                                            onChange={(e) => handlePharmacyChange('taxId', e.target.value)}
                                            className="w-full px-4 py-2 text-xs font-semibold bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none transition-all"
                                            placeholder="GST / NTN / VAT number"
                                        />
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row items-center gap-6 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-200 dark:border-gray-600 mb-6">
                                    <div className="w-20 h-20 rounded-xl bg-white dark:bg-gray-800 flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 overflow-hidden shadow-inner flex-shrink-0">
                                        {pharmacySettings.logoUrl ? (
                                            <img src={pharmacySettings.logoUrl} alt="Branding" className="w-full h-full object-contain p-2" />
                                        ) : (
                                            <FiPackage className="w-8 h-8 text-gray-300" />
                                        )}
                                    </div>
                                    <div className="flex-1 text-center sm:text-left">
                                        <h5 className="text-xs font-bold text-gray-900 dark:text-white mb-1">Pharmacy Logo</h5>
                                        <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-3">Visible on receipts and PDF exports</p>
                                        <div className="flex flex-wrap justify-center sm:justify-start gap-3">
                                            <label className="px-3 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-[10px] font-bold text-gray-700 dark:text-gray-200 rounded hover:bg-emerald-50 cursor-pointer shadow-sm transition-all">
                                                Upload Image
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={(e) => {
                                                        const file = e.target.files?.[0];
                                                        if (file) {
                                                            if (file.size > 500 * 1024) {
                                                                alert('Logo should be under 500 KB for best performance.');
                                                                return;
                                                            }
                                                            const reader = new FileReader();
                                                            reader.onloadend = () => handlePharmacyChange('logoUrl', reader.result as string);
                                                            reader.readAsDataURL(file);
                                                        }
                                                    }}
                                                    className="hidden"
                                                />
                                            </label>
                                            {pharmacySettings.logoUrl && (
                                                <button
                                                    onClick={() => handlePharmacyChange('logoUrl', '')}
                                                    className="px-3 py-1.5 text-[10px] font-bold text-red-600 hover:text-red-700"
                                                >
                                                    Remove Logo
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400 italic">JPG/PNG, max 500 KB. Click Save Changes (top right) after uploading.</p>
                                </div>

                                {/* Low Stock Alerts Toggle */}
                                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-200 dark:border-gray-600">
                                    <div>
                                        <h5 className="text-xs font-bold text-gray-900 dark:text-white">Low Stock Alerts</h5>
                                        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                                            Show alerts in the bell icon and Alerts page when medicine stock falls below minimum level.
                                        </p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer ml-4 flex-shrink-0">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={pharmacySettings.lowStockAlertsEnabled ?? true}
                                            onChange={(e) => handlePharmacyChange('lowStockAlertsEnabled', e.target.checked)}
                                        />
                                        <div className={toggleSwitchClass} />
                                    </label>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold mb-1.5 uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        Invoice Footer Remarks
                                    </label>
                                    <textarea
                                        value={pharmacySettings.invoiceNotes}
                                        onChange={(e) => handlePharmacyChange('invoiceNotes', e.target.value)}
                                        rows={2}
                                        className="w-full px-4 py-2 text-xs font-semibold bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none transition-all resize-none"
                                        placeholder="Note at the bottom of customer receipts"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                );

            case 'appearance':
                return (
                    <div className="space-y-6 animate-fadeIn">
                        {/* Theme Mode Card */}
                        <div className="bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md transition-all">
                            {/* Header */}
                            <div className="px-4 py-2 bg-gradient-to-r from-green-50 to-green-100/50 dark:from-blue-900/20 dark:to-blue-800/10 border-b border-blue-200/50 dark:border-blue-800/30">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600">
                                        <FiSun className="w-4 h-4 text-white" />
                                    </div>
                                    <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wide">
                                        Theme Configuration
                                    </h3>
                                </div>
                            </div>
                            {/* Content */}
                            <div className="p-4">
                                <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-4">
                                    Select viewing mode
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <button
                                        onClick={() => handleThemeChange('light')}
                                        className={`group relative p-4 border rounded-lg transition-all flex items-center gap-4 ${
                                            theme === 'light'
                                                ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500 shadow-sm'
                                                : 'bg-white dark:bg-gray-700/50 border-gray-200 dark:border-gray-600 hover:border-emerald-300'
                                        }`}
                                    >
                                        <div className={`p-3 rounded-lg transition-colors ${
                                            theme === 'light' ? 'bg-emerald-500 text-white' : 'bg-gray-100 dark:bg-gray-600 text-gray-400 group-hover:bg-emerald-100 group-hover:text-emerald-500'
                                        }`}>
                                            <FiSun className="w-6 h-6" />
                                        </div>
                                        <div className="text-left">
                                            <div className={`text-sm font-bold ${theme === 'light' ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-700 dark:text-gray-200'}`}>Light Universe</div>
                                            <div className="text-[10px] text-gray-500 dark:text-gray-400">Clean and bright workspace</div>
                                        </div>
                                        {theme === 'light' && (
                                            <FiCheckCircle className="absolute top-2 right-2 w-4 h-4 text-emerald-600" />
                                        )}
                                    </button>

                                    <button
                                        onClick={() => handleThemeChange('dark')}
                                        className={`group relative p-4 border rounded-lg transition-all flex items-center gap-4 ${
                                            theme === 'dark'
                                                ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500 shadow-sm'
                                                : 'bg-white dark:bg-gray-700/50 border-gray-200 dark:border-gray-600 hover:border-emerald-300'
                                        }`}
                                    >
                                        <div className={`p-3 rounded-lg transition-colors ${
                                            theme === 'dark' ? 'bg-emerald-500 text-white' : 'bg-gray-100 dark:bg-gray-600 text-gray-400 group-hover:bg-emerald-100 group-hover:text-emerald-500'
                                        }`}>
                                            <FiMoon className="w-6 h-6" />
                                        </div>
                                        <div className="text-left">
                                            <div className={`text-sm font-bold ${theme === 'dark' ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-700 dark:text-gray-200'}`}>Dark Nebula</div>
                                            <div className="text-[10px] text-gray-500 dark:text-gray-400">Sleek and eye-friendly</div>
                                        </div>
                                        {theme === 'dark' && (
                                            <FiCheckCircle className="absolute top-2 right-2 w-4 h-4 text-emerald-600" />
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Accent Color Card */}
                        <div className="bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md transition-all">
                            {/* Header */}
                            <div className="px-4 py-2 bg-gradient-to-r from-green-50 to-green-100/50 dark:from-blue-900/20 dark:to-blue-800/10 border-b border-blue-200/50 dark:border-blue-800/30">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600">
                                        <div className="w-4 h-4 rounded-full border-2 border-white"></div>
                                    </div>
                                    <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wide">
                                        Accent Customization
                                    </h3>
                                </div>
                            </div>
                            {/* Content */}
                            <div className="p-4">
                                <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-4">
                                    System primary color
                                </p>
                                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
                                    {(Object.values(colorThemes) as typeof colorThemes[ColorTheme][]).map((t) => {
                                        const isActive = colorTheme === t.id;
                                        return (
                                            <button
                                                key={t.id}
                                                onClick={() => setColorTheme(t.id as ColorTheme)}
                                                className={`group relative flex flex-col items-center gap-2 p-3 border rounded-lg transition-all ${
                                                    isActive
                                                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 shadow-sm scale-105 z-10'
                                                        : 'bg-white dark:bg-gray-700/50 border-gray-200 dark:border-gray-600 hover:border-blue-300'
                                                }`}
                                            >
                                                <div 
                                                    className={`w-8 h-8 rounded-full border-2 shadow-sm transition-transform group-hover:scale-110 ${
                                                        isActive ? 'border-white ring-2 ring-blue-500' : 'border-transparent'
                                                    }`}
                                                    style={{ backgroundColor: t.accent }}
                                                />
                                                <span className={`text-[10px] font-bold ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'}`}>
                                                    {t.name}
                                                </span>
                                                {isActive && (
                                                    <div className="absolute -top-1.5 -right-1.5 bg-blue-500 text-white rounded-full p-0.5 shadow-md">
                                                        <FiCheckCircle className="w-3 h-3" />
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Selection Details (Styled like report inputs) */}
                                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                                    <label className="block text-[10px] font-bold mb-2 uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        Color Profile Info
                                    </label>
                                    <div className="flex items-center gap-3 p-3 bg-white dark:bg-gray-700/30 border border-gray-200 dark:border-gray-600 rounded-md">
                                        <div className="w-10 h-10 rounded-lg shadow-inner flex-shrink-0" style={{ backgroundColor: colorThemes[colorTheme].accent }}></div>
                                        <div>
                                            <div className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-tight">
                                                {colorThemes[colorTheme].name} Mode Active
                                            </div>
                                            <p className="text-[10px] text-gray-500 dark:text-gray-400 italic">
                                                {colorThemes[colorTheme].description}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );

            /* case 'notifications':
                return (
                    <div className="space-y-4">
                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-5 bg-white dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700 rounded-xl hover:shadow-md transition-all hover:border-emerald-300 dark:hover:border-emerald-700">
                                <div>
                                    <h4 className="font-medium text-gray-900 dark:text-white">Email Notifications</h4>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Receive notifications via email</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={notifications.emailNotifications}
                                        onChange={(e) => handleNotificationChange('emailNotifications', e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className={toggleSwitchClass}></div>
                                </label>
                            </div>

                            <div className="flex items-center justify-between p-5 bg-white dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700 rounded-xl hover:shadow-md transition-all hover:border-emerald-300 dark:hover:border-emerald-700">
                                <div>
                                    <h4 className="font-medium text-gray-900 dark:text-white">Low Stock Alerts</h4>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Get notified when medicine stock is running low</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={notifications.lowStockAlerts}
                                        onChange={(e) => handleNotificationChange('lowStockAlerts', e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className={toggleSwitchClass}></div>
                                </label>
                            </div>

                            <div className="flex items-center justify-between p-5 bg-white dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700 rounded-xl hover:shadow-md transition-all hover:border-emerald-300 dark:hover:border-emerald-700">
                                <div>
                                    <h4 className="font-medium text-gray-900 dark:text-white">Expired Medicines Alerts</h4>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Get notified about expired or expiring medicines</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={notifications.expiredMedicinesAlerts}
                                        onChange={(e) => handleNotificationChange('expiredMedicinesAlerts', e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className={toggleSwitchClass}></div>
                                </label>
                            </div>

                            <div className="flex items-center justify-between p-5 bg-white dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700 rounded-xl hover:shadow-md transition-all hover:border-emerald-300 dark:hover:border-emerald-700">
                                <div>
                                    <h4 className="font-medium text-gray-900 dark:text-white">Sales Alerts</h4>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Get notified about daily sales and transactions</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={notifications.salesAlerts}
                                        onChange={(e) => handleNotificationChange('salesAlerts', e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className={toggleSwitchClass}></div>
                                </label>
                            </div>

                            <div className="flex items-center justify-between p-5 bg-white dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700 rounded-xl hover:shadow-md transition-all hover:border-emerald-300 dark:hover:border-emerald-700">
                                <div>
                                    <h4 className="font-medium text-gray-900 dark:text-white">Supplier Notifications</h4>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Get notified about supplier orders and deliveries</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={notifications.supplierNotifications}
                                        onChange={(e) => handleNotificationChange('supplierNotifications', e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className={toggleSwitchClass}></div>
                                </label>
                            </div>

                            <div className="flex items-center justify-between p-5 bg-white dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700 rounded-xl hover:shadow-md transition-all hover:border-emerald-300 dark:hover:border-emerald-700">
                                <div>
                                    <h4 className="font-medium text-gray-900 dark:text-white">Daily Reports</h4>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Receive daily summary reports via email</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={notifications.dailyReports}
                                        onChange={(e) => handleNotificationChange('dailyReports', e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className={toggleSwitchClass}></div>
                                </label>
                            </div>

                            <div className="flex items-center justify-between p-5 bg-white dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700 rounded-xl hover:shadow-md transition-all hover:border-emerald-300 dark:hover:border-emerald-700">
                                <div>
                                    <h4 className="font-medium text-gray-900 dark:text-white">Weekly Reports</h4>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Receive weekly summary reports via email</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={notifications.weeklyReports}
                                        onChange={(e) => handleNotificationChange('weeklyReports', e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className={toggleSwitchClass}></div>
                                </label>
                            </div>
                        </div>
                    </div>
                ); */

            case 'security':
                return (
                    <div className="space-y-6 animate-fadeIn">
                        {/* User Management Section - Only for Admins */}
                        {user?.role === 'admin' && (
                            <>
                                <div className="mb-4">
                                    <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                        <FiUser className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                                        User Management
                                    </h2>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        Manage user accounts and reset passwords
                                    </p>
                                </div>

                                {/* Admin Password Reset Card */}
                                <div className="bg-gradient-to-br from-white via-white to-orange-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-orange-900/10 rounded-lg border border-orange-200/50 dark:border-orange-800/30 shadow-md transition-all">
                                    {/* Header */}
                                    <div className="px-4 py-2 bg-gradient-to-r from-orange-50 to-orange-100/50 dark:from-orange-900/20 dark:to-orange-800/10 border-b border-orange-200/50 dark:border-orange-800/30">
                                        <div className="flex items-center gap-2">
                                            <div className="p-1.5 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600">
                                                <FiShield className="w-4 h-4 text-white" />
                                            </div>
                                            <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wide">
                                                Reset Cashier Password
                                            </h3>
                                        </div>
                                    </div>
                                    {/* Content */}
                                    <div className="p-6">
                                        <AdminPasswordReset adminUserId={user?.id} />
                                    </div>
                                </div>

                                {/* Divider */}
                                <div className="border-t border-gray-200 dark:border-gray-700 my-8"></div>
                            </>
                        )}

                        {/* Security Section */}
                        <div className="mb-4">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <FiShield className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                Security
                            </h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Protect your account with password and authentication controls
                            </p>
                        </div>

                        {/* Password Change Card */}
                        <div className="bg-gradient-to-br from-white via-white to-emerald-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-emerald-900/10 rounded-lg border border-emerald-200/50 dark:border-emerald-800/30 shadow-md transition-all">
                            {/* Header */}
                            <div className="px-4 py-2 bg-gradient-to-r from-emerald-50 to-emerald-100/50 dark:from-emerald-900/20 dark:to-emerald-800/10 border-b border-emerald-200/50 dark:border-emerald-800/30">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600">
                                        <FiLock className="w-4 h-4 text-white" />
                                    </div>
                                    <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wide">
                                        Change Your Password
                                    </h3>
                                </div>
                            </div>
                            {/* Content */}
                            <div className="p-6">
                                <PasswordChangeForm userId={user?.id} />
                            </div>
                        </div>

                        {/* Security Settings Card */}
                        <div className="bg-gradient-to-br from-white via-white to-amber-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-amber-900/10 rounded-lg border border-amber-200/50 dark:border-amber-800/30 shadow-md transition-all">
                            {/* Header */}
                            <div className="px-4 py-2 bg-gradient-to-r from-amber-50 to-amber-100/50 dark:from-amber-900/20 dark:to-amber-800/10 border-b border-amber-200/50 dark:border-amber-800/30">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600">
                                        <FiShield className="w-4 h-4 text-white" />
                                    </div>
                                    <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wide">
                                        Access & Protection
                                    </h3>
                                </div>
                            </div>
                            {/* Content */}
                            <div className="p-6">
                                <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg hover:border-amber-400 transition-all group">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-amber-50 dark:bg-amber-900/30 text-amber-600 rounded-xl group-hover:scale-110 transition-transform">
                                            <FiShield className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-gray-900 dark:text-white">Mandatory Password Rotation</h4>
                                            <p className="text-[10px] text-gray-500 dark:text-gray-400">Force user to change password on their next login session</p>
                                        </div>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={security.passwordChangeRequired}
                                            onChange={(e) => handleSecurityChange('passwordChangeRequired', e.target.checked)}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-amber-500"></div>
                                    </label>
                                </div>

                                <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                                    <div className="flex gap-3">
                                        <FiShield className="w-5 h-5 text-blue-500 flex-shrink-0" />
                                        <div>
                                            <h5 className="text-[11px] font-bold text-blue-800 dark:text-blue-300 uppercase">Security Note</h5>
                                            <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-1">
                                                Changes to security settings are logged for auditing purposes. Ensure you notify relevant staff members before toggling mandatory password resets.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );

            case 'data-management':
                return (
                    <div className="space-y-4 animate-fadeIn">
                        {/* Warning Banner */}
                        <div className="bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                            <div className="flex items-start gap-3">
                                <FiShield className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                                <div>
                                    <h4 className="text-sm font-bold text-red-900 dark:text-red-100 mb-1">Admin Only - Danger Zone</h4>
                                    <p className="text-xs text-red-700 dark:text-red-300">
                                        These actions permanently delete data and cannot be undone. Use with extreme caution.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Database Backup/Restore Section */}
                        <DatabaseBackupRestore />

                        {/* Delete Cards Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Delete Medicine Card */}
                            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                                <div className="px-4 py-3 bg-gradient-to-r from-purple-50 to-purple-100/50 dark:from-purple-900/20 dark:to-purple-800/10 border-b border-gray-200 dark:border-gray-700">
                                    <div className="flex items-center gap-2">
                                        <FiPackage className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                                        <h3 className="text-sm font-bold text-gray-900 dark:text-white">Delete Medicine</h3>
                                    </div>
                                </div>
                                <div className="p-4">
                                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
                                        Permanently remove medicine(s) from the system.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (showDeleteMedicineModal) {
                                                setShowDeleteMedicineModal(false);
                                                setSelectedItemIds([]);
                                            } else {
                                                loadMedicines();
                                                setShowDeleteMedicineModal(true);
                                            }
                                        }}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium w-full justify-center ${
                                            showDeleteMedicineModal
                                                ? 'bg-gray-500 hover:bg-gray-600 text-white'
                                                : 'bg-red-600 hover:bg-red-700 text-white'
                                        }`}
                                    >
                                        <FiTrash2 className="w-4 h-4" />
                                        {showDeleteMedicineModal ? 'Cancel' : 'Delete Medicine'}
                                    </button>
                                </div>
                            </div>

                            {/* Delete Sale Card */}
                            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                                <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-800/10 border-b border-gray-200 dark:border-gray-700">
                                    <div className="flex items-center gap-2">
                                        <FiShoppingBag className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                        <h3 className="text-sm font-bold text-gray-900 dark:text-white">Delete Sale</h3>
                                    </div>
                                </div>
                                <div className="p-4">
                                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
                                        Permanently remove sale transaction(s).
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (showDeleteSaleModal) {
                                                setShowDeleteSaleModal(false);
                                                setSelectedItemIds([]);
                                            } else {
                                                loadSales();
                                                setShowDeleteSaleModal(true);
                                            }
                                        }}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium w-full justify-center ${
                                            showDeleteSaleModal
                                                ? 'bg-gray-500 hover:bg-gray-600 text-white'
                                                : 'bg-red-600 hover:bg-red-700 text-white'
                                        }`}
                                    >
                                        <FiTrash2 className="w-4 h-4" />
                                        {showDeleteSaleModal ? 'Cancel' : 'Delete Sale'}
                                    </button>
                                </div>
                            </div>

                            {/* Delete Purchase Card */}
                            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                                <div className="px-4 py-3 bg-gradient-to-r from-green-50 to-green-100/50 dark:from-green-900/20 dark:to-green-800/10 border-b border-gray-200 dark:border-gray-700">
                                    <div className="flex items-center gap-2">
                                        <FiShoppingCart className="w-4 h-4 text-green-600 dark:text-green-400" />
                                        <h3 className="text-sm font-bold text-gray-900 dark:text-white">Delete Purchase</h3>
                                    </div>
                                </div>
                                <div className="p-4">
                                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
                                        Permanently remove purchase transaction(s).
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (showDeletePurchaseModal) {
                                                setShowDeletePurchaseModal(false);
                                                setSelectedItemIds([]);
                                            } else {
                                                loadPurchases();
                                                setShowDeletePurchaseModal(true);
                                            }
                                        }}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium w-full justify-center ${
                                            showDeletePurchaseModal
                                                ? 'bg-gray-500 hover:bg-gray-600 text-white'
                                                : 'bg-red-600 hover:bg-red-700 text-white'
                                        }`}
                                    >
                                        <FiTrash2 className="w-4 h-4" />
                                        {showDeletePurchaseModal ? 'Cancel' : 'Delete Purchase'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Inline Delete Medicine Section */}
                        {showDeleteMedicineModal && (
                            <div className="bg-white dark:bg-gray-800 rounded-lg border-2 border-purple-300 dark:border-purple-700 shadow-lg animate-fadeIn">
                                <div className="px-6 py-4 bg-gradient-to-r from-purple-50 to-purple-100/50 dark:from-purple-900/20 dark:to-purple-800/10 border-b border-purple-200 dark:border-purple-700">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <FiPackage className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                                            <h3 className="text-base font-bold text-gray-900 dark:text-white">Select Medicines to Delete</h3>
                                        </div>
                                        <span className="text-sm text-gray-600 dark:text-gray-400">
                                            {selectedItemIds.length} selected
                                        </span>
                                    </div>
                                </div>
                                <div className="p-6">
                                    {!Array.isArray(medicines) || medicines.length === 0 ? (
                                        <p className="text-center text-gray-500 dark:text-gray-400 py-8">No medicines found</p>
                                    ) : (
                                        <>
                                            <div className="mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
                                                <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 px-3 py-2 rounded-lg transition-colors">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedItemIds.length === medicines.length && medicines.length > 0}
                                                        onChange={() => toggleSelectAll(medicines)}
                                                        className="w-4 h-4 text-purple-600 rounded focus:ring-2 focus:ring-purple-500"
                                                    />
                                                    <span className="font-medium text-gray-900 dark:text-white">
                                                        Select All ({medicines.length})
                                                    </span>
                                                </label>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
                                                {medicines.map((medicine) => (
                                                    <label
                                                        key={medicine.id}
                                                        className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                                                            selectedItemIds.includes(medicine.id)
                                                                ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                                                                : 'border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700'
                                                        }`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedItemIds.includes(medicine.id)}
                                                            onChange={() => toggleItemSelection(medicine.id)}
                                                            className="w-4 h-4 text-purple-600 rounded focus:ring-2 focus:ring-purple-500"
                                                        />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="font-medium text-gray-900 dark:text-white truncate">{medicine.name}</div>
                                                            <div className="text-xs text-gray-500 dark:text-gray-400">ID: {medicine.id}</div>
                                                        </div>
                                                    </label>
                                                ))}
                                            </div>
                                            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                                                <button
                                                    onClick={handleDeleteMedicine}
                                                    disabled={selectedItemIds.length === 0 || deleting}
                                                    className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                                                >
                                                    {deleting ? 'Deleting...' : `Delete ${selectedItemIds.length > 0 ? `(${selectedItemIds.length})` : ''}`}
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Inline Delete Sale Section */}
                        {showDeleteSaleModal && (
                            <div className="bg-white dark:bg-gray-800 rounded-lg border-2 border-blue-300 dark:border-blue-700 shadow-lg animate-fadeIn">
                                <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-800/10 border-b border-blue-200 dark:border-blue-700">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <FiShoppingBag className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                            <h3 className="text-base font-bold text-gray-900 dark:text-white">Select Sales to Delete</h3>
                                        </div>
                                        <span className="text-sm text-gray-600 dark:text-gray-400">
                                            {selectedItemIds.length} selected
                                        </span>
                                    </div>
                                </div>
                                <div className="p-6">
                                    {!Array.isArray(sales) || sales.length === 0 ? (
                                        <p className="text-center text-gray-500 dark:text-gray-400 py-8">No sales found</p>
                                    ) : (
                                        <>
                                            <div className="mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
                                                <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 px-3 py-2 rounded-lg transition-colors">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedItemIds.length === sales.length && sales.length > 0}
                                                        onChange={() => toggleSelectAll(sales)}
                                                        className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                                                    />
                                                    <span className="font-medium text-gray-900 dark:text-white">
                                                        Select All ({sales.length})
                                                    </span>
                                                </label>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
                                                {sales.map((sale) => (
                                                    <label
                                                        key={sale.id}
                                                        className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                                                            selectedItemIds.includes(sale.id)
                                                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                                                : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700'
                                                        }`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedItemIds.includes(sale.id)}
                                                            onChange={() => toggleItemSelection(sale.id)}
                                                            className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                                                        />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <div className="font-medium text-gray-900 dark:text-white">Sale #{sale.id}</div>
                                                                <div className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                                                    {new Date(sale.createdAt).toLocaleDateString()}
                                                                </div>
                                                            </div>
                                                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                                                ${Number(sale.total).toFixed(2)}
                                                            </div>
                                                        </div>
                                                    </label>
                                                ))}
                                            </div>
                                            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                                                <button
                                                    onClick={handleDeleteSale}
                                                    disabled={selectedItemIds.length === 0 || deleting}
                                                    className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                                                >
                                                    {deleting ? 'Deleting...' : `Delete ${selectedItemIds.length > 0 ? `(${selectedItemIds.length})` : ''}`}
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Inline Delete Purchase Section */}
                        {showDeletePurchaseModal && (
                            <div className="bg-white dark:bg-gray-800 rounded-lg border-2 border-green-300 dark:border-green-700 shadow-lg animate-fadeIn">
                                <div className="px-6 py-4 bg-gradient-to-r from-green-50 to-green-100/50 dark:from-green-900/20 dark:to-green-800/10 border-b border-green-200 dark:border-green-700">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <FiShoppingCart className="w-5 h-5 text-green-600 dark:text-green-400" />
                                            <h3 className="text-base font-bold text-gray-900 dark:text-white">Select Purchases to Delete</h3>
                                        </div>
                                        <span className="text-sm text-gray-600 dark:text-gray-400">
                                            {selectedItemIds.length} selected
                                        </span>
                                    </div>
                                </div>
                                <div className="p-6">
                                    {!Array.isArray(purchases) || purchases.length === 0 ? (
                                        <p className="text-center text-gray-500 dark:text-gray-400 py-8">No purchases found</p>
                                    ) : (
                                        <>
                                            <div className="mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
                                                <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 px-3 py-2 rounded-lg transition-colors">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedItemIds.length === purchases.length && purchases.length > 0}
                                                        onChange={() => toggleSelectAll(purchases)}
                                                        className="w-4 h-4 text-green-600 rounded focus:ring-2 focus:ring-green-500"
                                                    />
                                                    <span className="font-medium text-gray-900 dark:text-white">
                                                        Select All ({purchases.length})
                                                    </span>
                                                </label>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
                                                {purchases.map((purchase) => (
                                                    <label
                                                        key={purchase.id}
                                                        className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                                                            selectedItemIds.includes(purchase.id)
                                                                ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                                                                : 'border-gray-200 dark:border-gray-700 hover:border-green-300 dark:hover:border-green-700'
                                                        }`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedItemIds.includes(purchase.id)}
                                                            onChange={() => toggleItemSelection(purchase.id)}
                                                            className="w-4 h-4 text-green-600 rounded focus:ring-2 focus:ring-green-500"
                                                        />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <div className="font-medium text-gray-900 dark:text-white">Purchase #{purchase.id}</div>
                                                                <div className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                                                    {purchase.createdAt ? new Date(purchase.createdAt).toLocaleDateString() : 'N/A'}
                                                                </div>
                                                            </div>
                                                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                                                ${Number(purchase.grandTotal).toFixed(2)} | {purchase.supplierName || 'N/A'}
                                                            </div>
                                                        </div>
                                                    </label>
                                                ))}
                                            </div>
                                            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                                                <button
                                                    onClick={handleDeletePurchase}
                                                    disabled={selectedItemIds.length === 0 || deleting}
                                                    className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                                                >
                                                    {deleting ? 'Deleting...' : `Delete ${selectedItemIds.length > 0 ? `(${selectedItemIds.length})` : ''}`}
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                );

            default:
                return null;
        }
    };

    const sectionMeta = useMemo(() => {
        switch (activeSection) {
            case 'profile':
                return {
                    title: 'Profile Information',
                    subtitle: 'Manage your personal details and contact information',
                };
            case 'pharmacy':
                return {
                    title: 'Pharmacy Settings',
                    subtitle: 'Configure business details and operational preferences',
                };
            /* case 'notifications':
                return {
                    title: 'Notification Settings',
                    subtitle: 'Choose when and how the pharmacy alerts you',
                }; */
            case 'security':
                return {
                    title: 'Users & Security Settings',
                    subtitle: 'Manage users and protect accounts with authentication controls',
                };
            case 'appearance':
                return {
                    title: 'Appearance Settings',
                    subtitle: 'Switch themes and personalize the interface',
                };
            case 'data-management':
                return {
                    title: 'Data Management',
                    subtitle: 'Delete medicines, sales, and purchases (Admin Only)',
                };
            default:
                return {
                    title: 'Settings',
                    subtitle: 'Manage your account and pharmacy preferences',
                };
        }
    }, [activeSection]);

    const canSave =
        activeSection === 'profile' ||
        activeSection === 'pharmacy' ||
        activeSection === 'appearance' ||
        activeSection === 'security';

    const headerActions = useMemo(() => {
        if (!canSave) {
            return null;
        }

        return (
            <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 bg-emerald-600 dark:bg-emerald-500 text-white rounded-lg hover:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {saving ? (
                    <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Saving...
                    </>
                ) : (
                    <>
                        <FiSave className="w-4 h-4" />
                        Save Changes
                    </>
                )}
            </button>
        );
    }, [canSave, handleSave, saving]);

    useEffect(() => {
        setHeader({
            title: sectionMeta.title,
            subtitle: sectionMeta.subtitle,
            actions: headerActions,
        });

        return () => setHeader(null);
    }, [setHeader, sectionMeta, headerActions]);

    return (
        <>
            <div className="w-full h-full flex flex-col overflow-hidden min-h-0">
                <div className="flex-1 overflow-hidden flex min-h-0">
                    {/* Left Sidebar - Fixed Width */}
                    <div className="w-64 flex-shrink-0 h-full flex flex-col">
                        <div className="bg-gradient-to-br from-white via-white to-gray-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-gray-800/90 border-r border-gray-200 dark:border-gray-700 h-full flex flex-col overflow-hidden">


                        <nav className="flex-1 overflow-y-auto p-1.5 space-y-1 min-h-0">
                            {settingsSections.map((section) => {
                                const Icon = section.icon;
                                const isActive = activeSection === section.id;
                                return (
                                    <button
                                        key={section.id}
                                        onClick={() => setActiveSection(section.id)}
                                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg transition-all group text-left ${isActive
                                            ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 dark:from-emerald-500 dark:to-emerald-600 text-white shadow-md'
                                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 border border-transparent'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <Icon className={`w-4 h-4 transition-transform ${isActive ? 'text-white' : 'text-gray-500 dark:text-gray-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400'} ${isActive ? 'scale-110' : ''}`} />
                                            <span className="font-medium text-sm">{section.label}</span>
                                        </div>
                                        {isActive && (
                                            <div className="p-0.5 bg-white/20 rounded-full">
                                                <FiCheck className="w-3.5 h-3.5 text-white" />
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </nav>
                    </div>
                </div>

                {/* Right Content Panel */}
                <div className="flex-1 min-w-0 overflow-hidden flex flex-col h-full">
                    <div className="bg-gradient-to-br from-white via-white to-gray-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-gray-800/90 h-full flex flex-col overflow-hidden">
                        <div className="flex-1 overflow-hidden min-h-0">
                            <div className="p-3 h-full overflow-y-auto">
                                {renderContent()}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

    </div>
    </>)
};

export default Settings;
