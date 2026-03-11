import crypto from 'crypto';
import fs from 'fs';
import { getDatabaseService } from './database.service';
import { databaseConfig } from '../config/database.config';

export interface SuperAdminLoginResult {
  success: boolean;
  token?: string;
  error?: string;
}

export interface User {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  created_at: string;
}

export interface License {
  id: number;
  user_id: number;
  activation_code: string;
  expiry_date: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface GeneratedLicense {
  id: number;
  code: string;
  pharmacy_name: string | null;
  doctor_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  generated_at: string;
  is_used: number;
  used_at: string | null;
}

export class SuperAdminService {
  private dbService = getDatabaseService();
  private readonly SUPER_ADMIN_EMAIL = 'superadmin@pharmacy.com';
  private readonly SUPER_ADMIN_PASSWORD = 'superadmin@123'; // Default super admin password

  // Default seeded users for core roles
  private readonly DEFAULT_ADMIN_EMAIL = 'admin@pharmacy.com';
  private readonly DEFAULT_ADMIN_PASSWORD = 'admin@123'; // Default admin password

  private readonly DEFAULT_CASHIER_EMAIL = 'cashier@pharmacy.com';
  private readonly DEFAULT_CASHIER_PASSWORD = 'cashier@123'; // Default cashier password

  constructor() {
  }

  /**
   * Initialize super admin user if it doesn't exist
   */
  public async initializeSuperAdmin(): Promise<void> {
    try {
      const superAdminEmailEscaped = this.SUPER_ADMIN_EMAIL.replace(/'/g, "''");

      // Ensure Super Admin user exists and has admin role
      const existingSuperAdmin = await this.dbService.queryOne(
        `SELECT * FROM users WHERE email = '${superAdminEmailEscaped}'`
      );

      if (!existingSuperAdmin) {
        const passwordHash = this.hashPassword(this.SUPER_ADMIN_PASSWORD);
        await this.dbService.execute(
          `INSERT INTO users (name, email, password_hash, role) VALUES ('Super Admin', '${superAdminEmailEscaped}', '${passwordHash}', 'admin')`
        );
      } else {
        // Make sure Super Admin is marked as admin role
        await this.dbService.execute(
          `UPDATE users SET role = 'admin' WHERE email = '${superAdminEmailEscaped}'`
        );
      }

      // Ensure there is at least one additional admin user (non super-admin)
      const adminCountRow = (await this.dbService.queryOne(
        `SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND email != '${superAdminEmailEscaped}'`
      )) as { count?: number } | null;

      const adminCount =
        adminCountRow && typeof (adminCountRow as any).count !== 'undefined'
          ? Number((adminCountRow as any).count)
          : 0;

      if (adminCount === 0) {
        const adminEmailEscaped = this.DEFAULT_ADMIN_EMAIL.replace(/'/g, "''");
        const existingAdminUser = await this.dbService.queryOne(
          `SELECT * FROM users WHERE email = '${adminEmailEscaped}'`
        );

        if (!existingAdminUser) {
          const adminPasswordHash = this.hashPassword(this.DEFAULT_ADMIN_PASSWORD);
          await this.dbService.execute(
            `INSERT INTO users (name, email, password_hash, role) VALUES ('Default Admin', '${adminEmailEscaped}', '${adminPasswordHash}', 'admin')`
          );
        }
      }

      // Ensure there is at least one cashier user
      const cashierCountRow = (await this.dbService.queryOne(
        `SELECT COUNT(*) as count FROM users WHERE role = 'cashier'`
      )) as { count?: number } | null;

      const cashierCount =
        cashierCountRow && typeof (cashierCountRow as any).count !== 'undefined'
          ? Number((cashierCountRow as any).count)
          : 0;

      if (cashierCount === 0) {
        const cashierEmailEscaped = this.DEFAULT_CASHIER_EMAIL.replace(/'/g, "''");
        const existingCashierUser = await this.dbService.queryOne(
          `SELECT * FROM users WHERE email = '${cashierEmailEscaped}'`
        );

        if (!existingCashierUser) {
          const cashierPasswordHash = this.hashPassword(this.DEFAULT_CASHIER_PASSWORD);
          await this.dbService.execute(
            `INSERT INTO users (name, email, password_hash, role) VALUES ('Default Cashier', '${cashierEmailEscaped}', '${cashierPasswordHash}', 'cashier')`
          );
        }
      }
    } catch (error) {
      // Error initializing super admin
    }
  }

  /**
   * Hash password
   */
  private hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  /**
   * Generate token
   */
  private generateToken(): string {
    const payload = `superadmin:${Date.now()}`;
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Login as super admin
   */
  public async login(email: string, password: string): Promise<SuperAdminLoginResult> {
    try {
      if (email !== this.SUPER_ADMIN_EMAIL) {
        return {
          success: false,
          error: 'Invalid credentials',
        };
      }

      const user = (await this.dbService.queryOne(
        `SELECT * FROM users WHERE email = '${email.replace(/'/g, "''")}'`
      )) as User | null;

      if (!user) {
        return {
          success: false,
          error: 'Invalid credentials',
        };
      }

      const passwordHash = this.hashPassword(password);
      if (user.password_hash !== passwordHash) {
        return {
          success: false,
          error: 'Invalid credentials',
        };
      }

      const token = this.generateToken();
      return {
        success: true,
        token,
      };
    } catch (error) {
      return {
        success: false,
        error: 'Login failed',
      };
    }
  }

  /**
   * Get database file path
   */
  public getDatabasePath(): string {
    return databaseConfig.getPath();
  }

  /**
   * Get all users
   */
  public async getAllUsers(): Promise<User[]> {
    try {
      const users = await this.dbService.query(
        'SELECT id, name, email, password_hash, created_at FROM users ORDER BY created_at DESC'
      );
      return users as User[];
    } catch (error) {
      return [];
    }
  }

  /**
   * Create new user
   */
  public async createUser(
    name: string,
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string; user?: User }> {
    try {
      // Check if user exists
      const existingUser = await this.dbService.queryOne(
        `SELECT * FROM users WHERE email = '${email.replace(/'/g, "''")}'`
      );

      if (existingUser) {
        return {
          success: false,
          error: 'User with this email already exists',
        };
      }

      const passwordHash = this.hashPassword(password);
      const result = await this.dbService.execute(
        `INSERT INTO users (name, email, password_hash) VALUES ('${name.replace(/'/g, "''")}', '${email.replace(/'/g, "''")}', '${passwordHash}')`
      );

      const userId = (result as any).lastID;
      const user = (await this.dbService.queryOne(
        `SELECT id, name, email, password_hash, created_at FROM users WHERE id = ${userId}`
      )) as User;

      return {
        success: true,
        user,
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to create user',
      };
    }
  }

  /**
   * Update user
   */
  public async updateUser(
    userId: number,
    name: string,
    email: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Check if email is already taken by another user
      const existingUser = await this.dbService.queryOne(
        `SELECT * FROM users WHERE email = '${email.replace(/'/g, "''")}' AND id != ${userId}`
      );

      if (existingUser) {
        return {
          success: false,
          error: 'Email is already taken by another user',
        };
      }

      await this.dbService.execute(
        `UPDATE users SET name = '${name.replace(/'/g, "''")}', email = '${email.replace(/'/g, "''")}' WHERE id = ${userId}`
      );

      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to update user',
      };
    }
  }

  /**
   * Update user password
   */
  public async updateUserPassword(
    userId: number,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const passwordHash = this.hashPassword(newPassword);
      await this.dbService.execute(
        `UPDATE users SET password_hash = '${passwordHash}' WHERE id = ${userId}`
      );

      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to update password',
      };
    }
  }

  /**
   * Delete user
   */
  public async deleteUser(userId: number): Promise<{ success: boolean; error?: string }> {
    try {
      // Don't allow deleting super admin
      const user = (await this.dbService.queryOne(
        `SELECT email FROM users WHERE id = ${userId}`
      )) as { email: string } | null;

      if (user && user.email === this.SUPER_ADMIN_EMAIL) {
        return {
          success: false,
          error: 'Cannot delete super admin account',
        };
      }

      await this.dbService.execute(`DELETE FROM users WHERE id = ${userId}`);
      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to delete user',
      };
    }
  }

  /**
   * Get all licenses
   */
  public async getAllLicenses(): Promise<License[]> {
    try {
      const licenses = await this.dbService.query(
        'SELECT * FROM licenses ORDER BY created_at DESC'
      );
      return licenses as License[];
    } catch (error) {
      return [];
    }
  }

  /**
   * Update license
   */
  public async updateLicense(
    licenseId: number,
    expiryDate: string,
    isActive: boolean
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await this.dbService.execute(
        `UPDATE licenses SET expiry_date = '${expiryDate}', is_active = ${isActive ? 1 : 0}, updated_at = CURRENT_TIMESTAMP WHERE id = ${licenseId}`
      );

      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to update license',
      };
    }
  }

  /**
   * Delete license
   */
  public async deleteLicense(licenseId: number): Promise<{ success: boolean; error?: string }> {
    try {
      await this.dbService.execute(`DELETE FROM licenses WHERE id = ${licenseId}`);
      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to delete license',
      };
    }
  }

  // ── Generated Licenses (14-char keys) ────────────────────────────────────

  /**
   * Get all generated license keys
   */
  public async getAllGeneratedLicenses(): Promise<GeneratedLicense[]> {
    try {
      const rows = await this.dbService.query(
        'SELECT * FROM generated_licenses ORDER BY generated_at DESC'
      );
      return rows as GeneratedLicense[];
    } catch (error) {
      return [];
    }
  }

  /**
   * Revoke a generated license (mark as unused so it can be re-activated)
   */
  public async revokeGeneratedLicense(id: number): Promise<{ success: boolean; error?: string }> {
    try {
      await this.dbService.execute(
        `UPDATE generated_licenses SET is_used = 0, used_at = NULL WHERE id = ${id}`
      );

      // Also deactivate any live license that was activated with this code
      const row = (await this.dbService.queryOne(
        `SELECT code FROM generated_licenses WHERE id = ${id}`
      )) as { code: string } | null;

      if (row) {
        await this.dbService.execute(
          `UPDATE licenses SET is_active = 0, updated_at = CURRENT_TIMESTAMP
           WHERE activation_code = '${row.code.replace(/'/g, "''")}'`
        );
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to revoke license key' };
    }
  }

  /**
   * Delete a generated license key entirely
   */
  public async deleteGeneratedLicense(id: number): Promise<{ success: boolean; error?: string }> {
    try {
      await this.dbService.execute(
        `DELETE FROM generated_licenses WHERE id = ${id}`
      );
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to delete generated license key' };
    }
  }

  /**
   * Import database file
   */
  public async importDatabase(filePath: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'Source file does not exist' };
      }

      // 1. Basic SQLite Validation
      const sqlite3 = require('sqlite3').verbose();
      const tempDb = new sqlite3.Database(filePath);

      const schemaCheck = await new Promise<boolean>((resolve) => {
        // Check for 'users' table as a proxy for a valid schema
        tempDb.get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'", (err: any, row: any) => {
          if (err || !row) {
            resolve(false);
          } else {
            resolve(true);
          }
        });
      });

      // Close temp connection
      await new Promise<void>((resolve) => tempDb.close(() => resolve()));

      if (!schemaCheck) {
        return { success: false, error: 'Incompatible database: Missing required tables' };
      }

      // 2. Rotate Database
      const currentDbPath = this.getDatabasePath();
      const backupPath = `${currentDbPath}.bak`;
      const dbConnection = (require('../database/database.connection')).getDatabaseConnection();

      // Close current connection
      await dbConnection.close();

      // Give Windows time to release the file handle
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Clean up sidecar files (WAL mode leftovers)
      const walFile = `${currentDbPath}-wal`;
      const shmFile = `${currentDbPath}-shm`;
      if (fs.existsSync(walFile)) {
        try { fs.unlinkSync(walFile); } catch (e) { console.error('Failed to unlink wal file:', e); }
      }
      if (fs.existsSync(shmFile)) {
        try { fs.unlinkSync(shmFile); } catch (e) { console.error('Failed to unlink shm file:', e); }
      }

      try {
        // Backup current (if it exists)
        if (fs.existsSync(currentDbPath)) {
          if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
          fs.renameSync(currentDbPath, backupPath);
        }

        // Copy new database
        fs.copyFileSync(filePath, currentDbPath);

        // Reconnect
        await dbConnection.connect();

        return { success: true };
      } catch (err: any) {
        console.error('Error during database rotation:', err);

        // Detailed error for UI
        let errorMessage = 'Failed to rotate database files';
        if (err.code === 'EBUSY') {
          errorMessage = 'Database file is currently in use by another process. Please close all other database tools and try again.';
        }

        // Rollback attempts
        if (fs.existsSync(backupPath)) {
          try {
            if (fs.existsSync(currentDbPath)) fs.unlinkSync(currentDbPath);
            fs.renameSync(backupPath, currentDbPath);
            await dbConnection.connect();
          } catch (rollbackErr) {
            console.error('Critical: Rollback failed:', rollbackErr);
          }
        }
        return { success: false, error: errorMessage };
      }
    } catch (error) {
      console.error('Import database error:', error);
      return { success: false, error: 'Database import failed' };
    }
  }
}

export default SuperAdminService;
