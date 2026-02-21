import { ipcMain, IpcMainEvent } from 'electron';
import { SupplierService, Supplier } from '../services/supplier.service';

export class SupplierController {
  private supplierService: SupplierService;

  constructor() {
    this.supplierService = new SupplierService();
    this.registerHandlers();
  }

  /**
   * Initialize tables
   */
  public async initializeTables(): Promise<void> {
    await this.supplierService.initializeTable();
  }

  /**
   * Register all IPC handlers for supplier operations
   */
  private registerHandlers(): void {
    // Get all suppliers
    ipcMain.on('supplier-get-all', async (event: IpcMainEvent) => {
      try {
        const suppliers = await this.supplierService.getAllSuppliers();
        event.reply('supplier-get-all-reply', { success: true, data: suppliers });
      } catch (error) {
        console.error('Get all suppliers error:', error);
        event.reply('supplier-get-all-reply', { success: false, error: String(error) });
      }
    });

    // Get supplier by ID
    ipcMain.on('supplier-get-by-id', async (event: IpcMainEvent, args: any[]) => {
      try {
        const id = args[0] as number;
        const supplier = await this.supplierService.getSupplierById(id);
        event.reply('supplier-get-by-id-reply', { success: true, data: supplier });
      } catch (error) {
        console.error('Get supplier by ID error:', error);
        event.reply('supplier-get-by-id-reply', { success: false, error: String(error) });
      }
    });

    // Create supplier
    ipcMain.on('supplier-create', async (event: IpcMainEvent, args: any[]) => {
      try {
        const supplier = args[0] as Supplier;
        const id = await this.supplierService.createSupplier(supplier);
        event.reply('supplier-create-reply', { success: true, data: { id } });
      } catch (error) {
        console.error('Create supplier error:', error);
        event.reply('supplier-create-reply', { success: false, error: String(error) });
      }
    });

    // Update supplier
    ipcMain.on('supplier-update', async (event: IpcMainEvent, args: any[]) => {
      try {
        const id = args[0] as number;
        const supplier = args[1] as Partial<Supplier>;
        await this.supplierService.updateSupplier(id, supplier);
        event.reply('supplier-update-reply', { success: true });
      } catch (error) {
        console.error('Update supplier error:', error);
        event.reply('supplier-update-reply', { success: false, error: String(error) });
      }
    });

    // Delete supplier
    ipcMain.on('supplier-delete', async (event: IpcMainEvent, args: any[]) => {
      try {
        const id = args[0] as number;
        await this.supplierService.deleteSupplier(id);
        event.reply('supplier-delete-reply', { success: true });
      } catch (error) {
        console.error('Delete supplier error:', error);
        event.reply('supplier-delete-reply', { success: false, error: String(error) });
      }
    });
  }
}

export default SupplierController;

