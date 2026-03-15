import { ipcMain, IpcMainEvent } from 'electron';
import { PurchaseService, Purchase } from '../services/purchase.service';
import { currencySymbols, getCurrencySymbol } from '../../../common/currency';
import { web } from 'webpack';

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
        const supplierId = args[1] as number | undefined;
        const fromDate = args[2] as string | undefined;
        const toDate = args[3] as string | undefined;
        
        // Get purchases with date range filter
        let purchases = await this.purchaseService.getAllPurchases(fromDate, toDate);
        
        // Filter by supplier if specified
        if (supplierId) {
          purchases = purchases.filter(p => p.supplierId === supplierId);
        }
        
        const currencySymbol = getCurrencySymbol(settings.currency || 'PKR');
        
        const esc = (v: any) => {
          const s = v === null || v === undefined ? '' : String(v);
          return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        };

        // Company Header
        const dateRangeText = fromDate && toDate 
          ? `Date Range: ${fromDate} to ${toDate}`
          : fromDate 
            ? `From Date: ${fromDate}`
            : toDate 
              ? `To Date: ${toDate}`
              : 'All Records';
        
        const companyInfo = [
          [settings.pharmacyName || 'Pharmacy Name'],
          [settings.address || ''],
          [`Phone: ${settings.phone || ''} | Email: ${settings.email || ''} | ${settings.website && `Website: ${settings.website}`}`],
          [settings.taxId ? `Tax ID: ${settings.taxId}` : ''],
          [''],
          ['PURCHASE RECORDS REPORT'],
          [dateRangeText],
          supplierId && purchases.length > 0 ? [`Supplier Filter: ${purchases[0].supplierName}`] : [],
          [`Generated on: ${new Date().toLocaleString()}`],
          ['']
        ].filter(row => row.length > 0).map(row => row.map(esc).join(',')).join('\n');

        // Column headers
        const header = ['Item', 'Date', 'PO #', 'Medicine', 'Packets', 'Total Pills', 'Price/Pkt', 'Subtotal', 'Disc.', 'Tax', 'Total'];

        // Calculate grand totals
        let totalItems = 0;
        let grandSubtotal = 0;
        let grandDiscount = 0;
        let grandTax = 0;
        let grandTotal = 0;

        // Group purchases by supplier
        const supplierGroups = new Map<string, typeof purchases>();
        purchases.forEach(p => {
          const key = `${p.supplierName}|${p.supplierCompanyName || ''}`;
          if (!supplierGroups.has(key)) {
            supplierGroups.set(key, []);
          }
          supplierGroups.get(key)!.push(p);
        });

        let csvRows: string[] = [];
        let itemNumber = 1;

        // Process each supplier group
        for (const [supplierKey, supplierPurchases] of supplierGroups) {
          const [supplierName, companyName] = supplierKey.split('|');
          
          // Calculate supplier totals
          const supplierItemCount = supplierPurchases.reduce((sum, p) => sum + p.items.length, 0);
          const supplierTotal = supplierPurchases.reduce((sum, p) => sum + p.grandTotal, 0);

          // Supplier header row
          csvRows.push(['', '', '', `${supplierName}${companyName ? ` - ${companyName}` : ''}`, '', '', '', '', '', `${supplierItemCount} items • ${currencySymbol}${supplierTotal.toFixed(2)}`].map(esc).join(','));
          csvRows.push(''); // Empty row

          // Column headers for this supplier
          csvRows.push(header.map(esc).join(','));

          // Process each purchase for this supplier
          supplierPurchases.forEach(purchase => {
            purchase.items.forEach((item, idx) => {
              const itemSubtotal = item.lineSubtotal;
              const itemDiscount = item.discountAmount || 0;
              const itemTax = item.taxAmount || 0;
              const itemTotal = item.lineTotal;

              totalItems++;
              grandSubtotal += itemSubtotal;
              grandDiscount += itemDiscount;
              grandTax += itemTax;
              grandTotal += itemTotal;

              csvRows.push([
                itemNumber++,
                idx === 0 && purchase.createdAt ? new Date(purchase.createdAt).toLocaleDateString() : '',
                idx === 0 ? `PO-${purchase.id}` : '',
                `${item.medicineName} (Exp: ${item.expiryDate})`,
                item.packetQuantity,
                item.totalPills,
                `${currencySymbol}${item.pricePerPacket.toFixed(2)}`,
                `${currencySymbol}${itemSubtotal.toFixed(2)}`,
                `${currencySymbol}${itemDiscount.toFixed(2)}`,
                `${currencySymbol}${itemTax.toFixed(2)}`,
                `${currencySymbol}${itemTotal.toFixed(2)}`
              ].map(esc).join(','));
            });
          });

          csvRows.push(''); // Empty row after supplier
        }

        const csvData = csvRows.join('\n');

        // Footer with totals
        const footer = [
          [''],
          ['Summary'],
          ['Total Items', totalItems],
          ['Total Subtotal', `${currencySymbol}${grandSubtotal.toFixed(2)}`],
          ['Total Discount', `${currencySymbol}${grandDiscount.toFixed(2)}`],
          ['Total Tax', `${currencySymbol}${grandTax.toFixed(2)}`],
          ['Grand Total', `${currencySymbol}${grandTotal.toFixed(2)}`],
          [''],
          [`${settings.currency || 'PKR'} - Total Purchase Value of ${currencySymbol}${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Only`],
          [''],
          ['Remark: Computer Generated Report'],
          ['E. & O.E.']
        ].map(row => row.map(esc).join(',')).join('\n');

        const finalCsv = companyInfo + '\n' + csvData + '\n' + footer;

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
        const supplierId = args[3]; // New parameter for supplier filter
        const preview = args[4] === true;

        // Get flat purchase rows (one row per medicine item)
        const rows = await this.purchaseService.getAllPurchaseFlatRows(fromDate, toDate, supplierId);
        
        // Calculate totals
        const total = rows.reduce((sum, r: any) => sum + (r.lineTotal || 0), 0);
        const totalDiscount = rows.reduce((sum, r: any) => sum + (r.discountAmount || 0), 0);
        const totalTax = rows.reduce((sum, r: any) => sum + (r.taxAmount || 0), 0);
        const subtotal = rows.reduce((sum, r: any) => sum + (r.lineSubtotal || 0), 0);
        const currencySymbol = getCurrencySymbol(settings.currency || 'USD');
        
        // Import professional template utilities
        const { getProfessionalPDFStyles, generatePDFHeader, wrapPDFContent } = require('../utils/pdf-template');

        const styles = getProfessionalPDFStyles();
        const header = generatePDFHeader({
          title: 'PR No.',
          documentType: 'PURCHASE',
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

        // Group rows by supplier for better organization
        const rowsBySupplier: { [key: string]: any[] } = {};
        rows.forEach((row: any) => {
          const supplierKey = row.supplierName || 'Unknown Supplier';
          if (!rowsBySupplier[supplierKey]) {
            rowsBySupplier[supplierKey] = [];
          }
          rowsBySupplier[supplierKey].push(row);
        });

        let tableRows = '';
        let itemIndex = 0;

        // Generate table rows grouped by supplier
        Object.keys(rowsBySupplier).sort().forEach(supplierName => {
          const supplierRows = rowsBySupplier[supplierName];
          const supplierTotal = supplierRows.reduce((sum, r) => sum + r.lineTotal, 0);
          
          // Supplier header row
          tableRows += `
            <tr style="background-color: #ffffff;">
              <td colspan="11" style="font-weight: semi-bold; font-size: 10pt; padding: 10px 8px; background-color: #ffffff;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <span style="color: #000000;">📦 ${supplierName}</span>
                    ${supplierRows[0].supplierCompanyName ? `<span style="font-size: 8pt;font-weight:normal; color: #000000; margin-left: 10px;">${supplierRows[0].supplierCompanyName}</span> ` : ''}
                  </div>
                  <div style="font-size: 9pt; color: #000000;">
                    ${supplierRows.length} items • ${currencySymbol}${supplierTotal.toFixed(2)}
                  </div>
                </div>
              </td>
            </tr>
          `;

          // Medicine items for this supplier
          supplierRows.forEach((r: any) => {
            itemIndex++;
            tableRows += `
              <tr>
                <td>${itemIndex} ${r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''}</td>

                <td>PO-${r.purchaseId}</td>
                <td>
                  <div style="">${r.medicineName}</div>
                  ${r.expiryDate ? `<div style="font-size: 7pt; color: #666; margin-top:2pt">Exp: ${new Date(r.expiryDate).toLocaleDateString()}</div>` : ''}
                </td>
                <td class="text-center">${r.packetQuantity} <div style="font-size: 7pt; color: #666;">Pills/Qty: ${r.pillsPerPacket}</div> </td>
                <td class="text-center">${r.totalPills}</td>
                <td class="text-right">${currencySymbol}${r.pricePerPacket.toFixed(2)}</td>
                <td class="text-right">${currencySymbol}${r.lineSubtotal.toFixed(2)}</td>
                <td class="text-right">${currencySymbol}${(r.discountAmount || 0).toFixed(2)}</td>
                <td class="text-right">${currencySymbol}${(r.taxAmount || 0).toFixed(2)}</td>
                <td class="text-right" style="font-weight: bold;">${currencySymbol}${r.lineTotal.toFixed(2)}</td>
              </tr>
            `;
          });
        });

        const tableContent = `
          <table>
            <thead>
              <tr>
                <th style="width: 40px;">Item Date</th>
                <th style="width: 70px;">PO #</th>
                <th>Medicine</th>
                <th class="text-center" style="width: 70px;">Packets</th>
                <th class="text-center" style="width: 80px;">Total Pills</th>
                <th class="text-right" style="width: 90px;">Price/Pkt</th>
                <th class="text-right" style="width: 90px;">Subtotal</th>
                <th class="text-right" style="width: 80px;">Disc.</th>
                <th class="text-right" style="width: 80px;">Tax</th>
                <th class="text-right" style="width: 100px;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        `;

        const footer = `
          <div class="footer">
            <div class="footer-content">
              <div class="footer-left">
                <div class="remark">
                  <strong>${settings.currency || 'USD'}</strong> - Total Purchase Value of <strong>${currencySymbol}${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> Only
                </div>
                <div class="remark">
                  <strong>Purchase Breakdown:</strong><br/>
                  Subtotal: ${currencySymbol}${subtotal.toFixed(2)}<br/>
                  Total Discount: ${currencySymbol}${totalDiscount.toFixed(2)}<br/>
                  Total Tax: ${currencySymbol}${totalTax.toFixed(2)}<br/>
                  Suppliers: ${Object.keys(rowsBySupplier).length}
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
                    <span class="totals-label">Total Items:</span>
                    <span class="totals-value">${rows.length}</span>
                  </div>
                  <div class="totals-row">
                    <span class="totals-label">Subtotal:</span>
                    <span class="totals-value">${currencySymbol}${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div class="totals-row">
                    <span class="totals-label">Discount:</span>
                    <span class="totals-value">-${currencySymbol}${totalDiscount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div class="totals-row">
                    <span class="totals-label">Tax:</span>
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
          event.reply('purchase-export-pdf-reply', { success: true, data: { htmlContent: html } });
        } else {
          // Generate PDF and save to file
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
        }
      } catch (error) {
        console.error('Export purchases PDF error:', error);
        event.reply('purchase-export-pdf-reply', { success: false, error: String(error) });
      }
    });
  }
}

export default PurchaseController;

