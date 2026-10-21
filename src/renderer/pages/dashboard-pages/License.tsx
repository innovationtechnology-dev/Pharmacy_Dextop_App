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
  FiShoppingCart,
  FiTruck,
  FiPackage,
  FiBarChart2,
  FiUsers,
  FiWifi,
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
      <span className="font-mono text-base font-bold tracking-[0.2em] text-gray-900 dark:text-white flex-1 select-all">
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
        window.dispatchEvent(new CustomEvent('license-updated'));
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
                <div className="text-blue-600 dark:text-blue-400 font-bold text-[10px] uppercase tracking-widest mb-1.5">
                  Support Details
                </div>
                <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-600 pb-1.5">
                  <span className="text-gray-900 dark:text-white text-[10px]">Email : innovationtechnology.dev@gmail.com</span>
                </div>
                <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-600 pb-1.5">
                  <span className="text-gray-600 dark:text-gray-300 text-[10px]">Phone : <span className="text-gray-900 dark:text-white">(+92) 3205720-774</span></span>
                </div>
                <div className="pt-0.5">
                  <span className="text-blue-600 dark:text-blue-400 text-[9px] italic block text-center">Contact us for any further assistance.</span>
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

  useEffect(() => {
    // Check the license server up front so the generate form is ready to use
    // (cashiers see the form too while the system is unlicensed)
    if (currentUserRole && getCloudLicenseApiBaseUrl()) {
      handlePingServer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserRole]);

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
  // Cashiers can fill the form too while the system has no active license.
  const canGenerateKey = isAdmin || !isActive;
  // Only super_admin can see the generated key after creation.
  // Regular admin should never see the raw key — they rely on super_admin to share it.
  const canSeeGeneratedKey = currentUserRole === 'super_admin';

  const tone = isActive ? 'active' : isExpired ? 'expired' : 'warning';
  const toneClasses = {
    active: {
      stroke: 'text-emerald-500',
      track: 'text-emerald-500/15',
      text: 'text-emerald-600 dark:text-emerald-400',
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700/50',
      dot: 'bg-emerald-500',
    },
    expired: {
      stroke: 'text-red-500',
      track: 'text-red-500/15',
      text: 'text-red-600 dark:text-red-400',
      badge: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700/50',
      dot: 'bg-red-500',
    },
    warning: {
      stroke: 'text-amber-500',
      track: 'text-amber-500/15',
      text: 'text-amber-600 dark:text-amber-400',
      badge: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700/50',
      dot: 'bg-amber-500',
    },
  }[tone];

  const daysLeft = licenseStatus?.daysUntilExpiry ?? null;
  const startMs = license?.created_at ? new Date(license.created_at).getTime() : null;
  const endMs = licenseStatus?.expiryDate ? new Date(licenseStatus.expiryDate).getTime() : null;
  const totalDays = startMs && endMs && endMs > startMs ? Math.round((endMs - startMs) / 86400000) : null;
  const remainingPct =
    daysLeft !== null && totalDays ? Math.max(0, Math.min(100, (daysLeft / totalDays) * 100)) : license ? 100 : 0;

  const ringRadius = 54;
  const ringCircumference = 2 * Math.PI * ringRadius;

  const stats = [
    {
      label: 'Validity',
      value: daysLeft !== null ? (daysLeft >= 0 ? `${daysLeft} Days Left` : 'Terminated') : 'Unlimited',
      icon: FiClock,
    },
    { label: 'Expiry Date', value: licenseStatus?.expiryDate ? formatDate(licenseStatus.expiryDate) : 'Perpetual', icon: FiCalendar },
    { label: 'Activated On', value: formatDateTime(license?.created_at), icon: FiCheckCircle },
    { label: 'Last Verification', value: formatDateTime(license?.updated_at), icon: FiRefreshCw },
  ];

  const includedModules = [
    { label: 'Selling Panel & POS', icon: FiShoppingCart },
    { label: 'Purchasing & Suppliers', icon: FiTruck },
    { label: 'Medicines & Stock', icon: FiPackage },
    { label: 'Sales & Financial Reports', icon: FiBarChart2 },
    { label: 'Customers & Payments', icon: FiUsers },
    { label: 'Multi-Computer Network', icon: FiWifi },
  ];

  const activationSteps = [
    { title: 'Request a license', text: 'Contact support with your pharmacy name, email and phone number.' },
    { title: 'Receive your key', text: 'You will receive a unique activation key for this system.' },
    { title: 'Activate the software', text: 'Click "Activate Software" and enter the key to unlock all features.' },
  ];

  const cardClass = 'bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm';
  const labelClass = 'flex items-center gap-1.5 text-[10px] font-bold mb-1.5 uppercase tracking-wide text-gray-500 dark:text-gray-400';
  const inputClass = 'w-full px-3.5 py-2 text-xs font-semibold bg-gray-50/60 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:bg-white dark:focus:bg-gray-700 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none transition-all';
  const serverOk = serverStatus.state === 'ok';

  return (
    <div className="flex flex-col lg:flex-row gap-3 h-auto lg:h-[calc(100vh-80px)] w-full px-4 pb-4 overflow-y-auto lg:overflow-hidden">
      {/* ── Left: status overview ── */}
      <div className={`${cardClass} lg:w-[340px] shrink-0 flex flex-col overflow-hidden`}>
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 pt-8 pb-6 bg-gradient-to-b from-emerald-50/70 to-transparent dark:from-emerald-900/10">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-widest mb-6 ${toneClasses.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${toneClasses.dot} ${isActive ? 'animate-pulse' : ''}`} />
            {isActive ? 'Verified' : isExpired ? (license ? 'Expired' : 'Not Activated') : 'Expiring Soon'}
          </span>

          {/* Validity ring */}
          <div className="relative w-36 h-36 mb-5">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 128 128">
              <circle cx="64" cy="64" r={ringRadius} fill="none" strokeWidth="10" stroke="currentColor" className={toneClasses.track} />
              <circle
                cx="64"
                cy="64"
                r={ringRadius}
                fill="none"
                strokeWidth="10"
                strokeLinecap="round"
                stroke="currentColor"
                className={`${toneClasses.stroke} transition-all duration-700`}
                strokeDasharray={ringCircumference}
                strokeDashoffset={ringCircumference * (1 - remainingPct / 100)}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {license && daysLeft !== null && daysLeft >= 0 ? (
                <>
                  <span className="text-3xl font-extrabold text-gray-900 dark:text-white leading-none">{daysLeft}</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mt-1">Days Left</span>
                </>
              ) : isActive ? (
                <FiShield className={`w-12 h-12 ${toneClasses.text}`} />
              ) : (
                <FiAlertTriangle className={`w-12 h-12 ${toneClasses.text}`} />
              )}
            </div>
          </div>

          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1.5">
            {isActive ? 'License Active' : isExpired ? (license ? 'License Expired' : 'Software Not Activated') : 'Expiry Near'}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium leading-relaxed max-w-[260px]">
            {isActive
              ? 'Your system is fully activated and receiving security updates.'
              : isExpired
                ? license
                  ? 'Features are locked. Please provide a new activation key.'
                  : 'Activate this system with a license key to unlock all features.'
                : 'System will require re-activation shortly to maintain full functionality.'}
          </p>

          <button
            onClick={() => setShowActivationDialog(true)}
            className="mt-6 w-full py-2.5 rounded-lg font-bold text-xs uppercase tracking-widest transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white hover:from-emerald-700 hover:to-emerald-600"
          >
            <FiKey className="w-4 h-4" />
            {license ? 'Update License Key' : 'Activate Software'}
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="mt-2 w-full py-2 rounded-lg text-[11px] font-bold uppercase tracking-widest text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <FiRefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh Status
          </button>
        </div>

        {/* Support */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/60 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Need Help?</p>
          <div className="flex items-center gap-2 text-[11px] font-semibold text-gray-700 dark:text-gray-200">
            <FiMail className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span className="truncate select-all">innovationtechnology.dev@gmail.com</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-semibold text-gray-700 dark:text-gray-200">
            <FiPhone className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span className="select-all">(+92) 3205720-774</span>
          </div>
        </div>
      </div>

      {/* ── Right: details ── */}
      <div className="flex-1 min-w-0 flex flex-col gap-3 lg:min-h-0">
        {/* License key */}
        <div className={`${cardClass} p-4 flex flex-col sm:flex-row sm:items-center gap-4 shrink-0`}>
          <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md shrink-0 w-fit">
            <FiKey className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1.5">Active License Key</p>
            {license ? (
              <GeneratedKeyCard licenseKey={license.activation_code} />
            ) : (
              <div className="px-3 py-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-xs font-semibold text-gray-400 dark:text-gray-500">
                No license key registered on this system
              </div>
            )}
          </div>
          <div className="shrink-0 sm:text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1.5">Certificate</p>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-widest ${toneClasses.badge}`}>
              <FiShield className="w-3 h-3" />
              {isActive ? 'Valid' : 'Invalid'}
            </span>
          </div>
        </div>

        {/* Stats + term progress (only once licensed) */}
        {license && (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 shrink-0">
              {stats.map(({ label, value, icon: Icon }) => (
                <div key={label} className={`${cardClass} p-3.5 flex items-center gap-3`}>
                  <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
                    <p className="text-xs font-bold text-gray-900 dark:text-white truncate" title={value}>{value}</p>
                  </div>
                </div>
              ))}
            </div>

            {totalDays && (
              <div className={`${cardClass} p-4 shrink-0`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">License Term</p>
                  <p className="text-[11px] font-bold text-gray-700 dark:text-gray-200">
                    {Math.round(100 - remainingPct)}% used · {totalDays} days total
                  </p>
                </div>
                <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700"
                    style={{ width: `${100 - remainingPct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-2 text-[10px] font-semibold text-gray-500 dark:text-gray-400">
                  <span>{formatDate(license.created_at)}</span>
                  <span>{formatDate(licenseStatus?.expiryDate)}</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Generate license key: always for admins, and for cashiers while unlicensed (submit needs a reachable server) */}
        {canGenerateKey ? (
          <div className={`${cardClass} flex-1 lg:min-h-0 flex flex-col overflow-hidden`}>
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex flex-col xl:flex-row xl:items-center gap-3 shrink-0">
              <div className="flex items-center gap-2 shrink-0">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600">
                  <FiFileText className="w-4 h-4 text-white" />
                </div>
                <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wide">Generate License Key</h3>
              </div>
              <div className="flex items-center gap-2 xl:ml-auto xl:max-w-md w-full">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    serverOk ? 'bg-emerald-500' : serverStatus.state === 'error' ? 'bg-red-500' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                  title={'message' in serverStatus ? serverStatus.message : 'Not connected'}
                />
                <input
                  type="text"
                  value={cloudServerUrl}
                  onChange={(e) => handleServerUrlChange(e.target.value)}
                  placeholder="https://your-cloud-license-admin-domain"
                  className={`${inputClass} flex-1 min-w-0 py-1.5`}
                />
                <button
                  type="button"
                  onClick={handlePingServer}
                  disabled={isCheckingServer}
                  className="shrink-0 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                >
                  <FiRefreshCw className={`w-3 h-3 ${isCheckingServer ? 'animate-spin' : ''}`} />
                  {isCheckingServer ? 'Checking' : 'Check'}
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmitLicenseRequest} className="flex-1 lg:min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
              {serverStatus.state === 'error' && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-[11px] font-semibold text-red-700 dark:text-red-300">
                  <FiAlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {serverStatus.message || 'Could not reach license server'}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
                <div>
                  <label className={labelClass}>
                    <FiFileText className="w-3.5 h-3.5 text-emerald-500" />
                    Pharmacy Name <span className="text-red-500">*</span>
                  </label>
                  <input type="text" value={pharmacyName} onChange={(e) => setPharmacyName(e.target.value)} placeholder="Enter pharmacy name" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>
                    <FiUser className="w-3.5 h-3.5 text-emerald-500" />
                    Doctor / Owner Name
                  </label>
                  <input type="text" value={doctorName} onChange={(e) => setDoctorName(e.target.value)} placeholder="Enter doctor or owner name" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>
                    <FiMail className="w-3.5 h-3.5 text-emerald-500" />
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>
                    <FiPhone className="w-3.5 h-3.5 text-emerald-500" />
                    Phone <span className="text-red-500">*</span>
                  </label>
                  <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1234567890" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>
                    <FiMapPin className="w-3.5 h-3.5 text-emerald-500" />
                    Address
                  </label>
                  <textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, City, Country" rows={3} className={`${inputClass} resize-none`} />
                </div>
                <div>
                  <label className={labelClass}>
                    <FiMessageCircle className="w-3.5 h-3.5 text-emerald-500" />
                    Note / Message
                  </label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional notes or message..." rows={3} className={`${inputClass} resize-none`} />
                </div>
              </div>
              <div className="mt-auto pt-2 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
                <p className="text-[10px] text-gray-400 dark:text-gray-500 italic">
                  {serverOk ? 'License server connected — ready to generate.' : 'Check the server connection to enable key generation.'}
                </p>
                <button
                  type="submit"
                  disabled={isSubmittingRequest || !serverOk}
                  className="px-6 py-2.5 text-xs font-bold uppercase tracking-widest rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md min-w-[220px] flex items-center justify-center gap-2"
                >
                  <FiKey className="w-4 h-4" />
                  {isSubmittingRequest ? 'Generating...' : 'Generate License Key'}
                </button>
              </div>
            </form>
          </div>
        ) : !license ? (
          /* Non-admin without a license: how to activate */
          <div className={`${cardClass} flex-1 lg:min-h-0 overflow-y-auto p-6 flex flex-col justify-center`}>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">How to activate</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">Follow these steps to get this pharmacy system up and running.</p>
            <div className="space-y-5">
              {activationSteps.map((step, i) => (
                <div key={step.title} className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 font-bold text-sm flex items-center justify-center shrink-0">
                    {i + 1}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-900 dark:text-white">{step.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{step.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Non-admin with a license: what the license covers */
          <div className={`${cardClass} flex-1 lg:min-h-0 overflow-y-auto p-5`}>
            <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wide mb-4">Included In Your License</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {includedModules.map(({ label, icon: Icon }) => (
                <div key={label} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-700/30">
                  <Icon className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 flex-1">{label}</span>
                  {isActive ? (
                    <FiCheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <FiAlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
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
            submitPopup.type === 'success' 
              ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700' 
              : 'bg-white dark:bg-gray-800 border-red-200 dark:border-red-700'
          } animate-in zoom-in-95 duration-200`}>
            {/* Close button */}
            <button 
              onClick={() => setSubmitPopup(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="flex flex-col items-center text-center px-6 py-4">
              {/* Confetti Animation */}
              <div className="relative w-full h-20 mb-3">
                {/* Animated confetti pieces */}
                <div className="absolute top-2 left-[15%] w-3 h-6 bg-blue-500 dark:bg-blue-400 rounded-sm transform rotate-12 animate-bounce" style={{ animationDelay: '0s', animationDuration: '2s' }} />
                <div className="absolute top-8 left-[25%] w-2 h-2 bg-orange-500 dark:bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s', animationDuration: '2.2s' }} />
                <div className="absolute top-4 left-[35%] w-2 h-4 bg-green-500 dark:bg-green-400 rounded-sm transform -rotate-45 animate-bounce" style={{ animationDelay: '0.6s', animationDuration: '1.8s' }} />
                <div className="absolute top-10 left-[20%] w-2 h-2 bg-yellow-500 dark:bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '0.9s', animationDuration: '2.4s' }} />
                
                <div className="absolute top-3 right-[15%] w-3 h-6 bg-cyan-500 dark:bg-cyan-400 rounded-sm transform -rotate-12 animate-bounce" style={{ animationDelay: '0.2s', animationDuration: '2.1s' }} />
                <div className="absolute top-9 right-[25%] w-2 h-2 bg-green-500 dark:bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '0.5s', animationDuration: '1.9s' }} />
                <div className="absolute top-5 right-[35%] w-2 h-4 bg-orange-500 dark:bg-orange-400 rounded-sm transform rotate-45 animate-bounce" style={{ animationDelay: '0.8s', animationDuration: '2.3s' }} />
                <div className="absolute top-11 right-[20%] w-2 h-2 bg-blue-500 dark:bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s', animationDuration: '2s' }} />

                {/* Large Success Icon */}
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                  <div className="relative">
                    <div className="absolute inset-0 bg-emerald-400/30 dark:bg-emerald-500/20 rounded-full blur-xl" />
                    <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-500 dark:from-emerald-500 dark:to-emerald-600 flex items-center justify-center shadow-xl">
                      <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* Title */}
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3 mt-6">
                {submitPopup.title}
              </h3>
              
              {submitPopup.type === 'success' ? (
                <>
                  {/* Main Description */}
                  <div className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-6 w-full px-2">
                    <p className="mb-1.5">
                      Your license key
                    </p>
                    <p className="font-mono font-semibold text-blue-600 dark:text-blue-400 mb-1">
                      ***** **** **** *****
                    </p>
                    <p>
                      has been generated successfully. Please contact <span className="font-semibold text-blue-600 dark:text-blue-400">Wazir Naeem</span> for activation and support.
                    </p>
                  </div>

                  {/* Support Details if provided */}
                  {submitPopup.details && (
                    <div className="text-sm text-black dark:white mb-2">
                      {submitPopup.details}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-4 max-w-lg">
                  {submitPopup.message}
                </p>
              )}

              {/* Single Action Button */}
              <button 
                onClick={() => setSubmitPopup(null)}
                className={`w-full max-w-md py-4 rounded-xl text-base font-semibold text-white transition-all shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] ${
                  submitPopup.type === 'success' 
                    ? 'bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-700' 
                    : 'bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700'
                }`}
              >
                Okay
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


export default License;

