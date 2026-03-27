import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDatabaseService } from './database.service';
import { databaseConfig } from '../config/database.config';
import { getFirebaseAuthService } from './firebase-auth.service';
import { isFirebaseConfigured } from '../config/firebase.config';

export interface SuperAdminLoginResult {
  success: boolean;
  token?: string;
  error?: string;
  authMethod?: 'firebase' | 'local'; // Track which auth method was used
}

export interface User {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role?: string;
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
  private firebaseAuthService = getFirebaseAuthService();
  private readonly SUPER_ADMIN_EMAIL = 'superadmin@pharmacy.com';
  private readonly SUPER_ADMIN_PASSWORD = 'superadmin@123'; // Default super admin password (fallback)

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
   * Login as super admin with Firebase or local authentication
   */
  public async login(email: string, password: string): Promise<SuperAdminLoginResult> {
    try {
      // Check if this is the super admin email
      if (email !== this.SUPER_ADMIN_EMAIL) {
        return {
          success: false,
          error: 'Email address not found. Please check your email and try again.',
        };
      }

      // Try Firebase authentication first (if configured)
      if (isFirebaseConfigured() && this.firebaseAuthService.isAvailable()) {
        console.log('🔐 Attempting Firebase authentication for super admin...');
        
        const firebaseResult = await this.firebaseAuthService.authenticateWithFirebase(
          email,
          password
        );

        if (firebaseResult.success) {
          console.log('✅ Firebase authentication successful');
          const token = this.generateToken();
          return {
            success: true,
            token,
            authMethod: 'firebase',
          };
        } else {
          console.log('❌ Firebase authentication failed:', firebaseResult.error);
          // Don't return error yet - try local authentication as fallback
        }
      }

      // Fallback to local database authentication
      console.log('🔐 Using local authentication fallback...');
      
      const user = (await this.dbService.queryOne(
        `SELECT * FROM users WHERE email = '${email.replace(/'/g, "''")}'`
      )) as User | null;

      if (!user) {
        return {
          success: false,
          error: 'Email address not found. Please check your email and try again.',
        };
      }

      const passwordHash = this.hashPassword(password);
      if (user.password_hash !== passwordHash) {
        return {
          success: false,
          error: 'Incorrect password. Please try again.',
        };
      }

      console.log('✅ Local authentication successful');
      const token = this.generateToken();
      return {
        success: true,
        token,
        authMethod: 'local',
      };
    } catch (error) {
      console.error('Super admin login error:', error);
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
   * Force WAL checkpoint to ensure all changes are written to main database file
   */
  public async checkpointDatabase(): Promise<void> {
    await this.dbService.execute('PRAGMA wal_checkpoint(TRUNCATE)');
  }


  /**
   * Get all users
   */
  public async getAllUsers(): Promise<User[]> {
    try {
      const users = await this.dbService.query(
        'SELECT id, name, email, password_hash, role, created_at FROM users ORDER BY created_at DESC'
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
    password: string,
    role: string = 'cashier'
  ): Promise<{ success: boolean; error?: string; user?: User }> {
    try {
      // Prevent creating superadmin role
      if (role === 'superadmin' || role === 'super_admin') {
        return {
          success: false,
          error: 'Cannot create user with superadmin role. Only "admin" or "cashier" roles are allowed',
        };
      }

      // Validate role
      if (role !== 'admin' && role !== 'cashier') {
        return {
          success: false,
          error: 'Invalid role. Must be either "admin" or "cashier"',
        };
      }

      // Prevent creating user with super admin email
      if (email.toLowerCase() === this.SUPER_ADMIN_EMAIL.toLowerCase()) {
        return {
          success: false,
          error: 'Cannot create user with Super Admin email address',
        };
      }

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
        `INSERT INTO users (name, email, password_hash, role) VALUES ('${name.replace(/'/g, "''")}', '${email.replace(/'/g, "''")}', '${passwordHash}', '${role}')`
      );

      const userId = (result as any).lastID;
      const user = (await this.dbService.queryOne(
        `SELECT id, name, email, password_hash, role, created_at FROM users WHERE id = ${userId}`
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
    email: string,
    role?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Prevent modifying the super admin account
      const userToUpdate = await this.dbService.queryOne(
        `SELECT email, role FROM users WHERE id = ${userId}`
      ) as { email: string; role?: string } | null;

      if (userToUpdate && userToUpdate.email === this.SUPER_ADMIN_EMAIL) {
        return {
          success: false,
          error: 'Cannot modify the Super Admin account',
        };
      }

      // Prevent setting or changing to superadmin role
      if (role && (role === 'superadmin' || role === 'super_admin')) {
        return {
          success: false,
          error: 'Cannot assign superadmin role. Only "admin" or "cashier" roles are allowed',
        };
      }

      // Validate role if provided
      if (role && role !== 'admin' && role !== 'cashier') {
        return {
          success: false,
          error: 'Invalid role. Must be either "admin" or "cashier"',
        };
      }

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

      // Build update query
      let updateQuery = `UPDATE users SET name = '${name.replace(/'/g, "''")}', email = '${email.replace(/'/g, "''")}'`;
      if (role) {
        updateQuery += `, role = '${role}'`;
      }
      updateQuery += ` WHERE id = ${userId}`;

      await this.dbService.execute(updateQuery);

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
      // Prevent changing super admin password through this method
      const user = await this.dbService.queryOne(
        `SELECT email FROM users WHERE id = ${userId}`
      ) as { email: string } | null;

      if (user && user.email === this.SUPER_ADMIN_EMAIL) {
        return {
          success: false,
          error: 'Cannot change Super Admin password through this method',
        };
      }

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
      // Get the activation code for this license
      const license = await this.dbService.queryOne(
        `SELECT activation_code FROM licenses WHERE id = ${licenseId}`
      ) as { activation_code: string } | null;

      if (!license) {
        return {
          success: false,
          error: 'License not found',
        };
      }

      // Update the license
      await this.dbService.execute(
        `UPDATE licenses SET expiry_date = '${expiryDate}', is_active = ${isActive ? 1 : 0}, updated_at = CURRENT_TIMESTAMP WHERE id = ${licenseId}`
      );

      // Sync with generated_licenses table
      // If activating the license, mark the generated key as used
      // If deactivating the license, mark the generated key as unused
      await this.dbService.execute(
        `UPDATE generated_licenses SET is_used = ${isActive ? 1 : 0}, used_at = ${isActive ? "datetime('now', 'localtime')" : 'NULL'} WHERE code = '${license.activation_code.replace(/'/g, "''")}'`
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
   * Validate database schema - checks for all critical tables
   */
  private async validateDatabaseSchema(filePath: string): Promise<{ valid: boolean; missingTables: string[] }> {
    const requiredTables = [
      'users',
      'medicines',
      'customers',
      'suppliers',
      'sales',
      'sale_items',
      'purchases',
      'purchase_items',
      'purchase_payments'
    ];

    const sqlite3 = require('sqlite3').verbose();
    const tempDb = new sqlite3.Database(filePath);
    const missingTables: string[] = [];

    for (const tableName of requiredTables) {
      const exists = await new Promise<boolean>((resolve) => {
        tempDb.get(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`,
          (err: any, row: any) => {
            resolve(!err && !!row);
          }
        );
      });

      if (!exists) {
        missingTables.push(tableName);
      }
    }

    await new Promise<void>((resolve) => tempDb.close(() => resolve()));

    return {
      valid: missingTables.length === 0,
      missingTables
    };
  }

  /**
   * Get database summary statistics
   */
  private async getDatabaseSummary(): Promise<{
    users: number;
    medicines: number;
    customers: number;
    sales: number;
    purchases: number;
    payments: number;
  }> {
    try {
      const counts = {
        users: 0,
        medicines: 0,
        customers: 0,
        sales: 0,
        purchases: 0,
        payments: 0
      };

      const userCount = await this.dbService.queryOne('SELECT COUNT(*) as count FROM users');
      counts.users = (userCount as any)?.count || 0;

      const medicineCount = await this.dbService.queryOne('SELECT COUNT(*) as count FROM medicines');
      counts.medicines = (medicineCount as any)?.count || 0;

      const customerCount = await this.dbService.queryOne('SELECT COUNT(*) as count FROM customers');
      counts.customers = (customerCount as any)?.count || 0;

      const salesCount = await this.dbService.queryOne('SELECT COUNT(*) as count FROM sales');
      counts.sales = (salesCount as any)?.count || 0;

      const purchaseCount = await this.dbService.queryOne('SELECT COUNT(*) as count FROM purchases');
      counts.purchases = (purchaseCount as any)?.count || 0;

      const paymentCount = await this.dbService.queryOne('SELECT COUNT(*) as count FROM purchase_payments');
      counts.payments = (paymentCount as any)?.count || 0;

      return counts;
    } catch (error) {
      return {
        users: 0,
        medicines: 0,
        customers: 0,
        sales: 0,
        purchases: 0,
        payments: 0
      };
    }
  }

  /**
   * Import database file with enhanced validation and verification
   */
  public async importDatabase(filePath: string): Promise<{ 
    success: boolean; 
    error?: string;
    summary?: {
      users: number;
      medicines: number;
      customers: number;
      sales: number;
      purchases: number;
      payments: number;
    };
  }> {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'Source file does not exist' };
      }

      // 1. Enhanced Schema Validation
      const validation = await this.validateDatabaseSchema(filePath);
      
      if (!validation.valid) {
        return { 
          success: false, 
          error: `Incompatible database: Missing required tables (${validation.missingTables.join(', ')})` 
        };
      }

      // 2. Create Timestamped Backup (using local system time)
      const currentDbPath = this.getDatabasePath();
      const now = new Date();
      const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
      const timestampedBackupPath = `${currentDbPath}.backup-${timestamp}.bak`;
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
        // Create timestamped backup of current database (if it exists)
        if (fs.existsSync(currentDbPath)) {
          fs.copyFileSync(currentDbPath, timestampedBackupPath);
          
          // Automatically cleanup old backups, keeping only the 3 most recent
          this.cleanupOldBackups(3);
        }

        // Copy new database
        fs.copyFileSync(filePath, currentDbPath);

        // Reconnect
        await dbConnection.connect();

        // 3. Post-Import Verification - Get summary of imported data
        const summary = await this.getDatabaseSummary();

        return { success: true, summary };
      } catch (err: any) {
        console.error('Error during database rotation:', err);

        // Detailed error for UI
        let errorMessage = 'Failed to rotate database files';
        if (err.code === 'EBUSY') {
          errorMessage = 'Database file is currently in use by another process. Please close all other database tools and try again.';
        }

        // Rollback attempts - restore from timestamped backup
        if (fs.existsSync(timestampedBackupPath)) {
          try {
            if (fs.existsSync(currentDbPath)) fs.unlinkSync(currentDbPath);
            fs.copyFileSync(timestampedBackupPath, currentDbPath);
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

  /**
   * Get list of available database backups
   */
  public getAvailableBackups(): Array<{ filename: string; path: string; timestamp: string; size: number }> {
    try {
      const currentDbPath = this.getDatabasePath();
      const dbDir = path.dirname(currentDbPath);
      const dbBasename = path.basename(currentDbPath);
      
      const files = fs.readdirSync(dbDir);
      const backups = files
        .filter(file => file.startsWith(dbBasename) && file.includes('.backup-'))
        .map(file => {
          const filePath = path.join(dbDir, file);
          const stats = fs.statSync(filePath);
          const timestampMatch = file.match(/\.backup-(.+)\.bak$/);
          
          let timestamp = 'Unknown';
          if (timestampMatch) {
            // Format is: 2026-03-18T17-10-07
            // Convert to: 2026-03-18T17:10:07
            const rawTimestamp = timestampMatch[1];
            // Replace hyphens with colons only in the time part (after T)
            timestamp = rawTimestamp.replace(/T(\d{2})-(\d{2})-(\d{2})/, 'T$1:$2:$3');
          }
          
          return {
            filename: file,
            path: filePath,
            timestamp,
            size: stats.size
          };
        })
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp)); // Most recent first

      return backups;
    } catch (error) {
      console.error('Error getting backups:', error);
      return [];
    }
  }

  /**
   * Restore database from a backup file
   */
  public async restoreFromBackup(backupPath: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!fs.existsSync(backupPath)) {
        return { success: false, error: 'Backup file does not exist' };
      }

      // Use the same import logic
      return await this.importDatabase(backupPath);
    } catch (error) {
      console.error('Restore from backup error:', error);
      return { success: false, error: 'Failed to restore from backup' };
    }
  }

  /**
   * Delete old backups, keeping only the most recent N backups
   */
  public cleanupOldBackups(keepCount: number = 10): { success: boolean; deletedCount: number } {
    try {
      const backups = this.getAvailableBackups();
      
      if (backups.length <= keepCount) {
        return { success: true, deletedCount: 0 };
      }

      const toDelete = backups.slice(keepCount);
      let deletedCount = 0;

      for (const backup of toDelete) {
        try {
          fs.unlinkSync(backup.path);
          deletedCount++;
        } catch (err) {
          console.error(`Failed to delete backup ${backup.filename}:`, err);
        }
      }

      return { success: true, deletedCount };
    } catch (error) {
      console.error('Cleanup backups error:', error);
      return { success: false, deletedCount: 0 };
    }
  }
}

export default SuperAdminService;
