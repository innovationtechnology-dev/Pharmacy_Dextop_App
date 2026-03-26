import { ipcMain, IpcMainEvent, dialog, BrowserWindow, app } from 'electron';
import path from 'path';
import { getDatabaseExportService } from '../services/export.service';

export class DatabaseExportController {
  private exportService = getDatabaseExportService();

  constructor() {
    this.registerHandlers();
  }

  private registerHandlers(): void {
    // Handle download/export database
    ipcMain.on('super-admin-download-database', async (event: IpcMainEvent) => {
      try {
        const mainWindow = BrowserWindow.getAllWindows()[0];

        if (!mainWindow) {
          event.reply('super-admin-download-database-reply', {
            success: false,
            error: 'Main window not found',
          });
          return;
        }

        const result = await dialog.showSaveDialog(mainWindow, {
          title: 'Save Database File',
          defaultPath: path.join(
            app.getPath('documents'),
            `pharmacy_database_${new Date().toISOString().split('T')[0]}.sqlite3`
          ),
          filters: [{ name: 'SQLite Database', extensions: ['sqlite3', 'db'] }],
        });

        if (result.canceled || !result.filePath) {
          event.reply('super-admin-download-database-reply', {
            success: false,
            error: 'Save cancelled',
          });
          return;
        }

        const exportResult = await this.exportService.exportDatabase(result.filePath);
        
        if (exportResult.success) {
          event.reply('super-admin-download-database-reply', {
            success: true,
            path: result.filePath,
          });
        } else {
          event.reply('super-admin-download-database-reply', exportResult);
        }
      } catch (error: any) {
        console.error('Download database error:', error);
        event.reply('super-admin-download-database-reply', {
          success: false,
          error: error.message || 'Failed to download database',
        });
      }
    });
  }
}

export default DatabaseExportController;
