# Backend Architecture

This folder contains the organized backend structure for the Electron main process.

## 📁 Folder Structure

```
backend/
├── config/              # Configuration files
│   └── database.config.ts    # Database configuration (paths, settings)
├── database/            # Database layer
│   └── database.connection.ts # Database connection and initialization
├── services/            # Business logic layer
│   └── database.service.ts    # Database operations (queries, transactions)
├── controllers/         # IPC handlers (like API controllers)
│   ├── database.controller.ts # Database-related IPC handlers
│   └── example.controller.ts  # Example IPC handlers
├── index.ts             # Backend initialization entry point
└── README.md            # This file
```

## 🏗️ Architecture Overview

### 1. **Config** (`config/`)
Contains configuration files for various backend services.

- `database.config.ts`: Handles database path configuration for dev/production environments

### 2. **Database** (`database/`)
Manages database connections and initialization.

- `database.connection.ts`: 
  - Singleton database connection class
  - Handles connection, table initialization, and cleanup
  - Provides database instance to services

### 3. **Services** (`services/`)
Business logic layer that performs actual operations.

- `database.service.ts`:
  - `query(sql)`: Execute SELECT queries (returns all rows)
  - `queryOne(sql)`: Execute SELECT query (returns single row)
  - `execute(sql)`: Execute INSERT/UPDATE/DELETE queries
  - `transaction(queries)`: Execute multiple queries in a transaction

### 4. **Controllers** (`controllers/`)
Handles IPC communication between renderer and main process.

- `database.controller.ts`: Registers IPC handlers for database operations
- `example.controller.ts`: Example IPC handlers (like `ipc-example`)

### 5. **Index** (`index.ts`)
Main backend module that initializes everything.

## 🚀 Usage

### Initialization

The backend is automatically initialized in `main.ts`:

```typescript
import { getBackend } from './backend';

const backend = getBackend();

app.whenReady().then(async () => {
  await backend.initialize(); // Connects DB and registers IPC handlers
  createWindow();
});
```

### Adding a New Service

1. Create a service file in `services/`:

```typescript
// services/user.service.ts
import { DatabaseService } from './database.service';

export class UserService {
  private dbService: DatabaseService;

  constructor() {
    this.dbService = new DatabaseService();
  }

  async getAllUsers() {
    return this.dbService.query('SELECT * FROM users');
  }

  async getUserById(id: number) {
    return this.dbService.queryOne(`SELECT * FROM users WHERE id = ${id}`);
  }

  async createUser(name: string, email: string) {
    const sql = `INSERT INTO users (name, email) VALUES ('${name}', '${email}')`;
    return this.dbService.execute(sql);
  }
}
```

### Adding a New Controller

1. Create a controller file in `controllers/`:

```typescript
// controllers/user.controller.ts
import { ipcMain, IpcMainEvent } from 'electron';
import { UserService } from '../services/user.service';

export class UserController {
  private userService: UserService;

  constructor() {
    this.userService = new UserService();
    this.registerHandlers();
  }

  private registerHandlers(): void {
    ipcMain.on('get-users', async (event: IpcMainEvent) => {
      try {
        const users = await this.userService.getAllUsers();
        event.reply('get-users-reply', users);
      } catch (error) {
        event.reply('get-users-reply', { error: String(error) });
      }
    });
  }
}
```

2. Register it in `backend/index.ts`:

```typescript
import { UserController } from './controllers/user.controller';

export class Backend {
  // ... existing code
  private userController: UserController;

  public async initialize(): Promise<void> {
    // ... existing code
    this.userController = new UserController();
    // ... existing code
  }
}
```

### Using from Renderer Process

In your React component:

```typescript
// Renderer process
window.electron.ipcRenderer.once('get-users-reply', (users) => {
  console.log('Users:', users);
});

window.electron.ipcRenderer.sendMessage('get-users', []);
```

## 🔧 Database Operations

### Query (SELECT)

```typescript
const service = new DatabaseService();
const users = await service.query('SELECT * FROM users');
```

### Query One (Single Row)

```typescript
const user = await service.queryOne('SELECT * FROM users WHERE id = 1');
```

### Execute (INSERT/UPDATE/DELETE)

```typescript
const result = await service.execute(
  "INSERT INTO users (name, email) VALUES ('John', 'john@example.com')"
);
console.log('Insert ID:', result.lastID);
```

### Transaction

```typescript
await service.transaction([
  "INSERT INTO users (name) VALUES ('John')",
  "INSERT INTO users (name) VALUES ('Jane')"
]);
```

## 📝 IPC Channel Naming Convention

- Request channels: `action-name` (e.g., `get-users`, `create-user`)
- Reply channels: `action-name-reply` (e.g., `get-users-reply`, `create-user-reply`)

## 🔐 Security Notes

- Always validate and sanitize SQL queries from the renderer process
- Consider using parameterized queries for better security
- Never expose sensitive database credentials in the renderer process

## 🧪 Testing

You can test database operations using the SQL demo page in the app, or create unit tests for services.

## 📚 Examples

See `controllers/example.controller.ts` for a simple IPC handler example.
