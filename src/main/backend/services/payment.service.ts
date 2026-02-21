import { DatabaseService } from './database.service';

export type PaymentMethod = 'cash' | 'bank_transfer' | 'check' | 'online';

export interface PaymentRecord {
  id?: number;
  purchaseId: number;
  supplierId: number;
  supplierName: string;
  companyName?: string;
  amount: number;
  paymentMethod: PaymentMethod;
  referenceNumber?: string;
  checkNumber?: string;
  bankName?: string;
  accountNumber?: string;
  notes?: string;
  paymentDate: string;
  createdAt?: string;
}

export interface PaymentSummary {
  totalPurchases: number;
  totalPaid: number;
  totalRemaining: number;
  cashPayments: number;
  bankTransferPayments: number;
  checkPayments: number;
  onlinePayments: number;
  paymentCount: number;
}

export interface SupplierAccount {
  supplierId: number;
  supplierName: string;
  companyName?: string;
  phone?: string;
  email?: string;
  totalPurchases: number;
  totalPaid: number;
  totalRemaining: number;
  purchaseCount: number;
  lastPaymentDate?: string;
  lastPaymentAmount?: number;
}

export interface PaymentFilters {
  supplierId?: number;
  paymentMethod?: PaymentMethod;
  fromDate?: string;
  toDate?: string;
  periodType?: 'all' | 'today' | 'week' | 'month' | 'year' | 'custom';
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class PaymentService {
  private dbService: DatabaseService;

  constructor() {
    this.dbService = new DatabaseService();
  }

  /**
   * Initialize payment_records table
   */
  public async initializeTable(): Promise<void> {
    await this.dbService.execute(`
      CREATE TABLE IF NOT EXISTS payment_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_id INTEGER NOT NULL,
        supplier_id INTEGER NOT NULL,
        supplier_name TEXT NOT NULL,
        company_name TEXT,
        amount REAL NOT NULL,
        payment_method TEXT NOT NULL DEFAULT 'cash',
        reference_number TEXT,
        check_number TEXT,
        bank_name TEXT,
        account_number TEXT,
        notes TEXT,
        payment_date TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
      )
    `);

    // Create indexes for better query performance
    await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_payment_records_purchase_id ON payment_records(purchase_id)
    `);
    await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_payment_records_supplier_id ON payment_records(supplier_id)
    `);
    await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_payment_records_payment_date ON payment_records(payment_date)
    `);
    await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_payment_records_payment_method ON payment_records(payment_method)
    `);
  }

  /**
   * Record a new payment
   */
  public async createPaymentRecord(payment: Omit<PaymentRecord, 'id' | 'createdAt'>): Promise<number> {
    if (payment.amount <= 0) {
      throw new Error('Payment amount must be greater than zero');
    }

    // Validate purchase exists and get remaining balance
    const purchase = await this.dbService.queryOne(
      'SELECT id, grand_total, payment_amount, remaining_balance, supplier_id, supplier_name FROM purchases WHERE id = ?',
      [payment.purchaseId]
    );

    if (!purchase) {
      throw new Error(`Purchase with ID ${payment.purchaseId} not found`);
    }

    const currentRemainingBalance = purchase.remaining_balance ?? (purchase.grand_total - (purchase.payment_amount || 0));
    
    if (payment.amount > currentRemainingBalance) {
      throw new Error(
        `Payment amount (${payment.amount}) exceeds remaining balance (${currentRemainingBalance})`
      );
    }

    // Get supplier company name if not provided
    let companyName = payment.companyName;
    if (!companyName) {
      const supplier = await this.dbService.queryOne(
        'SELECT company_name FROM suppliers WHERE id = ?',
        [payment.supplierId]
      );
      companyName = supplier?.company_name || '';
    }

    await this.dbService.execute('BEGIN TRANSACTION');
    try {
      // Insert payment record
      const insertSql = `
        INSERT INTO payment_records (
          purchase_id, supplier_id, supplier_name, company_name, amount,
          payment_method, reference_number, check_number, bank_name,
          account_number, notes, payment_date
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const result = await this.dbService.execute(insertSql, [
        payment.purchaseId,
        payment.supplierId,
        payment.supplierName,
        companyName || null,
        payment.amount,
        payment.paymentMethod,
        payment.referenceNumber || null,
        payment.checkNumber || null,
        payment.bankName || null,
        payment.accountNumber || null,
        payment.notes || null,
        payment.paymentDate,
      ]);

      // Update purchase payment amount and remaining balance
      const currentPaymentAmount = purchase.payment_amount ?? 0;
      const grandTotal = purchase.grand_total ?? 0;
      const newPaymentAmount = currentPaymentAmount + payment.amount;
      const newRemainingBalance = Math.max(0, grandTotal - newPaymentAmount);

      await this.dbService.execute(
        'UPDATE purchases SET payment_amount = ?, remaining_balance = ? WHERE id = ?',
        [newPaymentAmount, newRemainingBalance, payment.purchaseId]
      );

      await this.dbService.execute('COMMIT');
      return (result as any).lastID;
    } catch (error) {
      await this.dbService.execute('ROLLBACK');
      throw error;
    }
  }

  /**
   * Get all payment records with optional filters and pagination
   */
  public async getPaymentRecords(filters?: PaymentFilters): Promise<PaymentRecord[]>;
  public async getPaymentRecords(filters?: PaymentFilters, paginated?: boolean): Promise<PaginatedResult<PaymentRecord>>;
  public async getPaymentRecords(filters?: PaymentFilters, paginated?: boolean): Promise<PaymentRecord[] | PaginatedResult<PaymentRecord>> {
    let query = `
      SELECT pr.*, p.grand_total as purchase_total, p.remaining_balance
      FROM payment_records pr
      LEFT JOIN purchases p ON pr.purchase_id = p.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters) {
      if (filters.supplierId) {
        query += ' AND pr.supplier_id = ?';
        params.push(filters.supplierId);
      }

      if (filters.paymentMethod) {
        query += ' AND pr.payment_method = ?';
        params.push(filters.paymentMethod);
      }

      // Handle period type
      if (filters.periodType && filters.periodType !== 'all' && filters.periodType !== 'custom') {
        const today = new Date();
        let fromDate: string;
        let toDate: string = today.toISOString().split('T')[0];

        switch (filters.periodType) {
          case 'today':
            fromDate = toDate;
            break;
          case 'week':
            const weekAgo = new Date(today);
            weekAgo.setDate(weekAgo.getDate() - 7);
            fromDate = weekAgo.toISOString().split('T')[0];
            break;
          case 'month':
            fromDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
            break;
          case 'year':
            fromDate = `${today.getFullYear()}-01-01`;
            break;
          default:
            fromDate = '';
        }

        if (fromDate) {
          query += ' AND date(pr.payment_date) >= date(?) AND date(pr.payment_date) <= date(?)';
          params.push(fromDate, toDate);
        }
      } else if (filters.fromDate && filters.toDate) {
        query += ' AND date(pr.payment_date) >= date(?) AND date(pr.payment_date) <= date(?)';
        params.push(filters.fromDate, filters.toDate);
      }
    }

    // Get total count for pagination
    let totalCount = 0;
    if (paginated) {
      const countQuery = query.replace(/SELECT pr\.\*, p\.grand_total as purchase_total, p\.remaining_balance/, 'SELECT COUNT(*) as total');
      const countResult = await this.dbService.queryOne(countQuery, params);
      totalCount = countResult?.total || 0;
    }

    query += ' ORDER BY pr.payment_date DESC, pr.created_at DESC';

    // Apply pagination
    const page = filters?.page || 1;
    const limit = filters?.limit || (paginated ? 50 : 10000); // Default 50 for paginated, 10000 for non-paginated
    const offset = (page - 1) * limit;
    
    if (paginated) {
      query += ` LIMIT ? OFFSET ?`;
      params.push(limit, offset);
    }

    const records = await this.dbService.query(query, params);
    const mappedRecords = records.map((r: any) => ({
      id: r.id,
      purchaseId: r.purchase_id,
      supplierId: r.supplier_id,
      supplierName: r.supplier_name,
      companyName: r.company_name,
      amount: r.amount,
      paymentMethod: r.payment_method as PaymentMethod,
      referenceNumber: r.reference_number,
      checkNumber: r.check_number,
      bankName: r.bank_name,
      accountNumber: r.account_number,
      notes: r.notes,
      paymentDate: r.payment_date,
      createdAt: r.created_at,
    }));

    if (paginated) {
      return {
        data: mappedRecords,
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      };
    }

    return mappedRecords;
  }

  /**
   * Get payment summary statistics
   */
  public async getPaymentSummary(filters?: PaymentFilters): Promise<PaymentSummary> {
    // Get total purchases
    let purchaseQuery = 'SELECT COALESCE(SUM(grand_total), 0) as total FROM purchases WHERE 1=1';
    const purchaseParams: any[] = [];

    if (filters?.supplierId) {
      purchaseQuery += ' AND supplier_id = ?';
      purchaseParams.push(filters.supplierId);
    }

    // Add date filters for purchases
    if (filters?.periodType && filters.periodType !== 'all' && filters.periodType !== 'custom') {
      const today = new Date();
      let fromDate: string;
      let toDate: string = today.toISOString().split('T')[0];

      switch (filters.periodType) {
        case 'today':
          fromDate = toDate;
          break;
        case 'week':
          const weekAgo = new Date(today);
          weekAgo.setDate(weekAgo.getDate() - 7);
          fromDate = weekAgo.toISOString().split('T')[0];
          break;
        case 'month':
          fromDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
          break;
        case 'year':
          fromDate = `${today.getFullYear()}-01-01`;
          break;
        default:
          fromDate = '';
      }

      if (fromDate) {
        purchaseQuery += ' AND date(created_at) >= date(?) AND date(created_at) <= date(?)';
        purchaseParams.push(fromDate, toDate);
      }
    } else if (filters?.fromDate && filters?.toDate) {
      purchaseQuery += ' AND date(created_at) >= date(?) AND date(created_at) <= date(?)';
      purchaseParams.push(filters.fromDate, filters.toDate);
    }

    const totalPurchasesResult = await this.dbService.queryOne(purchaseQuery, purchaseParams);
    const totalPurchases = totalPurchasesResult?.total || 0;

    // Get payment breakdown by method
    let paymentQuery = `
      SELECT 
        COALESCE(SUM(amount), 0) as total_paid,
        COUNT(*) as payment_count,
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN amount ELSE 0 END), 0) as cash_payments,
        COALESCE(SUM(CASE WHEN payment_method = 'bank_transfer' THEN amount ELSE 0 END), 0) as bank_transfer_payments,
        COALESCE(SUM(CASE WHEN payment_method = 'check' THEN amount ELSE 0 END), 0) as check_payments,
        COALESCE(SUM(CASE WHEN payment_method = 'online' THEN amount ELSE 0 END), 0) as online_payments
      FROM payment_records
      WHERE 1=1
    `;
    const paymentParams: any[] = [];

    if (filters?.supplierId) {
      paymentQuery += ' AND supplier_id = ?';
      paymentParams.push(filters.supplierId);
    }

    // Add date filters for payments
    if (filters?.periodType && filters.periodType !== 'all' && filters.periodType !== 'custom') {
      const today = new Date();
      let fromDate: string;
      let toDate: string = today.toISOString().split('T')[0];

      switch (filters.periodType) {
        case 'today':
          fromDate = toDate;
          break;
        case 'week':
          const weekAgo = new Date(today);
          weekAgo.setDate(weekAgo.getDate() - 7);
          fromDate = weekAgo.toISOString().split('T')[0];
          break;
        case 'month':
          fromDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
          break;
        case 'year':
          fromDate = `${today.getFullYear()}-01-01`;
          break;
        default:
          fromDate = '';
      }

      if (fromDate) {
        paymentQuery += ' AND date(payment_date) >= date(?) AND date(payment_date) <= date(?)';
        paymentParams.push(fromDate, toDate);
      }
    } else if (filters?.fromDate && filters?.toDate) {
      paymentQuery += ' AND date(payment_date) >= date(?) AND date(payment_date) <= date(?)';
      paymentParams.push(filters.fromDate, filters.toDate);
    }

    const paymentResult = await this.dbService.queryOne(paymentQuery, paymentParams);

    // Get remaining balance
    let remainingQuery = 'SELECT COALESCE(SUM(remaining_balance), 0) as total FROM purchases WHERE remaining_balance > 0';
    const remainingParams: any[] = [];

    if (filters?.supplierId) {
      remainingQuery += ' AND supplier_id = ?';
      remainingParams.push(filters.supplierId);
    }

    const totalRemainingResult = await this.dbService.queryOne(remainingQuery, remainingParams);

    return {
      totalPurchases,
      totalPaid: paymentResult?.total_paid || 0,
      totalRemaining: totalRemainingResult?.total || 0,
      cashPayments: paymentResult?.cash_payments || 0,
      bankTransferPayments: paymentResult?.bank_transfer_payments || 0,
      checkPayments: paymentResult?.check_payments || 0,
      onlinePayments: paymentResult?.online_payments || 0,
      paymentCount: paymentResult?.payment_count || 0,
    };
  }

  /**
   * Get supplier accounts with balances
   */
  public async getSupplierAccounts(): Promise<SupplierAccount[]> {
    const query = `
      SELECT 
        s.id as supplier_id,
        s.name as supplier_name,
        s.company_name,
        s.phone,
        s.email,
        COALESCE(SUM(p.grand_total), 0) as total_purchases,
        COALESCE(SUM(p.payment_amount), 0) as total_paid,
        COALESCE(SUM(p.remaining_balance), 0) as total_remaining,
        COUNT(p.id) as purchase_count,
        (SELECT payment_date FROM payment_records WHERE supplier_id = s.id ORDER BY payment_date DESC LIMIT 1) as last_payment_date,
        (SELECT amount FROM payment_records WHERE supplier_id = s.id ORDER BY payment_date DESC LIMIT 1) as last_payment_amount
      FROM suppliers s
      LEFT JOIN purchases p ON s.id = p.supplier_id
      GROUP BY s.id, s.name, s.company_name, s.phone, s.email
      HAVING total_purchases > 0
      ORDER BY total_remaining DESC, total_purchases DESC
    `;

    const accounts = await this.dbService.query(query);
    return accounts.map((a: any) => ({
      supplierId: a.supplier_id,
      supplierName: a.supplier_name,
      companyName: a.company_name,
      phone: a.phone,
      email: a.email,
      totalPurchases: a.total_purchases,
      totalPaid: a.total_paid,
      totalRemaining: a.total_remaining,
      purchaseCount: a.purchase_count,
      lastPaymentDate: a.last_payment_date,
      lastPaymentAmount: a.last_payment_amount,
    }));
  }

  /**
   * Get payment records for a specific purchase
   */
  public async getPaymentsByPurchase(purchaseId: number): Promise<PaymentRecord[]> {
    const records = await this.dbService.query(
      `SELECT * FROM payment_records WHERE purchase_id = ? ORDER BY payment_date DESC, created_at DESC`,
      [purchaseId]
    );

    return records.map((r: any) => ({
      id: r.id,
      purchaseId: r.purchase_id,
      supplierId: r.supplier_id,
      supplierName: r.supplier_name,
      companyName: r.company_name,
      amount: r.amount,
      paymentMethod: r.payment_method as PaymentMethod,
      referenceNumber: r.reference_number,
      checkNumber: r.check_number,
      bankName: r.bank_name,
      accountNumber: r.account_number,
      notes: r.notes,
      paymentDate: r.payment_date,
      createdAt: r.created_at,
    }));
  }

  /**
   * Get payment records for a specific supplier
   */
  public async getPaymentsBySupplier(supplierId: number): Promise<PaymentRecord[]> {
    const records = await this.dbService.query(
      `SELECT * FROM payment_records WHERE supplier_id = ? ORDER BY payment_date DESC, created_at DESC`,
      [supplierId]
    );

    return records.map((r: any) => ({
      id: r.id,
      purchaseId: r.purchase_id,
      supplierId: r.supplier_id,
      supplierName: r.supplier_name,
      companyName: r.company_name,
      amount: r.amount,
      paymentMethod: r.payment_method as PaymentMethod,
      referenceNumber: r.reference_number,
      checkNumber: r.check_number,
      bankName: r.bank_name,
      accountNumber: r.account_number,
      notes: r.notes,
      paymentDate: r.payment_date,
      createdAt: r.created_at,
    }));
  }

  /**
   * Delete a payment record (reverse the payment)
   */
  public async deletePaymentRecord(paymentId: number): Promise<void> {
    // Get payment details
    const payment = await this.dbService.queryOne(
      'SELECT * FROM payment_records WHERE id = ?',
      [paymentId]
    );

    if (!payment) {
      throw new Error(`Payment record with ID ${paymentId} not found`);
    }

    // Get current purchase details
    const purchase = await this.dbService.queryOne(
      'SELECT payment_amount, remaining_balance, grand_total FROM purchases WHERE id = ?',
      [payment.purchase_id]
    );

    if (!purchase) {
      throw new Error(`Associated purchase not found`);
    }

    await this.dbService.execute('BEGIN TRANSACTION');
    try {
      // Reverse the payment in purchases table
      const currentPaymentAmount = purchase.payment_amount ?? 0;
      const grandTotal = purchase.grand_total ?? 0;
      const newPaymentAmount = Math.max(0, currentPaymentAmount - payment.amount);
      const newRemainingBalance = Math.max(0, grandTotal - newPaymentAmount);

      await this.dbService.execute(
        'UPDATE purchases SET payment_amount = ?, remaining_balance = ? WHERE id = ?',
        [newPaymentAmount, newRemainingBalance, payment.purchase_id]
      );

      // Delete the payment record
      await this.dbService.execute('DELETE FROM payment_records WHERE id = ?', [paymentId]);

      await this.dbService.execute('COMMIT');
    } catch (error) {
      await this.dbService.execute('ROLLBACK');
      throw error;
    }
  }

  /**
   * Get monthly payment trends for charts
   */
  public async getMonthlyPaymentTrends(year: number): Promise<Array<{ month: string; amount: number; count: number }>> {
    const query = `
      SELECT 
        strftime('%Y-%m', payment_date) as month,
        COALESCE(SUM(amount), 0) as amount,
        COUNT(*) as count
      FROM payment_records
      WHERE strftime('%Y', payment_date) = ?
      GROUP BY strftime('%Y-%m', payment_date)
      ORDER BY month ASC
    `;

    const results = await this.dbService.query(query, [String(year)]);
    return results.map((r: any) => ({
      month: r.month,
      amount: r.amount,
      count: r.count,
    }));
  }

  /**
   * Export payment records to CSV format
   */
  public async exportPaymentRecords(filters?: PaymentFilters): Promise<string> {
    const records = await this.getPaymentRecords(filters);
    
    const header = [
      'ID', 'Date', 'Supplier', 'Company', 'Purchase ID', 'Amount',
      'Payment Method', 'Reference No', 'Check No', 'Bank', 'Account No', 'Notes'
    ].join(',');

    const escape = (v: any) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };

    const rows = records.map(r => [
      r.id,
      r.paymentDate,
      r.supplierName,
      r.companyName || '',
      r.purchaseId,
      r.amount.toFixed(2),
      r.paymentMethod,
      r.referenceNumber || '',
      r.checkNumber || '',
      r.bankName || '',
      r.accountNumber || '',
      r.notes || ''
    ].map(escape).join(','));

    return [header, ...rows].join('\n');
  }
}

export default PaymentService;

