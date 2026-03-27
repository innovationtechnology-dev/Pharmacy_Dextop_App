/**
 * Firebase Configuration for Frontend (Renderer Process)
 * 
 * This configuration is used by the Electron renderer process (React app).
 * 
 * IMPORTANT: These credentials are for your Firebase project.
 * In production, consider loading these from a secure backend endpoint.
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
 * Firebase configuration
 * Replace with your actual Firebase project credentials
 */
export const firebaseConfig: FirebaseConfig = {
  apiKey: "AIzaSyBQl5IN-qG9Tt5EDVRLrYMduV9zWPGpib8",
  authDomain: "pharmacy-management-syst-883bc.firebaseapp.com",
  projectId: "pharmacy-management-syst-883bc",
  storageBucket: "pharmacy-management-syst-883bc.firebasestorage.app",
  messagingSenderId: "715722661484",
  appId: "1:715722661484:web:09f65f53c1fcb2c7f60249",
  measurementId: "G-BQNCGSZM64",
};

/**
 * Check if Firebase is configured
 */
export function isFirebaseConfigured(): boolean {
  return !!firebaseConfig.apiKey && !!firebaseConfig.projectId;
}

/**
 * Get Firebase configuration status
 */
export function getFirebaseStatus(): {
  configured: boolean;
  message: string;
} {
  if (isFirebaseConfigured()) {
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
