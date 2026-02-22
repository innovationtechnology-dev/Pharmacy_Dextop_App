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
