import { ipcMain, IpcMainEvent } from 'electron';
import { SaleReturnService, SaleReturn } from '../services/sale-return.service';
import { currencySymbols, getCurrencySymbol } from '../../../common/currency';
import { web } from 'webpack';

export class SaleReturnController {
  private saleReturnService: SaleReturnService;

  constructor() {
    this.saleReturnService = new SaleReturnService();
    this.registerHandlers();
  }

  /**
   * Initialize tables
   */
  public async initializeTables(): Promise<void> {
    await this.saleReturnService.initializeTable();
  }

  /**
   * Register all IPC handlers for sale return operations
   */
  private registerHandlers(): void {
    // Create sale return
    ipcMain.on('sale-return-create', async (event: IpcMainEvent, args: any[]) => {
      try {
        const saleReturn = args[0] as SaleReturn;
        const saleReturnId = await this.saleReturnService.createSaleReturn(saleReturn);
        event.reply('sale-return-create-reply', { success: true, data: { id: saleReturnId } });
      } catch (error) {
        console.error('Create sale return error:', error);
        event.reply('sale-return-create-reply', { success: false, error: String(error) });
      }
    });

    // Get all sale returns
    ipcMain.on('sale-return-get-all', async (event: IpcMainEvent) => {
      try {
        const saleReturns = await this.saleReturnService.getAllSaleReturns();
        event.reply('sale-return-get-all-reply', { success: true, data: saleReturns });
      } catch (error) {
        console.error('Get all sale returns error:', error);
        event.reply('sale-return-get-all-reply', { success: false, error: String(error) });
      }
    });

    // Get sale return by ID
    ipcMain.on('sale-return-get-by-id', async (event: IpcMainEvent, args: any[]) => {
      try {
        const id = args[0] as number;
        const saleReturn = await this.saleReturnService.getSaleReturnById(id);
        event.reply('sale-return-get-by-id-reply', { success: true, data: saleReturn });
      } catch (error) {
        console.error('Get sale return by ID error:', error);
        event.reply('sale-return-get-by-id-reply', { success: false, error: String(error) });
      }
    });

    // Get sale returns by sale ID
    ipcMain.on('sale-return-get-by-sale-id', async (event: IpcMainEvent, args: any[]) => {
      try {
        const saleId = args[0] as number;
        const saleReturns = await this.saleReturnService.getSaleReturnsBySaleId(saleId);
        event.reply('sale-return-get-by-sale-id-reply', { success: true, data: saleReturns });
      } catch (error) {
        console.error('Get sale returns by sale ID error:', error);
        event.reply('sale-return-get-by-sale-id-reply', { success: false, error: String(error) });
      }
    });

    // Get sale returns by date range
    ipcMain.on('sale-return-get-by-date-range', async (event: IpcMainEvent, args: any[]) => {
      try {
        const fromDate = args[0] as string;
        const toDate = args[1] as string;
        const saleReturns = await this.saleReturnService.getSaleReturnsByDateRange(fromDate, toDate);
        event.reply('sale-return-get-by-date-range-reply', { success: true, data: saleReturns });
      } catch (error) {
        console.error('Get sale returns by date range error:', error);
        event.reply('sale-return-get-by-date-range-reply', { success: false, error: String(error) });
      }
    });

    // Get flat sale return rows by date range for reporting
    ipcMain.on('sale-return-get-flat-rows-range', async (event: IpcMainEvent, args: any[]) => {
      try {
        const fromDate = args[0] as string;
        const toDate = args[1] as string;
        const rows = await this.saleReturnService.getAllSaleReturnsFlatRowsByRange(fromDate, toDate);
        event.reply('sale-return-get-flat-rows-range-reply', { success: true, data: rows });
      } catch (error) {
        console.error('Get flat sale return rows (range) error:', error);
        event.reply('sale-return-get-flat-rows-range-reply', { success: false, error: String(error) });
      }
    });

    // Delete sale return
    ipcMain.on('sale-return-delete', async (event: IpcMainEvent, args: any[]) => {
      try {
        const saleReturnId = args[0] as number;
        await this.saleReturnService.deleteSaleReturn(saleReturnId);
        event.reply('sale-return-delete-reply', { success: true });
      } catch (error) {
        console.error('Delete sale return error:', error);
        event.reply('sale-return-delete-reply', { success: false, error: String(error) });
      }
    });

    // Export sale returns as CSV
    ipcMain.on('sale-return-export-csv', async (event: IpcMainEvent, args: any[]) => {
      try {
        const settings = args[0] || {};
        const fromDate = args[1];
        const toDate = args[2];
        const currencySymbol = getCurrencySymbol(settings.currency || 'USD');
        
        const saleReturns = fromDate && toDate
          ? await this.saleReturnService.getSaleReturnsByDateRange(fromDate, toDate)
          : await this.saleReturnService.getAllSaleReturns();

        const header = ['Serial No', 'Date', 'Return ID', 'Sale ID', 'Customer', 'Medicine', 'Quantity', 'Unit Price', 'Subtotal', 'Discount', 'Tax', 'Total', 'Reason'];
        const esc = (v: any) => {
          const s = v === null || v === undefined ? '' : String(v);
          return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        };

        // Company Header
        const dateRangeText = fromDate && toDate 
          ? `Period: ${fromDate} to ${toDate}`
          : fromDate 
            ? `From: ${fromDate}`
            : toDate 
              ? `Until: ${toDate}`
              : 'Period: All Records';
        
        const companyInfo = [
          [settings.pharmacyName || 'Pharmacy Name'],
          [settings.address || ''],
          [`Phone: ${settings.phone || ''} | Email: ${settings.email || ''} | ${settings.website && `Website: ${settings.website}`}`],
          [settings.taxId ? `Tax ID: ${settings.taxId}` : ''],
          [''],
          ['SALE RETURNS REPORT'],
          [dateRangeText],
          [`Generated on: ${new Date().toLocaleString()}`],
          ['']
        ].filter(row => row.length > 0).map(row => row.map(esc).join(',')).join('\n');

        // Calculate totals
        let totalSubtotal = 0;
        let totalDiscount = 0;
        let totalTax = 0;
        let totalAmount = 0;
        let totalItems = 0;

        let serialNo = 1;
        const csvData = [
          header.join(','),
          ...saleReturns.flatMap((sr) => 
            sr.items.map((item) => {
              totalSubtotal += item.subtotal;
              totalDiscount += item.discountAmount || 0;
              totalTax += item.taxAmount || 0;
              totalAmount += item.total;
              totalItems++;
              
              return [
                serialNo++,
                sr.createdAt ? new Date(sr.createdAt).toLocaleDateString() : '',
                `RET-${sr.id}`,
                `SALE-${sr.saleId}`,
                sr.customerName || 'Walk-in',
                item.medicineName,
                item.pills,
                `${currencySymbol}${item.unitPrice.toFixed(2)}`,
                `${currencySymbol}${item.subtotal.toFixed(2)}`,
                `${currencySymbol}${(item.discountAmount || 0).toFixed(2)}`,
                `${currencySymbol}${(item.taxAmount || 0).toFixed(2)}`,
                `${currencySymbol}${item.total.toFixed(2)}`,
                item.reason || sr.reason || ''
              ].map(esc).join(',');
            })
          )
        ].join('\n');

        // Footer with totals
        const footer = [
          [''],
          ['Summary'],
          ['Total Records', totalItems],
          ['Total Subtotal', `${currencySymbol}${totalSubtotal.toFixed(2)}`],
          ['Total Discount', `${currencySymbol}${totalDiscount.toFixed(2)}`],
          ['Total Tax', `${currencySymbol}${totalTax.toFixed(2)}`],
          ['Total Refund Amount', `${currencySymbol}${totalAmount.toFixed(2)}`],
          [''],
          ['Remark: Computer Generated Report'],
          ['E. & O.E.']
        ].map(row => row.map(esc).join(',')).join('\n');

        const finalCsv = companyInfo + '\n' + csvData + '\n' + footer;

        const ts = new Date();
        const defaultName = `sale_returns_export_${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}.csv`;
        const { dialog } = require('electron');
        const { promises: fs } = require('fs');
        const { canceled, filePath } = await dialog.showSaveDialog({ title: 'Save Sale Returns CSV', defaultPath: defaultName, filters: [{ name: 'CSV', extensions: ['csv'] }] });
        if (canceled || !filePath) return event.reply('sale-return-export-csv-reply', { success: false, error: 'canceled' });
        await fs.writeFile(filePath, finalCsv, 'utf-8');
        event.reply('sale-return-export-csv-reply', { success: true, data: { filePath } });
      } catch (error) {
        console.error('Export sale returns CSV error:', error);
        event.reply('sale-return-export-csv-reply', { success: false, error: String(error) });
      }
    });

    // Export sale returns as PDF
    ipcMain.on('sale-return-export-pdf', async (event: IpcMainEvent, args: any[]) => {
      try {
        const settings = args[0] || {};
        const fromDate = args[1];
        const toDate = args[2];
        const preview = args[3] === true;

        const saleReturns = fromDate && toDate
          ? await this.saleReturnService.getSaleReturnsByDateRange(fromDate, toDate)
          : await this.saleReturnService.getAllSaleReturns();

        const total = saleReturns.reduce((sum, sr) => sum + sr.total, 0);
        const totalDiscount = saleReturns.reduce((sum, sr) => sum + (sr.discountTotal || 0), 0);
        const totalTax = saleReturns.reduce((sum, sr) => sum + (sr.taxTotal || 0), 0);

        const currencySymbol = getCurrencySymbol(settings.currency || 'USD');

        // Import professional template utilities
        const { getProfessionalPDFStyles, generatePDFHeader, wrapPDFContent } = require('../utils/pdf-template');

        const styles = getProfessionalPDFStyles();
        const header = generatePDFHeader({
          title: 'SRR No.',
          documentType: 'SALE RETURN',
          period: { from: fromDate, to: toDate },
          currency: settings.currency || 'PKR',
          settings: {
            pharmacyName: settings.pharmacyName,
            address: settings.address,
            phone: settings.phone,
            email: settings.email,
            website: settings.website,
            taxId: settings.taxId,
            logoUrl: settings.logoUrl,
          }
        });

        // Group sale returns by customer for better organization
        const groupedReturns: { [key: string]: any[] } = {};
        saleReturns.forEach((sr) => {
          const customerKey = sr.customerName || 'Walk-in Customer';
          if (!groupedReturns[customerKey]) {
            groupedReturns[customerKey] = [];
          }
          groupedReturns[customerKey].push(sr);
        });

        let serialNo = 1;
        const tableContent = `
          <table>
            <thead>
              <tr>
                <th style="width: 40px;">Item</th>
                <th style="width: 90px;">Date</th>
                <th style="width: 70px;">Sale ID</th>
                <th>Medicine</th>
                <th class="text-center" style="width: 60px;">Qty</th>
                <th class="text-right" style="width: 80px;">Unit Price</th>
                <th class="text-right" style="width: 80px;">Subtotal</th>
                <th class="text-right" style="width: 70px;">Disc.</th>
                <th class="text-right" style="width: 60px;">Tax</th>
                <th class="text-right" style="width: 80px;">Total</th>
                <th style="width: 120px;">Reason</th>
              </tr>
            </thead>
            <tbody>
              ${Object.entries(groupedReturns).map(([customerName, returns]) => {
                const customerTotal = returns.reduce((sum, sr) => sum + sr.total, 0);
                return `
                  <tr style="background-color: #f0f0f0;">
                    <td colspan="11" style="font-weight: bold; padding: 8px 10px;">
                      Customer: ${customerName}
                    </td>
                  </tr>
                  ${returns.flatMap((sr) => 
                    sr.items.map((item: any, itemIndex: number) => `
                      <tr>
                        <td>${serialNo++}</td>
                        <td>${sr.createdAt ? new Date(sr.createdAt).toLocaleDateString() : ''}</td>
                        <td>S-${sr.saleId}</td>
                        <td>${item.medicineName}</td>
                        <td class="text-center">${item.pills}</td>
                        <td class="text-right">${currencySymbol}${item.unitPrice.toFixed(2)}</td>
                        <td class="text-right">${currencySymbol}${item.subtotal.toFixed(2)}</td>
                        <td class="text-right">${currencySymbol}${(item.discountAmount || 0).toFixed(2)}</td>
                        <td class="text-right">${currencySymbol}${(item.taxAmount || 0).toFixed(2)}</td>
                        <td class="text-right" style="font-weight: bold;">${currencySymbol}${item.total.toFixed(2)}</td>
                        <td style="font-size: 8pt;">${item.reason || sr.reason || '—'}</td>
                      </tr>
                    `)
                  ).join('')}
                  <tr style="background-color: #fafafa;">
                    <td colspan="9" class="text-right" style="font-weight: bold;">Customer Subtotal:</td>
                    <td class="text-right" style="font-weight: bold;">${currencySymbol}${customerTotal.toFixed(2)}</td>
                    <td></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        `;

        const footer = `
          <div class="footer">
            <div class="footer-content">
              <div class="footer-left">
                <div class="remark">
                  <strong>${settings.currency || 'USD'}</strong> - Total Return Value of <strong>${currencySymbol}${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> Only
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
                    <span class="totals-label">Total Returns:</span>
                    <span class="totals-value">${saleReturns.length}</span>
                  </div>
                  <div class="totals-row">
                    <span class="totals-label">Total Discount:</span>
                    <span class="totals-value">${currencySymbol}${totalDiscount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div class="totals-row">
                    <span class="totals-label">Total Tax:</span>
                    <span class="totals-value">${currencySymbol}${totalTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div class="totals-row grand">
                    <span class="totals-label">Grand Total:</span>
                    <span class="totals-value">${currencySymbol}${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;

        const html = wrapPDFContent(styles, header, tableContent, footer);

        if (preview) {
          // Return HTML for preview
          event.reply('sale-return-export-pdf-reply', { success: true, data: { htmlContent: html } });
        } else {
          // Generate PDF and save to file
          const { BrowserWindow, dialog } = require('electron');
          const { promises: fs } = require('fs');
          const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
          await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
          const pdfBuffer = await win.webContents.printToPDF({ marginsType: 0, pageSize: 'A4', printBackground: true });
          
          const ts = new Date();
          const defaultName = `sale_returns_export_${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}.pdf`;
          
          const { canceled, filePath } = await dialog.showSaveDialog({
            title: 'Save Sale Returns PDF',
            defaultPath: defaultName,
            filters: [{ name: 'PDF', extensions: ['pdf'] }]
          });

          if (canceled || !filePath) return event.reply('sale-return-export-pdf-reply', { success: false, error: 'canceled' });
          
          await fs.writeFile(filePath, pdfBuffer);
          event.reply('sale-return-export-pdf-reply', { success: true, data: { filePath } });
          win.destroy();
        }
      } catch (error) {
        console.error('Export sale returns PDF error:', error);
        event.reply('sale-return-export-pdf-reply', { success: false, error: String(error) });
      }
    });

    // Get total sale returns (for dashboard)
    ipcMain.on('sale-return-get-total', async (event: IpcMainEvent) => {
      try {
        const total = await this.saleReturnService.getTotalSaleReturns();
        event.reply('sale-return-get-total-reply', { success: true, data: total });
      } catch (error) {
        console.error('Get total sale returns error:', error);
        event.reply('sale-return-get-total-reply', { success: false, error: String(error) });
      }
    });
  }
}

export default SaleReturnController;

