import sqlite3 from 'sqlite3';
import { getDatabaseService } from './database.service';

export interface License {
  id?: number;
  user_id: number;
  activation_code: string;
  expiry_date: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface LicenseStatus {
  isActive: boolean;
  expiryDate: string | null;
  daysUntilExpiry: number | null;
  isExpired: boolean;
  isExpiringSoon: boolean;
}

export interface ActivateLicenseResult {
  success: boolean;
  license?: License;
  error?: string;
}

export interface GenerateLicenseKeyInput {
  pharmacyName?: string;
  doctorName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
}

export interface GenerateLicenseKeyResult {
  success: boolean;
  code?: string;
  pharmacyName?: string;
  doctorName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  generatedAt?: string;
  error?: string;
}

export class LicenseService {
  private dbService = getDatabaseService();

  // Characters that avoid visual confusion (no 0/O/1/I)
  private static readonly KEY_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  /** Generate a random N-character license key using safe characters only. */
  private static generateShortCode(length = 14): string {
    let key = '';
    for (let i = 0; i < length; i += 1) {
      key += LicenseService.KEY_CHARS.charAt(
        Math.floor(Math.random() * LicenseService.KEY_CHARS.length)
      );
    }
    return key;
  }

  // ─────────────────────────────────────────────────────────────
  // Table initialization
  // ─────────────────────────────────────────────────────────────

  public async initializeTable(): Promise<void> {
    // licenses — one active license per user
    await this.dbService.execute(`
      CREATE TABLE IF NOT EXISTS licenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        activation_code TEXT NOT NULL,
        expiry_date DATETIME NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // generated_licenses — 14-char keys created by the super-admin desktop
    await this.dbService.execute(`
      CREATE TABLE IF NOT EXISTS generated_licenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        pharmacy_name TEXT,
        doctor_name TEXT,
        email TEXT,
        phone TEXT,
        address TEXT,
        city TEXT,
        country TEXT,
        generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_used INTEGER DEFAULT 0,
        used_at DATETIME
      )
    `);

    // Indexes
    await this.dbService.execute(
      `CREATE INDEX IF NOT EXISTS idx_licenses_user_id ON licenses(user_id)`
    );
    await this.dbService.execute(
      `CREATE INDEX IF NOT EXISTS idx_generated_licenses_code ON generated_licenses(code)`
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Super-admin: generate a 14-char key, store locally
  // ─────────────────────────────────────────────────────────────

  /**
   * Generate a new 14-char license key, persist it in generated_licenses,
   * and return the full record so the caller can push it to the cloud.
   */
  public async generateLicenseKey(
    details: GenerateLicenseKeyInput
  ): Promise<GenerateLicenseKeyResult> {
    try {
      // Guarantee uniqueness within the local table
      let code = LicenseService.generateShortCode(14);
      let attempts = 0;
      while (attempts < 10) {
        const existing = await this.dbService.queryOne(
          `SELECT id FROM generated_licenses WHERE code = ?`,
          [code]
        );
        if (!existing) break;
        code = LicenseService.generateShortCode(14);
        attempts += 1;
      }

      const generatedAt = new Date().toISOString();

      await this.dbService.execute(
        `INSERT INTO generated_licenses
          (code, pharmacy_name, doctor_name, email, phone, address, city, country, generated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          code,
          details.pharmacyName ?? null,
          details.doctorName ?? null,
          details.email ?? null,
          details.phone ?? null,
          details.address ?? null,
          details.city ?? null,
          details.country ?? null,
          generatedAt,
        ]
      );

      console.log(`✅ License key generated: ${code}`);

      return {
        success: true,
        code,
        pharmacyName: details.pharmacyName,
        doctorName: details.doctorName,
        email: details.email,
        phone: details.phone,
        address: details.address,
        city: details.city,
        country: details.country,
        generatedAt,
      };
    } catch (error) {
      console.error('❌ generateLicenseKey error:', error);
      return { success: false, error: 'Failed to generate license key.' };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Client: activate a license — fully offline
  // ─────────────────────────────────────────────────────────────

  /**
   * Activate a 14-char generated key.
   *
   * The license is SYSTEM-WIDE: one license covers every user on this installation
   * (admin, cashier, etc.). Whoever activates the key, everyone benefits.
   *
   * - Normalises: strips non-alphanumeric chars, uppercases.
   * - Looks up generated_licenses WHERE code=? AND is_used=0.
   * - If found: validUntil = today + 6 months (from activation date).
   * - Marks key as used so it cannot be reused.
   * - No network call required.
   */
  public async activateLicense(
    userId: number,
    activationCode: string
  ): Promise<ActivateLicenseResult> {
    try {
      console.log(
        `🔑 Attempting to activate license (user ${userId}) with code: ${activationCode}`
      );

      // Normalize: strip spaces/hyphens/special chars, uppercase
      const normalized = activationCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

      if (normalized.length !== 14) {
        return {
          success: false,
          error: 'Invalid license key format. Please enter a valid 14-character key.',
        };
      }

      console.log(`🔐 Looking up key in generated_licenses: ${normalized}`);

      const row = (await this.dbService.queryOne(
        `SELECT * FROM generated_licenses WHERE code = ? AND is_used = 0`,
        [normalized]
      )) as { id: number; code: string; is_used: number } | null;

      if (!row) {
        const usedRow = await this.dbService.queryOne(
          `SELECT id FROM generated_licenses WHERE code = ?`,
          [normalized]
        );
        if (usedRow) {
          console.log(`❌ Key already used: ${normalized}`);
          return { success: false, error: 'This license key has already been used.' };
        }
        console.log(`❌ Key not found: ${normalized}`);
        return { success: false, error: 'Invalid license key. Please check and try again.' };
      }

      // validUntil = today + 6 months (from activation date, not generation date)
      const now = new Date();
      const validUntil = new Date(now);
      validUntil.setMonth(validUntil.getMonth() + 6);

      // Upsert the single system-wide license record (userId stored for audit only)
      const license = await this.upsertSystemLicense(userId, normalized, validUntil.toISOString());

      // Mark the key as used
      await this.dbService.execute(
        `UPDATE generated_licenses SET is_used = 1, used_at = ? WHERE code = ?`,
        [now.toISOString(), normalized]
      );

      console.log(`✅ System license activated until ${validUntil.toISOString()}`);
      return { success: true, license };
    } catch (error) {
      console.error('❌ Activate license error:', error);
      return {
        success: false,
        error: 'Failed to activate license. Please try again.',
      };
    }
  }

  /**
   * Upsert the single system-wide license row.
   * Looks for ANY existing active license (ignoring user_id) and updates it;
   * or inserts a new one with the activating user's id for audit purposes.
   */
  private async upsertSystemLicense(
    activatedByUserId: number,
    activationCode: string,
    expiryDateIso: string
  ): Promise<License> {
    // Find the currently active system license (any user)
    const existing = (await this.dbService.queryOne(
      `SELECT * FROM licenses WHERE is_active = 1 ORDER BY expiry_date DESC LIMIT 1`
    )) as License | null;

    if (existing) {
      await this.dbService.execute(
        `UPDATE licenses
         SET activation_code = ?, expiry_date = ?, is_active = 1,
             user_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [activationCode, expiryDateIso, activatedByUserId, existing.id]
      );
      return LicenseService.mapRowToLicense(
        (await this.dbService.queryOne(
          `SELECT * FROM licenses WHERE id = ?`,
          [existing.id]
        )) as License
      );
    }

    const result = await this.dbService.execute(
      `INSERT INTO licenses (user_id, activation_code, expiry_date, is_active) VALUES (?, ?, ?, 1)`,
      [activatedByUserId, activationCode, expiryDateIso]
    );
    const licenseId = (result as sqlite3.RunResult).lastID;
    return LicenseService.mapRowToLicense(
      (await this.dbService.queryOne(
        `SELECT * FROM licenses WHERE id = ?`,
        [licenseId]
      )) as License
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Status / detail queries
  // ─────────────────────────────────────────────────────────────

  public async getLicenseStatus(_userId: number): Promise<LicenseStatus> {
    try {
      // System-wide check — one license covers all users on this installation
      const license = (await this.dbService.queryOne(
        `SELECT * FROM licenses WHERE is_active = 1 ORDER BY expiry_date DESC LIMIT 1`
      )) as License | null;

      if (!license) {
        return {
          isActive: false,
          expiryDate: null,
          daysUntilExpiry: null,
          isExpired: true,
          isExpiringSoon: false,
        };
      }

      const expiryDate = new Date(license.expiry_date);
      const now = new Date();
      const daysUntilExpiry = Math.ceil(
        (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      const isExpired = daysUntilExpiry < 0;
      const isExpiringSoon = daysUntilExpiry >= 0 && daysUntilExpiry <= 7;
      const isActiveInDb =
        (license.is_active as unknown) === 1 || license.is_active === true;

      return {
        isActive: isActiveInDb && !isExpired,
        expiryDate: license.expiry_date,
        daysUntilExpiry,
        isExpired,
        isExpiringSoon,
      };
    } catch (error) {
      return {
        isActive: false,
        expiryDate: null,
        daysUntilExpiry: null,
        isExpired: true,
        isExpiringSoon: false,
      };
    }
  }

  public async getLicense(_userId: number): Promise<License | null> {
    try {
      // System-wide — return the single active license for the whole installation
      const license = (await this.dbService.queryOne(
        `SELECT * FROM licenses WHERE is_active = 1 ORDER BY expiry_date DESC LIMIT 1`
      )) as License | null;
      return license ? LicenseService.mapRowToLicense(license) : null;
    } catch (error) {
      return null;
    }
  }

  private static mapRowToLicense(row: {
    id?: number;
    user_id: number;
    activation_code: string;
    expiry_date: string;
    is_active: number | boolean;
    created_at?: string;
    updated_at?: string;
  }): License {
    return {
      id: row.id,
      user_id: row.user_id,
      activation_code: row.activation_code,
      expiry_date: row.expiry_date,
      is_active: row.is_active === 1,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

export default LicenseService;
