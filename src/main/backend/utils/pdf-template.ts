/**
 * Professional PDF Template Utility
 * Provides consistent, professional PDF design across all reports
 */

export interface PDFTemplateOptions {
  title: string;
  documentType: 'SALES' | 'PURCHASE' | 'PAYMENT' | 'RETURN';
  documentNumber?: string;
  period?: { from?: string; to?: string };
  currency?: string;
  settings: {
    pharmacyName?: string;
    address?: string;
    phone?: string;
    email?: string;
    website?: string;
    taxId?: string;
    logoUrl?: string;
  };
}

export const getProfessionalPDFStyles = () => `
  @page {
    size: A4;
    margin: 0;
  }
  
  body { 
    font-family: 'Arial', sans-serif; 
    font-size: 10pt; 
    color: #000; 
    margin: 0; 
    padding: 0;
    box-sizing: border-box;
  }
  
  .container { 
    padding: 20px 30px 45px; 
    position: relative;
    page-break-after: avoid;
  }

  /* Same credit line as the thermal receipt, pinned to the bottom of every page */
  .developed-by {
    position: fixed;
    left: 30px;
    right: 30px;
    bottom: 12px;
    padding-top: 6px;
    border-top: 1px dashed #000;
    font-size: 7pt;
    font-weight: 600;
    letter-spacing: 0.8px;
    text-align: center;
    text-transform: uppercase;
    color: #000;
  }
  
  /* Header */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
    margin-bottom: 22px;
    padding-bottom: 16px;
    border-bottom: 2px solid #000;
  }

  .company-info {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }

  .company-logo {
    flex-shrink: 0;
    width: 78px;
    height: 78px;
    border: 1px solid #d4d4d4;
    border-radius: 6px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fff;
  }

  .company-logo img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .company-logo .initial {
    font-size: 30pt;
    font-weight: bold;
    color: #047857;
  }

  .company-text {
    min-width: 0;
  }

  .company-name-large {
    font-size: 15pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    line-height: 1.2;
  }

  .company-address {
    margin-top: 6px;
    font-size: 8.5pt;
    line-height: 1.6;
    color: #333;
  }

  .company-address .label {
    color: #777;
    display: inline-block;
    min-width: 42px;
  }

  .doc-info {
    flex-shrink: 0;
    width: 250px;
  }

  .doc-type-title {
    font-size: 15pt;
    font-weight: bold;
    letter-spacing: 1.5px;
    text-align: right;
    text-transform: uppercase;
    margin-bottom: 8px;
  }

  .doc-details {
    border: 1px solid #000;
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    padding: 5px 10px;
    font-size: 8.5pt;
    border-bottom: 1px solid #e5e5e5;
  }

  .detail-row:last-child {
    border-bottom: none;
  }

  .detail-label {
    color: #666;
    text-transform: uppercase;
    font-size: 7.5pt;
    letter-spacing: 0.6px;
    padding-top: 1px;
  }

  .detail-value {
    font-weight: bold;
    text-align: right;
  }

  /* Table */
  table { 
    width: 100%; 
    border-collapse: collapse; 
    margin-top: 20px; 
    border: none;
    page-break-inside: auto;
  }
  
  thead {
    display: table-header-group;
  }
  
  tbody {
    display: table-row-group;
  }
  
  tr {
    page-break-inside: avoid;
    page-break-after: auto;
  }
  
  th { 
    background-color: #f5f5f5; 
    font-weight: normal; 
    text-transform: uppercase; 
    font-size: 8pt;
    padding: 10px 8px;
    text-align: left;
    border: none;
    border-bottom: 2px solid #000;
    letter-spacing: 0.5px;
  }
  
  td { 
    padding: 8px; 
    font-size: 9pt; 
    border: none;
    vertical-align: top;
    font-weight: normal;
  }
  
  tbody tr:nth-child(even) {
    background-color: transparent;
  }
  
  tbody tr:hover {
    background-color: transparent;
  }
  
  .text-right { 
    text-align: right; 
    font-weight: normal; 
  }
  
  .text-center { 
    text-align: center; 
  }
  
  /* Footer */
  .footer { 
    margin-top: 30px; 
    padding-top: 20px;
    border-top: 2px solid #000;
    page-break-inside: avoid;
  }
  
  .footer-content {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  
  .footer-left {
    flex: 1;
    font-size: 9pt;
  }
  
  .footer-right {
    flex: 1;
    text-align: right;
  }
  
  .totals-table {
    display: inline-block;
    min-width: 300px;
  }
  
  .totals-row { 
    display: flex; 
    justify-content: space-between; 
    padding: 6px 10px; 
    border-bottom: 1px solid #ddd; 
    font-size: 10pt; 
  }
  
  .totals-row.grand { 
    font-weight: bold; 
    font-size: 11pt; 
    border-top: 2px solid #000; 
    border-bottom: 2px solid #000; 
    margin-top: 5px;
    background-color: #f5f5f5;
  }
  
  .totals-label {
    font-weight: normal;
  }
  
  .totals-value {
    font-weight: bold;
    min-width: 120px;
    text-align: right;
  }
  
  .signature-section { 
    margin-top: 60px; 
    text-align: left;
  }
  
  .signature-line { 
    border-top: 1px solid #000; 
    display: inline-block; 
    width: 250px; 
    margin-top: 50px; 
  }
  
  .signature-label { 
    margin-top: 5px; 
    font-size: 9pt; 
    font-weight: normal;
  }
  
  .remark {
    margin-top: 15px;
    font-size: 9pt;
    color: #555;
    font-weight: normal;
  }
  
  /* Badges */
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 3px;
    font-size: 8pt;
    font-weight: normal;
  }
  
  .badge-success { background-color: #d1fae5; color: #065f46; }
  .badge-warning { background-color: #fef3c7; color: #92400e; }
  .badge-danger { background-color: #fee2e2; color: #991b1b; }
  .badge-info { background-color: #dbeafe; color: #1e40af; }
  .badge-purple { background-color: #e9d5ff; color: #6b21a8; }
  .badge-gray { background-color: #f3f4f6; color: #374151; }
`;

const escapeHtml = (v: unknown): string =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** "2026-10-01" (or any date string) -> "01 Oct 2026"; date-only strings are read as local dates. */
const formatHeaderDate = (value: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const generatePDFHeader = (options: PDFTemplateOptions): string => {
  const { documentType, documentNumber, period, currency, settings } = options;

  const docNum = documentNumber || `${documentType.substring(0, 3)}-${new Date().getTime().toString().slice(-6)}`;
  const periodText = period?.from && period?.to
    ? `${formatHeaderDate(period.from)} &ndash; ${formatHeaderDate(period.to)}`
    : period?.from
    ? `From ${formatHeaderDate(period.from)}`
    : period?.to
    ? `Until ${formatHeaderDate(period.to)}`
    : 'All Time';

  const now = new Date();
  const generatedOn = `${now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;

  // Logo from Settings → Pharmacy, or the first letter of the pharmacy name
  const firstLetter = (settings.pharmacyName || 'P').charAt(0).toUpperCase();
  const logoHtml = settings.logoUrl
    ? `<img src="${settings.logoUrl.replace(/"/g, '&quot;')}" alt="Logo" />`
    : `<span class="initial">${escapeHtml(firstLetter)}</span>`;

  const contactLines = [
    settings.address && escapeHtml(settings.address),
    settings.phone && `<span class="label">Tel</span>${escapeHtml(settings.phone)}`,
    settings.email && `<span class="label">Email</span>${escapeHtml(settings.email)}`,
    settings.website && `<span class="label">Web</span>${escapeHtml(settings.website)}`,
    settings.taxId && `<span class="label">Tax ID</span>${escapeHtml(settings.taxId)}`,
  ].filter(Boolean);

  const detailRow = (label: string, value: string) => `
    <div class="detail-row">
      <span class="detail-label">${label}</span>
      <span class="detail-value">${value}</span>
    </div>`;

  return `
    <div class="header">
      <div class="company-info">
        <div class="company-logo">${logoHtml}</div>
        <div class="company-text">
          <div class="company-name-large">${escapeHtml(settings.pharmacyName || 'Pharmacy Name')}</div>
          ${contactLines.length ? `<div class="company-address">${contactLines.join('<br/>')}</div>` : ''}
        </div>
      </div>

      <div class="doc-info">
        <div class="doc-type-title">${documentType} Report</div>
        <div class="doc-details">
          ${detailRow('Report No.', escapeHtml(docNum))}
          ${detailRow('Period', periodText)}
          ${detailRow('Generated', generatedOn)}
          ${detailRow('Currency', escapeHtml(currency || 'PKR'))}
        </div>
      </div>
    </div>
  `;
};

export const generatePDFFooter = (
  currencySymbol: string,
  currency: string,
  totalAmount: number,
  additionalInfo?: string
): string => {
  return `
    <div class="footer">
      <div class="footer-content">
        <div class="footer-left">
          <div class="remark">
            <strong>${currency}</strong> - Total Value of <strong>${currencySymbol}${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> Only
          </div>
          ${additionalInfo ? `
          <div class="remark">
            ${additionalInfo}
          </div>
          ` : ''}
          <div class="remark">
            <strong>Remark:</strong> Computer Generated Report
          </div>
          <div style="margin-top: 10px; font-size: 8pt; font-weight: bold; border: 1px solid #000; padding: 3px 6px; display: inline-block;">
            E. & O.E.
          </div>
          
          <div class="signature-section">
            <div class="signature-line"></div>
            <div class="signature-label">Company Chop & Signature</div>
            <div style="font-size: 8pt; margin-top: 3px; color: #666;">Name</div>
            <div style="font-size: 8pt; color: #666;">Date</div>
          </div>
        </div>

        <div class="footer-right">
          <div class="totals-table">
            <div class="totals-row grand">
              <span class="totals-label">Total Amount:</span>
              <span class="totals-value">${currencySymbol}${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
};

export const wrapPDFContent = (styles: string, header: string, tableContent: string, footer: string): string => {
  return `
    <html>
    <head>
      <meta charset='utf-8' />
      <style>
        ${styles}
      </style>
    </head>
    <body>
      <div class="container">
        ${header}
        ${tableContent}
        ${footer}
      </div>
      <div class="developed-by">Developed by Innovation Technologies &bull; 03405939713</div>
    </body>
    </html>
  `;
};
