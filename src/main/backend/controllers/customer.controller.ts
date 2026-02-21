import { ipcMain, IpcMainEvent } from 'electron';
import { CustomerService, Customer } from '../services/customer.service';

export class CustomerController {
  private customerService: CustomerService;

  constructor() {
    this.customerService = new CustomerService();
    this.registerHandlers();
  }

  /**
   * Initialize tables
   */
  public async initializeTables(): Promise<void> {
    await this.customerService.initializeTable();
  }

  /**
   * Register all IPC handlers for customer operations
   */
  private registerHandlers(): void {
    // Get all customers
    ipcMain.on('customer-get-all', async (event: IpcMainEvent) => {
      try {
        const customers = await this.customerService.getAllCustomers();
        event.reply('customer-get-all-reply', { success: true, data: customers });
      } catch (error) {
        console.error('Get all customers error:', error);
        event.reply('customer-get-all-reply', { success: false, error: String(error) });
      }
    });

    // Get customer by ID
    ipcMain.on('customer-get-by-id', async (event: IpcMainEvent, args: any[]) => {
      try {
        const id = args[0] as number;
        const customer = await this.customerService.getCustomerById(id);
        event.reply('customer-get-by-id-reply', { success: true, data: customer });
      } catch (error) {
        console.error('Get customer by ID error:', error);
        event.reply('customer-get-by-id-reply', { success: false, error: String(error) });
      }
    });

    // Create customer
    ipcMain.on('customer-create', async (event: IpcMainEvent, args: any[]) => {
      try {
        const customer = args[0] as Customer;
        const id = await this.customerService.createCustomer(customer);
        event.reply('customer-create-reply', { success: true, data: { id } });
      } catch (error) {
        console.error('Create customer error:', error);
        event.reply('customer-create-reply', { success: false, error: String(error) });
      }
    });

    // Update customer
    ipcMain.on('customer-update', async (event: IpcMainEvent, args: any[]) => {
      try {
        const id = args[0] as number;
        const customer = args[1] as Partial<Customer>;
        await this.customerService.updateCustomer(id, customer);
        event.reply('customer-update-reply', { success: true });
      } catch (error) {
        console.error('Update customer error:', error);
        event.reply('customer-update-reply', { success: false, error: String(error) });
      }
    });

    // Delete customer
    ipcMain.on('customer-delete', async (event: IpcMainEvent, args: any[]) => {
      try {
        const id = args[0] as number;
        await this.customerService.deleteCustomer(id);
        event.reply('customer-delete-reply', { success: true });
      } catch (error) {
        console.error('Delete customer error:', error);
        event.reply('customer-delete-reply', { success: false, error: String(error) });
      }
    });
  }
}

export default CustomerController;




