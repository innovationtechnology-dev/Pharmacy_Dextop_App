import sqlite3 from 'sqlite3';
import { getDatabaseConnection } from '../database/database.connection';

export class DatabaseService {
  private connection: any;

  constructor() {
    this.connection = getDatabaseConnection();
  }

  private get db(): sqlite3.Database {
    return this.connection.getDatabase();
  }

  /**
   * Execute a SELECT query and return all results
   */
  public async query(sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          console.error('Database query error: ', err);
          reject(err);
          return;
        }
        resolve(rows);
      });
    });
  }

  /**
   * Execute a single row query (returns first result)
   */
  public async queryOne(sql: string, params: any[] = []): Promise<any | null> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          console.error('Database query error: ', err);
          reject(err);
          return;
        }
        resolve(row || null);
      });
    });
  }

  /**
   * Execute an INSERT, UPDATE, or DELETE query
   */
  public async execute(sql: string, params: any[] = []): Promise<sqlite3.RunResult> {
    return new Promise((resolve, reject) => {
      // Serialize to prevent concurrent writes
      this.db.serialize(() => {
        this.db.run(sql, params, function (err) {
          if (err) {
            console.error('Database execute error: ', err);
            console.error('SQL:', sql);
            console.error('Params:', params);
            reject(err);
            return;
          }
          resolve(this);
        });
      });
    });
  }

  /**
   * Execute a transaction with multiple queries
   */
  public async transaction(queries: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');

        let completed = 0;
        let hasError = false;

        queries.forEach((sql) => {
          this.db.run(sql, (err) => {
            if (err && !hasError) {
              hasError = true;
              this.db.run('ROLLBACK', () => {
                reject(err);
              });
              return;
            }

            completed++;
            if (completed === queries.length && !hasError) {
              this.db.run('COMMIT', (commitErr) => {
                if (commitErr) {
                  reject(commitErr);
                  return;
                }
                resolve();
              });
            }
          });
        });
      });
    });
  }
}

// Singleton instance to prevent multiple DatabaseService instances
let databaseServiceInstance: DatabaseService | null = null;

export const getDatabaseService = (): DatabaseService => {
  if (!databaseServiceInstance) {
    databaseServiceInstance = new DatabaseService();
  }
  return databaseServiceInstance;
};

export default DatabaseService;
