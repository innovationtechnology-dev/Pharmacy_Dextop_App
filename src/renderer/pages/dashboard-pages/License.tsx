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
  FiMail,
  FiPhone,
  FiUser,
  FiMapPin,
  FiMessageCircle,
} from 'react-icons/fi';
import { getAuthUser } from '../../utils/auth';
import { getLicenseStatus, getLicense, LicenseStatus, License as LicenseType } from '../../utils/license';
import LicenseActivationDialog from '../../components/license/LicenseActivationDialog';
import { useDashboardHeader } from './useDashboardHeader';
import {
  getCloudLicenseApiBaseUrl,
  setCloudLicenseApiBaseUrl,
  pingCloudLicenseServer,
  registerLicenseKeyWithCloud,
  CloudLicenseServerStatus,
} from '../../utils/cloudLicense';

// ── Inline helper: display + copy generated key ──────────────────────────────
function formatKey(key: string): string {
  const clean = key.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return clean.replace(/(.{4})/g, '$1 ').trim();
}

function GeneratedKeyCard({ licenseKey }: { licenseKey: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      const clean = licenseKey.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      await navigator.clipboard.writeText(clean);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API unavailable
    }
  };

  return (
    <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2">
      <span className="font-mono text-sm font-bold tracking-[0.18em] text-gray-900 dark:text-white flex-1 select-all">
        {formatKey(licenseKey)}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        className={`shrink-0 flex items-center justify-center w-7 h-7 rounded-full border transition-all ${
          copied
            ? 'bg-emerald-500 border-emerald-400 text-white scale-110'
            : 'border-gray-300 dark:border-gray-500 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-600'
        }`}
        aria-label="Copy license key"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {copied ? (
            <polyline points="20 6 9 17 4 12" />
          ) : (
            <>
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

const License: React.FC = () => {
  const { setHeader } = useDashboardHeader();
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [license, setLicense] = useState<LicenseType | null>(null);
  const [loading, setLoading] = useState(true);
  const [showActivationDialog, setShowActivationDialog] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<number | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  // Cloud license state (admin only)
  const [cloudServerUrl, setCloudServerUrl] = useState<string>('');
  const [serverStatus, setServerStatus] = useState<CloudLicenseServerStatus>({ state: 'idle' });
  const [isCheckingServer, setIsCheckingServer] = useState(false);

  const [pharmacyName, setPharmacyName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [submitPopup, setSubmitPopup] = useState<{ type: 'success' | 'error', title: string, message: string, details?: React.ReactNode } | null>(null);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);

  useEffect(() => {
    const savedData = localStorage.getItem('licenseFormData');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        if (parsed.pharmacyName) setPharmacyName(parsed.pharmacyName);
        if (parsed.email) setEmail(parsed.email);
        if (parsed.phone) setPhone(parsed.phone);
        if (parsed.doctorName) setDoctorName(parsed.doctorName);
        if (parsed.address) setAddress(parsed.address);
        if (parsed.notes) setNotes(parsed.notes);
      } catch (e) {
      }
    }
  }, []);

  useEffect(() => {
    const user = getAuthUser();
    if (user) {
      setUserId(user.id);
      setCurrentUserRole(user.role);
    }
  }, []);

  useEffect(() => {
    setHeader({
      title: 'License Management',
      subtitle: 'Analyze and manage your system activation status',
    });
    return () => setHeader(null);
  }, [setHeader]);

  const loadLicenseData = useCallback(async (isInitial = false) => {
    if (!userId) return;

    try {
      if (isInitial) setLoading(true);
      setRefreshing(true);
      
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
    loadLicenseData(true);
    // Refresh every 30 seconds in background
    const interval = setInterval(() => loadLicenseData(false), 30000);
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

  const handleServerUrlChange = (value: string) => {
    setCloudServerUrl(value);
    setCloudLicenseApiBaseUrl(value);
  };

  const handlePingServer = async () => {
    setIsCheckingServer(true);
    setServerStatus({ state: 'checking' });
    try {
      const status = await pingCloudLicenseServer();
      setServerStatus(status);
    } finally {
      setIsCheckingServer(false);
    }
  };

  const handleSubmitLicenseRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitPopup(null);
    setGeneratedKey(null);

    // Locally save input data
    localStorage.setItem('licenseFormData', JSON.stringify({
      pharmacyName, email, phone, doctorName, address, notes
    }));

    if (!pharmacyName.trim() || !email.trim() || !phone.trim()) {
      setSubmitPopup({ type: 'error', title: 'Missing Information', message: 'Pharmacy name, email, and phone are required.' });
      return;
    }

    if (!window.navigator.onLine) {
      setSubmitPopup({
        type: 'error',
        title: 'Connection Offline',
        message: 'No Internet Connection. Please connect to a stable network to generate a key.'
      });
      return;
    }

    setIsSubmittingRequest(true);
    try {
      // Step 1: generate key locally via IPC (works fully offline)
      const details = {
        pharmacyName: pharmacyName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        doctorName: doctorName.trim() || undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        country: country.trim() || undefined,
      };

      const ipcResult = await new Promise<{
        success: boolean;
        code?: string;
        error?: string;
      }>((resolve) => {
        window.electron.ipcRenderer.once('license-generate-reply', (result) => {
          resolve(result as { success: boolean; code?: string; error?: string });
        });
        window.electron.ipcRenderer.sendMessage('license-generate', [details]);
      });

      if (!ipcResult.success || !ipcResult.code) {
        setSubmitPopup({ type: 'error', title: 'Generation Error', message: ipcResult.error || 'Failed to generate license key locally.' });
        return;
      }

      const generatedCode = ipcResult.code;
      setGeneratedKey(generatedCode);

      // Step 2: push to cloud for visibility (best-effort, tolerates offline)
      try {
        const cloudResult = await registerLicenseKeyWithCloud({
          licenseKey: generatedCode,
          pharmacyName: details.pharmacyName,
          email: details.email,
          phone: details.phone,
          doctorName: details.doctorName,
          address: details.address,
          city: details.city,
          country: details.country,
        });

        if (cloudResult.ok) {
          setSubmitPopup({
            type: 'success',
            title: 'License Ready!',
            message: generatedCode, // To be displayed nicely in the modal
            details: (
              <div className="flex flex-col gap-1.5 w-full mt-2 normal-case tracking-normal">
                <div className="text-[#7d9bd1] font-bold text-[10px] uppercase tracking-widest mb-1.5">
                  Support Details
                </div>
                <div className="flex items-center justify-between border-b border-[#2a3650] pb-1.5">
                  <span className="text-white text-[10px]">Email : innovationtechnology.dev@gmail.com</span>
                </div>
                <div className="flex items-center justify-between border-b border-[#2a3650] pb-1.5">
                  <span className=" text-[10px]">Phone : <span className="text-white">(+92) 3205720-774</span></span>
                </div>
                <div className="pt-0.5">
                  <span className="text-[#7d9bd1] text-[9px] italic block text-center">Contact us for any further assistance.</span>
                </div>
              </div>
            )
          });
        } else {
           setSubmitPopup({
             type: 'error',
             title: 'Sync Failed',
             message: cloudResult.error || 'Connection Failed! Internet connection weak or server did not respond properly.'
          });
        }
      } catch (cloudErr: any) {
        setSubmitPopup({
           type: 'error',
           title: 'Network Error', 
           message: 'Failed to connect post call. Your internet connection may be weak or entirely disconnected.'
        });
      }

      setPharmacyName('');
      setEmail('');
      setPhone('');
      setDoctorName('');
      setAddress('');
      setCity('');
      setCountry('');
    } catch (error: any) {
      setSubmitPopup({ type: 'error', title: 'Unexpected Error', message: error.message || 'An unexpected error occurred while generating the key.' });
    } finally {
      setIsSubmittingRequest(false);
    }
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

  useEffect(() => {
    // Initialize cloud server URL from storage on mount
    setCloudServerUrl(getCloudLicenseApiBaseUrl());
  }, []);

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
  // Both admin and super_admin can generate keys (fill the form + trigger generation).
  // Cashier is a pure client — they only activate their own license.
  const isAdmin = currentUserRole === 'admin' || currentUserRole === 'super_admin';
  // Only super_admin can see the generated key after creation.
  // Regular admin should never see the raw key — they rely on super_admin to share it.
  const canSeeGeneratedKey = currentUserRole === 'super_admin';

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

        {/* Activation Date Stat */}
        {license && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-teal-50 dark:bg-teal-900/20 px-2.5 py-1.5 rounded-md border border-teal-200 dark:border-teal-600/50 shadow-sm">
              <FiCalendar className="w-3.5 h-3.5 text-teal-500" />
              <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                Activation Date
              </span>
              <span className="text-xs font-bold text-teal-600 dark:text-teal-400 ml-1">
                {license.created_at ? formatDateTime(license.created_at) : 'N/A'}
              </span>
            </div>
          </div>
        )}

        {/* Last Verification Stat */}
        {license && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-orange-50 dark:bg-orange-900/20 px-2.5 py-1.5 rounded-md border border-orange-200 dark:border-orange-600/50 shadow-sm">
              <FiRefreshCw className="w-3.5 h-3.5 text-orange-500" />
              <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                Last Verification
              </span>
              <span className="text-xs font-bold text-orange-600 dark:text-orange-400 ml-1">
                {license.updated_at ? formatDateTime(license.updated_at) : 'N/A'}
              </span>
            </div>
          </div>
        )}

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
      <div className="flex flex-col md:flex-row gap-3 flex-1 overflow-y-auto min-h-0 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
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

        {/* Right Side: Detailed Info + Cloud License (admin) */}
        <div className="w-full md:w-2/3 flex flex-col overflow-hidden min-h-0">
          <div className="bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md flex-1 flex flex-col overflow-hidden">
            {/* Header row: License key + Cloud server (admin) */}
            <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-800/10 border-b border-blue-200/50 dark:border-blue-800/30 flex items-center gap-3 shrink-0 flex-wrap">
              <div className="p-2 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 shrink-0">
                <FiKey className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest shrink-0">Active License Key</span>
              {license ? (
                <div className="font-mono text-sm font-bold text-gray-900 dark:text-white bg-white dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 tracking-[0.2em] text-center select-all shrink-0">
                  {license.activation_code}
                </div>
              ) : (
                <div className="font-mono text-xs text-gray-400 dark:text-gray-500 px-3 py-1.5 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 shrink-0">
                  No License
                </div>
              )}
              {isAdmin && <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 shrink-0" />}
              {isAdmin && (
                <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest shrink-0">Cloud License Server</span>
              )}
              {isAdmin && (
                <input
                  type="text"
                  value={cloudServerUrl}
                  onChange={(e) => handleServerUrlChange(e.target.value)}
                  placeholder="https://your-cloud-license-admin-domain"
                  className="flex-1 min-w-0 px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              )}
              {isAdmin && (
                <button
                  type="button"
                  onClick={handlePingServer}
                  disabled={isCheckingServer}
                  className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-md bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50 transition-colors"
                >
                  {isCheckingServer ? 'Checking...' : 'Check Connection'}
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {serverStatus.state === 'ok' && (
                <div className="flex items-center gap-2.5 py-1.5 px-3 bg-white dark:bg-[#1a2235] border border-gray-200 dark:border-[#2a3650] rounded-md shadow-sm w-fit">
                  <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-[#253768] flex items-center justify-center shrink-0">
                    <FiCheckCircle className="w-3 h-3 text-blue-600 dark:text-[#8db3ff]" />
                  </div>
                  <div>
                    <h4 className="text-[10px] font-bold text-gray-900 dark:text-[#b4cbf5] uppercase tracking-widest leading-none mb-0.5">Connection Stable</h4>
                    <p className="text-[9px] text-gray-500 dark:text-[#7d9bd1] leading-none">{serverStatus.message || 'License server reachable'}</p>
                  </div>
                </div>
              )}
              {serverStatus.state === 'error' && (
                <div className="flex items-center gap-2.5 py-1.5 px-3 bg-white dark:bg-[#351a1a] border border-gray-200 dark:border-[#502a2a] rounded-md shadow-sm w-fit">
                  <div className="w-6 h-6 rounded-full bg-red-100 dark:bg-[#682525] flex items-center justify-center shrink-0">
                    <FiAlertTriangle className="w-3 h-3 text-red-600 dark:text-[#ff8d8d]" />
                  </div>
                  <div>
                    <h4 className="text-[10px] font-bold text-gray-900 dark:text-[#f5b4b4] uppercase tracking-widest leading-none mb-0.5">Connection Failed</h4>
                    <p className="text-[9px] text-gray-500 dark:text-[#d17d7d] leading-none">{serverStatus.message || 'Could not reach license server'}</p>
                  </div>
                </div>
              )}
              {!license && (
                <div className="h-full flex flex-col items-center justify-center py-12 opacity-60">
                  <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-4">
                    <FiKey className="w-10 h-10 text-gray-400" />
                  </div>
                  <p className="font-bold text-gray-500 uppercase tracking-widest text-xs">No System Registration Found</p>
                  <p className="text-xs text-gray-400 mt-1 italic">Contact system administrator for activation. </p>
                </div>
              )}

              {/* Generate License Key form — shown after successful connection check */}
              {isAdmin && serverStatus.state === 'ok' && (
                <div className="bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                  {/* Form header */}
                  <div className="flex items-center gap-3 px-4 py-3 bg-blue-600 dark:bg-blue-700">
                    <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center">
                      <FiKey className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-[11px] font-bold text-white uppercase tracking-widest">Generate License Key</span>
                  </div>

                  <form onSubmit={handleSubmitLicenseRequest} className="p-4 space-y-2">
                    {/* Row 1: Pharmacy Name + Doctor/Owner Name side by side */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1.5">
                          <FiFileText className="w-3.5 h-3.5 text-blue-500" />
                          Pharmacy Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={pharmacyName}
                          onChange={(e) => setPharmacyName(e.target.value)}
                          placeholder="Enter pharmacy name"
                          className="w-full px-3 py-2.5 text-[11px] border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700/60 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1.5">
                          <FiUser className="w-3.5 h-3.5 text-blue-500" />
                          Doctor / Owner Name
                        </label>
                        <input
                          type="text"
                          value={doctorName}
                          onChange={(e) => setDoctorName(e.target.value)}
                          placeholder="Enter doctor or owner name"
                          className="w-full px-3 py-2.5 text-[11px] border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700/60 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                        />
                      </div>
                    </div>

                    {/* Email + Phone side by side */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1.5">
                          <FiMail className="w-3.5 h-3.5 text-blue-500" />
                          Email <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="email@example.com"
                          className="w-full px-3 py-2.5 text-[11px] border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700/60 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1.5">
                          <FiPhone className="w-3.5 h-3.5 text-blue-500" />
                          Phone <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+1234567890"
                          className="w-full px-3 py-2.5 text-[11px] border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700/60 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                        />
                      </div>
                    </div>

                    {/* Address + Note / Message side by side */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1.5">
                          <FiMapPin className="w-3.5 h-3.5 text-blue-500" />
                          Address
                        </label>
                        <textarea
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          placeholder="Street, City, Country"
                          rows={2}
                          className="w-full px-3 py-2.5 text-[11px] border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700/60 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 resize-none"
                        />
                      </div>
                      <div>
                        <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1.5">
                          <FiMessageCircle className="w-3.5 h-3.5 text-blue-500" />
                          Note / Message
                        </label>
                        <textarea
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Additional notes or message..."
                          rows={2}
                          className="w-full px-3 py-2.5 text-[11px] border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700/60 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 resize-none"
                        />
                      </div>
                    </div>

                    {/* Submit */}
                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        disabled={isSubmittingRequest}
                        className="px-6 py-2.5 text-xs font-bold uppercase tracking-widest rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors shadow-md min-w-[200px]"
                      >
                        {isSubmittingRequest ? 'Generating...' : 'Generate License Key'}
                      </button>
                    </div>
                  </form>
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

      {/* Form Submission Popup Notification */}
      {submitPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={`relative w-full max-w-sm p-6 overflow-hidden rounded-2xl shadow-2xl border ${
            submitPopup.type === 'success' ? 'bg-[#1a2235] border-[#2a3650]' : 'bg-[#351a1a] border-[#502a2a]'
          } animate-in zoom-in-95 duration-200`}>
            {/* Close button */}
            <button 
              onClick={() => setSubmitPopup(null)}
              className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="flex flex-col items-center text-center mt-2">
              <div className={`flex items-center justify-center w-14 h-14 rounded-full mb-4 shrink-0 ${
                submitPopup.type === 'success' ? 'bg-[#253768]' : 'bg-[#682525]'
              }`}>
                {submitPopup.type === 'success' ? (
                   <FiCheckCircle className="w-7 h-7 text-[#8db3ff]" />
                ) : (
                   <FiAlertTriangle className="w-7 h-7 text-[#ff8d8d]" />
                )}
              </div>

              <h3 className={`text-base font-bold uppercase tracking-widest mb-2 ${
                submitPopup.type === 'success' ? 'text-[#b4cbf5]' : 'text-[#f5b4b4]'
              }`}>
                {submitPopup.title}
              </h3>
              
              {submitPopup.type === 'success' ? (
                <div className="bg-[#0f172a] rounded-lg px-4 py-3 border border-[#2a3650] w-full mb-4 select-all shadow-inner">
                   <p className="text-xs uppercase text-[#7d9bd1] font-bold mb-1 opacity-70 tracking-widest leading-none">Your Key</p>
                   <p className="text-lg font-mono font-bold text-blue-400 tracking-widest text-center truncate">***** **** **** *****</p>
                   <p className="text-[10px] uppercase text-[#7d9bd1] font-semibold mb-1 opacity-70 tracking-widest leading-[1.6] text-center">
                     Your License Key has been generated successfully. Please contact
                     <span className="text-white block mt-1">Developer : Wazir Naeem</span>
                   </p>
                   {submitPopup.details && (
                     <div className={`w-full p-3 rounded-lg mt-3 text-left shadow-sm border ${
                       submitPopup.type === 'success' ? 'bg-[#121927]/60 border-[#2a3650]' : 'bg-black/20 border-[#401f1f]'
                     }`}>
                       {submitPopup.details}
                     </div>
                   )}
                </div>
              ) : (
                <p className="text-xs mb-4 leading-relaxed text-[#d17d7d]">
                  {submitPopup.message}
                </p>
              )}
              
              

              <button 
                onClick={() => setSubmitPopup(null)}
                className={`w-full mt-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest text-white transition-all shadow-md ${
                  submitPopup.type === 'success' ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-900/40' : 'bg-red-600 hover:bg-red-700 shadow-red-900/40'
                }`}
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


export default License;

