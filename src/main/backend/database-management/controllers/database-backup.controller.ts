import { ipcMain, IpcMainEvent } from 'electron';
import { getDatabaseBackupService } from '../services/backup.service';

export class DatabaseBackupController {
  private backupService = getDatabaseBackupService();

  constructor() {
    this.registerHandlers();
  }

  private registerHandlers(): void {
    // Handle get available backups
    ipcMain.on('super-admin-get-backups', async (event: IpcMainEvent) => {
      try {
        const backups = this.backupService.getAvailableBackups();
        event.reply('super-admin-get-backups-reply', backups);
      } catch (error) {
        console.error('Get backups error:', error);
        event.reply('super-admin-get-backups-reply', []);
      }
    });

    // Handle cleanup old backups
    ipcMain.on('super-admin-cleanup-backups', async (event: IpcMainEvent, args: any[]) => {
      try {
        const keepCount = (args[0] as number) || 10;
        const result = this.backupService.cleanupOldBackups(keepCount);
        event.reply('super-admin-cleanup-backups-reply', result);
      } catch (error) {
        console.error('Cleanup backups error:', error);
        event.reply('super-admin-cleanup-backups-reply', {
          success: false,
          deletedCount: 0,
        });
      }
    });

    // Handle create manual backup
    ipcMain.on('super-admin-create-backup', async (event: IpcMainEvent) => {
      try {
        const result = this.backupService.createBackup();
        event.reply('super-admin-create-backup-reply', result);
      } catch (error: any) {
        console.error('Create backup error:', error);
        event.reply('super-admin-create-backup-reply', {
          success: false,
          error: error.message || 'Failed to create backup',
        });
      }
    });

    // Handle delete specific backup
    ipcMain.on('super-admin-delete-backup', async (event: IpcMainEvent, args: any[]) => {
      try {
        const backupPath = args[0] as string;
        const result = this.backupService.deleteBackup(backupPath);
        event.reply('super-admin-delete-backup-reply', result);
      } catch (error: any) {
        console.error('Delete backup error:', error);
        event.reply('super-admin-delete-backup-reply', {
          success: false,
          error: error.message || 'Failed to delete backup',
        });
      }
    });
  }
}

export default DatabaseBackupController;
