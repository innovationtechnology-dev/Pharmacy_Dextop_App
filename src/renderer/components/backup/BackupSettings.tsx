import React, { useCallback, useEffect, useState } from 'react';
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiClock,
  FiDatabase,
  FiDownload,
  FiFolder,
  FiRefreshCw,
} from 'react-icons/fi';
import type {
  BackupFile,
  BackupFrequency,
  BackupSettings as Settings,
} from 'main/backend/services/backup.service';

interface BackupInfo {
  settings: Settings;
  defaultFolder: string;
  nextDueAt: string | null;
  backups: BackupFile[];
}

type Notice = { tone: 'success' | 'error'; text: string } | null;

const FREQUENCIES: { id: BackupFrequency; label: string; hint: string }[] = [
  { id: 'daily', label: 'Daily', hint: 'Once a day' },
  { id: 'weekly', label: 'Weekly', hint: 'Every 7 days' },
  { id: 'monthly', label: 'Monthly', hint: 'Once a month' },
];

const KEEP_OPTIONS = [5, 12, 30, 90, 0];

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const errorText = (error: unknown) => String((error as Error)?.message ?? error);

/** Settings → Backup: automatic dated database copies and manual export (admin only). */
const BackupSettings: React.FC = () => {
  const [info, setInfo] = useState<BackupInfo | null>(null);
  const [busy, setBusy] = useState<'export' | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const isMainComputer = window.electron.network?.mode !== 'client';

  const load = useCallback(async () => {
    try {
      setInfo((await window.electron.ipcRenderer.invoke('backup-get-info')) as BackupInfo);
    } catch (error) {
      setNotice({ tone: 'error', text: errorText(error) });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (patch: Partial<Settings>) => {
    try {
      setInfo(
        (await window.electron.ipcRenderer.invoke('backup-save-settings', patch)) as BackupInfo
      );
    } catch (error) {
      setNotice({ tone: 'error', text: errorText(error) });
    }
  };

  const exportCopy = async () => {
    setBusy('export');
    setNotice(null);
    try {
      const res = (await window.electron.ipcRenderer.invoke('backup-export-copy')) as {
        success: boolean;
        cancelled?: boolean;
        path?: string;
        error?: string;
      };
      if (res.success) setNotice({ tone: 'success', text: `Full backup of all data saved to ${res.path}` });
      else if (!res.cancelled) setNotice({ tone: 'error', text: `Export failed: ${res.error}` });
    } catch (error) {
      setNotice({ tone: 'error', text: errorText(error) });
    } finally {
      setBusy(null);
    }
  };

  const chooseFolder = async () => {
    try {
      setInfo((await window.electron.ipcRenderer.invoke('backup-choose-folder')) as BackupInfo);
    } catch (error) {
      setNotice({ tone: 'error', text: errorText(error) });
    }
  };

  const openFolder = async () => {
    try {
      await window.electron.ipcRenderer.invoke('backup-open-folder');
    } catch (error) {
      setNotice({ tone: 'error', text: errorText(error) });
    }
  };

  if (!info) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-gray-500">
        <FiRefreshCw className="w-4 h-4 mr-2 animate-spin" />
        Loading backup settings…
      </div>
    );
  }

  const { settings } = info;
  const card =
    'bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm';
  const secondaryBtn =
    'inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div className="space-y-4 animate-fadeIn">
      {notice && (
        <div
          className={`flex items-start gap-2 px-4 py-3 rounded-lg border text-sm ${
            notice.tone === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300'
              : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300'
          }`}
        >
          {notice.tone === 'success' ? (
            <FiCheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          ) : (
            <FiAlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          )}
          <span className="break-all">{notice.text}</span>
        </div>
      )}

      {/* Status */}
      <div className={`${card} p-5 flex flex-wrap items-center gap-5`}>
        <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
          <FiDatabase className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {settings.lastBackupAt
              ? `Last backup ${formatDateTime(settings.lastBackupAt)}`
              : 'No backup yet'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {settings.enabled && info.nextDueAt
              ? `Next automatic backup: ${
                  new Date(info.nextDueAt).getTime() <= Date.now()
                    ? 'within the next 30 minutes'
                    : formatDateTime(info.nextDueAt)
                }`
              : 'Automatic backups are off'}
          </p>
        </div>
        {settings.lastError && (
          <p className="w-full flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
            <FiAlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            Last automatic backup failed: {settings.lastError}
          </p>
        )}
      </div>

      {/* Manual full export */}
      <div className={`${card} px-5 py-4 flex flex-wrap items-center gap-4`}>
        <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
          <FiDownload className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Export full backup</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Saves all data up to now (medicines, stock, sales, purchases, payments, customers, suppliers
            and users) as one SQLite database file (.sqlite3), wherever you choose, such as a USB drive.
          </p>
        </div>
        <button
          type="button"
          onClick={exportCopy}
          disabled={!isMainComputer || busy !== null}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          title={isMainComputer ? undefined : 'Only on the main computer'}
        >
          {busy === 'export' ? (
            <FiRefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <FiDownload className="w-3.5 h-3.5" />
          )}
          {busy === 'export' ? 'Exporting…' : 'Export full backup…'}
        </button>
        {!isMainComputer && (
          <p className="w-full text-[11px] text-gray-500 dark:text-gray-400">
            Export the full backup from the main computer.
          </p>
        )}
      </div>

      {/* Schedule */}
      <div className={card}>
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Automatic backups</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              A dated copy of the database is saved to the folder below while the app runs on the
              main computer.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.enabled}
            onClick={() => save({ enabled: !settings.enabled })}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors ${
              settings.enabled ? 'bg-emerald-600' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                settings.enabled ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </div>

        <div className={`px-5 py-4 space-y-5 ${settings.enabled ? '' : 'opacity-50 pointer-events-none'}`}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
              How often
            </p>
            <div className="grid grid-cols-3 gap-3">
              {FREQUENCIES.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => save({ frequency: f.id })}
                  className={`flex flex-col items-start p-3 rounded-xl border-2 text-left transition-all ${
                    settings.frequency === f.id
                      ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-900/20'
                      : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                  }`}
                >
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{f.label}</span>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">{f.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Copies to keep</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Older backups in the folder are deleted automatically.
              </p>
            </div>
            <select
              value={settings.keepCount}
              onChange={(e) => save({ keepCount: Number(e.target.value) })}
              className="h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-800 dark:text-gray-100 outline-none focus:ring-2 focus:ring-emerald-500/30"
            >
              {KEEP_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? 'Keep all' : `Last ${n}`}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Folder */}
      <div className={`${card} px-5 py-4`}>
        <div className="flex flex-wrap items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
            <FiFolder className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-[220px]">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Backup folder</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-mono break-all mt-0.5">
              {settings.folder}
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={openFolder} disabled={!isMainComputer} className={secondaryBtn}>
              Open
            </button>
            <button type="button" onClick={chooseFolder} disabled={!isMainComputer} className={secondaryBtn}>
              Change…
            </button>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-gray-500 dark:text-gray-400">
          {isMainComputer
            ? 'Tip: choose a folder on another drive, a USB drive or a synced cloud folder (OneDrive, Google Drive) so a backup survives if this computer fails.'
            : 'Backups are saved on the main computer. Change the folder or open it from the main computer.'}
        </p>
      </div>

      {/* Recent backups */}
      <div className={card}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Recent backups</h3>
          <button
            type="button"
            onClick={load}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
            title="Refresh list"
          >
            <FiRefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
        {info.backups.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No backups in this folder yet. The first one is made on the next automatic backup.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {info.backups.map((b) => (
              <li key={b.name} className="flex items-center gap-3 px-5 py-2.5">
                <FiClock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-gray-900 dark:text-white">
                    {formatDateTime(b.createdAt)}
                  </span>
                  <span className="block text-[11px] text-gray-500 dark:text-gray-400 font-mono truncate">
                    {b.name}
                  </span>
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                  {formatSize(b.size)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default BackupSettings;
