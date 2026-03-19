import { ipcMain } from 'electron';
import SettingsService from '../services/settings.service';

const settingsService = new SettingsService();

/**
 * Settings Controller
 * Handles IPC communication for pharmacy settings
 */
export const registerSettingsHandlers = () => {
  // Get pharmacy settings
  ipcMain.handle('settings:get', async () => {
    try {
      const settings = await settingsService.getSettings();
      return { success: true, settings };
    } catch (error: any) {
      console.error('Error in settings:get:', error);
      return { success: false, error: error.message };
    }
  });

  // Update pharmacy settings
  ipcMain.handle('settings:update', async (_event, params) => {
    try {
      return await settingsService.updateSettings(params);
    } catch (error: any) {
      console.error('Error in settings:update:', error);
      return { success: false, error: error.message };
    }
  });

  // Migrate settings from localStorage (one-time operation)
  ipcMain.handle('settings:migrate-from-localstorage', async (_event, localStorageData) => {
    try {
      return await settingsService.migrateFromLocalStorage(localStorageData);
    } catch (error: any) {
      console.error('Error in settings:migrate-from-localstorage:', error);
      return { success: false, error: error.message };
    }
  });

  console.log('✅ Settings IPC handlers registered');
};
