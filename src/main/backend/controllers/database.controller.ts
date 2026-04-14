import { ipcMain, IpcMainEvent } from 'electron';
import { getDatabaseService } from '../services/database.service';
import { getDatabaseConnection } from '../database/database.connection';

export class DatabaseController {
  private databaseService = getDatabaseService();

  constructor() {
    this.registerHandlers();
  }

  /**
   * Register all IPC handlers for database operations
   */
  private registerHandlers(): void {
    // Handle SQL commands from renderer process
    ipcMain.on('asynchronous-sql-command', async (event: IpcMainEvent, sql: string) => {
      try {
        const result = await this.databaseService.query(sql);
        event.reply('asynchronous-sql-reply', result);
      } catch (error) {
        console.error('Database command error: ', error);
        event.reply('asynchronous-sql-reply', { error: String(error) });
      }
    });

    // Handle database path information requests
    ipcMain.on('ipc-show-userDataPaths', async (event: IpcMainEvent) => {
      try {
        const connection = getDatabaseConnection();
        const pathsInfo = connection.getPathsInfo();
        event.reply('ipc-show-userDataPaths', pathsInfo);
      } catch (error) {
        console.error('Error getting database paths: ', error);
        event.reply('ipc-show-userDataPaths', []);
      }
    });
  }

  /**
   * Clean up legacy/demo tables that are no longer needed
   */
  private async cleanupLegacyTables(): Promise<void> {
    try {
      // Drop myCoolTable if it exists (legacy demo table)
      await this.databaseService.execute('DROP TABLE IF EXISTS myCoolTable');
      console.log('Legacy tables cleaned up successfully');
    } catch (error) {
      console.error('Error cleaning up legacy tables:', error);
      // Don't throw - this is non-critical cleanup
    }
  }


  /**
   * Register additional IPC handlers for specific operations
   * Example: Add handlers for specific database operations
   */
  public registerCustomHandlers(): void {
    // Clean up legacy demo table
    this.cleanupLegacyTables();

    // Get table counts for reset confirmation
    ipcMain.on('get-table-counts', async (event: IpcMainEvent) => {
      try {
        const counts = {
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
            const result = await this.databaseService.queryOne(`SELECT COUNT(*) as count FROM ${tableName}`);
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

        event.reply('get-table-counts-reply', { success: true, data: counts });
      } catch (error) {
        console.error('Get table counts error:', error);
        event.reply('get-table-counts-reply', { success: false, error: String(error) });
      }
    });

    // Reset entire system - delete all data or selective data
    ipcMain.on('system-reset-all-data', async (event: IpcMainEvent, args: any[]) => {
      try {
        // Get list of tables to delete (or use all if not specified)
        const tablesToDelete = args[0] as string[] | undefined;
        const deleteAll = !tablesToDelete || tablesToDelete.length === 0;
        
        console.log(`Starting system reset... Delete all: ${deleteAll}, Tables:`, tablesToDelete);
        
        // Helper function to safely delete from table
        const safeDelete = async (tableName: string) => {
          try {
            await this.databaseService.execute(`DELETE FROM ${tableName}`);
            console.log(`Deleted data from ${tableName}`);
          } catch (error: any) {
            // Ignore "no such table" errors, log others
            if (!error.message?.includes('no such table')) {
              console.error(`Error deleting from ${tableName}:`, error);
            }
          }
        };
        
        // Map selected tables to actual table names and dependencies
        const tableMap: Record<string, string[]> = {
          saleReturns: ['sale_return_items', 'sale_returns'],
          sales: ['sale_items', 'sales'],
          purchases: ['purchase_payments', 'purchase_items', 'purchases', 'grn_items', 'goods_received_notes'],
          medicines: ['medicines'],
          customers: ['customers'],
          suppliers: ['suppliers'],
        };
        
        // Collect tables to delete respecting foreign key order
        const tablesToDeleteSet = new Set<string>();
        
        if (deleteAll || tablesToDelete?.includes('saleReturns')) {
          tableMap.saleReturns.forEach(t => tablesToDeleteSet.add(t));
        }
        if (deleteAll || tablesToDelete?.includes('sales')) {
          tableMap.sales.forEach(t => tablesToDeleteSet.add(t));
        }
        if (deleteAll || tablesToDelete?.includes('purchases')) {
          tableMap.purchases.forEach(t => tablesToDeleteSet.add(t));
        }
        if (deleteAll || tablesToDelete?.includes('medicines')) {
          tableMap.medicines.forEach(t => tablesToDeleteSet.add(t));
        }
        if (deleteAll || tablesToDelete?.includes('customers')) {
          tableMap.customers.forEach(t => tablesToDeleteSet.add(t));
        }
        if (deleteAll || tablesToDelete?.includes('suppliers')) {
          tableMap.suppliers.forEach(t => tablesToDeleteSet.add(t));
        }
        
        // Delete in correct order to respect foreign keys
        const deleteOrder = [
          'sale_return_items',
          'sale_returns',
          'sale_items',
          'sales',
          'purchase_payments',
          'purchase_items',
          'purchases',
          'grn_items',
          'goods_received_notes',
          'medicines',
          'customers',
          'suppliers',
        ];
        
        for (const tableName of deleteOrder) {
          if (tablesToDeleteSet.has(tableName)) {
            await safeDelete(tableName);
          }
        }
        
        // Reset auto-increment counters if we deleted everything
        if (tablesToDeleteSet.size > 0) {
          try {
            await safeDelete('sqlite_sequence');
          } catch (e) {
            // Ignore errors for sqlite_sequence
          }
        }
        
        // Force WAL checkpoint to ensure changes are written to main database file
        await this.databaseService.execute('PRAGMA wal_checkpoint(TRUNCATE)');
        console.log('WAL checkpoint completed');
        
        // Vacuum to reclaim space and ensure database is clean
        await this.databaseService.execute('VACUUM');
        console.log('Database vacuum completed');
        
        console.log('System reset completed successfully');
        event.reply('system-reset-all-data-reply', { success: true, message: `${tablesToDeleteSet.size} table(s) have been deleted successfully` });
      } catch (error) {
        console.error('System reset error:', error);
        event.reply('system-reset-all-data-reply', { success: false, error: String(error) });
      }
    });
  }
}

export default DatabaseController;
