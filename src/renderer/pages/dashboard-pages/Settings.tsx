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
} from 'react-icons/fi';
import { getAuthUser } from '../../utils/auth';
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
            }
            await new Promise((resolve) => setTimeout(resolve, 500));
            alert('Settings updated successfully!');
        } catch (error) {
            alert('Failed to update settings. Please try again.');
        } finally {
            setSaving(false);
        }
    }, [activeSection, pharmacySettings]);

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
        { id: 'notifications' as SettingsSection, label: 'Notifications', icon: FiBell },
        { id: 'security' as SettingsSection, label: 'Security', icon: FiShield },
        { id: 'appearance' as SettingsSection, label: 'Appearance', icon: theme === 'dark' ? FiMoon : FiSun },
    ];

    // Toggle switch className - using template literal to properly escape quotes
    const toggleSwitchClass = `w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 dark:peer-focus:ring-emerald-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 dark:peer-checked:bg-emerald-500`;

    const renderContent = () => {
        switch (activeSection) {
            case 'profile':
                return (
                    <div className="space-y-8">
                        {/* Profile Picture */}
                        <div className="flex items-start gap-8 p-6 bg-gradient-to-br from-gray-50 to-white dark:from-gray-700/30 dark:to-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
                            <div className="relative">
                                <div className="w-24 h-24 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-3xl font-semibold">
                                    {profileData.firstName?.[0]?.toUpperCase() || 'U'}
                                    {profileData.lastName?.[0]?.toUpperCase() || ''}
                                </div>
                                {profileData.profilePicture && (
                                    <img
                                        src={profileData.profilePicture}
                                        alt="Profile"
                                        className="w-24 h-24 rounded-lg object-cover absolute top-0 left-0"
                                    />
                                )}
                            </div>
                            <div className="flex-1">
                                <label className="block mb-2">
                                    <input
                                        type="file"
                                        accept="image/jpeg,image/jpg,image/gif,image/png"
                                        onChange={handleProfilePictureChange}
                                        className="hidden"
                                        id="profile-picture-input"
                                    />
                                    <span className="inline-block px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer transition-colors">
                                        Change Photo
                                    </span>
                                </label>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">JPG, GIF or PNG. Max 1MB</p>
                            </div>
                        </div>

                        {/* Form Fields */}
                        <div className="space-y-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">
                                Personal Information
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">First Name</label>
                                    <input
                                        type="text"
                                        value={profileData.firstName}
                                        onChange={(e) => handleProfileChange('firstName', e.target.value)}
                                        className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all hover:border-gray-400 dark:hover:border-gray-500"
                                        placeholder="Enter first name"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Last Name</label>
                                    <input
                                        type="text"
                                        value={profileData.lastName}
                                        onChange={(e) => handleProfileChange('lastName', e.target.value)}
                                        className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all hover:border-gray-400 dark:hover:border-gray-500"
                                        placeholder="Enter last name"
                                    />
                                </div>
                            </div>

                            <div className="pt-4">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email Address</label>
                                <input
                                    type="email"
                                    value={profileData.email}
                                    onChange={(e) => handleProfileChange('email', e.target.value)}
                                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all hover:border-gray-400 dark:hover:border-gray-500"
                                    placeholder="Enter email address"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Phone Number</label>
                                <input
                                    type="tel"
                                    value={profileData.phone}
                                    onChange={(e) => handleProfileChange('phone', e.target.value)}
                                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all hover:border-gray-400 dark:hover:border-gray-500"
                                    placeholder="Enter phone number"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Address</label>
                                <textarea
                                    value={profileData.address}
                                    onChange={(e) => handleProfileChange('address', e.target.value)}
                                    rows={3}
                                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none resize-none transition-all hover:border-gray-400 dark:hover:border-gray-500"
                                    placeholder="Enter your address"
                                />
                            </div>
                        </div>
                    </div>
                );

            case 'pharmacy':
                return (
                    <div className="space-y-8">
                        <div className="p-6 bg-gradient-to-br from-blue-50 to-white dark:from-blue-900/20 dark:to-gray-800/50 rounded-xl border border-blue-200 dark:border-blue-800/50">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-blue-500 rounded-lg">
                                    <FiBriefcase className="w-5 h-5 text-white" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Pharmacy Information</h3>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Pharmacy Name</label>
                                    <input
                                        type="text"
                                        value={pharmacySettings.pharmacyName}
                                        onChange={(e) => handlePharmacyChange('pharmacyName', e.target.value)}
                                        className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all hover:border-gray-400 dark:hover:border-gray-500"
                                        placeholder="Enter pharmacy name"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">License Number</label>
                                    <input
                                        type="text"
                                        value={pharmacySettings.licenseNumber}
                                        onChange={(e) => handlePharmacyChange('licenseNumber', e.target.value)}
                                        className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all hover:border-gray-400 dark:hover:border-gray-500"
                                        placeholder="Enter pharmacy license number"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Address</label>
                                    <textarea
                                        value={pharmacySettings.address}
                                        onChange={(e) => handlePharmacyChange('address', e.target.value)}
                                        rows={3}
                                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none resize-none"
                                        placeholder="Enter pharmacy address"
                                    />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Phone Number</label>
                                        <input
                                            type="tel"
                                            value={pharmacySettings.phone}
                                            onChange={(e) => handlePharmacyChange('phone', e.target.value)}
                                            className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all hover:border-gray-400 dark:hover:border-gray-500"
                                            placeholder="Enter phone number"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email</label>
                                        <input
                                            type="email"
                                            value={pharmacySettings.email}
                                            onChange={(e) => handlePharmacyChange('email', e.target.value)}
                                            className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all hover:border-gray-400 dark:hover:border-gray-500"
                                            placeholder="Enter email address"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-900/20 dark:to-gray-800/50 rounded-xl border border-emerald-200 dark:border-emerald-800/50">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-emerald-500 rounded-lg">
                                    <FiDollarSign className="w-5 h-5 text-white" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Business Settings</h3>
                            </div>
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tax Rate (%)</label>
                                        <input
                                            type="number"
                                            value={pharmacySettings.taxRate}
                                            onChange={(e) => handlePharmacyChange('taxRate', parseFloat(e.target.value) || 0)}
                                            min={0}
                                            max={100}
                                            step="0.01"
                                            className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all hover:border-gray-400 dark:hover:border-gray-500"
                                            placeholder="0.00"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Currency</label>
                                        <select
                                            value={pharmacySettings.currency}
                                            onChange={(e) => handlePharmacyChange('currency', e.target.value)}
                                            className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all hover:border-gray-400 dark:hover:border-gray-500"
                                        >
                                            <option value="USD">USD ($)</option>
                                            <option value="EUR">EUR (€)</option>
                                            <option value="GBP">GBP (£)</option>
                                            <option value="PKR">PKR (Rs.)</option>
                                            <option value="INR">INR (Rs.)</option>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Low Stock Threshold</label>
                                    <input
                                        type="number"
                                        value={pharmacySettings.lowStockThreshold}
                                        onChange={(e) => handlePharmacyChange('lowStockThreshold', parseInt(e.target.value) || 0)}
                                        min={1}
                                        className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all hover:border-gray-400 dark:hover:border-gray-500"
                                        placeholder="10"
                                    />
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Get alerts when medicine stock falls below this number</p>
                                </div>

                                <div className="flex items-center justify-between p-5 bg-white dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700 rounded-xl hover:shadow-md transition-all hover:border-emerald-300 dark:hover:border-emerald-700">
                                    <div>
                                        <h4 className="font-medium text-gray-900 dark:text-white">Expired Medicines Alert</h4>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">Get notified about medicines nearing expiration</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={pharmacySettings.expiredMedicinesAlert}
                                            onChange={(e) => handlePharmacyChange('expiredMedicinesAlert', e.target.checked)}
                                            className="sr-only peer"
                                        />
                                        <div className={toggleSwitchClass}></div>
                                    </label>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 bg-gradient-to-br from-purple-50 to-white dark:from-purple-900/20 dark:to-gray-800/50 rounded-xl border border-purple-200 dark:border-purple-800/50">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-purple-500 rounded-lg">
                                    <FiPackage className="w-5 h-5 text-white" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Branding & Invoice</h3>
                            </div>
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tagline / Slogan</label>
                                        <input
                                            type="text"
                                            value={pharmacySettings.tagline}
                                            onChange={(e) => handlePharmacyChange('tagline', e.target.value)}
                                            className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all hover:border-gray-400 dark:hover:border-gray-500"
                                            placeholder="Caring for every prescription..."
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Website</label>
                                        <input
                                            type="text"
                                            value={pharmacySettings.website}
                                            onChange={(e) => handlePharmacyChange('website', e.target.value)}
                                            className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all hover:border-gray-400 dark:hover:border-gray-500"
                                            placeholder="https://yourpharmacy.com"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tax / Registration ID</label>
                                        <input
                                            type="text"
                                            value={pharmacySettings.taxId}
                                            onChange={(e) => handlePharmacyChange('taxId', e.target.value)}
                                            className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all hover:border-gray-400 dark:hover:border-gray-500"
                                            placeholder="GST / NTN / VAT number"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Logo URL (optional)</label>
                                        <input
                                            type="text"
                                            value={pharmacySettings.logoUrl}
                                            onChange={(e) => handlePharmacyChange('logoUrl', e.target.value)}
                                            className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all hover:border-gray-400 dark:hover:border-gray-500"
                                            placeholder="https://..."
                                        />
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Shown on invoices if provided.</p>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Invoice Footer Note</label>
                                    <textarea
                                        value={pharmacySettings.invoiceNotes}
                                        onChange={(e) => handlePharmacyChange('invoiceNotes', e.target.value)}
                                        rows={3}
                                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none resize-none"
                                        placeholder="Thank you for choosing us. Please call if you have any questions about your medicine."
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                );

            case 'appearance':
                return (
                    <div className="space-y-8">
                        {/* Theme Mode */}
                        <div className="p-6 bg-gradient-to-br from-gray-50 to-white dark:from-gray-700/30 dark:to-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Theme Mode</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Choose how the application looks across all screens.</p>
                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    onClick={() => handleThemeChange('light')}
                                    className={`relative p-6 border-2 rounded-xl transition-all transform hover:scale-105 ${theme === 'light'
                                        ? 'border-emerald-500 dark:border-emerald-400 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-900/40 dark:to-emerald-900/20 shadow-lg shadow-emerald-500/20'
                                        : 'border-gray-300 dark:border-gray-600 hover:border-emerald-300 dark:hover:border-emerald-700 bg-white dark:bg-gray-700/30'
                                        }`}
                                >
                                    <FiSun className={`w-8 h-8 mx-auto mb-3 ${theme === 'light' ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'}`} />
                                    <span className={`font-semibold text-base ${theme === 'light' ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-700 dark:text-gray-300'}`}>Light Mode</span>
                                    {theme === 'light' && (
                                        <div className="absolute top-2 right-2">
                                            <FiCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                        </div>
                                    )}
                                </button>
                                <button
                                    onClick={() => handleThemeChange('dark')}
                                    className={`relative p-6 border-2 rounded-xl transition-all transform hover:scale-105 ${theme === 'dark'
                                        ? 'border-emerald-500 dark:border-emerald-400 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-900/40 dark:to-emerald-900/20 shadow-lg shadow-emerald-500/20'
                                        : 'border-gray-300 dark:border-gray-600 hover:border-emerald-300 dark:hover:border-emerald-700 bg-white dark:bg-gray-700/30'
                                        }`}
                                >
                                    <FiMoon className={`w-8 h-8 mx-auto mb-3 ${theme === 'dark' ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'}`} />
                                    <span className={`font-semibold text-base ${theme === 'dark' ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-700 dark:text-gray-300'}`}>Dark Mode</span>
                                    {theme === 'dark' && (
                                        <div className="absolute top-2 right-2">
                                            <FiCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                        </div>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Theme Color */}
                        <div className="p-6 bg-gradient-to-br from-gray-50 to-white dark:from-gray-700/30 dark:to-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Theme Color</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Select an accent color that is applied across the entire application.</p>

                            {/* Color swatch cards */}
                            <div className="grid grid-cols-5 gap-3 mb-6">
                                {(Object.values(colorThemes) as typeof colorThemes[ColorTheme][]).map((t) => {
                                    const isActive = colorTheme === t.id;
                                    return (
                                        <button
                                            key={t.id}
                                            onClick={() => setColorTheme(t.id as ColorTheme)}
                                            title={t.name}
                                            className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all hover:scale-105 focus:outline-none ${
                                                isActive
                                                    ? 'border-emerald-500 dark:border-emerald-400 shadow-lg bg-white dark:bg-gray-700/50'
                                                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-gray-700/30'
                                            }`}
                                        >
                                            <span
                                                className="w-8 h-8 rounded-full ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-800 flex-shrink-0"
                                                style={{
                                                    backgroundColor: t.accent,
                                                    boxShadow: isActive ? `0 0 0 2px white, 0 0 0 4px ${t.accent}` : 'none',
                                                }}
                                            />
                                            <span className={`text-xs font-medium leading-tight text-center ${isActive ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                                                {t.name}
                                            </span>
                                            {isActive && (
                                                <div className="absolute top-1.5 right-1.5">
                                                    <FiCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Dropdown selector */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Selected Theme
                                </label>
                                <div className="relative">
                                    <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                                        <span
                                            className="w-4 h-4 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: colorThemes[colorTheme].accent }}
                                        />
                                    </div>
                                    <select
                                        value={colorTheme}
                                        onChange={(e) => setColorTheme(e.target.value as ColorTheme)}
                                        className="w-full pl-9 pr-10 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-colors"
                                    >
                                        {(Object.values(colorThemes) as typeof colorThemes[ColorTheme][]).map((t) => (
                                            <option key={t.id} value={t.id}>
                                                {t.name} — {t.description}
                                            </option>
                                        ))}
                                    </select>
                                    <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </div>
                                </div>
                                <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                                    Changes apply instantly across the entire application.
                                </p>
                            </div>
                        </div>
                    </div>
                );

            case 'notifications':
                return (
                    <div className="space-y-6">
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
                );

            case 'security':
                return (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between p-5 bg-white dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700 rounded-xl hover:shadow-md transition-all hover:border-red-300 dark:hover:border-red-700">
                            <div>
                                <h4 className="font-medium text-gray-900 dark:text-white">Two-Factor Authentication</h4>
                                <p className="text-sm text-gray-500 dark:text-gray-400">Add an extra layer of security to your account</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={security.twoFactorAuth}
                                    onChange={(e) => handleSecurityChange('twoFactorAuth', e.target.checked)}
                                    className="sr-only peer"
                                />
                                <div className={toggleSwitchClass}></div>
                            </label>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Session Timeout (minutes)
                            </label>
                            <input
                                type="number"
                                value={security.sessionTimeout}
                                onChange={(e) => handleSecurityChange('sessionTimeout', parseInt(e.target.value))}
                                min={5}
                                max={120}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                            />
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Automatically log out after period of inactivity</p>
                        </div>

                        <div className="flex items-center justify-between p-5 bg-white dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700 rounded-xl hover:shadow-md transition-all hover:border-amber-300 dark:hover:border-amber-700">
                            <div>
                                <h4 className="font-medium text-gray-900 dark:text-white">Password Change Required</h4>
                                <p className="text-sm text-gray-500 dark:text-gray-400">Require password change on next login</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={security.passwordChangeRequired}
                                    onChange={(e) => handleSecurityChange('passwordChangeRequired', e.target.checked)}
                                    className="sr-only peer"
                                />
                                <div className={toggleSwitchClass}></div>
                            </label>
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
            case 'notifications':
                return {
                    title: 'Notification Settings',
                    subtitle: 'Choose when and how the pharmacy alerts you',
                };
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
        activeSection === 'appearance';

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
                        <div className="p-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                            <div className="flex items-center gap-2 mb-1">
                                <div className="p-1.5 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg shadow-sm">
                                    <FiSettings className="w-4 h-4 text-white" />
                                </div>
                                <h2 className="text-base font-bold text-gray-900 dark:text-white">Settings</h2>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Manage your preferences</p>
                        </div>

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
