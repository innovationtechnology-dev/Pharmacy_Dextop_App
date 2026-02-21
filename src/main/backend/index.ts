/**
 * Backend Module
 * 
 * This module initializes all backend services, controllers, and database connections.
 * Import this in main.ts to set up the backend infrastructure.
 */

import { getDatabaseConnection } from './database/database.connection';
import { DatabaseController } from './controllers/database.controller';
import { ExampleController } from './controllers/example.controller';
import { AuthController } from './controllers/auth.controller';
import { MedicineController } from './controllers/medicine.controller';
import { SupplierController } from './controllers/supplier.controller';
import { PurchaseController } from './controllers/purchase.controller';
import { PaymentController } from './controllers/payment.controller';
import { CustomerController } from './controllers/customer.controller';
import { SaleReturnController } from './controllers/sale-return.controller';
import { LicenseController } from './controllers/license.controller';
import { SuperAdminController } from './controllers/super-admin.controller';
import { PaymentController } from './controllers/payment.controller';
import { GRNController } from './controllers/grn.controller';

export class Backend {
  private databaseController: DatabaseController;
  private exampleController: ExampleController;
  private authController: AuthController;
  private medicineController: MedicineController;
  private supplierController: SupplierController;
  private purchaseController: PurchaseController;
  private paymentController: PaymentController;
  private customerController: CustomerController;
  private saleReturnController: SaleReturnController;
  private licenseController: LicenseController;
  private superAdminController: SuperAdminController;
  private paymentController: PaymentController;
  private grnController: GRNController;

  /**
   * Initialize backend services and controllers
   */
  public async initialize(): Promise<void> {
    try {
      // Connect to database
      const dbConnection = getDatabaseConnection();
      await dbConnection.connect();

      // Initialize controllers (they register their own IPC handlers)
      this.databaseController = new DatabaseController();
      this.exampleController = new ExampleController();
      this.authController = new AuthController();
      this.medicineController = new MedicineController();
      this.supplierController = new SupplierController();
      this.purchaseController = new PurchaseController();
      this.paymentController = new PaymentController();
      this.customerController = new CustomerController();
      this.saleReturnController = new SaleReturnController();
      this.licenseController = new LicenseController();
      this.superAdminController = new SuperAdminController();
      this.paymentController = new PaymentController();
      this.grnController = new GRNController();

      // Initialize all tables
      await this.medicineController.initializeTables();
      await this.supplierController.initializeTables();
      await this.purchaseController.initializeTables();
      await this.paymentController.initializeTables();
      await this.customerController.initializeTables();
      await this.saleReturnController.initializeTables();
      await this.paymentController.initializeTables();
      await this.grnController.initializeTables();

      // Register any additional custom handlers
      this.databaseController.registerCustomHandlers();

      console.log('Backend initialized successfully');
    } catch (error) {
      console.error('Backend initialization error: ', error);
      throw error;
    }
  }

  /**
   * Cleanup backend resources
   */
  public async cleanup(): Promise<void> {
    try {
      const dbConnection = getDatabaseConnection();
      await dbConnection.close();
      console.log('Backend cleanup completed');
    } catch (error) {
      console.error('Backend cleanup error: ', error);
    }
  }
}

// Export singleton instance
let backendInstance: Backend | null = null;

export const getBackend = (): Backend => {
  if (!backendInstance) {
    backendInstance = new Backend();
  }
  return backendInstance;
};

export default Backend;
