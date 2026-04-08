import { getDatabaseService } from './database.service';
import { repairMedicineForeignKeyReferences } from '../database/medicine-fk-repair';
import {
  buildBarcodeLookupCandidates,
  escapeSqlLikePattern,
  normalizeScannedBarcode,
} from '../../../common/barcodeLookup';

export type MedicineStatus = 'active' | 'inactive' | 'discontinued';

export interface Medicine {
  id?: number;
  barcode?: string;
  name: string;
  pillQuantity: number;
  status: MedicineStatus;
  manufacturer?: string;
  brandName?: string;
  minimumStockLevel?: number;
}

export interface MedicineWithInventory extends Medicine {
  totalAvailablePills: number;
  sellablePills: number;
  normalExpiryPills: number;
  nearExpiryPills: number;
  criticalExpiryPills: number;
  nextExpiryDate?: string | null;
  averageSellablePricePerPill?: number | null;
  manufacturer?: string;
  brandName?: string;
  minimumStockLevel: number;
}

export interface LowStockAlert {
  id: number;
  name: string;
  barcode?: string;
  sellablePills: number;
  minimumStockLevel: number;
  deficit: number;
}

export interface ExpiringMedicineAlert {
  id: number;
  name: string;
  barcode?: string;
  nextExpiryDate: string;
  availablePills: number;
  daysUntilExpiry: number;
}

// Tier model (days before expiry)
// - Normal: > 30 days
// - Near: 30 -> 7 days
// - Critical: 7 -> 0 days
// - Expired: < 0 days (not eligible to sell)
const UNEXPIRED_THRESHOLD_EXPRESSION = `date('now')`;
const CRITICAL_THRESHOLD_DAYS = 7;
const NEAR_THRESHOLD_DAYS = 30;
const CRITICAL_THRESHOLD_EXPRESSION = `date('now', '+${CRITICAL_THRESHOLD_DAYS} days')`;
const NEAR_THRESHOLD_EXPRESSION = `date('now', '+${NEAR_THRESHOLD_DAYS} days')`;

export class MedicineService {
  private dbService = getDatabaseService();

  /**
   * Initialize medicines table and enforce the required schema.
   */
  public async initializeTable(): Promise<void> {
    const tableInfo = await this.dbService.query(`PRAGMA table_info(medicines)`);
    const hasTable = Array.isArray(tableInfo) && tableInfo.length > 0;
    const columnNames = new Set(
      hasTable ? tableInfo.map((column: any) => column.name) : []
    );
    const hasPillQuantity = columnNames.has('pill_quantity');

    // Renaming `medicines` → `medicines_legacy` makes SQLite repoint child FKs to
    // `medicines_legacy`. Dropping that table without rebuilding children causes
    // "no such table: medicines_legacy" on purchase/sale rows.
    // Only do the destructive rename for truly old schemas that lack pill_quantity.
    const legacyTableExists = await this.dbService.queryOne(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='medicines_legacy'`
    );

    const needsLegacyTableMigration =
      hasTable && !legacyTableExists && !hasPillQuantity;

    if (needsLegacyTableMigration) {
      await this.dbService.execute('ALTER TABLE medicines RENAME TO medicines_legacy');
    } else if (legacyTableExists) {
      console.log(
        '⚠️  medicines_legacy table present; skipping medicines rename (avoid duplicate migration).'
      );
    }

    await this.dbService.execute(`
      CREATE TABLE IF NOT EXISTS medicines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        barcode TEXT UNIQUE,
        name TEXT NOT NULL,
        pill_quantity INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','discontinued')),
        manufacturer TEXT,
        brand_name TEXT,
        minimum_stock_level INTEGER NOT NULL DEFAULT 0
      )
    `);

    // Safe migration: add new columns to existing tables if they don't exist
    const medicinesInfo = await this.dbService.query(`PRAGMA table_info(medicines)`);
    if (!medicinesInfo.some((col: any) => col.name === 'manufacturer')) {
      await this.dbService.execute(`ALTER TABLE medicines ADD COLUMN manufacturer TEXT`);
    }
    if (!medicinesInfo.some((col: any) => col.name === 'brand_name')) {
      await this.dbService.execute(`ALTER TABLE medicines ADD COLUMN brand_name TEXT`);
    }
    if (!medicinesInfo.some((col: any) => col.name === 'minimum_stock_level')) {
      await this.dbService.execute(`ALTER TABLE medicines ADD COLUMN minimum_stock_level INTEGER NOT NULL DEFAULT 0`);
    }

    await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_medicines_barcode ON medicines(barcode)
    `);
    
    // Add index for name searches (improves search performance)
    await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_medicines_name ON medicines(name)
    `);
    
    // Add index for status filtering
    await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_medicines_status ON medicines(status)
    `);

    // Copy data from medicines_legacy into the new medicines table (only after rename)
    if (needsLegacyTableMigration) {
      const legacyInfo = tableInfo;
      const hasLegacyPillQuantity = legacyInfo.some(
        (column: any) => column.name === 'pill_quantity'
      );
      const hasLegacyQuantity = legacyInfo.some(
        (column: any) => column.name === 'quantity'
      );
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

      await this.dbService.execute('PRAGMA foreign_keys = OFF');
      await this.dbService.execute('DROP TABLE IF EXISTS medicines_legacy');
      await this.dbService.execute('PRAGMA foreign_keys = ON');
    }

    // Fix child tables that still reference dropped medicines_legacy (one-time repair)
    await repairMedicineForeignKeyReferences(this.dbService);
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
        m.manufacturer,
        m.brand_name,
        COALESCE(m.minimum_stock_level, 0) AS minimum_stock_level,
        COALESCE(SUM(pi.available_pills), 0) AS total_available_pills,
        -- Expired batches are NOT sellable, so "sellable_pills" means unexpired pills.
        COALESCE(
          SUM(CASE WHEN date(pi.expiry_date) >= ${UNEXPIRED_THRESHOLD_EXPRESSION} THEN pi.available_pills ELSE 0 END),
          0
        ) AS sellable_pills,
        -- Normal (more than NEAR_THRESHOLD_DAYS)
        COALESCE(
          SUM(CASE WHEN date(pi.expiry_date) >= ${NEAR_THRESHOLD_EXPRESSION} THEN pi.available_pills ELSE 0 END),
          0
        ) AS normal_expiry_pills,
        -- Near (>= critical threshold AND < near threshold)
        COALESCE(
          SUM(CASE WHEN date(pi.expiry_date) >= ${CRITICAL_THRESHOLD_EXPRESSION}
                   AND date(pi.expiry_date) < ${NEAR_THRESHOLD_EXPRESSION}
                   THEN pi.available_pills ELSE 0 END),
          0
        ) AS near_expiry_pills,
        -- Critical (>= today AND < critical threshold)
        COALESCE(
          SUM(CASE WHEN date(pi.expiry_date) >= ${UNEXPIRED_THRESHOLD_EXPRESSION}
                   AND date(pi.expiry_date) < ${CRITICAL_THRESHOLD_EXPRESSION}
                   THEN pi.available_pills ELSE 0 END),
          0
        ) AS critical_expiry_pills,
        -- Next expiry date among unexpired batches (FEFO uses ordering anyway)
        MIN(CASE WHEN date(pi.expiry_date) >= ${UNEXPIRED_THRESHOLD_EXPRESSION}
                 THEN date(pi.expiry_date) ELSE NULL END) AS next_expiry_date,
        CASE 
          WHEN SUM(CASE WHEN date(pi.expiry_date) >= ${UNEXPIRED_THRESHOLD_EXPRESSION} THEN pi.available_pills ELSE 0 END) > 0
            THEN SUM(CASE WHEN date(pi.expiry_date) >= ${UNEXPIRED_THRESHOLD_EXPRESSION} THEN (pi.price_per_pill * pi.available_pills) ELSE 0 END) 
                 / SUM(CASE WHEN date(pi.expiry_date) >= ${UNEXPIRED_THRESHOLD_EXPRESSION} THEN pi.available_pills ELSE 0 END)
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
      manufacturer: row.manufacturer || undefined,
      brandName: row.brand_name || undefined,
      minimumStockLevel: row.minimum_stock_level ?? 0,
      totalAvailablePills: row.total_available_pills ?? 0,
      sellablePills: row.sellable_pills ?? 0,
      normalExpiryPills: row.normal_expiry_pills ?? 0,
      nearExpiryPills: row.near_expiry_pills ?? 0,
      criticalExpiryPills: row.critical_expiry_pills ?? 0,
      nextExpiryDate: row.next_expiry_date || null,
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
   * Tries exact variants (leading zeros, trim), case-insensitive exact, then LIKE fallbacks
   * so hardware scanners match the same records as search.
   */
  public async getMedicineByBarcode(barcode: string): Promise<MedicineWithInventory | null> {
    const candidates = buildBarcodeLookupCandidates(barcode);
    const baseSqlExact = `
      ${this.baseInventorySelect}
      WHERE %WHERE%
      GROUP BY m.id
      LIMIT 1
    `;
    /** Prefer longest stored barcode when several rows fuzzy-match (more specific GTIN / payload). */
    const baseSqlFuzzy = `
      ${this.baseInventorySelect}
      WHERE %WHERE%
      GROUP BY m.id
      ORDER BY LENGTH(TRIM(m.barcode)) DESC, m.id ASC
      LIMIT 1
    `;

    // Try exact match with all candidates in one query using OR
    if (candidates.length > 0) {
      const placeholders = candidates.map(() => 'm.barcode = ?').join(' OR ');
      const sql = baseSqlExact.replace('%WHERE%', placeholders);
      const result = await this.dbService.queryOne(sql, candidates);
      if (result) return this.mapRowToMedicine(result);
    }

    const primary = normalizeScannedBarcode(barcode);
    if (primary) {
      // Try case-insensitive match with all candidates in one query
      const placeholders = candidates.map(() => 'LOWER(TRIM(m.barcode)) = LOWER(TRIM(?))').join(' OR ');
      const sqlCi = baseSqlExact.replace(
        '%WHERE%',
        `m.barcode IS NOT NULL AND (${placeholders})`
      );
      const rowCi = await this.dbService.queryOne(sqlCi, candidates);
      if (rowCi) return this.mapRowToMedicine(rowCi);
    }

    // Fuzzy paths: align with short product codes (EAN-8) and long GS1 strings
    if (primary.length >= 8) {
      const esc = escapeSqlLikePattern(primary);
      const likeParam = `%${esc}%`;
      const sqlLike = baseSqlFuzzy.replace(
        '%WHERE%',
        "m.barcode IS NOT NULL AND m.barcode != '' AND m.barcode LIKE ? ESCAPE '\\'"
      );
      const rowLike = await this.dbService.queryOne(sqlLike, [likeParam]);
      if (rowLike) return this.mapRowToMedicine(rowLike);
    }

    const sqlRev = baseSqlFuzzy.replace(
      '%WHERE%',
      'm.barcode IS NOT NULL AND LENGTH(TRIM(m.barcode)) >= 8 AND ? LIKE (\'%\' || m.barcode || \'%\')'
    );
    const rowRev = await this.dbService.queryOne(sqlRev, [primary]);
    if (rowRev) return this.mapRowToMedicine(rowRev);

    return null;
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
        OR IFNULL(m.manufacturer, '') LIKE ?
        OR IFNULL(m.brand_name, '') LIKE ?
      GROUP BY m.id
      ORDER BY m.name ASC
      LIMIT 50
    `;
    const searchPattern = `%${searchTerm}%`;
    const rows = await this.dbService.query(sql, [
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
    ]);
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
      INSERT INTO medicines (barcode, name, pill_quantity, status, manufacturer, brand_name, minimum_stock_level)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      medicine.barcode || null,
      medicine.name,
      medicine.pillQuantity,
      medicine.status || 'active',
      medicine.manufacturer || null,
      medicine.brandName || null,
      medicine.minimumStockLevel ?? 0,
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
    if (medicine.manufacturer !== undefined) {
      updates.push('manufacturer = ?');
      params.push(medicine.manufacturer || null);
    }
    if (medicine.brandName !== undefined) {
      updates.push('brand_name = ?');
      params.push(medicine.brandName || null);
    }
    if (medicine.minimumStockLevel !== undefined) {
      updates.push('minimum_stock_level = ?');
      params.push(medicine.minimumStockLevel ?? 0);
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

  /**
   * Return medicines whose current sellable stock is below their minimum_stock_level.
   * Only includes medicines that have minimum_stock_level > 0.
   */
  public async getLowStockMedicines(): Promise<LowStockAlert[]> {
    const sql = `
      SELECT
        m.id,
        m.name,
        m.barcode,
        COALESCE(m.minimum_stock_level, 0) AS minimum_stock_level,
        COALESCE(SUM(CASE
          WHEN pi.expiry_date IS NULL OR date(pi.expiry_date) >= date('now')
          THEN pi.available_pills ELSE 0 END), 0) AS sellable_pills
      FROM medicines m
      LEFT JOIN purchase_items pi ON pi.medicine_id = m.id
      WHERE m.minimum_stock_level > 0
        AND m.status = 'active'
      GROUP BY m.id
      HAVING sellable_pills < m.minimum_stock_level
      ORDER BY (m.minimum_stock_level - sellable_pills) DESC
    `;
    const rows = await this.dbService.query(sql);
    return rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      barcode: row.barcode || undefined,
      sellablePills: row.sellable_pills ?? 0,
      minimumStockLevel: row.minimum_stock_level ?? 0,
      deficit: (row.minimum_stock_level ?? 0) - (row.sellable_pills ?? 0),
    }));
  }
  /**
   * Get detailed inventory information (batches) for a specific medicine.
   */
  public async getMedicineInventoryDetails(medicineId: number): Promise<any[]> {
    const sql = `
      SELECT 
        pi.purchase_id AS purchaseId,
        m.name AS medicineName,
        m.pill_quantity AS pillQuantity,
        pi.total_pills AS totalPills,
        pi.available_pills AS availablePills,
        (pi.total_pills - pi.available_pills) AS soldPills,
        p.created_at AS purchaseDate,
        pi.expiry_date AS expiryDate,
        pi.price_per_packet AS originalPricePerPacket,
        CASE 
          WHEN pi.packet_quantity > 0 THEN (pi.discount_amount / pi.packet_quantity)
          ELSE 0 
        END AS discountPerPacket,
        COALESCE((
          SELECT AVG(si.unit_price) 
          FROM sale_items si 
          WHERE si.medicine_id = m.id
        ), 0) AS sellingPricePerPill
      FROM purchase_items pi
      JOIN purchases p ON pi.purchase_id = p.id
      JOIN medicines m ON pi.medicine_id = m.id
      WHERE pi.medicine_id = ?
      ORDER BY p.created_at DESC
    `;
    return await this.dbService.query(sql, [medicineId]);
  }
}

export default MedicineService;
