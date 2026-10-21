import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { DatabaseService } from './database.service';

/**
 * Database backups on the main computer: dated copies in a folder, taken automatically on a
 * schedule (while the app is running) or on demand. Copies are made with `VACUUM INTO`, which
 * writes a consistent snapshot while the database stays in use (WAL changes included).
 */

export type BackupFrequency = 'daily' | 'weekly' | 'monthly';

export interface BackupSettings {
  enabled: boolean;
  frequency: BackupFrequency;
  folder: string;
  /** Newest copies kept in the folder; older ones are deleted. 0 keeps everything. */
  keepCount: number;
  lastBackupAt: string | null;
  lastBackupFile: string | null;
  lastError: string | null;
}

export interface BackupFile {
  name: string;
  path: string;
  size: number;
  createdAt: string;
}

export interface BackupResult {
  success: boolean;
  file?: BackupFile;
  error?: string;
}

const FILE_PREFIX = 'pharmacy-backup-';
const FILE_PATTERN = /^pharmacy-backup-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.sqlite3$/;
const CHECK_INTERVAL_MS = 30 * 60 * 1000;
/** First check shortly after start, once the app has settled. */
const FIRST_CHECK_DELAY_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const settingsPath = () => path.join(app.getPath('userData'), 'backup-settings.json');

export const defaultBackupFolder = () =>
  path.join(app.getPath('documents'), 'Pharmacy Backups');

const defaults = (): BackupSettings => ({
  enabled: true,
  frequency: 'monthly',
  folder: defaultBackupFolder(),
  keepCount: 12,
  lastBackupAt: null,
  lastBackupFile: null,
  lastError: null,
});

const pad = (n: number) => String(n).padStart(2, '0');

const stampOf = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(
    d.getMinutes()
  )}-${pad(d.getSeconds())}`;

/** e.g. pharmacy-backup-2026-10-21_13-47-02.sqlite3 (used for automatic backups and exports) */
export const backupFileName = (d: Date = new Date()) => `${FILE_PREFIX}${stampOf(d)}.sqlite3`;

export class BackupService {
  private dbService = new DatabaseService();

  private running: Promise<BackupResult> | null = null;

  private timers: NodeJS.Timeout[] = [];

  public getSettings(): BackupSettings {
    try {
      const raw = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
      return { ...defaults(), ...raw };
    } catch {
      return defaults();
    }
  }

  public saveSettings(patch: Partial<BackupSettings>): BackupSettings {
    const next = { ...this.getSettings(), ...patch };
    if (!['daily', 'weekly', 'monthly'].includes(next.frequency)) next.frequency = 'monthly';
    next.keepCount = Math.max(0, Math.min(365, Math.floor(Number(next.keepCount) || 0)));
    if (!next.folder) next.folder = defaultBackupFolder();
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2));
    return next;
  }

  /** When the next automatic backup is due (null when automatic backups are off). */
  public nextDueAt(settings = this.getSettings()): Date | null {
    if (!settings.enabled) return null;
    if (!settings.lastBackupAt) return new Date();
    const last = new Date(settings.lastBackupAt);
    if (settings.frequency === 'daily') {
      return new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
    }
    if (settings.frequency === 'weekly') return new Date(last.getTime() + 7 * DAY_MS);
    return new Date(last.getFullYear(), last.getMonth() + 1, 1);
  }

  public listBackups(folder = this.getSettings().folder): BackupFile[] {
    try {
      return fs
        .readdirSync(folder)
        .filter((name) => FILE_PATTERN.test(name))
        .map((name) => {
          const filePath = path.join(folder, name);
          const stat = fs.statSync(filePath);
          return { name, path: filePath, size: stat.size, createdAt: stat.mtime.toISOString() };
        })
        .sort((a, b) => b.name.localeCompare(a.name));
    } catch {
      return [];
    }
  }

  /** Write a consistent copy of the live database to `target` (replacing it). */
  public async writeCopy(target: string): Promise<void> {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const partial = `${target}.part`;
    fs.rmSync(partial, { force: true });
    await this.dbService.execute('VACUUM INTO ?', [partial]);
    fs.rmSync(target, { force: true });
    fs.renameSync(partial, target);
  }

  /** Dated copy in the backup folder; one at a time. */
  public createBackup(): Promise<BackupResult> {
    if (!this.running) {
      this.running = this.runBackup().finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  private async runBackup(): Promise<BackupResult> {
    const settings = this.getSettings();
    const now = new Date();
    const target = path.join(settings.folder, backupFileName(now));
    try {
      await this.writeCopy(target);
      this.prune(settings);
      const stat = fs.statSync(target);
      this.saveSettings({
        lastBackupAt: now.toISOString(),
        lastBackupFile: target,
        lastError: null,
      });
      console.log(`[backup] saved ${target}`);
      return {
        success: true,
        file: {
          name: path.basename(target),
          path: target,
          size: stat.size,
          createdAt: now.toISOString(),
        },
      };
    } catch (error) {
      const message = String((error as Error)?.message ?? error);
      console.error('[backup] failed:', message);
      this.saveSettings({ lastError: message });
      return { success: false, error: message };
    }
  }

  private prune(settings: BackupSettings) {
    if (!settings.keepCount) return;
    this.listBackups(settings.folder)
      .slice(settings.keepCount)
      .forEach((old) => {
        try {
          fs.unlinkSync(old.path);
        } catch (error) {
          console.warn(`[backup] could not delete ${old.name}:`, error);
        }
      });
  }

  private async checkSchedule() {
    const settings = this.getSettings();
    const due = this.nextDueAt(settings);
    if (due && due.getTime() <= Date.now()) await this.createBackup();
  }

  /** Automatic backups: checked shortly after start, then every 30 minutes. */
  public startScheduler(): void {
    this.stopScheduler();
    const check = () => {
      this.checkSchedule().catch((e) => console.error('[backup] schedule check failed:', e));
    };
    this.timers.push(setTimeout(check, FIRST_CHECK_DELAY_MS));
    this.timers.push(setInterval(check, CHECK_INTERVAL_MS));
  }

  public stopScheduler(): void {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
  }
}
