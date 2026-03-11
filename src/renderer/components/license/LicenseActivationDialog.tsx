import React, { useState, useEffect } from 'react';
import { FiX, FiAlertCircle } from 'react-icons/fi';
import {
  hasExceededLimit,
  getRemainingAttempts,
  incrementAttempt,
  resetAttempts,
} from '../../utils/licenseAttempts';

const MAX_ATTEMPTS_PER_DAY = 40; // Daily activation attempts limit

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
      setError(
        'You have exceeded the maximum number of attempts for today. Please try again tomorrow.'
      );
      return;
    }

    if (!activationCode.trim()) {
      setError('Please enter an activation code');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await onActivate(activationCode.trim());

      if (result.success) {
        // Reset attempts on success
        resetAttempts();
        setRemainingAttempts(MAX_ATTEMPTS_PER_DAY);
        setIsBlocked(false);
        setSuccess(true);
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        // Increment failed attempt
        incrementAttempt();
        const newRemaining = getRemainingAttempts();
        setRemainingAttempts(newRemaining);
        setIsBlocked(hasExceededLimit());

        // Show specific error message
        if (result.error?.includes('Invalid')) {
          setError(
            `Wrong license code. You have ${newRemaining} attempt${newRemaining !== 1 ? 's' : ''
            } remaining today.`
          );
        } else {
          setError(result.error || 'Invalid activation code. Please try again.');
        }
      }
    } catch (err) {
      incrementAttempt();
      const newRemaining = getRemainingAttempts();
      setRemainingAttempts(newRemaining);
      setIsBlocked(hasExceededLimit());
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div
          className={`px-6 py-4 ${isExpired
            ? 'bg-gradient-to-r from-red-500 to-orange-500'
            : 'bg-gradient-to-r from-emerald-500 to-teal-500'
            } text-white`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded bg-white/20 flex items-center justify-center">
                <span className="text-sm font-bold">🔑</span>
              </div>
              <h2 className="text-xl font-bold">
                {isExpired ? 'License Activation Required' : 'Activate License'}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 hover:bg-white/20 rounded-lg transition-colors"
            >
              <FiX className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {success ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-10 h-10 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                License Activated Successfully!
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Your license has been activated for 6 months. You can now use all features.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <p className="text-gray-700 dark:text-gray-300 mb-4">
                  {isExpired
                    ? 'Your license has expired. Please enter a valid activation code to continue using the application.'
                    : 'Enter your activation code to activate your license for 6 months.'}
                </p>
                {isBlocked ? (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
                    <div className="flex items-center gap-2 text-red-800 dark:text-red-300">
                      <FiAlertCircle className="w-5 h-5" />
                      <p className="text-sm font-semibold">
                        Maximum attempts reached. Please try again tomorrow.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                    <p className="text-sm text-blue-800 dark:text-blue-300">
                      <strong>Note:</strong> Entering a valid activation code will extend your
                      license for 6 months from today.
                    </p>
                    {remainingAttempts < MAX_ATTEMPTS_PER_DAY && (
                      <p className="text-sm text-blue-700 dark:text-blue-400 mt-2">
                        <strong>Attempts remaining today:</strong> {remainingAttempts} of{' '}
                        {MAX_ATTEMPTS_PER_DAY}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                  <label
                    htmlFor="activation-code"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >
                    Activation Code
                  </label>
                  <input
                  id="activation-code"
                  type="text"
                  value={activationCode}
                  onChange={(e) => {
                      setActivationCode(e.target.value);
                      setError(null);
                    }}
                    placeholder="Enter activation code"
                    disabled={isLoading}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                    <FiAlertCircle className="w-5 h-5 flex-shrink-0" />
                    <p className="text-sm">{error}</p>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isLoading}
                    className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading || !activationCode.trim() || isBlocked}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-lg font-semibold hover:from-emerald-600 hover:to-teal-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                  >
                    {isLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg
                          className="animate-spin h-5 w-5"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        Activating...
                      </span>
                    ) : (
                      'Activate License'
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
