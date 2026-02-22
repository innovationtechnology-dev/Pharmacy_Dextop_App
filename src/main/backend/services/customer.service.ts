import { getDatabaseService } from './database.service';

export interface Customer {
  id?: number;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export class CustomerService {
  private dbService = getDatabaseService();

  /**
   * Initialize customers table
   */
  public async initializeTable(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        address TEXT,
        city TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await this.dbService.execute(sql);

    // Create index on name for faster lookups
    await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name)
    `);
  }

  /**
   * Get all customers
   */
  public async getAllCustomers(): Promise<Customer[]> {
    const sql = 'SELECT * FROM customers ORDER BY name ASC';
    const customers = await this.dbService.query(sql);
    return customers.map(this.mapRowToCustomer);
  }

  /**
   * Get customer by ID
   */
  public async getCustomerById(id: number): Promise<Customer | null> {
    const sql = 'SELECT * FROM customers WHERE id = ? LIMIT 1';
    const result = await this.dbService.queryOne(sql, [id]);
    return result ? this.mapRowToCustomer(result) : null;
  }

  /**
   * Create a new customer
   */
  public async createCustomer(customer: Customer): Promise<number> {
    const sql = `
      INSERT INTO customers (name, email, phone, address, city, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const params = [
      customer.name,
      customer.email || null,
      customer.phone || null,
      customer.address || null,
      customer.city || null,
      customer.notes || null,
    ];

    const result = await this.dbService.execute(sql, params);
    return (result as any).lastID;
  }

  /**
   * Update customer
   */
  public async updateCustomer(id: number, customer: Partial<Customer>): Promise<void> {
    const updates: string[] = [];
    const params: any[] = [];

    if (customer.name !== undefined) {
      updates.push('name = ?');
      params.push(customer.name);
    }
    if (customer.email !== undefined) {
      updates.push('email = ?');
      params.push(customer.email || null);
    }
    if (customer.phone !== undefined) {
      updates.push('phone = ?');
      params.push(customer.phone || null);
    }
    if (customer.address !== undefined) {
      updates.push('address = ?');
      params.push(customer.address || null);
    }
    if (customer.city !== undefined) {
      updates.push('city = ?');
      params.push(customer.city || null);
    }
    if (customer.notes !== undefined) {
      updates.push('notes = ?');
      params.push(customer.notes || null);
    }

    if (updates.length === 0) return;

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    const sql = `UPDATE customers SET ${updates.join(', ')} WHERE id = ?`;
    await this.dbService.execute(sql, params);
  }

  /**
   * Delete customer
   */
  public async deleteCustomer(id: number): Promise<void> {
    const sql = 'DELETE FROM customers WHERE id = ?';
    await this.dbService.execute(sql, [id]);
  }

  /**
   * Map database row to Customer interface
   */
  private mapRowToCustomer(row: any): Customer {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      address: row.address,
      city: row.city,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export default CustomerService;





