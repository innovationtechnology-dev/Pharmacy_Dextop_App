import { ipcMain, IpcMainEvent, dialog, BrowserWindow } from 'electron';
import { getDatabaseImportService } from '../services/import.service';

export class DatabaseImportController {
  private importService = getDatabaseImportService();

  constructor() {
    this.registerHandlers();
  }

  private registerHandlers(): void {
    // Handle import database
    ipcMain.on('super-admin-import-database', async (event: IpcMainEvent) => {
      try {
        const mainWindow = BrowserWindow.getAllWindows()[0];
        
        if (!mainWindow) {
          event.reply('super-admin-import-database-reply', {
            success: false,
            error: 'Main window not found',
          });
          return;
        }

        const result = await dialog.showOpenDialog(mainWindow, {
          title: 'Select Database File to Import',
          properties: ['openFile'],
          filters: [{ name: 'SQLite Database', extensions: ['sqlite3', 'db'] }],
        });

        if (result.canceled || result.filePaths.length === 0) {
          event.reply('super-admin-import-database-reply', {
            success: false,
            error: 'Import cancelled',
          });
          return;
        }

        const importResult = await this.importService.importDatabase(result.filePaths[0]);
        event.reply('super-admin-import-database-reply', importResult);
      } catch (error: any) {
        console.error('Import database error:', error);
        event.reply('super-admin-import-database-reply', {
          success: false,
          error: error.message || 'Failed to import database',
        });
      }
    });

    // Handle restore from backup
    ipcMain.on('super-admin-restore-backup', async (event: IpcMainEvent, args: any[]) => {
      try {
        const backupPath = args[0] as string;
        const result = await this.importService.restoreFromBackup(backupPath);
        event.reply('super-admin-restore-backup-reply', result);
      } catch (error: any) {
        console.error('Restore backup error:', error);
        event.reply('super-admin-restore-backup-reply', {
          success: false,
          error: error.message || 'Failed to restore from backup',
        });
      }
    });
  }
}

export default DatabaseImportController;
