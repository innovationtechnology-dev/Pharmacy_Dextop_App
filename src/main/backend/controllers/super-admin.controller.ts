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
        const role = args[3] as string || 'cashier';
        const result = await this.superAdminService.createUser(name, email, password, role);
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
        const role = args[3] as string | undefined;
        const result = await this.superAdminService.updateUser(userId, name, email, role);
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

    // Handle get all generated license keys
    ipcMain.on('super-admin-get-generated-licenses', async (event: IpcMainEvent) => {
      try {
        const rows = await this.superAdminService.getAllGeneratedLicenses();
        event.reply('super-admin-get-generated-licenses-reply', rows);
      } catch (error) {
        console.error('Get generated licenses error:', error);
        event.reply('super-admin-get-generated-licenses-reply', []);
      }
    });

    // Handle revoke generated license key
    ipcMain.on('super-admin-revoke-generated-license', async (event: IpcMainEvent, args: any[]) => {
      try {
        const id = args[0] as number;
        const result = await this.superAdminService.revokeGeneratedLicense(id);
        event.reply('super-admin-revoke-generated-license-reply', result);
      } catch (error) {
        console.error('Revoke generated license error:', error);
        event.reply('super-admin-revoke-generated-license-reply', {
          success: false,
          error: 'Failed to revoke license key',
        });
      }
    });

    // Handle delete generated license key
    ipcMain.on('super-admin-delete-generated-license', async (event: IpcMainEvent, args: any[]) => {
      try {
        const id = args[0] as number;
        const result = await this.superAdminService.deleteGeneratedLicense(id);
        event.reply('super-admin-delete-generated-license-reply', result);
      } catch (error) {
        console.error('Delete generated license error:', error);
        event.reply('super-admin-delete-generated-license-reply', {
          success: false,
          error: 'Failed to delete generated license key',
        });
      }
    });

    // Note: Database management handlers (download, import, backup, restore, cleanup)
    // have been moved to the database-management module for better organization
  }
}

export default SuperAdminController;
