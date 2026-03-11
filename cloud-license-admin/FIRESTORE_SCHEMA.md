## Firestore collections for cloud-license-admin

### pharmacies

- `name` (string, required)
- `email` (string, required)
- `phone` (string, optional)
- `doctorName` (string, optional)
- `address` (string, optional)
- `city` (string, optional)
- `country` (string, optional)
- `createdAt` (timestamp, optional)
- `updatedAt` (timestamp, optional)

### licenseRequests

- `pharmacyName` (string, required)
- `email` (string, required)
- `phone` (string, optional)
- `doctorName` (string, optional)
- `address` (string, optional)
- `city` (string, optional)
- `country` (string, optional)
- `installationId` (string, optional)
- `status` (string: `pending` | `approved` | `rejected`)
- `requestedAt` (ISO string / timestamp)
- `handledBy` (string uid, optional)
- `handledAt` (ISO string / timestamp, optional)
- `notes` (string, optional)

### licenses

- `pharmacyId` (string, required)
- `installationId` (string, optional)
- `plan` (string, optional)
- `licenseKey` (string, required)
- `validFrom` (ISO string)
- `validUntil` (ISO string)
- `status` (string: `active` | `expired` | `revoked`)
- `createdAt` (ISO string / timestamp)
- `createdBy` (string uid)

