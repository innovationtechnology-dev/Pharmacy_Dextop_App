'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  FiKey,
  FiCheckCircle,
  FiXCircle,
  FiAlertTriangle,
  FiCalendar,
  FiClock,
  FiRefreshCw,
  FiShield,
} from 'react-icons/fi';
import { getAuthUser } from '../../utils/auth';
import { getLicenseStatus, getLicense, LicenseStatus, License as LicenseType } from '../../utils/license';
import LicenseActivationDialog from '../../components/license/LicenseActivationDialog';
import { useDashboardHeader } from './useDashboardHeader';

const License: React.FC = () => {
  const { setHeader } = useDashboardHeader();
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [license, setLicense] = useState<LicenseType | null>(null);
  const [loading, setLoading] = useState(true);
  const [showActivationDialog, setShowActivationDialog] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<number | null>(null);

  useEffect(() => {
    const user = getAuthUser();
    if (user) {
      setUserId(user.id);
    }
  }, []);

  useEffect(() => {
    setHeader({
      title: 'License Management',
      subtitle: 'Manage your license and activation',
    });
    return () => setHeader(null);
  }, [setHeader]);

  const loadLicenseData = useCallback(async () => {
    if (!userId) return;

    try {
      setLoading(true);
      const [status, licenseData] = await Promise.all([
        getLicenseStatus(userId),
        getLicense(userId),
      ]);
      setLicenseStatus(status);
      setLicense(licenseData);
    } catch (error) {
      // Error loading license data
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    loadLicenseData();
    // Refresh every 30 seconds
    const interval = setInterval(loadLicenseData, 30000);
    return () => clearInterval(interval);
  }, [loadLicenseData]);

  const handleActivateLicense = async (activationCode: string): Promise<{ success: boolean; error?: string }> => {
    if (!userId) {
      return { success: false, error: 'User not found' };
    }

    try {
      const { activateLicense } = await import('../../utils/license');
      const result = await activateLicense(userId, activationCode);
      if (result.success) {
        await loadLicenseData();
        setShowActivationDialog(false);
      }
      return result;
    } catch (error) {
      return { success: false, error: 'Failed to activate license' };
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadLicenseData();
  };

  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatDateTime = (dateString: string | null | undefined): string => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  const isExpired = licenseStatus?.isExpired ?? true;
  const isExpiringSoon = licenseStatus?.isExpiringSoon ?? false;
  const isActive = licenseStatus?.isActive ?? false;

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center ${
                isActive
                  ? 'bg-emerald-50 text-emerald-600'
                  : isExpired
                    ? 'bg-red-50 text-red-600'
                    : 'bg-amber-50 text-amber-600'
              }`}
            >
              {isActive ? (
                <FiCheckCircle className="w-6 h-6" />
              ) : isExpired ? (
                <FiXCircle className="w-6 h-6" />
              ) : (
                <FiAlertTriangle className="w-6 h-6" />
              )}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">License Status</h2>
              <p className="text-sm text-gray-500">
                {isActive
                  ? 'Your license is active'
                  : isExpired
                    ? 'Your license has expired'
                    : 'Your license is expiring soon'}
              </p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <FiRefreshCw className={`w-5 h-5 text-gray-600 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Status Badge */}
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">Status</p>
            <p
              className={`text-lg font-semibold ${
                isActive
                  ? 'text-emerald-600'
                  : isExpired
                    ? 'text-red-600'
                    : 'text-amber-600'
              }`}
            >
              {isActive ? 'Active' : isExpired ? 'Expired' : 'Expiring Soon'}
            </p>
          </div>

          {/* Expiry Date */}
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">Expiry Date</p>
            <p className="text-lg font-semibold text-gray-900">
              {licenseStatus?.expiryDate ? formatDate(licenseStatus.expiryDate) : 'N/A'}
            </p>
          </div>

          {/* Days Remaining */}
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">Days Remaining</p>
            <p
              className={`text-lg font-semibold ${
                licenseStatus?.daysUntilExpiry !== null && licenseStatus.daysUntilExpiry >= 0
                  ? licenseStatus.daysUntilExpiry <= 7
                    ? 'text-amber-600'
                    : 'text-emerald-600'
                  : 'text-red-600'
              }`}
            >
              {licenseStatus?.daysUntilExpiry !== null
                ? licenseStatus.daysUntilExpiry >= 0
                  ? `${licenseStatus.daysUntilExpiry} days`
                  : 'Expired'
                : 'N/A'}
            </p>
          </div>
        </div>
      </div>

      {/* License Details Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <FiShield className="w-6 h-6 text-gray-600" />
          <h2 className="text-xl font-bold text-gray-900">License Details</h2>
        </div>

        {license ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Activation Code */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <FiKey className="inline w-4 h-4 mr-1" />
                  Activation Code
                </label>
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <p className="text-sm font-mono text-gray-900">{license.activation_code}</p>
                </div>
              </div>

              {/* Activation Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <FiCalendar className="inline w-4 h-4 mr-1" />
                  Activated On
                </label>
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <p className="text-sm text-gray-900">
                    {license.created_at ? formatDateTime(license.created_at) : 'N/A'}
                  </p>
                </div>
              </div>

              {/* Expiry Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <FiClock className="inline w-4 h-4 mr-1" />
                  Expires On
                </label>
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <p className="text-sm text-gray-900">
                    {license.expiry_date ? formatDateTime(license.expiry_date) : 'N/A'}
                  </p>
                </div>
              </div>

              {/* Last Updated */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <FiRefreshCw className="inline w-4 h-4 mr-1" />
                  Last Updated
                </label>
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <p className="text-sm text-gray-900">
                    {license.updated_at ? formatDateTime(license.updated_at) : 'N/A'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <FiKey className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">No license found. Please activate your license to continue.</p>
            <button
              onClick={() => setShowActivationDialog(true)}
              className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg transition-colors"
            >
              Activate License
            </button>
          </div>
        )}
      </div>

      {/* Action Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Actions</h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setShowActivationDialog(true)}
            className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            <FiKey className="w-5 h-5" />
            {license ? 'Activate New License' : 'Activate License'}
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <FiRefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh Status
          </button>
        </div>
      </div>

      {/* Activation Dialog */}
      {showActivationDialog && (
        <LicenseActivationDialog
          onClose={() => setShowActivationDialog(false)}
          onActivate={handleActivateLicense}
          isExpired={isExpired}
        />
      )}
    </div>
  );
};

export default License;

