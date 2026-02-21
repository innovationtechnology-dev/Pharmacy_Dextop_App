/**
 * Super Admin utility functions
 * Handles IPC communication with the backend for super admin operations
 */

export interface SuperAdminLoginResponse {
  success: boolean;
  token?: string;
  error?: string;
}

export interface User {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  created_at: string;
}

export interface License {
  id: number;
  user_id: number;
  activation_code: string;
  expiry_date: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface ActivationCode {
  id: number;
  code: string;
  expiry_date: string;
  is_used: number;
  used_by_user_id: number | null;
  used_at: string | null;
  created_at: string;
}

/**
 * Store super admin token
 */
export const setSuperAdminToken = (token: string): void => {
  localStorage.setItem('super_admin_token', token);
};

/**
 * Get super admin token
 */
export const getSuperAdminToken = (): string | null => {
  return localStorage.getItem('super_admin_token');
};

/**
 * Remove super admin token
 */
export const removeSuperAdminToken = (): void => {
  localStorage.removeItem('super_admin_token');
};

/**
 * Check if super admin is authenticated
 */
export const isSuperAdminAuthenticated = (): boolean => {
  return !!getSuperAdminToken();
};

/**
 * Login as super admin
 */
export const superAdminLogin = async (
  email: string,
  password: string
): Promise<SuperAdminLoginResponse> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('super-admin-login-reply', (response: SuperAdminLoginResponse) => {
      if (response.success && response.token) {
        setSuperAdminToken(response.token);
      }
      resolve(response);
    });

    window.electron.ipcRenderer.sendMessage('super-admin-login', [email, password] as any);
  });
};

/**
 * Logout super admin
 */
export const superAdminLogout = (): void => {
  removeSuperAdminToken();
};

/**
 * Get all users
 */
export const getAllUsers = async (): Promise<User[]> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('super-admin-get-users-reply', (users: User[]) => {
      resolve(users);
    });

    window.electron.ipcRenderer.sendMessage('super-admin-get-users', []);
  });
};

/**
 * Create user
 */
export const createUser = async (
  name: string,
  email: string,
  password: string
): Promise<{ success: boolean; error?: string; user?: User }> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('super-admin-create-user-reply', (response) => {
      resolve(response);
    });

    window.electron.ipcRenderer.sendMessage('super-admin-create-user', [name, email, password] as any);
  });
};

/**
 * Update user
 */
export const updateUser = async (
  userId: number,
  name: string,
  email: string
): Promise<{ success: boolean; error?: string }> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('super-admin-update-user-reply', (response) => {
      resolve(response);
    });

    window.electron.ipcRenderer.sendMessage('super-admin-update-user', [userId, name, email] as any);
  });
};

/**
 * Update user password
 */
export const updateUserPassword = async (
  userId: number,
  newPassword: string
): Promise<{ success: boolean; error?: string }> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('super-admin-update-password-reply', (response) => {
      resolve(response);
    });

    window.electron.ipcRenderer.sendMessage('super-admin-update-password', [userId, newPassword] as any);
  });
};

/**
 * Delete user
 */
export const deleteUser = async (userId: number): Promise<{ success: boolean; error?: string }> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('super-admin-delete-user-reply', (response) => {
      resolve(response);
    });

    window.electron.ipcRenderer.sendMessage('super-admin-delete-user', [userId] as any);
  });
};

/**
 * Get all licenses
 */
export const getAllLicenses = async (): Promise<License[]> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('super-admin-get-licenses-reply', (licenses: License[]) => {
      resolve(licenses);
    });

    window.electron.ipcRenderer.sendMessage('super-admin-get-licenses', []);
  });
};

/**
 * Get all activation codes
 */
export const getAllActivationCodes = async (): Promise<ActivationCode[]> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('super-admin-get-activation-codes-reply', (codes: ActivationCode[]) => {
      resolve(codes);
    });

    window.electron.ipcRenderer.sendMessage('super-admin-get-activation-codes', []);
  });
};

/**
 * Update license
 */
export const updateLicense = async (
  licenseId: number,
  expiryDate: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('super-admin-update-license-reply', (response) => {
      resolve(response);
    });

    window.electron.ipcRenderer.sendMessage('super-admin-update-license', [
      licenseId,
      expiryDate,
      isActive,
    ] as any);
  });
};

/**
 * Delete license
 */
export const deleteLicense = async (licenseId: number): Promise<{ success: boolean; error?: string }> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('super-admin-delete-license-reply', (response) => {
      resolve(response);
    });

    window.electron.ipcRenderer.sendMessage('super-admin-delete-license', [licenseId] as any);
  });
};

/**
 * Update activation code
 */
export const updateActivationCode = async (
  codeId: number,
  code: string,
  expiryDate: string,
  isUsed: boolean
): Promise<{ success: boolean; error?: string }> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('super-admin-update-activation-code-reply', (response) => {
      resolve(response);
    });

    window.electron.ipcRenderer.sendMessage('super-admin-update-activation-code', [
      codeId,
      code,
      expiryDate,
      isUsed,
    ] as any);
  });
};

/**
 * Delete activation code
 */
export const deleteActivationCode = async (
  codeId: number
): Promise<{ success: boolean; error?: string }> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('super-admin-delete-activation-code-reply', (response) => {
      resolve(response);
    });

    window.electron.ipcRenderer.sendMessage('super-admin-delete-activation-code', [codeId] as any);
  });
};

/**
 * Download database
 */
export const downloadDatabase = async (): Promise<{ success: boolean; error?: string; path?: string }> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('super-admin-download-database-reply', (response) => {
      resolve(response);
    });

    window.electron.ipcRenderer.sendMessage('super-admin-download-database', []);
  });
};

