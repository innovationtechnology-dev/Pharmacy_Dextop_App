/**
 * One-time-per-database repair for medicines saved by the old scanner code.
 *
 * Old builds stored the *whole* GS1 DataMatrix scan as `medicines.barcode`
 * ("0108964001922513 17280531 10LOT 21SERIAL Rs.570…"). Expiry, batch and serial change with
 * every delivery, so the next pack never matched and the same product was registered again —
 * one medicine row per batch, with stock split between them.
 *
 * This module only *plans* the repair (pure, unit-tested); MedicineService applies it in SQL.
 *   1. Rows sharing a GTIN are merged into one "keeper" (the row holding the most stock) when
 *      they are clearly the same item: same pills-per-pack and no conflicting strength in the name.
 *      Rows that disagree are left alone — a wrong merge would corrupt stock counts.
 *   2. Every keeper whose barcode is a long GS1 string gets the clean 14-digit GTIN instead.
 */
import { extractGtin, normalizeScannedBarcode } from './barcodeLookup';

export interface RepairMedicineRow {
  id: number;
  name: string;
  barcode: string | null;
  pillQuantity: number;
  status: string;
  /** Pills currently in stock (sum of stock_batches.qty_remaining). */
  stock: number;
}

export interface MedicineMerge {
  gtin: string;
  keepId: number;
  mergeIds: number[];
}

export interface SkippedDuplicate {
  gtin: string;
  keepId: number;
  /** Rows sharing the keeper's GTIN that were not merged (different pack size or strength). */
  ids: number[];
}

export interface BarcodeRepairPlan {
  merges: MedicineMerge[];
  /** Barcodes to rewrite to the clean GTIN. Never collides with another remaining row. */
  barcodeUpdates: Array<{ id: number; barcode: string }>;
  skipped: SkippedDuplicate[];
}

/** Numbers in a product name, e.g. "TAB NEWDAY 5MG/80MG" → [5, 80]. "0,5" is read as 0.5. */
function strengthNumbers(name: string): number[] {
  const matches = (name || '').replace(/(\d),(\d)/g, '$1.$2').match(/\d+(?:\.\d+)?/g) || [];
  return Array.from(new Set(matches.map(Number)));
}

/**
 * Names are compatible unless both carry numbers and neither set contains the other.
 * "ZEZOT" ~ "CAP ZEZOT 250MG", "AVSAR 80/5" ~ "avser 5/80" — but not "INOSITA 50/500" ~ "50/1000".
 */
export function namesCompatible(a: string, b: string): boolean {
  const na = strengthNumbers(a);
  const nb = strengthNumbers(b);
  if (na.length === 0 || nb.length === 0) return true;
  const aInB = na.every((n) => nb.includes(n));
  const bInA = nb.every((n) => na.includes(n));
  return aInB || bInA;
}

/** True when the stored barcode is a long GS1 string that carries more than the product code. */
function isCompositeGs1(barcode: string | null, gtin: string): boolean {
  if (!barcode) return false;
  const s = normalizeScannedBarcode(barcode);
  return s !== gtin && s.length > 14;
}

export function planBarcodeRepair(rows: RepairMedicineRow[]): BarcodeRepairPlan {
  const byGtin = new Map<string, RepairMedicineRow[]>();
  const gtinOf = new Map<number, string>();
  for (const row of rows) {
    const gtin = extractGtin(row.barcode);
    if (!gtin) continue;
    gtinOf.set(row.id, gtin);
    const group = byGtin.get(gtin);
    if (group) group.push(row);
    else byGtin.set(gtin, [row]);
  }

  const merges: MedicineMerge[] = [];
  const skipped: SkippedDuplicate[] = [];
  const removed = new Set<number>();
  const keepers: Array<{ row: RepairMedicineRow; gtin: string }> = [];

  for (const [gtin, group] of byGtin) {
    // Keeper: most stock, then active over inactive/discontinued, then the newest row.
    const sorted = [...group].sort(
      (a, b) =>
        (b.stock || 0) - (a.stock || 0) ||
        Number(b.status === 'active') - Number(a.status === 'active') ||
        b.id - a.id
    );
    const keeper = sorted[0];
    keepers.push({ row: keeper, gtin });

    const mergeIds: number[] = [];
    const skippedIds: number[] = [];
    for (const other of sorted.slice(1)) {
      if (other.pillQuantity === keeper.pillQuantity && namesCompatible(keeper.name, other.name)) {
        mergeIds.push(other.id);
        removed.add(other.id);
      } else {
        skippedIds.push(other.id);
      }
    }
    const asc = (a: number, b: number) => a - b;
    if (mergeIds.length > 0) merges.push({ gtin, keepId: keeper.id, mergeIds: mergeIds.sort(asc) });
    if (skippedIds.length > 0) skipped.push({ gtin, keepId: keeper.id, ids: skippedIds.sort(asc) });
  }

  // Barcodes still taken after the merge (barcode is UNIQUE, compared case-insensitively here).
  const taken = new Set(
    rows
      .filter((r) => !removed.has(r.id) && r.barcode)
      .map((r) => normalizeScannedBarcode(r.barcode as string).toLowerCase())
  );

  const barcodeUpdates: Array<{ id: number; barcode: string }> = [];
  for (const { row, gtin } of keepers) {
    if (!isCompositeGs1(row.barcode, gtin)) continue;
    if (taken.has(gtin)) continue;
    taken.add(gtin);
    barcodeUpdates.push({ id: row.id, barcode: gtin });
  }

  return { merges, barcodeUpdates, skipped };
}

/**
 * SQL script (one transaction) that applies a plan. `childTables` are the tables with a
 * `medicine_id` column; their rows are repointed to the keeper so sales/purchase history and
 * stock batches (each with its own price and expiry) stay intact.
 * Values are inlined so the script runs atomically in one exec; every value is validated here
 * (integer ids, 14-digit GTINs, plain identifiers).
 */
export function buildBarcodeRepairSql(plan: BarcodeRepairPlan, childTables: string[]): string {
  const int = (n: number) => {
    if (!Number.isInteger(n)) throw new Error(`Invalid medicine id: ${n}`);
    return String(n);
  };
  const tables = childTables.filter((t) => /^[A-Za-z0-9_]+$/.test(t) && t !== 'medicines');
  const statements: string[] = ['BEGIN TRANSACTION;'];

  for (const merge of plan.merges) {
    const keep = int(merge.keepId);
    const ids = merge.mergeIds.map(int).join(',');
    for (const table of tables) {
      statements.push(`UPDATE "${table}" SET medicine_id = ${keep} WHERE medicine_id IN (${ids});`);
    }
    // Keep the keeper's own values; only fill blanks from the merged rows.
    statements.push(`
      UPDATE medicines SET
        manufacturer = COALESCE(NULLIF(manufacturer, ''),
          (SELECT manufacturer FROM medicines WHERE id IN (${ids}) AND IFNULL(manufacturer, '') != '' ORDER BY id DESC LIMIT 1)),
        brand_name = COALESCE(NULLIF(brand_name, ''),
          (SELECT brand_name FROM medicines WHERE id IN (${ids}) AND IFNULL(brand_name, '') != '' ORDER BY id DESC LIMIT 1)),
        minimum_stock_level = CASE WHEN minimum_stock_level > 0 THEN minimum_stock_level
          ELSE (SELECT COALESCE(MAX(minimum_stock_level), 0) FROM medicines WHERE id IN (${ids})) END,
        status = CASE WHEN EXISTS (SELECT 1 FROM medicines WHERE id IN (${ids}) AND status = 'active')
                      THEN 'active' ELSE status END
      WHERE id = ${keep};`);
    statements.push(`DELETE FROM medicines WHERE id IN (${ids});`);
  }

  // After the deletes, so a GTIN freed by a merged row can be taken without a UNIQUE clash.
  for (const update of plan.barcodeUpdates) {
    if (!/^\d{14}$/.test(update.barcode)) continue;
    statements.push(
      `UPDATE medicines SET barcode = '${update.barcode}', gtin = '${update.barcode}' WHERE id = ${int(update.id)};`
    );
  }

  statements.push('COMMIT;');
  return statements.join('\n');
}

/**
 * Value to store in `medicines.barcode` for a newly entered code: the GTIN when the input is a
 * full GS1 string (so the next batch still matches), otherwise the trimmed input unchanged.
 */
export function canonicalStoredBarcode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = normalizeScannedBarcode(raw);
  if (!s) return null;
  const gtin = extractGtin(raw);
  return gtin && isCompositeGs1(s, gtin) ? gtin : s;
}
