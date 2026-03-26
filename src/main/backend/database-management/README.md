# Database Management Module

This module provides centralized database management functionality for the pharmacy application.

## Structure

```
database-management/
├── controllers/          # IPC handlers for database operations
│   ├── database-backup.controller.ts
│   ├── database-export.controller.ts
│   ├── database-import.controller.ts
│   └── database-reset.controller.ts
├── services/            # Business logic for database operations
│   ├── backup.service.ts
│   ├── export.service.ts
│   ├── import.service.ts
│   └── reset.service.ts
├── index.ts            # Module exports and initialization
└── README.md           # This file
```

## Features

### Backup Service
- Create timestamped backups of the database
- List all available backups
- Delete specific backups
- Automatic cleanup of old backups (keeps N most recent)

### Export Service
- Download/export database to user-selected location
- Automatic WAL checkpoint before export
- Ensures data integrity during export

### Import Service
- Import database from external file
- Schema validation before import
- Automatic backup creation before import
- Rollback capability on failure
- Post-import data summary

### Reset Service
- Get counts of records in all tables
- Reset all data (delete from all tables)
- Maintains referential integrity
- Automatic vacuum after reset

## Usage

### Initialization

The module is automatically initialized in `src/main/backend/index.ts`:

```typescript
import { initializeDatabaseManagement } from './database-management';

// In Backend.initialize()
initializeDatabaseManagement();
```

### Using Services Directly

```typescript
import { 
  getDatabaseBackupService,
  getDatabaseExportService,
  getDatabaseImportService,
  getDatabaseResetService
} from './database-management';

// Create a backup
const backupService = getDatabaseBackupService();
const result = backupService.createBackup();

// Export database
const exportService = getDatabaseExportService();
await exportService.exportDatabase('/path/to/export.sqlite3');

// Import database
const importService = getDatabaseImportService();
const importResult = await importService.importDatabase('/path/to/import.sqlite3');

// Reset all data
const resetService = getDatabaseResetService();
await resetService.resetAllData();
```

## IPC Handlers

All controllers register IPC handlers that can be called from the renderer process:

### Backup Handlers
- `super-admin-get-backups` - Get list of available backups
- `super-admin-create-backup` - Create a new backup
- `super-admin-delete-backup` - Delete a specific backup
- `super-admin-cleanup-backups` - Cleanup old backups

### Export Handlers
- `super-admin-download-database` - Download/export database

### Import Handlers
- `super-admin-import-database` - Import database from file
- `super-admin-restore-backup` - Restore from a backup file

### Reset Handlers
- `get-table-counts` - Get record counts for all tables
- `system-reset-all-data` - Delete all data from database

## Benefits of This Structure

1. **Separation of Concerns** - Each service handles one specific responsibility
2. **Maintainability** - Easy to locate and update specific functionality
3. **Testability** - Services can be tested independently
4. **Reusability** - Services can be used by multiple controllers or other modules
5. **Scalability** - Easy to add new database operations
6. **Type Safety** - Full TypeScript support with proper types

## Migration Notes

This module consolidates database management functionality that was previously scattered across:
- `super-admin.controller.ts` (download, import, backup handlers)
- `super-admin.service.ts` (import, backup, restore logic)
- `database.controller.ts` (reset handlers)

All IPC handler names remain unchanged, ensuring backward compatibility with the renderer process.
