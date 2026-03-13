import React, { useState, useEffect, useCallback } from 'react';
import { FiAlertTriangle, FiX, FiCheckCircle } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { getAuthUser, logout, User as AuthUser } from '../../utils/auth';
import { getLicenseStatus, activateLicense, LicenseStatus } from '../../utils/license';
import LicenseActivationDialog from './LicenseActivationDialog';
import { resetAttempts } from '../../utils/licenseAttempts';

interface LicenseOverlayProps {
  children: React.ReactNode;
}

const LicenseOverlay: React.FC<LicenseOverlayProps> = ({ children }) => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(getAuthUser());
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [showActivationDialog, setShowActivationDialog] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [showSuccessAlert, setShowSuccessAlert] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkLicenseStatus = useCallback(async () => {
    try {
      const user = getAuthUser();
      
      // Only update if something changed to avoid unnecessary re-renders
      if (JSON.stringify(user) !== JSON.stringify(currentUser)) {
        setCurrentUser(user);
      }

      if (!user) {
        setLoading(false);
        setLicenseStatus(null);
        return;
      }

      const status = await getLicenseStatus(user.id);
      setLicenseStatus(status);
      setLoading(false);
    } catch (error) {
      setLoading(false);
    }
  }, [currentUser]);

  const checkAlerts = useCallback(() => {
    if (!licenseStatus) return;
    const { isExpired, isExpiringSoon } = licenseStatus;
    if (isExpiringSoon && !isExpired) {
      setShowAlert(true);
    }
  }, [licenseStatus]);

  useEffect(() => {
    checkLicenseStatus();
    const interval = setInterval(checkLicenseStatus, 60000);
    return () => clearInterval(interval);
  }, [checkLicenseStatus]);

  useEffect(() => {
    if (licenseStatus) {
      checkAlerts();
      if (licenseStatus.isExpired) {
        setShowActivationDialog(true);
      }
    }
  }, [licenseStatus, checkAlerts]);

  const handleActivateLicense = async (activationCode: string) => {
    try {
      const user = getAuthUser();
      if (!user) {
        return { success: false, error: 'Authorization error' };
      }

      const result = await activateLicense(user.id, activationCode);
      if (result.success) {
        resetAttempts();
        setShowActivationDialog(false);
        await checkLicenseStatus();
        setShowAlert(false);
        setShowSuccessAlert(true);
        setTimeout(() => setShowSuccessAlert(false), 5000);
      }
      return result;
    } catch (error) {
      return { success: false, error: 'Failed to connect to license server' };
    }
  };

  const [adminDismissed, setAdminDismissed] = useState(false);
  const isCashier = currentUser?.role === 'cashier';
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'super_admin';
  const { isExpired, daysUntilExpiry, isExpiringSoon } = licenseStatus || {};

  // Don't show modal if admin dismissed it for this session
  const shouldShowExpiredModal = isExpired && (!isAdmin || !adminDismissed);

  return (
    <>
      {/* Expired License Modal - Minimal & Professional */}
      {shouldShowExpiredModal && (
        <div className="fixed inset-0 z-[9997] flex items-center justify-center bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden border border-gray-100 dark:border-gray-700">
            <div className="p-8 text-center">
              <div className="w-14 h-14 bg-red-50 dark:bg-red-900/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <FiAlertTriangle className="w-7 h-7 text-red-600" />
              </div>

              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">License Required</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-8 leading-relaxed">
                The software license has expired. Please provide a valid activation key to continue using pharmacy services.
              </p>

              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => setShowActivationDialog(true)}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors shadow-sm"
                >
                  Activate License
                </button>
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => setAdminDismissed(true)}
                    className="w-full py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-bold rounded-lg transition-colors shadow-sm"
                  >
                    Continue as Admin
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      navigate('/login');
                    }}
                    className="w-full py-3 text-sm font-bold text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                  >
                    Return to Login
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area - Stable structure to prevent remounting */}
      <div 
        style={{ 
          pointerEvents: (isCashier && isExpired) ? 'none' : 'auto',
          filter: (isCashier && isExpired) ? 'blur(1px)' : 'none'
        }}
      >
        {children}
      </div>

      {/* Alert Bar - Understated & Clean */}
      {showAlert && isExpiringSoon && !isExpired && (
        <div className="fixed top-0 left-0 right-0 z-[9999] bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800/50">
          <div className="container mx-auto px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FiAlertTriangle className="w-4 h-4 text-amber-600" />
              <p className="text-sm text-gray-800 dark:text-gray-200 font-medium">
                License expires in <span className="font-bold underline text-amber-700 dark:text-amber-400">{daysUntilExpiry} days</span>. 
                Please renew soon to avoid session interruption.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setShowActivationDialog(true)}
                className="text-xs font-bold text-amber-700 dark:text-amber-400 hover:underline px-2 py-1"
              >
                Renew Now
              </button>
              <button onClick={() => setShowAlert(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <FiX className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Notification */}
      {showSuccessAlert && (
        <div className="fixed bottom-6 right-6 z-[10000]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-100 dark:border-gray-700 p-4 flex items-center gap-4 min-w-[300px]">
            <FiCheckCircle className="w-6 h-6 text-emerald-500" />
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-white">Success</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">License updated for 6 months.</p>
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
