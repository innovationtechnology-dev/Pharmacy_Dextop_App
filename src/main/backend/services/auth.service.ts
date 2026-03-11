import crypto from 'crypto';
import { getDatabaseService } from './database.service';

export interface User {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: string;
  created_at: string;
}

export interface LoginResult {
  success: boolean;
  token?: string;
  user?: { id: number; name: string; email: string; role: string; phone?: string; address?: string; profilePicture?: string };
  error?: string;
}

export interface SignupResult {
  success: boolean;
  token?: string;
  user?: { id: number; name: string; email: string; role: string; phone?: string; address?: string; profilePicture?: string };
  error?: string;
}

export interface UpdateProfileParams {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  profilePicture?: string;
}

export class AuthService {
  private dbService = getDatabaseService();

  /**
   * Hash password using SHA256 (simple hashing for demo - use bcrypt in production)
   */
  private hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  /**
   * Generate a simple token (use JWT in production)
   */
  private generateToken(userId: number, email: string): string {
    const payload = `${userId}:${email}:${Date.now()}`;
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Initialize users table and add profile columns if missing
   */
  public async initializeTable(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'admin',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await this.dbService.execute(sql);
    await this.ensureProfileColumns();
  }

  /**
   * Add phone, address, profile_photo columns to users if they do not exist
   */
  private async ensureProfileColumns(): Promise<void> {
    const columns = [
      { name: 'phone', sql: 'ALTER TABLE users ADD COLUMN phone TEXT' },
      { name: 'address', sql: 'ALTER TABLE users ADD COLUMN address TEXT' },
      { name: 'profile_photo', sql: 'ALTER TABLE users ADD COLUMN profile_photo TEXT' },
    ];
    for (const col of columns) {
      try {
        await this.dbService.execute(col.sql);
      } catch (err: any) {
        if (err?.message?.includes('duplicate column name')) {
          // Column already exists, ignore
        } else {
          throw err;
        }
      }
    }
  }

  /**
   * Register a new user
   */
  public async signup(
    name: string,
    email: string,
    password: string,
    role: string = 'admin'
  ): Promise<SignupResult> {
    try {
      // Check if user already exists
      const existingUser = await this.dbService.queryOne(
        `SELECT * FROM users WHERE email = '${email.replace(/'/g, "''")}'`
      );

      if (existingUser) {
        return {
          success: false,
          error: 'User with this email already exists',
        };
      }

      // Hash password
      const passwordHash = this.hashPassword(password);

      // Insert new user
      const result = await this.dbService.execute(
        `INSERT INTO users (name, email, password_hash, role) VALUES ('${name.replace(/'/g, "''")}', '${email.replace(/'/g, "''")}', '${passwordHash}', '${role}')`
      );

      const userId = (result as any).lastID;

      // Generate token
      const token = this.generateToken(userId, email);

      return {
        success: true,
        token,
        user: {
          id: userId,
          name,
          email,
          role,
          phone: undefined,
          address: undefined,
          profilePicture: undefined,
        },
      };
    } catch (error) {
      console.error('Signup error:', error);
      return {
        success: false,
        error: 'Registration failed. Please try again.',
      };
    }
  }

  /**
   * Login user
   */
  public async login(email: string, password: string): Promise<LoginResult> {
    try {
      // Find user by email
      const user = await this.dbService.queryOne(
        `SELECT * FROM users WHERE email = '${email.replace(/'/g, "''")}'`
      ) as User | null;

      if (!user) {
        return {
          success: false,
          error: 'Invalid email or password',
        };
      }

      // Verify password
      const passwordHash = this.hashPassword(password);
      if (user.password_hash !== passwordHash) {
        return {
          success: false,
          error: 'Invalid email or password',
        };
      }

      // Generate token
      const token = this.generateToken(user.id, user.email);
      const u = user as any;
      return {
        success: true,
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          phone: u.phone ?? undefined,
          address: u.address ?? undefined,
          profilePicture: u.profile_photo ?? undefined,
        },
      };
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        error: 'Login failed. Please try again.',
      };
    }
  }

  /**
   * Verify token and get user (simplified - use JWT in production)
   */
  public async verifyToken(token: string): Promise<User | null> {
    try {
      // In a real app, decode JWT token here
      // For now, we'll use a simple approach: store token in a tokens table
      // This is a simplified version - use proper JWT in production
      return null; // Token verification simplified for now
    } catch (error) {
      console.error('Token verification error:', error);
      return null;
    }
  }

  /**
   * Get user by ID (including profile fields)
   */
  public async getUserById(userId: number): Promise<User | null> {
    try {
      const user = await this.dbService.queryOne(
        `SELECT id, name, email, role, created_at, phone, address, profile_photo FROM users WHERE id = ${userId}`
      ) as any;
      if (!user) return null;
      return {
        ...user,
        profilePicture: user.profile_photo,
      };
    } catch (error) {
      console.error('Get user error:', error);
      return null;
    }
  }

  /**
   * Update current user profile (name, email, phone, address, profile_photo)
   */
  public async updateProfile(userId: number, params: UpdateProfileParams): Promise<{ success: boolean; user?: any; error?: string }> {
    try {
      const esc = (v: string | undefined) => (v == null ? '' : String(v).replace(/'/g, "''"));
      const name = esc(params.name);
      const email = params.email != null ? esc(params.email) : null;
      const phone = params.phone != null ? esc(params.phone) : null;
      const address = params.address != null ? esc(params.address) : null;
      const profilePhoto = params.profilePicture != null ? esc(params.profilePicture) : null;

      const updates: string[] = [`name = '${name}'`];
      if (email !== null) updates.push(`email = '${email}'`);
      if (phone !== null) updates.push(`phone = '${phone}'`);
      if (address !== null) updates.push(`address = '${address}'`);
      if (profilePhoto !== null) updates.push(`profile_photo = '${profilePhoto}'`);

      await this.dbService.execute(
        `UPDATE users SET ${updates.join(', ')} WHERE id = ${userId}`
      );

      const user = await this.dbService.queryOne(
        `SELECT id, name, email, role, created_at, phone, address, profile_photo FROM users WHERE id = ${userId}`
      ) as any;
      if (!user) {
        return { success: false, error: 'User not found after update' };
      }
      return {
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          phone: user.phone ?? undefined,
          address: user.address ?? undefined,
          profilePicture: user.profile_photo ?? undefined,
        },
      };
    } catch (error) {
      console.error('Update profile error:', error);
      return { success: false, error: 'Failed to update profile' };
    }
  }
}

export default AuthService;
