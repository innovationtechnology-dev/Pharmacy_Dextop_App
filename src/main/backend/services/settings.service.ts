import { getDatabaseService } from './database.service';

export interface PharmacySettings {
  id: number;
  pharmacy_name: string;
  license_number: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  tax_id: string | null;
  logo_url: string | null;
  currency: string;
  thermal_printer_enabled: boolean;
  thermal_printer_width: number;
  created_at: string;
  updated_at: string;
}

export interface UpdateSettingsParams {
  pharmacy_name?: string;
  license_number?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  tax_id?: string;
  logo_url?: string;
  currency?: string;
  thermal_printer_enabled?: boolean;
  thermal_printer_width?: number;
}

/**
 * Settings Service
 * Manages pharmacy-wide settings stored in database
 * Replaces localStorage-based settings for better data consistency
 */
export class SettingsService {
  private dbService = getDatabaseService();

  /**
   * Get pharmacy settings
   * Returns the single settings row (id=1)
   */
  public async getSettings(): Promise<PharmacySettings | null> {
    try {
      const settings = await this.dbService.queryOne(
        'SELECT * FROM settings WHERE id = 1'
      ) as any;

      if (!settings) return null;

      return {
        ...settings,
        thermal_printer_enabled: settings.thermal_printer_enabled === 1,
      };
    } catch (error) {
      console.error('Error getting settings:', error);
      return null;
    }
  }

  /**
   * Update pharmacy settings
   * Only one settings row exists (id=1)
   */
  public async updateSettings(params: UpdateSettingsParams): Promise<{ success: boolean; error?: string; settings?: PharmacySettings }> {
    try {
      const updates: string[] = [];
      const values: any[] = [];

      if (params.pharmacy_name !== undefined) {
        updates.push('pharmacy_name = ?');
        values.push(params.pharmacy_name);
      }
      if (params.license_number !== undefined) {
        updates.push('license_number = ?');
        values.push(params.license_number);
      }
      if (params.address !== undefined) {
        updates.push('address = ?');
        values.push(params.address);
      }
      if (params.phone !== undefined) {
        updates.push('phone = ?');
        values.push(params.phone);
      }
      if (params.email !== undefined) {
        updates.push('email = ?');
        values.push(params.email);
      }
      if (params.website !== undefined) {
        updates.push('website = ?');
        values.push(params.website);
      }
      if (params.tax_id !== undefined) {
        updates.push('tax_id = ?');
        values.push(params.tax_id);
      }
      if (params.logo_url !== undefined) {
        updates.push('logo_url = ?');
        values.push(params.logo_url);
      }
      if (params.currency !== undefined) {
        updates.push('currency = ?');
        values.push(params.currency);
      }
      if (params.thermal_printer_enabled !== undefined) {
        updates.push('thermal_printer_enabled = ?');
        values.push(params.thermal_printer_enabled ? 1 : 0);
      }
      if (params.thermal_printer_width !== undefined) {
        updates.push('thermal_printer_width = ?');
        values.push(params.thermal_printer_width);
      }

      if (updates.length === 0) {
        return { success: false, error: 'No fields to update' };
      }

      // Always update the updated_at timestamp
      updates.push('updated_at = CURRENT_TIMESTAMP');

      await this.dbService.execute(
        `UPDATE settings SET ${updates.join(', ')} WHERE id = 1`,
        values
      );

      const settings = await this.getSettings();
      if (!settings) {
        return { success: false, error: 'Failed to retrieve updated settings' };
      }

      return { success: true, settings };
    } catch (error) {
      console.error('Error updating settings:', error);
      return { success: false, error: 'Failed to update settings' };
    }
  }

  /**
   * Initialize settings with default values if not exists
   * Called during app initialization
   */
  public async initializeSettings(): Promise<void> {
    try {
      const existing = await this.dbService.queryOne('SELECT id FROM settings WHERE id = 1');
      if (!existing) {
        await this.dbService.execute(`
          INSERT INTO settings (id, pharmacy_name, currency) 
          VALUES (1, 'My Pharmacy', 'PKR')
        `);
        console.log('✅ Default settings initialized');
      }
    } catch (error) {
      console.error('Error initializing settings:', error);
    }
  }

  /**
   * Migrate settings from localStorage to database
   * Helper function for one-time migration
   */
  public async migrateFromLocalStorage(localStorageData: {
    pharmacyName?: string;
    address?: string;
    phone?: string;
    email?: string;
    currency?: string;
    logoUrl?: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const params: UpdateSettingsParams = {};

      if (localStorageData.pharmacyName) params.pharmacy_name = localStorageData.pharmacyName;
      if (localStorageData.address) params.address = localStorageData.address;
      if (localStorageData.phone) params.phone = localStorageData.phone;
      if (localStorageData.email) params.email = localStorageData.email;
      if (localStorageData.currency) params.currency = localStorageData.currency;
      if (localStorageData.logoUrl) params.logo_url = localStorageData.logoUrl;

      const result = await this.updateSettings(params);
      if (result.success) {
        console.log('✅ Settings migrated from localStorage to database');
      }
      return result;
    } catch (error) {
      console.error('Error migrating settings:', error);
      return { success: false, error: 'Failed to migrate settings' };
    }
  }
}

export default SettingsService;
