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
   * Flat sale rows SQL: allocates returns per sale line by (medicine_id + rounded unit_price)
   * and FIFO order of sale_items.id so multi-batch lines (old/new stock) do not double-count.
   * @param salesWhereSql — predicate on `s` (e.g. `WHERE 1=1` or date range on s.created_at)
   */
  private buildFlatSalesRowsQuery(salesWhereSql: string): string {
    return `
      WITH filtered AS (
        SELECT
          si.id AS si_id,
          si.sale_id,
          si.medicine_id,
          si.medicine_name,
          si.pills,
          si.unit_price,
          si.subtotal,
          si.discount_amount,
          si.tax_amount,
          si.total,
          s.created_at,
          s.customer_name,
          s.customer_phone,
          s.sale_type
        FROM sale_items si
        INNER JOIN sales s ON s.id = si.sale_id
        ${salesWhereSql}
      ),
      returns_by_key AS (
        SELECT
          sr.sale_id,
          sri.medicine_id,
          ROUND(sri.unit_price, 2) AS price_key,
          SUM(sri.pills) AS ret_pills,
          SUM(sri.subtotal) AS ret_subtotal,
          SUM(sri.discount_amount) AS ret_discount,
          SUM(sri.tax_amount) AS ret_tax,
          SUM(sri.total) AS ret_total
        FROM sale_return_items sri
        INNER JOIN sale_returns sr ON sr.id = sri.sale_return_id
        GROUP BY sr.sale_id, sri.medicine_id, ROUND(sri.unit_price, 2)
      ),
      enriched AS (
        SELECT
          f.*,
          ROUND(f.unit_price, 2) AS price_key,
          SUM(f.pills) OVER (
            PARTITION BY f.sale_id, f.medicine_id, ROUND(f.unit_price, 2)
            ORDER BY f.si_id
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
          ) AS prev_cum_pills
        FROM filtered f
      ),
      allocated AS (
        SELECT
          base.si_id,
          base.sale_id,
          base.created_at,
          base.customer_name,
          base.customer_phone,
          base.sale_type,
          base.medicine_id,
          base.medicine_name,
          base.pills,
          base.unit_price,
          base.subtotal,
          base.discount_amount,
          base.tax_amount,
          base.total,
          base.returned_pills_alloc,
          CASE WHEN base.ret_pills > 0 THEN base.ret_subtotal * (base.returned_pills_alloc * 1.0 / base.ret_pills) ELSE 0 END AS returned_subtotal_alloc,
          CASE WHEN base.ret_pills > 0 THEN base.ret_discount * (base.returned_pills_alloc * 1.0 / base.ret_pills) ELSE 0 END AS returned_discount_alloc,
          CASE WHEN base.ret_pills > 0 THEN base.ret_tax * (base.returned_pills_alloc * 1.0 / base.ret_pills) ELSE 0 END AS returned_tax_alloc,
          CASE WHEN base.ret_pills > 0 THEN base.ret_total * (base.returned_pills_alloc * 1.0 / base.ret_pills) ELSE 0 END AS returned_total_alloc
        FROM (
          SELECT
            e.si_id,
            e.sale_id,
            e.created_at,
            e.customer_name,
            e.customer_phone,
            e.sale_type,
            e.medicine_id,
            e.medicine_name,
            e.pills,
            e.unit_price,
            e.subtotal,
            e.discount_amount,
            e.tax_amount,
            e.total,
            COALESCE(rk.ret_pills, 0) AS ret_pills,
            COALESCE(rk.ret_subtotal, 0) AS ret_subtotal,
            COALESCE(rk.ret_discount, 0) AS ret_discount,
            COALESCE(rk.ret_tax, 0) AS ret_tax,
            COALESCE(rk.ret_total, 0) AS ret_total,
            CAST(
              MIN(e.pills, MAX(0, COALESCE(rk.ret_pills, 0) - COALESCE(e.prev_cum_pills, 0)))
              AS INTEGER
            ) AS returned_pills_alloc
          FROM enriched e
          LEFT JOIN returns_by_key rk
            ON rk.sale_id = e.sale_id
            AND rk.medicine_id = e.medicine_id
            AND rk.price_key = e.price_key
        ) base
      )
      SELECT
        a.sale_id AS saleId,
        a.created_at AS createdAt,
        a.customer_name AS customerName,
        a.customer_phone AS customerPhone,
        a.sale_type AS saleType,
        0 AS additionalDiscount,
        0 AS additionalDiscountAmount,
        a.medicine_id AS medicineId,
        a.medicine_name AS medicineName,
        a.pills AS originalPills,
        COALESCE(a.returned_pills_alloc, 0) AS returnedPills,
        (a.pills - COALESCE(a.returned_pills_alloc, 0)) AS pills,
        a.unit_price AS unitPrice,
        a.subtotal AS originalSubtotal,
        (a.subtotal - COALESCE(a.returned_subtotal_alloc, 0)) AS subtotal,
        a.discount_amount AS originalDiscountAmount,
        (a.discount_amount - COALESCE(a.returned_discount_alloc, 0)) AS discountAmount,
        a.tax_amount AS originalTaxAmount,
        (a.tax_amount - COALESCE(a.returned_tax_alloc, 0)) AS taxAmount,
        a.total AS originalTotal,
        COALESCE(a.returned_total_alloc, 0) AS returnedTotal,
        (a.total - COALESCE(a.returned_total_alloc, 0)) AS total
      FROM allocated a
      ORDER BY a.created_at DESC, a.sale_id DESC, a.si_id ASC
    `;
  }

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
      const sql = this.buildFlatSalesRowsQuery('WHERE 1=1');
      const rows = await this.dbService.query(sql, []);
      return rows as any;
    }

    const fromDateOnly = fromDate;
    const toDateOnly = toDate;
    const sql = this.buildFlatSalesRowsQuery(
      `WHERE date(s.created_at) >= date(?) AND date(s.created_at) <= date(?)`
    );
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
    const sql = this.buildFlatSalesRowsQuery('WHERE 1=1');
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
    // Permanent cleanup migration: drop deprecated extra-discount columns.
    const hasAdditionalDiscount = salesInfoCheck.some((col: any) => col.name === 'additional_discount');
    const hasAdditionalDiscountAmount = salesInfoCheck.some((col: any) => col.name === 'additional_discount_amount');
    if (hasAdditionalDiscount || hasAdditionalDiscountAmount) {
      await this.dbService.execute(`
        CREATE TABLE IF NOT EXISTS sales_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          subtotal REAL NOT NULL DEFAULT 0,
          discount_total REAL NOT NULL DEFAULT 0,
          tax_total REAL NOT NULL DEFAULT 0,
          total REAL NOT NULL,
          customer_name TEXT,
          customer_phone TEXT,
          sale_type TEXT DEFAULT 'Regular',
          prescription_number TEXT,
          doctor_name TEXT,
          created_at DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `);
      await this.dbService.execute(`
        INSERT INTO sales_new (
          id, subtotal, discount_total, tax_total, total, customer_name, customer_phone, sale_type, prescription_number, doctor_name, created_at
        )
        SELECT
          id, subtotal, discount_total, tax_total, total, customer_name, customer_phone, sale_type, prescription_number, doctor_name, created_at
        FROM sales
      `);
      await this.dbService.execute(`DROP TABLE sales`);
      await this.dbService.execute(`ALTER TABLE sales_new RENAME TO sales`);
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
        'UPDATE stock_batches SET qty_remaining = qty_remaining - ? WHERE id = ? AND medicine_id = ?',
        [consume, batch.id, medicineId]
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
    const total = subtotal - discountTotal + taxTotal;

    for (const item of computedItems) {
      await this.ensureInventoryAvailable(item.medicineId, item.pills);
    }

    await this.dbService.execute('BEGIN TRANSACTION');
    try {
      const insertSaleSql = `
        INSERT INTO sales (subtotal, discount_total, tax_total, total, customer_name, customer_phone, sale_type, prescription_number, doctor_name, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
      `;
      const saleResult = await this.dbService.execute(insertSaleSql, [
        subtotal,
        discountTotal,
        taxTotal,
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
        0 as additional_discount,
        0 as additional_discount_amount,
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
          additionalDiscount: 0,
          additionalDiscountAmount: 0,
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
      // 1) Reverse and remove any sale returns linked to this sale
      const saleReturns = await this.dbService.query(
        'SELECT id FROM sale_returns WHERE sale_id = ?',
        [saleId]
      );
      const saleReturnIds = saleReturns.map((row: any) => row.id);

      if (saleReturnIds.length > 0) {
        const placeholders = saleReturnIds.map(() => '?').join(',');

        // Reverse inventory restoration done at return time.
        const batchRestorations = await this.dbService.query(
          `SELECT rib.stock_batch_id, rib.qty_restored
           FROM return_item_batches rib
           JOIN sale_return_items sri ON sri.id = rib.sale_return_item_id
           WHERE sri.sale_return_id IN (${placeholders})`,
          saleReturnIds
        );

        for (const row of batchRestorations) {
          await this.dbService.execute(
            'UPDATE stock_batches SET qty_remaining = qty_remaining - ? WHERE id = ?',
            [row.qty_restored, row.stock_batch_id]
          );
        }

        // Remove return line items and return headers.
        await this.dbService.execute(
          `DELETE FROM sale_return_items WHERE sale_return_id IN (${placeholders})`,
          saleReturnIds
        );
        await this.dbService.execute('DELETE FROM sale_returns WHERE sale_id = ?', [saleId]);
      }

      // 2) Restore inventory originally deducted by the sale
      for (const item of saleItems) {
        await this.restoreInventory(item.id, item.medicine_id, item.pills);
      }

      // 3) Delete sale records
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
      additionalDiscount: 0,
      additionalDiscountAmount: 0,
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
   *
   * Flow: restore all old items via their audit trail → delete old sale_items
   * (which cascades sale_item_batches) → insert new sale_items → deduct
   * inventory for each using the new sale_item_id. This keeps the audit trail
   * consistent whether items are added, removed, or have their quantities changed.
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

    const originalSale = await this.getSaleById(saleId);
    if (!originalSale) {
      throw new Error(`Sale with id ${saleId} not found`);
    }

    // Ensure the update doesn't leave fewer pills than already returned for any medicine.
    const previousReturns = await this.dbService.query(
      `SELECT sri.medicine_id, sri.medicine_name, SUM(sri.pills) as total_returned
       FROM sale_return_items sri
       INNER JOIN sale_returns sr ON sr.id = sri.sale_return_id
       WHERE sr.sale_id = ?
       GROUP BY sri.medicine_id`,
      [saleId]
    );

    const computedItems = payload.items.map((item) => this.computeSaleItem(item));

    // Aggregate by medicine (same medicine may appear on multiple lines)
    const newPillsByMedicine = new Map<number, number>();
    computedItems.forEach(item => {
      newPillsByMedicine.set(item.medicineId, (newPillsByMedicine.get(item.medicineId) || 0) + item.pills);
    });

    // Items being completely removed (newPills === 0) will have their return records
    // cleaned up inside the transaction below. Items being partially reduced below
    // their returned qty still throw.
    for (const ret of previousReturns) {
      const newPills = newPillsByMedicine.get(ret.medicine_id) || 0;
      const returnedPills = ret.total_returned || 0;
      if (newPills > 0 && newPills < returnedPills) {
        throw new Error(
          `Cannot reduce ${ret.medicine_name} to ${newPills} pills because ${returnedPills} pills have already been returned. ` +
          `Please adjust the return records first.`
        );
      }
    }

    // Check availability against NET delta per medicine. After we restore the old
    // quantities, only the positive difference must still be satisfiable.
    const originalPillsByMedicine = new Map<number, number>();
    originalSale.items.forEach(item => {
      originalPillsByMedicine.set(item.medicineId, (originalPillsByMedicine.get(item.medicineId) || 0) + item.pills);
    });

    for (const [medicineId, newPills] of Array.from(newPillsByMedicine.entries())) {
      const oldPills = originalPillsByMedicine.get(medicineId) || 0;
      const delta = newPills - oldPills;
      if (delta > 0) {
        await this.ensureInventoryAvailable(medicineId, delta);
      }
    }

    const subtotal = computedItems.reduce((sum, item) => sum + item.subtotal, 0);
    const discountTotal = computedItems.reduce((sum, item) => sum + (item.discountAmount ?? 0), 0);
    const taxTotal = computedItems.reduce((sum, item) => sum + (item.taxAmount ?? 0), 0);
    const total = subtotal - discountTotal + taxTotal;

    // Collect medicines being completely removed that have return records so we
    // can clean up those returns inside the transaction.
    const medicinesBeingRemoved = previousReturns
      .filter((ret: any) => (newPillsByMedicine.get(ret.medicine_id) || 0) === 0)
      .map((ret: any) => ret.medicine_id as number);

    await this.dbService.execute('BEGIN TRANSACTION');
    try {
      // If any medicines with existing returns are being fully removed, reverse
      // the return inventory effects and delete those return records first.
      if (medicinesBeingRemoved.length > 0) {
        const placeholders = medicinesBeingRemoved.map(() => '?').join(',');
        const returnItems = await this.dbService.query(
          `SELECT sri.id, sri.sale_return_id
           FROM sale_return_items sri
           INNER JOIN sale_returns sr ON sr.id = sri.sale_return_id
           WHERE sr.sale_id = ? AND sri.medicine_id IN (${placeholders})`,
          [saleId, ...medicinesBeingRemoved]
        );

        for (const sri of returnItems) {
          const batches = await this.dbService.query(
            'SELECT stock_batch_id, qty_restored FROM return_item_batches WHERE sale_return_item_id = ?',
            [sri.id]
          );
          for (const b of batches) {
            await this.dbService.execute(
              'UPDATE stock_batches SET qty_remaining = qty_remaining - ? WHERE id = ?',
              [b.qty_restored, b.stock_batch_id]
            );
          }
          await this.dbService.execute('DELETE FROM return_item_batches WHERE sale_return_item_id = ?', [sri.id]);
        }

        if (returnItems.length > 0) {
          const sriIds = returnItems.map((r: any) => r.id);
          const sriPlaceholders = sriIds.map(() => '?').join(',');
          await this.dbService.execute(
            `DELETE FROM sale_return_items WHERE id IN (${sriPlaceholders})`,
            sriIds
          );
        }

        // Remove any sale_returns that are now empty
        const emptyReturns = await this.dbService.query(
          `SELECT sr.id FROM sale_returns sr
           WHERE sr.sale_id = ?
           AND NOT EXISTS (SELECT 1 FROM sale_return_items sri2 WHERE sri2.sale_return_id = sr.id)`,
          [saleId]
        );
        if (emptyReturns.length > 0) {
          const erPlaceholders = emptyReturns.map(() => '?').join(',');
          await this.dbService.execute(
            `DELETE FROM sale_returns WHERE id IN (${erPlaceholders})`,
            emptyReturns.map((r: any) => r.id)
          );
        }
      }

      // Fetch old sale_items with their IDs BEFORE deleting them, so
      // restoreInventory can reverse batch allocations from sale_item_batches.
      const oldSaleItems = await this.dbService.query(
        'SELECT id, medicine_id, pills FROM sale_items WHERE sale_id = ?',
        [saleId]
      );

      // Update sale header
      const updateSaleSql = `
        UPDATE sales
        SET subtotal = ?, discount_total = ?, tax_total = ?, total = ?,
            customer_name = ?, customer_phone = ?, sale_type = ?
        WHERE id = ?
      `;
      await this.dbService.execute(updateSaleSql, [
        subtotal,
        discountTotal,
        taxTotal,
        total,
        payload.customerName || null,
        payload.customerPhone || null,
        payload.saleType || 'Regular',
        saleId,
      ]);

      // 1) Restore inventory for ALL old items using their recorded batch allocations.
      for (const oldItem of oldSaleItems) {
        await this.restoreInventory(oldItem.id, oldItem.medicine_id, oldItem.pills);
      }

      // 2) Delete old sale_items (FK ON DELETE CASCADE removes their sale_item_batches).
      await this.dbService.execute('DELETE FROM sale_items WHERE sale_id = ?', [saleId]);

      // 3) Batch-fetch average cost price per medicine from current stock_batches.
      const uniqueMedicineIds = Array.from(new Set(computedItems.map(item => item.medicineId)));
      const costMap = new Map<number, number>();
      if (uniqueMedicineIds.length > 0) {
        const placeholders = uniqueMedicineIds.map(() => '?').join(',');
        const costResults = await this.dbService.query(`
          SELECT medicine_id, AVG(cost_price_per_pill) as avg_cost
          FROM stock_batches
          WHERE medicine_id IN (${placeholders})
            AND qty_remaining > 0
            AND date(expiry_date) >= ${UNEXPIRED_THRESHOLD_EXPRESSION}
          GROUP BY medicine_id
        `, uniqueMedicineIds);
        costResults.forEach((r: any) => costMap.set(r.medicine_id, r.avg_cost || 0));
      }

      // 4) Insert new sale_items and deduct inventory against the new sale_item_id.
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
        const itemResult = await this.dbService.execute(insertItemSql, [
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
        const newSaleItemId = (itemResult as any).lastID;

        await this.deductInventory(item.medicineId, item.pills, newSaleItemId);
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
    /** Sum of sale header subtotals at checkout (qty × list price before line discounts); returns not deducted — use with saleReturnsTotal for “gross after returns” in UI */
    grossSubtotal: number;
    /** Sum of invoice totals after line discounts & tax (includes charity/employee/relative bills) */
    sellingTotal: number;
    saleDiscountTotal: number;
    saleTaxTotal: number;
    saleReturnDiscountTotal?: number;
    saleReturnTaxTotal?: number;
    saleReturnsTotal: number;
    familyTotal: number;
    charityTotal: number;
    employeeTotal: number;
    familyPaid: number;
    charityPaid: number;
    employeePaid: number;
    /** Gross list (pre–line discount) − charity / relative / employee − returns; same basis as Financial Summary “Net sales” */
    netSalesGrossBasis: number;
    netRevenue: number;
    paymentTotal: number;
    remainingPayment: number;
    profit: number;
    trend: Array<{ date: string; grossSales: number; netSales: number; sales: number; purchases: number; profit: number }>;
  }> {
    // Use sale_items for accurate totals — sale headers' discount_total / tax_total / total
    // may have been modified by legacy return adjustments; sale_items are never modified.
    // gross_subtotal = merchandise value before discounts (SUM of line subtotals).
    // selling_total  = SUM of line totals after discounts & tax (includes charity etc.).
    const salesSql = `
      SELECT
        COALESCE(SUM(si.subtotal), 0)         as gross_subtotal,
        COALESCE(SUM(si.total), 0)            as selling_total,
        COALESCE(SUM(si.discount_amount), 0)  as sale_discount_total,
        COALESCE(SUM(si.tax_amount), 0)       as sale_tax_total,
        COALESCE(SUM(CASE WHEN s.sale_type = 'Family/Relatives' THEN si.total ELSE 0 END), 0) as family_paid,
        COALESCE(SUM(CASE WHEN s.sale_type = 'Charity'           THEN si.total ELSE 0 END), 0) as charity_paid,
        COALESCE(SUM(CASE WHEN s.sale_type = 'Employee'          THEN si.total ELSE 0 END), 0) as employee_paid,
        COALESCE(SUM(CASE WHEN s.sale_type = 'Family/Relatives' THEN si.discount_amount ELSE 0 END), 0) as family_discount,
        COALESCE(SUM(CASE WHEN s.sale_type = 'Charity'           THEN si.discount_amount ELSE 0 END), 0) as charity_discount,
        COALESCE(SUM(CASE WHEN s.sale_type = 'Employee'          THEN si.discount_amount ELSE 0 END), 0) as employee_discount
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE date(s.created_at) >= date(?)
        AND date(s.created_at) <= date(?)
    `;
    const salesResult = await this.dbService.queryOne(salesSql, [fromDate, toDate]);
    const grossSubtotal = salesResult?.gross_subtotal || 0;
    const sellingTotal    = salesResult?.selling_total     || 0;
    const saleDiscountTotal = salesResult?.sale_discount_total || 0;
    const saleTaxTotal    = salesResult?.sale_tax_total    || 0;

    // Use PAID totals for internal math (to remove them from Net Revenue)
    const familyPaid      = salesResult?.family_paid      || 0;
    const charityPaid     = salesResult?.charity_paid     || 0;
    const employeePaid    = salesResult?.employee_paid    || 0;
    const companyExpenses = familyPaid + charityPaid + employeePaid;

    // Use DISCOUNT totals for UI display as requested by user
    const familyTotal     = salesResult?.family_discount   || 0;
    const charityTotal    = salesResult?.charity_discount  || 0;
    const employeeTotal   = salesResult?.employee_discount || 0;

    // Get sale returns total and their cost for this date range
    const saleReturnsTotal = await this.saleReturnService.getSaleReturnsTotalByDateRange(fromDate, toDate);
    const saleReturnsCost = await (this.saleReturnService as any).getSaleReturnsCostByDateRange(fromDate, toDate);

    // Get return discount & tax totals so we can show NET sale discounts/taxes
    // (original discount minus the portion refunded with returned items)
    const returnDiscountTaxSql = `
      SELECT
        COALESCE(SUM(sri.discount_amount), 0) as return_discount_total,
        COALESCE(SUM(sri.tax_amount), 0)      as return_tax_total
      FROM sale_return_items sri
      JOIN sale_returns sr ON sri.sale_return_id = sr.id
      WHERE date(sr.created_at) >= date(?)
        AND date(sr.created_at) <= date(?)
    `;
    const returnDiscountTaxResult = await this.dbService.queryOne(returnDiscountTaxSql, [fromDate, toDate]);
    const saleReturnDiscountTotal = returnDiscountTaxResult?.return_discount_total || 0;
    const saleReturnTaxTotal = returnDiscountTaxResult?.return_tax_total || 0;

    // COGS for revenue-generating sales only (exclude charity/employee/relative)
    // These are company expenses, not sales, so their cost should not be in COGS
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
      WHERE date(s.created_at) >= date(?) 
        AND date(s.created_at) <= date(?)
    `;
    const cogsResult = await this.dbService.queryOne(cogsSql, [fromDate, toDate]);
    const grossCogs = cogsResult?.total_cogs || 0;

    // Net Revenue = invoiced total − returns (basis for profit / “invoiced net”).
    // (Note: Relative/Charity/Employee paid amounts are now kept in sellingTotal)
    const netRevenue = sellingTotal - saleReturnsTotal;
    // Net sales (merchandise KPI) = list subtotal − discounts − returns.
    const netSalesGrossBasis = Math.max(0, grossSubtotal - saleDiscountTotal - saleReturnsTotal);
    // Net COGS = total COGS − cost of returned items
    const netCogs = grossCogs - saleReturnsCost;

    // Get purchase totals with discount and tax breakdown
    const purchasingSql = `
      SELECT 
        COALESCE(SUM(grand_total), 0) as purchasing_total,
        COALESCE(SUM(discount_total), 0) as purchase_discount_total,
        COALESCE(SUM(tax_total), 0) as purchase_tax_total
      FROM purchases
      WHERE date(created_at) >= date(?)
        AND date(created_at) <= date(?)
    `;
    const purchasingResult = await this.dbService.queryOne(purchasingSql, [fromDate, toDate]);
    const purchasingTotal = purchasingResult?.purchasing_total || 0;
    const purchaseDiscountTotal = purchasingResult?.purchase_discount_total || 0;
    const purchaseTaxTotal = purchasingResult?.purchase_tax_total || 0;

    // Get remaining payments (debt) for purchases in this date range
    const remainingPaymentSql = `
      SELECT COALESCE(SUM(remaining_balance), 0) as total_remaining
      FROM purchases
      WHERE date(created_at) >= date(?)
        AND date(created_at) <= date(?)
        AND remaining_balance > 0
    `;
    const remainingPaymentResult = await this.dbService.queryOne(remainingPaymentSql, [fromDate, toDate]);
    const remainingPayment = remainingPaymentResult?.total_remaining || 0;

    // Profit = Net Revenue (gross − company expenses − returns) − Net COGS
    const profit = netRevenue - netCogs;

    const salesTrendSql = `
      SELECT
        date(s.created_at) as date,
        SUM(si.subtotal) as gross_amount,
        SUM(si.total) as net_amount,
        SUM(CASE WHEN si.cost_subtotal > 0 THEN si.cost_subtotal ELSE si.pills * COALESCE((SELECT sb.cost_price_per_pill FROM stock_batches sb WHERE sb.medicine_id = si.medicine_id AND sb.qty_remaining > 0 ORDER BY date(sb.expiry_date) ASC, sb.id ASC LIMIT 1), 0) END) as cost
      FROM sales s
      JOIN sale_items si ON s.id = si.sale_id
      WHERE date(s.created_at) >= date(?) 
        AND date(s.created_at) <= date(?)
      GROUP BY date(s.created_at)
    `;
    const purchasesTrendSql = `
      SELECT date(created_at) as date, SUM(grand_total) as amount
      FROM purchases
      WHERE date(created_at) >= date(?) AND date(created_at) <= date(?)
      GROUP BY date(created_at)
    `;
    const returnsTrendSql = `
      SELECT
        date(sr.created_at) as date,
        SUM(sri.total) as return_amount,
        SUM(CASE WHEN sri.cost_subtotal > 0 THEN sri.cost_subtotal ELSE 0 END) as return_cost
      FROM sale_returns sr
      JOIN sale_return_items sri ON sr.id = sri.sale_return_id
      WHERE date(sr.created_at) >= date(?) AND date(sr.created_at) <= date(?)
      GROUP BY date(sr.created_at)
    `;

    const salesTrend = await this.dbService.query(salesTrendSql, [fromDate, toDate]);
    const purchasesTrend = await this.dbService.query(purchasesTrendSql, [fromDate, toDate]);
    const returnsTrend = await this.dbService.query(returnsTrendSql, [fromDate, toDate]);

    const trendMap = new Map<string, { grossSales: number; netSales: number; purchases: number; cost: number }>();

    salesTrend.forEach((r: any) => {
      if (!trendMap.has(r.date)) trendMap.set(r.date, { grossSales: 0, netSales: 0, purchases: 0, cost: 0 });
      const current = trendMap.get(r.date)!;
      current.grossSales = r.gross_amount;
      current.netSales = r.net_amount;
      current.cost = r.cost;
    });

    returnsTrend.forEach((r: any) => {
      if (!trendMap.has(r.date)) trendMap.set(r.date, { grossSales: 0, netSales: 0, purchases: 0, cost: 0 });
      const current = trendMap.get(r.date)!;
      // For trend purposes, subtract returns from the daily sales to get a "net intake" view
      current.grossSales -= r.return_amount; 
      current.netSales -= r.return_amount;
      current.cost -= r.return_cost;
    });

    purchasesTrend.forEach((r: any) => {
      if (!trendMap.has(r.date)) trendMap.set(r.date, { grossSales: 0, netSales: 0, purchases: 0, cost: 0 });
      trendMap.get(r.date)!.purchases = r.amount;
    });

    const trend = Array.from(trendMap.entries())
      .map(([date, data]) => ({
        date,
        grossSales: data.grossSales,
        netSales: data.netSales,
        sales: data.netSales, // Keep 'sales' for backward compatibility in parts of UI that expect it
        purchases: data.purchases,
        profit: data.netSales - data.cost
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      purchasingTotal,
      purchaseDiscountTotal,
      purchaseTaxTotal,
      grossSubtotal,
      sellingTotal,
      saleDiscountTotal,
      saleTaxTotal,
      saleReturnDiscountTotal,
      saleReturnTaxTotal,
      saleReturnsTotal,
      familyTotal,
      charityTotal,
      employeeTotal,
      familyPaid,
      charityPaid,
      employeePaid,
      netSalesGrossBasis,
      netRevenue,
      paymentTotal: sellingTotal, // Restore paymentTotal (assumed to be sellingTotal based on original SQL)
      remainingPayment,
      profit,
      trend,
    };
  }

  /**
   * Sales Overview spark / area chart for an arbitrary KPI date range.
   * Same gross / net revenue / profit definitions as getFinancialSummaryByDateRange (line items,
   * returns, FIFO-style COGS), grouped by day when the span is short, otherwise by calendar month.
   */
  public async getFinancialSparkForDateRange(
    fromDate: string,
    toDate: string
  ): Promise<{ x: string; gross: number; net: number; profit: number }[]> {
    const pad = (n: number) => String(n).padStart(2, '0');

    let rangeFrom = (fromDate || '').slice(0, 10);
    let rangeTo = (toDate || '').slice(0, 10);
    if (!rangeFrom || !rangeTo) return [];
    if (rangeFrom > rangeTo) {
      const t = rangeFrom;
      rangeFrom = rangeTo;
      rangeTo = t;
    }

    const dFrom = new Date(`${rangeFrom}T12:00:00`);
    const dTo = new Date(`${rangeTo}T12:00:00`);
    if (Number.isNaN(dFrom.getTime()) || Number.isNaN(dTo.getTime())) return [];

    const daysSpan = Math.floor((dTo.getTime() - dFrom.getTime()) / 86400000) + 1;
    const useDaily = daysSpan <= 45;

    const salesBucketExpr = useDaily ? `date(s.created_at)` : `strftime('%Y-%m', s.created_at)`;
    const returnsBucketExpr = useDaily ? `date(created_at)` : `strftime('%Y-%m', created_at)`;
    const returnsJoinBucketExpr = useDaily ? `date(sr.created_at)` : `strftime('%Y-%m', sr.created_at)`;
    const cogsBucketExpr = useDaily ? `date(s.created_at)` : `strftime('%Y-%m', s.created_at)`;

    const salesByBucketSql = `
      SELECT
        ${salesBucketExpr} AS bucket,
        COALESCE(SUM(si.subtotal), 0) AS gross_subtotal,
        COALESCE(SUM(si.total), 0) AS selling_total
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE date(s.created_at) >= date(?)
        AND date(s.created_at) <= date(?)
      GROUP BY ${salesBucketExpr}
    `;

    const returnsTotalByBucketSql = `
      SELECT
        ${returnsBucketExpr} AS bucket,
        COALESCE(SUM(total), 0) AS return_total
      FROM sale_returns
      WHERE date(created_at) >= date(?)
        AND date(created_at) <= date(?)
      GROUP BY ${returnsBucketExpr}
    `;

    const returnsCostByBucketSql = `
      SELECT
        ${returnsJoinBucketExpr} AS bucket,
        COALESCE(SUM(sri.cost_subtotal), 0) AS return_cost
      FROM sale_return_items sri
      JOIN sale_returns sr ON sri.sale_return_id = sr.id
      WHERE date(sr.created_at) >= date(?)
        AND date(sr.created_at) <= date(?)
      GROUP BY ${returnsJoinBucketExpr}
    `;

    const cogsByBucketSql = `
      SELECT
        ${cogsBucketExpr} AS bucket,
        COALESCE(SUM(
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
        ), 0) AS total_cogs
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE date(s.created_at) >= date(?)
        AND date(s.created_at) <= date(?)
      GROUP BY ${cogsBucketExpr}
    `;

    const [salesRows, retTotRows, retCostRows, cogsRows] = await Promise.all([
      this.dbService.query(salesByBucketSql, [rangeFrom, rangeTo]),
      this.dbService.query(returnsTotalByBucketSql, [rangeFrom, rangeTo]),
      this.dbService.query(returnsCostByBucketSql, [rangeFrom, rangeTo]),
      this.dbService.query(cogsByBucketSql, [rangeFrom, rangeTo]),
    ]);

    const salesMap = new Map<string, { gross: number; selling: number }>();
    (salesRows as any[]).forEach((r) => {
      const b = String(r.bucket);
      salesMap.set(b, { gross: r.gross_subtotal || 0, selling: r.selling_total || 0 });
    });
    const retTotMap = new Map<string, number>();
    (retTotRows as any[]).forEach((r) => retTotMap.set(String(r.bucket), r.return_total || 0));
    const retCostMap = new Map<string, number>();
    (retCostRows as any[]).forEach((r) => retCostMap.set(String(r.bucket), r.return_cost || 0));
    const cogsMap = new Map<string, number>();
    (cogsRows as any[]).forEach((r) => cogsMap.set(String(r.bucket), r.total_cogs || 0));

    const orderedBuckets: string[] = [];
    if (useDaily) {
      let dayGuard = 0;
      for (let d = new Date(dFrom); d <= dTo; d.setDate(d.getDate() + 1)) {
        if (++dayGuard > 800) break;
        orderedBuckets.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
      }
    } else {
      const fy = dFrom.getFullYear();
      const fm = dFrom.getMonth() + 1;
      const ty = dTo.getFullYear();
      const tm = dTo.getMonth() + 1;
      let y = fy;
      let m = fm;
      let monthGuard = 0;
      while (y < ty || (y === ty && m <= tm)) {
        if (++monthGuard > 600) break;
        orderedBuckets.push(`${y}-${pad(m)}`);
        m += 1;
        if (m > 12) {
          m = 1;
          y += 1;
        }
      }
    }

    const labelForBucket = (bucket: string): string => {
      if (useDaily) {
        const [ys, ms, ds] = bucket.split('-').map((n) => parseInt(n, 10));
        return new Date(ys, ms - 1, ds).toLocaleString('en-US', { month: 'short', day: 'numeric' });
      }
      const [ys, ms] = bucket.split('-').map((n) => parseInt(n, 10));
      return new Date(ys, ms - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' });
    };

    return orderedBuckets.map((bucket) => {
      const s = salesMap.get(bucket);
      const gross = s?.gross ?? 0;
      const selling = s?.selling ?? 0;
      const saleReturnsTotal = retTotMap.get(bucket) ?? 0;
      const saleReturnsCost = retCostMap.get(bucket) ?? 0;
      const grossCogs = cogsMap.get(bucket) ?? 0;
      const netRevenue = selling - saleReturnsTotal;
      const netCogs = grossCogs - saleReturnsCost;
      return {
        x: labelForBucket(bucket),
        gross,
        net: netRevenue,
        profit: netRevenue - netCogs,
      };
    });
  }
}

export default SalesService;
