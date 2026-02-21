export interface PharmacySettings {
  pharmacyName: string;
  licenseNumber: string;
  address: string;
  phone: string;
  email: string;
  taxRate: number;
  currency: string;
  lowStockThreshold: number;
  expiredMedicinesAlert: boolean;
  tagline: string;
  website: string;
  taxId: string;
  logoUrl: string;
  invoiceNotes: string;
}

export const defaultPharmacySettings: PharmacySettings = {
  pharmacyName: '',
  licenseNumber: '',
  address: '',
  phone: '',
  email: '',
  taxRate: 0,
  currency: 'USD',
  lowStockThreshold: 10,
  expiredMedicinesAlert: true,
  tagline: '',
  website: '',
  taxId: '',
  logoUrl: '',
  invoiceNotes: '',
};

export const getStoredPharmacySettings = (): PharmacySettings => {
  try {
    const raw = localStorage.getItem('pharmacySettings');
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...defaultPharmacySettings, ...parsed };
    }
  } catch (error) {
    console.error('Failed to parse pharmacy settings', error);
  }
  return defaultPharmacySettings;
};

