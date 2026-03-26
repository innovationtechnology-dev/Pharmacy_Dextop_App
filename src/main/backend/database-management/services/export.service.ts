import fs from 'fs';
import { databaseConfig } from '../../config/database.config';
import { getDatabaseService } from '../../services/database.service';

export class DatabaseExportService {
  private dbService = getDatabaseService();

  /**
   * Get the current database file path
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
   * Export/Download the database to a specified location
   */
  public async exportDatabase(destinationPath: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Force WAL checkpoint before exporting
      try {
        await this.checkpointDatabase();
        console.log('WAL checkpoint completed before export');
      } catch (checkpointError) {
        console.warn('WAL checkpoint warning:', checkpointError);
        // Continue with export even if checkpoint fails
      }

      const dbPath = this.getDatabasePath();
      
      if (!fs.existsSync(dbPath)) {
        return { success: false, error: 'Database file not found' };
      }

      // Copy database file to destination
      fs.copyFileSync(dbPath, destinationPath);
      
      return { success: true };
    } catch (error: any) {
      console.error('Export database error:', error);
      return { success: false, error: error.message || 'Failed to export database' };
    }
  }
}

let exportServiceInstance: DatabaseExportService | null = null;

export const getDatabaseExportService = (): DatabaseExportService => {
  if (!exportServiceInstance) {
    exportServiceInstance = new DatabaseExportService();
  }
  return exportServiceInstance;
};
