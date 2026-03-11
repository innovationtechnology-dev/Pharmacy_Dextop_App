import admin from 'firebase-admin';

let adminInitialized = false;

export function getFirebaseAdminApp() {
  // Reuse an existing app if one is already initialized
  if (admin.apps.length > 0) {
    return admin.apps[0]!;
  }

  if (!adminInitialized) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;

    if (!serviceAccountJson) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT env var is not set');
    }

    const serviceAccount = JSON.parse(serviceAccountJson);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    adminInitialized = true;
  }

  return admin.app();
}

export function getAdminFirestore() {
  return getFirebaseAdminApp().firestore();
}

export function getAdminAuth() {
  return getFirebaseAdminApp().auth();
}

