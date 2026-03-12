import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
} from 'react-icons/fi';
import { getAuthUser, updateProfile, setPasswordChangeRequired } from '../../utils/auth';
import { useDashboardHeader } from './useDashboardHeader';
import { PharmacySettings, defaultPharmacySettings, getStoredPharmacySettings } from '../../types/pharmacy';
import { useTheme } from '../../contexts/ThemeContext';
import { colorThemes, ColorTheme } from '../../themes/colorThemes';

type SettingsSection = 'profile' | 'pharmacy' | 'notifications' | 'security' | 'appearance';

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

const Settings: React.FC = () => {
    const [activeSection, setActiveSection] = useState<SettingsSection>('profile');
    const [user, setUser] = useState<any>(null);
    const { theme, setTheme, colorTheme, setColorTheme } = useTheme();
    const [saving, setSaving] = useState(false);

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
                    profilePicture: authUser.profilePicture || undefined,
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
                    profilePicture: profileData.profilePicture || undefined,
                });
                if (result.success) {
                    setUser(result.user ?? user);
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
        { id: 'security' as SettingsSection, label: 'Security', icon: FiShield },
        { id: 'appearance' as SettingsSection, label: 'Appearance', icon: theme === 'dark' ? FiMoon : FiSun },
    ].filter(section => {
        if (user?.role === 'cashier') {
            return ['profile', 'pharmacy', 'appearance'].includes(section.id);
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
                                            <FiPackage className="w-4 h-4"/>
                                        </label>
                                    </div>
                                    <div className="text-center md:text-left">
                                        <h4 className="text-lg font-bold text-gray-900 dark:text-white">
                                            {profileData.firstName} {profileData.lastName}
                                        </h4>
                                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2 italic">Format: JPG, PNG • Max size: 1MB</p>
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
                                        <FiBriefcase className="w-4 h-4 text-white" />
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
                        {/* Security Card */}
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
                    title: 'Security Settings',
                    subtitle: 'Protect your account with authentication controls',
                };
            case 'appearance':
                return {
                    title: 'Appearance Settings',
                    subtitle: 'Switch themes and personalize the interface',
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
    );
};

export default Settings;
