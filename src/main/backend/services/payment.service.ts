import { getDatabaseService } from './database.service';
import PurchaseService from './purchase.service';

export interface Payment {
    id?: number;
    purchaseId: number;
    amount: number;
    paymentMethod: 'cash' | 'cheque' | 'bank_deposit' | 'card' | 'other';
    reference?: string;
    notes?: string;
    paymentDate: string;
    createdAt?: string;
}

export class PaymentService {
    private dbService = getDatabaseService();
    private purchaseService: PurchaseService;

    constructor() {
        this.purchaseService = new PurchaseService();
    }

    public async initializeTable(): Promise<void> {
        await this.dbService.execute(`
      CREATE TABLE IF NOT EXISTS purchase_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        payment_method TEXT NOT NULL,
        reference TEXT,
        notes TEXT,
        payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE
      )
    `);

        await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_purchase_payments_purchase_id ON purchase_payments(purchase_id)
    `);

        await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_purchase_payments_date ON purchase_payments(payment_date)
    `);
    }

    public async addPayment(payment: Payment): Promise<number> {
        if (payment.amount <= 0) {
            throw new Error('Payment amount must be greater than zero');
        }

        const purchase = await this.purchaseService.getPurchaseById(payment.purchaseId);
        if (!purchase) {
            throw new Error(`Purchase with ID ${payment.purchaseId} not found`);
        }

        if (payment.amount > purchase.remainingBalance) {
            throw new Error(`Payment amount (${payment.amount}) cannot exceed remaining balance (${purchase.remainingBalance})`);
        }

        await this.dbService.execute('BEGIN TRANSACTION');
        try {
            const sql = `
        INSERT INTO purchase_payments (purchase_id, amount, payment_method, reference, notes, payment_date)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
            const result = await this.dbService.execute(sql, [
                payment.purchaseId,
                payment.amount,
                payment.paymentMethod,
                payment.reference || null,
                payment.notes || null,
                payment.paymentDate || new Date().toISOString()
            ]);
            const paymentId = (result as any).lastID;

            await this.purchaseService.updatePurchasePayment(payment.purchaseId, payment.amount);

            await this.dbService.execute('COMMIT');
            return paymentId;
        } catch (error) {
            await this.dbService.execute('ROLLBACK');
            throw error;
        }
    }

    public async getPaymentsByPurchaseId(purchaseId: number): Promise<Payment[]> {
        const sql = `
      SELECT * FROM purchase_payments 
      WHERE purchase_id = ? 
      ORDER BY payment_date DESC
    `;
        const rows = await this.dbService.query(sql, [purchaseId]);
        return rows.map(this.mapRowToPayment);
    }

    public async getPaymentsByDateRange(fromDate: string, toDate: string): Promise<Payment[]> {
        const fromDateTime = `${fromDate} 00:00:00`;
        const toDateTime = `${toDate} 23:59:59`;
        const sql = `
      SELECT * FROM purchase_payments 
      WHERE datetime(payment_date) >= datetime(?) 
        AND datetime(payment_date) <= datetime(?)
      ORDER BY payment_date DESC
    `;
        const rows = await this.dbService.query(sql, [fromDateTime, toDateTime]);
        return rows.map(this.mapRowToPayment);
    }

    public async deletePayment(paymentId: number): Promise<void> {
        // Get payment details before deleting
        const payment = await this.dbService.queryOne(
            'SELECT * FROM purchase_payments WHERE id = ?',
            [paymentId]
        );

        if (!payment) {
            throw new Error(`Payment with id ${paymentId} not found`);
        }

        await this.dbService.execute('BEGIN TRANSACTION');
        try {
            // Delete the payment record
            await this.dbService.execute('DELETE FROM purchase_payments WHERE id = ?', [paymentId]);

            // Update the purchase record to reflect the reversed payment
            await this.dbService.execute(`
                UPDATE purchases 
                SET payment_amount = payment_amount - ?,
                    remaining_balance = remaining_balance + ?
                WHERE id = ?
            `, [payment.amount, payment.amount, payment.purchase_id]);

            await this.dbService.execute('COMMIT');
        } catch (error) {
            await this.dbService.execute('ROLLBACK');
            throw error;
        }
    }

    public async getPaymentSummary(filters: any): Promise<any> {
        const { supplierId, periodType, fromDate, toDate } = filters;
        
        let paymentWhere = '';
        let purchaseWhere = '';
        const paymentParams: any[] = [];
        const purchaseParams: any[] = [];

        if (supplierId) {
            paymentWhere += ' AND p.supplier_id = ?';
            purchaseWhere += ' AND supplier_id = ?';
            paymentParams.push(supplierId);
            purchaseParams.push(supplierId);
        }

        if (periodType && periodType !== 'all') {
            let from, to;
            if (periodType === 'custom' && fromDate && toDate) {
                from = `${fromDate} 00:00:00`;
                to = `${toDate} 23:59:59`;
            } else {
                const now = new Date();
                const today = now.toISOString().split('T')[0];
                to = `${today} 23:59:59`;
                
                if (periodType === 'today') {
                    from = `${today} 00:00:00`;
                } else if (periodType === 'week') {
                    const weekAgo = new Date(now);
                    weekAgo.setDate(weekAgo.getDate() - 7);
                    from = `${weekAgo.toISOString().split('T')[0]} 00:00:00`;
                } else if (periodType === 'month') {
                    from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01 00:00:00`;
                } else if (periodType === 'year') {
                    from = `${now.getFullYear()}-01-01 00:00:00`;
                }
            }
            if (from && to) {
                paymentWhere += ' AND datetime(pp.payment_date) >= datetime(?) AND datetime(pp.payment_date) <= datetime(?)';
                purchaseWhere += ' AND datetime(created_at) >= datetime(?) AND datetime(created_at) <= datetime(?)';
                paymentParams.push(from, to);
                purchaseParams.push(from, to);
            }
        }

        // Get purchase totals
        const purchaseSql = `
            SELECT 
                COALESCE(SUM(grand_total), 0) as totalPurchases,
                COALESCE(SUM(payment_amount), 0) as totalPaid,
                COALESCE(SUM(remaining_balance), 0) as totalRemaining
            FROM purchases
            WHERE 1=1 ${purchaseWhere}
        `;
        const purchaseSummary = await this.dbService.queryOne(purchaseSql, purchaseParams);

        // Get payment breakdown
        const paymentSql = `
            SELECT 
                pp.payment_method,
                SUM(pp.amount) as total_amount,
                COUNT(*) as count
            FROM purchase_payments pp
            ${supplierId ? 'JOIN purchases p ON pp.purchase_id = p.id' : ''}
            WHERE 1=1 ${paymentWhere}
            GROUP BY pp.payment_method
        `;
        const paymentRows = await this.dbService.query(paymentSql, paymentParams);

        const summary = {
            totalPurchases: purchaseSummary?.totalPurchases || 0,
            totalPaid: purchaseSummary?.totalPaid || 0,
            totalRemaining: purchaseSummary?.totalRemaining || 0,
            cashPayments: 0,
            bankTransferPayments: 0,
            checkPayments: 0,
            onlinePayments: 0,
            paymentCount: 0
        };

        paymentRows.forEach((row: any) => {
            summary.paymentCount += row.count;
            const method = row.payment_method.toLowerCase();
            if (method === 'cash') summary.cashPayments = row.total_amount;
            else if (method === 'bank_deposit' || method === 'bank_transfer') summary.bankTransferPayments += row.total_amount;
            else if (method === 'cheque' || method === 'check') summary.checkPayments += row.total_amount;
            else if (method === 'card' || method === 'online') summary.onlinePayments += row.total_amount;
        });

        return summary;
    }

    public async getPaymentRecords(filters: any, paginated: boolean = false): Promise<any> {
        const { supplierId, paymentMethod, periodType, fromDate, toDate, page = 1, limit = 50 } = filters;
        
        let where = 'WHERE 1=1';
        const params: any[] = [];

        if (supplierId) {
            where += ' AND p.supplier_id = ?';
            params.push(supplierId);
        }

        if (paymentMethod) {
            const method = paymentMethod === 'bank_transfer' ? 'bank_deposit' : 
                          paymentMethod === 'check' ? 'cheque' : 
                          paymentMethod === 'online' ? 'card' : paymentMethod;
            where += ' AND pp.payment_method = ?';
            params.push(method);
        }

        if (periodType && periodType !== 'all') {
            let from, to;
            if (periodType === 'custom' && fromDate && toDate) {
                from = `${fromDate} 00:00:00`;
                to = `${toDate} 23:59:59`;
            } else {
                const now = new Date();
                const today = now.toISOString().split('T')[0];
                to = `${today} 23:59:59`;
                
                if (periodType === 'today') from = `${today} 00:00:00`;
                else if (periodType === 'week') {
                    const weekAgo = new Date(now);
                    weekAgo.setDate(weekAgo.getDate() - 7);
                    from = `${weekAgo.toISOString().split('T')[0]} 00:00:00`;
                }
                else if (periodType === 'month') from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01 00:00:00`;
                else if (periodType === 'year') from = `${now.getFullYear()}-01-01 00:00:00`;
            }
            if (from && to) {
                where += ' AND datetime(pp.payment_date) >= datetime(?) AND datetime(pp.payment_date) <= datetime(?)';
                params.push(from, to);
            }
        }

        const baseSql = `
            FROM purchase_payments pp
            JOIN purchases p ON pp.purchase_id = p.id
            ${where}
        `;

        // Get total count for pagination
        let totalCount = 0;
        if (paginated) {
            const countSql = `SELECT COUNT(*) as count ${baseSql}`;
            const countResult = await this.dbService.queryOne(countSql, params);
            totalCount = countResult?.count || 0;
        }

        const sql = `
            SELECT 
                pp.*, 
                p.supplier_id, 
                p.supplier_name,
                p.notes as purchase_notes
            ${baseSql}
            ORDER BY pp.payment_date DESC
            ${paginated ? 'LIMIT ? OFFSET ?' : ''}
        `;

        if (paginated) {
            const offset = (page - 1) * limit;
            params.push(limit, offset);
        }

        const rows = await this.dbService.query(sql, params);
        const data = rows.map((row: any) => ({
            id: row.id,
            purchaseId: row.purchase_id,
            supplierId: row.supplier_id,
            supplierName: row.supplier_name,
            amount: row.amount,
            paymentMethod: row.payment_method === 'bank_deposit' ? 'bank_transfer' : 
                           row.payment_method === 'cheque' ? 'check' : 
                           row.payment_method === 'card' ? 'online' : row.payment_method,
            referenceNumber: row.reference,
            notes: row.notes,
            paymentDate: row.payment_date,
            createdAt: row.created_at
        }));

        if (paginated) {
            return {
                data,
                total: totalCount,
                page,
                limit,
                totalPages: Math.ceil(totalCount / limit)
            };
        }

        return data;
    }

    public async getSupplierAccounts(): Promise<any[]> {
        const sql = `
            SELECT 
                s.id as supplierId,
                s.name as supplierName,
                s.company_name as companyName,
                s.phone,
                s.email,
                COALESCE(SUM(p.grand_total), 0) as totalPurchases,
                COALESCE(SUM(p.payment_amount), 0) as totalPaid,
                COALESCE(SUM(p.remaining_balance), 0) as totalRemaining,
                COUNT(p.id) as purchaseCount,
                (SELECT payment_date FROM purchase_payments WHERE purchase_id IN (SELECT id FROM purchases WHERE supplier_id = s.id) ORDER BY payment_date DESC LIMIT 1) as lastPaymentDate,
                (SELECT amount FROM purchase_payments WHERE purchase_id IN (SELECT id FROM purchases WHERE supplier_id = s.id) ORDER BY payment_date DESC LIMIT 1) as lastPaymentAmount
            FROM suppliers s
            LEFT JOIN purchases p ON s.id = p.supplier_id
            GROUP BY s.id, s.name, s.company_name, s.phone, s.email
            ORDER BY totalRemaining DESC, s.name ASC
        `;
        const rows = await this.dbService.query(sql);
        return rows.map((row: any) => ({
            ...row,
            totalPurchases: row.totalPurchases || 0,
            totalPaid: row.totalPaid || 0,
            totalRemaining: row.totalRemaining || 0,
            purchaseCount: row.purchaseCount || 0
        }));
    }

    private mapRowToPayment(row: any): Payment {
        return {
            id: row.id,
            purchaseId: row.purchase_id,
            amount: row.amount,
            paymentMethod: row.payment_method,
            reference: row.reference,
            notes: row.notes,
            paymentDate: row.payment_date,
            createdAt: row.created_at
        };
    }
}

export default PaymentService;
