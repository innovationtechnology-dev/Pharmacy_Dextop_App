/**
 * Authentication utility functions
 * Handles IPC communication with the backend for authentication
 */

export interface User {
  id: number;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  role: string;
  firstName?: string;
  lastName?: string;
  profilePicture?: string;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  user?: User;
  error?: string;
}

/**
 * Store token in localStorage
 */
export const setAuthToken = (token: string): void => {
  localStorage.setItem('auth_token', token);
};

/**
 * Get token from localStorage
 */
export const getAuthToken = (): string | null => {
  return localStorage.getItem('auth_token');
};

/**
 * Remove token from localStorage
 */
export const removeAuthToken = (): void => {
  localStorage.removeItem('auth_token');
};

/**
 * Store user in localStorage
 */
export const setAuthUser = (user: User): void => {
  localStorage.setItem('auth_user', JSON.stringify(user));
};

/**
 * Get user from localStorage
 */
export const getAuthUser = (): User | null => {
  const userStr = localStorage.getItem('auth_user');
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
};

/**
 * Remove user from localStorage
 */
export const removeAuthUser = (): void => {
  localStorage.removeItem('auth_user');
};

/**
 * Check if user is authenticated
 */
export const isAuthenticated = (): boolean => {
  return !!getAuthToken() && !!getAuthUser();
};

/**
 * Login user
 */
export const login = async (email: string, password: string): Promise<AuthResponse & { passwordChangeRequired?: boolean }> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('auth-login-reply', (response: any) => {
      if (response.success && response.token && response.user) {
        setAuthToken(response.token);
        setAuthUser(response.user);
        // Store password change required flag
        if (response.passwordChangeRequired) {
          sessionStorage.setItem('passwordChangeRequired', 'true');
        } else {
          sessionStorage.removeItem('passwordChangeRequired');
        }
      }
      resolve(response);
    });

    window.electron.ipcRenderer.sendMessage('auth-login', [{ email, password }] as any);
  });
};

/**
 * Signup user
 */
export const signup = async (name: string, email: string, password: string, role: string = 'admin'): Promise<AuthResponse> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('auth-signup-reply', (response: any) => {
      if (response.success && response.token && response.user) {
        setAuthToken(response.token);
        setAuthUser(response.user);
      }
      resolve(response);
    });

    window.electron.ipcRenderer.sendMessage('auth-signup', [{ name, email, password, role }] as any);
  });
};

/**
 * Logout user
 */
export const logout = (): void => {
  removeAuthToken();
  removeAuthUser();
  sessionStorage.removeItem('passwordChangeRequired');
};

/**
 * Verify token with backend
 */
export const verifyToken = async (token: string): Promise<{ valid: boolean; user: User | null }> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('auth-verify-token-reply', (response: any) => {
      resolve(response);
    });

    window.electron.ipcRenderer.sendMessage('auth-verify-token', [token] as any);
  });
};

export interface UpdateProfileParams {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  profilePicture?: string;
}

/**
 * Update current user profile (persists to DB). Returns updated user on success.
 */
export const updateProfile = async (userId: number, params: UpdateProfileParams): Promise<{ success: boolean; user?: User; error?: string }> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('auth-update-profile-reply', (response: any) => {
      if (response.success && response.user) {
        setAuthUser(response.user);
      }
      resolve(response);
    });
    window.electron.ipcRenderer.sendMessage('auth-update-profile', [userId, params] as any);
  });
};

/**
 * Set password change required flag for a user (admin action)
 */
export const setPasswordChangeRequired = async (userId: number, required: boolean): Promise<{ success: boolean; error?: string }> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('auth-set-password-change-required-reply', (response: any) => {
      resolve(response);
    });
    window.electron.ipcRenderer.sendMessage('auth-set-password-change-required', [userId, required] as any);
  });
};

/**
 * Change user password (verifies current password, sets new one, clears password_change_required flag)
 */
export const changePassword = async (userId: number, currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('auth-change-password-reply', (response: any) => {
      if (response.success) {
        sessionStorage.removeItem('passwordChangeRequired');
      }
      resolve(response);
    });
    window.electron.ipcRenderer.sendMessage('auth-change-password', [userId, currentPassword, newPassword] as any);
  });
};

