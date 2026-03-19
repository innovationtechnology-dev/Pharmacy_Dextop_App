import { ipcMain } from 'electron';
import MigrationService from '../services/migration.service';

const migrationService = new MigrationService();

/**
 * Migration Controller
 * Handles database migrations and schema updates
 */
export const registerMigrationHandlers = () => {
  // Run all pending migrations
  ipcMain.handle('migration:run', async () => {
    try {
      await migrationService.runMigrations();
      return { success: true };
    } catch (error: any) {
      console.error('Error in migration:run:', error);
      return { success: false, error: error.message };
    }
  });

  // Get list of applied migrations
  ipcMain.handle('migration:get-applied', async () => {
    try {
      const migrations = await migrationService.getAppliedMigrations();
      return { success: true, migrations };
    } catch (error: any) {
      console.error('Error in migration:get-applied:', error);
      return { success: false, error: error.message };
    }
  });

  console.log('✅ Migration IPC handlers registered');
};
