import { extractGtin, formatBarcodeForDisplay, parseGs1 } from '../common/barcodeLookup';

const GTIN = '04006381333931'; // valid check digit
const GS = '\x1d';

describe('parseGs1', () => {
  it('extracts the same GTIN from different batches of the same product', () => {
    const oldStock = `01${GTIN}17261130` + `10LOT01${GS}21SERIALA1`;
    const newStock = `01${GTIN}17280531` + `10LOT77${GS}21SERIALZ9`;
    expect(extractGtin(oldStock)).toBe(GTIN);
    expect(extractGtin(newStock)).toBe(GTIN);
  });

  it('reads expiry, batch and serial when GS separators are present', () => {
    expect(parseGs1(`]d201${GTIN}17280531` + `10LOT77${GS}21SER9`)).toEqual({
      gtin: GTIN,
      expiry: '2028-05-31',
      batch: 'LOT77',
      serial: 'SER9',
      variableFieldsReliable: true,
    });
  });

  it('flags batch as unreliable when the scanner dropped GS', () => {
    const parsed = parseGs1(`01${GTIN}17280531` + `10LOT7721SER9`);
    expect(parsed?.gtin).toBe(GTIN);
    expect(parsed?.expiry).toBe('2028-05-31');
    expect(parsed?.variableFieldsReliable).toBe(false);
  });

  it('handles serial-first ordering without separators (GTIN still found)', () => {
    expect(extractGtin(`01${GTIN}21ABCDEF17280531` + `10LOT`)).toBe(GTIN);
  });

  it('parses bracketed human-readable form', () => {
    const parsed = parseGs1(`(01)${GTIN}(17)270100(10)B12`);
    expect(parsed).toMatchObject({ gtin: GTIN, expiry: '2027-01-31', batch: 'B12' });
  });

  it('recovers a scan that lost the leading 0 of AI 01', () => {
    expect(extractGtin(`1${GTIN}17280531`)).toBe(GTIN);
  });

  it('pads EAN-13 so 1D and 2D scans of the same product match', () => {
    expect(extractGtin('4006381333931')).toBe(GTIN);
  });

  it('returns null for non-GS1 codes', () => {
    expect(parseGs1('MED001')).toBeNull();
    expect(parseGs1('0987654321')).toBeNull();
    expect(parseGs1('4006381333932')).toBeNull(); // bad check digit
    expect(parseGs1(`01${GTIN.slice(0, 13)}5`)).toBeNull();
  });

  it('formats display label as GTIN', () => {
    expect(formatBarcodeForDisplay(`01${GTIN}17280531` + `10LOT`)).toBe(GTIN);
  });
});
