import { ipcMain, IpcMainEvent, dialog, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { SuperAdminService } from '../services/super-admin.service';

export class SuperAdminController {
  private superAdminService: SuperAdminService;

  constructor() {
    this.superAdminService = new SuperAdminService();
    this.registerHandlers();
  }

  /**
   * Initialize super admin data
   */
  public async initializeTables(): Promise<void> {
    await this.superAdminService.initializeSuperAdmin();
  }

  /**
   * Register all IPC handlers for super admin operations
   */
  private registerHandlers(): void {
    // Handle super admin login
    ipcMain.on('super-admin-login', async (event: IpcMainEvent, args: any[]) => {
      try {
        const email = args[0] as string;
        const password = args[1] as string;
        const result = await this.superAdminService.login(email, password);
        event.reply('super-admin-login-reply', result);
      } catch (error) {
        console.error('Super admin login error:', error);
        event.reply('super-admin-login-reply', {
          success: false,
          error: 'Login failed. Please try again.',
        });
      }
    });

    // Handle get all users
    ipcMain.on('super-admin-get-users', async (event: IpcMainEvent) => {
      try {
        const users = await this.superAdminService.getAllUsers();
        event.reply('super-admin-get-users-reply', users);
      } catch (error) {
        console.error('Get users error:', error);
        event.reply('super-admin-get-users-reply', []);
      }
    });

    // Handle create user
    ipcMain.on('super-admin-create-user', async (event: IpcMainEvent, args: any[]) => {
      try {
        const name = args[0] as string;
        const email = args[1] as string;
        const password = args[2] as string;
        const result = await this.superAdminService.createUser(name, email, password);
        event.reply('super-admin-create-user-reply', result);
      } catch (error) {
        console.error('Create user error:', error);
        event.reply('super-admin-create-user-reply', {
          success: false,
          error: 'Failed to create user',
        });
      }
    });

    // Handle update user
    ipcMain.on('super-admin-update-user', async (event: IpcMainEvent, args: any[]) => {
      try {
        const userId = args[0] as number;
        const name = args[1] as string;
        const email = args[2] as string;
        const result = await this.superAdminService.updateUser(userId, name, email);
        event.reply('super-admin-update-user-reply', result);
      } catch (error) {
        console.error('Update user error:', error);
        event.reply('super-admin-update-user-reply', {
          success: false,
          error: 'Failed to update user',
        });
      }
    });

    // Handle update user password
    ipcMain.on('super-admin-update-password', async (event: IpcMainEvent, args: any[]) => {
      try {
        const userId = args[0] as number;
        const newPassword = args[1] as string;
        const result = await this.superAdminService.updateUserPassword(userId, newPassword);
        event.reply('super-admin-update-password-reply', result);
      } catch (error) {
        console.error('Update password error:', error);
        event.reply('super-admin-update-password-reply', {
          success: false,
          error: 'Failed to update password',
        });
      }
    });

    // Handle delete user
    ipcMain.on('super-admin-delete-user', async (event: IpcMainEvent, args: any[]) => {
      try {
        const userId = args[0] as number;
        const result = await this.superAdminService.deleteUser(userId);
        event.reply('super-admin-delete-user-reply', result);
      } catch (error) {
        console.error('Delete user error:', error);
        event.reply('super-admin-delete-user-reply', {
          success: false,
          error: 'Failed to delete user',
        });
      }
    });

    // Handle get all licenses
    ipcMain.on('super-admin-get-licenses', async (event: IpcMainEvent) => {
      try {
        const licenses = await this.superAdminService.getAllLicenses();
        event.reply('super-admin-get-licenses-reply', licenses);
      } catch (error) {
        console.error('Get licenses error:', error);
        event.reply('super-admin-get-licenses-reply', []);
      }
    });

    // Handle get all activation codes
    ipcMain.on('super-admin-get-activation-codes', async (event: IpcMainEvent) => {
      try {
        const codes = await this.superAdminService.getAllActivationCodes();
        event.reply('super-admin-get-activation-codes-reply', codes);
      } catch (error) {
        console.error('Get activation codes error:', error);
        event.reply('super-admin-get-activation-codes-reply', []);
      }
    });

    // Handle update license
    ipcMain.on('super-admin-update-license', async (event: IpcMainEvent, args: any[]) => {
      try {
        const licenseId = args[0] as number;
        const expiryDate = args[1] as string;
        const isActive = args[2] as boolean;
        const result = await this.superAdminService.updateLicense(licenseId, expiryDate, isActive);
        event.reply('super-admin-update-license-reply', result);
      } catch (error) {
        console.error('Update license error:', error);
        event.reply('super-admin-update-license-reply', {
          success: false,
          error: 'Failed to update license',
        });
      }
    });

    // Handle delete license
    ipcMain.on('super-admin-delete-license', async (event: IpcMainEvent, args: any[]) => {
      try {
        const licenseId = args[0] as number;
        const result = await this.superAdminService.deleteLicense(licenseId);
        event.reply('super-admin-delete-license-reply', result);
      } catch (error) {
        console.error('Delete license error:', error);
        event.reply('super-admin-delete-license-reply', {
          success: false,
          error: 'Failed to delete license',
        });
      }
    });

    // Handle update activation code
    ipcMain.on('super-admin-update-activation-code', async (event: IpcMainEvent, args: any[]) => {
      try {
        const codeId = args[0] as number;
        const code = args[1] as string;
        const expiryDate = args[2] as string;
        const isUsed = args[3] as boolean;
        const result = await this.superAdminService.updateActivationCode(
          codeId,
          code,
          expiryDate,
          isUsed
        );
        event.reply('super-admin-update-activation-code-reply', result);
      } catch (error) {
        console.error('Update activation code error:', error);
        event.reply('super-admin-update-activation-code-reply', {
          success: false,
          error: 'Failed to update activation code',
        });
      }
    });

    // Handle delete activation code
    ipcMain.on('super-admin-delete-activation-code', async (event: IpcMainEvent, args: any[]) => {
      try {
        const codeId = args[0] as number;
        const result = await this.superAdminService.deleteActivationCode(codeId);
        event.reply('super-admin-delete-activation-code-reply', result);
      } catch (error) {
        console.error('Delete activation code error:', error);
        event.reply('super-admin-delete-activation-code-reply', {
          success: false,
          error: 'Failed to delete activation code',
        });
      }
    });

    // Handle download database
    ipcMain.on('super-admin-download-database', async (event: IpcMainEvent) => {
      try {
        const dbPath = this.superAdminService.getDatabasePath();
        const dbExists = fs.existsSync(dbPath);

        if (!dbExists) {
          event.reply('super-admin-download-database-reply', {
            success: false,
            error: 'Database file not found',
          });
          return;
        }

        // Get the main window to show save dialog
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
          defaultPath: 'pharmacy_database.sqlite3',
          filters: [{ name: 'SQLite Database', extensions: ['sqlite3', 'db'] }],
        });

        if (result.canceled) {
          event.reply('super-admin-download-database-reply', {
            success: false,
            error: 'Save cancelled',
          });
          return;
        }

        // Copy database file to selected location
        fs.copyFileSync(dbPath, result.filePath || '');
        event.reply('super-admin-download-database-reply', {
          success: true,
          path: result.filePath,
        });
      } catch (error) {
        console.error('Download database error:', error);
        event.reply('super-admin-download-database-reply', {
          success: false,
          error: 'Failed to download database',
        });
      }
    });
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

        const importResult = await this.superAdminService.importDatabase(result.filePaths[0]);
        event.reply('super-admin-import-database-reply', importResult);
      } catch (error) {
        console.error('Import database error:', error);
        event.reply('super-admin-import-database-reply', {
          success: false,
          error: 'Failed to import database',
        });
      }
    });
  }
}

export default SuperAdminController;
