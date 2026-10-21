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
        await this.paymentService.repersistSupplierRunningBalances();
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
                const mapMethod = (m: string) =>
                    m === 'bank_transfer'
                        ? 'bank_deposit'
                        : m === 'check'
                          ? 'cheque'
                          : m === 'online'
                            ? 'card'
                            : m;

                const paymentReference =
                    paymentData.referenceNumber ||
                    paymentData.checkNumber ||
                    paymentData.senderNumber ||
                    undefined;

                if (paymentData.allocateAcrossOpenPos && paymentData.supplierId != null) {
                    await this.paymentService.addPaymentAllocatedBySupplier(
                        Number(paymentData.supplierId),
                        Number(paymentData.amount),
                        {
                            paymentMethod: mapMethod(paymentData.paymentMethod) as Payment['paymentMethod'],
                            reference: paymentReference,
                            notes: paymentData.notes,
                            paymentDate: paymentData.paymentDate,
                        },
                    );
                    event.reply('payment-create-reply', { success: true, data: { id: null } });
                    return;
                }

                const payment: Payment = {
                    purchaseId: paymentData.purchaseId,
                    amount: paymentData.amount,
                    paymentMethod: mapMethod(paymentData.paymentMethod) as Payment['paymentMethod'],
                    reference: paymentReference,
                    notes: paymentData.notes,
                    paymentDate: paymentData.paymentDate,
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

        ipcMain.on('payment-get-supplier-ledger', async (event: IpcMainEvent, args: any[]) => {
            try {
                const filters = args[0] || {};
                const data = await this.paymentService.getSupplierLedger(filters);
                event.reply('payment-get-supplier-ledger-reply', { success: true, data });
            } catch (error) {
                console.error('Get supplier ledger error:', error);
                event.reply('payment-get-supplier-ledger-reply', { success: false, error: String(error) });
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

                const money = (n: number) =>
                    `${currencySymbol}${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                const esc = (v: any) =>
                    String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

                // Same layout as the Payments screen: one row per payment as it was made,
                // with the purchases it was split across (oldest purchase first).
                const groups: { at: string; supplierName: string; companyName?: string; paymentMethod: string; referenceNumber?: string; total: number; pieces: any[] }[] = [];
                const groupsByKey = new Map<string, (typeof groups)[number]>();
                payments.forEach((p: any) => {
                    const key = p.batchId || `single-${p.id}`;
                    let group = groupsByKey.get(key);
                    if (!group) {
                        group = {
                            at: p.paymentDate,
                            supplierName: p.supplierName,
                            companyName: p.companyName,
                            paymentMethod: p.paymentMethod,
                            referenceNumber: p.referenceNumber,
                            total: 0,
                            pieces: [],
                        };
                        groupsByKey.set(key, group);
                        groups.push(group);
                    }
                    group.total += Number(p.amount) || 0;
                    group.pieces.push(p);
                });
                // Records arrive newest first; the money was applied oldest purchase first.
                groups.forEach((g) => g.pieces.reverse());

                const methodLabel = (method: string) =>
                    method === 'cash' ? 'Cash' :
                    method === 'bank_transfer' || method === 'bank_deposit' ? 'Bank Transfer' :
                    method === 'check' || method === 'cheque' ? 'Cheque' :
                    method === 'online' || method === 'card' ? 'Online' : esc(method);

                // What is still unpaid on the purchases in this report (latest balance per PO)
                const latestBalanceByPo = new Map<number, number>();
                payments.forEach((p: any) => {
                    if (!latestBalanceByPo.has(p.purchaseId)) {
                        latestBalanceByPo.set(p.purchaseId, Math.max(0, Number(p.remainingAfter) || 0));
                    }
                });
                const stillDue = Array.from(latestBalanceByPo.values()).reduce((sum, v) => sum + v, 0);
                const settledCount = Array.from(latestBalanceByPo.values()).filter((v) => v <= 0.005).length;

                const summaryBox = (label: string, value: string, sub: string) => `
                    <td style="width: 25%; padding: 10px 12px; border: 1px solid #000; vertical-align: top;">
                        <div style="font-size: 7pt; letter-spacing: 0.8px; text-transform: uppercase; color: #555;">${label}</div>
                        <div style="font-size: 13pt; font-weight: bold; margin-top: 3px;">${value}</div>
                        <div style="font-size: 7.5pt; color: #666; margin-top: 2px;">${sub}</div>
                    </td>`;

                const cell = 'padding: 7px 8px; font-size: 8.5pt; vertical-align: top;';
                const tableContent = `
                    <table style="margin-bottom: 18px; border-collapse: collapse;">
                        <tr>
                            ${summaryBox('Total Paid', money(totalAmount), `${groups.length} payment${groups.length !== 1 ? 's' : ''} in this period`)}
                            ${summaryBox('Purchases Covered', String(latestBalanceByPo.size), `${settledCount} fully settled`)}
                            ${summaryBox('Balance Still Due', money(stillDue), 'on the purchases listed')}
                            ${summaryBox('Suppliers', String(new Set(groups.map((g) => g.supplierName)).size), 'paid in this period')}
                        </tr>
                    </table>

                    <div style="font-size: 8pt; font-weight: bold; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 6px;">Payment Details</div>
                    <table style="border-collapse: collapse;">
                        <thead>
                            <tr>
                                <th style="width: 26px;">No.</th>
                                <th style="width: 72px;">Date</th>
                                <th>Supplier</th>
                                <th style="width: 92px;">Method / Ref.</th>
                                <th style="width: 52px;">PO No.</th>
                                <th class="text-right" style="width: 84px;">Applied</th>
                                <th class="text-right" style="width: 92px;">Balance After</th>
                                <th class="text-right" style="width: 88px;">Payment Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${groups.map((g, index) => {
                                const d = new Date(g.at);
                                const rows = g.pieces.length;
                                const shade = index % 2 === 1 ? 'background-color: #fafafa;' : '';
                                const notes = Array.from(new Set(g.pieces.map((piece: any) => String(piece.notes || '').trim()).filter(Boolean)));
                                return g.pieces.map((piece: any, i: number) => {
                                    const left = Math.max(0, Number(piece.remainingAfter) || 0);
                                    const last = i === rows - 1;
                                    const rowBorder = last ? 'border-bottom: 1px solid #bbb;' : 'border-bottom: 1px dotted #ddd;';
                                    const balance = left <= 0.005
                                        ? '<span style="color: #047857; font-weight: bold;">Settled</span>'
                                        : `<span style="color: #b45309; font-weight: bold;">${money(left)}</span>`;
                                    const groupCells = i === 0 ? `
                                        <td rowspan="${rows}" style="${cell} border-bottom: 1px solid #bbb;">${index + 1}</td>
                                        <td rowspan="${rows}" style="${cell} border-bottom: 1px solid #bbb;">
                                            ${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                            <div style="font-size: 7.5pt; color: #666;">${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
                                        </td>
                                        <td rowspan="${rows}" style="${cell} border-bottom: 1px solid #bbb;">
                                            <div style="font-weight: bold;">${esc(g.supplierName)}</div>
                                            ${g.companyName ? `<div style="font-size: 7.5pt; color: #666;">${esc(g.companyName)}</div>` : ''}
                                            ${rows > 1 ? `<div style="font-size: 7.5pt; color: #555; margin-top: 2px;">Split over ${rows} purchases</div>` : ''}
                                            ${notes.length ? `<div style="font-size: 7.5pt; color: #666; font-style: italic; margin-top: 2px;">${notes.map(esc).join('; ')}</div>` : ''}
                                        </td>
                                        <td rowspan="${rows}" style="${cell} border-bottom: 1px solid #bbb;">
                                            ${methodLabel(g.paymentMethod)}
                                            ${g.referenceNumber ? `<div style="font-size: 7.5pt; color: #666;">Ref: ${esc(g.referenceNumber)}</div>` : ''}
                                        </td>` : '';
                                    const totalCell = i === 0 ? `
                                        <td rowspan="${rows}" class="text-right" style="${cell} border-bottom: 1px solid #bbb; font-weight: bold;">${money(g.total)}</td>` : '';
                                    return `
                                        <tr style="${shade}">
                                            ${groupCells}
                                            <td style="${cell} ${rowBorder}">PO-${piece.purchaseId}</td>
                                            <td class="text-right" style="${cell} ${rowBorder}">${money(piece.amount)}</td>
                                            <td class="text-right" style="${cell} ${rowBorder}">${balance}</td>
                                            ${totalCell}
                                        </tr>
                                    `;
                                }).join('');
                            }).join('')}
                        </tbody>
                    </table>
                    <div style="font-size: 7.5pt; color: #555; margin-top: 6px; line-height: 1.5;">
                        <strong>Applied</strong> is the part of the payment that went to each purchase. <strong>Balance After</strong> is what was left to pay on that purchase straight after the payment.
                        A payment that covers several purchases is applied to the oldest unpaid purchase first.
                    </div>
                `;

                const methodsBreakdown = Object.entries(paymentsByMethod).map(([method, amount]: [string, any]) => {
                    const methodLabel = method === 'cash' ? 'Cash' :
                                      method === 'bank_transfer' || method === 'bank_deposit' ? 'Bank Transfer' :
                                      method === 'check' || method === 'cheque' ? 'Check' :
                                      method === 'online' || method === 'card' ? 'Online' : method;
                    return `${methodLabel}: ${money(amount)}`;
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
                                        <span class="totals-label">Payments:</span>
                                        <span class="totals-value">${groups.length}</span>
                                    </div>
                                    <div class="totals-row">
                                        <span class="totals-label">Purchases Covered:</span>
                                        <span class="totals-value">${latestBalanceByPo.size}</span>
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
