/**
 * Utility to track license activation attempts per day
 */

const STORAGE_KEY = 'license_activation_attempts';
const MAX_ATTEMPTS_PER_DAY = 20; // Increased from 5 to 20

interface AttemptData {
  date: string; // YYYY-MM-DD format
  count: number;
}

/**
 * Get today's date in YYYY-MM-DD format
 */
const getTodayDate = (): string => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

/**
 * Get current attempt data
 */
export const getAttemptData = (): AttemptData => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return { date: getTodayDate(), count: 0 };
    }

    const data: AttemptData = JSON.parse(stored);
    const today = getTodayDate();

    // Reset if it's a new day
    if (data.date !== today) {
      return { date: today, count: 0 };
    }

    return data;
  } catch {
    return { date: getTodayDate(), count: 0 };
  }
};

/**
 * Increment attempt count
 */
export const incrementAttempt = (): void => {
  const data = getAttemptData();
  data.count += 1;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

/**
 * Reset attempts (call on successful activation)
 */
export const resetAttempts = (): void => {
  const data = { date: getTodayDate(), count: 0 };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

/**
 * Check if user has exceeded daily attempt limit
 */
export const hasExceededLimit = (): boolean => {
  const data = getAttemptData();
  return data.count >= MAX_ATTEMPTS_PER_DAY;
};

/**
 * Get remaining attempts
 */
export const getRemainingAttempts = (): number => {
  const data = getAttemptData();
  return Math.max(0, MAX_ATTEMPTS_PER_DAY - data.count);
};

/**
 * Force reset attempts (for testing/debugging)
 */
export const forceResetAttempts = (): void => {
  localStorage.removeItem(STORAGE_KEY);
  console.log('License attempts have been reset');
};



