/**
 * Firebase Configuration for Backend (Main Process)
 * 
 * This configuration is used by the Electron main process to interact with Firebase.
 * Credentials are loaded from environment variables for security.
 */

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

/**
 * Get Firebase configuration from environment variables
 */
export function getFirebaseConfig(): FirebaseConfig | null {
  // Check if Firebase is configured
  if (!process.env.FIREBASE_API_KEY || !process.env.FIREBASE_PROJECT_ID) {
    console.warn('⚠️ Firebase not configured. Using local authentication fallback.');
    return null;
  }

  return {
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID || '',
  };
}

/**
 * Check if Firebase is configured
 */
export function isFirebaseConfigured(): boolean {
  return !!process.env.FIREBASE_API_KEY && !!process.env.FIREBASE_PROJECT_ID;
}
