import React, { useState, useEffect, useCallback } from 'react';
import { FiAlertTriangle, FiX } from 'react-icons/fi';
import { getAuthUser } from '../../utils/auth';
import { getLicenseStatus, activateLicense, LicenseStatus } from '../../utils/license';
import LicenseActivationDialog from './LicenseActivationDialog';
import { resetAttempts } from '../../utils/licenseAttempts';

interface LicenseOverlayProps {
  children: React.ReactNode;
}

const LicenseOverlay: React.FC<LicenseOverlayProps> = ({ children }) => {
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [showActivationDialog, setShowActivationDialog] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [showSuccessAlert, setShowSuccessAlert] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkLicenseStatus = useCallback(async () => {
    try {
      const user = getAuthUser();
      if (!user) return;

      const status = await getLicenseStatus(user.id);
      setLicenseStatus(status);
      setLoading(false);
    } catch (error) {
      // Error checking license status
      setLoading(false);
    }
  }, []);

  const checkAlerts = useCallback(() => {
    if (!licenseStatus) return;

    const { isExpired, isExpiringSoon } = licenseStatus;

    // Show alert if expiring soon (within 7 days) but not expired
    if (isExpiringSoon && !isExpired) {
      setShowAlert(true);
    }
  }, [licenseStatus]);

  useEffect(() => {
    checkLicenseStatus();
    // Check license status every minute
    const interval = setInterval(checkLicenseStatus, 60000);
    return () => clearInterval(interval);
  }, [checkLicenseStatus]);

  useEffect(() => {
    if (licenseStatus) {
      checkAlerts();
      // Auto-show activation dialog if expired
      if (licenseStatus.isExpired) {
        setShowActivationDialog(true);
      }
    }
  }, [licenseStatus, checkAlerts]);

  const handleActivateLicense = async (
    activationCode: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const user = getAuthUser();
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const result = await activateLicense(user.id, activationCode);
      if (result.success) {
        // Reset attempts on success
        resetAttempts();
        setShowActivationDialog(false);
        await checkLicenseStatus();
        setShowAlert(false);
        // Show success alert
        setShowSuccessAlert(true);
        // Auto-hide after 5 seconds
        setTimeout(() => {
          setShowSuccessAlert(false);
        }, 5000);
      }
      return result;
    } catch (error) {
      return { success: false, error: 'Failed to activate license' };
    }
  };

  if (loading) {
    return <>{children}</>;
  }

  const { isExpired, daysUntilExpiry, isExpiringSoon } = licenseStatus || {};

  return (
    <>
      {/* Block all interactions if expired */}
      {isExpired && (
        <div className="fixed inset-0 z-[9997] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          {/* Main modal card - Clean and minimal */}
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-fade-in-up">
            {/* Top accent bar */}
            <div className="h-1 bg-gradient-to-r from-red-500 to-orange-500" />

            {/* Content */}
            <div className="px-8 py-10 text-center">
              {/* Icon */}
              <div className="mb-6 flex justify-center">
                <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center">
                  <FiAlertTriangle className="w-10 h-10 text-red-500" />
                </div>
              </div>

              {/* Title */}
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">License Expired</h2>

              {/* Message */}
              <p className="text-gray-600 mb-8 leading-relaxed">
                Your license has expired. Please activate a new license to continue using the
                application.
              </p>

              {/* Button */}
              <button
                type="button"
                onClick={() => setShowActivationDialog(true)}
                className="w-full px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                  />
                </svg>
                Activate License
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disable pointer events on children when expired */}
      <div style={{ pointerEvents: isExpired ? 'none' : 'auto' }}>{children}</div>

      {/* Alert Banner - Only show for expiring soon (not expired) */}
      {showAlert && isExpiringSoon && !isExpired && (
        <div className="fixed top-0 left-0 right-0 z-[9999] bg-amber-50 border-b border-amber-200 shadow-sm animate-slide-in-left">
          <div className="container mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                <FiAlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 mb-1">License Expiring Soon</p>
                <p className="text-sm text-gray-600">
                  {daysUntilExpiry !== null
                    ? `Your license will expire in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''
                    }. Please renew your license to avoid interruption.`
                    : 'Please activate your license to continue using all features.'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowActivationDialog(true)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg transition-colors duration-200"
              >
                Activate Now
              </button>
              <button
                type="button"
                onClick={() => setShowAlert(false)}
                className="p-2 hover:bg-amber-100 rounded-lg transition-colors"
              >
                <FiX className="w-5 h-5 text-gray-600" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Alert */}
      {showSuccessAlert && (
        <div className="fixed top-6 right-6 z-[10000] animate-fade-in-up">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-5 min-w-[360px]">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-6 h-6 text-emerald-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 mb-1">Welcome Back!</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Your license has been successfully activated. Enjoy full access to all features!
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSuccessAlert(false)}
                className="flex-shrink-0 p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <FiX className="w-5 h-5 text-gray-400" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Activation Dialog */}
      {showActivationDialog && (
        <LicenseActivationDialog
          onClose={() => setShowActivationDialog(false)}
          onActivate={handleActivateLicense}
          isExpired={isExpired || false}
        />
      )}
    </>
  );
};

export default LicenseOverlay;
