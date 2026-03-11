/**
 * License utility functions
 * Handles IPC communication with the backend for license operations
 */

export interface LicenseStatus {
  isActive: boolean;
  expiryDate: string | null;
  daysUntilExpiry: number | null;
  isExpired: boolean;
  isExpiringSoon: boolean;
}

export interface License {
  id?: number;
  user_id: number;
  activation_code: string;
  expiry_date: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ActivateLicenseResponse {
  success: boolean;
  license?: License;
  error?: string;
}

/**
 * Activate license with code
 */
export const activateLicense = async (userId: number, activationCode: string): Promise<ActivateLicenseResponse> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('license-activate-reply', (response: any) => {
      resolve(response);
    });

    window.electron.ipcRenderer.sendMessage('license-activate', [userId, activationCode] as any);
  });
};

/**
 * Get license status for user
 */
export const getLicenseStatus = async (userId: number): Promise<LicenseStatus> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('license-get-status-reply', (status: any) => {
      resolve(status);
    });

    window.electron.ipcRenderer.sendMessage('license-get-status', [userId] as any);
  });
};

/**
 * Get license details for user
 */
export const getLicense = async (userId: number): Promise<License | null> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('license-get-reply', (license: any) => {
      resolve(license);
    });

    window.electron.ipcRenderer.sendMessage('license-get', [userId] as any);
  });
};

