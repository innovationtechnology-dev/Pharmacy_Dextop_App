import { ipcMain, IpcMainEvent, dialog, BrowserWindow } from 'electron';
import { promises as fs } from 'fs';
import { PaymentService, PaymentRecord, PaymentFilters } from '../services/payment.service';
import { SupplierService } from '../services/supplier.service';

export class PaymentController {
  private paymentService: PaymentService;

  constructor() {
    this.paymentService = new PaymentService();
    this.registerHandlers();
  }

  /**
   * Initialize tables
   */
  public async initializeTables(): Promise<void> {
    await this.paymentService.initializeTable();
  }

  /**
   * Register all IPC handlers for payment operations
   */
  private registerHandlers(): void {
    // Create payment record
    ipcMain.on('payment-create', async (event: IpcMainEvent, args: any[]) => {
      try {
        const payment = args[0] as Omit<PaymentRecord, 'id' | 'createdAt'>;
        const paymentId = await this.paymentService.createPaymentRecord(payment);
        event.reply('payment-create-reply', { success: true, data: { id: paymentId } });
      } catch (error) {
        console.error('Create payment error:', error);
        event.reply('payment-create-reply', { success: false, error: String(error) });
      }
    });

    // Get all payment records with optional filters
    ipcMain.on('payment-get-all', async (event: IpcMainEvent, args: any[]) => {
      try {
        const filters = args[0] as PaymentFilters | undefined;
        const paginated = args[1] as boolean | undefined;
        if (paginated) {
          const result = await this.paymentService.getPaymentRecords(filters, true);
          event.reply('payment-get-all-reply', { success: true, data: result });
        } else {
          const records = await this.paymentService.getPaymentRecords(filters);
          event.reply('payment-get-all-reply', { success: true, data: records });
        }
      } catch (error) {
        console.error('Get payment records error:', error);
        event.reply('payment-get-all-reply', { success: false, error: String(error) });
      }
    });

    // Get payment summary
    ipcMain.on('payment-get-summary', async (event: IpcMainEvent, args: any[]) => {
      try {
        const filters = args[0] as PaymentFilters | undefined;
        const summary = await this.paymentService.getPaymentSummary(filters);
        event.reply('payment-get-summary-reply', { success: true, data: summary });
      } catch (error) {
        console.error('Get payment summary error:', error);
        event.reply('payment-get-summary-reply', { success: false, error: String(error) });
      }
    });

    // Get supplier accounts
    ipcMain.on('payment-get-supplier-accounts', async (event: IpcMainEvent) => {
      try {
        const accounts = await this.paymentService.getSupplierAccounts();
        event.reply('payment-get-supplier-accounts-reply', { success: true, data: accounts });
      } catch (error) {
        console.error('Get supplier accounts error:', error);
        event.reply('payment-get-supplier-accounts-reply', { success: false, error: String(error) });
      }
    });

    // Get payments by purchase ID
    ipcMain.on('payment-get-by-purchase', async (event: IpcMainEvent, args: any[]) => {
      try {
        const purchaseId = args[0] as number;
        const records = await this.paymentService.getPaymentsByPurchase(purchaseId);
        event.reply('payment-get-by-purchase-reply', { success: true, data: records });
      } catch (error) {
        console.error('Get payments by purchase error:', error);
        event.reply('payment-get-by-purchase-reply', { success: false, error: String(error) });
      }
    });

    // Get payments by supplier ID
    ipcMain.on('payment-get-by-supplier', async (event: IpcMainEvent, args: any[]) => {
      try {
        const supplierId = args[0] as number;
        const records = await this.paymentService.getPaymentsBySupplier(supplierId);
        event.reply('payment-get-by-supplier-reply', { success: true, data: records });
      } catch (error) {
        console.error('Get payments by supplier error:', error);
        event.reply('payment-get-by-supplier-reply', { success: false, error: String(error) });
      }
    });

    // Delete payment record
    ipcMain.on('payment-delete', async (event: IpcMainEvent, args: any[]) => {
      try {
        const paymentId = args[0] as number;
        await this.paymentService.deletePaymentRecord(paymentId);
        event.reply('payment-delete-reply', { success: true });
      } catch (error) {
        console.error('Delete payment error:', error);
        event.reply('payment-delete-reply', { success: false, error: String(error) });
      }
    });

    // Get monthly payment trends
    ipcMain.on('payment-get-monthly-trends', async (event: IpcMainEvent, args: any[]) => {
      try {
        const year = args[0] as number;
        const trends = await this.paymentService.getMonthlyPaymentTrends(year);
        event.reply('payment-get-monthly-trends-reply', { success: true, data: trends });
      } catch (error) {
        console.error('Get monthly trends error:', error);
        event.reply('payment-get-monthly-trends-reply', { success: false, error: String(error) });
      }
    });

    // Export payment records as CSV
    ipcMain.on('payment-export-csv', async (event: IpcMainEvent, args: any[]) => {
      try {
        const filters = args[0] as PaymentFilters | undefined;
        const settings = args[1] || {};
        const csvData = await this.paymentService.exportPaymentRecords(filters);
        const summary = await this.paymentService.getPaymentSummary(filters);

        // Get supplier info if filtered
        let supplierInfo = '';
        if (filters?.supplierId) {
          const supplierService = new SupplierService();
          const supplier = await supplierService.getSupplierById(filters.supplierId);
          if (supplier) {
            supplierInfo = `${supplier.name}${supplier.companyName ? ` (${supplier.companyName})` : ''}`;
          }
        }

        // Format date range
        let dateRangeText = 'All Time';
        if (filters?.fromDate && filters?.toDate) {
          const fromDate = new Date(filters.fromDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
          const toDate = new Date(filters.toDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
          dateRangeText = `${fromDate} to ${toDate}`;
        }

        const currencySymbol = settings.currency === 'PKR' ? '₨' :
          settings.currency === 'INR' ? '₹' :
          settings.currency === 'EUR' ? '€' :
          settings.currency === 'GBP' ? '£' : '$';

        // Add company header with summary
        const companyHeader = [
          settings.pharmacyName || 'Pharmacy Name',
          settings.address || '',
          `Phone: ${settings.phone || ''} | Email: ${settings.email || ''}`,
          '',
          'PAYMENT RECORDS REPORT',
          `Generated on: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`,
          `Period: ${dateRangeText}`,
          supplierInfo ? `Supplier: ${supplierInfo}` : '',
          '',
          'SUMMARY FOR SELECTED PERIOD',
          `Total Purchases,${currencySymbol}${summary.totalPurchases.toFixed(2)}`,
          `Total Paid,${currencySymbol}${summary.totalPaid.toFixed(2)}`,
          `Outstanding Balance,${currencySymbol}${summary.totalRemaining.toFixed(2)}`,
          `Cash Payments,${currencySymbol}${summary.cashPayments.toFixed(2)}`,
          `Bank Transfer,${currencySymbol}${summary.bankTransferPayments.toFixed(2)}`,
          `Check Payments,${currencySymbol}${summary.checkPayments.toFixed(2)}`,
          `Online Payments,${currencySymbol}${summary.onlinePayments.toFixed(2)}`,
          `Total Payment Records,${summary.paymentCount}`,
          ''
        ].filter(line => line !== '').join('\n');

        const finalCsv = companyHeader + '\n' + csvData;

        const ts = new Date();
        const defaultName = `payment_records_${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}.csv`;
        const { canceled, filePath } = await dialog.showSaveDialog({
          title: 'Save Payment Records CSV',
          defaultPath: defaultName,
          filters: [{ name: 'CSV', extensions: ['csv'] }]
        });

        if (canceled || !filePath) {
          return event.reply('payment-export-csv-reply', { success: false, error: 'canceled' });
        }

        await fs.writeFile(filePath, finalCsv, 'utf-8');
        event.reply('payment-export-csv-reply', { success: true, data: { filePath } });
      } catch (error) {
        console.error('Export payment CSV error:', error);
        event.reply('payment-export-csv-reply', { success: false, error: String(error) });
      }
    });

    // Export payment records as PDF
    ipcMain.on('payment-export-pdf', async (event: IpcMainEvent, args: any[]) => {
      try {
        const filters = args[0] as PaymentFilters | undefined;
        const settings = args[1] || {};

        const records = await this.paymentService.getPaymentRecords(filters);
        const summary = await this.paymentService.getPaymentSummary(filters);

        // Get supplier info if filtered
        let supplierInfo = '';
        if (filters?.supplierId) {
          const supplierService = new SupplierService();
          const supplier = await supplierService.getSupplierById(filters.supplierId);
          if (supplier) {
            supplierInfo = `${supplier.name}${supplier.companyName ? ` (${supplier.companyName})` : ''}`;
          }
        }

        // Format date range
        let dateRangeText = 'All Time';
        if (filters?.fromDate && filters?.toDate) {
          const fromDate = new Date(filters.fromDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
          const toDate = new Date(filters.toDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
          dateRangeText = `${fromDate} to ${toDate}`;
        } else if (filters?.periodType) {
          const today = new Date();
          switch (filters.periodType) {
            case 'today':
              dateRangeText = today.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
              break;
            case 'week':
              const weekAgo = new Date(today);
              weekAgo.setDate(weekAgo.getDate() - 7);
              dateRangeText = `${weekAgo.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} to ${today.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;
              break;
            case 'month':
              dateRangeText = today.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
              break;
            case 'year':
              dateRangeText = today.getFullYear().toString();
              break;
          }
        }

        const currencySymbol = settings.currency === 'PKR' ? '₨' :
          settings.currency === 'INR' ? '₹' :
          settings.currency === 'EUR' ? '€' :
          settings.currency === 'GBP' ? '£' : '$';

        const getPaymentMethodLabel = (method: string) => {
          switch (method) {
            case 'cash': return 'Cash';
            case 'bank_transfer': return 'Bank Transfer';
            case 'check': return 'Check';
            case 'online': return 'Online';
            default: return method;
          }
        };

        const html = `
          <html>
          <head>
            <meta charset='utf-8' />
            <style>
              @page { size: A4; margin: 0; }
              body { font-family: 'Arial', sans-serif; font-size: 10pt; color: #000; margin: 0; padding: 0; }
              .container { padding: 20px 30px; }
              .header { display: flex; justify-content: space-between; margin-bottom: 25px; padding-bottom: 15px; border-bottom: 2px solid #000; }
              .company-info { flex: 1; }
              .company-name { font-size: 16pt; font-weight: bold; margin-bottom: 5px; }
              .company-details { font-size: 9pt; color: #555; }
              .doc-info { text-align: right; }
              .doc-title { font-size: 14pt; font-weight: bold; border: 2px solid #000; padding: 6px 15px; display: inline-block; margin-bottom: 10px; }
              .summary-cards { display: flex; gap: 10px; margin-bottom: 20px; }
              .summary-card { flex: 1; padding: 12px; border: 1px solid #ddd; border-radius: 6px; text-align: center; }
              .summary-card .label { font-size: 8pt; color: #666; text-transform: uppercase; margin-bottom: 5px; }
              .summary-card .value { font-size: 14pt; font-weight: bold; }
              .summary-card.total { background: #f0f9f4; border-color: #10b981; }
              .summary-card.paid { background: #ecfdf5; border-color: #059669; }
              .summary-card.remaining { background: #fff7ed; border-color: #f97316; }
              table { width: 100%; border-collapse: collapse; margin-top: 15px; }
              th { background: #f5f5f5; font-weight: bold; text-transform: uppercase; font-size: 8pt; padding: 10px 8px; text-align: left; border: 1px solid #000; }
              td { padding: 8px; font-size: 9pt; border: 1px solid #ccc; }
              tbody tr:nth-child(even) { background: #fafafa; }
              .text-right { text-align: right; }
              .text-center { text-align: center; }
              .method-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 8pt; font-weight: bold; }
              .method-cash { background: #dcfce7; color: #166534; }
              .method-bank_transfer { background: #dbeafe; color: #1e40af; }
              .method-check { background: #fef3c7; color: #92400e; }
              .method-online { background: #f3e8ff; color: #7c3aed; }
              .footer { margin-top: 25px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 8pt; color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div class="company-info">
                  <div class="company-name">${settings.pharmacyName || 'Pharmacy'}</div>
                  <div class="company-details">
                    ${settings.address || ''}<br>
                    ${settings.phone ? 'Phone: ' + settings.phone : ''} ${settings.email ? '| Email: ' + settings.email : ''}
                  </div>
                </div>
                <div class="doc-info">
                  <div class="doc-title">PAYMENT RECORDS REPORT</div>
                  <div style="font-size: 9pt; margin-top: 8px;">
                    <div><strong>Report Date:</strong> ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                    <div><strong>Period:</strong> ${dateRangeText}</div>
                    ${supplierInfo ? `<div><strong>Supplier:</strong> ${supplierInfo}</div>` : ''}
                    <div><strong>Total Records:</strong> ${records.length}</div>
                  </div>
                </div>
              </div>

              <div style="background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                <div style="font-size: 11pt; font-weight: bold; color: #1e293b; margin-bottom: 15px; text-align: center; border-bottom: 2px solid #cbd5e1; padding-bottom: 10px;">
                  SUMMARY FOR SELECTED PERIOD
                </div>
                <div class="summary-cards" style="margin: 0;">
                  <div class="summary-card total" style="border: 1px solid #10b981;">
                    <div class="label">Total Purchases</div>
                    <div class="value" style="font-size: 16pt;">${currencySymbol}${summary.totalPurchases.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div class="summary-card paid" style="border: 1px solid #059669;">
                    <div class="label">Total Paid</div>
                    <div class="value" style="color: #059669; font-size: 16pt;">${currencySymbol}${summary.totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div class="summary-card remaining" style="border: 1px solid #f97316;">
                    <div class="label">Outstanding Balance</div>
                    <div class="value" style="color: #f97316; font-size: 16pt;">${currencySymbol}${summary.totalRemaining.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  </div>
                </div>
                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #cbd5e1; display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; text-align: center;">
                  <div>
                    <div style="font-size: 8pt; color: #64748b; margin-bottom: 4px;">Cash Payments</div>
                    <div style="font-size: 12pt; font-weight: bold; color: #166534;">${currencySymbol}${summary.cashPayments.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div>
                    <div style="font-size: 8pt; color: #64748b; margin-bottom: 4px;">Bank Transfer</div>
                    <div style="font-size: 12pt; font-weight: bold; color: #1e40af;">${currencySymbol}${summary.bankTransferPayments.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div>
                    <div style="font-size: 8pt; color: #64748b; margin-bottom: 4px;">Check Payments</div>
                    <div style="font-size: 12pt; font-weight: bold; color: #92400e;">${currencySymbol}${summary.checkPayments.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div>
                    <div style="font-size: 8pt; color: #64748b; margin-bottom: 4px;">Online Payments</div>
                    <div style="font-size: 12pt; font-weight: bold; color: #7c3aed;">${currencySymbol}${summary.onlinePayments.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  </div>
                </div>
              </div>

              <table>
                <thead>
                  <tr>
                    <th style="width: 35px;">#</th>
                    <th style="width: 80px;">Date</th>
                    <th>Supplier</th>
                    <th style="width: 60px;">PO #</th>
                    <th style="width: 90px;" class="text-center">Method</th>
                    <th style="width: 90px;">Reference</th>
                    <th style="width: 100px;" class="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${records.map((r, idx) => `
                    <tr>
                      <td>${idx + 1}</td>
                      <td>${new Date(r.paymentDate).toLocaleDateString()}</td>
                      <td>
                        <div style="font-weight: bold;">${r.supplierName}</div>
                        ${r.companyName ? `<div style="font-size: 8pt; color: #666;">${r.companyName}</div>` : ''}
                      </td>
                      <td>PO-${r.purchaseId}</td>
                      <td class="text-center">
                        <span class="method-badge method-${r.paymentMethod}">${getPaymentMethodLabel(r.paymentMethod)}</span>
                      </td>
                      <td>${r.checkNumber || r.referenceNumber || '-'}</td>
                      <td class="text-right" style="font-weight: bold;">${currencySymbol}${r.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>

              <div class="footer">
                <div style="display: flex; justify-content: space-between;">
                  <div>
                    <strong>Payment Breakdown:</strong>
                    Cash: ${currencySymbol}${summary.cashPayments.toLocaleString()} |
                    Bank: ${currencySymbol}${summary.bankTransferPayments.toLocaleString()} |
                    Check: ${currencySymbol}${summary.checkPayments.toLocaleString()} |
                    Online: ${currencySymbol}${summary.onlinePayments.toLocaleString()}
                  </div>
                  <div>Generated: ${new Date().toLocaleString()}</div>
                </div>
              </div>
            </div>
          </body>
          </html>
        `;

        const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
        await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
        const pdfBuffer = await win.webContents.printToPDF({ marginsType: 0, pageSize: 'A4', printBackground: true });

        const ts = new Date();
        const defaultName = `payment_records_${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}.pdf`;
        const { canceled, filePath } = await dialog.showSaveDialog({
          title: 'Save Payment Records PDF',
          defaultPath: defaultName,
          filters: [{ name: 'PDF', extensions: ['pdf'] }]
        });

        if (canceled || !filePath) {
          win.destroy();
          return event.reply('payment-export-pdf-reply', { success: false, error: 'canceled' });
        }

        await fs.writeFile(filePath, pdfBuffer);
        event.reply('payment-export-pdf-reply', { success: true, data: { filePath } });
        win.destroy();
      } catch (error) {
        console.error('Export payment PDF error:', error);
        event.reply('payment-export-pdf-reply', { success: false, error: String(error) });
      }
    });
  }
}

export default PaymentController;

