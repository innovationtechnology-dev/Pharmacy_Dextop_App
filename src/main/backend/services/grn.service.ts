import { getDatabaseService } from './database.service';
import PurchaseService from './purchase.service';

export interface GRNItemInput {
    purchaseItemId?: number; // Optional - will be looked up if not provided
    medicineId: number;
    medicineName: string;
    orderedQuantity: number; // Packets ordered
    receivedQuantity: number; // Packets actually received
    damagedQuantity: number; // Packets damaged
    batchNumber?: string;
    expiryDate: string;
    notes?: string;
}

export interface GRNItem extends GRNItemInput {
    id?: number;
    grnId?: number;
    acceptedQuantity: number; // receivedQuantity - damagedQuantity
}

export interface GRN {
    id?: number;
    purchaseId: number;
    purchaseOrderNumber: string;
    supplierId: number;
    supplierName: string;
    items: GRNItem[];
    totalOrdered: number;
    totalReceived: number;
    totalDamaged: number;
    totalAccepted: number;
    receivedBy: string;
    notes?: string;
    createdAt?: string;
}

export class GRNService {
    private dbService = getDatabaseService();
    private purchaseService: PurchaseService;

    constructor() {
        this.purchaseService = new PurchaseService();
    }

    public async initializeTable(): Promise<void> {
        try {
            // Check if tables exist and drop them if they have incompatible schema
            const tables = await this.dbService.query(`
                SELECT name FROM sqlite_master WHERE type='table' AND name IN ('goods_received_notes', 'grn_items')
            `);

            if (tables.length > 0) {
                // Drop existing tables to ensure clean schema
                await this.dbService.execute('DROP TABLE IF EXISTS grn_items');
                await this.dbService.execute('DROP TABLE IF EXISTS goods_received_notes');
            }
        } catch (error) {
            console.log('GRN table cleanup:', error);
        }

        await this.dbService.execute(`
      CREATE TABLE IF NOT EXISTS goods_received_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_id INTEGER NOT NULL,
        purchase_order_number TEXT NOT NULL,
        supplier_id INTEGER NOT NULL,
        supplier_name TEXT NOT NULL,
        total_ordered INTEGER NOT NULL,
        total_received INTEGER NOT NULL,
        total_damaged INTEGER NOT NULL,
        total_accepted INTEGER NOT NULL,
        received_by TEXT NOT NULL,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

        await this.dbService.execute(`
      CREATE TABLE IF NOT EXISTS grn_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        grn_id INTEGER NOT NULL,
        purchase_item_id INTEGER NOT NULL,
        medicine_id INTEGER NOT NULL,
        medicine_name TEXT NOT NULL,
        ordered_quantity INTEGER NOT NULL,
        received_quantity INTEGER NOT NULL,
        damaged_quantity INTEGER NOT NULL,
        accepted_quantity INTEGER NOT NULL,
        batch_number TEXT,
        expiry_date TEXT NOT NULL,
        notes TEXT
      )
    `);

        try {
            await this.dbService.execute(`
          CREATE INDEX IF NOT EXISTS idx_grn_purchase_id ON goods_received_notes(purchase_id)
        `);
        } catch (error) {
            console.log('GRN index creation (purchase_id):', error);
        }

        try {
            await this.dbService.execute(`
          CREATE INDEX IF NOT EXISTS idx_grn_items_grn_id ON grn_items(grn_id)
        `);
        } catch (error) {
            console.log('GRN index creation (grn_id):', error);
        }

        try {
            await this.dbService.execute(`
          CREATE INDEX IF NOT EXISTS idx_grn_items_purchase_item_id ON grn_items(purchase_item_id)
        `);
        } catch (error) {
            console.log('GRN index creation (purchase_item_id):', error);
        }
    }

    /**
     * Create a new GRN and update purchase items with batch numbers and actual received quantities
     */
    public async createGRN(grn: Omit<GRN, 'id' | 'createdAt' | 'totalOrdered' | 'totalReceived' | 'totalDamaged' | 'totalAccepted'> & {
        items: GRNItemInput[];
    }): Promise<number> {
        if (!grn.items || grn.items.length === 0) {
            throw new Error('At least one item must be included in a GRN.');
        }

        // Verify purchase exists
        const purchase = await this.purchaseService.getPurchaseById(grn.purchaseId);
        if (!purchase) {
            throw new Error(`Purchase with ID ${grn.purchaseId} not found`);
        }

        // Calculate totals
        const totalOrdered = grn.items.reduce((sum, item) => sum + item.orderedQuantity, 0);
        const totalReceived = grn.items.reduce((sum, item) => sum + item.receivedQuantity, 0);
        const totalDamaged = grn.items.reduce((sum, item) => sum + item.damagedQuantity, 0);
        const totalAccepted = grn.items.reduce((sum, item) => sum + (item.receivedQuantity - item.damagedQuantity), 0);

        // Validate quantities
        for (const item of grn.items) {
            if (item.receivedQuantity < 0 || item.damagedQuantity < 0) {
                throw new Error('Received and damaged quantities cannot be negative');
            }
            if (item.damagedQuantity > item.receivedQuantity) {
                throw new Error(`Damaged quantity cannot exceed received quantity for ${item.medicineName}`);
            }
        }

        await this.dbService.execute('BEGIN TRANSACTION');
        try {
            // Insert GRN record
            const insertGRNSql = `
        INSERT INTO goods_received_notes (
          purchase_id,
          purchase_order_number,
          supplier_id,
          supplier_name,
          total_ordered,
          total_received,
          total_damaged,
          total_accepted,
          received_by,
          notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
            const grnResult = await this.dbService.execute(insertGRNSql, [
                grn.purchaseId,
                grn.purchaseOrderNumber,
                grn.supplierId,
                grn.supplierName,
                totalOrdered,
                totalReceived,
                totalDamaged,
                totalAccepted,
                grn.receivedBy,
                grn.notes || null,
            ]);
            const grnId = (grnResult as any).lastID;

            // Insert GRN items and update purchase items
            for (const item of grn.items) {
                const acceptedQuantity = item.receivedQuantity - item.damagedQuantity;

                // Look up purchase_item_id if not provided
                let purchaseItemId = item.purchaseItemId;
                if (!purchaseItemId) {
                    const purchaseItem = await this.dbService.queryOne(
                        'SELECT id FROM purchase_items WHERE purchase_id = ? AND medicine_id = ?',
                        [grn.purchaseId, item.medicineId]
                    );
                    if (!purchaseItem) {
                        throw new Error(`Purchase item not found for medicine ${item.medicineName} in purchase ${grn.purchaseId}`);
                    }
                    purchaseItemId = purchaseItem.id;
                }

                // Insert GRN item
                const insertItemSql = `
          INSERT INTO grn_items (
            grn_id,
            purchase_item_id,
            medicine_id,
            medicine_name,
            ordered_quantity,
            received_quantity,
            damaged_quantity,
            accepted_quantity,
            batch_number,
            expiry_date,
            notes
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
                await this.dbService.execute(insertItemSql, [
                    grnId,
                    purchaseItemId,
                    item.medicineId,
                    item.medicineName,
                    item.orderedQuantity,
                    item.receivedQuantity,
                    item.damagedQuantity,
                    acceptedQuantity,
                    item.batchNumber || null,
                    item.expiryDate,
                    item.notes || null,
                ]);

                // Update purchase item with batch number and adjust quantities
                // Only the accepted quantity becomes available for sale
                const updatePurchaseItemSql = `
          UPDATE purchase_items 
          SET batch_number = ?,
              expiry_date = ?,
              packet_quantity = ?,
              total_pills = packet_quantity * pills_per_packet,
              available_pills = packet_quantity * pills_per_packet
          WHERE id = ?
        `;
                await this.dbService.execute(updatePurchaseItemSql, [
                    item.batchNumber || null,
                    item.expiryDate,
                    acceptedQuantity, // Update to accepted quantity (received - damaged)
                    purchaseItemId,
                ]);
            }

            // Update purchase status to 'received'
            await this.dbService.execute(
                `UPDATE purchases SET status = 'received' WHERE id = ?`,
                [grn.purchaseId]
            );

            await this.dbService.execute('COMMIT');
            return grnId;
        } catch (error) {
            await this.dbService.execute('ROLLBACK');
            throw error;
        }
    }

    /**
     * Get GRN by ID
     */
    public async getGRNById(id: number): Promise<GRN | null> {
        const grn = await this.dbService.queryOne(
            'SELECT * FROM goods_received_notes WHERE id = ?',
            [id]
        );
        if (!grn) return null;

        const items = await this.dbService.query(
            'SELECT * FROM grn_items WHERE grn_id = ?',
            [id]
        );

        return {
            id: grn.id,
            purchaseId: grn.purchase_id,
            purchaseOrderNumber: grn.purchase_order_number,
            supplierId: grn.supplier_id,
            supplierName: grn.supplier_name,
            totalOrdered: grn.total_ordered,
            totalReceived: grn.total_received,
            totalDamaged: grn.total_damaged,
            totalAccepted: grn.total_accepted,
            receivedBy: grn.received_by,
            notes: grn.notes,
            createdAt: grn.created_at,
            items: items.map((item: any) => ({
                id: item.id,
                grnId: item.grn_id,
                purchaseItemId: item.purchase_item_id,
                medicineId: item.medicine_id,
                medicineName: item.medicine_name,
                orderedQuantity: item.ordered_quantity,
                receivedQuantity: item.received_quantity,
                damagedQuantity: item.damaged_quantity,
                acceptedQuantity: item.accepted_quantity,
                batchNumber: item.batch_number,
                expiryDate: item.expiry_date,
                notes: item.notes,
            })),
        };
    }

    /**
     * Get GRN by purchase ID
     */
    public async getGRNByPurchaseId(purchaseId: number): Promise<GRN | null> {
        const grn = await this.dbService.queryOne(
            'SELECT * FROM goods_received_notes WHERE purchase_id = ?',
            [purchaseId]
        );
        if (!grn) return null;

        return this.getGRNById(grn.id);
    }

    /**
     * Get all GRNs
     */
    public async getAllGRNs(): Promise<GRN[]> {
        const grns = await this.dbService.query(
            'SELECT * FROM goods_received_notes ORDER BY created_at DESC'
        );

        const result: GRN[] = [];
        for (const grn of grns) {
            const fullGRN = await this.getGRNById(grn.id);
            if (fullGRN) {
                result.push(fullGRN);
            }
        }

        return result;
    }

    /**
     * Get GRNs by date range
     */
    public async getGRNsByDateRange(fromDate: string, toDate: string): Promise<GRN[]> {
        const fromDateTime = `${fromDate} 00:00:00`;
        const toDateTime = `${toDate} 23:59:59`;

        const grns = await this.dbService.query(
            `SELECT * FROM goods_received_notes 
       WHERE datetime(created_at) >= datetime(?) 
         AND datetime(created_at) <= datetime(?)
       ORDER BY created_at DESC`,
            [fromDateTime, toDateTime]
        );

        const result: GRN[] = [];
        for (const grn of grns) {
            const fullGRN = await this.getGRNById(grn.id);
            if (fullGRN) {
                result.push(fullGRN);
            }
        }

        return result;
    }

    /**
     * Check if a purchase has a GRN
     */
    public async purchaseHasGRN(purchaseId: number): Promise<boolean> {
        const grn = await this.dbService.queryOne(
            'SELECT id FROM goods_received_notes WHERE purchase_id = ?',
            [purchaseId]
        );
        return !!grn;
    }
}

export default GRNService;
