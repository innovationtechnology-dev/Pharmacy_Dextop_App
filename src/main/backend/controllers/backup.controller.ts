import fs from 'fs';
import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import {
  BackupService,
  BackupSettings,
  defaultBackupFolder,
} from '../services/backup.service';

/** Settings → Backup. Choosing/opening folders and "Export a copy" only work on the main computer. */
export class BackupController {
  private backupService: BackupService;

  constructor() {
    this.backupService = new BackupService();
    this.registerHandlers();
    this.backupService.startScheduler();
  }

  private info() {
    const settings = this.backupService.getSettings();
    return {
      settings,
      defaultFolder: defaultBackupFolder(),
      nextDueAt: this.backupService.nextDueAt(settings)?.toISOString() ?? null,
      backups: this.backupService.listBackups(settings.folder).slice(0, 20),
    };
  }

  private registerHandlers(): void {
    ipcMain.handle('backup-get-info', () => this.info());

    ipcMain.handle('backup-save-settings', (_event, patch: Partial<BackupSettings>) => {
      // Only these can be changed from the screen; the rest is bookkeeping.
      const { enabled, frequency, keepCount } = patch ?? {};
      this.backupService.saveSettings({
        ...(enabled !== undefined ? { enabled: !!enabled } : {}),
        ...(frequency !== undefined ? { frequency } : {}),
        ...(keepCount !== undefined ? { keepCount } : {}),
      });
      return this.info();
    });

    ipcMain.handle('backup-run-now', async () => {
      const result = await this.backupService.createBackup();
      return { ...result, info: this.info() };
    });

    ipcMain.handle('backup-choose-folder', async () => {
      const window = BrowserWindow.getAllWindows()[0];
      const current = this.backupService.getSettings().folder;
      const options: Electron.OpenDialogOptions = {
        title: 'Choose backup folder',
        defaultPath: fs.existsSync(current) ? current : undefined,
        properties: ['openDirectory', 'createDirectory'],
      };
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options);
      if (!result.canceled && result.filePaths[0]) {
        this.backupService.saveSettings({ folder: result.filePaths[0] });
      }
      return this.info();
    });

    ipcMain.handle('backup-open-folder', async () => {
      const { folder } = this.backupService.getSettings();
      fs.mkdirSync(folder, { recursive: true });
      const error = await shell.openPath(folder);
      return { success: !error, error: error || undefined };
    });

    ipcMain.handle('backup-export-copy', async () => {
      const window = BrowserWindow.getAllWindows()[0];
      const today = new Date().toISOString().slice(0, 10);
      const options: Electron.SaveDialogOptions = {
        title: 'Export database copy',
        defaultPath: `pharmacy-database-${today}.sqlite3`,
        filters: [{ name: 'SQLite Database', extensions: ['sqlite3', 'db'] }],
      };
      const result = window
        ? await dialog.showSaveDialog(window, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return { success: false, cancelled: true };
      try {
        await this.backupService.writeCopy(result.filePath);
        return { success: true, path: result.filePath };
      } catch (error) {
        return { success: false, error: String((error as Error)?.message ?? error) };
      }
    });
  }

  public stop(): void {
    this.backupService.stopScheduler();
  }
}
