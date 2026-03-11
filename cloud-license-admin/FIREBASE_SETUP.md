# Firebase setup for cloud-license-admin

To run the Next.js super admin panel, create a Firebase project and configure:

- Enable **Authentication** (Email/Password).
- Enable **Firestore** database.

Then provide these values in a `.env.local` file:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `FIREBASE_SERVICE_ACCOUNT` – JSON string of a service account with access to Firestore and Auth.
- `LICENSE_JWT_PRIVATE_KEY` – secret used to sign long‑lived license tokens.

