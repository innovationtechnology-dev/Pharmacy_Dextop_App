import { ipcMain, IpcMainEvent } from 'electron';
import { getDatabaseService } from '../services/database.service';
import { getDatabaseConnection } from '../database/database.connection';

export class DatabaseController {
  private databaseService = getDatabaseService();

  constructor() {
    this.registerHandlers();
  }

  /**
   * Register all IPC handlers for database operations
   */
  private registerHandlers(): void {
    // Handle SQL commands from renderer process
    ipcMain.on('asynchronous-sql-command', async (event: IpcMainEvent, sql: string) => {
      try {
        const result = await this.databaseService.query(sql);
        event.reply('asynchronous-sql-reply', result);
      } catch (error) {
        console.error('Database command error: ', error);
        event.reply('asynchronous-sql-reply', { error: String(error) });
      }
    });

    // Handle database path information requests
    ipcMain.on('ipc-show-userDataPaths', async (event: IpcMainEvent) => {
      try {
        const connection = getDatabaseConnection();
        const pathsInfo = connection.getPathsInfo();
        event.reply('ipc-show-userDataPaths', pathsInfo);
      } catch (error) {
        console.error('Error getting database paths: ', error);
        event.reply('ipc-show-userDataPaths', []);
      }
    });
  }

  /**
   * Clean up legacy/demo tables that are no longer needed
   */
  private async cleanupLegacyTables(): Promise<void> {
    try {
      // Drop myCoolTable if it exists (legacy demo table)
      await this.databaseService.execute('DROP TABLE IF EXISTS myCoolTable');
      console.log('Legacy tables cleaned up successfully');
    } catch (error) {
      console.error('Error cleaning up legacy tables:', error);
      // Don't throw - this is non-critical cleanup
    }
  }


  /**
   * Register additional IPC handlers for specific operations
   * Example: Add handlers for specific database operations
   */
  public registerCustomHandlers(): void {
    // Clean up legacy demo table
    this.cleanupLegacyTables();
    
    // Note: Database management handlers (backup, import, export, reset) 
    // are now handled by the database-management module
  }
}

export default DatabaseController;
