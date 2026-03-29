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
    padding: 20px 30px; 
    position: relative;
    page-break-after: avoid;
  }
  
  /* Header */
  .header { 
    display: flex; 
    justify-content: space-between; 
    margin-bottom: 30px; 
    padding-bottom: 20px; 
    border-bottom: 1px solid #000; 
  }
  
  .company-info { 
    flex: 1;
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: 10px;
  }
  
  .company-logo {
    flex-shrink: 0;
  }
  
  .company-text {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  
  .company-name-large {
    font-size: 12pt;
    font-weight: bold;
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  .company-address {
    font-size: 9pt;
    line-height: 1.5;
    color: #000;
  }
  
  .doc-info { 
    text-align: right;
    flex: 1;
  }
  
  .doc-title-large { 
    font-size: 14pt; 
    font-weight: bold; 
    color: #000; 
    margin-bottom: 20px; 
    letter-spacing: 0.5px;
  }
  
  .doc-details {
    text-align: left;
    display: inline-block;
  }
  
  .detail-row {
    display: flex;
    margin-bottom: 4px;
    font-size: 9pt;
  }
  
  .detail-label {
    width: 100px;
    font-weight: normal;
  }
  
  .detail-value {
    font-weight: normal;
    margin-left: 4px;
  }
  
  .doc-type-title {
    margin-bottom: 8px;
    font-size: 10pt;
    font-weight: bold;
    text-align: left;
    letter-spacing: 0.5px;
    color: #000;
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

export const generatePDFHeader = (options: PDFTemplateOptions): string => {
  const { title, documentType, documentNumber, period, currency, settings } = options;
  
  const docNum = documentNumber || `${documentType.substring(0, 3)}-${new Date().getTime().toString().slice(-6)}`;
  const periodText = period?.from && period?.to 
    ? `${period.from} to ${period.to}` 
    : period?.from 
    ? `From ${period.from}` 
    : period?.to 
    ? `Until ${period.to}` 
    : 'All Time';
  
  // Get first letter of pharmacy name for fallback logo
  const firstLetter = (settings.pharmacyName || 'P').charAt(0).toUpperCase();
  
  // Determine logo to display
  const logoHtml = settings.logoUrl 
    ? `<img src="${settings.logoUrl}" alt="Logo" style="width: 120px; height: 120px; object-fit: contain;" />`
    : `
      <svg width="80" height="80" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="45" fill="#4CAF50" opacity="0.2"/>
        <text x="50" y="62" text-anchor="middle" font-size="40" fill="#4CAF50" font-weight="bold" font-family="Arial">${firstLetter}</text>
      </svg>
    `;
  
  return `
    <div class="header">
      <div class="company-info">
        <div class="company-logo">
          ${logoHtml}
        </div>
        <div class="company-text">
          <div class="company-name-large">${settings.pharmacyName || 'PHARMACY NAME'}</div>
          <div class="company-address">
            ${settings.address || ' '}<br/>
            Tel: ${settings.phone || ' '}<br/>
            Email: ${settings.email || ' '}
            ${settings.website
            ? `<br/>Web: ${settings.website}`
            : ' '
            }
            ${settings.taxId
            ? `<br/>Tax ID: ${settings.taxId}`
            : ' '
            }
          </div>

        </div>
      </div>
      
      <div class="doc-info">
        <div class="doc-details">
          <div class="doc-type-title">${documentType} REPORT</div>
          <div class="detail-row">
            <span class="detail-label">${title}</span>
            <span class="detail-value">: ${docNum}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">DATE</span>
            <span class="detail-value">: ${new Date().toLocaleDateString()}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">PERIOD</span>
            <span class="detail-value">: ${periodText}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">CURRENCY</span>
            <span class="detail-value">: ${currency || 'PKR'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">PAGE</span>
            <span class="detail-value">: 1 of 1</span>
          </div>
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
    </body>
    </html>
  `;
};
