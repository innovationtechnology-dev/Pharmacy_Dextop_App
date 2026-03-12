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
  returnedQuantities: Map<number, number>;
  /** Amount received from customer (cash tendered). If omitted, receipt shows total as received and change 0. */
  amountGiven?: number;
}

export interface BuildReceiptOpts {
  /** When false, omits the auto-print script (e.g. for in-app preview). Default true. */
  includePrintScript?: boolean;
}

/**
 * Builds the full thermal receipt HTML from current cart and pharmacy settings.
 * Use this for both in-app preview and real print; pass includePrintScript: false for preview.
 */
export const buildThermalReceiptHtml = (
  options: ThermalReceiptOptions,
  opts: BuildReceiptOpts = {}
): string => {
  const { includePrintScript = true } = opts;
  const { cart, pharmacyInfo, customerName, customerPhone, currentBillIndex, returnedQuantities, amountGiven } =
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
    const returned = returnedQuantities.get(item.medicine.id) || 0;
    const netPills = item.pills - (currentBillIndex >= 0 ? returned : 0);
    return sum + item.unitPrice * netPills;
  }, 0);

  const discountTotal = cart.reduce((sum, item) => {
    const returned = returnedQuantities.get(item.medicine.id) || 0;
    const netPills = item.pills - (currentBillIndex >= 0 ? returned : 0);
    const itemSubtotal = item.unitPrice * netPills;
    return sum + (itemSubtotal * item.discount) / 100;
  }, 0);

  const taxTotal = cart.reduce((sum, item) => {
    const returned = returnedQuantities.get(item.medicine.id) || 0;
    const netPills = item.pills - (currentBillIndex >= 0 ? returned : 0);
    const itemSubtotal = item.unitPrice * netPills;
    return sum + (itemSubtotal * item.tax) / 100;
  }, 0);

  const grandTotal = subtotal - discountTotal + taxTotal;
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
      const returned = returnedQuantities.get(item.medicine.id) || 0;
      const netPills = item.pills - (currentBillIndex >= 0 ? returned : 0);
      const itemSubtotal = item.unitPrice * netPills;
      const itemDiscount = (itemSubtotal * item.discount) / 100;
      const itemTax = (itemSubtotal * item.tax) / 100;
      const finalPrice = itemSubtotal - itemDiscount + itemTax;
      const hasReturn = currentBillIndex >= 0 && returned > 0;

      return `
        <tr class="${hasReturn ? 'row-returned' : ''}">
          <td class="col-num">${index + 1}</td>
          <td class="col-name">
            <span class="med-name">${item.medicine.name}</span>
            ${item.medicine.barcode ? `<span class="med-barcode">${item.medicine.barcode}</span>` : ''}
            ${hasReturn ? `<span class="med-return">↩ Returned: ${returned}</span>` : ''}
          </td>
          <td class="col-qty">${netPills}</td>
          <td class="col-rate">${symbol}${item.unitPrice.toFixed(2)}</td>
          <td class="col-disc">${item.discount > 0 ? item.discount + '%' : '—'}</td>
          <td class="col-amt">${symbol}${finalPrice.toFixed(2)}</td>
        </tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${printInvoiceNumber}</title>
  <style>
    /* Match receipt-preview.html exactly for print */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    @page { size: 80mm auto; margin: 0; }
    html, body {
      width: 302px; /* 80mm ≈ 302px at 96dpi */
      max-width: 80mm;
      background: #fff;
      color: #0a0a0a;
      font-family: 'Courier New', Courier, monospace;
      font-size: 9pt;
      line-height: 1.35;
    }

    .slip {
      width: 302px;
      max-width: 80mm;
      background: #fff;
      color: #0a0a0a;
      font-family: 'Courier New', Courier, monospace;
      font-size: 9pt;
      line-height: 1.35;
      padding: 22px 15px 30px;
    }

    .rule-solid { border: none; border-top: 1.5px solid #0a0a0a; margin: 10px 0; }
    .rule-dash  { border: none; border-top: 1px dashed #777;     margin: 8px 0; }
    .rule-eq    { border: none; border-top: 2px double #0a0a0a;  margin: 10px 0; }

    .hdr { text-align: center; }
    .logo-wrap {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 42px;
      height: 42px;
      border-radius: 50%;
      background: #0a0a0a;
      color: #fff;
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 6px;
      overflow: hidden;
    }
    .logo-wrap img { width: 100%; height: 100%; object-fit: cover; }
    .pharmacy-name {
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
      display: block;
    }
    .pharmacy-name.pharmacy-name-short { font-size: 14pt; }
    .pharmacy-name.pharmacy-name-long { font-size: 9pt; }
    .tagline {
      font-size: 7.5pt;
      color: #555;
      margin-top: 2px;
      font-style: italic;
    }
    .contact-line {
      font-size: 7.5pt;
      color: #444;
      margin-top: 4px;
      line-height: 1.6;
      text-align: left;
      display: block;
      width: 100%;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 3px 6px;
      font-size: 8pt;
    }
    .meta-grid .label { color: #666; }
    .meta-grid .value { font-weight: 600; text-align: right; }
    .inv-num { font-size: 9pt; font-weight: 700; }

    .cust-line {
      font-size: 8.5pt;
      display: flex;
      justify-content: space-between;
    }
    .cust-line .cust-label { color: #666; }
    .cust-line .cust-val   { font-weight: 600; max-width: 200px; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    table { width: 100%; border-collapse: collapse; }
    thead tr {
      border-top: 1.5px solid #0a0a0a;
      border-bottom: 1.5px solid #0a0a0a;
    }
    th {
      font-size: 7.5pt;
      font-weight: 700;
      padding: 5px 2px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    td {
      font-size: 8pt;
      padding: 6px 2px;
      vertical-align: top;
      border-bottom: 0.5px dashed #ccc;
    }
    tbody tr:last-child td { border-bottom: none; }

    .col-num  { width: 6%;  text-align: center; }
    .col-name { width: 36%; }
    .col-qty  { width: 10%; text-align: center; }
    .col-rate { width: 16%; text-align: right; }
    .col-disc { width: 12%; text-align: center; }
    .col-amt  { width: 20%; text-align: right; font-weight: 600; }

    .med-name    { display: block; font-weight: 700; font-size: 8pt; }
    .med-barcode { display: block; font-size: 6.5pt; color: #888; letter-spacing: 0.5px; margin-top: 1px; }
    .med-return  { display: block; font-size: 7pt; color: #b91c1c; margin-top: 1px; }
    .row-returned td { opacity: 0.75; }

    .totals { margin-top: 2px; }
    .tot-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-size: 8.5pt;
      padding: 2px 0;
    }
    .tot-row .tot-label { color: #444; }
    .tot-row .tot-val   { font-weight: 600; min-width: 68px; text-align: right; }
    .tot-row.savings .tot-label { color: #166534; }
    .tot-row.savings .tot-val   { color: #166534; }
    .tot-row.tax-row .tot-val   { color: #92400e; }

    .payment-row {
      display: flex;
      justify-content: space-between;
      font-size: 8.5pt;
      margin-top: 4px;
    }
    .payment-row .payment-label { color: #444; }
    .payment-row .payment-val   { font-weight: 600; min-width: 68px; text-align: right; }

    .grand-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding: 5px 0 2px;
      border-top: 1.5px solid #0a0a0a;
    }
    .grand-label { font-size: 11pt; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; }
    .grand-val   { font-size: 13pt; font-weight: 700; }

    .items-summary {
      font-size: 7.5pt;
      color: #888;
      text-align: right;
      margin-top: 2px;
    }

    .thank-you {
      font-size: 11pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 3px;
      text-align: center;
      margin: 10px 0 12px;
    }
    .footer {
      margin-top: 2px;
      padding-top: 10px;
      border-top: 1px dashed #ccc;
    }
    .footer .note {
      font-size: 7pt;
      line-height: 1.45;
      color: #555;
      font-style: italic;
      padding: 8px 10px;
      background: #f5f5f5;
      border: 1px solid #e8e8e8;
      border-radius: 3px;
      text-align: center;
    }
    .footer .powered {
      font-size: 6pt;
      color: #888;
      margin-top: 10px;
      letter-spacing: 0.8px;
      text-align: center;
      text-transform: uppercase;
    }

    @media print {
      html, body { background: #fff; }
      .slip { padding: 16px 12px 24px; }
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
            : `${profile.pharmacyName?.[0]?.toUpperCase() || 'P'}`
        }
      </div>
      <div class="pharmacy-name ${(profile.pharmacyName || '').length > 25 ? 'pharmacy-name-long' : 'pharmacy-name-short'}">${profile.pharmacyName || 'Your Pharmacy'}</div>
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
          <th class="col-rate">Rate</th>
          <th class="col-disc">Disc%</th>
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
              <span class="tot-val">- ${symbol}${discountTotal.toFixed(2)}</span>
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
    </div>

    <hr class="rule-eq" />

    <div class="grand-row">
      <span class="grand-label">Total</span>
      <span class="grand-val">${symbol}${grandTotal.toFixed(2)}</span>
    </div>

    <div class="payment-row">
      <span class="payment-label">Cash received</span>
      <span class="payment-val">${symbol}${cashReceived.toFixed(2)}</span>
    </div>
    <div class="payment-row">
      <span class="payment-label">Change</span>
      <span class="payment-val">${symbol}${changeReturned.toFixed(2)}</span>
    </div>

    <hr class="rule-solid" />

    <div class="thank-you">Thank You!</div>

    <div class="footer">
      <div class="note">
        ${profile.invoiceNotes || 'Medicines once sold will not be returned without a valid reason and original bill.'}
      </div>
      <div class="powered">Printed by innovation technology 03405939713</div>
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
