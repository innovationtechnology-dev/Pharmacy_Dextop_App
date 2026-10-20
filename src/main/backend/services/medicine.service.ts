import { getDatabaseService } from './database.service';
import { repairMedicineForeignKeyReferences } from '../database/medicine-fk-repair';
import {
  buildBarcodeLookupCandidates,
  escapeSqlLikePattern,
  extractGtin,
  normalizeScannedBarcode,
} from '../../../common/barcodeLookup';

export type MedicineStatus = 'active' | 'inactive' | 'discontinued';

export interface Medicine {
  id?: number;
  barcode?: string;
  name: string;
  pillQuantity: number;
  status: MedicineStatus;
  manufacturer?: string;
  brandName?: string;
  minimumStockLevel?: number;
}

export interface MedicineWithInventory extends Medicine {
  totalAvailablePills: number;
  sellablePills: number;
  normalExpiryPills: number;
  nearExpiryPills: number;
  criticalExpiryPills: number;
  nextExpiryDate?: string | null;
  averageSellablePricePerPill?: number | null;
  manufacturer?: string;
  brandName?: string;
  minimumStockLevel: number;
  /** True if any purchase, sale, or return line references this medicine (name/barcode edits blocked). */
  hasTransactionHistory: boolean;
}

export interface LowStockAlert {
  id: number;
  name: string;
  barcode?: string;
  sellablePills: number;
  minimumStockLevel: number;
  deficit: number;
}

export interface ExpiringMedicineAlert {
  id: number;
  name: string;
  barcode?: string;
  nextExpiryDate: string;
  availablePills: number;
  daysUntilExpiry: number;
}

// Tier model (days before expiry)
// - Normal: > 30 days
// - Near: 30 -> 7 days
// - Critical: 7 -> 0 days
// - Expired: < 0 days (not eligible to sell)
const UNEXPIRED_THRESHOLD_EXPRESSION = `date('now')`;
const CRITICAL_THRESHOLD_DAYS = 7;
const NEAR_THRESHOLD_DAYS = 30;
const CRITICAL_THRESHOLD_EXPRESSION = `date('now', '+${CRITICAL_THRESHOLD_DAYS} days')`;
const NEAR_THRESHOLD_EXPRESSION = `date('now', '+${NEAR_THRESHOLD_DAYS} days')`;

export class MedicineService {
  private dbService = getDatabaseService();

  // Short-lived cache so rapid repeat scans of the same barcode skip the DB entirely.
  private readonly barcodeScanCache = new Map<
    string,
    { result: MedicineWithInventory | null; expiresAt: number }
  >();
  private readonly BARCODE_CACHE_TTL_MS = 30_000;

  /**
   * Initialize medicines table and enforce the required schema.
   */
  public async initializeTable(): Promise<void> {
    const tableInfo = await this.dbService.query(`PRAGMA table_info(medicines)`);
    const hasTable = Array.isArray(tableInfo) && tableInfo.length > 0;
    const columnNames = new Set(
      hasTable ? tableInfo.map((column: any) => column.name) : []
    );
    const hasPillQuantity = columnNames.has('pill_quantity');

    // Renaming `medicines` → `medicines_legacy` makes SQLite repoint child FKs to
    // `medicines_legacy`. Dropping that table without rebuilding children causes
    // "no such table: medicines_legacy" on purchase/sale rows.
    // Only do the destructive rename for truly old schemas that lack pill_quantity.
    const legacyTableExists = await this.dbService.queryOne(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='medicines_legacy'`
    );

    const needsLegacyTableMigration =
      hasTable && !legacyTableExists && !hasPillQuantity;

    if (needsLegacyTableMigration) {
      await this.dbService.execute('ALTER TABLE medicines RENAME TO medicines_legacy');
    } else if (legacyTableExists) {
      console.log(
        '⚠️  medicines_legacy table present; skipping medicines rename (avoid duplicate migration).'
      );
    }

    await this.dbService.execute(`
      CREATE TABLE IF NOT EXISTS medicines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        barcode TEXT UNIQUE,
        name TEXT NOT NULL,
        pill_quantity INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','discontinued')),
        manufacturer TEXT,
        brand_name TEXT,
        minimum_stock_level INTEGER NOT NULL DEFAULT 0
      )
    `);

    // Safe migration: add new columns to existing tables if they don't exist
    const medicinesInfo = await this.dbService.query(`PRAGMA table_info(medicines)`);
    if (!medicinesInfo.some((col: any) => col.name === 'manufacturer')) {
      await this.dbService.execute(`ALTER TABLE medicines ADD COLUMN manufacturer TEXT`);
    }
    if (!medicinesInfo.some((col: any) => col.name === 'brand_name')) {
      await this.dbService.execute(`ALTER TABLE medicines ADD COLUMN brand_name TEXT`);
    }
    if (!medicinesInfo.some((col: any) => col.name === 'minimum_stock_level')) {
      await this.dbService.execute(`ALTER TABLE medicines ADD COLUMN minimum_stock_level INTEGER NOT NULL DEFAULT 0`);
    }
    // gtin: product identity extracted from the barcode (GS1 AI 01). The full scanned string
    // also carries batch/expiry/serial, which change per batch, so lookups must use this.
    if (!medicinesInfo.some((col: any) => col.name === 'gtin')) {
      await this.dbService.execute(`ALTER TABLE medicines ADD COLUMN gtin TEXT`);
    }
    await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_medicines_gtin ON medicines(gtin)
    `);

    await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_medicines_barcode ON medicines(barcode)
    `);
    
    // Add index for name searches (improves search performance)
    await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_medicines_name ON medicines(name)
    `);
    
    // Add index for status filtering
    await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_medicines_status ON medicines(status)
    `);

    // Copy data from medicines_legacy into the new medicines table (only after rename)
    if (needsLegacyTableMigration) {
      const legacyInfo = tableInfo;
      const hasLegacyPillQuantity = legacyInfo.some(
        (column: any) => column.name === 'pill_quantity'
      );
      const hasLegacyQuantity = legacyInfo.some(
        (column: any) => column.name === 'quantity'
      );
      const pillSourceExpression = hasLegacyPillQuantity
        ? 'COALESCE(pill_quantity, 0)'
        : hasLegacyQuantity
          ? 'COALESCE(quantity, 0)'
          : '0';

      await this.dbService.execute(`
        INSERT INTO medicines (id, barcode, name, pill_quantity, status)
        SELECT 
          id,
          barcode,
          name,
          ${pillSourceExpression},
          'active'
        FROM medicines_legacy
      `);

      await this.dbService.execute('PRAGMA foreign_keys = OFF');
      await this.dbService.execute('DROP TABLE IF EXISTS medicines_legacy');
      await this.dbService.execute('PRAGMA foreign_keys = ON');
    }

    await this.backfillMedicineGtins();

    // Fix child tables that still reference dropped medicines_legacy (one-time repair)
    await repairMedicineForeignKeyReferences(this.dbService);

    // --- stock_batches: single source of truth for live inventory ---
    await this.dbService.execute(`
      CREATE TABLE IF NOT EXISTS stock_batches (
        id                    INTEGER PRIMARY KEY AUTOINCREMENT,
        medicine_id           INTEGER NOT NULL,
        purchase_item_id      INTEGER,
        batch_number          TEXT,
        expiry_date           TEXT NOT NULL,
        qty_received          INTEGER NOT NULL,
        qty_remaining         INTEGER NOT NULL,
        cost_price_per_pill   REAL NOT NULL DEFAULT 0,
        selling_price_per_pill REAL NOT NULL DEFAULT 0,
        created_at            DATETIME DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (medicine_id) REFERENCES medicines(id),
        FOREIGN KEY (purchase_item_id) REFERENCES purchase_items(id) ON DELETE SET NULL
      )
    `);

    await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_stock_batches_medicine_id ON stock_batches(medicine_id)
    `);
    await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_stock_batches_expiry_date ON stock_batches(expiry_date)
    `);
    await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_stock_batches_purchase_item_id ON stock_batches(purchase_item_id)
    `);

    // Composite index: speeds up the GROUP BY aggregation in baseInventorySelect when
    // filtering by a single medicine_id (covers the JOIN + expiry_date CASE WHEN columns).
    await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_stock_batches_medicine_expiry
      ON stock_batches(medicine_id, expiry_date, qty_remaining)
    `);

    // --- sale_item_batches: audit trail of which batch supplied each sale item ---
    await this.dbService.execute(`
      CREATE TABLE IF NOT EXISTS sale_item_batches (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_item_id   INTEGER NOT NULL,
        stock_batch_id INTEGER NOT NULL,
        qty_deducted   INTEGER NOT NULL,
        FOREIGN KEY (sale_item_id) REFERENCES sale_items(id) ON DELETE CASCADE,
        FOREIGN KEY (stock_batch_id) REFERENCES stock_batches(id)
      )
    `);

    await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_sale_item_batches_sale_item_id ON sale_item_batches(sale_item_id)
    `);
    await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_sale_item_batches_stock_batch_id ON sale_item_batches(stock_batch_id)
    `);

    // --- return_item_batches: audit trail of which batch received returned pills ---
    await this.dbService.execute(`
      CREATE TABLE IF NOT EXISTS return_item_batches (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_return_item_id INTEGER NOT NULL,
        stock_batch_id      INTEGER NOT NULL,
        qty_restored        INTEGER NOT NULL,
        FOREIGN KEY (sale_return_item_id) REFERENCES sale_return_items(id) ON DELETE CASCADE,
        FOREIGN KEY (stock_batch_id) REFERENCES stock_batches(id)
      )
    `);

    await this.dbService.execute(`
      CREATE INDEX IF NOT EXISTS idx_return_item_batches_sale_return_item_id ON return_item_batches(sale_return_item_id)
    `);

    // --- Idempotent migration: populate stock_batches from existing purchase_items ---
    // Only runs once on first launch after this schema upgrade.
    // This runs before PurchaseService.initializeTables, so purchase_items may not exist yet
    // (fresh DB) or may lack selling_price_per_pill (old DB) — inspect the schema first.
    const purchaseItemsInfo = await this.dbService.query(`PRAGMA table_info(purchase_items)`);
    if (purchaseItemsInfo.length === 0) return;
    const hasPiSellingPrice = purchaseItemsInfo.some(
      (col: any) => col.name === 'selling_price_per_pill'
    );
    const piSellingPriceCase = hasPiSellingPrice
      ? 'WHEN pi.selling_price_per_pill > 0 THEN pi.selling_price_per_pill'
      : '';

    const stockBatchCount = await this.dbService.queryOne(
      `SELECT COUNT(*) as cnt FROM stock_batches`
    );
    const purchaseItemCount = await this.dbService.queryOne(
      `SELECT COUNT(*) as cnt FROM purchase_items`
    );
    if ((stockBatchCount?.cnt ?? 0) === 0 && (purchaseItemCount?.cnt ?? 0) > 0) {
      await this.dbService.execute(`
        INSERT INTO stock_batches (
          medicine_id,
          purchase_item_id,
          batch_number,
          expiry_date,
          qty_received,
          qty_remaining,
          cost_price_per_pill,
          selling_price_per_pill,
          created_at
        )
        SELECT
          pi.medicine_id,
          pi.id,
          pi.batch_number,
          pi.expiry_date,
          pi.total_pills,
          pi.available_pills,
          pi.price_per_pill,
          CASE
            ${piSellingPriceCase}
            WHEN pi.pills_per_packet > 0 THEN (pi.price_per_packet * 1.0 / pi.pills_per_packet)
            ELSE pi.price_per_pill
          END,
          datetime('now','localtime')
        FROM purchase_items pi
      `);
      console.log('[stock_batches] Migration complete: populated from purchase_items.');
    }

    // Patch any stock_batches rows with selling_price_per_pill = 0 (back-fill from purchase_items)
    await this.dbService.execute(`
      UPDATE stock_batches
      SET selling_price_per_pill = (
        SELECT CASE
          WHEN pi.pills_per_packet > 0 THEN (pi.price_per_packet * 1.0 / pi.pills_per_packet)
          ELSE stock_batches.cost_price_per_pill
        END
        FROM purchase_items pi
        WHERE pi.id = stock_batches.purchase_item_id
      )
      WHERE selling_price_per_pill = 0
        AND purchase_item_id IS NOT NULL
    `);
  }

  /**
   * Base SELECT with aggregated inventory details — used for single-medicine lookups.
   * Uses correlated subqueries which are O(log n) against indexed medicine_id for one row.
   * Stock data comes from stock_batches (qty_remaining), not purchase_items.available_pills.
   */
  private get baseInventorySelect(): string {
    return `
      SELECT
        m.id,
        m.name,
        m.barcode,
        m.pill_quantity,
        m.status,
        m.manufacturer,
        m.brand_name,
        COALESCE(m.minimum_stock_level, 0) AS minimum_stock_level,
        CASE
          WHEN EXISTS (SELECT 1 FROM purchase_items WHERE medicine_id = m.id LIMIT 1)
            OR EXISTS (SELECT 1 FROM sale_items WHERE medicine_id = m.id LIMIT 1)
            OR EXISTS (SELECT 1 FROM sale_return_items WHERE medicine_id = m.id LIMIT 1)
          THEN 1 ELSE 0
        END AS has_transaction_history,
        COALESCE(SUM(sb.qty_remaining), 0) AS total_available_pills,
        COALESCE(
          SUM(CASE WHEN date(sb.expiry_date) >= ${UNEXPIRED_THRESHOLD_EXPRESSION} THEN sb.qty_remaining ELSE 0 END),
          0
        ) AS sellable_pills,
        COALESCE(
          SUM(CASE WHEN date(sb.expiry_date) >= ${NEAR_THRESHOLD_EXPRESSION} THEN sb.qty_remaining ELSE 0 END),
          0
        ) AS normal_expiry_pills,
        COALESCE(
          SUM(CASE WHEN date(sb.expiry_date) >= ${CRITICAL_THRESHOLD_EXPRESSION}
                   AND date(sb.expiry_date) < ${NEAR_THRESHOLD_EXPRESSION}
                   THEN sb.qty_remaining ELSE 0 END),
          0
        ) AS near_expiry_pills,
        COALESCE(
          SUM(CASE WHEN date(sb.expiry_date) >= ${UNEXPIRED_THRESHOLD_EXPRESSION}
                   AND date(sb.expiry_date) < ${CRITICAL_THRESHOLD_EXPRESSION}
                   THEN sb.qty_remaining ELSE 0 END),
          0
        ) AS critical_expiry_pills,
        MIN(CASE WHEN date(sb.expiry_date) >= ${UNEXPIRED_THRESHOLD_EXPRESSION} AND sb.qty_remaining > 0
                 THEN date(sb.expiry_date) ELSE NULL END) AS next_expiry_date,
        (
          SELECT CASE
            WHEN sb2.selling_price_per_pill > 0 THEN sb2.selling_price_per_pill
            WHEN pi2.pills_per_packet > 0 THEN (pi2.price_per_packet * 1.0 / pi2.pills_per_packet)
            ELSE sb2.cost_price_per_pill
          END
          FROM stock_batches sb2
          LEFT JOIN purchase_items pi2 ON pi2.id = sb2.purchase_item_id
          WHERE sb2.medicine_id = m.id
            AND date(sb2.expiry_date) >= ${UNEXPIRED_THRESHOLD_EXPRESSION}
            AND sb2.qty_remaining > 0
          ORDER BY date(sb2.expiry_date) ASC, sb2.id ASC
          LIMIT 1
        ) AS avg_sellable_price_per_pill
      FROM medicines m
      LEFT JOIN stock_batches sb ON sb.medicine_id = m.id
    `;
  }

  /**
   * CTE-based bulk inventory SELECT — used for multi-row queries (getAllMedicines, searchMedicines).
   * Replaces 4 correlated subqueries per row with two pre-computed CTEs joined once,
   * dropping complexity from O(N×queries) to a single pass over the data.
   */
  private get cteInventorySelect(): string {
    return `
      WITH txn_medicines AS (
        SELECT medicine_id AS id FROM purchase_items
        UNION
        SELECT medicine_id AS id FROM sale_items
        UNION
        SELECT medicine_id AS id FROM sale_return_items
      ),
      fefo_prices AS (
        SELECT
          sb.medicine_id,
          CASE
            WHEN sb.selling_price_per_pill > 0 THEN sb.selling_price_per_pill
            WHEN pi.pills_per_packet > 0 THEN (pi.price_per_packet * 1.0 / pi.pills_per_packet)
            ELSE sb.cost_price_per_pill
          END AS price,
          ROW_NUMBER() OVER (
            PARTITION BY sb.medicine_id
            ORDER BY date(sb.expiry_date) ASC, sb.id ASC
          ) AS rn
        FROM stock_batches sb
        LEFT JOIN purchase_items pi ON pi.id = sb.purchase_item_id
        WHERE date(sb.expiry_date) >= ${UNEXPIRED_THRESHOLD_EXPRESSION}
          AND sb.qty_remaining > 0
      )
      SELECT
        m.id,
        m.name,
        m.barcode,
        m.pill_quantity,
        m.status,
        m.manufacturer,
        m.brand_name,
        COALESCE(m.minimum_stock_level, 0) AS minimum_stock_level,
        CASE WHEN tm.id IS NOT NULL THEN 1 ELSE 0 END AS has_transaction_history,
        COALESCE(SUM(sb.qty_remaining), 0) AS total_available_pills,
        COALESCE(SUM(CASE WHEN date(sb.expiry_date) >= ${UNEXPIRED_THRESHOLD_EXPRESSION} THEN sb.qty_remaining ELSE 0 END), 0) AS sellable_pills,
        COALESCE(SUM(CASE WHEN date(sb.expiry_date) >= ${NEAR_THRESHOLD_EXPRESSION} THEN sb.qty_remaining ELSE 0 END), 0) AS normal_expiry_pills,
        COALESCE(SUM(CASE WHEN date(sb.expiry_date) >= ${CRITICAL_THRESHOLD_EXPRESSION} AND date(sb.expiry_date) < ${NEAR_THRESHOLD_EXPRESSION} THEN sb.qty_remaining ELSE 0 END), 0) AS near_expiry_pills,
        COALESCE(SUM(CASE WHEN date(sb.expiry_date) >= ${UNEXPIRED_THRESHOLD_EXPRESSION} AND date(sb.expiry_date) < ${CRITICAL_THRESHOLD_EXPRESSION} THEN sb.qty_remaining ELSE 0 END), 0) AS critical_expiry_pills,
        MIN(CASE WHEN date(sb.expiry_date) >= ${UNEXPIRED_THRESHOLD_EXPRESSION} AND sb.qty_remaining > 0 THEN date(sb.expiry_date) ELSE NULL END) AS next_expiry_date,
        fp.price AS avg_sellable_price_per_pill
      FROM medicines m
      LEFT JOIN stock_batches sb ON sb.medicine_id = m.id
      LEFT JOIN txn_medicines tm ON tm.id = m.id
      LEFT JOIN (SELECT medicine_id, price FROM fefo_prices WHERE rn = 1) fp ON fp.medicine_id = m.id
    `;
  }

  private mapRowToMedicine(row: any): MedicineWithInventory {
    return {
      id: row.id,
      name: row.name,
      barcode: row.barcode || undefined,
      pillQuantity: row.pill_quantity,
      status: row.status as MedicineStatus,
      manufacturer: row.manufacturer || undefined,
      brandName: row.brand_name || undefined,
      minimumStockLevel: row.minimum_stock_level ?? 0,
      hasTransactionHistory: Boolean(row.has_transaction_history),
      totalAvailablePills: row.total_available_pills ?? 0,
      sellablePills: row.sellable_pills ?? 0,
      normalExpiryPills: row.normal_expiry_pills ?? 0,
      nearExpiryPills: row.near_expiry_pills ?? 0,
      criticalExpiryPills: row.critical_expiry_pills ?? 0,
      nextExpiryDate: row.next_expiry_date || null,
      averageSellablePricePerPill: row.avg_sellable_price_per_pill || null,
    };
  }

  /**
   * Get all medicines with aggregated inventory information.
   * @param limit - Optional maximum number of records to return.
   * @param offset - Number of records to skip (default: 0)
   */
  public async getAllMedicines(
    limit?: number,
    offset: number = 0
  ): Promise<MedicineWithInventory[]> {
    const hasPagination = typeof limit === 'number' && Number.isFinite(limit) && limit > 0;
    const sql = `
      ${this.cteInventorySelect}
      GROUP BY m.id
      ORDER BY m.name ASC
      ${hasPagination ? 'LIMIT ? OFFSET ?' : ''}
    `;
    const rows = await this.dbService.query(sql, hasPagination ? [limit, offset] : []);
    return rows.map((row) => this.mapRowToMedicine(row));
  }

  /**
   * Get total count of medicines.
   */
  public async getMedicinesCount(): Promise<number> {
    const sql = 'SELECT COUNT(*) as count FROM medicines';
    const result = await this.dbService.queryOne(sql);
    return result?.count || 0;
  }

  /**
   * Get medicine by barcode (includes inventory aggregates).
   *
   * Performance strategy — two phases:
   *   Phase 1: lightweight `SELECT id` queries (no JOINs, no aggregation) to resolve
   *            barcode → medicine_id using the barcode index.
   *   Phase 2: single `getMedicineById` call (PK lookup) to fetch the full inventory row.
   *
   * This replaces the old approach that ran the full heavy baseInventorySelect (with
   * JOINs, aggregation, correlated subqueries) up to 4 times per scan.
   * Results are also cached for BARCODE_CACHE_TTL_MS to absorb rapid repeat scans.
   */
  public async getMedicineByBarcode(barcode: string): Promise<MedicineWithInventory | null> {
    const primary = normalizeScannedBarcode(barcode);
    if (!primary) return null;

    // Cache hit — skip DB entirely for repeated scans of the same barcode.
    const cacheKey = primary.toLowerCase();
    const cached = this.barcodeScanCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    const candidates = buildBarcodeLookupCandidates(barcode);
    let medicineId: number | null = null;

    // Phase 0: GTIN match — same product regardless of batch, expiry or serial in the scan.
    const gtin = extractGtin(barcode);
    if (gtin) {
      const row = await this.dbService.queryOne(
        `SELECT id FROM medicines WHERE gtin = ? ORDER BY id LIMIT 1`,
        [gtin]
      );
      if (row) medicineId = row.id;
    }

    // Phase 1a: exact match — all candidates in one IN clause, uses idx_medicines_barcode.
    if (candidates.length > 0 && medicineId === null) {
      const placeholders = candidates.map(() => '?').join(', ');
      const row = await this.dbService.queryOne(
        `SELECT id FROM medicines WHERE barcode IN (${placeholders}) LIMIT 1`,
        candidates
      );
      if (row) medicineId = row.id;
    }

    // Phase 1b: case-insensitive exact — still just an id lookup, no JOINs.
    if (medicineId === null && candidates.length > 0) {
      const placeholders = candidates.map(() => 'LOWER(TRIM(?))').join(', ');
      const row = await this.dbService.queryOne(
        `SELECT id FROM medicines WHERE barcode IS NOT NULL AND LOWER(TRIM(barcode)) IN (${placeholders}) LIMIT 1`,
        candidates
      );
      if (row) medicineId = row.id;
    }

    // Phase 1c: LIKE fuzzy — for long GS1 / DataMatrix codes.
    if (medicineId === null && primary.length >= 8) {
      const esc = escapeSqlLikePattern(primary);
      const row = await this.dbService.queryOne(
        `SELECT id FROM medicines WHERE barcode IS NOT NULL AND barcode != '' AND barcode LIKE ? ESCAPE '\\' ORDER BY LENGTH(TRIM(barcode)) DESC LIMIT 1`,
        [`%${esc}%`]
      );
      if (row) medicineId = row.id;
    }

    // Phase 1d: reverse LIKE — stored barcode is a substring of the scanned value.
    if (medicineId === null) {
      const row = await this.dbService.queryOne(
        `SELECT id FROM medicines WHERE barcode IS NOT NULL AND LENGTH(TRIM(barcode)) >= 8 AND ? LIKE ('%' || barcode || '%') ORDER BY LENGTH(TRIM(barcode)) DESC LIMIT 1`,
        [primary]
      );
      if (row) medicineId = row.id;
    }

    // Phase 2: single PK-filtered inventory query (O(1) medicine lookup via rowid).
    const result = medicineId !== null ? await this.getMedicineById(medicineId) : null;

    // Evict stale entries lazily to prevent unbounded memory growth.
    if (this.barcodeScanCache.size > 500) {
      const now = Date.now();
      for (const [k, v] of this.barcodeScanCache) {
        if (v.expiresAt <= now) this.barcodeScanCache.delete(k);
      }
    }

    this.barcodeScanCache.set(cacheKey, { result, expiresAt: Date.now() + this.BARCODE_CACHE_TTL_MS });
    return result;
  }

  /** Call after stock changes so the next scan fetches fresh data for that barcode. */
  public invalidateBarcodeCache(barcode?: string): void {
    if (barcode) {
      this.barcodeScanCache.delete(normalizeScannedBarcode(barcode).toLowerCase());
    } else {
      this.barcodeScanCache.clear();
    }
  }

  /**
   * Get medicine by ID (includes inventory aggregates).
   */
  public async getMedicineById(id: number): Promise<MedicineWithInventory | null> {
    const sql = `
      ${this.baseInventorySelect}
      WHERE m.id = ?
      GROUP BY m.id
      LIMIT 1
    `;
    const result = await this.dbService.queryOne(sql, [id]);
    return result ? this.mapRowToMedicine(result) : null;
  }

  /**
   * Search medicines by name or barcode.
   */
  public async searchMedicines(searchTerm: string): Promise<MedicineWithInventory[]> {
    const sql = `
      ${this.cteInventorySelect}
      WHERE m.name LIKE ? OR m.barcode LIKE ?
        OR IFNULL(m.gtin, '') LIKE ?
        OR IFNULL(m.manufacturer, '') LIKE ?
        OR IFNULL(m.brand_name, '') LIKE ?
      GROUP BY m.id
      ORDER BY m.name ASC
      LIMIT 50
    `;
    const searchPattern = `%${searchTerm}%`;
    // A pasted/scanned full GS1 code searches by its GTIN.
    const gtinPattern = `%${extractGtin(searchTerm) ?? searchTerm}%`;
    const rows = await this.dbService.query(sql, [
      searchPattern,
      searchPattern,
      gtinPattern,
      searchPattern,
      searchPattern,
    ]);
    return rows.map((row) => this.mapRowToMedicine(row));
  }

  /**
   * Same product (GTIN) must not be registered twice, even when the two scans differ in
   * batch / expiry / serial.
   */
  private async assertGtinUnused(gtin: string | null, excludeId?: number): Promise<void> {
    if (!gtin) return;
    const existing = await this.dbService.queryOne(
      'SELECT id, name FROM medicines WHERE gtin = ? AND id != ? LIMIT 1',
      [gtin, excludeId ?? -1]
    );
    if (existing) {
      throw new Error(`This product (GTIN ${gtin}) is already registered as "${existing.name}".`);
    }
  }

  /** Fill medicines.gtin from stored barcodes (new column, or rows saved before GTIN support). */
  private async backfillMedicineGtins(): Promise<void> {
    const rows = await this.dbService.query(
      `SELECT id, barcode FROM medicines WHERE gtin IS NULL AND barcode IS NOT NULL AND barcode != ''`
    );
    let filled = 0;
    for (const row of rows) {
      const gtin = extractGtin(row.barcode);
      if (!gtin) continue;
      await this.dbService.execute(`UPDATE medicines SET gtin = ? WHERE id = ?`, [gtin, row.id]);
      filled += 1;
    }
    if (filled > 0) console.log(`[medicines] Back-filled GTIN for ${filled} medicine(s).`);
  }

  /**
   * Create a new medicine.
   */
  public async createMedicine(medicine: Medicine): Promise<number> {
    // Check if barcode already exists
    if (medicine.barcode) {
      const existingMedicine = await this.dbService.queryOne(
        'SELECT id, name FROM medicines WHERE barcode = ?',
        [medicine.barcode]
      );
      
      if (existingMedicine) {
        throw new Error(`Barcode "${medicine.barcode}" already exists for medicine "${existingMedicine.name}". Please use a different barcode.`);
      }
    }
    const gtin = extractGtin(medicine.barcode);
    await this.assertGtinUnused(gtin);

    const sql = `
      INSERT INTO medicines (barcode, gtin, name, pill_quantity, status, manufacturer, brand_name, minimum_stock_level)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      medicine.barcode || null,
      gtin,
      medicine.name,
      medicine.pillQuantity,
      medicine.status || 'active',
      medicine.manufacturer || null,
      medicine.brandName || null,
      medicine.minimumStockLevel ?? 0,
    ];
    
    try {
      const result = await this.dbService.execute(sql, params);
      return (result as any).lastID;
    } catch (error: any) {
      // Handle any other database errors
      if (error.message && error.message.includes('UNIQUE constraint failed')) {
        throw new Error('A medicine with this barcode already exists. Please use a different barcode.');
      }
      throw error;
    }
  }

  /**
   * Update medicine metadata (name, barcode, pills per packet, status).
   * Only allows status updates for medicines used in transactions.
   */
  public async updateMedicine(id: number, medicine: Partial<Medicine>): Promise<void> {
    // Check if medicine has been used in transactions
    const hasTransactions = await this.hasMedicineBeenUsed(id);
    
    // If medicine has transactions, only block identity fields (name/barcode). Pack size and other fields may still be corrected.
    if (hasTransactions) {
      const hasBlockedIdentityUpdates =
        medicine.name !== undefined || medicine.barcode !== undefined;

      if (hasBlockedIdentityUpdates) {
        throw new Error(
          'Cannot edit medicine name or barcode: This medicine has been used in transactions. You can update pills/packet, manufacturer, brand, min. stock level, and status.'
        );
      }
    }

    // Check if barcode is being updated and if it already exists
    if (medicine.barcode !== undefined) {
      const existingMedicine = await this.dbService.queryOne(
        'SELECT id, name FROM medicines WHERE barcode = ? AND id != ?',
        [medicine.barcode, id]
      );
      
      if (existingMedicine) {
        throw new Error(`Barcode "${medicine.barcode}" already exists for medicine "${existingMedicine.name}". Please use a different barcode.`);
      }
      await this.assertGtinUnused(extractGtin(medicine.barcode), id);
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (medicine.name !== undefined) {
      updates.push('name = ?');
      params.push(medicine.name);
    }
    if (medicine.barcode !== undefined) {
      updates.push('barcode = ?', 'gtin = ?');
      params.push(medicine.barcode || null, extractGtin(medicine.barcode));
    }
    if (medicine.pillQuantity !== undefined) {
      updates.push('pill_quantity = ?');
      params.push(medicine.pillQuantity);
    }
    if (medicine.status !== undefined) {
      updates.push('status = ?');
      params.push(medicine.status);
    }
    if (medicine.manufacturer !== undefined) {
      updates.push('manufacturer = ?');
      params.push(medicine.manufacturer || null);
    }
    if (medicine.brandName !== undefined) {
      updates.push('brand_name = ?');
      params.push(medicine.brandName || null);
    }
    if (medicine.minimumStockLevel !== undefined) {
      updates.push('minimum_stock_level = ?');
      params.push(medicine.minimumStockLevel ?? 0);
    }

    if (updates.length === 0) return;

    params.push(id);
    const sql = `UPDATE medicines SET ${updates.join(', ')} WHERE id = ?`;
    
    try {
      await this.dbService.execute(sql, params);
    } catch (error: any) {
      // Handle any other database errors
      if (error.message && error.message.includes('UNIQUE constraint failed')) {
        throw new Error('A medicine with this barcode already exists. Please use a different barcode.');
      }
      throw error;
    }
  }

  /**
   * Check if medicine has been used in any transactions
   */
  private async hasMedicineBeenUsed(id: number): Promise<boolean> {
    const row = await this.dbService.queryOne(
      `SELECT 1 FROM (
        SELECT 1 FROM purchase_items    WHERE medicine_id = ?
        UNION ALL
        SELECT 1 FROM sale_items        WHERE medicine_id = ?
        UNION ALL
        SELECT 1 FROM sale_return_items WHERE medicine_id = ?
      ) LIMIT 1`,
      [id, id, id]
    );
    return row != null;
  }

  /**
   * Delete medicine metadata.
   * Only allows deletion if medicine has never been used in any transactions.
   */
  public async deleteMedicine(id: number): Promise<void> {
    const used = await this.dbService.queryOne(
      `SELECT 1 FROM (
        SELECT 1 FROM purchase_items    WHERE medicine_id = ?
        UNION ALL
        SELECT 1 FROM sale_items        WHERE medicine_id = ?
        UNION ALL
        SELECT 1 FROM sale_return_items WHERE medicine_id = ?
      ) LIMIT 1`,
      [id, id, id]
    );

    if (used) {
      throw new Error('Cannot delete medicine: It has been used in transactions. You can mark it as inactive instead.');
    }

    await this.dbService.execute(`DELETE FROM medicines WHERE id = ?`, [id]);
  }

  /**
   * Get medicines whose stock expires within a threshold.
   * Reads from stock_batches.qty_remaining (live inventory).
   */
  public async getExpiringMedicines(thresholdDays: number = 30): Promise<ExpiringMedicineAlert[]> {
    const sql = `
      SELECT
        m.id,
        m.name,
        m.barcode,
        MIN(sb.expiry_date) AS next_expiry_date,
        SUM(sb.qty_remaining) AS available_pills,
        CAST((julianday(MIN(sb.expiry_date)) - julianday('now')) AS INTEGER) AS days_until_expiry
      FROM medicines m
      JOIN stock_batches sb ON sb.medicine_id = m.id
      WHERE sb.qty_remaining > 0
        AND sb.expiry_date IS NOT NULL
        AND date(sb.expiry_date) >= date('now')
        AND date(sb.expiry_date) <= date('now', '+' || ? || ' days')
      GROUP BY m.id, m.name, m.barcode
      ORDER BY MIN(sb.expiry_date) ASC
    `;

    const rows = await this.dbService.query(sql, [thresholdDays]);
    return rows
      .filter((row: any) => row.next_expiry_date)
      .map((row: any) => ({
        id: row.id,
        name: row.name,
        barcode: row.barcode || undefined,
        nextExpiryDate: row.next_expiry_date,
        availablePills: row.available_pills || 0,
        daysUntilExpiry: row.days_until_expiry ?? 0,
      }));
  }

  /**
   * Return medicines whose current sellable stock is below their minimum_stock_level.
   * Only includes medicines that have minimum_stock_level > 0.
   * Reads from stock_batches.qty_remaining (live inventory).
   */
  public async getLowStockMedicines(): Promise<LowStockAlert[]> {
    const sql = `
      SELECT
        m.id,
        m.name,
        m.barcode,
        COALESCE(m.minimum_stock_level, 0) AS minimum_stock_level,
        COALESCE(SUM(CASE
          WHEN sb.expiry_date IS NULL OR date(sb.expiry_date) >= date('now')
          THEN sb.qty_remaining ELSE 0 END), 0) AS sellable_pills
      FROM medicines m
      LEFT JOIN stock_batches sb ON sb.medicine_id = m.id
      WHERE m.minimum_stock_level > 0
        AND m.status = 'active'
        AND EXISTS (SELECT 1 FROM stock_batches WHERE medicine_id = m.id)
      GROUP BY m.id
      HAVING sellable_pills < m.minimum_stock_level
      ORDER BY (m.minimum_stock_level - sellable_pills) DESC
    `;
    const rows = await this.dbService.query(sql);
    return rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      barcode: row.barcode || undefined,
      sellablePills: row.sellable_pills ?? 0,
      minimumStockLevel: row.minimum_stock_level ?? 0,
      deficit: (row.minimum_stock_level ?? 0) - (row.sellable_pills ?? 0),
    }));
  }
  /**
   * Get detailed inventory information (batches) for a specific medicine.
   * Reads live stock from stock_batches; joins purchase_items for financial display data.
   */
  public async getMedicineInventoryDetails(medicineId: number): Promise<any[]> {
    const sql = `
      SELECT 
        sb.id AS stockBatchId,
        COALESCE(pi.purchase_id, NULL) AS purchaseId,
        m.name AS medicineName,
        m.pill_quantity AS pillQuantity,
        sb.qty_received AS totalPills,
        sb.qty_remaining AS availablePills,
        (sb.qty_received - sb.qty_remaining) AS soldPills,
        COALESCE(p.created_at, sb.created_at) AS purchaseDate,
        COALESCE(p.supplier_name, '') AS supplierName,
        sb.expiry_date AS expiryDate,
        COALESCE(pi.price_per_packet, 0) AS originalPricePerPacket,
        CASE 
          WHEN pi.packet_quantity > 0 THEN COALESCE(pi.discount_amount / pi.packet_quantity, 0)
          ELSE 0 
        END AS discountPerPacket,
        sb.selling_price_per_pill AS sellingPricePerPill
      FROM stock_batches sb
      LEFT JOIN purchase_items pi ON pi.id = sb.purchase_item_id
      LEFT JOIN purchases p ON p.id = pi.purchase_id
      JOIN medicines m ON m.id = sb.medicine_id
      WHERE sb.medicine_id = ?
      ORDER BY COALESCE(p.created_at, sb.created_at) DESC
    `;
    return await this.dbService.query(sql, [medicineId]);
  }

  /**
   * Return FEFO-ordered unexpired batches with their effective sell price per pill.
   * Used by the selling panel to compute a blended price when a quantity spans multiple batches.
   * Reads from stock_batches (live inventory).
   */
  public async getFefoSellBatches(medicineId: number): Promise<Array<{ availablePills: number; sellPrice: number }>> {
    const sql = `
      SELECT
        sb.qty_remaining AS availablePills,
        CASE
          WHEN sb.selling_price_per_pill > 0 THEN sb.selling_price_per_pill
          WHEN pi.pills_per_packet > 0 THEN (pi.price_per_packet * 1.0 / pi.pills_per_packet)
          ELSE sb.cost_price_per_pill
        END AS sellPrice
      FROM stock_batches sb
      LEFT JOIN purchase_items pi ON pi.id = sb.purchase_item_id
      WHERE sb.medicine_id = ?
        AND date(sb.expiry_date) >= date('now')
        AND sb.qty_remaining > 0
      ORDER BY date(sb.expiry_date) ASC, sb.id ASC
    `;
    return this.dbService.query(sql, [medicineId]);
  }
}

export default MedicineService;

let medicineServiceInstance: MedicineService | null = null;
export const getMedicineService = (): MedicineService => {
  if (!medicineServiceInstance) {
    medicineServiceInstance = new MedicineService();
  }
  return medicineServiceInstance;
};
