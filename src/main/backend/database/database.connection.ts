// import * as sqlite from 'sqlite3';
// import { databaseConfig } from '../config/database.config';

// const sqlite3 = sqlite.verbose();

// export class DatabaseConnection {
//   private db: sqlite.Database | null = null;

//   private readonly dbPath: string;

//   constructor() {
//     this.dbPath = databaseConfig.getPath();
//   }

//   /**
//    * Initialize and connect to the database
//    */
//   public connect(): Promise<void> {
//     return new Promise((resolve, reject) => {
//       this.db = new sqlite3.Database(this.dbPath, (err) => {
//         if (err) {
//           console.error('Database opening error: ', err);
//           reject(err);
//           return;
//         }
//         console.log(`Connected to database at: ${this.dbPath}`);
//         this.initializeTables();
//         resolve();
//       });
//     });
//   }

//   /**
//    * Initialize database tables
//    */
//   private initializeTables(): void {
//     if (!this.db) return;

//     this.db.serialize(() => {
//       // Create your tables here
//       this.db?.run(
//         'CREATE TABLE IF NOT EXISTS myCoolTable (info TEXT NULL)',
//         (err) => {
//           if (err) {
//             console.error('Table creation error: ', err);
//           } else {
//             console.log('Database tables initialized');
//           }
//         }
//       );
//     });
//   }

//   /**
//    * Get the database instance
//    */
//   public getDatabase(): sqlite.Database {
//     if (!this.db) {
//       throw new Error('Database not connected. Call connect() first.');
//     }
//     return this.db;
//   }

//   /**
//    * Close the database connection
//    */
//   public close(): Promise<void> {
//     return new Promise((resolve, reject) => {
//       if (!this.db) {
//         resolve();
//         return;
//       }

//       this.db.close((err) => {
//         if (err) {
//           console.error('Database closing error: ', err);
//           reject(err);
//           return;
//         }
//         console.log('Database connection closed');
//         this.db = null;
//         resolve();
//       });
//     });
//   }

//   /**
//    * Get database path information
//    */
//   public getPathsInfo(): [string, string, string, boolean] {
//     return [
//       this.dbPath,
//       databaseConfig.getDevPath(),
//       databaseConfig.getProdPath(),
//       databaseConfig.isDebug,
//     ];
//   }
// }

// // Singleton instance
// let dbConnection: DatabaseConnection | null = null;

// export const getDatabaseConnection = (): DatabaseConnection => {
//   if (!dbConnection) {
//     dbConnection = new DatabaseConnection();
//   }
//   return dbConnection;
// };

// export default DatabaseConnection;

import * as sqlite from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { databaseConfig } from '../config/database.config';

const sqlite3 = sqlite.verbose();

export class DatabaseConnection {
  private db: sqlite.Database | null = null;

  private readonly dbPath: string;

  constructor() {
    this.dbPath = databaseConfig.getPath();

    // ✅ Ensure directory exists before using SQLite
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Initialize and connect to the database
   */
  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('Database opening error: ', err);
          reject(err);
          return;
        }
        console.log(`Connected to database at: ${this.dbPath}`);
        
        // Configure SQLite for better concurrency - must be done serially
        this.db?.serialize(() => {
          this.db?.run('PRAGMA journal_mode = WAL;', (walErr) => {
            if (walErr) console.error('WAL mode error:', walErr);
          });
          this.db?.run('PRAGMA busy_timeout = 5000;', (timeoutErr) => {
            if (timeoutErr) console.error('Busy timeout error:', timeoutErr);
          });
          this.db?.run('PRAGMA synchronous = NORMAL;', (syncErr) => {
            if (syncErr) console.error('Synchronous mode error:', syncErr);
          });
          
          this.initializeTables();
          resolve();
        });
      });
    });
  }

  /**
   * Initialize database tables
   */
  private initializeTables(): void {
    if (!this.db) return;

    this.db.serialize(() => {
      this.db?.run(
        'CREATE TABLE IF NOT EXISTS myCoolTable (info TEXT NULL)',
        (err) => {
          if (err) {
            console.error('Table creation error: ', err);
          } else {
            console.log('Database tables initialized');
          }
        }
      );
    });
  }

  /**
   * Get the database instance
   */
  public getDatabase(): sqlite.Database {
    if (!this.db) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.db;
  }

  /**
   * Close the database connection
   */
  public close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve();
        return;
      }

      this.db.close((err) => {
        if (err) {
          console.error('Database closing error: ', err);
          reject(err);
          return;
        }
        console.log('Database connection closed');
        this.db = null;
        resolve();
      });
    });
  }

  /**
   * Get database path information
   */
  public getPathsInfo(): [string, string, string, boolean] {
    return [
      this.dbPath,
      databaseConfig.getDevPath(),
      databaseConfig.getProdPath(),
      databaseConfig.isDebug,
    ];
  }
}

// Singleton instance
let dbConnection: DatabaseConnection | null = null;

export const getDatabaseConnection = (): DatabaseConnection => {
  if (!dbConnection) {
    dbConnection = new DatabaseConnection();
  }
  return dbConnection;
};

export default DatabaseConnection;
