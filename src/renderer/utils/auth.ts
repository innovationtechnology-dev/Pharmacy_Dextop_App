/**
 * Authentication utility functions
 * Handles IPC communication with the backend for authentication
 */

export interface User {
  id: number;
  name: string;
  email: string;
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
export const login = async (email: string, password: string): Promise<AuthResponse> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('auth-login-reply', (response: AuthResponse) => {
      if (response.success && response.token && response.user) {
        setAuthToken(response.token);
        setAuthUser(response.user);
      }
      resolve(response);
    });

    window.electron.ipcRenderer.sendMessage('auth-login', [{ email, password }] as any);
  });
};

/**
 * Signup user
 */
export const signup = async (name: string, email: string, password: string): Promise<AuthResponse> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('auth-signup-reply', (response: AuthResponse) => {
      if (response.success && response.token && response.user) {
        setAuthToken(response.token);
        setAuthUser(response.user);
      }
      resolve(response);
    });

    window.electron.ipcRenderer.sendMessage('auth-signup', [{ name, email, password }] as any);
  });
};

/**
 * Logout user
 */
export const logout = (): void => {
  removeAuthToken();
  removeAuthUser();
};

/**
 * Verify token with backend
 */
export const verifyToken = async (token: string): Promise<{ valid: boolean; user: User | null }> => {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once('auth-verify-token-reply', (response: { valid: boolean; user: User | null }) => {
      resolve(response);
    });

    window.electron.ipcRenderer.sendMessage('auth-verify-token', [token] as any);
  });
};
