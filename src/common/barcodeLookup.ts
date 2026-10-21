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

/**
 * GS1 parsing. Medicine packs carry a GS1 DataMatrix holding several fields:
 *   (01) GTIN — identifies the product; never changes between batches
 *   (17) expiry YYMMDD, (10) batch/lot, (21) serial — change per batch / per pack
 * Products must be matched on the GTIN only; the full scanned string differs for every pack.
 */
export interface Gs1Data {
  /** 14-digit GTIN (EAN-8/UPC/EAN-13 are left-padded with zeros so 1D and 2D scans match). */
  gtin?: string;
  /** Expiry as YYYY-MM-DD. */
  expiry?: string;
  batch?: string;
  serial?: string;
  /**
   * True when variable-length fields (batch, serial) are delimited — the scan kept its GS
   * separators or used "(AI)" brackets. Keyboard-wedge scanners often drop GS, in which case
   * a variable field swallows everything after it and batch/serial must not be trusted.
   */
  variableFieldsReliable: boolean;
}

const GS = '\x1d';

/** Fixed-length AIs (value length) that can appear in pharma codes. */
const GS1_FIXED_AIS: Record<string, number> = {
  '00': 18, '01': 14, '02': 14, '11': 6, '12': 6, '13': 6, '15': 6, '16': 6, '17': 6, '20': 2,
};
/** Variable-length AIs (max value length) terminated by GS or end of data. */
const GS1_VARIABLE_AIS: Record<string, number> = {
  '10': 20, '21': 20, '22': 20, '30': 8, '37': 8, '90': 30, '91': 90, '92': 90, '93': 90,
  '94': 90, '95': 90, '96': 90, '97': 90, '98': 90, '99': 90,
  '240': 30, '241': 30, '250': 30, '251': 30, '254': 20,
  '710': 20, '711': 20, '712': 20, '713': 20, '714': 20, '715': 20,
};

/** GS1 mod-10 check digit validation for GTIN-8/12/13/14 (or any numeric GS1 key). */
export function isValidGtinCheckDigit(code: string): boolean {
  if (!/^\d{8,18}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop() as number;
  let sum = 0;
  for (let i = digits.length - 1, w = 3; i >= 0; i -= 1, w = w === 3 ? 1 : 3) {
    sum += digits[i] * w;
  }
  return (10 - (sum % 10)) % 10 === check;
}

/** YYMMDD → YYYY-MM-DD. DD "00" means last day of the month (GS1 rule). */
function gs1DateToIso(yymmdd: string): string | undefined {
  if (!/^\d{6}$/.test(yymmdd)) return undefined;
  const year = 2000 + Number(yymmdd.slice(0, 2));
  const month = Number(yymmdd.slice(2, 4));
  let day = Number(yymmdd.slice(4, 6));
  if (month < 1 || month > 12) return undefined;
  const lastDay = new Date(year, month, 0).getDate();
  if (day === 0) day = lastDay;
  if (day > lastDay) return undefined;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function applyGs1Field(out: Gs1Data, ai: string, value: string): void {
  if (ai === '01' || ai === '02') {
    if (!out.gtin && /^\d{14}$/.test(value) && isValidGtinCheckDigit(value)) out.gtin = value;
  } else if (ai === '17') {
    out.expiry = gs1DateToIso(value) ?? out.expiry;
  } else if (ai === '10') {
    out.batch = value || undefined;
  } else if (ai === '21') {
    out.serial = value || undefined;
  }
}

/** Parses "(01)0896…(17)271231(10)AB12" human-readable form. */
function parseBracketedGs1(s: string): Gs1Data | null {
  const re = /\((\d{2,4})\)([^(]*)/g;
  const out: Gs1Data = { variableFieldsReliable: true };
  let matched = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    matched = true;
    applyGs1Field(out, m[1], m[2].replace(new RegExp(GS, 'g'), '').trim());
  }
  return matched ? out : null;
}

/** Parses a raw element string that starts with an AI ("01…17…10…"), GS-delimited or not. */
function parseRawGs1(s: string): Gs1Data | null {
  const out: Gs1Data = { variableFieldsReliable: s.includes(GS) };
  let i = 0;
  let parsedAny = false;
  while (i < s.length) {
    if (s[i] === GS) {
      i += 1;
      continue;
    }
    const ai2 = s.slice(i, i + 2);
    const ai3 = s.slice(i, i + 3);
    if (GS1_FIXED_AIS[ai2] !== undefined) {
      const len = GS1_FIXED_AIS[ai2];
      const value = s.slice(i + 2, i + 2 + len);
      if (value.length !== len || !/^\d+$/.test(value)) break;
      applyGs1Field(out, ai2, value);
      i += 2 + len;
    } else {
      const ai = GS1_VARIABLE_AIS[ai3] !== undefined ? ai3 : GS1_VARIABLE_AIS[ai2] !== undefined ? ai2 : null;
      if (!ai) break;
      const start = i + ai.length;
      const gsAt = s.indexOf(GS, start);
      const end = gsAt === -1 ? s.length : gsAt;
      applyGs1Field(out, ai, s.slice(start, end));
      i = end;
    }
    parsedAny = true;
  }
  return parsedAny && out.gtin ? out : null;
}

/**
 * Extract GS1 data (GTIN, expiry, batch, serial) from a scanned or stored barcode.
 * Pass the raw scan when possible — GS separators make batch/serial reliable.
 * Returns null when the value is not a GS1 code (e.g. an internal code like "MED001").
 */
export function parseGs1(raw: string | null | undefined): Gs1Data | null {
  if (!raw) return null;
  let s = raw
    .replace(/\u0000/g, '')
    .replace(/[\x1c\x1e\x1f]/g, GS) // some stacks emit FS/RS/US where GS is meant
    .replace(/[\r\n\t]+/g, '')
    .trim()
    .replace(/^\][A-Za-z]\d/, '') // AIM symbology id, e.g. "]d2" DataMatrix, "]C1" GS1-128
    .replace(/^\x1d+/, ''); // leading FNC1

  if (!s) return null;

  if (/\(\d{2,4}\)/.test(s)) return parseBracketedGs1(s);

  // Plain linear barcode: EAN-8, UPC-A, EAN-13, GTIN-14.
  if (/^\d+$/.test(s) && [8, 12, 13, 14].includes(s.length) && isValidGtinCheckDigit(s)) {
    return { gtin: s.padStart(14, '0'), variableFieldsReliable: true };
  }

  if (s.startsWith('01') || s.startsWith('02')) {
    const parsed = parseRawGs1(s);
    if (parsed) return parsed;
  }
  // Some scanners drop the leading "0" of AI 01 ("1089…" instead of "01089…").
  if (s.startsWith('1')) {
    const parsed = parseRawGs1('0' + s);
    if (parsed) return parsed;
  }
  return null;
}

/** Just the GTIN (14 digits) of a barcode, or null when it is not a GS1 product code. */
export function extractGtin(raw: string | null | undefined): string | null {
  return parseGs1(raw)?.gtin ?? null;
}

/** Escape for SQL LIKE with ESCAPE '\' */
export function escapeSqlLikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Returns a short, human-readable label for a scanned barcode.
 * GS1/DataMatrix codes encode multiple fields — we extract just the GTIN (AI 01).
 * Plain short barcodes are returned as-is (truncated at 20 chars).
 */
export function formatBarcodeForDisplay(raw: string): string {
  const gtin = extractGtin(raw);
  if (gtin) return gtin;
  const s = normalizeScannedBarcode(raw);
  if (s.length > 20) return s.slice(0, 20) + '…';
  return s;
}
