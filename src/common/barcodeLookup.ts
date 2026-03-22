/**
 * Barcode / scanner helpers. Hardware scanners often:
 * - Drop a leading "0" (GS1 / long numeric codes: DB has "01…", scan is "1…")
 * - Send CR/LF or NUL suffixes
 * - Match differently than search, which uses SQL LIKE '%term%'
 */

/**
 * Strip control chars and whitespace that scanners append.
 * GS1 (DataMatrix / some USB-HID stacks) often inserts ASCII 29 (GS), 30 (RS), 31 (US) between fields;
 * those usually are not stored in `medicines.barcode`, so removing them improves matching.
 */
export function normalizeScannedBarcode(raw: string): string {
  return raw
    .replace(/\u0000/g, '')
    .replace(/[\x1c\x1d\x1e\x1f]/g, '') // FS, GS, RS, US
    .replace(/[\r\n\t]+/g, '')
    .trim();
}

/** True when value is likely a hardware scan (vs a short name search). Used for Enter-to-lookup in product fields. */
export function looksLikeBarcodeInput(raw: string): boolean {
  const t = normalizeScannedBarcode(raw);
  if (t.length < 8) return false;
  const digits = (t.match(/\d/g) || []).length;
  if (digits >= 8) return true;
  if (t.length >= 18) return true;
  return false;
}

/**
 * Exact-match candidates to try in order (DB uses strict equality).
 * Deduplicates while preserving order.
 */
export function buildBarcodeLookupCandidates(raw: string): string[] {
  const s = normalizeScannedBarcode(raw);
  if (!s) return [];

  const out: string[] = [];
  const add = (v: string) => {
    if (!v) return;
    const lower = v.toLowerCase();
    if (!out.some((x) => x.toLowerCase() === lower)) out.push(v);
  };

  add(s);

  // Leading-zero variants (common when stored GS1 starts with "01" but scan loses one "0")
  if (s.length >= 6) {
    add('0' + s);
    add('00' + s);
    add('000' + s);
  }

  // If scan has extra leading zeros vs catalogue
  if (s.startsWith('0') && s.length >= 6) {
    add(s.slice(1));
    if (s.startsWith('00')) add(s.slice(2));
    if (s.startsWith('000')) add(s.slice(3));
  }

  return out;
}

/** Escape for SQL LIKE with ESCAPE '\' */
export function escapeSqlLikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
