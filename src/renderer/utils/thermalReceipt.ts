import { getCurrencySymbol as getSymbol } from '../../common/currency';

interface MedicineRef {
  id: number;
  name: string;
  barcode?: string;
}

interface CartItemForReceipt {
  medicine: MedicineRef;
  pills: number;
  unitPrice: number;
  discount: number;
  tax: number;
}

export interface PharmacyProfileForReceipt {
  pharmacyName?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  taxId?: string;
  tagline?: string;
  logoUrl?: string;
  currency?: string;
  invoiceNotes?: string;
}

export interface ThermalReceiptOptions {
  cart: CartItemForReceipt[];
  pharmacyInfo: PharmacyProfileForReceipt;
  customerName: string;
  customerPhone: string;
  currentBillIndex: number;
  returnedQuantities: Map<string, number>;
  saleType?: string;
  additionalDiscount?: number;
  /** Amount received from customer (cash tendered). If omitted, receipt shows total as received and change 0. */
  amountGiven?: number;
}

export interface BuildReceiptOpts {
  /** When false, omits the auto-print script (e.g. for in-app preview). Default true. */
  includePrintScript?: boolean;
  /** Show medicine barcode lines on the receipt (preview only). Default true. */
  showBarcode?: boolean;
}

/**
 * Builds the full thermal receipt HTML from current cart and pharmacy settings.
 * Use this for both in-app preview and real print; pass includePrintScript: false for preview.
 */
export const buildThermalReceiptHtml = (
  options: ThermalReceiptOptions,
  opts: BuildReceiptOpts = {}
): string => {
  const { includePrintScript = true, showBarcode = true } = opts;
  const { cart, pharmacyInfo, customerName, customerPhone, currentBillIndex, returnedQuantities, saleType, additionalDiscount, amountGiven } =
    options;

  if (!cart.length) return '';

  const profile = pharmacyInfo;
  const currencyCode = profile.currency || 'PKR';
  const symbol = getSymbol(currencyCode);

  // Logo: use when non-empty (data URL from Settings → Pharmacy upload, or URL)
  const rawLogoUrl = (profile.logoUrl || '').trim();
  const hasLogo = rawLogoUrl.length > 0;
  // Escape only double-quotes so the HTML attribute is not broken (base64 data URLs don't contain ")
  const safeLogoUrl = hasLogo ? rawLogoUrl.replace(/"/g, '&quot;') : '';

  const subtotal = cart.reduce((sum, item) => {
    const returned = returnedQuantities.get(`${item.medicine.id}_${item.unitPrice}`) || 0;
    const netPills = item.pills - (currentBillIndex >= 0 ? returned : 0);
    return sum + item.unitPrice * netPills;
  }, 0);

  const discountTotal = cart.reduce((sum, item) => {
    const returned = returnedQuantities.get(`${item.medicine.id}_${item.unitPrice}`) || 0;
    const netPills = item.pills - (currentBillIndex >= 0 ? returned : 0);
    const itemSubtotal = item.unitPrice * netPills;
    return sum + (itemSubtotal * item.discount) / 100;
  }, 0);

  const taxTotal = cart.reduce((sum, item) => {
    const returned = returnedQuantities.get(`${item.medicine.id}_${item.unitPrice}`) || 0;
    const netPills = item.pills - (currentBillIndex >= 0 ? returned : 0);
    const itemSubtotal = item.unitPrice * netPills;
    const itemDiscount = (itemSubtotal * item.discount) / 100;
    const discountedAmount = itemSubtotal - itemDiscount;
    return sum + (discountedAmount * item.tax) / 100;
  }, 0);

  const baseTotal = subtotal - discountTotal + taxTotal;
  const additionalDiscountAmount = (saleType === 'Family/Relatives' || saleType === 'Charity' || saleType === 'Employee') && additionalDiscount 
    ? (baseTotal * additionalDiscount) / 100 
    : 0;
  const grandTotal = baseTotal - additionalDiscountAmount;
  const cashReceived = amountGiven != null && amountGiven >= 0 ? amountGiven : grandTotal;
  const changeReturned = Math.max(0, cashReceived - grandTotal);
  const printInvoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
  const now = new Date();

  // Format date as DD/MM/YYYY HH:MM
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateString = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
  const timeString = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const rows = cart
    .map((item, index) => {
      const returned = returnedQuantities.get(`${item.medicine.id}_${item.unitPrice}`) || 0;
      const netPills = item.pills - (currentBillIndex >= 0 ? returned : 0);
      const itemSubtotal = item.unitPrice * netPills;
      const itemDiscount = (itemSubtotal * item.discount) / 100;
      const discountedAmount = itemSubtotal - itemDiscount;
      const itemTax = (discountedAmount * item.tax) / 100;
      const finalPrice = discountedAmount + itemTax;
      const hasReturn = currentBillIndex >= 0 && returned > 0;

      return `
        <tr class="${hasReturn ? 'row-returned' : ''}">
          <td class="col-num">${index + 1}</td>
          <td class="col-name">
            <span class="med-name">${item.medicine.name}</span>
            ${
              showBarcode && item.medicine.barcode
                ? `<span class="med-barcode">${item.medicine.barcode}</span>`
                : ''
            }
            ${hasReturn ? `<span class="med-return">&#8629; Returned: ${returned}</span>` : ''}
          </td>
          <td class="col-qty">${netPills}</td>
          <td class="col-disc">${item.discount > 0 ? item.discount + '%' : '&mdash;'}</td>
          <td class="col-tax">${item.tax > 0 ? item.tax + '%' : '&mdash;'}</td>
          <td class="col-amt">${finalPrice.toFixed(2)}</td>
        </tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${printInvoiceNumber}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    /* Force reliable colors for thermal printing */
    * {
      color: #000 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      background-color: #fff !important;
    }

    @page { size: 80mm auto; margin: 0; }
    html, body {
      width: 302px; /* 80mm ≈ 302px at 96dpi */
      max-width: 80mm;
      background: #fff;
      color: #000;
      font-family: 'Courier New', Courier, monospace;
      font-size: 9.5pt;
      font-weight: 600;
      line-height: 1.35;
    }

    .slip {
      width: 302px;
      max-width: 80mm;
      background: #fff;
      color: #000;
      font-family: 'Courier New', Courier, monospace;
      font-size: 9.5pt;
      font-weight: 600;
      line-height: 1.35;
      padding: 22px 15px 30px;
    }

    .rule-solid { border: none; border-top: 1.5px solid #000; margin: 10px 0; }
    .rule-dash  { border: none; border-top: 1px dashed #000; margin: 8px 0; }
    .rule-eq    { border: none; border-top: 2.5px double #000; margin: 10px 0; }

    /* ── HEADER ── */
    .hdr { text-align: center; }

    /* Logo: large bold circle — white bg, thick black border, black letter (thermal-safe) */
    .logo-wrap {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 62px;
      height: 62px;
      border-radius: 50%;
      background: #fff !important;
      color: #000 !important;
      /* double-ring effect using only border + outline — no box-shadow fill */
      border: 3.5px solid #000;
      outline: 2px solid #000;
      outline-offset: 3px;
      font-size: 28px;
      font-weight: 900;
      font-family: 'Courier New', Courier, monospace;
      margin-bottom: 10px;
      overflow: visible;
    }
    .logo-wrap .logo-initial {
      color: #000 !important;
      background: transparent !important;
      font-size: 28px;
      font-weight: 900;
      line-height: 1;
    }
    .logo-wrap img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 50%;
    }

    /* Pharmacy name */
    .pharmacy-name {
      font-weight: 800;
      letter-spacing: 2px;
      text-transform: uppercase;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
      display: block;
      color: #000;
      margin-top: 2px;
    }
    .pharmacy-name.pharmacy-name-short { font-size: 13.5pt; }
    .pharmacy-name.pharmacy-name-long  { font-size: 9pt; }

    /* Decorative rule under pharmacy name */
    .name-rule {
      display: block;
      width: 60%;
      margin: 5px auto 0;
      border: none;
      border-top: 2px solid #000;
    }

    .tagline {
      font-size: 7.5pt;
      color: #000;
      margin-top: 4px;
      font-style: italic;
      font-weight: 600;
    }
    .contact-line {
      font-size: 7.5pt;
      color: #000;
      margin-top: 5px;
      line-height: 1.65;
      text-align: center;
      display: block;
      width: 100%;
      font-weight: 600;
    }

    /* ── META GRID ── */
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 3px 6px;
      font-size: 8pt;
    }
    .meta-grid .label { color: #000; font-weight: 700; }
    .meta-grid .value { font-weight: 600; text-align: right; color: #000; }
    .inv-num { font-size: 9pt; font-weight: 800; letter-spacing: 0.5px; }

    /* ── CUSTOMER LINE ── */
    .cust-line {
      font-size: 8.5pt;
      display: flex;
      justify-content: space-between;
    }
    .cust-line .cust-label { color: #000; font-weight: 700; }
    .cust-line .cust-val   { font-weight: 600; max-width: 200px; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #000; }

    /* ── TABLE ── */
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      border: 2px solid #000;
      margin-top: 2px;
    }
    thead tr {
      background: #fff !important;
    }
    th {
      font-size: 7.8pt;
      font-weight: 900;
      padding: 6px 3px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #000 !important;
      background: #fff !important;
      border: 1.5px solid #000;
      text-align: center;
      white-space: nowrap;
      /* underline to visually separate from body rows */
      border-bottom: 2.5px solid #000;
    }
    td {
      font-size: 8.5pt;
      padding: 6px 3px;
      vertical-align: top;
      border: 1px solid #000;
      color: #000;
    }
    /* No alternating background — thermal printers can't print fills */

    .col-num  { width: 7%;  text-align: center; }
    .col-name { width: 39%; word-break: break-word; }
    .col-qty  { width: 11%; text-align: center; }
    .col-disc { width: 11%; text-align: center; }
    .col-tax  { width: 11%; text-align: center; }
    .col-amt  { width: 21%; text-align: right; font-weight: 700; }

    .med-name    { display: block; font-weight: 800; font-size: 8.8pt; color: #000; }
    .med-barcode { display: block; font-size: 7pt; color: #000; letter-spacing: 0.5px; margin-top: 1px; font-weight: 600; }
    .med-return  { display: block; font-size: 7pt; color: #000; margin-top: 1px; font-weight: 600; }
    .row-returned td { opacity: 0.65; }

    /* ── TOTALS ── */
    .totals { margin-top: 2px; }
    .tot-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-size: 9pt;
      padding: 3px 0;
    }
    .tot-row .tot-label { color: #000; font-weight: 600; }
    .tot-row .tot-val   { font-weight: 700; min-width: 68px; text-align: right; color: #000; }
    .tot-row.savings .tot-label,
    .tot-row.savings .tot-val { font-weight: 600; }
    .tot-row.tax-row .tot-val  { font-weight: 600; }

    /* Grand total — thick bordered box, no background fill (thermal-safe) */
    .grand-band {
      background: #fff !important;
      border: 2.5px solid #000;
      padding: 7px 8px;
      margin-top: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .grand-label {
      font-size: 10pt;
      font-weight: 900;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: #000 !important;
    }
    .grand-val {
      font-size: 13pt;
      font-weight: 900;
      color: #000 !important;
      letter-spacing: 0.5px;
    }

    /* ── PAYMENT ROWS ── */
    .payment-row {
      display: flex;
      justify-content: space-between;
      font-size: 8.5pt;
      margin-top: 4px;
    }
    .payment-row .payment-label { color: #000; font-weight: 600; }
    .payment-row .payment-val   { font-weight: 700; min-width: 68px; text-align: right; color: #000; }

    /* Change due — slightly emphasised */
    .payment-row.change-row .payment-label,
    .payment-row.change-row .payment-val { font-weight: 800; font-size: 9pt; }

    .items-summary {
      font-size: 7.5pt;
      color: #000;
      text-align: right;
      margin-top: 2px;
      font-weight: 600;
    }

    /* ── THANK YOU ── */
    .thank-you {
      font-size: 11pt;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 4px;
      text-align: center;
      margin: 12px 0;
      color: #000;
    }

    /* ── FOOTER ── */
    .footer {
      margin-top: 2px;
      padding-top: 10px;
      border-top: 1.5px dashed #000;
    }
    .footer .note {
      font-size: 7pt;
      line-height: 1.5;
      color: #000;
      font-style: italic;
      font-weight: 600;
      padding: 7px 10px;
      border: 1.5px solid #000;
      border-radius: 3px;
      text-align: center;
    }
    .footer .powered {
      font-size: 6pt;
      color: #000;
      margin-top: 10px;
      letter-spacing: 0.8px;
      text-align: center;
      text-transform: uppercase;
      font-weight: 600;
    }

    @media print {
      html, body { background: #fff; }
      .slip { padding: 16px 12px 24px; }
      .logo-wrap {
        border: 3.5px solid #000;
        outline: 2px solid #000;
        outline-offset: 3px;
        background: #fff !important;
      }
      .logo-wrap .logo-initial { color: #000 !important; }
      .grand-band { border: 2.5px solid #000; background: #fff !important; }
      .grand-label, .grand-val { color: #000 !important; }
    }
  </style>
</head>
<body>
  <div class="slip">

    <div class="hdr">
      <div class="logo-wrap">
        ${
          hasLogo
            ? `<img src="${safeLogoUrl}" alt="logo" decoding="async" style="display:block;width:100%;height:100%;object-fit:cover;" />`
            : `<span class="logo-initial">${profile.pharmacyName?.[0]?.toUpperCase() || 'P'}</span>`
        }
      </div>
      <div class="pharmacy-name ${(profile.pharmacyName || '').length > 25 ? 'pharmacy-name-long' : 'pharmacy-name-short'}">${profile.pharmacyName || 'Your Pharmacy'}</div>
      <hr class="name-rule" />
      ${profile.tagline ? `<div class="tagline">${profile.tagline}</div>` : ''}
      <div class="contact-line">
        ${profile.address || ''}
        ${profile.phone ? `<br/>Tel: ${profile.phone}` : ''}
        ${profile.email ? `<br/>${profile.email}` : ''}
        ${profile.website ? `<br/>${profile.website}` : ''}
      </div>
    </div>

    <hr class="rule-solid" />

    <div class="meta-grid">
      <span class="label">Invoice No.</span>
      <span class="value inv-num">${printInvoiceNumber}</span>
      <span class="label">Date</span>
      <span class="value">${dateString}</span>
      <span class="label">Time</span>
      <span class="value">${timeString}</span>
      ${profile.taxId ? `<span class="label">Tax ID</span><span class="value">${profile.taxId}</span>` : ''}
    </div>

    <hr class="rule-dash" />

    <div class="cust-line">
      <span class="cust-label">Customer:</span>
      <span class="cust-val">${customerName || 'Walk-in Customer'}${customerPhone ? ` | ${customerPhone}` : ''}</span>
    </div>

    <hr class="rule-solid" />

    <table>
      <thead>
        <tr>
          <th class="col-num">#</th>
          <th class="col-name">Medicine</th>
          <th class="col-qty">Qty</th>
          <th class="col-disc">Dis%</th>
          <th class="col-tax">Tax%</th>
          <th class="col-amt">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <div class="items-summary">${cart.length} item${cart.length !== 1 ? 's' : ''}</div>

    <hr class="rule-dash" />

    <div class="totals">
      <div class="tot-row">
        <span class="tot-label">Subtotal</span>
        <span class="tot-val">${symbol}${subtotal.toFixed(2)}</span>
      </div>
      ${
        discountTotal > 0
          ? `<div class="tot-row savings">
              <span class="tot-label">Discount (saved)</span>
              <span class="tot-val">&minus; ${symbol}${discountTotal.toFixed(2)}</span>
            </div>`
          : ''
      }
      ${
        taxTotal > 0
          ? `<div class="tot-row tax-row">
              <span class="tot-label">Tax (GST)</span>
              <span class="tot-val">+ ${symbol}${taxTotal.toFixed(2)}</span>
            </div>`
          : ''
      }
      ${
        additionalDiscountAmount > 0
          ? `<div class="tot-row savings">
              <span class="tot-label">Extra Discount (${additionalDiscount}%)</span>
              <span class="tot-val">&minus; ${symbol}${additionalDiscountAmount.toFixed(2)}</span>
            </div>`
          : ''
      }
    </div>

    <hr class="rule-eq" />

    <!-- Grand total — inverted black band for maximum impact -->
    <div class="grand-band">
      <span class="grand-label">Total</span>
      <span class="grand-val">${symbol}${grandTotal.toFixed(2)}</span>
    </div>

    <div class="payment-row" style="margin-top:8px;">
      <span class="payment-label">Cash Received</span>
      <span class="payment-val">${symbol}${cashReceived.toFixed(2)}</span>
    </div>
    <div class="payment-row change-row">
      <span class="payment-label">Change</span>
      <span class="payment-val">${symbol}${changeReturned.toFixed(2)}</span>
    </div>

    <hr class="rule-solid" />

    <div class="thank-you">&#10022; Thank You &#10022;</div>

    <div class="footer">
      <div class="note">
        ${profile.invoiceNotes || 'Medicines once sold will not be returned without a valid reason and original bill.'}
      </div>
      <div class="powered">Printed by Innovation Technology &bull; 03405939713</div>
    </div>

  </div>

  ${
    includePrintScript
      ? `<script>
    window.onload = function () { window.print(); };
  </script>`
      : ''
  }
</body>
</html>`;

  return html;
};

export const printThermalReceipt = (options: ThermalReceiptOptions): void => {
  if (!options.cart.length) {
    alert('Add medicines to the cart to print an invoice.');
    return;
  }
  const html = buildThermalReceiptHtml(options, { includePrintScript: true });
  const printFrame = document.createElement('iframe');
  printFrame.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(printFrame);
  const frameDoc = printFrame.contentWindow?.document;
  if (!frameDoc) {
    alert('Unable to prepare invoice for printing.');
    document.body.removeChild(printFrame);
    return;
  }
  frameDoc.open();
  frameDoc.write(html);
  frameDoc.close();
  printFrame.onload = () => {
    printFrame.contentWindow?.focus();
    printFrame.contentWindow?.print();
    setTimeout(() => document.body.removeChild(printFrame), 1000);
  };
};