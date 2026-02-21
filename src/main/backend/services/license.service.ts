import sqlite3 from 'sqlite3';
import { DatabaseService } from './database.service';

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
  isExpiringSoon: boolean; // Within 7 days
}

export interface ActivateLicenseResult {
  success: boolean;
  license?: License;
  error?: string;
}

export class LicenseService {
  private dbService: DatabaseService;

  constructor() {
    this.dbService = new DatabaseService();
  }

  /**
   * Initialize license tables
   */
  public async initializeTable(): Promise<void> {
    // Create licenses table
    const licensesSql = `
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
    `;
    await this.dbService.execute(licensesSql);

    // Create activation_codes table to store valid codes with their expiry dates
    const activationCodesSql = `
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
    `;
    await this.dbService.execute(activationCodesSql);

    // Create indexes for faster lookups
    await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_licenses_user_id ON licenses(user_id)
    `);
    await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_activation_codes_code ON activation_codes(code)
    `);
    await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_activation_codes_is_used ON activation_codes(is_used)
    `);

    // Populate activation codes for the next 20 years
    await this.populateActivationCodes();
  }

  /**
   * Generate a professional-looking activation code
   * Format: PHARM-{YEAR}-{PERIOD}-{RANDOM}
   * Example: PHARM-2025-A-7B9C or PHARM-2025-B-3D4E
   */
  private static generateProfessionalCode(year: number, period: 'A' | 'B'): string {
    // Generate a 4-character alphanumeric code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude I, O, 0, 1 for clarity
    let randomPart = '';
    for (let i = 0; i < 4; i += 1) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `PHARM-${year}-${period}-${randomPart}`;
  }

  /**
   * Check if code is in old format (e.g., 2025JANMAY)
   */
  private static isOldFormatCode(code: string): boolean {
    // Old format: YEARJANMAY or YEARJUNDEC (e.g., 2025JANMAY)
    return /^\d{4}(JANMAY|JUNDEC)$/.test(code);
  }

  /**
   * Populate activation codes table with codes for the next 20 years
   * Each code has a pre-set expiry date (6 months from its start period)
   */
  private async populateActivationCodes(): Promise<void> {
    try {
      // Check existing codes
      const existingCodes = await this.dbService.query('SELECT code FROM activation_codes');

      const currentYear = new Date().getFullYear();
      const expectedCount = 40; // 20 years × 2 periods per year

      // Check if we need to regenerate:
      // 1. No codes exist
      // 2. Old format codes exist (need migration)
      // 3. Not enough codes (less than 40)
      const hasOldFormat = existingCodes.some((row: { code: string }) =>
        LicenseService.isOldFormatCode(row.code)
      );
      const hasEnoughCodes = existingCodes.length >= expectedCount;

      if (hasEnoughCodes && !hasOldFormat) {
        // Already have all codes in new format
        return;
      }

      // If old format codes exist or not enough codes, clear and regenerate
      if (hasOldFormat || !hasEnoughCodes) {
        // Delete all existing codes to regenerate with new format
        await this.dbService.execute('DELETE FROM activation_codes');
      }

      const codes: Array<{ code: string; expiryDate: Date }> = [];
      const usedCodes = new Set<string>(); // Track generated codes to avoid duplicates

      // Generate codes for 20 years starting from current year
      for (let year = currentYear; year < currentYear + 20; year += 1) {
        // Period A: valid from January 1 to May 31, expires on June 1 (6 months from start)
        const janMayExpiry = new Date(year, 5, 1); // June 1st (month 5 = June, day 1)
        let codeA = LicenseService.generateProfessionalCode(year, 'A');
        // Ensure uniqueness
        while (usedCodes.has(codeA)) {
          codeA = LicenseService.generateProfessionalCode(year, 'A');
        }
        usedCodes.add(codeA);
        codes.push({
          code: codeA,
          expiryDate: janMayExpiry,
        });

        // Period B: valid from June 1 to December 31, expires on January 1 next year
        const junDecExpiry = new Date(year + 1, 0, 1); // January 1st of next year
        let codeB = LicenseService.generateProfessionalCode(year, 'B');
        // Ensure uniqueness
        while (usedCodes.has(codeB)) {
          codeB = LicenseService.generateProfessionalCode(year, 'B');
        }
        usedCodes.add(codeB);
        codes.push({
          code: codeB,
          expiryDate: junDecExpiry,
        });
      }

      // Insert all codes in a transaction
      const insertQueries = codes.map(
        ({ code, expiryDate }) =>
          `INSERT INTO activation_codes (code, expiry_date) VALUES ('${code}', '${expiryDate.toISOString()}')`
      );

      await this.dbService.transaction(insertQueries);
      // Populated activation codes successfully
    } catch (error) {
      // Error populating activation codes - allow app to continue
      // Don't throw - allow app to continue even if population fails
    }
  }

  /**
   * Get valid activation code from database
   */
  private async getActivationCodeFromDB(code: string): Promise<{
    code: string;
    expiry_date: string;
    is_used: number;
  } | null> {
    try {
      const activationCode = await this.dbService.queryOne(
        `SELECT code, expiry_date, is_used FROM activation_codes WHERE code = ?`,
        [code.toUpperCase()]
      );
      return activationCode;
    } catch (error) {
      // Error getting activation code from DB
      return null;
    }
  }

  /**
   * Activate license with code (uses expiry date from database)
   */
  public async activateLicense(
    userId: number,
    activationCode: string
  ): Promise<ActivateLicenseResult> {
    try {
      // Get activation code from database
      const codeData = await this.getActivationCodeFromDB(activationCode);

      if (!codeData) {
        return {
          success: false,
          error: 'Invalid activation code. Please enter a valid code.',
        };
      }

      // Check if code is already used
      if (codeData.is_used === 1) {
        return {
          success: false,
          error: 'This activation code has already been used.',
        };
      }

      // Check if code has expired (expiry date is in the past)
      const codeExpiryDate = new Date(codeData.expiry_date);
      const now = new Date();
      if (codeExpiryDate < now) {
        return {
          success: false,
          error: 'This activation code has expired.',
        };
      }

      // Use the expiry date from the database (pre-set for 6 months from code's period)
      const expiryDate = codeExpiryDate;

      // Check if user already has an active license
      const existingLicense = (await this.dbService.queryOne(
        `SELECT * FROM licenses WHERE user_id = ? AND is_active = 1 ORDER BY expiry_date DESC LIMIT 1`,
        [userId]
      )) as License | null;

      // Mark activation code as used
      await this.dbService.execute(
        `UPDATE activation_codes
         SET is_used = 1, used_by_user_id = ?, used_at = CURRENT_TIMESTAMP
         WHERE code = ?`,
        [userId, activationCode.toUpperCase()]
      );

      if (existingLicense) {
        // Update existing license
        const sql = `
          UPDATE licenses
          SET activation_code = ?,
              expiry_date = ?,
              is_active = 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `;
        await this.dbService.execute(sql, [
          activationCode.toUpperCase(),
          expiryDate.toISOString(),
          existingLicense.id,
        ]);

        const updatedLicense = (await this.dbService.queryOne(
          `SELECT * FROM licenses WHERE id = ?`,
          [existingLicense.id]
        )) as License;

        return {
          success: true,
          license: LicenseService.mapRowToLicense(updatedLicense),
        };
      }

        // Create new license
        const sql = `
          INSERT INTO licenses (user_id, activation_code, expiry_date, is_active)
          VALUES (?, ?, ?, 1)
        `;
        const result = await this.dbService.execute(sql, [
          userId,
          activationCode.toUpperCase(),
          expiryDate.toISOString(),
        ]);

      const licenseId = (result as sqlite3.RunResult).lastID;
      const license = (await this.dbService.queryOne(`SELECT * FROM licenses WHERE id = ?`, [
        licenseId,
      ])) as License;

        return {
          success: true,
        license: LicenseService.mapRowToLicense(license),
        };
    } catch (error) {
      // Activate license error
      return {
        success: false,
        error: 'Failed to activate license. Please try again.',
      };
    }
  }

  /**
   * Get license status for user
   */
  public async getLicenseStatus(userId: number): Promise<LicenseStatus> {
    try {
      const license = (await this.dbService.queryOne(
        `SELECT * FROM licenses WHERE user_id = ? AND is_active = 1 ORDER BY expiry_date DESC LIMIT 1`,
        [userId]
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

      // Check if license is active (is_active is stored as INTEGER 1/0 in DB)
      const isActiveInDb = (license.is_active as unknown) === 1 || license.is_active === true;

      return {
        isActive: isActiveInDb && !isExpired,
        expiryDate: license.expiry_date,
        daysUntilExpiry,
        isExpired,
        isExpiringSoon,
      };
    } catch (error) {
      // Get license status error
      return {
        isActive: false,
        expiryDate: null,
        daysUntilExpiry: null,
        isExpired: true,
        isExpiringSoon: false,
      };
    }
  }

  /**
   * Get license details for user
   */
  public async getLicense(userId: number): Promise<License | null> {
    try {
      const license = (await this.dbService.queryOne(
        `SELECT * FROM licenses WHERE user_id = ? AND is_active = 1 ORDER BY expiry_date DESC LIMIT 1`,
        [userId]
      )) as License | null;

      return license ? LicenseService.mapRowToLicense(license) : null;
    } catch (error) {
      // Get license error
      return null;
    }
  }

  /**
   * Map database row to License interface
   */
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
