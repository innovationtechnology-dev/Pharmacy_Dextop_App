import { getDatabaseService } from './database.service';

const MIN_PURCHASE_EXPIRY_DAYS = 90;

export interface PurchaseItemInput {
  medicineId: number;
  medicineName: string;
  packetQuantity: number;
  pillsPerPacket: number;
  pricePerPacket: number;
  discountAmount?: number;
  taxAmount?: number;
  expiryDate: string;
  batchNumber?: string;
}

export interface PurchaseItem extends PurchaseItemInput {
  id?: number;
  totalPills: number;
  availablePills?: number;
  pricePerPill: number;
  lineSubtotal: number;
  lineTotal: number;
}

export interface Purchase {
  id?: number;
  supplierId: number;
  supplierName: string;
  supplierCompanyName?: string;
  supplierAddress?: string;
  supplierPhone?: string;
  supplierEmail?: string;
  items: PurchaseItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  paymentAmount: number;
  remainingBalance: number;
  status?: 'ordered' | 'received' | 'completed';
  invoiceNumber?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export class PurchaseService {
  private dbService = getDatabaseService();

  /**
   * Initialize purchases and purchase_items tables with the new workflow schema.
   */
  public async initializeTable(): Promise<void> {
    await this.migrateLegacyPurchases();

    await this.dbService.execute(`
      CREATE TABLE IF NOT EXISTS purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER NOT NULL,
        supplier_name TEXT NOT NULL,
        subtotal REAL NOT NULL DEFAULT 0,
        discount_total REAL NOT NULL DEFAULT 0,
        tax_total REAL NOT NULL DEFAULT 0,
        grand_total REAL NOT NULL DEFAULT 0,
        payment_amount REAL NOT NULL DEFAULT 0,
        remaining_balance REAL NOT NULL DEFAULT 0,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
      )
    `);

    // Add payment_amount and remaining_balance columns if they don't exist (migration)
    const purchasesInfo = await this.dbService.query(`PRAGMA table_info(purchases)`);
    const hasPaymentAmount = purchasesInfo.some((col: any) => col.name === 'payment_amount');
    const hasRemainingBalance = purchasesInfo.some((col: any) => col.name === 'remaining_balance');
    const hasUpdatedAt = purchasesInfo.some((col: any) => col.name === 'updated_at');
    const hasStatus = purchasesInfo.some((col: any) => col.name === 'status');
    const hasInvoiceNumber = purchasesInfo.some((col: any) => col.name === 'invoice_number');

    if (!hasPaymentAmount) {
      await this.dbService.execute(`ALTER TABLE purchases ADD COLUMN payment_amount REAL NOT NULL DEFAULT 0`);
    }
    if (!hasRemainingBalance) {
      await this.dbService.execute(`ALTER TABLE purchases ADD COLUMN remaining_balance REAL NOT NULL DEFAULT 0`);
      // Calculate remaining_balance for existing records
      await this.dbService.execute(`UPDATE purchases SET remaining_balance = grand_total - payment_amount WHERE remaining_balance = 0 AND grand_total > 0`);
    }
    if (!hasUpdatedAt) {
      await this.dbService.execute(`ALTER TABLE purchases ADD COLUMN updated_at DATETIME`);
    }
    if (!hasStatus) {
      await this.dbService.execute(`ALTER TABLE purchases ADD COLUMN status TEXT DEFAULT 'ordered'`);
    }
    if (!hasInvoiceNumber) {
      await this.dbService.execute(`ALTER TABLE purchases ADD COLUMN invoice_number TEXT`);
    }

    await this.dbService.execute(`
      CREATE TABLE IF NOT EXISTS purchase_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_id INTEGER NOT NULL,
        medicine_id INTEGER NOT NULL,
        medicine_name TEXT NOT NULL,
        packet_quantity INTEGER NOT NULL,
        pills_per_packet INTEGER NOT NULL,
        total_pills INTEGER NOT NULL,
        available_pills INTEGER NOT NULL,
        price_per_packet REAL NOT NULL,
        price_per_pill REAL NOT NULL,
        discount_amount REAL NOT NULL DEFAULT 0,
        tax_amount REAL NOT NULL DEFAULT 0,
        line_subtotal REAL NOT NULL,
        line_total REAL NOT NULL,
        expiry_date TEXT NOT NULL,
        batch_number TEXT,
        FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
        FOREIGN KEY (medicine_id) REFERENCES medicines(id)
      )
    `);

    // Add batch_number column if it doesn't exist (migration)
    const purchaseItemsInfo = await this.dbService.query(`PRAGMA table_info(purchase_items)`);
    const hasBatchNumber = purchaseItemsInfo.some((col: any) => col.name === 'batch_number');
    if (!hasBatchNumber) {
      await this.dbService.execute(`ALTER TABLE purchase_items ADD COLUMN batch_number TEXT`);
    }

    await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id ON purchase_items(purchase_id)
    `);
    await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_purchase_items_medicine_id ON purchase_items(medicine_id)
    `);
    await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_purchase_items_expiry_date ON purchase_items(expiry_date)
    `);
    await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id ON purchases(supplier_id)
    `);
    await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_purchases_created_at ON purchases(created_at)
    `);
  }

  private async migrateLegacyPurchases(): Promise<void> {
    const purchasesInfo = await this.dbService.query(`PRAGMA table_info(purchases)`);
    const legacyPurchases =
      purchasesInfo.length > 0 &&
      (purchasesInfo.some((column: any) => column.name === 'tax_type') ||
        purchasesInfo.some((column: any) => column.name === 'tax'));

    if (legacyPurchases) {
      await this.dbService.execute('DROP TABLE IF EXISTS purchase_items');
      await this.dbService.execute('DROP TABLE IF EXISTS purchases');
      return;
    }

    const purchaseItemsInfo = await this.dbService.query(`PRAGMA table_info(purchase_items)`);
    const legacyItems =
      purchaseItemsInfo.length > 0 &&
      !purchaseItemsInfo.some((column: any) => column.name === 'expiry_date');

    if (legacyItems) {
      await this.dbService.execute('DROP TABLE IF EXISTS purchase_items');
    }
  }

  private computeItemTotals(item: PurchaseItemInput): PurchaseItem {
    if (!item.packetQuantity || item.packetQuantity <= 0) {
      throw new Error(`Packet quantity must be greater than zero for ${item.medicineName}`);
    }
    if (!item.pillsPerPacket || item.pillsPerPacket <= 0) {
      throw new Error(`Pills per packet must be greater than zero for ${item.medicineName}`);
    }
    if (!item.pricePerPacket || item.pricePerPacket <= 0) {
      throw new Error(`Price per packet must be greater than zero for ${item.medicineName}`);
    }
    if (!item.expiryDate) {
      throw new Error(`Expiry date is required for ${item.medicineName}`);
    }
    this.assertMinimumExpiry(item.expiryDate, item.medicineName);

    const totalPills = item.packetQuantity * item.pillsPerPacket;
    const pricePerPill = item.pricePerPacket / item.pillsPerPacket;
    const lineSubtotal = item.packetQuantity * item.pricePerPacket;
    const discountAmount = item.discountAmount ?? 0;
    const taxAmount = item.taxAmount ?? 0;
    const lineTotal = lineSubtotal - discountAmount + taxAmount;

    return {
      ...item,
      totalPills,
      pricePerPill,
      lineSubtotal,
      lineTotal,
      discountAmount,
      taxAmount,
    };
  }

  private assertMinimumExpiry(expiryDate: string, medicineName: string): void {
    const parsedExpiry = new Date(expiryDate);
    if (Number.isNaN(parsedExpiry.getTime())) {
      throw new Error(`Expiry date is invalid for ${medicineName}`);
    }
    const minDate = new Date();
    minDate.setDate(minDate.getDate() + MIN_PURCHASE_EXPIRY_DAYS);
    if (parsedExpiry < minDate) {
      throw new Error(
        `${medicineName} must have an expiry date at least ${Math.round(
          MIN_PURCHASE_EXPIRY_DAYS / 30
        )} months from today.`
      );
    }
  }

  /**
   * Create a new purchase workflow record.
   */
  public async createPurchase(purchase: Omit<Purchase, 'id' | 'subtotal' | 'discountTotal' | 'taxTotal' | 'grandTotal' | 'remainingBalance' | 'items'> & {
    items: PurchaseItemInput[];
    paymentAmount?: number;
  }): Promise<number> {
    if (!purchase.items || purchase.items.length === 0) {
      throw new Error('At least one medicine must be included in a purchase.');
    }

    const computedItems = purchase.items.map((item) => this.computeItemTotals(item));

    const subtotal = computedItems.reduce((sum, item) => sum + item.lineSubtotal, 0);
    const discountTotal = computedItems.reduce((sum, item) => sum + (item.discountAmount ?? 0), 0);
    const taxTotal = computedItems.reduce((sum, item) => sum + (item.taxAmount ?? 0), 0);
    const grandTotal = subtotal - discountTotal + taxTotal;
    const paymentAmount = purchase.paymentAmount ?? 0;

    // Validate payment amount
    if (paymentAmount < 0) {
      throw new Error('Payment amount cannot be negative');
    }
    if (paymentAmount > grandTotal) {
      throw new Error(`Payment amount (${paymentAmount}) cannot be greater than grand total (${grandTotal})`);
    }

    const remainingBalance = grandTotal - paymentAmount;

    await this.dbService.execute('BEGIN TRANSACTION');
    try {
      const insertPurchaseSql = `
        INSERT INTO purchases (supplier_id, supplier_name, subtotal, discount_total, tax_total, grand_total, payment_amount, remaining_balance, status, invoice_number, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
      const purchaseResult = await this.dbService.execute(insertPurchaseSql, [
        purchase.supplierId,
        purchase.supplierName,
        subtotal,
        discountTotal,
        taxTotal,
        grandTotal,
        paymentAmount,
        remainingBalance,
        purchase.status || 'ordered',
        purchase.invoiceNumber || null,
        purchase.notes || null,
      ]);
      const purchaseId = (purchaseResult as any).lastID;

      for (const item of computedItems) {
        const medicineExists = await this.dbService.queryOne(
          'SELECT id FROM medicines WHERE id = ?',
          [item.medicineId]
        );

        if (!medicineExists) {
          throw new Error(`Medicine with id ${item.medicineId} (${item.medicineName}) not found. Please add it before purchasing.`);
        }

        const insertItemSql = `
          INSERT INTO purchase_items (
            purchase_id,
            medicine_id,
            medicine_name,
            packet_quantity,
            pills_per_packet,
            total_pills,
            available_pills,
            price_per_packet,
            price_per_pill,
            discount_amount,
            tax_amount,
            line_subtotal,
            line_total,
            expiry_date,
            batch_number
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await this.dbService.execute(insertItemSql, [
          purchaseId,
          item.medicineId,
          item.medicineName,
          item.packetQuantity,
          item.pillsPerPacket,
          item.totalPills,
          item.totalPills,
          item.pricePerPacket,
          item.pricePerPill,
          item.discountAmount ?? 0,
          item.taxAmount ?? 0,
          item.lineSubtotal,
          item.lineTotal,
          item.expiryDate,
          item.batchNumber || null,
        ]);
      }

      await this.dbService.execute('COMMIT');
      return purchaseId;
    } catch (error) {
      await this.dbService.execute('ROLLBACK');
      throw error;
    }
  }

  /**
   * Get all purchases with their computed items, optionally filtered by date range.
   */
  public async getAllPurchases(fromDate?: string, toDate?: string): Promise<Purchase[]> {
    let query = `
      SELECT p.*, 
             s.company_name as supplier_company_name, 
             s.address as supplier_address, 
             s.phone as supplier_phone, 
             s.email as supplier_email
      FROM purchases p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
    `;
    const params: any[] = [];

    if (fromDate && toDate) {
      const fromDateTime = `${fromDate} 00:00:00`;
      const toDateTime = `${toDate} 23:59:59`;
      query += ' WHERE datetime(p.created_at) >= datetime(?) AND datetime(p.created_at) <= datetime(?)';
      params.push(fromDateTime, toDateTime);
    }

    query += ' ORDER BY p.created_at DESC';

    const purchases = await this.dbService.query(query, params);
    const purchasesWithItems: Purchase[] = [];

    for (const purchase of purchases) {
      const items = await this.dbService.query('SELECT * FROM purchase_items WHERE purchase_id = ?', [purchase.id]);
      purchasesWithItems.push({
        id: purchase.id,
        supplierId: purchase.supplier_id,
        supplierName: purchase.supplier_name,
        supplierCompanyName: purchase.supplier_company_name,
        supplierAddress: purchase.supplier_address,
        supplierPhone: purchase.supplier_phone,
        supplierEmail: purchase.supplier_email,
        subtotal: purchase.subtotal,
        discountTotal: purchase.discount_total,
        taxTotal: purchase.tax_total,
        grandTotal: purchase.grand_total,
        paymentAmount: purchase.payment_amount,
        remainingBalance: purchase.remaining_balance,
        status: purchase.status || 'ordered',
        invoiceNumber: purchase.invoice_number || undefined,
        notes: purchase.notes,
        createdAt: purchase.created_at,
        updatedAt: purchase.updated_at,
        items: items.map((item: any) => ({
          id: item.id, // Include the purchase item ID
          medicineId: item.medicine_id,
          medicineName: item.medicine_name,
          packetQuantity: item.packet_quantity,
          pillsPerPacket: item.pills_per_packet,
          totalPills: item.total_pills,
          availablePills: item.available_pills,
          pricePerPacket: item.price_per_packet,
          pricePerPill: item.price_per_pill,
          discountAmount: item.discount_amount,
          taxAmount: item.tax_amount,
          lineSubtotal: item.line_subtotal,
          lineTotal: item.line_total,
          expiryDate: item.expiry_date,
        })),
      });
    }

    return purchasesWithItems;
  }

  /**
   * Get purchase by ID with line items.
   */
  public async getPurchaseById(id: number): Promise<Purchase | null> {
    const query = `
      SELECT p.*, 
             s.company_name as supplier_company_name, 
             s.address as supplier_address, 
             s.phone as supplier_phone, 
             s.email as supplier_email
      FROM purchases p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.id = ?
    `;
    const purchase = await this.dbService.queryOne(query, [id]);
    if (!purchase) return null;

    const items = await this.dbService.query('SELECT * FROM purchase_items WHERE purchase_id = ?', [id]);
    return {
      id: purchase.id,
      supplierId: purchase.supplier_id,
      supplierName: purchase.supplier_name,
      supplierCompanyName: purchase.supplier_company_name,
      supplierAddress: purchase.supplier_address,
      supplierPhone: purchase.supplier_phone,
      supplierEmail: purchase.supplier_email,
      subtotal: purchase.subtotal,
      discountTotal: purchase.discount_total,
      taxTotal: purchase.tax_total,
      grandTotal: purchase.grand_total,
      paymentAmount: purchase.payment_amount ?? 0,
      remainingBalance: purchase.remaining_balance ?? (purchase.grand_total - (purchase.payment_amount ?? 0)),
      status: purchase.status || 'ordered',
      invoiceNumber: purchase.invoice_number || undefined,
      notes: purchase.notes || undefined,
      createdAt: purchase.created_at,
      updatedAt: purchase.updated_at,
      items: items.map((item: any) => ({
        id: item.id, // Include the purchase item ID
        medicineId: item.medicine_id,
        medicineName: item.medicine_name,
        packetQuantity: item.packet_quantity,
        pillsPerPacket: item.pills_per_packet,
        totalPills: item.total_pills,
        availablePills: item.available_pills,
        pricePerPacket: item.price_per_packet,
        pricePerPill: item.price_per_pill,
        discountAmount: item.discount_amount,
        taxAmount: item.tax_amount,
        lineSubtotal: item.line_subtotal,
        lineTotal: item.line_total,
        expiryDate: item.expiry_date,
      })),
    };
  }

  /**
   * Get purchases total by date range for financial summaries.
   */
  public async getPurchasesByDateRange(fromDate: string, toDate: string): Promise<number> {
    const fromDateTime = `${fromDate} 00:00:00`;
    const toDateTime = `${toDate} 23:59:59`;
    const sql = `
      SELECT COALESCE(SUM(grand_total), 0) as total_purchases
      FROM purchases 
      WHERE datetime(created_at) >= datetime(?) 
        AND datetime(created_at) <= datetime(?)
    `;
    const result = await this.dbService.queryOne(sql, [fromDateTime, toDateTime]);
    return result?.total_purchases || 0;
  }

  /**
   * Get total remaining payments (debt) for all suppliers.
   */
  public async getTotalRemainingPayments(): Promise<number> {
    const sql = `
      SELECT COALESCE(SUM(remaining_balance), 0) as total_remaining
      FROM purchases
      WHERE remaining_balance > 0
    `;
    const result = await this.dbService.queryOne(sql);
    return result?.total_remaining || 0;
  }

  /**
   * Get remaining payments by date range.
   */
  public async getRemainingPaymentsByDateRange(fromDate: string, toDate: string): Promise<number> {
    const fromDateTime = `${fromDate} 00:00:00`;
    const toDateTime = `${toDate} 23:59:59`;
    const sql = `
      SELECT COALESCE(SUM(remaining_balance), 0) as total_remaining
      FROM purchases 
      WHERE datetime(created_at) >= datetime(?) 
        AND datetime(created_at) <= datetime(?)
        AND remaining_balance > 0
    `;
    const result = await this.dbService.queryOne(sql, [fromDateTime, toDateTime]);
    return result?.total_remaining || 0;
  }

  /**
   * Get debt summary by supplier.
   */
  public async getSupplierDebtSummary(): Promise<Array<{
    supplierId: number;
    supplierName: string;
    totalPurchases: number;
    totalPaid: number;
    totalRemaining: number;
    purchaseCount: number;
  }>> {
    const sql = `
      SELECT 
        supplier_id,
        supplier_name,
        COUNT(*) as purchase_count,
        COALESCE(SUM(grand_total), 0) as total_purchases,
        COALESCE(SUM(payment_amount), 0) as total_paid,
        COALESCE(SUM(remaining_balance), 0) as total_remaining
      FROM purchases
      GROUP BY supplier_id, supplier_name
      HAVING total_remaining > 0
      ORDER BY total_remaining DESC
    `;
    const results = await this.dbService.query(sql);
    return results.map((row: any) => ({
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      totalPurchases: row.total_purchases,
      totalPaid: row.total_paid,
      totalRemaining: row.total_remaining,
      purchaseCount: row.purchase_count,
    }));
  }

  /**
   * Get debt for a specific supplier.
   */
  public async getSupplierDebt(supplierId: number): Promise<{
    totalPurchases: number;
    totalPaid: number;
    totalRemaining: number;
    purchaseCount: number;
  }> {
    const sql = `
      SELECT 
        COUNT(*) as purchase_count,
        COALESCE(SUM(grand_total), 0) as total_purchases,
        COALESCE(SUM(payment_amount), 0) as total_paid,
        COALESCE(SUM(remaining_balance), 0) as total_remaining
      FROM purchases
      WHERE supplier_id = ?
    `;
    const result = await this.dbService.queryOne(sql, [supplierId]);
    return {
      totalPurchases: result?.total_purchases || 0,
      totalPaid: result?.total_paid || 0,
      totalRemaining: result?.total_remaining || 0,
      purchaseCount: result?.purchase_count || 0,
    };
  }

  /**
   * Delete a purchase and its items.
   */
  public async deletePurchase(purchaseId: number): Promise<void> {
    // Check if purchase exists
    const purchase = await this.dbService.queryOne('SELECT id FROM purchases WHERE id = ?', [purchaseId]);
    if (!purchase) {
      throw new Error(`Purchase with id ${purchaseId} not found`);
    }

    await this.dbService.execute('BEGIN TRANSACTION');
    try {
      // Delete purchase items first (CASCADE should handle this, but being explicit)
      await this.dbService.execute('DELETE FROM purchase_items WHERE purchase_id = ?', [purchaseId]);
      // Delete the purchase
      await this.dbService.execute('DELETE FROM purchases WHERE id = ?', [purchaseId]);
      await this.dbService.execute('COMMIT');
    } catch (error) {
      await this.dbService.execute('ROLLBACK');
      throw error;
    }
  }

  /**
   * Update payment for an existing purchase (add additional payment).
   */
  public async updatePurchasePayment(purchaseId: number, additionalPayment: number): Promise<void> {
    if (additionalPayment <= 0) {
      throw new Error('Payment amount must be greater than zero');
    }

    // Get current purchase details
    const purchase = await this.dbService.queryOne(
      'SELECT grand_total, payment_amount, remaining_balance FROM purchases WHERE id = ?',
      [purchaseId]
    );

    if (!purchase) {
      throw new Error(`Purchase with id ${purchaseId} not found`);
    }

    const currentPayment = purchase.payment_amount || 0;
    const currentRemaining = purchase.remaining_balance || purchase.grand_total;
    const grandTotal = purchase.grand_total;

    // Validate payment
    if (additionalPayment > currentRemaining) {
      throw new Error(
        `Additional payment (${additionalPayment}) cannot exceed remaining balance (${currentRemaining})`
      );
    }

    // Calculate new values
    const newPaymentAmount = currentPayment + additionalPayment;
    const newRemainingBalance = grandTotal - newPaymentAmount;

    // Update purchase
    await this.dbService.execute(
      'UPDATE purchases SET payment_amount = ?, remaining_balance = ? WHERE id = ?',
      [newPaymentAmount, newRemainingBalance, purchaseId]
    );
  }

  /**
   * Update an existing purchase and its items.
   * Reverses old inventory changes and applies new ones.
   */
  public async updatePurchase(
    purchaseId: number,
    purchase: Omit<Purchase, 'id' | 'subtotal' | 'discountTotal' | 'taxTotal' | 'grandTotal' | 'remainingBalance' | 'items'> & {
      items: PurchaseItemInput[];
      paymentAmount?: number;
    }
  ): Promise<void> {
    if (!purchase.items || purchase.items.length === 0) {
      throw new Error('At least one medicine must be included in a purchase.');
    }

    // Check if purchase exists
    const existingPurchase = await this.getPurchaseById(purchaseId);
    if (!existingPurchase) {
      throw new Error(`Purchase with id ${purchaseId} not found`);
    }

    // Check if any items have been sold (available_pills < total_pills)
    const oldItems = await this.dbService.query(
      'SELECT medicine_id, total_pills, available_pills FROM purchase_items WHERE purchase_id = ?',
      [purchaseId]
    );

    for (const oldItem of oldItems) {
      if (oldItem.available_pills < oldItem.total_pills) {
        throw new Error(
          `Cannot edit purchase: Some items have been sold. Medicine ID ${oldItem.medicine_id} has ${oldItem.total_pills - oldItem.available_pills} pills sold.`
        );
      }
    }

    const computedItems = purchase.items.map((item) => this.computeItemTotals(item));

    const subtotal = computedItems.reduce((sum, item) => sum + item.lineSubtotal, 0);
    const discountTotal = computedItems.reduce((sum, item) => sum + (item.discountAmount ?? 0), 0);
    const taxTotal = computedItems.reduce((sum, item) => sum + (item.taxAmount ?? 0), 0);
    const grandTotal = subtotal - discountTotal + taxTotal;
    const paymentAmount = purchase.paymentAmount ?? existingPurchase.paymentAmount ?? 0;

    // Validate payment amount
    if (paymentAmount < 0) {
      throw new Error('Payment amount cannot be negative');
    }
    if (paymentAmount > grandTotal) {
      throw new Error(`Payment amount (${paymentAmount}) cannot be greater than grand total (${grandTotal})`);
    }

    const remainingBalance = grandTotal - paymentAmount;

    await this.dbService.execute('BEGIN TRANSACTION');
    try {
      // Update purchase record
      const updatePurchaseSql = `
        UPDATE purchases 
        SET supplier_id = ?, supplier_name = ?, subtotal = ?, discount_total = ?, tax_total = ?, 
            grand_total = ?, payment_amount = ?, remaining_balance = ?, status = ?, invoice_number = ?, notes = ?, updated_at = ?
        WHERE id = ?
      `;
      const now = new Date().toISOString();
      await this.dbService.execute(updatePurchaseSql, [
        purchase.supplierId,
        purchase.supplierName,
        subtotal,
        discountTotal,
        taxTotal,
        grandTotal,
        paymentAmount,
        remainingBalance,
        purchase.status || existingPurchase.status || 'ordered',
        purchase.invoiceNumber || existingPurchase.invoiceNumber || null,
        purchase.notes || null,
        now,
        purchaseId,
      ]);

      // Delete old purchase items
      await this.dbService.execute('DELETE FROM purchase_items WHERE purchase_id = ?', [purchaseId]);

      // Insert new purchase items
      for (const item of computedItems) {
        const medicineExists = await this.dbService.queryOne(
          'SELECT id FROM medicines WHERE id = ?',
          [item.medicineId]
        );

        if (!medicineExists) {
          throw new Error(`Medicine with id ${item.medicineId} (${item.medicineName}) not found. Please add it before purchasing.`);
        }

        const insertItemSql = `
          INSERT INTO purchase_items (
            purchase_id,
            medicine_id,
            medicine_name,
            packet_quantity,
            pills_per_packet,
            total_pills,
            available_pills,
            price_per_packet,
            price_per_pill,
            discount_amount,
            tax_amount,
            line_subtotal,
            line_total,
            expiry_date,
            batch_number
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await this.dbService.execute(insertItemSql, [
          purchaseId,
          item.medicineId,
          item.medicineName,
          item.packetQuantity,
          item.pillsPerPacket,
          item.totalPills,
          item.totalPills, // Start with all pills available
          item.pricePerPacket,
          item.pricePerPill,
          item.discountAmount ?? 0,
          item.taxAmount ?? 0,
          item.lineSubtotal,
          item.lineTotal,
          item.expiryDate,
          item.batchNumber || null,
        ]);
      }

      await this.dbService.execute('COMMIT');
    } catch (error) {
      await this.dbService.execute('ROLLBACK');
      throw error;
    }
  }
}

export default PurchaseService;

