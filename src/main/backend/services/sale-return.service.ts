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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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
        reason TEXT,
        FOREIGN KEY (sale_return_id) REFERENCES sale_returns(id) ON DELETE CASCADE,
        FOREIGN KEY (medicine_id) REFERENCES medicines(id)
      )
    `);

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
   * Restore inventory by adding pills back to purchase_items
   * Uses FIFO (First In First Out) - adds to the oldest batch first
   */
  private async restoreInventory(medicineId: number, pillsToRestore: number): Promise<void> {
    // Get purchase items for this medicine, ordered by expiry date (oldest first)
    const sql = `
      SELECT id, total_pills, available_pills
      FROM purchase_items
      WHERE medicine_id = ?
        AND expiry_date >= date('now', '+30 days')
      ORDER BY expiry_date ASC, id ASC
    `;
    const batches = await this.dbService.query(sql, [medicineId]);

    if (batches.length === 0) {
      // If no valid batches exist, we'll still allow the return but log a warning
      console.warn(`No valid purchase batches found for medicine ${medicineId} to restore inventory`);
      return;
    }

    let remaining = pillsToRestore;

    // Restore pills to batches, starting with the oldest
    for (const batch of batches) {
      if (remaining <= 0) break;

      const maxCanRestore = batch.total_pills - batch.available_pills;
      if (maxCanRestore <= 0) continue; // This batch is already full

      const restore = Math.min(maxCanRestore, remaining);
      await this.dbService.execute(
        'UPDATE purchase_items SET available_pills = available_pills + ? WHERE id = ?',
        [restore, batch.id]
      );
      remaining -= restore;
    }

    // If we couldn't restore all pills (e.g., original batches were deleted), log a warning
    if (remaining > 0) {
      console.warn(`Could not restore ${remaining} pills for medicine ${medicineId} - original batches may have been deleted`);
    }
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

    // Check each return item
    for (const returnItem of returnItems) {
      const saleItem = saleItems.find((si: any) => si.medicine_id === returnItem.medicineId);
      if (!saleItem) {
        throw new Error(`Medicine ${returnItem.medicineName} (ID: ${returnItem.medicineId}) was not part of sale ${saleId}`);
      }

      const soldQuantity = saleItem.pills;
      const previouslyReturned = returnedByMedicine.get(returnItem.medicineId) || 0;
      const availableToReturn = soldQuantity - previouslyReturned;

      if (returnItem.pills > availableToReturn) {
        throw new Error(
          `Cannot return ${returnItem.pills} pills of ${returnItem.medicineName}. ` +
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
          notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            reason
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await this.dbService.execute(insertItemSql, [
          saleReturnId,
          item.medicineId,
          item.medicineName,
          item.pills,
          item.unitPrice,
          item.subtotal,
          item.discountAmount ?? 0,
          item.taxAmount ?? 0,
          item.total,
          item.reason || null,
        ]);

        // Restore inventory
        await this.restoreInventory(item.medicineId, item.pills);
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
    const saleReturnsWithItems: SaleReturn[] = [];

    for (const saleReturn of saleReturns) {
      const items = await this.dbService.query('SELECT * FROM sale_return_items WHERE sale_return_id = ?', [saleReturn.id]);
      saleReturnsWithItems.push({
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
      });
    }

    return saleReturnsWithItems;
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
    const saleReturnsWithItems: SaleReturn[] = [];

    for (const saleReturn of saleReturns) {
      const items = await this.dbService.query('SELECT * FROM sale_return_items WHERE sale_return_id = ?', [saleReturn.id]);
      saleReturnsWithItems.push({
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
      });
    }

    return saleReturnsWithItems;
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
    const saleReturnsWithItems: SaleReturn[] = [];

    for (const saleReturn of saleReturns) {
      const items = await this.dbService.query('SELECT * FROM sale_return_items WHERE sale_return_id = ?', [saleReturn.id]);
      saleReturnsWithItems.push({
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
      });
    }

    return saleReturnsWithItems;
  }

  /**
   * Delete a sale return (restores inventory back if needed)
   * Note: This is a destructive operation. Consider adding a flag instead of deleting.
   */
  public async deleteSaleReturn(saleReturnId: number): Promise<void> {
    // Check if sale return exists
    const saleReturn = await this.dbService.queryOne('SELECT id FROM sale_returns WHERE id = ?', [saleReturnId]);
    if (!saleReturn) {
      throw new Error(`Sale return with id ${saleReturnId} not found`);
    }

    // Get items before deletion to potentially reverse inventory changes
    const items = await this.dbService.query(
      'SELECT medicine_id, pills FROM sale_return_items WHERE sale_return_id = ?',
      [saleReturnId]
    );

    await this.dbService.execute('BEGIN TRANSACTION');
    try {
      // Delete sale return items first
      await this.dbService.execute('DELETE FROM sale_return_items WHERE sale_return_id = ?', [saleReturnId]);
      // Delete the sale return
      await this.dbService.execute('DELETE FROM sale_returns WHERE id = ?', [saleReturnId]);

      // Note: We don't reverse inventory here because:
      // 1. The original sale may have been deleted
      // 2. The batches may have changed
      // 3. It's safer to require manual inventory adjustment if needed

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
      WHERE date(sr.created_at, 'localtime') >= date(?)
        AND date(sr.created_at, 'localtime') <= date(?)
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
  public async getSaleReturnsByDateRange(fromDate: string, toDate: string): Promise<number> {
    const fromDateTime = `${fromDate} 00:00:00`;
    const toDateTime = `${toDate} 23:59:59`;
    const sql = `
      SELECT COALESCE(SUM(total), 0) as total_returns
      FROM sale_returns 
      WHERE datetime(created_at) >= datetime(?) 
        AND datetime(created_at) <= datetime(?)
    `;
    const result = await this.dbService.queryOne(sql, [fromDateTime, toDateTime]);
    return result?.total_returns || 0;
  }
}

export default SaleReturnService;

