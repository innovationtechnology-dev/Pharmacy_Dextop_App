/**
 * Firebase Configuration for Frontend (Renderer Process)
 * 
 * This configuration is used by the Electron renderer process (React app).
 * 
 * SECURITY NOTE: In Electron apps, we can load config from backend instead of hardcoding.
 * This is more secure than web apps where config must be public.
 */

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

/**
 * Get Firebase configuration from backend (more secure for Electron)
 * Falls back to hardcoded config if backend doesn't provide it
 */
export async function getFirebaseConfig(): Promise<FirebaseConfig | null> {
  try {
    // Try to get config from backend via IPC
    const config = await new Promise<FirebaseConfig | null>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 1000);
      
      window.electron.ipcRenderer.once('firebase-get-config-reply', (response: any) => {
        clearTimeout(timeout);
        resolve(response);
      });
      
      window.electron.ipcRenderer.sendMessage('firebase-get-config', []);
    });

    if (config) {
      return config;
    }
  } catch (error) {
    console.warn('Could not load Firebase config from backend, using fallback');
  }

  // Fallback: Return null to indicate Firebase should be handled by backend only
  // This is more secure - frontend doesn't need Firebase credentials
  return null;
}

/**
 * Check if Firebase is configured
 */
export async function isFirebaseConfigured(): Promise<boolean> {
  const config = await getFirebaseConfig();
  return config !== null && !!config.apiKey && !!config.projectId;
}

/**
 * Get Firebase configuration status
 */
export async function getFirebaseStatus(): Promise<{
  configured: boolean;
  message: string;
}> {
  const configured = await isFirebaseConfigured();
  
  if (configured) {
    return {
      configured: true,
      message: 'Firebase is configured and ready',
    };
  }

  return {
    configured: false,
    message: 'Firebase not configured - using local authentication',
  };
}
