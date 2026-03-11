export type CloudLicenseServerStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'ok'; message: string }
  | { state: 'error'; message: string };

const STORAGE_KEY = 'cloudLicenseApiBaseUrl';
const DEFAULT_BASE_URL = 'http://localhost:3000';

export const getCloudLicenseApiBaseUrl = (): string => {
  if (typeof window === 'undefined') return DEFAULT_BASE_URL;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored && stored.trim().length > 0 ? stored : DEFAULT_BASE_URL;
};

export const setCloudLicenseApiBaseUrl = (url: string): void => {
  if (typeof window === 'undefined') return;
  const trimmed = url.trim();
  if (!trimmed) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, trimmed);
};

export const pingCloudLicenseServer = async (): Promise<CloudLicenseServerStatus> => {
  try {
    const baseUrl = getCloudLicenseApiBaseUrl();
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/ping`, {
      method: 'GET',
    });

    if (!res.ok) {
      return {
        state: 'error',
        message: `Server responded with status ${res.status}`,
      };
    }

    const data = (await res.json()) as { ok?: boolean; message?: string };
    if (!data.ok) {
      return {
        state: 'error',
        message: data.message || 'Server responded but not ok',
      };
    }

    return {
      state: 'ok',
      message: data.message || 'Cloud license admin is online',
    };
  } catch (error) {
    return {
      state: 'error',
      message: 'Unable to reach license server. Check URL or internet connection.',
    };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Register a desktop-generated license key with the cloud admin for visibility
// ─────────────────────────────────────────────────────────────────────────────

export interface RegisterLicenseKeyPayload {
  licenseKey: string;
  pharmacyName: string;
  doctorName?: string;
  email: string;
  phone: string;
  address?: string;
  city?: string;
  country?: string;
}

export interface RegisterLicenseKeyResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export const registerLicenseKeyWithCloud = async (
  payload: RegisterLicenseKeyPayload
): Promise<RegisterLicenseKeyResult> => {
  try {
    const baseUrl = getCloudLicenseApiBaseUrl();
    const res = await fetch(
      `${baseUrl.replace(/\/+$/, '')}/api/licenses/register-from-desktop`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          licenseKey: payload.licenseKey,
          pharmacyName: payload.pharmacyName,
          doctorName: payload.doctorName ?? null,
          email: payload.email,
          phone: payload.phone,
          address: payload.address ?? null,
          city: payload.city ?? null,
          country: payload.country ?? null,
        }),
      }
    );

    if (!res.ok) {
      return { ok: false, error: `Server responded with status ${res.status}` };
    }

    const data = (await res.json()) as { ok?: boolean; id?: string; error?: string };

    if (!data.ok) {
      return { ok: false, error: data.error || 'Failed to register license with cloud' };
    }

    return { ok: true, id: data.id };
  } catch (error) {
    return {
      ok: false,
      error: 'Unable to reach license server. Key saved locally; sync when online.',
    };
  }
};

