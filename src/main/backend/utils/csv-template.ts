/**
 * Professional CSV Template Utility
 * Provides consistent, professional CSV format across all reports
 */

export interface CSVTemplateOptions {
  title: string;
  documentType: 'SALES' | 'PURCHASE' | 'PAYMENT' | 'RETURN';
  period?: { from?: string; to?: string };
  settings: {
    pharmacyName?: string;
    address?: string;
    phone?: string;
    email?: string;
    website?: string;
    taxId?: string;
  };
}

export const generateCSVHeader = (options: CSVTemplateOptions): string[] => {
  const { title, documentType, period, settings } = options;
  
  const periodText = period?.from && period?.to 
    ? `${period.from} to ${period.to}` 
    : period?.from 
    ? `From ${period.from}` 
    : period?.to 
    ? `Until ${period.to}` 
    : 'All Time';
  
  const header: string[] = [
    `"${title}"`,
    '',
    `"Company Name","${settings.pharmacyName || 'Pharmacy Name'}"`,
    `"Address","${settings.address || ''}"`,
    `"Phone","${settings.phone || ''}"`,
    `"Email","${settings.email || ''}"`,
    `"Website",${settings.website || ' '}`
  ];
  
  if (settings.taxId) {
    header.push(`"Tax ID","${settings.taxId}"`);
  }
  
  header.push(
    '',
    `"Report Type","${documentType} REPORT"`,
    `"Period","${periodText}"`,
    `"Generated On","${new Date().toLocaleString()}"`,
    ''
  );
  
  return header;
};

export const generateCSVFooter = (
  totalRecords: number,
  totalAmount: number,
  currency: string,
  additionalInfo?: { label: string; value: string | number }[]
): string[] => {
  const footer: string[] = [
    '',
    `"SUMMARY"`,
    `"Total Records","${totalRecords}"`,
    `"Total Amount","${totalAmount.toFixed(2)}"`,
    `"Currency","${currency}"`,
  ];
  
  if (additionalInfo && additionalInfo.length > 0) {
    footer.push('');
    additionalInfo.forEach(info => {
      footer.push(`"${info.label}","${info.value}"`);
    });
  }
  
  footer.push(
    '',
    `"Remark","Computer Generated Report"`,
    `"E. & O.E.","Errors and Omissions Excepted"`
  );
  
  return footer;
};

export const escapeCSVValue = (value: any): string => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Escape quotes and wrap in quotes if contains comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

export const generateCSVRow = (values: any[]): string => {
  return values.map(escapeCSVValue).join(',');
};

export const wrapCSVContent = (
  header: string[],
  dataRows: string[],
  footer: string[]
): string => {
  return [...header, ...dataRows, ...footer].join('\n');
};
