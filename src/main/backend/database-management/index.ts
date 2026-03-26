/**
 * Database Management Module
 * 
 * Centralized module for all database management operations including:
 * - Backup: Create, list, delete, and cleanup backups
 * - Export: Download/export database files
 * - Import: Import and validate database files
 * - Reset: Clear all data from tables
 */

// Controllers
export { DatabaseBackupController } from './controllers/database-backup.controller';
export { DatabaseExportController } from './controllers/database-export.controller';
export { DatabaseImportController } from './controllers/database-import.controller';
export { DatabaseResetController } from './controllers/database-reset.controller';

// Services
export { 
  DatabaseBackupService, 
  getDatabaseBackupService,
  type DatabaseBackup 
} from './services/backup.service';

export { 
  DatabaseExportService, 
  getDatabaseExportService 
} from './services/export.service';

export { 
  DatabaseImportService, 
  getDatabaseImportService,
  type ImportResult 
} from './services/import.service';

export { 
  DatabaseResetService, 
  getDatabaseResetService,
  type TableCounts 
} from './services/reset.service';

/**
 * Initialize all database management controllers
 */
export function initializeDatabaseManagement(): void {
  // Import controllers here to avoid circular dependencies
  const { DatabaseBackupController } = require('./controllers/database-backup.controller');
  const { DatabaseExportController } = require('./controllers/database-export.controller');
  const { DatabaseImportController } = require('./controllers/database-import.controller');
  const { DatabaseResetController } = require('./controllers/database-reset.controller');
  
  new DatabaseBackupController();
  new DatabaseExportController();
  new DatabaseImportController();
  new DatabaseResetController();
  
  console.log('Database management controllers initialized');
}
