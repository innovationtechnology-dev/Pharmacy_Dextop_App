import { getDatabaseService } from './database.service';

export interface SaleReturnItemInput {
  medicineId: number;
  medicineName: string;
  pills: number;
  unitPrice: number;
  discountAmount?: number;
  taxAmount?: number;
  reason?: string;
}

export interface SaleReturnItem extends SaleReturnItemInput {
  subtotal: number;
  total: number;
}

export interface SaleReturn {
  id?: number;
  saleId: number;
  items: SaleReturnItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  customerName?: string;
  customerPhone?: string;
  reason?: string;
  notes?: string;
  createdAt?: string;
}

export class SaleReturnService {
  private dbService = getDatabaseService();

  /**
   * Initialize sale_returns and sale_return_items tables
   */
  public async initializeTable(): Promise<void> {
    await this.dbService.execute(`
      CREATE TABLE IF NOT EXISTS sale_returns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER NOT NULL,
        subtotal REAL NOT NULL DEFAULT 0,
        discount_total REAL NOT NULL DEFAULT 0,
        tax_total REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL,
        customer_name TEXT,
        customer_phone TEXT,
        reason TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (sale_id) REFERENCES sales(id)
      )
    `);

    await this.dbService.execute(`
      CREATE TABLE IF NOT EXISTS sale_return_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_return_id INTEGER NOT NULL,
        medicine_id INTEGER NOT NULL,
        medicine_name TEXT NOT NULL,
        pills INTEGER NOT NULL,
        unit_price REAL NOT NULL,
        subtotal REAL NOT NULL,
        discount_amount REAL NOT NULL DEFAULT 0,
        tax_amount REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL,
        cost_price REAL NOT NULL DEFAULT 0,
        cost_subtotal REAL NOT NULL DEFAULT 0,
        reason TEXT,
        FOREIGN KEY (sale_return_id) REFERENCES sale_returns(id) ON DELETE CASCADE,
        FOREIGN KEY (medicine_id) REFERENCES medicines(id)
      )
    `);

    // Migration: add cost_price and cost_subtotal to sale_return_items if they don't exist
    const columnInfo = await this.dbService.query(`PRAGMA table_info(sale_return_items)`);
    if (!columnInfo.some((col: any) => col.name === 'cost_price')) {
      await this.dbService.execute(`ALTER TABLE sale_return_items ADD COLUMN cost_price REAL NOT NULL DEFAULT 0`);
    }
    if (!columnInfo.some((col: any) => col.name === 'cost_subtotal')) {
      await this.dbService.execute(`ALTER TABLE sale_return_items ADD COLUMN cost_subtotal REAL NOT NULL DEFAULT 0`);
    }

    await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_sale_return_items_sale_return_id ON sale_return_items(sale_return_id)
    `);
    await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_sale_return_items_medicine_id ON sale_return_items(medicine_id)
    `);
    await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_sale_returns_sale_id ON sale_returns(sale_id)
    `);
    await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_sale_returns_created_at ON sale_returns(created_at)
    `);
  }

  /**
   * Compute sale return item totals
   */
  private computeSaleReturnItem(item: SaleReturnItemInput): SaleReturnItem {
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

  /**
   * Restore inventory for a return item.
   * Uses sale_item_batches to find the exact batches the original sale consumed,
   * restores pills to those batches, and records the restoration in return_item_batches.
   * Falls back to FEFO on stock_batches for pre-migration data.
   */
  private async restoreInventory(
    saleReturnItemId: number,
    saleId: number,
    medicineId: number,
    pillsToRestore: number
  ): Promise<void> {
    // Find the original sale_items for this medicine in this sale
    const saleItemRows = await this.dbService.query(
      `SELECT si.id
       FROM sale_items si
       WHERE si.sale_id = ? AND si.medicine_id = ?
       ORDER BY si.id ASC`,
      [saleId, medicineId]
    );

    let restored = 0;

    for (const saleItemRow of saleItemRows) {
      if (restored >= pillsToRestore) break;

      // Get the batch allocations for this sale_item
      const batchRows = await this.dbService.query(
        `SELECT sib.stock_batch_id, sib.qty_deducted
         FROM sale_item_batches sib
         JOIN stock_batches sb ON sb.id = sib.stock_batch_id
         WHERE sib.sale_item_id = ?
         ORDER BY sb.expiry_date ASC, sb.id ASC`,
        [saleItemRow.id]
      );

      for (const row of batchRows) {
        if (restored >= pillsToRestore) break;
        const restoreQty = Math.min(row.qty_deducted, pillsToRestore - restored);
        await this.dbService.execute(
          'UPDATE stock_batches SET qty_remaining = qty_remaining + ? WHERE id = ?',
          [restoreQty, row.stock_batch_id]
        );
        await this.dbService.execute(
          'INSERT INTO return_item_batches (sale_return_item_id, stock_batch_id, qty_restored) VALUES (?, ?, ?)',
          [saleReturnItemId, row.stock_batch_id, restoreQty]
        );
        restored += restoreQty;
      }
    }

    if (restored >= pillsToRestore) return;

    // Fallback: pre-migration data — prefer unexpired batches so returned pills are sellable
    console.warn(`[sale-return restoreInventory] No sale_item_batches found for sale ${saleId} medicine ${medicineId}. Using FEFO fallback.`);
    const remaining = pillsToRestore - restored;

    // Try unexpired batches first; fall back to all batches if none found
    let batches = await this.dbService.query(
      `SELECT id, qty_received, qty_remaining FROM stock_batches
       WHERE medicine_id = ? AND date(expiry_date) >= date('now')
       ORDER BY date(expiry_date) ASC, id ASC`,
      [medicineId]
    );
    if (batches.length === 0) {
      batches = await this.dbService.query(
        `SELECT id, qty_received, qty_remaining FROM stock_batches
         WHERE medicine_id = ? ORDER BY date(expiry_date) DESC, id ASC`,
        [medicineId]
      );
    }

    if (batches.length === 0) {
      console.warn(`[sale-return restoreInventory] No stock_batches found for medicine ${medicineId}. Return accepted but inventory not restored.`);
      return;
    }

    const firstBatch = batches[0];
    await this.dbService.execute(
      'UPDATE stock_batches SET qty_remaining = qty_remaining + ? WHERE id = ?',
      [remaining, firstBatch.id]
    );
    await this.dbService.execute(
      'INSERT INTO return_item_batches (sale_return_item_id, stock_batch_id, qty_restored) VALUES (?, ?, ?)',
      [saleReturnItemId, firstBatch.id, remaining]
    );
  }

  /**
   * Validate that the sale exists and get its details
   */
  private async validateSale(saleId: number): Promise<{
    customerName?: string;
    customerPhone?: string;
  }> {
    const sale = await this.dbService.queryOne('SELECT customer_name, customer_phone FROM sales WHERE id = ?', [saleId]);
    if (!sale) {
      throw new Error(`Sale with id ${saleId} not found`);
    }
    return {
      customerName: sale.customer_name || undefined,
      customerPhone: sale.customer_phone || undefined,
    };
  }

  /**
   * Validate that return items don't exceed what was sold in the original sale
   */
  private async validateReturnItems(saleId: number, returnItems: SaleReturnItemInput[]): Promise<void> {
    // Get all items from the original sale
    const saleItems = await this.dbService.query(
      'SELECT medicine_id, medicine_name, pills FROM sale_items WHERE sale_id = ?',
      [saleId]
    );

    // Get all previous returns for this sale
    const previousReturns = await this.dbService.query(
      `SELECT sri.medicine_id, SUM(sri.pills) as total_returned
       FROM sale_return_items sri
       INNER JOIN sale_returns sr ON sr.id = sri.sale_return_id
       WHERE sr.sale_id = ?
       GROUP BY sri.medicine_id`,
      [saleId]
    );

    const returnedByMedicine = new Map<number, number>();
    previousReturns.forEach((ret: any) => {
      returnedByMedicine.set(ret.medicine_id, ret.total_returned || 0);
    });

    const soldByMedicine = new Map<number, { soldPills: number; medicineName: string }>();
    saleItems.forEach((si: any) => {
      const existing = soldByMedicine.get(si.medicine_id);
      if (existing) {
        existing.soldPills += si.pills || 0;
      } else {
        soldByMedicine.set(si.medicine_id, {
          soldPills: si.pills || 0,
          medicineName: si.medicine_name || `ID: ${si.medicine_id}`,
        });
      }
    });

    const requestedByMedicine = new Map<number, { requestedPills: number; medicineName: string }>();
    returnItems.forEach((item) => {
      const existing = requestedByMedicine.get(item.medicineId);
      if (existing) {
        existing.requestedPills += item.pills || 0;
      } else {
        requestedByMedicine.set(item.medicineId, {
          requestedPills: item.pills || 0,
          medicineName: item.medicineName || `ID: ${item.medicineId}`,
        });
      }
    });

    // Check each requested medicine as an aggregated quantity.
    for (const [medicineId, requested] of requestedByMedicine.entries()) {
      const soldInfo = soldByMedicine.get(medicineId);
      if (!soldInfo) {
        throw new Error(`Medicine ${requested.medicineName} (ID: ${medicineId}) was not part of sale ${saleId}`);
      }

      const soldQuantity = soldInfo.soldPills;
      const previouslyReturned = returnedByMedicine.get(medicineId) || 0;
      const availableToReturn = soldQuantity - previouslyReturned;

      if (requested.requestedPills > availableToReturn) {
        throw new Error(
          `Cannot return ${requested.requestedPills} pills of ${requested.medicineName}. ` +
          `Only ${availableToReturn} pills available to return (${soldQuantity} sold, ${previouslyReturned} already returned)`
        );
      }
    }
  }

  /**
   * Create a new sale return and restore inventory
   */
  public async createSaleReturn(payload: Omit<SaleReturn, 'id' | 'items' | 'createdAt' | 'subtotal' | 'discountTotal' | 'taxTotal' | 'total'> & {
    items: SaleReturnItemInput[];
  }): Promise<number> {
    if (!payload.items || payload.items.length === 0) {
      throw new Error('At least one item must be included in a sale return.');
    }

    // Validate sale exists
    const saleInfo = await this.validateSale(payload.saleId);

    // Validate return items
    await this.validateReturnItems(payload.saleId, payload.items);

    const computedItems = payload.items.map((item) => this.computeSaleReturnItem(item));

    const subtotal = computedItems.reduce((sum, item) => sum + item.subtotal, 0);
    const discountTotal = computedItems.reduce((sum, item) => sum + (item.discountAmount ?? 0), 0);
    const taxTotal = computedItems.reduce((sum, item) => sum + (item.taxAmount ?? 0), 0);
    const total = subtotal - discountTotal + taxTotal;

    await this.dbService.execute('BEGIN TRANSACTION');
    try {
      const insertSaleReturnSql = `
        INSERT INTO sale_returns (
          sale_id,
          subtotal,
          discount_total,
          tax_total,
          total,
          customer_name,
          customer_phone,
          reason,
          notes,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
      `;
      const saleReturnResult = await this.dbService.execute(insertSaleReturnSql, [
        payload.saleId,
        subtotal,
        discountTotal,
        taxTotal,
        total,
        payload.customerName || saleInfo.customerName || null,
        payload.customerPhone || saleInfo.customerPhone || null,
        payload.reason || null,
        payload.notes || null,
      ]);
      const saleReturnId = (saleReturnResult as any).lastID;

      for (const item of computedItems) {
        // Get cost price for the return item (try to get it from sale_items first, else average)
        const saleItemRecord = await this.dbService.queryOne(
          'SELECT cost_price FROM sale_items WHERE sale_id = ? AND medicine_id = ? LIMIT 1',
          [payload.saleId, item.medicineId]
        );
        const costPrice = saleItemRecord?.cost_price || 0;
        const costSubtotal = costPrice * item.pills;

        const insertItemSql = `
          INSERT INTO sale_return_items (
            sale_return_id,
            medicine_id,
            medicine_name,
            pills,
            unit_price,
            subtotal,
            discount_amount,
            tax_amount,
            total,
            cost_price,
            cost_subtotal,
            reason
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const saleReturnItemResult = await this.dbService.execute(insertItemSql, [
          saleReturnId,
          item.medicineId,
          item.medicineName,
          item.pills,
          item.unitPrice,
          item.subtotal,
          item.discountAmount ?? 0,
          item.taxAmount ?? 0,
          item.total,
          costPrice,
          costSubtotal,
          item.reason || null,
        ]);
        const saleReturnItemId = (saleReturnItemResult as any).lastID;

        // Restore inventory using exact audit trail from sale_item_batches
        await this.restoreInventory(saleReturnItemId, payload.saleId, item.medicineId, item.pills);
      }

      await this.dbService.execute('COMMIT');
      return saleReturnId;
    } catch (error) {
      await this.dbService.execute('ROLLBACK');
      throw error;
    }
  }

  /**
   * Get all sale returns with their items
   */
  public async getAllSaleReturns(): Promise<SaleReturn[]> {
    const saleReturns = await this.dbService.query('SELECT * FROM sale_returns ORDER BY created_at DESC');
    
    if (saleReturns.length === 0) {
      return [];
    }

    // Fetch all items in one query using IN clause
    const saleReturnIds = saleReturns.map((sr: any) => sr.id);
    const placeholders = saleReturnIds.map(() => '?').join(',');
    const allItems = await this.dbService.query(
      `SELECT * FROM sale_return_items WHERE sale_return_id IN (${placeholders})`,
      saleReturnIds
    );

    // Group items by sale_return_id
    const itemsMap = new Map<number, any[]>();
    allItems.forEach((item: any) => {
      if (!itemsMap.has(item.sale_return_id)) {
        itemsMap.set(item.sale_return_id, []);
      }
      itemsMap.get(item.sale_return_id)!.push(item);
    });

    // Build result with items
    return saleReturns.map((saleReturn: any) => ({
      id: saleReturn.id,
      saleId: saleReturn.sale_id,
      subtotal: saleReturn.subtotal,
      discountTotal: saleReturn.discount_total,
      taxTotal: saleReturn.tax_total,
      total: saleReturn.total,
      customerName: saleReturn.customer_name || undefined,
      customerPhone: saleReturn.customer_phone || undefined,
      reason: saleReturn.reason || undefined,
      notes: saleReturn.notes || undefined,
      createdAt: saleReturn.created_at,
      items: (itemsMap.get(saleReturn.id) || []).map((item: any) => ({
        medicineId: item.medicine_id,
        medicineName: item.medicine_name,
        pills: item.pills,
        unitPrice: item.unit_price,
        subtotal: item.subtotal,
        discountAmount: item.discount_amount,
        taxAmount: item.tax_amount,
        total: item.total,
        reason: item.reason || undefined,
      })),
    }));
  }

  /**
   * Get sale return by ID
   */
  public async getSaleReturnById(id: number): Promise<SaleReturn | null> {
    const saleReturn = await this.dbService.queryOne('SELECT * FROM sale_returns WHERE id = ?', [id]);
    if (!saleReturn) return null;

    const items = await this.dbService.query('SELECT * FROM sale_return_items WHERE sale_return_id = ?', [id]);
    return {
      id: saleReturn.id,
      saleId: saleReturn.sale_id,
      subtotal: saleReturn.subtotal,
      discountTotal: saleReturn.discount_total,
      taxTotal: saleReturn.tax_total,
      total: saleReturn.total,
      customerName: saleReturn.customer_name || undefined,
      customerPhone: saleReturn.customer_phone || undefined,
      reason: saleReturn.reason || undefined,
      notes: saleReturn.notes || undefined,
      createdAt: saleReturn.created_at,
      items: items.map((item: any) => ({
        medicineId: item.medicine_id,
        medicineName: item.medicine_name,
        pills: item.pills,
        unitPrice: item.unit_price,
        subtotal: item.subtotal,
        discountAmount: item.discount_amount,
        taxAmount: item.tax_amount,
        total: item.total,
        reason: item.reason || undefined,
      })),
    };
  }

  /**
   * Get all sale returns for a specific sale
   */
  public async getSaleReturnsBySaleId(saleId: number): Promise<SaleReturn[]> {
    const saleReturns = await this.dbService.query('SELECT * FROM sale_returns WHERE sale_id = ? ORDER BY created_at DESC', [saleId]);
    
    if (saleReturns.length === 0) {
      return [];
    }

    // Fetch all items in one query using IN clause
    const saleReturnIds = saleReturns.map((sr: any) => sr.id);
    const placeholders = saleReturnIds.map(() => '?').join(',');
    const allItems = await this.dbService.query(
      `SELECT * FROM sale_return_items WHERE sale_return_id IN (${placeholders})`,
      saleReturnIds
    );

    // Group items by sale_return_id
    const itemsMap = new Map<number, any[]>();
    allItems.forEach((item: any) => {
      if (!itemsMap.has(item.sale_return_id)) {
        itemsMap.set(item.sale_return_id, []);
      }
      itemsMap.get(item.sale_return_id)!.push(item);
    });

    // Build result with items
    return saleReturns.map((saleReturn: any) => ({
      id: saleReturn.id,
      saleId: saleReturn.sale_id,
      subtotal: saleReturn.subtotal,
      discountTotal: saleReturn.discount_total,
      taxTotal: saleReturn.tax_total,
      total: saleReturn.total,
      customerName: saleReturn.customer_name || undefined,
      customerPhone: saleReturn.customer_phone || undefined,
      reason: saleReturn.reason || undefined,
      notes: saleReturn.notes || undefined,
      createdAt: saleReturn.created_at,
      items: (itemsMap.get(saleReturn.id) || []).map((item: any) => ({
        medicineId: item.medicine_id,
        medicineName: item.medicine_name,
        pills: item.pills,
        unitPrice: item.unit_price,
        subtotal: item.subtotal,
        discountAmount: item.discount_amount,
        taxAmount: item.tax_amount,
        total: item.total,
        reason: item.reason || undefined,
      })),
    }));
  }

  /**
   * Get sale returns by date range
   */
  public async getSaleReturnsByDateRange(fromDate: string, toDate: string): Promise<SaleReturn[]> {
    const fromDateOnly = fromDate;
    const toDateOnly = toDate;
    const sql = `
      SELECT * FROM sale_returns
      WHERE date(created_at, 'localtime') >= date(?)
        AND date(created_at, 'localtime') <= date(?)
      ORDER BY created_at DESC
    `;
    const saleReturns = await this.dbService.query(sql, [fromDateOnly, toDateOnly]);
    
    if (saleReturns.length === 0) {
      return [];
    }

    // Fetch all items in one query using IN clause
    const saleReturnIds = saleReturns.map((sr: any) => sr.id);
    const placeholders = saleReturnIds.map(() => '?').join(',');
    const allItems = await this.dbService.query(
      `SELECT * FROM sale_return_items WHERE sale_return_id IN (${placeholders})`,
      saleReturnIds
    );

    // Group items by sale_return_id
    const itemsMap = new Map<number, any[]>();
    allItems.forEach((item: any) => {
      if (!itemsMap.has(item.sale_return_id)) {
        itemsMap.set(item.sale_return_id, []);
      }
      itemsMap.get(item.sale_return_id)!.push(item);
    });

    // Build result with items
    return saleReturns.map((saleReturn: any) => ({
      id: saleReturn.id,
      saleId: saleReturn.sale_id,
      subtotal: saleReturn.subtotal,
      discountTotal: saleReturn.discount_total,
      taxTotal: saleReturn.tax_total,
      total: saleReturn.total,
      customerName: saleReturn.customer_name || undefined,
      customerPhone: saleReturn.customer_phone || undefined,
      reason: saleReturn.reason || undefined,
      notes: saleReturn.notes || undefined,
      createdAt: saleReturn.created_at,
      items: (itemsMap.get(saleReturn.id) || []).map((item: any) => ({
        medicineId: item.medicine_id,
        medicineName: item.medicine_name,
        pills: item.pills,
        unitPrice: item.unit_price,
        subtotal: item.subtotal,
        discountAmount: item.discount_amount,
        taxAmount: item.tax_amount,
        total: item.total,
        reason: item.reason || undefined,
      })),
    }));
  }

  /**
   * Delete a sale return (restores inventory back if needed)
   * Note: This is a destructive operation. Consider adding a flag instead of deleting.
   */
  public async deleteSaleReturn(saleReturnId: number): Promise<void> {
    const saleReturn = await this.dbService.queryOne('SELECT id FROM sale_returns WHERE id = ?', [saleReturnId]);
    if (!saleReturn) {
      throw new Error(`Sale return with id ${saleReturnId} not found`);
    }

    // Reverse the inventory restoration that happened when the return was created,
    // using the exact audit trail in return_item_batches so stock_batches stays
    // consistent with what the original sale deducted.
    const batchRestorations = await this.dbService.query(
      `SELECT rib.stock_batch_id, rib.qty_restored
       FROM return_item_batches rib
       JOIN sale_return_items sri ON sri.id = rib.sale_return_item_id
       WHERE sri.sale_return_id = ?`,
      [saleReturnId]
    );

    await this.dbService.execute('BEGIN TRANSACTION');
    try {
      for (const row of batchRestorations) {
        await this.dbService.execute(
          'UPDATE stock_batches SET qty_remaining = qty_remaining - ? WHERE id = ?',
          [row.qty_restored, row.stock_batch_id]
        );
      }

      // sale_return_items DELETE cascades return_item_batches via FK ON DELETE CASCADE
      await this.dbService.execute('DELETE FROM sale_return_items WHERE sale_return_id = ?', [saleReturnId]);
      await this.dbService.execute('DELETE FROM sale_returns WHERE id = ?', [saleReturnId]);

      await this.dbService.execute('COMMIT');
    } catch (error) {
      await this.dbService.execute('ROLLBACK');
      throw error;
    }
  }

  /**
   * Get flat sale return rows by date range for reporting
   */
  public async getAllSaleReturnsFlatRowsByRange(fromDate: string, toDate: string): Promise<Array<{
    saleReturnId: number;
    saleId: number;
    createdAt: string;
    customerName?: string;
    customerPhone?: string;
    medicineId: number;
    medicineName: string;
    pills: number;
    unitPrice: number;
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    total: number;
    reason?: string;
  }>> {
    // If both dates are empty, return all records
    if (!fromDate && !toDate) {
      const sql = `
        SELECT
          sr.id AS saleReturnId,
          sr.sale_id AS saleId,
          sr.created_at AS createdAt,
          sr.customer_name AS customerName,
          sr.customer_phone AS customerPhone,
          sri.medicine_id AS medicineId,
          sri.medicine_name AS medicineName,
          sri.pills,
          sri.unit_price AS unitPrice,
          sri.subtotal,
          sri.discount_amount AS discountAmount,
          sri.tax_amount AS taxAmount,
          sri.total,
          sri.reason
        FROM sale_return_items sri
        INNER JOIN sale_returns sr ON sr.id = sri.sale_return_id
        ORDER BY sr.created_at DESC, sr.id DESC, sri.id ASC
      `;
      const rows = await this.dbService.query(sql, []);
      return rows.map((row: any) => ({
        saleReturnId: row.saleReturnId,
        saleId: row.saleId,
        createdAt: row.createdAt,
        customerName: row.customerName || undefined,
        customerPhone: row.customerPhone || undefined,
        medicineId: row.medicineId,
        medicineName: row.medicineName,
        pills: row.pills,
        unitPrice: row.unitPrice,
        subtotal: row.subtotal,
        discountAmount: row.discountAmount,
        taxAmount: row.taxAmount,
        total: row.total,
        reason: row.reason || undefined,
      }));
    }
    
    const fromDateOnly = fromDate;
    const toDateOnly = toDate;
    const sql = `
      SELECT
        sr.id AS saleReturnId,
        sr.sale_id AS saleId,
        sr.created_at AS createdAt,
        sr.customer_name AS customerName,
        sr.customer_phone AS customerPhone,
        sri.medicine_id AS medicineId,
        sri.medicine_name AS medicineName,
        sri.pills,
        sri.unit_price AS unitPrice,
        sri.subtotal,
        sri.discount_amount AS discountAmount,
        sri.tax_amount AS taxAmount,
        sri.total,
        sri.reason
      FROM sale_return_items sri
      INNER JOIN sale_returns sr ON sr.id = sri.sale_return_id
      WHERE date(sr.created_at) >= date(?)
        AND date(sr.created_at) <= date(?)
      ORDER BY sr.created_at DESC, sr.id DESC, sri.id ASC
    `;
    const rows = await this.dbService.query(sql, [fromDateOnly, toDateOnly]);
    return rows.map((row: any) => ({
      saleReturnId: row.saleReturnId,
      saleId: row.saleId,
      createdAt: row.createdAt,
      customerName: row.customerName || undefined,
      customerPhone: row.customerPhone || undefined,
      medicineId: row.medicineId,
      medicineName: row.medicineName,
      pills: row.pills,
      unitPrice: row.unitPrice,
      subtotal: row.subtotal,
      discountAmount: row.discountAmount,
      taxAmount: row.taxAmount,
      total: row.total,
      reason: row.reason || undefined,
    }));
  }

  /**
   * Get total sale returns amount (for financial summary)
   */
  public async getTotalSaleReturns(): Promise<number> {
    const sql = `
      SELECT COALESCE(SUM(total), 0) as total_returns
      FROM sale_returns
    `;
    const result = await this.dbService.queryOne(sql);
    return result?.total_returns || 0;
  }

  /**
   * Get sale returns total by date range
   */
  public async getSaleReturnsTotalByDateRange(fromDate: string, toDate: string): Promise<number> {
    // Use local-date boundaries to avoid datetime parsing/timezone edge-cases.
    const sql = `
      SELECT COALESCE(SUM(total), 0) as total_returns
      FROM sale_returns 
      WHERE date(created_at, 'localtime') >= date(?)
        AND date(created_at, 'localtime') <= date(?)
    `;
    const result = await this.dbService.queryOne(sql, [fromDate, toDate]);
    return result?.total_returns || 0;
  }

  /**
   * Get total cost of returned items by date range
   */
  public async getSaleReturnsCostByDateRange(fromDate: string, toDate: string): Promise<number> {
    // Keep cost filtering consistent with return totals and local reporting date.
    const sql = `
      SELECT COALESCE(SUM(sri.cost_subtotal), 0) as total_return_cost
      FROM sale_return_items sri
      JOIN sale_returns sr ON sri.sale_return_id = sr.id
      WHERE date(sr.created_at, 'localtime') >= date(?)
        AND date(sr.created_at, 'localtime') <= date(?)
    `;
    const result = await this.dbService.queryOne(sql, [fromDate, toDate]);
    return result?.total_return_cost || 0;
  }
}

export default SaleReturnService;

