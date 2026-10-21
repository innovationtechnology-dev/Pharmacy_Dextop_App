/**
 * Channels whose handlers open a Save/Open dialog on the computer that runs them. From another
 * computer they would pop the dialog on the main computer's screen (and the file would land
 * there), so they only work on the main computer itself.
 */
export const MAIN_COMPUTER_ONLY_CHANNELS = new Set<string>([
  'sales-export-csv',
  'sales-export-csv-range',
  'sales-export-pdf',
  'purchase-export-csv',
  'purchase-export-pdf',
  'payment-export-csv',
  'payment-export-pdf',
  'sale-return-export-csv',
  'sale-return-export-pdf',
  'super-admin-download-database',
  'backup-choose-folder',
  'backup-open-folder',
  'backup-export-copy',
  'super-admin-import-database',
]);

export const MAIN_COMPUTER_ONLY_MESSAGE =
  'This only works on the main computer. Please do it there.';
