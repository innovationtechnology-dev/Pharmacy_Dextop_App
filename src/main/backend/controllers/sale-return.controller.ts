import { ipcMain, IpcMainEvent } from 'electron';
import { SaleReturnService, SaleReturn } from '../services/sale-return.service';

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
        
        const saleReturns = fromDate && toDate
          ? await this.saleReturnService.getSaleReturnsByDateRange(fromDate, toDate)
          : await this.saleReturnService.getAllSaleReturns();

        const header = ['Serial No', 'Date', 'Sale ID', 'Customer', 'Medicine', 'Quantity', 'Unit Price', 'Subtotal', 'Discount', 'Tax', 'Total', 'Reason'];
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
          ['SALE RETURNS REPORT'],
          [`Generated on: ${new Date().toLocaleString()}`],
          ['']
        ].map(row => row.map(esc).join(',')).join('\n');

        let serialNo = 1;
        const csvData = [
          header.join(','),
          ...saleReturns.flatMap((sr) => 
            sr.items.map((item) => {
              const rowData: any = {
                serialNo: serialNo++,
                date: sr.createdAt ? new Date(sr.createdAt).toLocaleDateString() : '',
                saleId: sr.saleId,
                customer: sr.customerName || '',
                medicine: item.medicineName,
                quantity: item.pills,
                unitPrice: item.unitPrice.toFixed(2),
                subtotal: item.subtotal.toFixed(2),
                discount: item.discountAmount.toFixed(2),
                tax: item.taxAmount.toFixed(2),
                total: item.total.toFixed(2),
                reason: item.reason || sr.reason || ''
              };
              return [
                rowData.serialNo, rowData.date, rowData.saleId, rowData.customer,
                rowData.medicine, rowData.quantity, rowData.unitPrice, rowData.subtotal,
                rowData.discount, rowData.tax, rowData.total, rowData.reason
              ].map(esc).join(',');
            })
          )
        ].join('\n');

        const finalCsv = companyInfo + '\n' + csvData;

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

        const saleReturns = fromDate && toDate
          ? await this.saleReturnService.getSaleReturnsByDateRange(fromDate, toDate)
          : await this.saleReturnService.getAllSaleReturns();

        const total = saleReturns.reduce((sum, sr) => sum + sr.total, 0);

        const html = `
          <html>
          <head>
            <meta charset='utf-8' />
            <style>
              body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 40px; color: #333; }
              .header { margin-bottom: 30px; border-bottom: 2px solid #eee; padding-bottom: 20px; }
              .header-content { display: flex; justify-content: space-between; align-items: flex-start; }
              .company-info h1 { margin: 0 0 5px; font-size: 24px; color: #2c3e50; }
              .company-info p { margin: 2px 0; font-size: 12px; color: #666; }
              .logo { max-height: 80px; max-width: 200px; object-fit: contain; }
              .report-title { margin-bottom: 20px; }
              .report-title h2 { margin: 0; font-size: 18px; color: #2c3e50; }
              .report-title p { margin: 5px 0 0; font-size: 12px; color: #888; }
              .report-meta {display: flex; justify-content: space-between; align-items: center; width: 100%;margin-top: 5px;}
              .report-meta p { margin-top: 5px; font-size: 12px;}
              table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
              th, td { border: 1px solid #e0e0e0; padding: 8px 10px; text-align: left; }
              th { background-color: #f8f9fa; color: #444; font-weight: bold; text-transform: uppercase; font-size: 10px; }
              tr:nth-child(even) { background-color: #fcfcfc; }
              .text-right { text-align: right; }
              .text-center { text-align: center; }
              tfoot td { font-weight: bold; background-color: #f8f9fa; border-top: 2px solid #ddd; }
              .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #aaa; border-top: 1px solid #eee; padding-top: 10px; }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="header-content">
                <div class="company-info">
                  <h1>${settings.pharmacyName || 'Pharmacy Name'}</h1>
                  <p>${settings.address || ''}</p>
                  <p>Phone: ${settings.phone || ''} ${settings.email ? `| Email: ${settings.email}` : ''}</p>
                  ${settings.taxId ? `<p>Tax ID: ${settings.taxId}</p>` : ''}
                </div>
                ${settings.logoUrl ? `<img src="${settings.logoUrl}" class="logo" />` : ''}
              </div>
            </div>

            <div class="report-title">
              <h2>Sale Returns Report</h2>
              <div class="report-meta">
                ${fromDate && toDate ? `<p class="left-text">Period: ${fromDate} to ${toDate}</p>` : ''}
                <p class="right-text">Generated on ${new Date().toLocaleString()}</p>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th style="width: 40px;">#</th>
                  <th>Date</th>
                  <th>Sale ID</th>
                  <th>Customer</th>
                  <th>Medicine</th>
                  <th class="text-center">Quantity</th>
                  <th class="text-right">Unit Price</th>
                  <th class="text-right">Subtotal</th>
                  <th class="text-right">Discount</th>
                  <th class="text-right">Tax</th>
                  <th class="text-right">Total</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                ${(() => {
                  let serialNo = 1;
                  return saleReturns.flatMap((sr) => 
                    sr.items.map((item) => `
                      <tr>
                        <td>${serialNo++}</td>
                        <td>${sr.createdAt ? new Date(sr.createdAt).toLocaleDateString() : ''}</td>
                        <td>${sr.saleId}</td>
                        <td>${sr.customerName || ''}</td>
                        <td>${item.medicineName}</td>
                        <td class="text-center">${item.pills}</td>
                        <td class="text-right">${item.unitPrice.toFixed(2)}</td>
                        <td class="text-right">${item.subtotal.toFixed(2)}</td>
                        <td class="text-right">${item.discountAmount.toFixed(2)}</td>
                        <td class="text-right">${item.taxAmount.toFixed(2)}</td>
                        <td class="text-right" style="font-weight: bold;">${item.total.toFixed(2)}</td>
                        <td>${item.reason || sr.reason || ''}</td>
                      </tr>`
                    )
                  ).join('');
                })()}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="10" class="text-right">Total</td>
                  <td class="text-right">${total.toFixed(2)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>

            <div class="footer">
              <p>This is a computer-generated document. No signature is required.</p>
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
        const defaultName = `sale_returns_export_${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}.pdf`;
        const { canceled, filePath } = await dialog.showSaveDialog({ title: 'Save Sale Returns PDF', defaultPath: defaultName, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
        if (canceled || !filePath) return event.reply('sale-return-export-pdf-reply', { success: false, error: 'canceled' });
        await fs.writeFile(filePath, pdfBuffer);
        event.reply('sale-return-export-pdf-reply', { success: true, data: { filePath } });
        win.destroy();
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

