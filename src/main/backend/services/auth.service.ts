import crypto from 'crypto';
import { getDatabaseService } from './database.service';

export interface User {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  created_at: string;
}

export interface LoginResult {
  success: boolean;
  token?: string;
  user?: { id: number; name: string; email: string };
  error?: string;
}

export interface SignupResult {
  success: boolean;
  token?: string;
  user?: { id: number; name: string; email: string };
  error?: string;
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
   * Initialize users table
   */
  public async initializeTable(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await this.dbService.execute(sql);
  }

  /**
   * Register a new user
   */
  public async signup(
    name: string,
    email: string,
    password: string
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
        `INSERT INTO users (name, email, password_hash) VALUES ('${name.replace(/'/g, "''")}', '${email.replace(/'/g, "''")}', '${passwordHash}')`
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

      return {
        success: true,
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
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
   * Get user by ID
   */
  public async getUserById(userId: number): Promise<User | null> {
    try {
      const user = await this.dbService.queryOne(
        `SELECT id, name, email, created_at FROM users WHERE id = ${userId}`
      ) as User | null;
      return user;
    } catch (error) {
      console.error('Get user error:', error);
      return null;
    }
  }
}

export default AuthService;
