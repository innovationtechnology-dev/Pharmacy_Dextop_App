import { ipcMain, IpcMainEvent } from 'electron';
import { PurchaseService, Purchase } from '../services/purchase.service';
import { currencySymbols, getCurrencySymbol } from '../../../common/currency';

export class PurchaseController {
  private purchaseService: PurchaseService;

  constructor() {
    this.purchaseService = new PurchaseService();
    this.registerHandlers();
  }

  /**
   * Initialize tables
   */
  public async initializeTables(): Promise<void> {
    await this.purchaseService.initializeTable();
  }

  /**
   * Register all IPC handlers for purchase operations
   */
  private registerHandlers(): void {
    // Create purchase
    ipcMain.on('purchase-create', async (event: IpcMainEvent, args: any[]) => {
      try {
        const purchase = args[0] as Purchase;
        const purchaseId = await this.purchaseService.createPurchase(purchase);
        event.reply('purchase-create-reply', { success: true, data: { id: purchaseId } });
      } catch (error) {
        console.error('Create purchase error:', error);
        event.reply('purchase-create-reply', { success: false, error: String(error) });
      }
    });

    // Get all purchases
    ipcMain.on('purchase-get-all', async (event: IpcMainEvent, args: any[]) => {
      try {
        const fromDate = args?.[0] as string | undefined;
        const toDate = args?.[1] as string | undefined;
        const purchases = await this.purchaseService.getAllPurchases(fromDate, toDate);
        event.reply('purchase-get-all-reply', { success: true, data: purchases });
      } catch (error) {
        console.error('Get all purchases error:', error);
        event.reply('purchase-get-all-reply', { success: false, error: String(error) });
      }
    });

    // Get purchase by ID
    ipcMain.on('purchase-get-by-id', async (event: IpcMainEvent, args: any[]) => {
      try {
        const id = args[0] as number;
        const purchase = await this.purchaseService.getPurchaseById(id);
        event.reply('purchase-get-by-id-reply', { success: true, data: purchase });
      } catch (error) {
        console.error('Get purchase by ID error:', error);
        event.reply('purchase-get-by-id-reply', { success: false, error: String(error) });
      }
    });

    // Get purchases total by date range
    ipcMain.on('purchase-get-total-by-date-range', async (event: IpcMainEvent, args: any[]) => {
      try {
        const fromDate = args[0] as string;
        const toDate = args[1] as string;
        const total = await this.purchaseService.getPurchasesByDateRange(fromDate, toDate);
        event.reply('purchase-get-total-by-date-range-reply', { success: true, data: total });
      } catch (error) {
        console.error('Get purchase total by date range error:', error);
        event.reply('purchase-get-total-by-date-range-reply', { success: false, error: String(error) });
      }
    });

    // Get total remaining payments
    ipcMain.on('purchase-get-total-remaining', async (event: IpcMainEvent) => {
      try {
        const total = await this.purchaseService.getTotalRemainingPayments();
        event.reply('purchase-get-total-remaining-reply', { success: true, data: total });
      } catch (error) {
        console.error('Get total remaining payments error:', error);
        event.reply('purchase-get-total-remaining-reply', { success: false, error: String(error) });
      }
    });

    // Get remaining payments by date range
    ipcMain.on('purchase-get-remaining-by-date-range', async (event: IpcMainEvent, args: any[]) => {
      try {
        const fromDate = args[0] as string;
        const toDate = args[1] as string;
        const total = await this.purchaseService.getRemainingPaymentsByDateRange(fromDate, toDate);
        event.reply('purchase-get-remaining-by-date-range-reply', { success: true, data: total });
      } catch (error) {
        console.error('Get remaining payments by date range error:', error);
        event.reply('purchase-get-remaining-by-date-range-reply', { success: false, error: String(error) });
      }
    });

    // Get supplier debt summary
    ipcMain.on('purchase-get-supplier-debt-summary', async (event: IpcMainEvent) => {
      try {
        const summary = await this.purchaseService.getSupplierDebtSummary();
        event.reply('purchase-get-supplier-debt-summary-reply', { success: true, data: summary });
      } catch (error) {
        console.error('Get supplier debt summary error:', error);
        event.reply('purchase-get-supplier-debt-summary-reply', { success: false, error: String(error) });
      }
    });

    // Get supplier debt
    ipcMain.on('purchase-get-supplier-debt', async (event: IpcMainEvent, args: any[]) => {
      try {
        const supplierId = args[0] as number;
        const debt = await this.purchaseService.getSupplierDebt(supplierId);
        event.reply('purchase-get-supplier-debt-reply', { success: true, data: debt });
      } catch (error) {
        console.error('Get supplier debt error:', error);
        event.reply('purchase-get-supplier-debt-reply', { success: false, error: String(error) });
      }
    });

    // Update purchase payment (add additional payment)
    ipcMain.on('purchase-update-payment', async (event: IpcMainEvent, args: any[]) => {
      try {
        const purchaseId = args[0] as number;
        const additionalPayment = args[1] as number;
        await this.purchaseService.updatePurchasePayment(purchaseId, additionalPayment);
        event.reply('purchase-update-payment-reply', { success: true });
      } catch (error) {
        console.error('Update purchase payment error:', error);
        event.reply('purchase-update-payment-reply', { success: false, error: String(error) });
      }
    });

    // Update purchase
    ipcMain.on('purchase-update', async (event: IpcMainEvent, args: any[]) => {
      try {
        const purchaseId = args[0] as number;
        const purchase = args[1] as Purchase;
        await this.purchaseService.updatePurchase(purchaseId, purchase);
        event.reply('purchase-update-reply', { success: true });
      } catch (error) {
        console.error('Update purchase error:', error);
        event.reply('purchase-update-reply', { success: false, error: String(error) });
      }
    });

    // Delete purchase
    ipcMain.on('purchase-delete', async (event: IpcMainEvent, args: any[]) => {
      try {
        const purchaseId = args[0] as number;
        await this.purchaseService.deletePurchase(purchaseId);
        event.reply('purchase-delete-reply', { success: true });
      } catch (error) {
        console.error('Delete purchase error:', error);
        event.reply('purchase-delete-reply', { success: false, error: String(error) });
      }
    });

    // Export purchases as CSV
    ipcMain.on('purchase-export-csv', async (event: IpcMainEvent, args: any[]) => {
      try {
        const settings = args[0] || {};
        const purchases = await this.purchaseService.getAllPurchases();
        const header = ['Serial No', 'Date', 'Supplier', 'Items', 'Subtotal', 'Discount', 'Tax', 'Grand Total', 'Paid', 'Outstanding', 'Notes'];
        const esc = (v: any) => {
          const s = v === null || v === undefined ? '' : String(v);
          return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        };

        // Company Header
        const companyInfo = [
          [settings.pharmacyName || 'Pharmacy Name'],
          [settings.address || ''],
          [`Phone: ${settings.phone || ''} | Email: ${settings.email || ''}`],
          [settings.taxId ? `Tax ID: ${settings.taxId}` : ''],
          [''],
          ['PURCHASE RECORDS REPORT'],
          [`Generated on: ${new Date().toLocaleString()}`],
          ['']
        ].map(row => row.map(esc).join(',')).join('\n');

        const csvData = [
          header.join(','),
          ...purchases.map((p, index) => {
            const rowData: any = {
              serialNo: index + 1,
              date: p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '',
              supplier: p.supplierName,
              items: p.items.length,
              subtotal: p.subtotal.toFixed(2),
              discount: p.discountTotal.toFixed(2),
              tax: p.taxTotal.toFixed(2),
              grandTotal: p.grandTotal.toFixed(2),
              paid: p.paymentAmount.toFixed(2),
              outstanding: p.remainingBalance.toFixed(2),
              notes: p.notes || ''
            };
            return [
              rowData.serialNo, rowData.date, rowData.supplier, rowData.items,
              rowData.subtotal, rowData.discount, rowData.tax, rowData.grandTotal,
              rowData.paid, rowData.outstanding, rowData.notes
            ].map(esc).join(',');
          })
        ].join('\n');

        const finalCsv = companyInfo + '\n' + csvData;

        const ts = new Date();
        const defaultName = `purchases_export_${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}.csv`;
        const { dialog } = require('electron');
        const { promises: fs } = require('fs');
        const { canceled, filePath } = await dialog.showSaveDialog({ title: 'Save Purchases CSV', defaultPath: defaultName, filters: [{ name: 'CSV', extensions: ['csv'] }] });
        if (canceled || !filePath) return event.reply('purchase-export-csv-reply', { success: false, error: 'canceled' });
        await fs.writeFile(filePath, finalCsv, 'utf-8');
        event.reply('purchase-export-csv-reply', { success: true, data: { filePath } });
      } catch (error) {
        console.error('Export purchases CSV error:', error);
        event.reply('purchase-export-csv-reply', { success: false, error: String(error) });
      }
    });

    // Export purchases as PDF
    ipcMain.on('purchase-export-pdf', async (event: IpcMainEvent, args: any[]) => {
      try {
        const settings = args[0] || {};
        const fromDate = args[1];
        const toDate = args[2];
        const options = args[3] || {
          includeName: true,
          includeCompany: true,
          includePhone: true,
          includeAddress: true,
          includeEmail: true
        };

        const purchases = await this.purchaseService.getAllPurchases(fromDate, toDate);
        const total = purchases.reduce((sum, p) => sum + p.grandTotal, 0);

        const totalPaid = purchases.reduce((sum, p) => sum + p.paymentAmount, 0);
        const totalOutstanding = purchases.reduce((sum, p) => sum + p.remainingBalance, 0);

        const currencySymbol = getCurrencySymbol(settings.currency || 'USD');

        const html = `
          <html>
          <head>
            <meta charset='utf-8' />
            <style>
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
              .header { display: flex; justify-content: space-between; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #000; }
              .company-info { flex: 1; }
              .info-row { display: flex; margin-bottom: 4px; font-size: 9pt; }
              .info-label { width: 90px; font-weight: bold; color: #000; }
              .info-val { flex: 1; color: #333; }
              
              .doc-info { text-align: right; }
              .doc-title { 
                font-size: 16pt; 
                font-weight: bold; 
                color: #000; 
                margin-bottom: 15px; 
                border: 2px solid #000; 
                padding: 8px 20px; 
                display: inline-block;
                letter-spacing: 1px;
              }
              .doc-grid { display: grid; grid-template-columns: auto auto; gap: 3px 10px; font-size: 9pt; text-align: left; }
              .doc-label { font-weight: bold; color: #000; }
              .doc-val { color: #333; }
              
              /* Table */
              table { 
                width: 100%; 
                border-collapse: collapse; 
                margin-top: 20px; 
                border: 1px solid #000;
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
                font-weight: bold; 
                text-transform: uppercase; 
                font-size: 8pt;
                padding: 10px 8px;
                text-align: left;
                border: 1px solid #000;
                letter-spacing: 0.5px;
              }
              
              td { 
                padding: 8px; 
                font-size: 9pt; 
                border: 1px solid #ccc;
                vertical-align: top;
              }
              
              tbody tr:nth-child(even) {
                background-color: #fafafa;
              }
              
              tbody tr:hover {
                background-color: #f0f0f0;
              }
              
              .text-right { text-align: right; font-weight: 500; }
              .text-center { text-align: center; }
              
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
                font-weight: 600;
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
                font-weight: bold;
              }
              
              .remark {
                margin-top: 15px;
                font-size: 9pt;
                color: #555;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div class="company-info">
                  <div class="info-row">
                    <div class="info-label">NAME</div>
                    <div class="info-val">: <strong>${settings.pharmacyName || 'Pharmacy Name'}</strong></div>
                  </div>
                  <div class="info-row">
                    <div class="info-label">COMPANY</div>
                    <div class="info-val">: ${settings.pharmacyName || ''}</div>
                  </div>
                  <div class="info-row">
                    <div class="info-label">ADDRESS</div>
                    <div class="info-val">: ${settings.address || ''}</div>
                  </div>
                  <div class="info-row">
                    <div class="info-label">PHONE</div>
                    <div class="info-val">: ${settings.phone || ''}</div>
                  </div>
                  <div class="info-row">
                    <div class="info-label">EMAIL</div>
                    <div class="info-val">: ${settings.email || ''}</div>
                  </div>
                </div>
                
                <div class="doc-info">
                  <div class="doc-title">PURCHASE REPORT</div>
                  <div class="doc-grid">
                    <div class="doc-label">DOCUMENT NO</div>
                    <div class="doc-val">: REP-${new Date().getTime().toString().slice(-6)}</div>
                    
                    <div class="doc-label">DATE</div>
                    <div class="doc-val">: ${new Date().toLocaleDateString()}</div>
                    
                    <div class="doc-label">PERIOD</div>
                    <div class="doc-val">: ${fromDate || 'Start'} to ${toDate || 'End'}</div>
                    
                    <div class="doc-label">CURRENCY</div>
                    <div class="doc-val">: ${settings.currency || 'USD'}</div>
                    
                    <div class="doc-label">PAGE</div>
                    <div class="doc-val">: 1 of 1</div>
                  </div>
                </div>
              </div>

              <table>
                <thead>
                  <tr>
                    <th style="width: 40px;">Item</th>
                    ${options.includeDate ? '<th style="width: 100px;">Date / PO</th>' : ''}
                    ${options.includeSupplier ? '<th>Supplier</th>' : ''}
                    ${options.includeItems ? '<th class="text-center" style="width: 80px;">Items Qty</th>' : ''}
                    ${options.includePills ? '<th class="text-center" style="width: 80px;">Pills</th>' : ''}
                    ${options.includeGrandTotal ? '<th class="text-right" style="width: 100px;">Total</th>' : ''}
                    ${options.includePaid ? '<th class="text-right" style="width: 100px;">Paid</th>' : ''}
                    ${options.includeOutstanding ? '<th class="text-right" style="width: 100px;">Outstanding</th>' : ''}
                  </tr>
                </thead>
                <tbody>
                  ${purchases.map((p, index) => {
          let description = '';

          // Build supplier description based on options
          if (options.includeName) {
            description += `<div style="font-weight: bold;">${p.supplierName}</div>`;
          }

          if (options.includeCompany && p.supplierCompanyName) {
            description += `<div style="font-size: 8pt;">Company: ${p.supplierCompanyName}</div>`;
          }

          const contactDetails = [];
          if (options.includeAddress && p.supplierAddress) {
            contactDetails.push(p.supplierAddress);
          }
          if (options.includePhone && p.supplierPhone) {
            contactDetails.push(p.supplierPhone);
          }
          if (options.includeEmail && p.supplierEmail) {
            contactDetails.push(p.supplierEmail);
          }

          if (contactDetails.length > 0) {
            description += `<div style="font-size: 8pt; color: #555;">${contactDetails.join(' | ')}</div>`;
          }

          // Build table row with selected columns
          let row = `<tr><td>${index + 1}</td>`;

          if (options.includeDate) {
            row += `<td><div style="font-size: 9pt; color: #666;">#${p.id}</div><div style="font-size: 9pt;">${new Date(p.createdAt || '').toLocaleDateString()}</div></td>`;
          }

          if (options.includeSupplier) {
            row += `<td>${description}</td>`;
          }

          if (options.includeItems) {
            row += `<td class="text-center">${p.items.length}</td>`;
          }

          if (options.includePills) {
            const totalPills = p.items.reduce((sum, item) => sum + (item.totalPills || 0), 0);
            row += `<td class="text-center">${totalPills}</td>`;
          }

          if (options.includeGrandTotal) {
            row += `<td class="text-right">${currencySymbol}${p.grandTotal.toFixed(2)}</td>`;
          }

          if (options.includePaid) {
            row += `<td class="text-right">${currencySymbol}${p.paymentAmount.toFixed(2)}</td>`;
          }

          if (options.includeOutstanding) {
            row += `<td class="text-right">${currencySymbol}${p.remainingBalance.toFixed(2)}</td>`;
          }

          row += `</tr>`;
          return row;
        }).join('')}
                </tbody>
              </table>

              <div class="footer">
                <div class="footer-content">
                  <div class="footer-left">
                    <div class="remark">
                      <strong>${settings.currency || 'PKR'}</strong> - Total Purchase Value of <strong>${currencySymbol}${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong> Only
                    </div>
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
                      <div class="totals-row">
                        <span class="totals-label">Sub Total:</span>
                        <span class="totals-value">${currencySymbol}${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div class="totals-row">
                        <span class="totals-label">Total Paid:</span>
                        <span class="totals-value">${currencySymbol}${totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div class="totals-row grand">
                        <span class="totals-label">Total Balance:</span>
                        <span class="totals-value">${currencySymbol}${totalOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </body>
          </html>`;

        const { BrowserWindow } = require('electron');
        const { dialog } = require('electron');
        const { promises: fs } = require('fs');
        const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
        await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
        const pdfBuffer = await win.webContents.printToPDF({ marginsType: 0, pageSize: 'A4', printBackground: true });
        const ts = new Date();
        const defaultName = `purchases_export_${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}.pdf`;
        const { canceled, filePath } = await dialog.showSaveDialog({ title: 'Save Purchases PDF', defaultPath: defaultName, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
        if (canceled || !filePath) return event.reply('purchase-export-pdf-reply', { success: false, error: 'canceled' });
        await fs.writeFile(filePath, pdfBuffer);
        event.reply('purchase-export-pdf-reply', { success: true, data: { filePath } });
        win.destroy();
      } catch (error) {
        console.error('Export purchases PDF error:', error);
        event.reply('purchase-export-pdf-reply', { success: false, error: String(error) });
      }
    });
  }
}

export default PurchaseController;

