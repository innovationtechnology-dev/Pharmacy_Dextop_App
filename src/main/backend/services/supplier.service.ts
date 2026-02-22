import { getDatabaseService } from './database.service';

export interface Supplier {
  id?: number;
  name: string;
  companyName?: string;
  email?: string;
  phone?: string;
  address?: string;
  contactPerson?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export class SupplierService {
  private dbService = getDatabaseService();

  /**
   * Initialize suppliers table
   */
  public async initializeTable(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        company_name TEXT,
        email TEXT,
        phone TEXT,
        address TEXT,
        contact_person TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await this.dbService.execute(sql);

    // Add company_name column if it doesn't exist (for existing databases)
    // Check if column exists first to avoid duplicate column error
    const tableInfo = await this.dbService.query('PRAGMA table_info(suppliers)');
    const hasCompanyName = tableInfo.some((col: any) => col.name === 'company_name');

    if (!hasCompanyName) {
      try {
        await this.dbService.execute(`
          ALTER TABLE suppliers ADD COLUMN company_name TEXT
        `);
      } catch (error) {
        // Column already exists or other error, ignore
        console.warn('Could not add company_name column:', error);
      }
    }

    // Create index on name for faster lookups
    await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name)
    `);
  }

  /**
   * Get all suppliers
   */
  public async getAllSuppliers(): Promise<Supplier[]> {
    const sql = 'SELECT * FROM suppliers ORDER BY name ASC';
    const suppliers = await this.dbService.query(sql);
    return suppliers.map(this.mapRowToSupplier);
  }

  /**
   * Get supplier by ID
   */
  public async getSupplierById(id: number): Promise<Supplier | null> {
    const sql = 'SELECT * FROM suppliers WHERE id = ? LIMIT 1';
    const result = await this.dbService.queryOne(sql, [id]);
    return result ? this.mapRowToSupplier(result) : null;
  }

  /**
   * Create a new supplier
   */
  public async createSupplier(supplier: Supplier): Promise<number> {
    const sql = `
      INSERT INTO suppliers (name, company_name, email, phone, address, contact_person, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      supplier.name,
      supplier.companyName || null,
      supplier.email || null,
      supplier.phone || null,
      supplier.address || null,
      supplier.contactPerson || null,
      supplier.notes || null,
    ];

    const result = await this.dbService.execute(sql, params);
    return (result as any).lastID;
  }

  /**
   * Update supplier
   */
  public async updateSupplier(id: number, supplier: Partial<Supplier>): Promise<void> {
    const updates: string[] = [];
    const params: any[] = [];

    if (supplier.name !== undefined) {
      updates.push('name = ?');
      params.push(supplier.name);
    }
    if (supplier.companyName !== undefined) {
      updates.push('company_name = ?');
      params.push(supplier.companyName || null);
    }
    if (supplier.email !== undefined) {
      updates.push('email = ?');
      params.push(supplier.email || null);
    }
    if (supplier.phone !== undefined) {
      updates.push('phone = ?');
      params.push(supplier.phone || null);
    }
    if (supplier.address !== undefined) {
      updates.push('address = ?');
      params.push(supplier.address || null);
    }
    if (supplier.contactPerson !== undefined) {
      updates.push('contact_person = ?');
      params.push(supplier.contactPerson || null);
    }
    if (supplier.notes !== undefined) {
      updates.push('notes = ?');
      params.push(supplier.notes || null);
    }

    if (updates.length === 0) return;

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    const sql = `UPDATE suppliers SET ${updates.join(', ')} WHERE id = ?`;
    await this.dbService.execute(sql, params);
  }

  /**
   * Delete supplier
   */
  public async deleteSupplier(id: number): Promise<void> {
    const sql = 'DELETE FROM suppliers WHERE id = ?';
    await this.dbService.execute(sql, [id]);
  }

  /**
   * Map database row to Supplier interface
   */
  private mapRowToSupplier(row: any): Supplier {
    return {
      id: row.id,
      name: row.name,
      companyName: row.company_name || row.companyName,
      email: row.email,
      phone: row.phone,
      address: row.address,
      contactPerson: row.contact_person,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export default SupplierService;

