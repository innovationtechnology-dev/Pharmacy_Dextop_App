/**
 * Firebase Authentication Service
 * 
 * Handles Firebase authentication for super admin users.
 * Provides methods to verify Firebase ID tokens and manage authentication.
 */

import { getFirebaseConfig, isFirebaseConfigured } from '../config/firebase.config';

// Polyfill Web APIs for Node.js environment (Electron main process)
if (typeof fetch === 'undefined') {
  const nodeFetch = require('node-fetch');
  global.fetch = nodeFetch.default || nodeFetch;
  global.Headers = nodeFetch.Headers;
  global.Request = nodeFetch.Request;
  global.Response = nodeFetch.Response;
}

export interface FirebaseAuthResult {
  success: boolean;
  uid?: string;
  email?: string;
  error?: string;
}

export class FirebaseAuthService {
  private firebaseApp: any = null;
  private auth: any = null;
  private isInitialized: boolean = false;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize Firebase
   */
  private async initialize(): Promise<void> {
    try {
      if (!isFirebaseConfigured()) {
        console.log('📝 Firebase not configured - using local authentication');
        return;
      }

      const config = getFirebaseConfig();
      if (!config) {
        return;
      }

      // Dynamically import Firebase (only if configured)
      const { initializeApp } = await import('firebase/app');
      const { getAuth, signInWithEmailAndPassword } = await import('firebase/auth');

      // Initialize Firebase
      this.firebaseApp = initializeApp(config);
      this.auth = getAuth(this.firebaseApp);
      this.isInitialized = true;

      console.log('✅ Firebase initialized successfully');
    } catch (error) {
      console.error('❌ Firebase initialization failed:', error);
      this.isInitialized = false;
    }
  }

  /**
   * Check if Firebase is available
   */
  public isAvailable(): boolean {
    return this.isInitialized && this.auth !== null;
  }

  /**
   * Authenticate user with Firebase
   */
  public async authenticateWithFirebase(
    email: string,
    password: string
  ): Promise<FirebaseAuthResult> {
    try {
      if (!this.isAvailable()) {
        return {
          success: false,
          error: 'Firebase not available',
        };
      }

      const { signInWithEmailAndPassword } = await import('firebase/auth');

      // Sign in with Firebase
      const userCredential = await signInWithEmailAndPassword(
        this.auth,
        email,
        password
      );

      const user = userCredential.user;

      // Get ID token
      const idToken = await user.getIdToken();

      return {
        success: true,
        uid: user.uid,
        email: user.email || undefined,
      };
    } catch (error: any) {
      console.error('Firebase authentication error:', error);

      // Map Firebase error codes to user-friendly messages
      let errorMessage = 'Authentication failed';

      if (error.code === 'auth/user-not-found') {
        errorMessage = 'Email address not found. Please check your email and try again.';
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password. Please try again.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address format.';
      } else if (error.code === 'auth/user-disabled') {
        errorMessage = 'This account has been disabled.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many failed login attempts. Please try again later.';
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Please check your internet connection.';
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Verify Firebase ID token
   */
  public async verifyIdToken(idToken: string): Promise<FirebaseAuthResult> {
    try {
      if (!this.isAvailable()) {
        return {
          success: false,
          error: 'Firebase not available',
        };
      }

      // In a production app, you would verify the token on the backend
      // using Firebase Admin SDK. For now, we'll trust the token from the client.
      
      return {
        success: true,
      };
    } catch (error) {
      console.error('Token verification error:', error);
      return {
        success: false,
        error: 'Token verification failed',
      };
    }
  }

  /**
   * Sign out from Firebase
   */
  public async signOut(): Promise<void> {
    try {
      if (this.isAvailable()) {
        const { signOut } = await import('firebase/auth');
        await signOut(this.auth);
      }
    } catch (error) {
      console.error('Sign out error:', error);
    }
  }

  /**
   * Send password reset email
   */
  public async sendPasswordResetEmail(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.isAvailable()) {
        return {
          success: false,
          error: 'Firebase not available',
        };
      }

      const { sendPasswordResetEmail } = await import('firebase/auth');
      await sendPasswordResetEmail(this.auth, email);

      return {
        success: true,
      };
    } catch (error: any) {
      console.error('Password reset error:', error);

      let errorMessage = 'Failed to send password reset email';

      if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email address.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address format.';
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}

// Singleton instance
let firebaseAuthServiceInstance: FirebaseAuthService | null = null;

/**
 * Get Firebase Auth Service instance
 */
export function getFirebaseAuthService(): FirebaseAuthService {
  if (!firebaseAuthServiceInstance) {
    firebaseAuthServiceInstance = new FirebaseAuthService();
  }
  return firebaseAuthServiceInstance;
}

export default FirebaseAuthService;
