import { ipcMain, IpcMainEvent } from 'electron';
import { AuthService } from '../services/auth.service';
import { getDatabaseService } from '../services/database.service';

export class AuthController {
  private authService: AuthService;
  private dbService = getDatabaseService();

  constructor() {
    this.authService = new AuthService();
    this.registerHandlers();
  }

  /**
   * Initialize authentication tables
   */
  public async initializeTables(): Promise<void> {
    try {
      await this.authService.initializeTable();
      console.log('Authentication tables initialized');
    } catch (error) {
      console.error('Failed to initialize auth tables:', error);
    }
  }

  /**
   * Register all IPC handlers for authentication
   */
  private registerHandlers(): void {
    // Handle user signup
    ipcMain.on('auth-signup', async (event: IpcMainEvent, args: any[]) => {
      try {
        const data = args[0] as { name: string; email: string; password: string; role?: string };
        const role = data.role || 'admin';
        const result = await this.authService.signup(data.name, data.email, data.password, role);
        
        // Log to verify data storage
        if (result.success) {
          console.log(`✅ User registered successfully: ${data.email} as ${role} (ID: ${result.user?.id})`);
          console.log(`📊 Stored in database: name=${data.name}, email=${data.email}, role=${role}`);
        }
        
        event.reply('auth-signup-reply', result);
      } catch (error) {
        console.error('Signup handler error:', error);
        event.reply('auth-signup-reply', {
          success: false,
          error: 'Registration failed. Please try again.',
        });
      }
    });

    // Handle user login
    ipcMain.on('auth-login', async (event: IpcMainEvent, args: any[]) => {
      try {
        const data = args[0] as { email: string; password: string };
        const result = await this.authService.login(data.email, data.password);
        
        // Log to verify database query
        if (result.success) {
          console.log(`✅ User logged in successfully: ${data.email}`);
        } else {
          console.log(`❌ Login failed for: ${data.email}`);
        }
        
        event.reply('auth-login-reply', result);
      } catch (error) {
        console.error('Login handler error:', error);
        event.reply('auth-login-reply', {
          success: false,
          error: 'Login failed. Please try again.',
        });
      }
    });

    // Handle token verification
    ipcMain.on('auth-verify-token', async (event: IpcMainEvent, args: any[]) => {
      try {
        const token = args[0] as string;
        const user = await this.authService.verifyToken(token);
        event.reply('auth-verify-token-reply', { valid: !!user, user });
      } catch (error) {
        console.error('Token verification error:', error);
        event.reply('auth-verify-token-reply', { valid: false, user: null });
      }
    });

    // Handle get user by ID
    ipcMain.on('auth-get-user', async (event: IpcMainEvent, args: any[]) => {
      try {
        const userId = args[0] as number;
        const user = await this.authService.getUserById(userId);
        event.reply('auth-get-user-reply', user);
      } catch (error) {
        console.error('Get user error:', error);
        event.reply('auth-get-user-reply', null);
      }
    });

    // Handle get all users (for testing/debugging)
    ipcMain.on('auth-get-all-users', async (event: IpcMainEvent) => {
      try {
        const users = await this.dbService.query('SELECT id, name, email, created_at FROM users');
        console.log(`📋 Total users in database: ${users.length}`);
        event.reply('auth-get-all-users-reply', users);
      } catch (error) {
        console.error('Get all users error:', error);
        event.reply('auth-get-all-users-reply', []);
      }
    });
  }
}

export default AuthController;
