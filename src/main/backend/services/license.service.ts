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

  /**
   * Generate a random N-character license key using safe characters only.
   */
  private static generateShortCode(length = 14): string {
    let key = '';
    for (let i = 0; i < length; i += 1) {
      key += LicenseService.KEY_CHARS.charAt(
        Math.floor(Math.random() * LicenseService.KEY_CHARS.length)
      );
    }
    return key;
  }

  /**
   * Initialize license tables
   */
  public async initializeTable(): Promise<void> {
    // licenses — active licenses per user
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

    // activation_codes — legacy semi-annual on-prem codes
    await this.dbService.execute(`
      CREATE TABLE IF NOT EXISTS activation_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        expiry_date DATETIME NOT NULL,
        is_used INTEGER DEFAULT 0,
        used_by_user_id INTEGER,
        used_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (used_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // generated_licenses — 14-char keys created by the admin desktop
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
      `CREATE INDEX IF NOT EXISTS idx_activation_codes_code ON activation_codes(code)`
    );
    await this.dbService.execute(
      `CREATE INDEX IF NOT EXISTS idx_activation_codes_is_used ON activation_codes(is_used)`
    );
    await this.dbService.execute(
      `CREATE INDEX IF NOT EXISTS idx_generated_licenses_code ON generated_licenses(code)`
    );

    // Keep legacy semi-annual codes populated
    await this.populateActivationCodes();
  }

  // ─────────────────────────────────────────────────────────────
  // Admin: generate a 14-char key, store locally
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
   * Activate a license key.
   *
   * Priority order:
   *  1. 14-char generated key → look up in generated_licenses (no web call)
   *  2. Legacy PHARM-YYYY-A/B-XXXX or old JANMAY/JUNDEC → activation_codes table
   */
  public async activateLicense(
    userId: number,
    activationCode: string
  ): Promise<ActivateLicenseResult> {
    try {
      console.log(
        `🔑 Attempting to activate license for user ${userId} with code: ${activationCode}`
      );

      // Normalize: strip non-alphanumeric, uppercase
      const normalized = activationCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

      // Detect legacy on-prem formats first
      const isLegacy =
        LicenseService.isOldFormatCode(normalized) ||
        /^PHARM\d{4}[AB][A-Z0-9]{4}$/.test(normalized) ||
        /^PHARM-\d{4}-[AB]-[A-Z0-9]{4}$/.test(activationCode.trim().toUpperCase());

      // ── 14-char generated key (offline) ──────────────────────
      if (!isLegacy && normalized.length === 14) {
        return await this.activateGeneratedKey(userId, normalized);
      }

      // ── Legacy semi-annual code ───────────────────────────────
      if (isLegacy) {
        return await this.activateLegacyCode(userId, activationCode);
      }

      // Anything else is not recognized
      return {
        success: false,
        error: 'Invalid activation code format. Please enter a valid 14-character license key.',
      };
    } catch (error) {
      console.error('❌ Activate license error:', error);
      return {
        success: false,
        error: 'Failed to activate license. Please try again.',
      };
    }
  }

  /**
   * Activate a 14-char key from generated_licenses — no network required.
   * validUntil = today + 6 months (from activation date, not generation date).
   */
  private async activateGeneratedKey(
    userId: number,
    code: string
  ): Promise<ActivateLicenseResult> {
    console.log(`🔐 Checking generated_licenses for key: ${code}`);

    const row = (await this.dbService.queryOne(
      `SELECT * FROM generated_licenses WHERE code = ? AND is_used = 0`,
      [code]
    )) as { id: number; code: string; is_used: number } | null;

    if (!row) {
      const used = await this.dbService.queryOne(
        `SELECT id FROM generated_licenses WHERE code = ?`,
        [code]
      );
      if (used) {
        console.log(`❌ Key already used: ${code}`);
        return { success: false, error: 'This license key has already been used.' };
      }
      console.log(`❌ Key not found: ${code}`);
      return { success: false, error: 'Invalid license key. Please check and try again.' };
    }

    // Expiry = today + 6 months
    const now = new Date();
    const validUntil = new Date(now);
    validUntil.setMonth(validUntil.getMonth() + 6);

    // Upsert licenses row
    const license = await this.upsertLicense(userId, code, validUntil.toISOString());

    // Mark key as used
    await this.dbService.execute(
      `UPDATE generated_licenses SET is_used = 1, used_at = ? WHERE code = ?`,
      [now.toISOString(), code]
    );

    console.log(`✅ Generated key activated for user ${userId}, valid until ${validUntil.toISOString()}`);
    return { success: true, license };
  }

  /**
   * Activate a legacy semi-annual code from activation_codes.
   */
  private async activateLegacyCode(
    userId: number,
    activationCode: string
  ): Promise<ActivateLicenseResult> {
    console.log('🔐 Using legacy activation code flow');

    const codeData = await this.getActivationCodeFromDB(activationCode);

    if (!codeData) {
      return { success: false, error: 'Invalid activation code. Please enter a valid code.' };
    }

    const codeExpiryDate = new Date(codeData.expiry_date);
    const now = new Date();

    if (codeExpiryDate < now) {
      return { success: false, error: 'This activation code has expired.' };
    }

    const license = await this.upsertLicense(
      userId,
      activationCode.toUpperCase(),
      codeExpiryDate.toISOString()
    );

    return { success: true, license };
  }

  /**
   * Insert or update a license row for a user.
   */
  private async upsertLicense(
    userId: number,
    activationCode: string,
    expiryDateIso: string
  ): Promise<License> {
    const existing = (await this.dbService.queryOne(
      `SELECT * FROM licenses WHERE user_id = ? AND is_active = 1 ORDER BY expiry_date DESC LIMIT 1`,
      [userId]
    )) as License | null;

    if (existing) {
      await this.dbService.execute(
        `UPDATE licenses
         SET activation_code = ?, expiry_date = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [activationCode, expiryDateIso, existing.id]
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
      [userId, activationCode, expiryDateIso]
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
  // Legacy helpers
  // ─────────────────────────────────────────────────────────────

  private static generateProfessionalCode(year: number, period: 'A' | 'B'): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let randomPart = '';
    for (let i = 0; i < 4; i += 1) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `PHARM-${year}-${period}-${randomPart}`;
  }

  private static isOldFormatCode(code: string): boolean {
    return /^\d{4}(JANMAY|JUNDEC)$/.test(code);
  }

  private async populateActivationCodes(): Promise<void> {
    try {
      const existingCodes = await this.dbService.query('SELECT code FROM activation_codes');
      const currentYear = new Date().getFullYear();
      const expectedCount = 40;

      const hasOldFormat = existingCodes.some((row: { code: string }) =>
        LicenseService.isOldFormatCode(row.code)
      );
      const hasEnoughCodes = existingCodes.length >= expectedCount;

      if (hasEnoughCodes && !hasOldFormat) return;

      if (hasOldFormat || !hasEnoughCodes) {
        await this.dbService.execute('DELETE FROM activation_codes');
      }

      const codes: Array<{ code: string; expiryDate: Date }> = [];
      const usedCodes = new Set<string>();

      for (let year = currentYear; year < currentYear + 20; year += 1) {
        const janMayExpiry = new Date(year, 5, 1);
        let codeA = LicenseService.generateProfessionalCode(year, 'A');
        while (usedCodes.has(codeA)) codeA = LicenseService.generateProfessionalCode(year, 'A');
        usedCodes.add(codeA);
        codes.push({ code: codeA, expiryDate: janMayExpiry });

        const junDecExpiry = new Date(year + 1, 0, 1);
        let codeB = LicenseService.generateProfessionalCode(year, 'B');
        while (usedCodes.has(codeB)) codeB = LicenseService.generateProfessionalCode(year, 'B');
        usedCodes.add(codeB);
        codes.push({ code: codeB, expiryDate: junDecExpiry });
      }

      const insertQueries = codes.map(
        ({ code, expiryDate }) =>
          `INSERT INTO activation_codes (code, expiry_date) VALUES ('${code}', '${expiryDate.toISOString()}')`
      );
      await this.dbService.transaction(insertQueries);
    } catch (error) {
      // Allow app to continue even if population fails
    }
  }

  private async getActivationCodeFromDB(code: string): Promise<{
    code: string;
    expiry_date: string;
    is_used: number;
  } | null> {
    try {
      return await this.dbService.queryOne(
        `SELECT code, expiry_date, is_used FROM activation_codes WHERE code = ?`,
        [code.toUpperCase()]
      );
    } catch (error) {
      console.error('❌ Error getting activation code from DB:', error);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Status / details queries
  // ─────────────────────────────────────────────────────────────

  public async getLicenseStatus(userId: number): Promise<LicenseStatus> {
    try {
      const license = (await this.dbService.queryOne(
        `SELECT * FROM licenses WHERE user_id = ? AND is_active = 1 ORDER BY expiry_date DESC LIMIT 1`,
        [userId]
      )) as License | null;

      if (!license) {
        return { isActive: false, expiryDate: null, daysUntilExpiry: null, isExpired: true, isExpiringSoon: false };
      }

      const expiryDate = new Date(license.expiry_date);
      const now = new Date();
      const daysUntilExpiry = Math.ceil(
        (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      const isExpired = daysUntilExpiry < 0;
      const isExpiringSoon = daysUntilExpiry >= 0 && daysUntilExpiry <= 7;
      const isActiveInDb = (license.is_active as unknown) === 1 || license.is_active === true;

      return { isActive: isActiveInDb && !isExpired, expiryDate: license.expiry_date, daysUntilExpiry, isExpired, isExpiringSoon };
    } catch (error) {
      return { isActive: false, expiryDate: null, daysUntilExpiry: null, isExpired: true, isExpiringSoon: false };
    }
  }

  public async getLicense(userId: number): Promise<License | null> {
    try {
      const license = (await this.dbService.queryOne(
        `SELECT * FROM licenses WHERE user_id = ? AND is_active = 1 ORDER BY expiry_date DESC LIMIT 1`,
        [userId]
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
