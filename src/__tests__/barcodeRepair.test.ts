import { canonicalStoredBarcode, namesCompatible, planBarcodeRepair, RepairMedicineRow } from '../common/barcodeRepair';

const GTIN = '04006381333931';
const GTIN_B = '08964001922513';
const gs1 = (gtin: string, tail: string) => `01${gtin}${tail}`;

const row = (over: Partial<RepairMedicineRow> & { id: number }): RepairMedicineRow => ({
  name: 'TAB TEST 40MG',
  barcode: null,
  pillQuantity: 14,
  status: 'active',
  stock: 0,
  ...over,
});

describe('namesCompatible', () => {
  it('accepts spelling variants and missing strength', () => {
    expect(namesCompatible('ZEZOT', 'CAP ZEZOT 250MG')).toBe(true);
    expect(namesCompatible('AVSAR 80/5', 'avser 5/80')).toBe(true);
    expect(namesCompatible('RIVOTRIL 0,5 MG', 'RIVOTRIL 0.5MG')).toBe(true);
    expect(namesCompatible('COMBIVAIR 400MG', 'COMBIVAIR 400MCG+6MCG')).toBe(true);
  });

  it('rejects conflicting strengths', () => {
    expect(namesCompatible('INOSITA PLUS 50/500MG', 'TAB INOSITA PLUS 50/1000')).toBe(false);
    expect(namesCompatible('PANADOL 90ML', 'SYP PANADOL 6PLUS')).toBe(false);
  });
});

describe('planBarcodeRepair', () => {
  it('merges per-batch duplicates into the row with most stock and cleans its barcode', () => {
    const plan = planBarcodeRepair([
      row({ id: 1, barcode: gs1(GTIN, '17280531' + '10LOT1'), stock: 10 }),
      row({ id: 2, barcode: gs1(GTIN, '17290101' + '10LOT2'), stock: 500 }),
      row({ id: 3, barcode: GTIN.slice(1), stock: 0 }), // plain EAN-13 of the same product
    ]);
    expect(plan.merges).toEqual([{ gtin: GTIN, keepId: 2, mergeIds: [1, 3] }]);
    expect(plan.barcodeUpdates).toEqual([{ id: 2, barcode: GTIN }]);
    expect(plan.skipped).toEqual([]);
  });

  it('does not merge rows with a different pack size or strength', () => {
    const plan = planBarcodeRepair([
      row({ id: 1, name: 'TAB ZOVENTA 40MG', pillQuantity: 30, barcode: gs1(GTIN, '17280531'), stock: 200 }),
      row({ id: 2, name: 'CAP AXID NEO 40MG', pillQuantity: 14, barcode: gs1(GTIN, '17270101'), stock: 0 }),
      row({ id: 3, name: 'TAB ZOVENTA 20MG', pillQuantity: 30, barcode: gs1(GTIN, '17260101'), stock: 0 }),
    ]);
    expect(plan.merges).toEqual([]);
    expect(plan.skipped).toEqual([{ gtin: GTIN, keepId: 1, ids: [2, 3] }]);
    expect(plan.barcodeUpdates).toEqual([{ id: 1, barcode: GTIN }]);
  });

  it('never assigns a barcode another remaining row already has', () => {
    const plan = planBarcodeRepair([
      row({ id: 1, pillQuantity: 30, barcode: gs1(GTIN_B, '17280531'), stock: 5 }),
      row({ id: 2, pillQuantity: 14, barcode: GTIN_B, stock: 0 }),
    ]);
    expect(plan.barcodeUpdates).toEqual([]);
  });

  it('leaves non-GS1 and already-clean barcodes untouched and is idempotent', () => {
    const plan = planBarcodeRepair([
      row({ id: 1, barcode: 'https://qr.example.com/x' }),
      row({ id: 2, barcode: '1234' }),
      row({ id: 3, barcode: GTIN }),
    ]);
    expect(plan).toEqual({ merges: [], barcodeUpdates: [], skipped: [] });
  });
});

describe('canonicalStoredBarcode', () => {
  it('stores the GTIN for full GS1 scans and keeps other codes as typed', () => {
    expect(canonicalStoredBarcode(gs1(GTIN, '17280531' + '10LOT\x1d21SER'))).toBe(GTIN);
    expect(canonicalStoredBarcode('4006381333931')).toBe('4006381333931');
    expect(canonicalStoredBarcode(' MED001\r\n')).toBe('MED001');
    expect(canonicalStoredBarcode('')).toBeNull();
  });
});
