export interface LicensePayload {
  pharmacyId: string;
  installationId?: string | null;
  validFrom: string; // ISO string
  validUntil: string; // ISO string
  plan?: string;
}

const DEFAULT_LICENSE_DURATION_MONTHS = 6;

export function createLicensePayload(input: {
  pharmacyId: string;
  installationId?: string | null;
  plan?: string;
  durationMonths?: number;
}): LicensePayload {
  const now = new Date();
  const validFrom = now.toISOString();
  const durationMonths = input.durationMonths ?? DEFAULT_LICENSE_DURATION_MONTHS;
  const until = new Date(now);
  until.setMonth(until.getMonth() + durationMonths);

  return {
    pharmacyId: input.pharmacyId,
    installationId: input.installationId ?? null,
    plan: input.plan,
    validFrom,
    validUntil: until.toISOString()
  };
}

/**
 * Generate a short, human-friendly license key.
 *
 * Default length is 14 characters using a restricted
 * alphabet to avoid confusing characters (0/O, 1/I).
 *
 * Example: 9F7K2M4Q8R6T1B
 */
export function generateShortLicenseKey(length = 14): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let key = '';

  for (let i = 0; i < length; i += 1) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return key;
}

