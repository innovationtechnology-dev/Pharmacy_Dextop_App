import { getDatabaseService } from './database.service';

export type MedicineStatus = 'active' | 'inactive' | 'discontinued';

export interface Medicine {
  id?: number;
  barcode?: string;
  name: string;
  pillQuantity: number;
  status: MedicineStatus;
}

export interface MedicineWithInventory extends Medicine {
  totalAvailablePills: number;
  sellablePills: number;
  averageSellablePricePerPill?: number | null;
}

export interface ExpiringMedicineAlert {
  id: number;
  name: string;
  barcode?: string;
  nextExpiryDate: string;
  availablePills: number;
  daysUntilExpiry: number;
}

const SELLABLE_THRESHOLD_EXPRESSION = `date('now', '+30 days')`;

export class MedicineService {
  private dbService = getDatabaseService();

  /**
   * Initialize medicines table and enforce the required schema.
   */
  public async initializeTable(): Promise<void> {
    const tableInfo = await this.dbService.query(`PRAGMA table_info(medicines)`);
    const hasTable = Array.isArray(tableInfo) && tableInfo.length > 0;
    const expectedColumns = ['id', 'barcode', 'name', 'pill_quantity', 'status'];
    const schemaMatches =
      hasTable &&
      tableInfo.every((column: any) => expectedColumns.includes(column.name)) &&
      tableInfo.length === expectedColumns.length;

    if (hasTable && !schemaMatches) {
      await this.dbService.execute('ALTER TABLE medicines RENAME TO medicines_legacy');
    }

    await this.dbService.execute(`
      CREATE TABLE IF NOT EXISTS medicines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        barcode TEXT UNIQUE,
        name TEXT NOT NULL,
        pill_quantity INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','discontinued'))
      )
    `);

    await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_medicines_barcode ON medicines(barcode)
    `);

    if (hasTable && !schemaMatches) {
      const legacyInfo = tableInfo;
      const hasLegacyPillQuantity = legacyInfo.some((column: any) => column.name === 'pill_quantity');
      const hasLegacyQuantity = legacyInfo.some((column: any) => column.name === 'quantity');
      const pillSourceExpression = hasLegacyPillQuantity
        ? 'COALESCE(pill_quantity, 0)'
        : hasLegacyQuantity
          ? 'COALESCE(quantity, 0)'
          : '0';

      await this.dbService.execute(`
        INSERT INTO medicines (id, barcode, name, pill_quantity, status)
        SELECT 
          id,
          barcode,
          name,
          ${pillSourceExpression},
          'active'
        FROM medicines_legacy
      `);
      await this.dbService.execute('DROP TABLE IF EXISTS medicines_legacy');
    }
  }

  /**
   * Base SELECT with aggregated inventory details.
   */
  private get baseInventorySelect(): string {
    return `
      SELECT 
        m.id,
        m.name,
        m.barcode,
        m.pill_quantity,
        m.status,
        COALESCE(SUM(pi.available_pills), 0) AS total_available_pills,
        COALESCE(SUM(CASE WHEN pi.expiry_date >= ${SELLABLE_THRESHOLD_EXPRESSION} THEN pi.available_pills ELSE 0 END), 0) AS sellable_pills,
        CASE 
          WHEN SUM(CASE WHEN pi.expiry_date >= ${SELLABLE_THRESHOLD_EXPRESSION} THEN pi.available_pills ELSE 0 END) > 0
            THEN SUM(CASE WHEN pi.expiry_date >= ${SELLABLE_THRESHOLD_EXPRESSION} THEN (pi.price_per_pill * pi.available_pills) ELSE 0 END) 
                 / SUM(CASE WHEN pi.expiry_date >= ${SELLABLE_THRESHOLD_EXPRESSION} THEN pi.available_pills ELSE 0 END)
          ELSE NULL
        END AS avg_sellable_price_per_pill
      FROM medicines m
      LEFT JOIN purchase_items pi ON pi.medicine_id = m.id
    `;
  }

  private mapRowToMedicine(row: any): MedicineWithInventory {
    return {
      id: row.id,
      name: row.name,
      barcode: row.barcode || undefined,
      pillQuantity: row.pill_quantity,
      status: row.status as MedicineStatus,
      totalAvailablePills: row.total_available_pills ?? 0,
      sellablePills: row.sellable_pills ?? 0,
      averageSellablePricePerPill: row.avg_sellable_price_per_pill || null,
    };
  }

  /**
   * Get all medicines with aggregated inventory information.
   */
  public async getAllMedicines(): Promise<MedicineWithInventory[]> {
    const sql = `
      ${this.baseInventorySelect}
      GROUP BY m.id
      ORDER BY m.name ASC
    `;
    const rows = await this.dbService.query(sql);
    return rows.map((row) => this.mapRowToMedicine(row));
  }

  /**
   * Get medicine by barcode (includes inventory aggregates).
   */
  public async getMedicineByBarcode(barcode: string): Promise<MedicineWithInventory | null> {
    const sql = `
      ${this.baseInventorySelect}
      WHERE m.barcode = ?
      GROUP BY m.id
      LIMIT 1
    `;
    const result = await this.dbService.queryOne(sql, [barcode]);
    return result ? this.mapRowToMedicine(result) : null;
  }

  /**
   * Get medicine by ID (includes inventory aggregates).
   */
  public async getMedicineById(id: number): Promise<MedicineWithInventory | null> {
    const sql = `
      ${this.baseInventorySelect}
      WHERE m.id = ?
      GROUP BY m.id
      LIMIT 1
    `;
    const result = await this.dbService.queryOne(sql, [id]);
    return result ? this.mapRowToMedicine(result) : null;
  }

  /**
   * Search medicines by name or barcode.
   */
  public async searchMedicines(searchTerm: string): Promise<MedicineWithInventory[]> {
    const sql = `
      ${this.baseInventorySelect}
      WHERE m.name LIKE ? OR m.barcode LIKE ?
      GROUP BY m.id
      ORDER BY m.name ASC
      LIMIT 50
    `;
    const searchPattern = `%${searchTerm}%`;
    const rows = await this.dbService.query(sql, [searchPattern, searchPattern]);
    return rows.map((row) => this.mapRowToMedicine(row));
  }

  /**
   * Create a new medicine.
   */
  public async createMedicine(medicine: Medicine): Promise<number> {
    // Check if barcode already exists
    if (medicine.barcode) {
      const existingMedicine = await this.dbService.queryOne(
        'SELECT id, name FROM medicines WHERE barcode = ?',
        [medicine.barcode]
      );
      
      if (existingMedicine) {
        throw new Error(`Barcode "${medicine.barcode}" already exists for medicine "${existingMedicine.name}". Please use a different barcode.`);
      }
    }

    const sql = `
      INSERT INTO medicines (barcode, name, pill_quantity, status)
      VALUES (?, ?, ?, ?)
    `;
    const params = [
      medicine.barcode || null,
      medicine.name,
      medicine.pillQuantity,
      medicine.status || 'active',
    ];
    
    try {
      const result = await this.dbService.execute(sql, params);
      return (result as any).lastID;
    } catch (error: any) {
      // Handle any other database errors
      if (error.message && error.message.includes('UNIQUE constraint failed')) {
        throw new Error('A medicine with this barcode already exists. Please use a different barcode.');
      }
      throw error;
    }
  }

  /**
   * Update medicine metadata (name, barcode, pills per packet, status).
   * Only allows status updates for medicines used in transactions.
   */
  public async updateMedicine(id: number, medicine: Partial<Medicine>): Promise<void> {
    // Check if medicine has been used in transactions
    const hasTransactions = await this.hasMedicineBeenUsed(id);
    
    // If medicine has transactions, only allow status updates
    if (hasTransactions) {
      // Check if trying to update anything other than status
      const hasNonStatusUpdates = 
        medicine.name !== undefined || 
        medicine.barcode !== undefined || 
        medicine.pillQuantity !== undefined;
      
      if (hasNonStatusUpdates) {
        throw new Error('Cannot edit medicine details: This medicine has been used in transactions. You can only change its status (active/inactive/discontinued).');
      }
    }

    // Check if barcode is being updated and if it already exists
    if (medicine.barcode !== undefined) {
      const existingMedicine = await this.dbService.queryOne(
        'SELECT id, name FROM medicines WHERE barcode = ? AND id != ?',
        [medicine.barcode, id]
      );
      
      if (existingMedicine) {
        throw new Error(`Barcode "${medicine.barcode}" already exists for medicine "${existingMedicine.name}". Please use a different barcode.`);
      }
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (medicine.name !== undefined) {
      updates.push('name = ?');
      params.push(medicine.name);
    }
    if (medicine.barcode !== undefined) {
      updates.push('barcode = ?');
      params.push(medicine.barcode || null);
    }
    if (medicine.pillQuantity !== undefined) {
      updates.push('pill_quantity = ?');
      params.push(medicine.pillQuantity);
    }
    if (medicine.status !== undefined) {
      updates.push('status = ?');
      params.push(medicine.status);
    }

    if (updates.length === 0) return;

    params.push(id);
    const sql = `UPDATE medicines SET ${updates.join(', ')} WHERE id = ?`;
    
    try {
      await this.dbService.execute(sql, params);
    } catch (error: any) {
      // Handle any other database errors
      if (error.message && error.message.includes('UNIQUE constraint failed')) {
        throw new Error('A medicine with this barcode already exists. Please use a different barcode.');
      }
      throw error;
    }
  }

  /**
   * Check if medicine has been used in any transactions
   */
  private async hasMedicineBeenUsed(id: number): Promise<boolean> {
    // Check purchase items
    const purchaseCheck = await this.dbService.queryOne(
      'SELECT COUNT(*) as count FROM purchase_items WHERE medicine_id = ?',
      [id]
    );
    if (purchaseCheck && purchaseCheck.count > 0) return true;

    // Check sale items
    const saleCheck = await this.dbService.queryOne(
      'SELECT COUNT(*) as count FROM sale_items WHERE medicine_id = ?',
      [id]
    );
    if (saleCheck && saleCheck.count > 0) return true;

    // Check sale return items
    const returnCheck = await this.dbService.queryOne(
      'SELECT COUNT(*) as count FROM sale_return_items WHERE medicine_id = ?',
      [id]
    );
    if (returnCheck && returnCheck.count > 0) return true;

    return false;
  }

  /**
   * Delete medicine metadata.
   * Only allows deletion if medicine has never been used in any transactions.
   */
  public async deleteMedicine(id: number): Promise<void> {
    // Check if medicine is used in any purchase items
    const purchaseCheck = await this.dbService.queryOne(
      'SELECT COUNT(*) as count FROM purchase_items WHERE medicine_id = ?',
      [id]
    );
    
    if (purchaseCheck && purchaseCheck.count > 0) {
      throw new Error('Cannot delete medicine: It has been used in purchase transactions. You can mark it as inactive instead.');
    }

    // Check if medicine is used in any sale items
    const saleCheck = await this.dbService.queryOne(
      'SELECT COUNT(*) as count FROM sale_items WHERE medicine_id = ?',
      [id]
    );
    
    if (saleCheck && saleCheck.count > 0) {
      throw new Error('Cannot delete medicine: It has been used in sale transactions. You can mark it as inactive instead.');
    }

    // Check if medicine is used in any sale return items
    const returnCheck = await this.dbService.queryOne(
      'SELECT COUNT(*) as count FROM sale_return_items WHERE medicine_id = ?',
      [id]
    );
    
    if (returnCheck && returnCheck.count > 0) {
      throw new Error('Cannot delete medicine: It has been used in return transactions. You can mark it as inactive instead.');
    }

    // If no transactions found, safe to delete
    const sql = `DELETE FROM medicines WHERE id = ?`;
    await this.dbService.execute(sql, [id]);
  }

  /**
   * Get medicines whose stock expires within a threshold.
   */
  public async getExpiringMedicines(thresholdDays: number = 30): Promise<ExpiringMedicineAlert[]> {
    const sql = `
      SELECT
        m.id,
        m.name,
        m.barcode,
        MIN(pi.expiry_date) AS next_expiry_date,
        SUM(pi.available_pills) AS available_pills,
        CAST((julianday(MIN(pi.expiry_date)) - julianday('now')) AS INTEGER) AS days_until_expiry
      FROM medicines m
      JOIN purchase_items pi ON pi.medicine_id = m.id
      WHERE pi.available_pills > 0
        AND pi.expiry_date IS NOT NULL
        AND date(pi.expiry_date) >= date('now')
        AND date(pi.expiry_date) <= date('now', '+' || ? || ' days')
      GROUP BY m.id, m.name, m.barcode
      ORDER BY MIN(pi.expiry_date) ASC
    `;

    const rows = await this.dbService.query(sql, [thresholdDays]);
    return rows
      .filter((row: any) => row.next_expiry_date)
      .map((row: any) => ({
        id: row.id,
        name: row.name,
        barcode: row.barcode || undefined,
        nextExpiryDate: row.next_expiry_date,
        availablePills: row.available_pills || 0,
        daysUntilExpiry: row.days_until_expiry ?? 0,
      }));
  }
}

export default MedicineService;
