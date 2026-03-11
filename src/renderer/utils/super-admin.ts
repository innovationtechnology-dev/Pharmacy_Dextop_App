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
  phone?: string;
  address?: string;
  firstName?: string;
  lastName?: string;
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

export interface GeneratedLicense {
  id: number;
  code: string;
  pharmacy_name: string | null;
  doctor_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  generated_at: string;
  is_used: number;
  used_at: string | null;
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
    window.electron.ipcRenderer.once('super-admin-login-reply', (response: any) => {
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
    window.electron.ipcRenderer.once('super-admin-get-users-reply', (users: any) => {
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
    window.electron.ipcRenderer.once('super-admin-create-user-reply', (response: any) => {
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
    window.electron.ipcRenderer.once('super-admin-update-user-reply', (response: any) => {
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
    window.electron.ipcRenderer.once('super-admin-update-password-reply', (response: any) => {
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
    window.electron.ipcRenderer.once('super-admin-delete-user-reply', (response: any) => {
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
    window.electron.ipcRenderer.once('super-admin-get-licenses-reply', (licenses: any) => {
      resolve(licenses);
    });

    window.electron.ipcRenderer.sendMessage('super-admin-get-licenses', []);
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
    window.electron.ipcRenderer.once('super-admin-update-license-reply', (response: any) => {
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
    window.electron.ipcRenderer.once('super-admin-delete-license-reply', (response: any) => {
      resolve(response);
    });

    window.electron.ipcRenderer.sendMessage('super-admin-delete-license', [licenseId] as any);
  });
};

/**
 * Get all generated license keys
 */
export const getAllGeneratedLicenses = async (): Promise<GeneratedLicense[]> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('super-admin-get-generated-licenses-reply', (rows: any) => {
      resolve(rows);
    });
    window.electron.ipcRenderer.sendMessage('super-admin-get-generated-licenses', []);
  });
};

/**
 * Revoke a generated license key (resets is_used to 0 so client can re-activate)
 */
export const revokeGeneratedLicense = async (
  id: number
): Promise<{ success: boolean; error?: string }> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once(
      'super-admin-revoke-generated-license-reply',
      (response: any) => {
        resolve(response);
      }
    );
    window.electron.ipcRenderer.sendMessage('super-admin-revoke-generated-license', [id] as any);
  });
};

/**
 * Delete a generated license key entirely
 */
export const deleteGeneratedLicense = async (
  id: number
): Promise<{ success: boolean; error?: string }> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once(
      'super-admin-delete-generated-license-reply',
      (response: any) => {
        resolve(response);
      }
    );
    window.electron.ipcRenderer.sendMessage('super-admin-delete-generated-license', [id] as any);
  });
};

/**
 * Download database
 */
export const downloadDatabase = async (): Promise<{ success: boolean; error?: string; path?: string }> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('super-admin-download-database-reply', (response: any) => {
      resolve(response);
    });

    window.electron.ipcRenderer.sendMessage('super-admin-download-database', []);
  });
};
/**
 * Import database
 */
export const importDatabase = async (): Promise<{ success: boolean; error?: string }> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('super-admin-import-database-reply', (response: any) => {
      resolve(response);
    });

    window.electron.ipcRenderer.sendMessage('super-admin-import-database', []);
  });
};
