import { ipcMain, IpcMainEvent } from 'electron';
import { getDatabaseResetService } from '../services/reset.service';

export class DatabaseResetController {
  private resetService = getDatabaseResetService();

  constructor() {
    this.registerHandlers();
  }

  private registerHandlers(): void {
    // Get table counts for reset confirmation
    ipcMain.on('get-table-counts', async (event: IpcMainEvent) => {
      try {
        const result = await this.resetService.getTableCounts();
        
        if (result.success) {
          event.reply('get-table-counts-reply', { success: true, data: result.data });
        } else {
          event.reply('get-table-counts-reply', { success: false, error: result.error });
        }
      } catch (error: any) {
        console.error('Get table counts error:', error);
        event.reply('get-table-counts-reply', { 
          success: false, 
          error: error.message || 'Failed to get table counts' 
        });
      }
    });

    // Reset entire system - delete all data
    ipcMain.on('system-reset-all-data', async (event: IpcMainEvent) => {
      try {
        const result = await this.resetService.resetAllData();
        
        if (result.success) {
          event.reply('system-reset-all-data-reply', { success: true, message: result.message });
        } else {
          event.reply('system-reset-all-data-reply', { success: false, error: result.error });
        }
      } catch (error: any) {
        console.error('System reset error:', error);
        event.reply('system-reset-all-data-reply', { 
          success: false, 
          error: error.message || 'Failed to reset system data' 
        });
      }
    });
  }
}

export default DatabaseResetController;
