import { DatabaseService } from '../services/database.service';

/**
 * After ALTER TABLE medicines RENAME TO medicines_legacy, SQLite updates
 * FOREIGN KEY definitions on child tables to point at medicines_legacy.
 * If medicines_legacy is later dropped, those FKs still reference the old name
 * and INSERT/DELETE on child tables fails with:
 *   SQLITE_ERROR: no such table: main.medicines_legacy
 *
 * Rebuilds affected tables so medicine_id REFERENCES medicines(id) again.
 */
export async function repairMedicineForeignKeyReferences(
  db: DatabaseService
): Promise<void> {
  const tableExists = async (name: string): Promise<boolean> => {
    const row = await db.queryOne(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      [name]
    );
    return !!row;
  };

  const referencesLegacy = async (table: string): Promise<boolean> => {
    if (!(await tableExists(table))) return false;
    const fks = await db.query(`PRAGMA foreign_key_list(${table})`);
    return fks.some((fk: any) => String(fk.table) === 'medicines_legacy');
  };

  const repairPurchase = await referencesLegacy('purchase_items');
  const repairSale = await referencesLegacy('sale_items');
  const repairReturn = await referencesLegacy('sale_return_items');

  if (!repairPurchase && !repairSale && !repairReturn) {
    return;
  }

  console.log(
    '[DB] Repairing foreign keys: rebinding medicine_id to medicines (was medicines_legacy)'
  );

  await db.execute('PRAGMA foreign_keys = OFF');

  try {
    if (repairPurchase) {
      await rebuildPurchaseItems(db);
    }
    if (repairSale) {
      await rebuildSaleItems(db);
    }
    if (repairReturn) {
      await rebuildSaleReturnItems(db);
    }
  } finally {
    await db.execute('PRAGMA foreign_keys = ON');
  }

  // Safe cleanup if a stray legacy rename table was left behind
  await db.execute('DROP TABLE IF EXISTS medicines_legacy');
}

const PURCHASE_ITEM_ORDERED_COLS = [
  'id',
  'purchase_id',
  'medicine_id',
  'medicine_name',
  'packet_quantity',
  'pills_per_packet',
  'total_pills',
  'available_pills',
  'price_per_packet',
  'price_per_pill',
  'selling_price_per_pill',
  'discount_amount',
  'tax_amount',
  'line_subtotal',
  'line_total',
  'expiry_date',
  'batch_number',
] as const;

const SALE_ITEM_ORDERED_COLS = [
  'id',
  'sale_id',
  'medicine_id',
  'medicine_name',
  'pills',
  'unit_price',
  'subtotal',
  'cost_price',
  'cost_subtotal',
  'discount_amount',
  'tax_amount',
  'total',
] as const;

const SALE_RETURN_ITEM_ORDERED_COLS = [
  'id',
  'sale_return_id',
  'medicine_id',
  'medicine_name',
  'pills',
  'unit_price',
  'subtotal',
  'discount_amount',
  'tax_amount',
  'total',
  'reason',
] as const;

function selectExprForColumn(
  col: string,
  oldSet: Set<string>,
  nullOk: Set<string>,
  textDefaults: Set<string>
): string {
  if (oldSet.has(col)) return `"${col}"`;
  if (nullOk.has(col)) return 'NULL';
  if (textDefaults.has(col)) return "''";
  return '0';
}

async function rebuildPurchaseItems(db: DatabaseService): Promise<void> {
  const existing = await db.query(`PRAGMA table_info(purchase_items)`);
  const oldSet = new Set(existing.map((r: any) => r.name));
  const nullOk = new Set<string>(['batch_number']);
  const textDefaults = new Set<string>(['medicine_name', 'expiry_date']);
  // selling_price_per_pill defaults to 0 when missing from old databases (handled by selectExprForColumn returning '0')
  const selectList = PURCHASE_ITEM_ORDERED_COLS.map((c) =>
    selectExprForColumn(c, oldSet, nullOk, textDefaults)
  ).join(', ');

  await db.execute(`DROP TABLE IF EXISTS purchase_items_fk_fix`);
  await db.execute(`
    CREATE TABLE purchase_items_fk_fix (
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
      selling_price_per_pill REAL NOT NULL DEFAULT 0,
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
  await db.execute(
    `INSERT INTO purchase_items_fk_fix (${PURCHASE_ITEM_ORDERED_COLS.join(
      ', '
    )}) SELECT ${selectList} FROM purchase_items`
  );
  await db.execute(`DROP TABLE purchase_items`);
  await db.execute(`ALTER TABLE purchase_items_fk_fix RENAME TO purchase_items`);
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id ON purchase_items(purchase_id)`
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_purchase_items_medicine_id ON purchase_items(medicine_id)`
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_purchase_items_expiry_date ON purchase_items(expiry_date)`
  );
}

async function rebuildSaleItems(db: DatabaseService): Promise<void> {
  const existing = await db.query(`PRAGMA table_info(sale_items)`);
  const oldSet = new Set(existing.map((r: any) => r.name));
  const nullOk = new Set<string>();
  const textDefaults = new Set<string>(['medicine_name']);
  const selectList = SALE_ITEM_ORDERED_COLS.map((c) =>
    selectExprForColumn(c, oldSet, nullOk, textDefaults)
  ).join(', ');

  await db.execute(`DROP TABLE IF EXISTS sale_items_fk_fix`);
  await db.execute(`
    CREATE TABLE sale_items_fk_fix (
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
  await db.execute(
    `INSERT INTO sale_items_fk_fix (${SALE_ITEM_ORDERED_COLS.join(
      ', '
    )}) SELECT ${selectList} FROM sale_items`
  );
  await db.execute(`DROP TABLE sale_items`);
  await db.execute(`ALTER TABLE sale_items_fk_fix RENAME TO sale_items`);
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id)`
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_sale_items_medicine_id ON sale_items(medicine_id)`
  );
}

async function rebuildSaleReturnItems(db: DatabaseService): Promise<void> {
  const existing = await db.query(`PRAGMA table_info(sale_return_items)`);
  const oldSet = new Set(existing.map((r: any) => r.name));
  const nullOk = new Set<string>(['reason']);
  const textDefaults = new Set<string>(['medicine_name']);
  const selectList = SALE_RETURN_ITEM_ORDERED_COLS.map((c) =>
    selectExprForColumn(c, oldSet, nullOk, textDefaults)
  ).join(', ');

  await db.execute(`DROP TABLE IF EXISTS sale_return_items_fk_fix`);
  await db.execute(`
    CREATE TABLE sale_return_items_fk_fix (
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
  await db.execute(
    `INSERT INTO sale_return_items_fk_fix (${SALE_RETURN_ITEM_ORDERED_COLS.join(
      ', '
    )}) SELECT ${selectList} FROM sale_return_items`
  );
  await db.execute(`DROP TABLE sale_return_items`);
  await db.execute(
    `ALTER TABLE sale_return_items_fk_fix RENAME TO sale_return_items`
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_sale_return_items_sale_return_id ON sale_return_items(sale_return_id)`
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_sale_return_items_medicine_id ON sale_return_items(medicine_id)`
  );
}
