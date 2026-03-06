'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  FiKey,
  FiCheckCircle,
  FiAlertTriangle,
  FiCalendar,
  FiClock,
  FiRefreshCw,
  FiShield,
  FiFileText,
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
      subtitle: 'Analyze and manage your system activation status',
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
      <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)]">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-4 border-emerald-500/20"></div>
          <div className="absolute inset-0 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin"></div>
        </div>
        <p className="mt-4 text-emerald-600 dark:text-emerald-400 font-bold text-sm tracking-widest uppercase">Verifying License...</p>
      </div>
    );
  }

  const isExpired = licenseStatus?.isExpired ?? true;
  const isExpiringSoon = licenseStatus?.isExpiringSoon ?? false;
  const isActive = licenseStatus?.isActive ?? false;

  return (
    <div className="flex flex-col h-auto md:h-[calc(100vh-80px)] w-full bg-gradient-to-br from-gray-50 via-gray-50 to-gray-100/50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800/80 overflow-visible md:overflow-hidden px-4 pb-4 md:pb-0">
      
      {/* Stats Header Row */}
      <div className="bg-gradient-to-br from-white via-white to-gray-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-gray-800/90 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-3 mb-2 flex flex-wrap items-center gap-3">
        
        {/* Status Stat */}
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border shadow-sm ${
            isActive 
              ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-600/50' 
              : isExpired 
                ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-600/50'
                : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-600/50'
          }`}>
            <FiShield className={`w-3.5 h-3.5 ${
              isActive ? 'text-emerald-500' : isExpired ? 'text-red-500' : 'text-amber-500'
            }`} />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              Status
            </span>
            <span className={`text-xs font-bold ml-1 ${
              isActive ? 'text-emerald-600 dark:text-emerald-400' : isExpired ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
            }`}>
              {isActive ? 'Verified' : isExpired ? 'Expired' : 'Warning'}
            </span>
          </div>
        </div>

        {/* Days Left Stat */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1.5 rounded-md border border-blue-200 dark:border-blue-600/50 shadow-sm">
            <FiClock className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              Validity
            </span>
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 ml-1">
              {licenseStatus && licenseStatus.daysUntilExpiry !== null
                ? licenseStatus.daysUntilExpiry >= 0
                  ? `${licenseStatus.daysUntilExpiry} Days Left`
                  : 'Terminated'
                : 'Unlimited'}
            </span>
          </div>
        </div>

        {/* Expiry Stat */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-purple-50 dark:bg-purple-900/20 px-2.5 py-1.5 rounded-md border border-purple-200 dark:border-purple-600/50 shadow-sm">
            <FiCalendar className="w-3.5 h-3.5 text-purple-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              Expiry
            </span>
            <span className="text-xs font-bold text-purple-600 dark:text-purple-400 ml-1">
              {licenseStatus?.expiryDate ? formatDate(licenseStatus.expiryDate) : ' Perpetual'}
            </span>
          </div>
        </div>

        {/* Refresh Button */}
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="ml-auto px-3 py-1.5 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-xs font-semibold rounded-md transition-colors uppercase tracking-wide flex items-center gap-1.5 shadow-sm disabled:opacity-50"
        >
          <FiRefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Sync
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col md:flex-row gap-3 flex-1 overflow-hidden min-h-0">
        
        {/* Left Side: Status Visualization */}
        <div className="w-full md:w-1/3 flex flex-col overflow-hidden min-h-0">
          <div className="bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md flex-1 flex flex-col">
            <div className={`px-4 py-3 border-b flex items-center gap-3 ${
              isActive 
                ? 'bg-gradient-to-r from-emerald-50 to-emerald-100/50 dark:from-emerald-900/20 dark:to-emerald-800/10 border-emerald-200/50 dark:border-emerald-800/30'
                : 'bg-gradient-to-r from-amber-50 to-amber-100/50 dark:from-amber-900/20 dark:to-amber-800/10 border-amber-200/50 dark:border-amber-800/30'
            }`}>
              <div className={`p-1.5 rounded-lg bg-gradient-to-br ${isActive ? 'from-emerald-500 to-emerald-600' : 'from-amber-500 to-amber-600'}`}>
                <FiCheckCircle className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wide">System Activation Status</h3>
            </div>

            <div className="flex-1 p-6 flex flex-col items-center justify-center text-center">
              <div className="relative mb-6">
                <div className={`w-32 h-32 rounded-full border-8 flex items-center justify-center transition-all duration-700 ${
                  isActive 
                    ? 'border-emerald-500/20 dark:border-emerald-500/10' 
                    : isExpired 
                      ? 'border-red-500/20 dark:border-red-500/10'
                      : 'border-amber-500/20 dark:border-amber-500/10'
                }`}>
                  <div className={`w-24 h-24 rounded-full flex items-center justify-center shadow-inner ${
                    isActive 
                      ? 'bg-emerald-500 text-white shadow-emerald-900/20' 
                      : isExpired 
                        ? 'bg-red-500 text-white shadow-red-900/20'
                        : 'bg-amber-500 text-white shadow-amber-900/20'
                  }`}>
                    {isActive ? <FiShield className="w-12 h-12" /> : <FiAlertTriangle className="w-12 h-12" />}
                  </div>
                  
                  {/* Pulse Effect */}
                  {isActive && (
                    <div className="absolute inset-0 rounded-full border-4 border-emerald-500 animate-[ping_2s_ease-in-out_infinite] opacity-20"></div>
                  )}
                </div>
              </div>

              <h2 className={`text-xl font-bold mb-2 ${
                isActive ? 'text-emerald-600 dark:text-emerald-400' : isExpired ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
              }`}>
                {isActive ? 'License Active' : isExpired ? 'License Expired' : 'Urgent: Expiry Near'}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 px-6 font-medium">
                {isActive 
                  ? 'Your system is fully activated and receiving security updates.' 
                  : isExpired 
                    ? 'Features are locked. Please provide a new activation key.'
                    : 'System will require re-activation shortly to maintain full functionality.'}
              </p>

              <div className="mt-8 w-full space-y-3">
                <button
                  onClick={() => setShowActivationDialog(true)}
                  className={`w-full py-3 rounded-lg font-bold text-sm uppercase tracking-widest transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 ${
                    isActive 
                      ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white hover:from-emerald-700 hover:to-emerald-600' 
                      : 'bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-700 hover:to-blue-600'
                  }`}
                >
                  <FiKey className="w-4 h-4" />
                  {license ? 'Update License Key' : 'Activate Software'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Detailed Info */}
        <div className="w-full md:w-2/3 flex flex-col overflow-hidden min-h-0">
          <div className="bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-800/10 border-b border-blue-200/50 dark:border-blue-800/30 flex items-center gap-3">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600">
                <FiFileText className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wide">License Specification Details</h3>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {license ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Activation Key Item */}
                  <div className="col-span-1 sm:col-span-2 bg-gray-50/50 dark:bg-gray-700/30 border border-gray-100 dark:border-gray-700 rounded-xl p-4 transition-all hover:border-blue-300 dark:hover:border-blue-700">
                    <div className="flex items-center gap-3 mb-2">
                       <div className="p-2 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                         <FiKey className="w-4 h-4" />
                       </div>
                       <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Active License Sequence</span>
                    </div>
                    <div className="font-mono text-sm font-bold text-gray-900 dark:text-white bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 tracking-[0.2em] text-center select-all">
                      {license.activation_code}
                    </div>
                  </div>

                  {/* Date Grid */}
                  <div className="bg-gray-50/50 dark:bg-gray-700/30 border border-gray-100 dark:border-gray-700 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2 text-gray-500 dark:text-gray-400 uppercase tracking-widest text-[10px] font-bold">
                      <FiCalendar className="w-3.5 h-3.5" />
                      Activation Date
                    </div>
                    <div className="text-sm font-bold text-gray-900 dark:text-white">
                       {license.created_at ? formatDateTime(license.created_at) : 'Not Recorded'}
                    </div>
                  </div>

                  <div className="bg-gray-50/50 dark:bg-gray-700/30 border border-gray-100 dark:border-gray-700 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2 text-gray-500 dark:text-gray-400 uppercase tracking-widest text-[10px] font-bold">
                      <FiClock className="w-3.5 h-3.5" />
                      Expiry Deadline
                    </div>
                    <div className="text-sm font-bold text-gray-900 dark:text-white">
                       {license.expiry_date ? formatDateTime(license.expiry_date) : 'Infinite'}
                    </div>
                  </div>

                  <div className="bg-gray-50/50 dark:bg-gray-700/30 border border-gray-100 dark:border-gray-700 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2 text-gray-500 dark:text-gray-400 uppercase tracking-widest text-[10px] font-bold">
                      <FiRefreshCw className="w-3.5 h-3.5" />
                      Last Verification
                    </div>
                    <div className="text-sm font-bold text-gray-900 dark:text-white">
                       {license.updated_at ? formatDateTime(license.updated_at) : 'N/A'}
                    </div>
                  </div>

                  {/* Machine ID Info */}
                  <div className="bg-gray-50/50 dark:bg-gray-700/30 border border-gray-100 dark:border-gray-700 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <div className="text-gray-500 dark:text-gray-400 uppercase tracking-widest text-[10px] font-bold mb-1">Authorization Protocol</div>
                      <div className="text-xs font-bold text-blue-600 dark:text-blue-400">AES-256 ENCRYPTED</div>
                    </div>
                    <FiShield className="w-6 h-6 text-emerald-500/50" />
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center py-12 opacity-60">
                  <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-4">
                    <FiKey className="w-10 h-10 text-gray-400" />
                  </div>
                  <p className="font-bold text-gray-500 uppercase tracking-widest text-xs">No System Registration Found</p>
                  <p className="text-xs text-gray-400 mt-1 italic">Contact system administrator for activation.</p>
                </div>
              )}
            </div>
            
            <div className="p-4 bg-gray-50/50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-[11px] font-medium">
               <span className="text-gray-500">Security Certificate Status:</span>
               <span className={`px-2 py-0.5 rounded-full ${isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                 {isActive ? 'VALID' : 'INVALID'}
               </span>
            </div>
          </div>
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

