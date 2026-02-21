/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import { app, BrowserWindow, shell, session, screen } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import { getBackend } from './backend';

// Suppress SSL certificate errors in development mode (must be called before app ready)
if (process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true') {
  app.commandLine.appendSwitch('ignore-certificate-errors');
  app.commandLine.appendSwitch('ignore-ssl-errors');
  app.commandLine.appendSwitch('ignore-certificate-errors-spki-list');
  app.commandLine.appendSwitch('disable-web-security');
  // Suppress Chromium SSL error logging
  app.commandLine.appendSwitch('log-level', '0');
  // Suppress all console errors from renderer processes
  app.commandLine.appendSwitch('disable-logging');
  
  // Redirect stderr to filter SSL errors (for development only)
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk: any, encoding?: any, callback?: any) => {
    const message = chunk.toString();
    // Filter out SSL handshake errors
    if (message.includes('ssl_client_socket_impl.cc') || 
        message.includes('handshake failed') ||
        message.includes('ERROR:ssl')) {
      return true; // Suppress the error
    }
    return originalStderrWrite(chunk, encoding, callback);
  };
}

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

let mainWindow: BrowserWindow | null = null;

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug')();
}

// Initialize backend
const backend = getBackend();

const installExtensions = async () => {
  try {
    const installer = require('electron-devtools-installer');
    const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
    const extensions = ['REACT_DEVELOPER_TOOLS'];

    await installer
      .default(
        extensions.map((name) => installer[name]),
        forceDownload
      )
      .catch(() => {
        // Silently fail if extension installation fails - app will work without devtools
      });
  } catch (error) {
    // Silently fail if extension installation fails - app will work without devtools
  }
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  // Suppress SSL certificate errors at session level (for development)
  if (isDebug) {
    session.defaultSession.setCertificateVerifyProc((request, callback) => {
      // Automatically allow all certificates in development
      callback(0);
    });
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  // Get primary display dimensions for cross-platform fullscreen
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    show: false,
    width: width,
    height: height,
    x: 0,
    y: 0,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  // Suppress SSL error messages in console
  if (isDebug && mainWindow.webContents) {
    mainWindow.webContents.on('certificate-error', (event, url, error, certificate, callback) => {
      // Suppress certificate errors in development
      event.preventDefault();
      callback(true);
    });
  }

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      // Show and maximize window - works on both Windows and macOS
      mainWindow.show();
      // Use maximize() for cross-platform compatibility
      // This ensures the window takes full screen size on both platforms
      mainWindow.maximize();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Only enable auto-updater in production mode
  if (!isDebug) {
    // Remove this if your app does not use auto updates
    // eslint-disable-next-line
    new AppUpdater();
  }
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', async () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  await backend.cleanup();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app
  .whenReady()
  .then(async () => {
    // Initialize backend before creating window
    await backend.initialize();
    createWindow();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.log);
