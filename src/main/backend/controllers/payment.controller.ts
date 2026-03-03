import { ipcMain, IpcMainEvent } from 'electron';
import { PaymentService, Payment } from '../services/payment.service';
import { currencySymbols, getCurrencySymbol } from '../../../common/currency';

export class PaymentController {
    private paymentService: PaymentService;

    constructor() {
        this.paymentService = new PaymentService();
        this.registerHandlers();
    }

    public async initializeTables(): Promise<void> {
        await this.paymentService.initializeTable();
    }

    private registerHandlers(): void {
        // Add payment (alias for payment-create for compatibility)
        ipcMain.on('payment-add', async (event: IpcMainEvent, args: any[]) => {
            try {
                const payment = args[0] as Payment;
                const paymentId = await this.paymentService.addPayment(payment);
                event.reply('payment-add-reply', { success: true, data: { id: paymentId } });
            } catch (error) {
                console.error('Add payment error:', error);
                event.reply('payment-add-reply', { success: false, error: String(error) });
            }
        });

        // Create payment (main handler used by frontend)
        ipcMain.on('payment-create', async (event: IpcMainEvent, args: any[]) => {
            try {
                const paymentData = args[0] as any;
                // Transform the frontend data to match Payment interface
                const payment: Payment = {
                    purchaseId: paymentData.purchaseId,
                    amount: paymentData.amount,
                    paymentMethod: paymentData.paymentMethod === 'bank_transfer' ? 'bank_deposit' : 
                                   paymentData.paymentMethod === 'check' ? 'cheque' : 
                                   paymentData.paymentMethod === 'online' ? 'card' : 
                                   paymentData.paymentMethod,
                    reference: paymentData.referenceNumber || paymentData.checkNumber,
                    notes: paymentData.notes,
                    paymentDate: paymentData.paymentDate
                };
                const paymentId = await this.paymentService.addPayment(payment);
                event.reply('payment-create-reply', { success: true, data: { id: paymentId } });
            } catch (error) {
                console.error('Create payment error:', error);
                event.reply('payment-create-reply', { success: false, error: String(error) });
            }
        });

        // Get payments by purchase ID
        ipcMain.on('payment-get-by-purchase', async (event: IpcMainEvent, args: any[]) => {
            try {
                const purchaseId = args[0] as number;
                const payments = await this.paymentService.getPaymentsByPurchaseId(purchaseId);
                event.reply('payment-get-by-purchase-reply', { success: true, data: payments });
            } catch (error) {
                console.error('Get payments by purchase ID error:', error);
                event.reply('payment-get-by-purchase-reply', { success: false, error: String(error) });
            }
        });

        // Get payments by date range
        ipcMain.on('payment-get-by-date', async (event: IpcMainEvent, args: any[]) => {
            try {
                const fromDate = args[0] as string;
                const toDate = args[1] as string;
                const payments = await this.paymentService.getPaymentsByDateRange(fromDate, toDate);
                event.reply('payment-get-by-date-reply', { success: true, data: payments });
            } catch (error) {
                console.error('Get payments by date range error:', error);
                event.reply('payment-get-by-date-reply', { success: false, error: String(error) });
            }
        });

        // Get payment summary
        ipcMain.on('payment-get-summary', async (event: IpcMainEvent, args: any[]) => {
            try {
                const filters = args[0] || {};
                const summary = await this.paymentService.getPaymentSummary(filters);
                event.reply('payment-get-summary-reply', { success: true, data: summary });
            } catch (error) {
                console.error('Get payment summary error:', error);
                event.reply('payment-get-summary-reply', { success: false, error: String(error) });
            }
        });

        // Get all payments (paginated/filtered)
        ipcMain.on('payment-get-all', async (event: IpcMainEvent, args: any[]) => {
            try {
                const filters = args[0] || {};
                const paginated = args[1] || false;
                const result = await this.paymentService.getPaymentRecords(filters, paginated);
                event.reply('payment-get-all-reply', { success: true, data: result });
            } catch (error) {
                console.error('Get all payments error:', error);
                event.reply('payment-get-all-reply', { success: false, error: String(error) });
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

        // Delete payment
        ipcMain.on('payment-delete', async (event: IpcMainEvent, args: any[]) => {
            try {
                const paymentId = args[0] as number;
                await this.paymentService.deletePayment(paymentId);
                event.reply('payment-delete-reply', { success: true });
            } catch (error) {
                console.error('Delete payment error:', error);
                event.reply('payment-delete-reply', { success: false, error: String(error) });
            }
        });

        // Export payments as CSV
        ipcMain.on('payment-export-csv', async (event: IpcMainEvent, args: any[]) => {
            try {
                const filters = args[0] || {};
                const settings = args[1] || {};
                const payments = await this.paymentService.getPaymentRecords(filters, false);
                
                const header = ['Date', 'Purchase ID', 'Supplier', 'Amount', 'Method', 'Reference', 'Notes'];
                const esc = (v: any) => {
                    const s = v === null || v === undefined ? '' : String(v);
                    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
                };

                const companyInfo = [
                    [settings.pharmacyName || 'Pharmacy Name'],
                    [settings.address || ''],
                    [`Phone: ${settings.phone || ''} | Email: ${settings.email || ''}`],
                    [''],
                    ['PAYMENT RECORDS REPORT'],
                    [`Generated on: ${new Date().toLocaleString()}`],
                    ['']
                ].map(row => row.map(esc).join(',')).join('\n');

                const csvData = [
                    header.join(','),
                    ...payments.map((p: any) => [
                        new Date(p.paymentDate).toLocaleDateString(),
                        `PO-${p.purchaseId}`,
                        p.supplierName,
                        p.amount.toFixed(2),
                        p.paymentMethod,
                        p.referenceNumber || '',
                        p.notes || ''
                    ].map(esc).join(','))
                ].join('\n');

                const finalCsv = companyInfo + '\n' + csvData;

                const { dialog } = require('electron');
                const { promises: fs } = require('fs');
                const ts = new Date();
                const defaultName = `payments_export_${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}.csv`;
                
                const { canceled, filePath } = await dialog.showSaveDialog({
                    title: 'Save Payments CSV',
                    defaultPath: defaultName,
                    filters: [{ name: 'CSV', extensions: ['csv'] }]
                });

                if (canceled || !filePath) return event.reply('payment-export-csv-reply', { success: false, error: 'canceled' });
                
                await fs.writeFile(filePath, finalCsv, 'utf-8');
                event.reply('payment-export-csv-reply', { success: true, data: { filePath } });
            } catch (error) {
                console.error('Export payments CSV error:', error);
                event.reply('payment-export-csv-reply', { success: false, error: String(error) });
            }
        });

        // Export payments as PDF
        ipcMain.on('payment-export-pdf', async (event: IpcMainEvent, args: any[]) => {
            try {
                const filters = args[0] || {};
                const settings = args[1] || {};
                const payments = await this.paymentService.getPaymentRecords(filters, false);
                const totalAmount = payments.reduce((sum: number, p: any) => sum + p.amount, 0);

                const currencySymbol = getCurrencySymbol(settings.currency || 'USD');

                const html = `
                    <html>
                    <head>
                        <style>
                            body { font-family: Arial, sans-serif; margin: 40px; }
                            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
                            .pharmacy-name { font-size: 24px; font-bold; color: #10b981; }
                            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                            th { background-color: #f3f4f6; padding: 12px; text-align: left; border-bottom: 2px solid #d1d5db; }
                            td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
                            .total-row { font-weight: bold; background-color: #f9fafb; }
                            .footer { margin-top: 30px; font-size: 12px; color: #666; text-align: center; }
                        </style>
                    </head>
                    <body>
                        <div class="header">
                            <div class="pharmacy-name">${settings.pharmacyName || 'Pharmacy Name'}</div>
                            <div>${settings.address || ''}</div>
                            <div>Phone: ${settings.phone || ''} | Email: ${settings.email || ''}</div>
                            <h2>PAYMENT RECORDS REPORT</h2>
                            <div>Period: ${filters.fromDate || 'All'} to ${filters.toDate || 'Present'}</div>
                        </div>
                        <table>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>PO #</th>
                                    <th>Supplier</th>
                                    <th>Method</th>
                                    <th>Reference</th>
                                    <th style="text-align: right;">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${payments.map((p: any) => `
                                    <tr>
                                        <td>${new Date(p.paymentDate).toLocaleDateString()}</td>
                                        <td>PO-${p.purchaseId}</td>
                                        <td>${p.supplierName}</td>
                                        <td>${p.paymentMethod}</td>
                                        <td>${p.referenceNumber || '-'}</td>
                                        <td style="text-align: right;">${p.amount.toFixed(2)}</td>
                                    </tr>
                                `).join('')}
                                <tr class="total-row">
                                    <td colspan="5" style="text-align: right;">TOTAL:</td>
                                    <td style="text-align: right;">${currencySymbol}${totalAmount.toFixed(2)}</td>
                                </tr>
                            </tbody>
                        </table>
                        <div class="footer">
                            Generated on ${new Date().toLocaleString()}
                        </div>
                    </body>
                    </html>
                `;

                const { BrowserWindow, dialog } = require('electron');
                const { promises: fs } = require('fs');
                const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
                await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
                const pdfBuffer = await win.webContents.printToPDF({ marginsType: 0, pageSize: 'A4', printBackground: true });
                
                const ts = new Date();
                const defaultName = `payments_export_${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}.pdf`;
                
                const { canceled, filePath } = await dialog.showSaveDialog({
                    title: 'Save Payments PDF',
                    defaultPath: defaultName,
                    filters: [{ name: 'PDF', extensions: ['pdf'] }]
                });

                if (canceled || !filePath) return event.reply('payment-export-pdf-reply', { success: false, error: 'canceled' });
                
                await fs.writeFile(filePath, pdfBuffer);
                event.reply('payment-export-pdf-reply', { success: true, data: { filePath } });
                win.destroy();
            } catch (error) {
                console.error('Export payments PDF error:', error);
                event.reply('payment-export-pdf-reply', { success: false, error: String(error) });
            }
        });
    }
}

export default PaymentController;
