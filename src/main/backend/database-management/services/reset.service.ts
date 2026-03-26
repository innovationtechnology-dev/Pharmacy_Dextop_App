import { getDatabaseService } from '../../services/database.service';

export interface TableCounts {
  sales: number;
  purchases: number;
  medicines: number;
  customers: number;
  suppliers: number;
  saleReturns: number;
  grns: number;
}

export class DatabaseResetService {
  private dbService = getDatabaseService();

  /**
   * Get counts of records in all major tables
   */
  public async getTableCounts(): Promise<{ success: boolean; data?: TableCounts; error?: string }> {
    try {
      const counts: TableCounts = {
        sales: 0,
        purchases: 0,
        medicines: 0,
        customers: 0,
        suppliers: 0,
        saleReturns: 0,
        grns: 0,
      };

      // Helper to safely get count
      const getCount = async (tableName: string): Promise<number> => {
        try {
          const result = await this.dbService.queryOne(`SELECT COUNT(*) as count FROM ${tableName}`);
          return result?.count || 0;
        } catch (error: any) {
          if (!error.message?.includes('no such table')) {
            console.error(`Error counting ${tableName}:`, error);
          }
          return 0;
        }
      };

      counts.sales = await getCount('sales');
      counts.purchases = await getCount('purchases');
      counts.medicines = await getCount('medicines');
      counts.customers = await getCount('customers');
      counts.suppliers = await getCount('suppliers');
      counts.saleReturns = await getCount('sale_returns');
      counts.grns = await getCount('goods_received_notes');

      return { success: true, data: counts };
    } catch (error: any) {
      console.error('Get table counts error:', error);
      return { success: false, error: error.message || 'Failed to get table counts' };
    }
  }

  /**
   * Reset entire system - delete all data from all tables
   */
  public async resetAllData(): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      console.log('Starting system reset...');
      
      // Helper function to safely delete from table
      const safeDelete = async (tableName: string) => {
        try {
          await this.dbService.execute(`DELETE FROM ${tableName}`);
          console.log(`Deleted data from ${tableName}`);
        } catch (error: any) {
          // Ignore "no such table" errors, log others
          if (!error.message?.includes('no such table')) {
            console.error(`Error deleting from ${tableName}:`, error);
          }
        }
      };
      
      // Delete all data from tables (in correct order to respect foreign keys)
      await safeDelete('sale_return_items');
      await safeDelete('sale_returns');
      await safeDelete('sale_items');
      await safeDelete('sales');
      await safeDelete('purchase_payments');
      await safeDelete('purchase_items');
      await safeDelete('purchases');
      await safeDelete('grn_items');
      await safeDelete('goods_received_notes');
      await safeDelete('medicines');
      await safeDelete('customers');
      await safeDelete('suppliers');
      
      // Reset auto-increment counters
      await safeDelete('sqlite_sequence');
      
      // Force WAL checkpoint to ensure changes are written to main database file
      await this.dbService.execute('PRAGMA wal_checkpoint(TRUNCATE)');
      console.log('WAL checkpoint completed');
      
      // Vacuum to reclaim space and ensure database is clean
      await this.dbService.execute('VACUUM');
      console.log('Database vacuum completed');
      
      console.log('System reset completed successfully');
      return { success: true, message: 'All data has been deleted successfully' };
    } catch (error: any) {
      console.error('System reset error:', error);
      return { success: false, error: error.message || 'Failed to reset system data' };
    }
  }
}

let resetServiceInstance: DatabaseResetService | null = null;

export const getDatabaseResetService = (): DatabaseResetService => {
  if (!resetServiceInstance) {
    resetServiceInstance = new DatabaseResetService();
  }
  return resetServiceInstance;
};
