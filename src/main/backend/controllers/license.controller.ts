import { ipcMain, IpcMainEvent } from 'electron';
import { LicenseService } from '../services/license.service';

export class LicenseController {
  private licenseService: LicenseService;

  constructor() {
    this.licenseService = new LicenseService();
    this.registerHandlers();
  }

  /**
   * Initialize license tables
   */
  public async initializeTables(): Promise<void> {
    try {
      await this.licenseService.initializeTable();
      console.log('License tables initialized');
    } catch (error) {
      console.error('Failed to initialize license tables:', error);
    }
  }

  /**
   * Register all IPC handlers for license operations
   */
  private registerHandlers(): void {
    // Handle license activation
    ipcMain.on('license-activate', async (event: IpcMainEvent, args: any[]) => {
      try {
        const userId = args[0] as number;
        const activationCode = args[1] as string;
        const result = await this.licenseService.activateLicense(userId, activationCode);
        
        if (result.success) {
          console.log(`✅ License activated successfully for user ${userId}`);
        }
        
        event.reply('license-activate-reply', result);
      } catch (error) {
        console.error('License activation handler error:', error);
        event.reply('license-activate-reply', {
          success: false,
          error: 'Failed to activate license. Please try again.',
        });
      }
    });

    // Handle get license status
    ipcMain.on('license-get-status', async (event: IpcMainEvent, args: any[]) => {
      try {
        const userId = args[0] as number;
        const status = await this.licenseService.getLicenseStatus(userId);
        event.reply('license-get-status-reply', status);
      } catch (error) {
        console.error('Get license status handler error:', error);
        event.reply('license-get-status-reply', {
          isActive: false,
          expiryDate: null,
          daysUntilExpiry: null,
          isExpired: true,
          isExpiringSoon: false,
        });
      }
    });

    // Handle get license details
    ipcMain.on('license-get', async (event: IpcMainEvent, args: any[]) => {
      try {
        const userId = args[0] as number;
        const license = await this.licenseService.getLicense(userId);
        event.reply('license-get-reply', license);
      } catch (error) {
        console.error('Get license handler error:', error);
        event.reply('license-get-reply', null);
      }
    });
  }
}

export default LicenseController;

