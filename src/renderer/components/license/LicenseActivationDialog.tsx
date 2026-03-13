import React, { useState, useEffect } from 'react';
import { FiX, FiAlertCircle, FiKey, FiCheckCircle, FiClock } from 'react-icons/fi';
import {
  hasExceededLimit,
  getRemainingAttempts,
  incrementAttempt,
  resetAttempts,
} from '../../utils/licenseAttempts';

const MAX_ATTEMPTS_PER_DAY = 40;

interface LicenseActivationDialogProps {
  onClose: () => void;
  onActivate: (code: string) => Promise<{ success: boolean; error?: string }>;
  isExpired: boolean;
}

const LicenseActivationDialog: React.FC<LicenseActivationDialogProps> = ({
  onClose,
  onActivate,
  isExpired,
}) => {
  const [activationCode, setActivationCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState(getRemainingAttempts());
  const [isBlocked, setIsBlocked] = useState(hasExceededLimit());

  useEffect(() => {
    setRemainingAttempts(getRemainingAttempts());
    setIsBlocked(hasExceededLimit());
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isBlocked) {
      setError('Daily limit reached. Please contact support or try again tomorrow.');
      return;
    }

    if (!activationCode.trim()) {
      setError('Please enter your license key.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await onActivate(activationCode.trim().toUpperCase());

      if (result.success) {
        resetAttempts();
        setSuccess(true);
        setTimeout(() => onClose(), 2000);
      } else {
        incrementAttempt();
        const newRemaining = getRemainingAttempts();
        setRemainingAttempts(newRemaining);
        setIsBlocked(hasExceededLimit());
        setError(result.error || 'Invalid activation code. Please verify your key.');
      }
    } catch (err) {
      setError('A system error occurred. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-gray-900/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full mx-4 border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header - Clean & Professional */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center gap-3">
            <FiKey className={`w-5 h-5 ${isExpired ? 'text-red-600' : 'text-emerald-600'}`} />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              {isExpired ? 'System Activation' : 'License Renewal'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-gray-400 transition-colors"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {success ? (
            <div className="text-center py-6">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <FiCheckCircle className="w-7 h-7 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Activated Successfully</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Your system has been updated. This window will close automatically.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                  {isExpired 
                    ? 'The current license has expired. Enter a valid activation key to restore full access to pharmacy operations.'
                    : 'Enter your 14-character activation key below to extend your current license term.'}
                </p>
              </div>

              {isBlocked ? (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-lg flex items-start gap-3">
                  <FiAlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700 dark:text-red-400 font-medium leading-relaxed">
                    Security lock active. Too many failed attempts. Please try again in 24 hours or contact your administrator.
                  </p>
                </div>
              ) : (
                <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 rounded-lg flex items-start gap-3">
                  <FiClock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-blue-700 dark:text-blue-300 font-medium">
                      Note: Valid keys provide 6 months of system access.
                    </p>
                    {remainingAttempts < MAX_ATTEMPTS_PER_DAY && (
                      <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-1">
                        Attempts remaining today: <strong>{remainingAttempts}</strong>
                      </p>
                    )}
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                    License Key
                  </label>
                  <input
                    type="text"
                    value={activationCode}
                    onChange={(e) => {
                      setActivationCode(e.target.value.toUpperCase());
                      setError(null);
                    }}
                    placeholder="Enter 14-character code"
                    disabled={isLoading || isBlocked}
                    className="w-full px-4 py-3 bg-gray-50 text-gray-600 dark:bg-gray-800 border  border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-md font-mono tracking-widest disabled:opacity-50"
                  />
                </div>

                {error && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-lg flex items-center gap-3">
                    <FiAlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                    <p className="text-xs text-red-700 dark:text-red-400 font-medium">{error}</p>
                  </div>
                )}

                <div className="flex items-center gap-3 mt-8">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isLoading}
                    className="flex-1 px-4 py-2.5 text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors border border-gray-200 dark:border-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading || !activationCode.trim() || isBlocked}
                    className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-all shadow-sm flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Validating...
                      </>
                    ) : (
                      'Activate System'
                    )}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default LicenseActivationDialog;
