import { getDatabaseService } from './database.service';
import { SaleReturnService } from './sale-return.service';

// Expired batches are NOT eligible to sell.
const UNEXPIRED_THRESHOLD_EXPRESSION = `date('now')`;

export interface SaleItemInput {
  medicineId: number;
  medicineName: string;
  pills: number;
  unitPrice: number;
  discountAmount?: number;
  taxAmount?: number;
}

export interface SaleItem extends SaleItemInput {
  subtotal: number;
  total: number;
}

export interface Sale {
  id?: number;
  items: SaleItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  additionalDiscount?: number;
  additionalDiscountAmount?: number;
  total: number;
  customerName?: string;
  customerPhone?: string;
  saleType?: string;
  prescriptionNumber?: string;
  doctorName?: string;
  createdAt?: string;
}

export class SalesService {
  private dbService = getDatabaseService();
  private saleReturnService = new SaleReturnService();

  /**
   * Flat sale rows by date range [fromDate..toDate]
   */
  public async getAllSalesFlatRowsByRange(fromDate: string, toDate: string): Promise<Array<{
    saleId: number;
    createdAt: string;
    customerName?: string;
    customerPhone?: string;
    saleType?: string;
    additionalDiscount?: number;
    additionalDiscountAmount?: number;
    medicineId: number;
    medicineName: string;
    pills: number;
    unitPrice: number;
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    total: number;
  }>> {
    // If both dates are empty, return all records
    if (!fromDate && !toDate) {
      const sql = `
        SELECT 
          s.id AS saleId,
          s.created_at AS createdAt,
          s.customer_name AS customerName,
          s.customer_phone AS customerPhone,
          s.sale_type AS saleType,
          s.additional_discount AS additionalDiscount,
          s.additional_discount_amount AS additionalDiscountAmount,
          si.medicine_id AS medicineId,
          si.medicine_name AS medicineName,
          si.pills AS originalPills,
          COALESCE(returns.returned_pills, 0) AS returnedPills,
          (si.pills - COALESCE(returns.returned_pills, 0)) AS pills,
          si.unit_price AS unitPrice,
          si.subtotal AS originalSubtotal,
          (si.subtotal - COALESCE(returns.returned_subtotal, 0)) AS subtotal,
          si.discount_amount AS originalDiscountAmount,
          (si.discount_amount - COALESCE(returns.returned_discount, 0)) AS discountAmount,
          si.tax_amount AS originalTaxAmount,
          (si.tax_amount - COALESCE(returns.returned_tax, 0)) AS taxAmount,
          si.total AS originalTotal,
          COALESCE(returns.returned_total, 0) AS returnedTotal,
          (si.total - COALESCE(returns.returned_total, 0)) AS total
        FROM sale_items si
        INNER JOIN sales s ON s.id = si.sale_id
        LEFT JOIN (
          SELECT 
            sr.sale_id, 
            sri.medicine_id,
            SUM(sri.pills) as returned_pills,
            SUM(sri.total) as returned_total,
            SUM(sri.subtotal) as returned_subtotal,
            SUM(sri.discount_amount) as returned_discount,
            SUM(sri.tax_amount) as returned_tax
          FROM sale_return_items sri
          INNER JOIN sale_returns sr ON sr.id = sri.sale_return_id
          GROUP BY sr.sale_id, sri.medicine_id
        ) AS returns ON returns.sale_id = s.id AND returns.medicine_id = si.medicine_id
        ORDER BY s.created_at DESC, s.id DESC, si.id ASC
      `;
      const rows = await this.dbService.query(sql, []);
      return rows as any;
    }
    
    const fromDateOnly = fromDate;
    const toDateOnly = toDate;
    const sql = `
      SELECT 
        s.id AS saleId,
        s.created_at AS createdAt,
        s.customer_name AS customerName,
        s.customer_phone AS customerPhone,
        s.sale_type AS saleType,
        s.additional_discount AS additionalDiscount,
        s.additional_discount_amount AS additionalDiscountAmount,
        si.medicine_id AS medicineId,
        si.medicine_name AS medicineName,
        si.pills AS originalPills,
        COALESCE(returns.returned_pills, 0) AS returnedPills,
        (si.pills - COALESCE(returns.returned_pills, 0)) AS pills,
        si.unit_price AS unitPrice,
        si.subtotal AS originalSubtotal,
        (si.subtotal - COALESCE(returns.returned_subtotal, 0)) AS subtotal,
        si.discount_amount AS originalDiscountAmount,
        (si.discount_amount - COALESCE(returns.returned_discount, 0)) AS discountAmount,
        si.tax_amount AS originalTaxAmount,
        (si.tax_amount - COALESCE(returns.returned_tax, 0)) AS taxAmount,
        si.total AS originalTotal,
        COALESCE(returns.returned_total, 0) AS returnedTotal,
        (si.total - COALESCE(returns.returned_total, 0)) AS total
      FROM sale_items si
      INNER JOIN sales s ON s.id = si.sale_id
      LEFT JOIN (
        SELECT 
          sr.sale_id, 
          sri.medicine_id,
          SUM(sri.pills) as returned_pills,
          SUM(sri.total) as returned_total,
          SUM(sri.subtotal) as returned_subtotal,
          SUM(sri.discount_amount) as returned_discount,
          SUM(sri.tax_amount) as returned_tax
        FROM sale_return_items sri
        INNER JOIN sale_returns sr ON sr.id = sri.sale_return_id
        GROUP BY sr.sale_id, sri.medicine_id
      ) AS returns ON returns.sale_id = s.id AND returns.medicine_id = si.medicine_id
      WHERE date(s.created_at) >= date(?) AND date(s.created_at) <= date(?)
      ORDER BY s.created_at DESC, s.id DESC, si.id ASC
    `;
    const rows = await this.dbService.query(sql, [fromDateOnly, toDateOnly]);
    return rows as any;
  }

  /**
   * Aggregate sales by product within a date range.
   */
  public async getSalesSummaryByRange(fromDate: string, toDate: string): Promise<Array<{ medicineName: string; unitsSold: number; revenue: number }>> {
    const fromDateOnly = fromDate;
    const toDateOnly = toDate;
    const sql = `
      SELECT
        si.medicine_name AS medicineName,
        COALESCE(SUM(si.pills), 0) AS unitsSold,
        COALESCE(SUM(si.total), 0) AS revenue
      FROM sale_items si
      INNER JOIN sales s ON s.id = si.sale_id
      WHERE date(s.created_at) >= date(?)
        AND date(s.created_at) <= date(?)
      GROUP BY si.medicine_name
      ORDER BY unitsSold DESC
    `;
    const rows = await this.dbService.query(sql, [fromDateOnly, toDateOnly]);
    return rows.map((r: any) => ({ medicineName: r.medicineName, unitsSold: r.unitsSold, revenue: r.revenue }));
  }

  /**
   * Produce flat sale details for export.
   */
  public async getAllSalesFlatRows(): Promise<Array<{
    saleId: number;
    createdAt: string;
    customerName?: string;
    customerPhone?: string;
    saleType?: string;
    additionalDiscount?: number;
    additionalDiscountAmount?: number;
    medicineId: number;
    medicineName: string;
    pills: number;
    unitPrice: number;
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    total: number;
  }>> {
    const sql = `
      SELECT 
        s.id AS saleId,
        s.created_at AS createdAt,
        s.customer_name AS customerName,
        s.customer_phone AS customerPhone,
        s.sale_type AS saleType,
        s.additional_discount AS additionalDiscount,
        s.additional_discount_amount AS additionalDiscountAmount,
        si.medicine_id AS medicineId,
        si.medicine_name AS medicineName,
        si.pills AS originalPills,
        COALESCE(returns.returned_pills, 0) AS returnedPills,
        (si.pills - COALESCE(returns.returned_pills, 0)) AS pills,
        si.unit_price AS unitPrice,
        si.subtotal AS originalSubtotal,
        (si.subtotal - COALESCE(returns.returned_subtotal, 0)) AS subtotal,
        si.discount_amount AS originalDiscountAmount,
        (si.discount_amount - COALESCE(returns.returned_discount, 0)) AS discountAmount,
        si.tax_amount AS originalTaxAmount,
        (si.tax_amount - COALESCE(returns.returned_tax, 0)) AS taxAmount,
        si.total AS originalTotal,
        COALESCE(returns.returned_total, 0) AS returnedTotal,
        (si.total - COALESCE(returns.returned_total, 0)) AS total
      FROM sale_items si
      INNER JOIN sales s ON s.id = si.sale_id
      LEFT JOIN (
        SELECT 
          sr.sale_id, 
          sri.medicine_id,
          SUM(sri.pills) as returned_pills,
          SUM(sri.total) as returned_total,
          SUM(sri.subtotal) as returned_subtotal,
          SUM(sri.discount_amount) as returned_discount,
          SUM(sri.tax_amount) as returned_tax
        FROM sale_return_items sri
        INNER JOIN sale_returns sr ON sr.id = sri.sale_return_id
        GROUP BY sr.sale_id, sri.medicine_id
      ) AS returns ON returns.sale_id = s.id AND returns.medicine_id = si.medicine_id
      ORDER BY s.created_at DESC, s.id DESC, si.id ASC
    `;
    const rows = await this.dbService.query(sql, []);
    return rows as any;
  }

  /**
   * Initialize sales and sale_items tables for the new workflow.
   */
  public async initializeTable(): Promise<void> {
    await this.migrateLegacySales();

    await this.dbService.execute(`
      CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subtotal REAL NOT NULL DEFAULT 0,
        discount_total REAL NOT NULL DEFAULT 0,
        tax_total REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL,
        customer_name TEXT,
        customer_phone TEXT,
        sale_type TEXT DEFAULT 'Regular',
        created_at DATETIME DEFAULT (datetime('now', 'localtime'))
      )
    `);

    await this.dbService.execute(`
      CREATE TABLE IF NOT EXISTS sale_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER NOT NULL,
        medicine_id INTEGER NOT NULL,
        medicine_name TEXT NOT NULL,
        pills INTEGER NOT NULL,
        unit_price REAL NOT NULL,
        subtotal REAL NOT NULL,
        cost_price REAL NOT NULL DEFAULT 0,
        cost_subtotal REAL NOT NULL DEFAULT 0,
        discount_amount REAL NOT NULL DEFAULT 0,
        tax_amount REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL,
        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
        FOREIGN KEY (medicine_id) REFERENCES medicines(id)
      )
    `);

    // Safe migration: add new columns to sales table if they don't exist
    const salesInfoCheck = await this.dbService.query(`PRAGMA table_info(sales)`);
    if (!salesInfoCheck.some((col: any) => col.name === 'prescription_number')) {
      await this.dbService.execute(`ALTER TABLE sales ADD COLUMN prescription_number TEXT`);
    }
    if (!salesInfoCheck.some((col: any) => col.name === 'doctor_name')) {
      await this.dbService.execute(`ALTER TABLE sales ADD COLUMN doctor_name TEXT`);
    }
    if (!salesInfoCheck.some((col: any) => col.name === 'additional_discount')) {
      await this.dbService.execute(`ALTER TABLE sales ADD COLUMN additional_discount REAL NOT NULL DEFAULT 0`);
    }
    if (!salesInfoCheck.some((col: any) => col.name === 'additional_discount_amount')) {
      await this.dbService.execute(`ALTER TABLE sales ADD COLUMN additional_discount_amount REAL NOT NULL DEFAULT 0`);
    }

    const saleItemsInfoCheck = await this.dbService.query(`PRAGMA table_info(sale_items)`);
    if (!saleItemsInfoCheck.some((col: any) => col.name === 'cost_price')) {
      await this.dbService.execute(`ALTER TABLE sale_items ADD COLUMN cost_price REAL NOT NULL DEFAULT 0`);
      await this.dbService.execute(`ALTER TABLE sale_items ADD COLUMN cost_subtotal REAL NOT NULL DEFAULT 0`);
    }
    await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id)
    `);
    await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_sale_items_medicine_id ON sale_items(medicine_id)
    `);
    await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at)
    `);

    // One-time migration: update sale_items cost_price from stock_batches
    await this.dbService.execute(`
      UPDATE sale_items
      SET
        cost_price = (
          SELECT AVG(sb.cost_price_per_pill)
          FROM stock_batches sb
          WHERE sb.medicine_id = sale_items.medicine_id
        ),
        cost_subtotal = pills * (
          SELECT AVG(sb.cost_price_per_pill)
          FROM stock_batches sb
          WHERE sb.medicine_id = sale_items.medicine_id
        )
      WHERE cost_price = 0
        OR ABS(cost_price - (
          SELECT AVG(sb.cost_price_per_pill)
          FROM stock_batches sb
          WHERE sb.medicine_id = sale_items.medicine_id
        )) > 0.001
    `);
  }

  private async migrateLegacySales(): Promise<void> {
    const salesInfo = await this.dbService.query(`PRAGMA table_info(sales)`);
    const legacySales =
      salesInfo.length > 0 &&
      (salesInfo.some((column: any) => column.name === 'discount_type') ||
        salesInfo.some((column: any) => column.name === 'tax_type'));

    if (legacySales) {
      await this.dbService.execute('DROP TABLE IF EXISTS sale_items');
      await this.dbService.execute('DROP TABLE IF EXISTS sales');
      return;
    }

    // Add sale_type if it doesn't exist
    if (salesInfo.length > 0 && !salesInfo.some((col: any) => col.name === 'sale_type')) {
      await this.dbService.execute("ALTER TABLE sales ADD COLUMN sale_type TEXT DEFAULT 'Regular'");
    }

    const saleItemsInfo = await this.dbService.query(`PRAGMA table_info(sale_items)`);
    const legacyItems =
      saleItemsInfo.length > 0 &&
      !saleItemsInfo.some((column: any) => column.name === 'unit_price');

    if (legacyItems) {
      await this.dbService.execute('DROP TABLE IF EXISTS sale_items');
    }
  }

  private computeSaleItem(item: SaleItemInput): SaleItem {
    if (!item.pills || item.pills <= 0) {
      throw new Error(`Pill quantity must be greater than zero for ${item.medicineName}`);
    }
    if (!item.unitPrice || item.unitPrice <= 0) {
      throw new Error(`Unit price must be greater than zero for ${item.medicineName}`);
    }

    const subtotal = item.pills * item.unitPrice;
    const discountAmount = item.discountAmount ?? 0;
    const taxAmount = item.taxAmount ?? 0;
    const total = subtotal - discountAmount + taxAmount;

    return {
      ...item,
      subtotal,
      total,
      discountAmount,
      taxAmount,
    };
  }

  private async getSellableInventory(medicineId: number): Promise<{ id: number; available_pills: number; }[]> {
    const sql = `
      SELECT id, qty_remaining AS available_pills
      FROM stock_batches
      WHERE medicine_id = ?
        AND date(expiry_date) >= ${UNEXPIRED_THRESHOLD_EXPRESSION}
        AND qty_remaining > 0
      ORDER BY date(expiry_date) ASC, id ASC
    `;
    return this.dbService.query(sql, [medicineId]);
  }

  private async ensureInventoryAvailable(medicineId: number, requiredPills: number): Promise<void> {
    const batches = await this.getSellableInventory(medicineId);
    const totalAvailable = batches.reduce((sum, batch) => sum + batch.available_pills, 0);
    if (totalAvailable < requiredPills) {
      throw new Error('Insufficient stock (or medicine is expired).');
    }
  }

  /**
   * Deduct pills from stock_batches (FEFO order) and record the allocation
   * in sale_item_batches for exact audit trail and future restoration.
   */
  private async deductInventory(medicineId: number, pillsToDeduct: number, saleItemId: number): Promise<void> {
    let remaining = pillsToDeduct;
    const batches = await this.getSellableInventory(medicineId);

    for (const batch of batches) {
      if (remaining <= 0) break;
      const consume = Math.min(batch.available_pills, remaining);
      await this.dbService.execute(
        'UPDATE stock_batches SET qty_remaining = qty_remaining - ? WHERE id = ?',
        [consume, batch.id]
      );
      await this.dbService.execute(
        'INSERT INTO sale_item_batches (sale_item_id, stock_batch_id, qty_deducted) VALUES (?, ?, ?)',
        [saleItemId, batch.id, consume]
      );
      remaining -= consume;
    }

    if (remaining > 0) {
      throw new Error('Unable to deduct inventory due to insufficient available pills.');
    }
  }

  /**
   * Create a new sale and deduct inventory from eligible batches.
   */
  public async createSale(payload: Omit<Sale, 'id' | 'items' | 'createdAt' | 'subtotal' | 'discountTotal' | 'taxTotal' | 'additionalDiscountAmount' | 'total'> & {
    items: SaleItemInput[];
  }): Promise<number> {
    if (!payload.items || payload.items.length === 0) {
      throw new Error('At least one medicine must be included in a sale.');
    }

    const computedItems = payload.items.map((item) => this.computeSaleItem(item));

    const subtotal = computedItems.reduce((sum, item) => sum + item.subtotal, 0);
    const discountTotal = computedItems.reduce((sum, item) => sum + (item.discountAmount ?? 0), 0);
    const taxTotal = computedItems.reduce((sum, item) => sum + (item.taxAmount ?? 0), 0);
    const baseTotal = subtotal - discountTotal + taxTotal;
    
    // Apply additional discount for Family/Relatives, Charity, or Employee
    const additionalDiscount = payload.additionalDiscount || 0;
    const additionalDiscountAmount = (baseTotal * additionalDiscount) / 100;
    const total = baseTotal - additionalDiscountAmount;

    for (const item of computedItems) {
      await this.ensureInventoryAvailable(item.medicineId, item.pills);
    }

    await this.dbService.execute('BEGIN TRANSACTION');
    try {
      const insertSaleSql = `
        INSERT INTO sales (subtotal, discount_total, tax_total, additional_discount, additional_discount_amount, total, customer_name, customer_phone, sale_type, prescription_number, doctor_name, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
      `;
      const saleResult = await this.dbService.execute(insertSaleSql, [
        subtotal,
        discountTotal,
        taxTotal,
        additionalDiscount,
        additionalDiscountAmount,
        total,
        payload.customerName || null,
        payload.customerPhone || null,
        payload.saleType || 'Regular',
        (payload as any).prescriptionNumber || null,
        (payload as any).doctorName || null,
      ]);
      const saleId = (saleResult as any).lastID;

      // Batch fetch all cost prices at once from stock_batches (live inventory)
      const medicineIds = computedItems.map(item => item.medicineId);
      const uniqueMedicineIds = [...new Set(medicineIds)];
      const placeholders = uniqueMedicineIds.map(() => '?').join(',');

      const costResults = await this.dbService.query(`
        SELECT
          medicine_id,
          AVG(cost_price_per_pill) as avg_cost
        FROM stock_batches
        WHERE medicine_id IN (${placeholders})
          AND qty_remaining > 0
          AND date(expiry_date) >= ${UNEXPIRED_THRESHOLD_EXPRESSION}
        GROUP BY medicine_id
      `, uniqueMedicineIds);

      const costMap = new Map(costResults.map((r: any) => [r.medicine_id, r.avg_cost || 0]));

      for (const item of computedItems) {
        const costPrice = costMap.get(item.medicineId) || 0;
        const costSubtotal = costPrice * item.pills;

        const insertItemSql = `
          INSERT INTO sale_items (
            sale_id, medicine_id, medicine_name, pills, unit_price, subtotal, 
            cost_price, cost_subtotal, discount_amount, tax_amount, total
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const saleItemResult = await this.dbService.execute(insertItemSql, [
          saleId,
          item.medicineId,
          item.medicineName,
          item.pills,
          item.unitPrice,
          item.subtotal,
          costPrice,
          costSubtotal,
          item.discountAmount ?? 0,
          item.taxAmount ?? 0,
          item.total,
        ]);
        const saleItemId = (saleItemResult as any).lastID;

        await this.deductInventory(item.medicineId, item.pills, saleItemId);
      }

      await this.dbService.execute('COMMIT');
      return saleId;
    } catch (error) {
      await this.dbService.execute('ROLLBACK');
      throw error;
    }
  }

  /**
   * Get all sales records with line items.
   * Optimized: Uses single JOIN query instead of N+1 queries
   */
  public async getAllSales(): Promise<Sale[]> {
    // Single query with JOIN - much faster than N+1 queries
    const rows = await this.dbService.query(`
      SELECT 
        s.id,
        s.subtotal,
        s.discount_total,
        s.tax_total,
        s.additional_discount,
        s.additional_discount_amount,
        s.total,
        s.customer_name,
        s.customer_phone,
        s.sale_type,
        s.created_at,
        si.id as item_id,
        si.medicine_id,
        si.medicine_name,
        si.pills,
        si.unit_price,
        si.subtotal as item_subtotal,
        si.discount_amount,
        si.tax_amount,
        si.total as item_total
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      ORDER BY s.created_at DESC, si.id ASC
    `);

    // Group items by sale
    const salesMap = new Map<number, Sale>();
    
    for (const row of rows) {
      if (!salesMap.has(row.id)) {
        salesMap.set(row.id, {
          id: row.id,
          subtotal: row.subtotal,
          discountTotal: row.discount_total,
          taxTotal: row.tax_total,
          additionalDiscount: row.additional_discount,
          additionalDiscountAmount: row.additional_discount_amount,
          total: row.total,
          customerName: row.customer_name || undefined,
          customerPhone: row.customer_phone || undefined,
          saleType: row.sale_type || 'Regular',
          createdAt: row.created_at,
          items: [],
        });
      }
      
      // Add item if it exists (LEFT JOIN may have null items)
      if (row.item_id) {
        salesMap.get(row.id)!.items.push({
          medicineId: row.medicine_id,
          medicineName: row.medicine_name,
          pills: row.pills,
          unitPrice: row.unit_price,
          subtotal: row.item_subtotal,
          discountAmount: row.discount_amount,
          taxAmount: row.tax_amount,
          total: row.item_total,
        });
      }
    }

    return Array.from(salesMap.values());
  }

  /**
   * Delete a sale and its items, restoring inventory via exact sale_item_batches lookup.
   */
  public async deleteSale(saleId: number): Promise<void> {
    const sale = await this.dbService.queryOne('SELECT id FROM sales WHERE id = ?', [saleId]);
    if (!sale) {
      throw new Error(`Sale with id ${saleId} not found`);
    }

    const saleItems = await this.dbService.query('SELECT id, medicine_id, pills FROM sale_items WHERE sale_id = ?', [saleId]);

    await this.dbService.execute('BEGIN TRANSACTION');
    try {
      for (const item of saleItems) {
        await this.restoreInventory(item.id, item.medicine_id, item.pills);
      }

      // sale_items DELETE cascades sale_item_batches via FK ON DELETE CASCADE
      await this.dbService.execute('DELETE FROM sale_items WHERE sale_id = ?', [saleId]);
      await this.dbService.execute('DELETE FROM sales WHERE id = ?', [saleId]);
      await this.dbService.execute('COMMIT');
    } catch (error) {
      await this.dbService.execute('ROLLBACK');
      throw error;
    }
  }

  /**
   * Get sale by ID.
   */
  public async getSaleById(id: number): Promise<Sale | null> {
    const sale = await this.dbService.queryOne('SELECT * FROM sales WHERE id = ?', [id]);
    if (!sale) return null;

    const items = await this.dbService.query('SELECT * FROM sale_items WHERE sale_id = ?', [id]);
    return {
      id: sale.id,
      subtotal: sale.subtotal,
      discountTotal: sale.discount_total,
      taxTotal: sale.tax_total,
      additionalDiscount: sale.additional_discount,
      additionalDiscountAmount: sale.additional_discount_amount,
      total: sale.total,
      customerName: sale.customer_name || undefined,
      customerPhone: sale.customer_phone || undefined,
      saleType: sale.sale_type || 'Regular',
      createdAt: sale.created_at,
      items: items.map((item: any) => ({
        medicineId: item.medicine_id,
        medicineName: item.medicine_name,
        pills: item.pills,
        unitPrice: item.unit_price,
        subtotal: item.subtotal,
        discountAmount: item.discount_amount,
        taxAmount: item.tax_amount,
        total: item.total,
      })),
    };
  }

  /**
   * Restore inventory by reversing the exact batch allocations recorded in sale_item_batches.
   * Falls back to FEFO on stock_batches if no audit record exists (pre-migration data).
   */
  private async restoreInventory(saleItemId: number, medicineId: number, pillsToRestore: number): Promise<void> {
    // Prefer exact restoration using the audit trail
    const batchRows = await this.dbService.query(
      'SELECT stock_batch_id, qty_deducted FROM sale_item_batches WHERE sale_item_id = ?',
      [saleItemId]
    );

    if (batchRows.length > 0) {
      for (const row of batchRows) {
        await this.dbService.execute(
          'UPDATE stock_batches SET qty_remaining = qty_remaining + ? WHERE id = ?',
          [row.qty_deducted, row.stock_batch_id]
        );
      }
      return;
    }

    // Fallback: no audit record (pre-migration sale) — restore to FEFO batches in stock_batches
    console.warn(`[restoreInventory] No sale_item_batches found for sale_item ${saleItemId}. Using FEFO fallback for medicine ${medicineId}.`);
    const batches = await this.dbService.query(
      `SELECT id, qty_received, qty_remaining FROM stock_batches
       WHERE medicine_id = ? ORDER BY date(expiry_date) ASC, id ASC`,
      [medicineId]
    );

    let remaining = pillsToRestore;
    for (const batch of batches) {
      if (remaining <= 0) break;
      const maxCanRestore = batch.qty_received - batch.qty_remaining;
      if (maxCanRestore <= 0) continue;
      const restore = Math.min(maxCanRestore, remaining);
      await this.dbService.execute(
        'UPDATE stock_batches SET qty_remaining = qty_remaining + ? WHERE id = ?',
        [restore, batch.id]
      );
      remaining -= restore;
    }

    if (remaining > 0) {
      console.warn(`[restoreInventory] Could not restore ${remaining} pills for medicine ${medicineId} — batches may have been deleted.`);
    }
  }

  /**
   * Update an existing sale and adjust inventory accordingly.
   * Restores inventory for removed items and deducts for added items.
   */
  public async updateSale(
    saleId: number,
    payload: Omit<Sale, 'id' | 'items' | 'createdAt' | 'subtotal' | 'discountTotal' | 'taxTotal' | 'total'> & {
      items: SaleItemInput[];
    }
  ): Promise<void> {
    if (!payload.items || payload.items.length === 0) {
      throw new Error('At least one medicine must be included in a sale.');
    }

    // Get the original sale
    const originalSale = await this.getSaleById(saleId);
    if (!originalSale) {
      throw new Error(`Sale with id ${saleId} not found`);
    }

    // Get all previous returns for this sale to ensure update doesn't conflict
    const previousReturns = await this.dbService.query(
      `SELECT sri.medicine_id, sri.medicine_name, SUM(sri.pills) as total_returned
       FROM sale_return_items sri
       INNER JOIN sale_returns sr ON sr.id = sri.sale_return_id
       WHERE sr.sale_id = ?
       GROUP BY sri.medicine_id`,
      [saleId]
    );

    const returnedQuantities = new Map<number, { name: string; pills: number }>();
    previousReturns.forEach((ret: any) => {
      returnedQuantities.set(ret.medicine_id, { name: ret.medicine_name, pills: ret.total_returned || 0 });
    });

    const computedItems = payload.items.map((item) => this.computeSaleItem(item));

    // Validate new quantities against returned quantities
    for (const [medicineId, returned] of returnedQuantities.entries()) {
      const newItem = computedItems.find(item => item.medicineId === medicineId);
      const newPills = newItem ? newItem.pills : 0;
      
      if (newPills < returned.pills) {
        throw new Error(
          `Cannot reduce ${returned.name} to ${newPills} pills because ${returned.pills} pills have already been returned. ` +
          `Please adjust the return records first.`
        );
      }
    }

    // Calculate differences
    const originalItemsMap = new Map<number, number>();
    originalSale.items.forEach(item => {
      originalItemsMap.set(item.medicineId, item.pills);
    });

    const newItemsMap = new Map<number, number>();
    computedItems.forEach(item => {
      newItemsMap.set(item.medicineId, item.pills);
    });

    // Find items to restore (removed or reduced)
    const itemsToRestore: Array<{ medicineId: number; pills: number }> = [];
    originalItemsMap.forEach((originalPills, medicineId) => {
      const newPills = newItemsMap.get(medicineId) || 0;
      if (newPills < originalPills) {
        itemsToRestore.push({ medicineId, pills: originalPills - newPills });
      }
    });

    // Find items to deduct (added or increased)
    const itemsToDeduct: Array<{ medicineId: number; pills: number }> = [];
    newItemsMap.forEach((newPills, medicineId) => {
      const originalPills = originalItemsMap.get(medicineId) || 0;
      if (newPills > originalPills) {
        itemsToDeduct.push({ medicineId, pills: newPills - originalPills });
      }
    });

    // Check inventory availability for items to deduct
    for (const item of itemsToDeduct) {
      await this.ensureInventoryAvailable(item.medicineId, item.pills);
    }

    const subtotal = computedItems.reduce((sum, item) => sum + item.subtotal, 0);
    const discountTotal = computedItems.reduce((sum, item) => sum + (item.discountAmount ?? 0), 0);
    const taxTotal = computedItems.reduce((sum, item) => sum + (item.taxAmount ?? 0), 0);
    
    // Calculate additional discount
    const baseTotal = subtotal - discountTotal + taxTotal;
    const additionalDiscount = payload.additionalDiscount || 0;
    const additionalDiscountAmount = (baseTotal * additionalDiscount) / 100;
    const total = baseTotal - additionalDiscountAmount;

    await this.dbService.execute('BEGIN TRANSACTION');
    try {
      // Update sale record
      const updateSaleSql = `
        UPDATE sales 
        SET subtotal = ?, discount_total = ?, tax_total = ?, additional_discount = ?, additional_discount_amount = ?, total = ?, 
            customer_name = ?, customer_phone = ?, sale_type = ?
        WHERE id = ?
      `;
      await this.dbService.execute(updateSaleSql, [
        subtotal,
        discountTotal,
        taxTotal,
        additionalDiscount,
        additionalDiscountAmount,
        total,
        payload.customerName || null,
        payload.customerPhone || null,
        payload.saleType || 'Regular',
        saleId,
      ]);

      // Delete old sale items
      await this.dbService.execute('DELETE FROM sale_items WHERE sale_id = ?', [saleId]);

      // Insert new sale items
      for (const item of computedItems) {
        const insertItemSql = `
          INSERT INTO sale_items (
            sale_id,
            medicine_id,
            medicine_name,
            pills,
            unit_price,
            subtotal,
            discount_amount,
            tax_amount,
            total
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await this.dbService.execute(insertItemSql, [
          saleId,
          item.medicineId,
          item.medicineName,
          item.pills,
          item.unitPrice,
          item.subtotal,
          item.discountAmount ?? 0,
          item.taxAmount ?? 0,
          item.total,
        ]);
      }

      // Restore inventory for removed/reduced items
      for (const item of itemsToRestore) {
        await this.restoreInventory(item.medicineId, item.pills);
      }

      // Deduct inventory for added/increased items
      for (const item of itemsToDeduct) {
        await this.deductInventory(item.medicineId, item.pills);
      }

      await this.dbService.execute('COMMIT');
    } catch (error) {
      await this.dbService.execute('ROLLBACK');
      throw error;
    }
  }

  private async getPurchasingTotalByRange(from: string, to: string): Promise<number> {
    const sql = `
      SELECT COALESCE(SUM(grand_total), 0) AS purchasing_total
      FROM purchases
      WHERE datetime(created_at) >= datetime(?)
        AND datetime(created_at) <= datetime(?)
    `;
    const result = await this.dbService.queryOne(sql, [from, to]);
    return result?.purchasing_total || 0;
  }

  /**
   * Get monthly financial summary using purchase data.
   */
  public async getMonthlyFinancialSummary(): Promise<{
    purchasingTotal: number;
    sellingTotal: number;
    paymentTotal: number;
    remainingPayment: number;
    profit: number;
  }> {
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');

    const salesSql = `
      SELECT 
        COALESCE(SUM(total), 0) as selling_total,
        COALESCE(SUM(total), 0) as payment_total
      FROM sales 
      WHERE strftime('%Y', created_at) = ? 
        AND strftime('%m', created_at) = ?
    `;
    const salesResult = await this.dbService.queryOne(salesSql, [year, month]);
    const sellingTotal = salesResult?.selling_total || 0;
    const paymentTotal = salesResult?.payment_total || 0;

    const purchasingSql = `
      SELECT COALESCE(SUM(grand_total), 0) as purchasing_total
      FROM purchases
      WHERE strftime('%Y', created_at) = ?
        AND strftime('%m', created_at) = ?
    `;
    const purchasingResult = await this.dbService.queryOne(purchasingSql, [year, month]);
    const purchasingTotal = purchasingResult?.purchasing_total || 0;

    // Get remaining payments for current month
    const remainingPaymentSql = `
      SELECT COALESCE(SUM(remaining_balance), 0) as total_remaining
      FROM purchases
      WHERE strftime('%Y', created_at) = ?
        AND strftime('%m', created_at) = ?
        AND remaining_balance > 0
    `;
    const remainingPaymentResult = await this.dbService.queryOne(remainingPaymentSql, [year, month]);
    const remainingPayment = remainingPaymentResult?.total_remaining || 0;

    const profit = sellingTotal - purchasingTotal;

    return {
      purchasingTotal,
      sellingTotal,
      paymentTotal,
      remainingPayment,
      profit,
    };
  }

  /**
   * Financial summary for an arbitrary date range.
   */
  public async getFinancialSummaryByDateRange(fromDate: string, toDate: string): Promise<{
    purchasingTotal: number;
    purchaseDiscountTotal: number;
    purchaseTaxTotal: number;
    sellingTotal: number;
    saleDiscountTotal: number;
    saleTaxTotal: number;
    saleReturnsTotal: number;
    familyTotal: number;
    charityTotal: number;
    employeeTotal: number;
    netRevenue: number;
    paymentTotal: number;
    remainingPayment: number;
    profit: number;
    trend: Array<{ date: string; sales: number; purchases: number; profit: number }>;
  }> {
    const fromDateTime = `${fromDate} 00:00:00`;
    const toDateTime = `${toDate} 23:59:59`;

    const salesSql = `
      SELECT 
        COALESCE(SUM(total), 0) as selling_total,
        COALESCE(SUM(discount_total), 0) as sale_discount_total,
        COALESCE(SUM(tax_total), 0) as sale_tax_total,
        COALESCE(SUM(CASE WHEN sale_type = 'Family/Relatives' THEN additional_discount_amount ELSE 0 END), 0) as family_total,
        COALESCE(SUM(CASE WHEN sale_type = 'Charity' THEN additional_discount_amount ELSE 0 END), 0) as charity_total,
        COALESCE(SUM(CASE WHEN sale_type = 'Employee' THEN additional_discount_amount ELSE 0 END), 0) as employee_total
      FROM sales 
      WHERE datetime(created_at) >= datetime(?) 
        AND datetime(created_at) <= datetime(?)
    `;
    const salesResult = await this.dbService.queryOne(salesSql, [fromDateTime, toDateTime]);
    const sellingTotal = salesResult?.selling_total || 0;
    const saleDiscountTotal = salesResult?.sale_discount_total || 0;
    const saleTaxTotal = salesResult?.sale_tax_total || 0;
    const familyTotal = salesResult?.family_total || 0;
    const charityTotal = salesResult?.charity_total || 0;
    const employeeTotal = salesResult?.employee_total || 0;

    // Get sale returns total and their cost for this date range
    const saleReturnsTotal = await this.saleReturnService.getSaleReturnsTotalByDateRange(fromDate, toDate);
    const saleReturnsCost = await (this.saleReturnService as any).getSaleReturnsCostByDateRange(fromDate, toDate);
    
    // Get total COGS (Cost of Goods Sold) using sale_item_batches for exact cost
    const cogsSql = `
      SELECT COALESCE(SUM(
        CASE
          WHEN si.cost_subtotal > 0 THEN si.cost_subtotal
          ELSE si.pills * COALESCE(
            (SELECT sb.cost_price_per_pill
             FROM stock_batches sb
             WHERE sb.medicine_id = si.medicine_id
               AND sb.qty_remaining > 0
             ORDER BY date(sb.expiry_date) ASC, sb.id ASC
             LIMIT 1),
            0
          )
        END
      ), 0) as total_cogs
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE datetime(s.created_at) >= datetime(?) AND datetime(s.created_at) <= datetime(?)
    `;
    const cogsResult = await this.dbService.queryOne(cogsSql, [fromDateTime, toDateTime]);
    const grossCogs = cogsResult?.total_cogs || 0;
    
    // Calculate net revenue (sales - returns)
    const netRevenue = sellingTotal - saleReturnsTotal;
    // Calculate net COGS (COGS - cost of returns)
    const netCogs = grossCogs - saleReturnsCost;

    // Get purchase totals with discount and tax breakdown
    const purchasingSql = `
      SELECT 
        COALESCE(SUM(grand_total), 0) as purchasing_total,
        COALESCE(SUM(discount_total), 0) as purchase_discount_total,
        COALESCE(SUM(tax_total), 0) as purchase_tax_total
      FROM purchases 
      WHERE datetime(created_at) >= datetime(?) 
        AND datetime(created_at) <= datetime(?)
    `;
    const purchasingResult = await this.dbService.queryOne(purchasingSql, [fromDateTime, toDateTime]);
    const purchasingTotal = purchasingResult?.purchasing_total || 0;
    const purchaseDiscountTotal = purchasingResult?.purchase_discount_total || 0;
    const purchaseTaxTotal = purchasingResult?.purchase_tax_total || 0;

    // Get remaining payments (debt) for purchases in this date range
    const remainingPaymentSql = `
      SELECT COALESCE(SUM(remaining_balance), 0) as total_remaining
      FROM purchases 
      WHERE datetime(created_at) >= datetime(?) 
        AND datetime(created_at) <= datetime(?)
        AND remaining_balance > 0
    `;
    const remainingPaymentResult = await this.dbService.queryOne(remainingPaymentSql, [fromDateTime, toDateTime]);
    const remainingPayment = remainingPaymentResult?.total_remaining || 0;

    // Calculate profit as margin: Net Revenue - Net COGS
    const profit = netRevenue - netCogs;

    // Trend calculation
    const salesTrendSql = `
      SELECT 
        date(s.created_at) as date, 
        SUM(si.total) as amount,
        SUM(CASE WHEN si.cost_subtotal > 0 THEN si.cost_subtotal ELSE si.pills * COALESCE((SELECT sb.cost_price_per_pill FROM stock_batches sb WHERE sb.medicine_id = si.medicine_id AND sb.qty_remaining > 0 ORDER BY date(sb.expiry_date) ASC, sb.id ASC LIMIT 1), 0) END) as cost
      FROM sales s
      JOIN sale_items si ON s.id = si.sale_id
      WHERE datetime(s.created_at) >= datetime(?) AND datetime(s.created_at) <= datetime(?)
      GROUP BY date(s.created_at)
    `;
    const purchasesTrendSql = `
      SELECT date(created_at) as date, SUM(grand_total) as amount
      FROM purchases
      WHERE datetime(created_at) >= datetime(?) AND datetime(created_at) <= datetime(?)
      GROUP BY date(created_at)
    `;
    // Step 2: Get return data and subtract costs from trend cost
    const returnsTrendSql = `
      SELECT 
        date(sr.created_at) as date, 
        SUM(sri.total) as return_amount,
        SUM(CASE WHEN sri.cost_subtotal > 0 THEN sri.cost_subtotal ELSE 0 END) as return_cost
      FROM sale_returns sr
      JOIN sale_return_items sri ON sr.id = sri.sale_return_id
      WHERE datetime(sr.created_at) >= datetime(?) AND datetime(sr.created_at) <= datetime(?)
      GROUP BY date(sr.created_at)
    `;

    const salesTrend = await this.dbService.query(salesTrendSql, [fromDateTime, toDateTime]);
    const purchasesTrend = await this.dbService.query(purchasesTrendSql, [fromDateTime, toDateTime]);
    const returnsTrend = await this.dbService.query(returnsTrendSql, [fromDateTime, toDateTime]);

    const trendMap = new Map<string, { sales: number; purchases: number; cost: number }>();

    salesTrend.forEach((r: any) => {
      if (!trendMap.has(r.date)) trendMap.set(r.date, { sales: 0, purchases: 0, cost: 0 });
      const current = trendMap.get(r.date)!;
      current.sales = r.amount;
      current.cost = r.cost;
    });

    returnsTrend.forEach((r: any) => {
      if (!trendMap.has(r.date)) trendMap.set(r.date, { sales: 0, purchases: 0, cost: 0 });
      const current = trendMap.get(r.date)!;
      current.sales -= r.return_amount; // Net sales for the day
      current.cost -= r.return_cost;   // Net cost for the day
    });

    purchasesTrend.forEach((r: any) => {
      if (!trendMap.has(r.date)) trendMap.set(r.date, { sales: 0, purchases: 0, cost: 0 });
      trendMap.get(r.date)!.purchases = r.amount;
    });

    const trend = Array.from(trendMap.entries())
      .map(([date, data]) => ({
        date,
        sales: data.sales,
        purchases: data.purchases,
        profit: data.sales - data.cost
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      purchasingTotal,
      purchaseDiscountTotal,
      purchaseTaxTotal,
      sellingTotal,
      saleDiscountTotal,
      saleTaxTotal,
      saleReturnsTotal,
      familyTotal,
      charityTotal,
      employeeTotal,
      netRevenue,
      paymentTotal: sellingTotal, // Restore paymentTotal (assumed to be sellingTotal based on original SQL)
      remainingPayment,
      profit,
      trend,
    };
  }
}

export default SalesService;
