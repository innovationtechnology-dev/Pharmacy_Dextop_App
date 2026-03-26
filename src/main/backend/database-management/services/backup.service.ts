import fs from 'fs';
import path from 'path';
import { databaseConfig } from '../../config/database.config';

export interface DatabaseBackup {
  filename: string;
  path: string;
  timestamp: string;
  size: number;
}

export class DatabaseBackupService {
  /**
   * Get the current database file path
   */
  public getDatabasePath(): string {
    return databaseConfig.getPath();
  }

  /**
   * Create a timestamped backup of the current database
   */
  public createBackup(): { success: boolean; backupPath?: string; error?: string } {
    try {
      const currentDbPath = this.getDatabasePath();
      
      if (!fs.existsSync(currentDbPath)) {
        return { success: false, error: 'Database file not found' };
      }

      const now = new Date();
      const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
      const backupPath = `${currentDbPath}.backup-${timestamp}.bak`;

      fs.copyFileSync(currentDbPath, backupPath);
      
      return { success: true, backupPath };
    } catch (error: any) {
      console.error('Create backup error:', error);
      return { success: false, error: error.message || 'Failed to create backup' };
    }
  }

  /**
   * Get list of available database backups
   */
  public getAvailableBackups(): DatabaseBackup[] {
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
            const rawTimestamp = timestampMatch[1];
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

  /**
   * Delete a specific backup file
   */
  public deleteBackup(backupPath: string): { success: boolean; error?: string } {
    try {
      if (!fs.existsSync(backupPath)) {
        return { success: false, error: 'Backup file not found' };
      }

      fs.unlinkSync(backupPath);
      return { success: true };
    } catch (error: any) {
      console.error('Delete backup error:', error);
      return { success: false, error: error.message || 'Failed to delete backup' };
    }
  }
}

let backupServiceInstance: DatabaseBackupService | null = null;

export const getDatabaseBackupService = (): DatabaseBackupService => {
  if (!backupServiceInstance) {
    backupServiceInstance = new DatabaseBackupService();
  }
  return backupServiceInstance;
};
