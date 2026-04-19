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
    private repersistSavepointSeq = 0;

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
        payment_date DATETIME DEFAULT (datetime('now', 'localtime')),
        created_at DATETIME DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE
      )
    `);

        await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_purchase_payments_purchase_id ON purchase_payments(purchase_id)
    `);

        await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_purchase_payments_date ON purchase_payments(payment_date)
    `);

        const ppInfo = await this.dbService.query(`PRAGMA table_info(purchase_payments)`);
        if (!ppInfo.some((col: any) => col.name === 'supplier_balance_after')) {
            await this.dbService.execute(`ALTER TABLE purchase_payments ADD COLUMN supplier_balance_after REAL`);
        }
    }

    private paymentDateSqlValue(payment: Payment): string {
        if (payment.paymentDate && String(payment.paymentDate).trim()) {
            const d = String(payment.paymentDate).trim();
            return d.includes('T') || d.includes(' ') ? d : `${d} 12:00:00`;
        }
        return `datetime('now', 'localtime')`;
    }

    /** Insert one payment row and increase purchase paid amount (caller manages transaction). */
    private async insertPurchasePaymentRow(payment: Payment): Promise<number> {
        const payExpr = this.paymentDateSqlValue(payment);
        const useLiteral = payExpr.startsWith("datetime(");
        const sql = useLiteral
            ? `INSERT INTO purchase_payments (purchase_id, amount, payment_method, reference, notes, payment_date, created_at)
               VALUES (?, ?, ?, ?, ?, ${payExpr}, datetime('now', 'localtime'))`
            : `INSERT INTO purchase_payments (purchase_id, amount, payment_method, reference, notes, payment_date, created_at)
               VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`;
        const params = useLiteral
            ? [payment.purchaseId, payment.amount, payment.paymentMethod, payment.reference || null, payment.notes || null]
            : [payment.purchaseId, payment.amount, payment.paymentMethod, payment.reference || null, payment.notes || null, payExpr];
        const result = await this.dbService.execute(sql, params);
        return (result as any).lastID as number;
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
        let paymentId = 0;
        try {
            paymentId = await this.insertPurchasePaymentRow(payment);
            await this.purchaseService.updatePurchasePayment(payment.purchaseId, payment.amount);
            await this.dbService.execute('COMMIT');
        } catch (error) {
            await this.dbService.execute('ROLLBACK');
            throw error;
        }
        await this.repersistSupplierRunningBalances();
        return paymentId;
    }

    /**
     * Apply one payment across all open POs for a supplier (oldest PO first) in a single transaction.
     */
    public async addPaymentAllocatedBySupplier(
        supplierId: number,
        totalAmount: number,
        payment: Pick<Payment, 'paymentMethod'> & { reference?: string; notes?: string; paymentDate?: string },
    ): Promise<void> {
        if (totalAmount <= 0) {
            throw new Error('Payment amount must be greater than zero');
        }
        const rows = await this.dbService.query(
            `SELECT id, remaining_balance FROM purchases
             WHERE supplier_id = ? AND remaining_balance > 0.0001
             ORDER BY datetime(created_at) ASC, id ASC`,
            [supplierId],
        );
        const open = (rows as any[]).map(r => ({
            id: Number(r.id),
            rem: Math.max(0, Number(r.remaining_balance) || 0),
        }));
        const sumOpen = open.reduce((s, r) => s + r.rem, 0);
        if (totalAmount - sumOpen > 0.0001) {
            throw new Error(`Payment amount (${totalAmount}) cannot exceed total open balance (${sumOpen}) for this supplier`);
        }

        await this.dbService.execute('BEGIN TRANSACTION');
        try {
            let left = totalAmount;
            for (const r of open) {
                if (left <= 0.0001) break;
                const chunk = Math.min(left, r.rem);
                if (chunk <= 0.0001) continue;
                const slice: Payment = {
                    purchaseId: r.id,
                    amount: chunk,
                    paymentMethod: payment.paymentMethod,
                    reference: payment.reference,
                    notes: payment.notes,
                    paymentDate: payment.paymentDate ?? '',
                };
                await this.insertPurchasePaymentRow(slice);
                await this.purchaseService.updatePurchasePayment(r.id, chunk);
                left -= chunk;
            }
            await this.dbService.execute('COMMIT');
        } catch (error) {
            await this.dbService.execute('ROLLBACK');
            throw error;
        }
        await this.repersistSupplierRunningBalances();
    }

    /**
     * Recompute and persist supplier running balance after each purchase and each payment (global timeline).
     */
    public async repersistSupplierRunningBalances(): Promise<void> {
        const purchaseRows = await this.dbService.query(
            `SELECT id AS purchase_id, created_at AS event_at, supplier_id, grand_total AS gtot
             FROM purchases ORDER BY datetime(created_at) ASC, id ASC`,
        );
        const paymentRows = await this.dbService.query(
            `SELECT pp.id AS payment_id, pp.purchase_id,
                    COALESCE(pp.payment_date, pp.created_at) AS event_at,
                    p.supplier_id, pp.amount AS pamt
             FROM purchase_payments pp
             INNER JOIN purchases p ON p.id = pp.purchase_id
             ORDER BY datetime(COALESCE(pp.payment_date, pp.created_at)) ASC, pp.id ASC`,
        );

        type E = {
            kind: 'purchase' | 'payment';
            eventAt: string;
            purchaseId: number;
            paymentId?: number;
            supplierId: number;
            debit: number;
            credit: number;
            sortKey: number;
        };
        const events: E[] = [];
        (purchaseRows as any[]).forEach((r, idx) => {
            events.push({
                kind: 'purchase',
                eventAt: r.event_at,
                purchaseId: r.purchase_id,
                supplierId: r.supplier_id,
                debit: Number(r.gtot) || 0,
                credit: 0,
                sortKey: new Date(r.event_at).getTime() * 1000 + idx,
            });
        });
        (paymentRows as any[]).forEach((r, idx) => {
            events.push({
                kind: 'payment',
                eventAt: r.event_at,
                purchaseId: r.purchase_id,
                paymentId: r.payment_id,
                supplierId: r.supplier_id,
                debit: 0,
                credit: Number(r.pamt) || 0,
                sortKey: new Date(r.event_at).getTime() * 1000 + 500 + idx,
            });
        });
        events.sort((a, b) => {
            const ta = new Date(a.eventAt).getTime();
            const tb = new Date(b.eventAt).getTime();
            if (ta !== tb) return ta - tb;
            return a.sortKey - b.sortKey;
        });

        // Use SAVEPOINT so this work can run while another handler still holds an open
        // transaction (SQLite rejects nested BEGIN on the same connection).
        const sp = `sb_rep_${++this.repersistSavepointSeq}_${Date.now()}`;
        await this.dbService.execute(`SAVEPOINT ${sp}`);
        try {
            const balanceBySupplier = new Map<number, number>();
            for (const e of events) {
                const prev = balanceBySupplier.get(e.supplierId) || 0;
                const next = prev + e.debit - e.credit;
                balanceBySupplier.set(e.supplierId, next);
                const v = Math.max(0, next);
                if (e.kind === 'purchase') {
                    await this.dbService.execute(`UPDATE purchases SET supplier_balance_after = ? WHERE id = ?`, [
                        v,
                        e.purchaseId,
                    ]);
                } else if (e.paymentId != null) {
                    await this.dbService.execute(`UPDATE purchase_payments SET supplier_balance_after = ? WHERE id = ?`, [
                        v,
                        e.paymentId,
                    ]);
                }
            }
            await this.dbService.execute(`RELEASE ${sp}`);
        } catch (err) {
            await this.dbService.execute(`ROLLBACK TO ${sp}`);
            await this.dbService.execute(`RELEASE ${sp}`);
            throw err;
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

    public async getPaymentsByDateRange(fromDate: string, toDate: string, limit: number = 30, offset: number = 0): Promise<Payment[]> {
        const fromDateTime = `${fromDate} 00:00:00`;
        const toDateTime = `${toDate} 23:59:59`;
        const sql = `
      SELECT * FROM purchase_payments 
      WHERE datetime(payment_date) >= datetime(?) 
        AND datetime(payment_date) <= datetime(?)
      ORDER BY payment_date DESC
      LIMIT ? OFFSET ?
    `;
        const rows = await this.dbService.query(sql, [fromDateTime, toDateTime, limit, offset]);
        return rows.map(this.mapRowToPayment);
    }

    public async getPaymentsCountByDateRange(fromDate: string, toDate: string): Promise<number> {
        const fromDateTime = `${fromDate} 00:00:00`;
        const toDateTime = `${toDate} 23:59:59`;
        const sql = `
      SELECT COUNT(*) as count FROM purchase_payments 
      WHERE datetime(payment_date) >= datetime(?) 
        AND datetime(payment_date) <= datetime(?)
    `;
        const result = await this.dbService.queryOne(sql, [fromDateTime, toDateTime]);
        return result?.count || 0;
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
        await this.repersistSupplierRunningBalances();
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

    public async getPaymentRecords(filters: any, paginated: boolean = true): Promise<any> {
        const { supplierId, paymentMethod, periodType, fromDate, toDate, page = 1, limit = 30 } = filters;
        
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

    /**
     * Build [from, to] datetime strings for ledger / summary filters (same rules as getPaymentSummary).
     */
    private resolveLedgerDateRange(filters: {
        periodType?: string;
        fromDate?: string;
        toDate?: string;
    }): { from: string | null; to: string | null } {
        const { periodType, fromDate, toDate } = filters;
        if (!periodType || periodType === 'all') {
            return { from: null, to: null };
        }
        let from: string | null = null;
        let to: string | null = null;
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
        return { from, to };
    }

    /** Unpaid amount on a PO immediately before applying this payment (strictly prior payments only). */
    private async getPurchaseUnpaidBeforePayment(
        purchaseId: number,
        eventAt: string,
        paymentId: number,
    ): Promise<number> {
        const rows = await this.dbService.query(
            `SELECT
                (SELECT COALESCE(grand_total, 0) FROM purchases WHERE id = ?) -
                COALESCE((
                    SELECT SUM(pp.amount) FROM purchase_payments pp
                    WHERE pp.purchase_id = ?
                    AND (
                        datetime(COALESCE(pp.payment_date, pp.created_at)) < datetime(?)
                        OR (
                            datetime(COALESCE(pp.payment_date, pp.created_at)) = datetime(?)
                            AND pp.id < ?
                        )
                    )
                ), 0) AS opening`,
            [purchaseId, purchaseId, eventAt, eventAt, paymentId],
        );
        const v = (rows as any[])[0]?.opening;
        return Math.max(0, Number(v) || 0);
    }

    /**
     * Unified supplier ledger: one row per purchase (debt added) and one row per payment (debt reduced),
     * sorted newest-first, with running payable balance per supplier after each event.
     */
    public async getSupplierLedger(filters: {
        supplierId?: number;
        periodType?: string;
        fromDate?: string;
        toDate?: string;
    }): Promise<
        Array<{
            kind: 'purchase' | 'payment';
            eventAt: string;
            purchaseId: number;
            paymentId?: number;
            supplierId: number;
            supplierName: string;
            debit: number;
            credit: number;
            balanceBefore: number;
            balanceAfter: number;
            grandTotal?: number;
            paymentAmount?: number;
            remainingBalance?: number;
            poRemainingAfter: number;
            paymentMethod?: string;
            reference?: string;
            notes?: string;
        }>
    > {
        const { supplierId } = filters;
        const { from, to } = this.resolveLedgerDateRange(filters);

        let purchaseWhere = 'WHERE 1=1';
        const purchaseParams: unknown[] = [];
        if (supplierId) {
            purchaseWhere += ' AND p.supplier_id = ?';
            purchaseParams.push(supplierId);
        }
        if (from && to) {
            purchaseWhere += ' AND datetime(p.created_at) >= datetime(?) AND datetime(p.created_at) <= datetime(?)';
            purchaseParams.push(from, to);
        }

        const purchaseSql = `SELECT p.id AS purchase_id, p.created_at AS event_at, p.supplier_id, p.supplier_name,
                    p.grand_total, p.payment_amount, p.remaining_balance, p.supplier_balance_after
             FROM purchases p
             ${purchaseWhere}
             ORDER BY datetime(p.created_at) ASC, p.id ASC`;

        let paymentWhere = 'WHERE 1=1';
        const paymentParams: unknown[] = [];
        if (supplierId) {
            paymentWhere += ' AND p.supplier_id = ?';
            paymentParams.push(supplierId);
        }
        if (from && to) {
            paymentWhere +=
                ' AND datetime(COALESCE(pp.payment_date, pp.created_at)) >= datetime(?) AND datetime(COALESCE(pp.payment_date, pp.created_at)) <= datetime(?)';
            paymentParams.push(from, to);
        }

        const paymentSql = `SELECT pp.id AS payment_id, pp.purchase_id,
                    COALESCE(pp.payment_date, pp.created_at) AS event_at,
                    p.supplier_id, p.supplier_name,
                    pp.amount, pp.payment_method, pp.reference, pp.notes, pp.supplier_balance_after
             FROM purchase_payments pp
             INNER JOIN purchases p ON p.id = pp.purchase_id
             ${paymentWhere}
             ORDER BY datetime(COALESCE(pp.payment_date, pp.created_at)) ASC, pp.id ASC`;

        let purchaseRows = await this.dbService.query(purchaseSql, purchaseParams);
        let paymentRows = await this.dbService.query(paymentSql, paymentParams);

        const missingStored = (rows: any[], key: string) =>
            (rows as any[]).some(r => r[key] === null || r[key] === undefined);
        if (missingStored(purchaseRows as any[], 'supplier_balance_after') || missingStored(paymentRows as any[], 'supplier_balance_after')) {
            await this.repersistSupplierRunningBalances();
            purchaseRows = await this.dbService.query(purchaseSql, purchaseParams);
            paymentRows = await this.dbService.query(paymentSql, paymentParams);
        }

        type Ev = {
            kind: 'purchase' | 'payment';
            eventAt: string;
            purchaseId: number;
            paymentId?: number;
            supplierId: number;
            supplierName: string;
            debit: number;
            credit: number;
            grandTotal?: number;
            paymentAmount?: number;
            remainingBalance?: number;
            paymentMethod?: string;
            reference?: string;
            notes?: string;
            sortKey: number;
            storedSupplierBalanceAfter?: number;
        };

        const events: Ev[] = [];

        (purchaseRows as any[]).forEach((r, idx) => {
            const sb = r.supplier_balance_after;
            const stored =
                sb !== null && sb !== undefined && sb !== '' && Number.isFinite(Number(sb)) ? Number(sb) : undefined;
            events.push({
                kind: 'purchase',
                eventAt: r.event_at,
                purchaseId: r.purchase_id,
                supplierId: r.supplier_id,
                supplierName: r.supplier_name || '',
                debit: Number(r.grand_total) || 0,
                credit: 0,
                grandTotal: Number(r.grand_total) || 0,
                paymentAmount: Number(r.payment_amount) || 0,
                remainingBalance: Number(r.remaining_balance) || 0,
                sortKey: new Date(r.event_at).getTime() * 1000 + idx,
                storedSupplierBalanceAfter: stored,
            });
        });

        (paymentRows as any[]).forEach((r, idx) => {
            const method = r.payment_method as string;
            const sb = r.supplier_balance_after;
            const stored =
                sb !== null && sb !== undefined && sb !== '' && Number.isFinite(Number(sb)) ? Number(sb) : undefined;
            events.push({
                kind: 'payment',
                eventAt: r.event_at,
                purchaseId: r.purchase_id,
                paymentId: r.payment_id,
                supplierId: r.supplier_id,
                supplierName: r.supplier_name || '',
                debit: 0,
                credit: Number(r.amount) || 0,
                paymentMethod:
                    method === 'bank_deposit'
                        ? 'bank_transfer'
                        : method === 'cheque'
                          ? 'check'
                          : method === 'card'
                            ? 'online'
                            : method,
                reference: r.reference || undefined,
                notes: r.notes || undefined,
                sortKey: new Date(r.event_at).getTime() * 1000 + 500 + idx,
                storedSupplierBalanceAfter: stored,
            });
        });

        events.sort((a, b) => {
            const ta = new Date(a.eventAt).getTime();
            const tb = new Date(b.eventAt).getTime();
            if (ta !== tb) return ta - tb;
            return a.sortKey - b.sortKey;
        });

        const balanceBySupplier = new Map<number, number>();
        const out: Array<{
            kind: 'purchase' | 'payment';
            eventAt: string;
            purchaseId: number;
            paymentId?: number;
            supplierId: number;
            supplierName: string;
            debit: number;
            credit: number;
            balanceBefore: number;
            balanceAfter: number;
            grandTotal?: number;
            paymentAmount?: number;
            remainingBalance?: number;
            poRemainingAfter: number;
            paymentMethod?: string;
            reference?: string;
            notes?: string;
        }> = [];

        const poUnpaid = new Map<number, number>();
        const openingCache = new Map<string, number>();

        for (const e of events) {
            let poRemainingAfter = 0;
            if (e.kind === 'purchase') {
                const gt = Number(e.grandTotal) || 0;
                poUnpaid.set(e.purchaseId, gt);
                poRemainingAfter = gt;
            } else {
                let u = poUnpaid.get(e.purchaseId);
                if (u === undefined && e.paymentId != null) {
                    const cacheKey = `${e.purchaseId}|${e.paymentId}`;
                    if (!openingCache.has(cacheKey)) {
                        openingCache.set(
                            cacheKey,
                            await this.getPurchaseUnpaidBeforePayment(e.purchaseId, e.eventAt, e.paymentId),
                        );
                    }
                    u = openingCache.get(cacheKey)!;
                    poUnpaid.set(e.purchaseId, u);
                }
                u = poUnpaid.get(e.purchaseId) ?? 0;
                const nextPo = Math.max(0, u - (Number(e.credit) || 0));
                poUnpaid.set(e.purchaseId, nextPo);
                poRemainingAfter = nextPo;
            }

            let balanceBefore: number;
            let balanceAfter: number;
            const stored = e.storedSupplierBalanceAfter;
            if (stored !== undefined && Number.isFinite(stored)) {
                balanceAfter = Math.max(0, stored);
                balanceBefore = Math.max(0, balanceAfter - e.debit + e.credit);
                balanceBySupplier.set(e.supplierId, balanceAfter);
            } else {
                const prev = balanceBySupplier.get(e.supplierId) || 0;
                balanceBefore = prev;
                const next = prev + e.debit - e.credit;
                balanceBySupplier.set(e.supplierId, next);
                balanceAfter = Math.max(0, next);
            }
            out.push({
                kind: e.kind,
                eventAt: e.eventAt,
                purchaseId: e.purchaseId,
                paymentId: e.paymentId,
                supplierId: e.supplierId,
                supplierName: e.supplierName,
                debit: e.debit,
                credit: e.credit,
                balanceBefore,
                balanceAfter,
                grandTotal: e.grandTotal,
                paymentAmount: e.paymentAmount,
                remainingBalance: e.remainingBalance,
                poRemainingAfter,
                paymentMethod: e.paymentMethod,
                reference: e.reference,
                notes: e.notes,
            });
        }

        out.reverse();
        return out;
    }
}

export default PaymentService;
