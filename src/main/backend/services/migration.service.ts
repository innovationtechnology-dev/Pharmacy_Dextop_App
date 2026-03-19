import { getDatabaseService } from './database.service';

/**
 * Database Migration Service
 * Handles schema updates and data migrations
 */
export class MigrationService {
  private dbService = getDatabaseService();

  /**
   * Initialize migrations table to track applied migrations
   */
  public async initializeMigrationsTable(): Promise<void> {
    await this.dbService.execute(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT NOT NULL UNIQUE,
        description TEXT,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  /**
   * Check if a migration has been applied
   */
  private async isMigrationApplied(version: string): Promise<boolean> {
    const result = await this.dbService.queryOne(
      'SELECT id FROM schema_migrations WHERE version = ?',
      [version]
    );
    return !!result;
  }

  /**
   * Mark a migration as applied
   */
  private async markMigrationApplied(version: string, description: string): Promise<void> {
    await this.dbService.execute(
      'INSERT INTO schema_migrations (version, description) VALUES (?, ?)',
      [version, description]
    );
  }

  /**
   * Run all pending migrations
   */
  public async runMigrations(): Promise<void> {
    await this.initializeMigrationsTable();

    // Migration 001: Create settings table
    await this.migration001_CreateSettingsTable();

    // Migration 002: Add audit columns to critical tables
    await this.migration002_AddAuditColumns();

    // Migration 003: Add soft delete support
    await this.migration003_AddSoftDeleteColumns();

    // Migration 004: Add performance indexes
    await this.migration004_AddPerformanceIndexes();

    console.log('✅ All database migrations completed successfully');
  }

  /**
   * Migration 001: Create settings table
   * Moves pharmacy settings from localStorage to database
   */
  private async migration001_CreateSettingsTable(): Promise<void> {
    const version = '001';
    if (await this.isMigrationApplied(version)) return;

    console.log('🔄 Running migration 001: Create settings table');

    await this.dbService.execute(`
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        pharmacy_name TEXT NOT NULL DEFAULT 'My Pharmacy',
        license_number TEXT,
        address TEXT,
        phone TEXT,
        email TEXT,
        website TEXT,
        tax_id TEXT,
        logo_url TEXT,
        currency TEXT DEFAULT 'PKR',
        thermal_printer_enabled INTEGER DEFAULT 0,
        thermal_printer_width INTEGER DEFAULT 80,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default settings row (only one row allowed due to CHECK constraint)
    const existing = await this.dbService.queryOne('SELECT id FROM settings WHERE id = 1');
    if (!existing) {
      await this.dbService.execute(`
        INSERT INTO settings (id, pharmacy_name, currency) 
        VALUES (1, 'My Pharmacy', 'PKR')
      `);
    }

    await this.markMigrationApplied(version, 'Create settings table');
    console.log('✅ Migration 001 completed');
  }

  /**
   * Migration 002: Add audit columns to critical tables
   * Tracks who created/updated records
   */
  private async migration002_AddAuditColumns(): Promise<void> {
    const version = '002';
    if (await this.isMigrationApplied(version)) return;

    console.log('🔄 Running migration 002: Add audit columns');

    const tables = ['sales', 'purchases', 'medicines'];
    
    for (const table of tables) {
      // Check if columns already exist
      const tableInfo = await this.dbService.query(`PRAGMA table_info(${table})`);
      const existingColumns = tableInfo.map((col: any) => col.name);

      if (!existingColumns.includes('created_by')) {
        try {
          await this.dbService.execute(
            `ALTER TABLE ${table} ADD COLUMN created_by INTEGER REFERENCES users(id)`
          );
        } catch (err: any) {
          if (!err?.message?.includes('duplicate column')) throw err;
        }
      }

      if (!existingColumns.includes('updated_by')) {
        try {
          await this.dbService.execute(
            `ALTER TABLE ${table} ADD COLUMN updated_by INTEGER REFERENCES users(id)`
          );
        } catch (err: any) {
          if (!err?.message?.includes('duplicate column')) throw err;
        }
      }

      // Add updated_at if missing
      if (!existingColumns.includes('updated_at')) {
        try {
          // SQLite doesn't allow DEFAULT CURRENT_TIMESTAMP in ALTER TABLE
          await this.dbService.execute(
            `ALTER TABLE ${table} ADD COLUMN updated_at DATETIME`
          );
          
          // Set updated_at for existing rows
          // Check if table has created_at column
          const hasCreatedAt = existingColumns.includes('created_at');
          
          if (hasCreatedAt) {
            // Use created_at if available (sales, purchases)
            await this.dbService.execute(
              `UPDATE ${table} SET updated_at = created_at WHERE updated_at IS NULL`
            );
          } else {
            // Use current time if created_at doesn't exist (medicines)
            await this.dbService.execute(
              `UPDATE ${table} SET updated_at = datetime('now', 'localtime') WHERE updated_at IS NULL`
            );
          }
        } catch (err: any) {
          if (!err?.message?.includes('duplicate column')) throw err;
        }
      }
    }

    await this.markMigrationApplied(version, 'Add audit columns to critical tables');
    console.log('✅ Migration 002 completed');
  }

  /**
   * Migration 003: Add soft delete support
   * Prevents permanent data loss
   */
  private async migration003_AddSoftDeleteColumns(): Promise<void> {
    const version = '003';
    if (await this.isMigrationApplied(version)) return;

    console.log('🔄 Running migration 003: Add soft delete columns');

    const tables = ['sales', 'purchases', 'medicines', 'customers', 'suppliers'];
    
    for (const table of tables) {
      const tableInfo = await this.dbService.query(`PRAGMA table_info(${table})`);
      const existingColumns = tableInfo.map((col: any) => col.name);

      if (!existingColumns.includes('deleted_at')) {
        try {
          await this.dbService.execute(
            `ALTER TABLE ${table} ADD COLUMN deleted_at DATETIME`
          );
        } catch (err: any) {
          if (!err?.message?.includes('duplicate column')) throw err;
        }
      }

      if (!existingColumns.includes('deleted_by')) {
        try {
          await this.dbService.execute(
            `ALTER TABLE ${table} ADD COLUMN deleted_by INTEGER REFERENCES users(id)`
          );
        } catch (err: any) {
          if (!err?.message?.includes('duplicate column')) throw err;
        }
      }
    }

    await this.markMigrationApplied(version, 'Add soft delete support');
    console.log('✅ Migration 003 completed');
  }

  /**
   * Migration 004: Add performance indexes
   * Improves query performance for large datasets
   */
  private async migration004_AddPerformanceIndexes(): Promise<void> {
    const version = '004';
    if (await this.isMigrationApplied(version)) return;

    console.log('🔄 Running migration 004: Add performance indexes');

    const indexes = [
      {
        name: 'idx_sales_date_customer',
        sql: 'CREATE INDEX IF NOT EXISTS idx_sales_date_customer ON sales(created_at, customer_name) WHERE deleted_at IS NULL'
      },
      {
        name: 'idx_purchase_items_medicine_expiry',
        sql: 'CREATE INDEX IF NOT EXISTS idx_purchase_items_medicine_expiry ON purchase_items(medicine_id, expiry_date)'
      },
      {
        name: 'idx_sale_items_sale_medicine',
        sql: 'CREATE INDEX IF NOT EXISTS idx_sale_items_sale_medicine ON sale_items(sale_id, medicine_id)'
      },
      {
        name: 'idx_purchase_payments_date_method',
        sql: 'CREATE INDEX IF NOT EXISTS idx_purchase_payments_date_method ON purchase_payments(payment_date, payment_method)'
      },
      {
        name: 'idx_medicines_barcode',
        sql: 'CREATE INDEX IF NOT EXISTS idx_medicines_barcode ON medicines(barcode) WHERE deleted_at IS NULL'
      },
      {
        name: 'idx_medicines_name',
        sql: 'CREATE INDEX IF NOT EXISTS idx_medicines_name ON medicines(name) WHERE deleted_at IS NULL'
      }
    ];

    for (const index of indexes) {
      try {
        await this.dbService.execute(index.sql);
      } catch (err: any) {
        // Index might already exist
        if (!err?.message?.includes('already exists')) {
          console.error(`Failed to create index ${index.name}:`, err);
        }
      }
    }

    await this.markMigrationApplied(version, 'Add performance indexes');
    console.log('✅ Migration 004 completed');
  }

  /**
   * Get list of applied migrations
   */
  public async getAppliedMigrations(): Promise<Array<{ version: string; description: string; applied_at: string }>> {
    try {
      await this.initializeMigrationsTable();
      const migrations = await this.dbService.query(
        'SELECT version, description, applied_at FROM schema_migrations ORDER BY version ASC'
      );
      return migrations as Array<{ version: string; description: string; applied_at: string }>;
    } catch (error) {
      console.error('Error getting applied migrations:', error);
      return [];
    }
  }
}

export default MigrationService;
