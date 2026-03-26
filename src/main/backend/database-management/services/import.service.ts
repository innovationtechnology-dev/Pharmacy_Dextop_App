import fs from 'fs';
import sqlite3 from 'sqlite3';
import { getDatabaseService } from '../../services/database.service';
import { getDatabaseBackupService } from './backup.service';

export interface ImportResult {
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
}

export class DatabaseImportService {
  private dbService = getDatabaseService();
  private backupService = getDatabaseBackupService();

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

    const db = new sqlite3.Database(filePath);
    const missingTables: string[] = [];

    for (const tableName of requiredTables) {
      const exists = await new Promise<boolean>((resolve) => {
        db.get(
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

    await new Promise<void>((resolve) => db.close(() => resolve()));

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
   * Import database file with validation and automatic backup
   */
  public async importDatabase(filePath: string): Promise<ImportResult> {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'Source file does not exist' };
      }

      // 1. Validate schema
      const validation = await this.validateDatabaseSchema(filePath);
      
      if (!validation.valid) {
        return { 
          success: false, 
          error: `Incompatible database: Missing required tables (${validation.missingTables.join(', ')})` 
        };
      }

      // 2. Create automatic backup before importing
      const currentDbPath = this.backupService.getDatabasePath();
      const dbConnection = (require('../../database/database.connection')).getDatabaseConnection();

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
          const backupResult = this.backupService.createBackup();
          
          if (backupResult.success) {
            // Automatically cleanup old backups, keeping only the 3 most recent
            this.backupService.cleanupOldBackups(3);
          }
        }

        // Copy new database
        fs.copyFileSync(filePath, currentDbPath);

        // Reconnect
        await dbConnection.connect();

        // 3. Get summary of imported data
        const summary = await this.getDatabaseSummary();

        return { success: true, summary };
      } catch (err: any) {
        console.error('Error during database import:', err);

        let errorMessage = 'Failed to import database';
        if (err.code === 'EBUSY') {
          errorMessage = 'Database file is currently in use. Please close all other database tools and try again.';
        }

        // Attempt rollback - restore from most recent backup
        const backups = this.backupService.getAvailableBackups();
        if (backups.length > 0) {
          try {
            if (fs.existsSync(currentDbPath)) fs.unlinkSync(currentDbPath);
            fs.copyFileSync(backups[0].path, currentDbPath);
            await dbConnection.connect();
          } catch (rollbackErr) {
            console.error('Critical: Rollback failed:', rollbackErr);
          }
        }
        
        return { success: false, error: errorMessage };
      }
    } catch (error: any) {
      console.error('Import database error:', error);
      return { success: false, error: error.message || 'Database import failed' };
    }
  }

  /**
   * Restore database from a backup file
   */
  public async restoreFromBackup(backupPath: string): Promise<ImportResult> {
    try {
      if (!fs.existsSync(backupPath)) {
        return { success: false, error: 'Backup file does not exist' };
      }

      // Use the same import logic
      return await this.importDatabase(backupPath);
    } catch (error: any) {
      console.error('Restore from backup error:', error);
      return { success: false, error: error.message || 'Failed to restore from backup' };
    }
  }
}

let importServiceInstance: DatabaseImportService | null = null;

export const getDatabaseImportService = (): DatabaseImportService => {
  if (!importServiceInstance) {
    importServiceInstance = new DatabaseImportService();
  }
  return importServiceInstance;
};
