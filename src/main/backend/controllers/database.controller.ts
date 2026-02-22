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
   * Register additional IPC handlers for specific operations
   * Example: Add handlers for specific database operations
   */
  public registerCustomHandlers(): void {
    // Example: Custom handler for a specific operation
    // ipcMain.on('get-users', async (event: IpcMainEvent) => {
    //   try {
    //     const users = await this.databaseService.query('SELECT * FROM users');
    //     event.reply('get-users-reply', users);
    //   } catch (error) {
    //     event.reply('get-users-reply', { error: String(error) });
    //   }
    // });
  }
}

export default DatabaseController;
