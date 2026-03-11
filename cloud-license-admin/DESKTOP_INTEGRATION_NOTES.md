## Desktop app integration with cloud-license-admin

### 1. Connectivity check (admin panel in Electron app)

- Add a button, e.g. **“Check license server connection”**, which calls:
  - `GET https://your-domain.com/api/ping`
- If the response is `{ ok: true }`, show a success message.

### 2. License request submission

From an admin-only screen in the Electron app:

- Collect:
  - `pharmacyName`
  - `email`
  - `phone`
  - `doctorName`
  - `address`, `city`, `country`
  - `installationId` (optional unique ID for that machine/installation)
- Send a JSON POST to:
  - `POST https://your-domain.com/api/license-requests`
- Store the returned `id` if you want to correlate locally.

### 3. License activation (cashier machine)

Reuse the existing `LicenseActivationDialog`:

- When the cashier enters the license key you issue from the web panel:
  - Call either:
    - Local verification using `jsonwebtoken` (public key / shared secret), or
    - `POST https://your-domain.com/api/licenses/validate` with `{ licenseKey }`.
  - On success:
    - Persist the license payload and `validUntil` in your local `licenses` table.
    - Update `getLicenseStatus` to:
      - Mark expired when `validUntil < now`.
      - Mark expiring soon when `validUntil - now < X days`.

After this, your existing `LicenseOverlay` logic for blocking cashier access when expired can remain the same, using the new `validUntil` field.

