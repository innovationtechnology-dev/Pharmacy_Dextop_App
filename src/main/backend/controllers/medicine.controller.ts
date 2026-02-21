import { ipcMain, IpcMainEvent, dialog } from 'electron';
import { promises as fs } from 'fs';
import { MedicineService, Medicine } from '../services/medicine.service';
import { SalesService, Sale } from '../services/sales.service';
import { SupplierService } from '../services/supplier.service';
import {
  PurchaseService,
  PurchaseItemInput,
} from '../services/purchase.service';

export class MedicineController {
  private medicineService: MedicineService;

  private salesService: SalesService;

  private supplierService: SupplierService;

  private purchaseService: PurchaseService;

  constructor() {
    this.medicineService = new MedicineService();
    this.salesService = new SalesService();
    this.supplierService = new SupplierService();
    this.purchaseService = new PurchaseService();
    this.registerHandlers();
  }

  /**
   * Initialize tables
   */
  public async initializeTables(): Promise<void> {
    await this.medicineService.initializeTable();
    await this.salesService.initializeTable();
  }

  /**
   * Register all IPC handlers for medicine operations
   */
  private registerHandlers(): void {
    // Get all medicines
    ipcMain.on('medicine-get-all', async (event: IpcMainEvent) => {
      try {
        const medicines = await this.medicineService.getAllMedicines();
        event.reply('medicine-get-all-reply', { success: true, data: medicines });
      } catch (error) {
        console.error('Get all medicines error:', error);
        event.reply('medicine-get-all-reply', { success: false, error: String(error) });
      }
    });

    // Get flat sales rows for preview
    ipcMain.on('sales-get-flat-rows', async (event: IpcMainEvent) => {
      try {
        const rows = await this.salesService.getAllSalesFlatRows();
        event.reply('sales-get-flat-rows-reply', { success: true, data: rows });
      } catch (error) {
        console.error('Get flat sales rows error:', error);
        event.reply('sales-get-flat-rows-reply', { success: false, error: String(error) });
      }
    });

    // Get flat sales rows by date range for preview
    ipcMain.on('sales-get-flat-rows-range', async (event: IpcMainEvent, args: any[]) => {
      try {
        const fromDate = args[0] as string;
        const toDate = args[1] as string;
        const rows = await this.salesService.getAllSalesFlatRowsByRange(fromDate, toDate);
        event.reply('sales-get-flat-rows-range-reply', { success: true, data: rows });
      } catch (error) {
        console.error('Get flat sales rows (range) error:', error);
        event.reply('sales-get-flat-rows-range-reply', { success: false, error: String(error) });
      }
    });

    // Export CSV by date range
    ipcMain.on('sales-export-csv-range', async (event: IpcMainEvent, args: any[]) => {
      try {
        const fromDate = args[0] as string;
        const toDate = args[1] as string;
        const settings = args[2] || {};
        const rows = await this.salesService.getAllSalesFlatRowsByRange(fromDate, toDate);
        const header = ['Serial No', 'Date', 'Customer', 'Phone', 'Medicine', 'Pills', 'Unit Price', 'Subtotal', 'Discount', 'Tax', 'Total'];
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
          ['SALES REPORT'],
          [`Period: ${fromDate} to ${toDate}`],
          [`Generated on: ${new Date().toLocaleString()}`],
          ['']
        ].map(row => row.map(esc).join(',')).join('\n');

        const csvData = [
          header.join(','),
          ...rows.map((r, index) => {
            const rowData: any = {
              serialNo: index + 1,
              createdAt: r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '',
              customerName: r.customerName || '-',
              customerPhone: r.customerPhone || '-',
              medicineName: r.medicineName,
              pills: r.pills,
              unitPrice: r.unitPrice.toFixed(2),
              subtotal: r.subtotal.toFixed(2),
              discountAmount: r.discountAmount.toFixed(2),
              taxAmount: r.taxAmount.toFixed(2),
              total: r.total.toFixed(2)
            };
            return [
              rowData.serialNo, rowData.createdAt, rowData.customerName, rowData.customerPhone,
              rowData.medicineName, rowData.pills, rowData.unitPrice, rowData.subtotal,
              rowData.discountAmount, rowData.taxAmount, rowData.total
            ].map(esc).join(',');
          })
        ].join('\n');

        const finalCsv = companyInfo + '\n' + csvData;

        const ts = new Date();
        const defaultName = `sales_${fromDate}_to_${toDate}_${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}.csv`;
        const { canceled, filePath } = await dialog.showSaveDialog({ title: 'Save Sales CSV', defaultPath: defaultName, filters: [{ name: 'CSV', extensions: ['csv'] }] });
        if (canceled || !filePath) return event.reply('sales-export-csv-range-reply', { success: false, error: 'canceled' });
        await fs.writeFile(filePath, finalCsv, 'utf-8');
        event.reply('sales-export-csv-range-reply', { success: true, data: { filePath } });
      } catch (error) {
        console.error('Export sales CSV (range) error:', error);
        event.reply('sales-export-csv-range-reply', { success: false, error: String(error) });
      }
    });

    // Export PDF with formatted report by date range
    ipcMain.on('sales-export-pdf', async (event: IpcMainEvent, args: any[]) => {
      try {
        const fromDate = args[0] as string;
        const toDate = args[1] as string;
        const settings = args[2] || {};
        const rows = await this.salesService.getAllSalesFlatRowsByRange(fromDate, toDate);
        const total = rows.reduce((sum, r: any) => sum + (r.total || 0), 0);
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
              .report-meta {display: flex; justify-content: space-between; align-items: center; width: 100%;}
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
            <h2>Sales Report</h2>
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
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Medicine</th>
                  <th class="text-center">Pills</th>
                  <th class="text-right">Unit Price</th>
                  <th class="text-right">Subtotal</th>
                  <th class="text-right">Discount</th>
                  <th class="text-right">Tax</th>
                  <th class="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map((r: any, index: number) => `
                  <tr>
                    <td>${index + 1}</td>
                    <td>${r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''}</td>
                    <td>${r.customerName || '-'}</td>
                    <td>${r.customerPhone || '-'}</td>
                    <td>${r.medicineName}</td>
                    <td class="text-center">${r.pills}</td>
                    <td class="text-right">${r.unitPrice.toFixed(2)}</td>
                    <td class="text-right">${r.subtotal.toFixed(2)}</td>
                    <td class="text-right">${r.discountAmount.toFixed(2)}</td>
                    <td class="text-right">${r.taxAmount.toFixed(2)}</td>
                    <td class="text-right" style="font-weight: bold;">${r.total.toFixed(2)}</td>
                  </tr>`).join('')}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="10" class="text-right">Grand Total</td>
                  <td class="text-right">${total.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>

            <div class="footer">
              <p>This is a computer-generated document. No signature is required.</p>
            </div>
          </body>
          </html>`;

        const win = new (require('electron').BrowserWindow)({ show: false, webPreferences: { offscreen: true } });
        await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
        const pdfBuffer = await win.webContents.printToPDF({ marginsType: 0, pageSize: 'A4', printBackground: true });
        const ts = new Date();
        const defaultName = `sales_${fromDate}_to_${toDate}_${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}.pdf`;
        const { canceled, filePath } = await dialog.showSaveDialog({ title: 'Save Sales PDF', defaultPath: defaultName, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
        if (canceled || !filePath) return event.reply('sales-export-pdf-reply', { success: false, error: 'canceled' });
        await fs.writeFile(filePath, pdfBuffer);
        event.reply('sales-export-pdf-reply', { success: true, data: { filePath } });
        win.destroy();
      } catch (error) {
        console.error('Export sales PDF error:', error);
        event.reply('sales-export-pdf-reply', { success: false, error: String(error) });
      }
    });

    // Get sales summary by date range
    ipcMain.on('sales-get-summary-range', async (event: IpcMainEvent, args: any[]) => {
      try {
        const fromDate = args[0] as string; // YYYY-MM-DD
        const toDate = args[1] as string;   // YYYY-MM-DD
        const rows = await this.salesService.getSalesSummaryByRange(fromDate, toDate);
        event.reply('sales-get-summary-range-reply', { success: true, data: rows });
      } catch (error) {
        console.error('Get sales summary by range error:', error);
        event.reply('sales-get-summary-range-reply', { success: false, error: String(error) });
      }
    });

    // Export all sales as CSV
    ipcMain.on('sales-export-csv', async (event: IpcMainEvent) => {
      try {
        const rows = await this.salesService.getAllSalesFlatRows();
        const header = ['saleId', 'createdAt', 'customerName', 'customerPhone', 'medicineId', 'medicineName', 'pills', 'unitPrice', 'subtotal', 'discountAmount', 'taxAmount', 'total'];
        const esc = (v: any) => {
          const s = v === null || v === undefined ? '' : String(v);
          return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        };
        const csv = [
          header.join(','),
          ...rows.map(r => header.map(k => esc((r as any)[k])).join(','))
        ].join('\n');

        const ts = new Date();
        const defaultName = `sales_export_${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}_${String(ts.getHours()).padStart(2, '0')}${String(ts.getMinutes()).padStart(2, '0')}${String(ts.getSeconds()).padStart(2, '0')}.csv`;
        const { canceled, filePath } = await dialog.showSaveDialog({
          title: 'Save Sales Export',
          defaultPath: defaultName,
          filters: [{ name: 'CSV', extensions: ['csv'] }],
        });
        if (canceled || !filePath) {
          event.reply('sales-export-csv-reply', { success: false, error: 'canceled' });
          return;
        }
        await fs.writeFile(filePath, csv, 'utf-8');
        event.reply('sales-export-csv-reply', { success: true, data: { filePath } });
      } catch (error) {
        console.error('Export sales CSV error:', error);
        event.reply('sales-export-csv-reply', { success: false, error: String(error) });
      }
    });

    // Get medicine by barcode
    ipcMain.on('medicine-get-by-barcode', async (event: IpcMainEvent, args: any[]) => {
      try {
        const barcode = args[0] as string;
        const medicine = await this.medicineService.getMedicineByBarcode(barcode);
        event.reply('medicine-get-by-barcode-reply', { success: true, data: medicine });
      } catch (error) {
        console.error('Get medicine by barcode error:', error);
        event.reply('medicine-get-by-barcode-reply', { success: false, error: String(error) });
      }
    });

    // Get medicine by ID
    ipcMain.on('medicine-get-by-id', async (event: IpcMainEvent, args: any[]) => {
      try {
        const id = args[0] as number;
        const medicine = await this.medicineService.getMedicineById(id);
        event.reply('medicine-get-by-id-reply', { success: true, data: medicine });
      } catch (error) {
        console.error('Get medicine by ID error:', error);
        event.reply('medicine-get-by-id-reply', { success: false, error: String(error) });
      }
    });

    // Search medicines
    ipcMain.on('medicine-search', async (event: IpcMainEvent, args: any[]) => {
      try {
        const searchTerm = args[0] as string;
        const medicines = await this.medicineService.searchMedicines(searchTerm);
        event.reply('medicine-search-reply', { success: true, data: medicines });
      } catch (error) {
        console.error('Search medicines error:', error);
        event.reply('medicine-search-reply', { success: false, error: String(error) });
      }
    });

    // Get expiring medicines
    ipcMain.on('medicine-get-expiring', async (event: IpcMainEvent, args: any[]) => {
      try {
        const threshold = args?.[0] as number | undefined;
        const alerts = await this.medicineService.getExpiringMedicines(threshold || 30);
        event.reply('medicine-get-expiring-reply', { success: true, data: alerts });
      } catch (error) {
        console.error('Get expiring medicines error:', error);
        event.reply('medicine-get-expiring-reply', { success: false, error: String(error) });
      }
    });

    // Create medicine
    ipcMain.on('medicine-create', async (event: IpcMainEvent, args: any[]) => {
      try {
        const medicine = args[0] as Medicine;
        const id = await this.medicineService.createMedicine(medicine);
        event.reply('medicine-create-reply', { success: true, data: { id } });
      } catch (error) {
        console.error('Create medicine error:', error);
        event.reply('medicine-create-reply', { success: false, error: String(error) });
      }
    });

    // Update medicine
    ipcMain.on('medicine-update', async (event: IpcMainEvent, args: any[]) => {
      try {
        const id = args[0] as number;
        const medicine = args[1] as Partial<Medicine>;
        await this.medicineService.updateMedicine(id, medicine);
        event.reply('medicine-update-reply', { success: true });
      } catch (error) {
        console.error('Update medicine error:', error);
        event.reply('medicine-update-reply', { success: false, error: String(error) });
      }
    });

    // Delete medicine
    ipcMain.on('medicine-delete', async (event: IpcMainEvent, args: any[]) => {
      try {
        const id = args[0] as number;
        await this.medicineService.deleteMedicine(id);
        event.reply('medicine-delete-reply', { success: true });
      } catch (error) {
        console.error('Delete medicine error:', error);
        event.reply('medicine-delete-reply', { success: false, error: String(error) });
      }
    });

    // Create sale
    ipcMain.on('sale-create', async (event: IpcMainEvent, args: any[]) => {
      try {
        const sale = args[0] as Sale;
        const saleId = await this.salesService.createSale(sale);
        event.reply('sale-create-reply', { success: true, data: { id: saleId } });
      } catch (error) {
        console.error('Create sale error:', error);
        event.reply('sale-create-reply', { success: false, error: String(error) });
      }
    });

    // Get all sales
    ipcMain.on('sale-get-all', async (event: IpcMainEvent) => {
      try {
        const sales = await this.salesService.getAllSales();
        event.reply('sale-get-all-reply', { success: true, data: sales });
      } catch (error) {
        console.error('Get all sales error:', error);
        event.reply('sale-get-all-reply', { success: false, error: String(error) });
      }
    });

    // Update sale
    ipcMain.on('sale-update', async (event: IpcMainEvent, args: any[]) => {
      try {
        const saleId = args[0] as number;
        const sale = args[1] as Sale;
        await this.salesService.updateSale(saleId, sale);
        event.reply('sale-update-reply', { success: true });
      } catch (error) {
        console.error('Update sale error:', error);
        event.reply('sale-update-reply', { success: false, error: String(error) });
      }
    });

    // Delete sale
    ipcMain.on('sale-delete', async (event: IpcMainEvent, args: any[]) => {
      try {
        const saleId = args[0] as number;
        await this.salesService.deleteSale(saleId);
        event.reply('sale-delete-reply', { success: true });
      } catch (error) {
        console.error('Delete sale error:', error);
        event.reply('sale-delete-reply', { success: false, error: String(error) });
      }
    });

    // Get monthly financial summary
    ipcMain.on('financial-get-monthly', async (event: IpcMainEvent) => {
      try {
        const summary = await this.salesService.getMonthlyFinancialSummary();
        event.reply('financial-get-monthly-reply', { success: true, data: summary });
      } catch (error) {
        console.error('Get monthly financial summary error:', error);
        event.reply('financial-get-monthly-reply', { success: false, error: String(error) });
      }
    });

    // Get financial summary by date range
    ipcMain.on('financial-get-date-range', async (event: IpcMainEvent, args: any[]) => {
      try {
        const fromDate = args[0] as string;
        const toDate = args[1] as string;

        const summary = await this.salesService.getFinancialSummaryByDateRange(fromDate, toDate);
        event.reply('financial-get-date-range-reply', { success: true, data: summary });
      } catch (error) {
        console.error('Get financial summary by date range error:', error);
        event.reply('financial-get-date-range-reply', { success: false, error: String(error) });
      }
    });

    // Seed sample medicines with quantities (for testing)
    ipcMain.on('medicine-seed-sample', async (event: IpcMainEvent) => {
      try {
        // Sample medicines with realistic data
        const sampleMedicines: Array<Medicine & {
          packets: number;
          pricePerPacket: number;
          expiryDays: number;
        }> = [
            { name: 'Paracetamol 500mg', barcode: '1234567890123', pillQuantity: 10, status: 'active', packets: 50, pricePerPacket: 150, expiryDays: 365 },
            { name: 'Aspirin 100mg', barcode: '1234567890124', pillQuantity: 15, status: 'active', packets: 40, pricePerPacket: 200, expiryDays: 365 },
            { name: 'Amoxicillin 250mg', barcode: '1234567890125', pillQuantity: 12, status: 'active', packets: 30, pricePerPacket: 300, expiryDays: 730 },
            { name: 'Ibuprofen 200mg', barcode: '1234567890126', pillQuantity: 8, status: 'active', packets: 45, pricePerPacket: 180, expiryDays: 365 },
            { name: 'Metformin 500mg', barcode: '1234567890127', pillQuantity: 20, status: 'active', packets: 35, pricePerPacket: 250, expiryDays: 730 },
            { name: 'Omeprazole 20mg', barcode: '1234567890128', pillQuantity: 14, status: 'active', packets: 25, pricePerPacket: 400, expiryDays: 730 },
            { name: 'Lisinopril 10mg', barcode: '1234567890129', pillQuantity: 16, status: 'active', packets: 30, pricePerPacket: 350, expiryDays: 730 },
            { name: 'Atorvastatin 20mg', barcode: '1234567890130', pillQuantity: 18, status: 'active', packets: 28, pricePerPacket: 500, expiryDays: 730 },
            { name: 'Levothyroxine 50mcg', barcode: '1234567890131', pillQuantity: 25, status: 'active', packets: 20, pricePerPacket: 450, expiryDays: 730 },
            { name: 'Amlodipine 5mg', barcode: '1234567890132', pillQuantity: 24, status: 'active', packets: 32, pricePerPacket: 380, expiryDays: 730 },
          ];

        // Get or create default supplier
        let supplierId: number;
        const existingSuppliers = await this.supplierService.getAllSuppliers();
        const defaultSupplier = existingSuppliers.find(s => s.name === 'Default Supplier');

        if (defaultSupplier) {
          supplierId = defaultSupplier.id!;
        } else {
          supplierId = await this.supplierService.createSupplier({
            name: 'Default Supplier',
            email: 'supplier@pharmacy.com',
            phone: '+92-300-1234567',
            address: '123 Medical Street, Karachi',
            contactPerson: 'John Doe',
          });
        }

        const createdMedicines = [];
        const purchaseItems: PurchaseItemInput[] = [];

        // Create medicines
        for (const medicine of sampleMedicines) {
          try {
            // Check if medicine already exists
            const existing = medicine.barcode
              ? await this.medicineService.getMedicineByBarcode(medicine.barcode)
              : null;

            let medicineId: number;
            if (existing) {
              medicineId = existing.id!;
            } else {
              medicineId = await this.medicineService.createMedicine({
                name: medicine.name,
                barcode: medicine.barcode,
                pillQuantity: medicine.pillQuantity,
                status: medicine.status,
              });
            }

            createdMedicines.push({ ...medicine, id: medicineId });

            // Prepare purchase item
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + medicine.expiryDays);

            purchaseItems.push({
              medicineId,
              medicineName: medicine.name,
              packetQuantity: medicine.packets,
              pillsPerPacket: medicine.pillQuantity,
              pricePerPacket: medicine.pricePerPacket,
              discountAmount: 0,
              taxAmount: 0,
              expiryDate: expiryDate.toISOString().split('T')[0], // YYYY-MM-DD format
            });
          } catch (error: any) {
            console.error(`Error creating medicine ${medicine.name}:`, error);
          }
        }

        // Create purchase with all items if we have medicines
        if (purchaseItems.length > 0) {
          try {
            await this.purchaseService.createPurchase({
              supplierId,
              supplierName: 'Default Supplier',
              items: purchaseItems,
              paymentAmount: 0, // Full payment
              notes: 'Sample data - Initial stock',
            });
          } catch (error: any) {
            console.error('Error creating purchase:', error);
            // Continue even if purchase creation fails
          }
        }

        event.reply('medicine-seed-sample-reply', {
          success: true,
          data: {
            count: createdMedicines.length,
            medicines: createdMedicines,
            message: `Successfully added ${createdMedicines.length} medicines with quantities!`
          }
        });
      } catch (error) {
        console.error('Seed sample medicines error:', error);
        event.reply('medicine-seed-sample-reply', { success: false, error: String(error) });
      }
    });
  }
}

export default MedicineController;

