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
                const currencySymbol = getCurrencySymbol(settings.currency || 'PKR');
                
                const header = ['Serial No', 'Date', 'PO #', 'Supplier', 'Company', 'Amount', 'Method', 'Reference', 'Notes'];
                const esc = (v: any) => {
                    const s = v === null || v === undefined ? '' : String(v);
                    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
                };

                const companyInfo = [
                    [settings.pharmacyName || 'Pharmacy Name'],
                    [settings.address || ''],
                    [`Phone: ${settings.phone || ''} | Email: ${settings.email || ''} | ${settings.website && `Website: ${settings.website}`}`],
                    [settings.taxId ? `Tax ID: ${settings.taxId}` : ''],
                    [''],
                    ['PAYMENT RECORDS REPORT'],
                    filters.fromDate && filters.toDate ? [`Period: ${filters.fromDate} to ${filters.toDate}`] : [],
                    [`Generated on: ${new Date().toLocaleString()}`],
                    ['']
                ].filter(row => row.length > 0).map(row => row.map(esc).join(',')).join('\n');

                // Calculate totals
                const totalAmount = payments.reduce((sum: number, p: any) => sum + p.amount, 0);
                
                // Group by payment method
                const paymentsByMethod = payments.reduce((acc: any, p: any) => {
                    const method = p.paymentMethod || 'other';
                    if (!acc[method]) acc[method] = 0;
                    acc[method] += p.amount;
                    return acc;
                }, {});

                const csvData = [
                    header.join(','),
                    ...payments.map((p: any, index: number) => [
                        index + 1,
                        new Date(p.paymentDate).toLocaleDateString(),
                        `PO-${p.purchaseId}`,
                        p.supplierName,
                        p.companyName || '',
                        `${currencySymbol}${p.amount.toFixed(2)}`,
                        p.paymentMethod,
                        p.referenceNumber || '',
                        p.notes || ''
                    ].map(esc).join(','))
                ].join('\n');

                // Footer with totals
                const methodsBreakdown = Object.entries(paymentsByMethod).map(([method, amount]: [string, any]) => {
                    const methodLabel = method === 'cash' ? 'Cash' :
                                      method === 'bank_transfer' || method === 'bank_deposit' ? 'Bank Transfer' :
                                      method === 'check' || method === 'cheque' ? 'Check' :
                                      method === 'online' || method === 'card' ? 'Online' : method;
                    return [methodLabel, `${currencySymbol}${amount.toFixed(2)}`];
                });

                const footer = [
                    [''],
                    ['Summary'],
                    ['Total Records', payments.length],
                    ['Total Amount', `${currencySymbol}${totalAmount.toFixed(2)}`],
                    [''],
                    ['Payment Methods Breakdown'],
                    ...methodsBreakdown,
                    [''],
                    ['Remark: Computer Generated Report'],
                    ['E. & O.E.']
                ].map(row => row.map(esc).join(',')).join('\n');

                const finalCsv = companyInfo + '\n' + csvData + '\n' + footer;

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
                const preview = args[2] || false;
                const payments = await this.paymentService.getPaymentRecords(filters, false);
                const totalAmount = payments.reduce((sum: number, p: any) => sum + p.amount, 0);

                const currencySymbol = getCurrencySymbol(settings.currency || 'PKR');

                // Group payments by method for summary
                const paymentsByMethod = payments.reduce((acc: any, p: any) => {
                    const method = p.paymentMethod || 'other';
                    if (!acc[method]) acc[method] = 0;
                    acc[method] += p.amount;
                    return acc;
                }, {});

                // Import professional template utilities
                const { getProfessionalPDFStyles, generatePDFHeader, wrapPDFContent } = require('../utils/pdf-template');

                const styles = getProfessionalPDFStyles();
                const header = generatePDFHeader({
                    title: 'PAY No.',
                    documentType: 'PAYMENT',
                    period: { from: filters.fromDate, to: filters.toDate },
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

                const tableContent = `
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 40px;">Item</th>
                                <th style="width: 100px;">Date</th>
                                <th style="width: 80px;">PO #</th>
                                <th>Supplier</th>
                                <th style="width: 120px;">Method</th>
                                <th style="width: 150px;">Reference</th>
                                <th>Notes</th>
                                <th class="text-right" style="width: 100px;">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${payments.map((p: any, index: number) => {
                                const methodClass = p.paymentMethod === 'cash' ? 'badge-success' :
                                                  p.paymentMethod === 'bank_transfer' || p.paymentMethod === 'bank_deposit' ? 'badge-info' :
                                                  p.paymentMethod === 'check' || p.paymentMethod === 'cheque' ? 'badge-warning' :
                                                  p.paymentMethod === 'online' || p.paymentMethod === 'card' ? 'badge-purple' : 'badge-gray';
                                
                                const methodLabel = p.paymentMethod === 'cash' ? 'Cash' :
                                                  p.paymentMethod === 'bank_transfer' || p.paymentMethod === 'bank_deposit' ? 'Bank Transfer' :
                                                  p.paymentMethod === 'check' || p.paymentMethod === 'cheque' ? 'Check' :
                                                  p.paymentMethod === 'online' || p.paymentMethod === 'card' ? 'Online' : p.paymentMethod;
                                
                                return `
                                    <tr>
                                        <td>${index + 1}</td>
                                        <td>${new Date(p.paymentDate).toLocaleDateString()}</td>
                                        <td>PO-${p.purchaseId}</td>
                                        <td>
                                            <div style="">${p.supplierName}</div>
                                            ${p.companyName ? `<div style="font-size: 8pt; color: #666;">${p.companyName}</div>` : ''}
                                        </td>
                                        <td>
                                            <span class="badge ${methodClass}">${methodLabel}</span>
                                        </td>
                                        <td style="font-size: 8pt;">
                                            ${p.referenceNumber || '—'}
                                        </td>
                                        <td>${p.notes || ''}  </td>
                                        <td class="text-right" style="font-weight: bold;">${currencySymbol}${p.amount.toFixed(2)}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                `;

                const methodsBreakdown = Object.entries(paymentsByMethod).map(([method, amount]: [string, any]) => {
                    const methodLabel = method === 'cash' ? 'Cash' :
                                      method === 'bank_transfer' || method === 'bank_deposit' ? 'Bank Transfer' :
                                      method === 'check' || method === 'cheque' ? 'Check' :
                                      method === 'online' || method === 'card' ? 'Online' : method;
                    return `${methodLabel}: ${currencySymbol}${amount.toFixed(2)}`;
                }).join('<br/>');

                const footer = `
                    <div class="footer">
                        <div class="footer-content">
                            <div class="footer-left">
                                <div class="remark">
                                    <strong>${settings.currency || 'PKR'}</strong> - Total Payment Value of <strong>${currencySymbol}${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> Only
                                </div>
                                <div class="remark">
                                    <strong>Payment Methods Breakdown:</strong><br/>
                                    ${methodsBreakdown}
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
                                        <span class="totals-label">Total Records:</span>
                                        <span class="totals-value">${payments.length}</span>
                                    </div>
                                    <div class="totals-row grand">
                                        <span class="totals-label">Total Amount:</span>
                                        <span class="totals-value">${currencySymbol}${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;

                const html = wrapPDFContent(styles, header, tableContent, footer);

                // If preview mode, return HTML content
                if (preview) {
                    event.reply('payment-export-pdf-reply', { success: true, data: { htmlContent: html } });
                    return;
                }

                const { BrowserWindow, dialog } = require('electron');
                const { promises: fs } = require('fs');
                const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
                await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
                const pdfBuffer = await win.webContents.printToPDF({ marginsType: 0, pageSize: 'A4', printBackground: true });
                
                const ts = new Date();
                const defaultName = `payment_report_${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}.pdf`;
                
                const { canceled, filePath } = await dialog.showSaveDialog({
                    title: 'Save Payment Report PDF',
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
