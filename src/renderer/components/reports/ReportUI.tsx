import React from 'react';
import {
  FiAlertCircle,
  FiCalendar,
  FiCheck,
  FiChevronLeft,
  FiChevronRight,
  FiDownload,
  FiFileText,
  FiGrid,
  FiInbox,
  FiRefreshCw,
  FiSearch,
  FiX,
} from 'react-icons/fi';

/**
 * Shared building blocks for the report screens (Sales Report, Sale Return, Purchase Report)
 * so they look and behave the same.
 */

export type Tone = 'emerald' | 'blue' | 'violet' | 'amber' | 'rose' | 'orange' | 'slate';

const TONES: Record<Tone, { tile: string; value: string }> = {
  emerald: {
    tile: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    value: 'text-emerald-700 dark:text-emerald-400',
  },
  blue: {
    tile: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    value: 'text-gray-900 dark:text-white',
  },
  violet: {
    tile: 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400',
    value: 'text-gray-900 dark:text-white',
  },
  amber: {
    tile: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    value: 'text-gray-900 dark:text-white',
  },
  rose: {
    tile: 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400',
    value: 'text-rose-600 dark:text-rose-400',
  },
  orange: {
    tile: 'bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
    value: 'text-gray-900 dark:text-white',
  },
  slate: {
    tile: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    value: 'text-gray-900 dark:text-white',
  },
};

export const formatMoney = (symbol: string, value: number) =>
  `${symbol}${(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;

export const formatDisplayDate = (value: string | Date) =>
  new Date(value).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

export const formatDisplayTime = (value: string | Date) =>
  new Date(value).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });

/* ------------------------------------------------------------------ KPI */

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: Tone;
  /** The headline number of the screen: larger and tinted. */
  primary?: boolean;
  title?: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  icon,
  label,
  value,
  hint,
  tone = 'slate',
  primary = false,
  title,
}) => (
  <div
    title={title}
    className={`relative min-w-0 rounded-xl border px-4 py-3 shadow-sm transition-shadow hover:shadow-md ${
      primary
        ? 'bg-gradient-to-br from-emerald-50 to-white border-emerald-200 dark:from-emerald-900/20 dark:to-gray-800 dark:border-emerald-800/60'
        : 'bg-white border-gray-200 dark:bg-gray-800 dark:border-gray-700'
    }`}
  >
    <div className="flex items-center gap-3">
      <div
        className={`w-9 h-9 flex-shrink-0 rounded-lg flex items-center justify-center ${TONES[tone].tile}`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 truncate">
          {label}
        </p>
        <p
          className={`font-bold tabular-nums truncate ${
            primary ? 'text-xl' : 'text-lg'
          } ${TONES[tone].value}`}
        >
          {value}
        </p>
      </div>
    </div>
    {hint && (
      <p className="mt-1.5 text-[11px] leading-snug text-gray-500 dark:text-gray-400 truncate">
        {hint}
      </p>
    )}
  </div>
);

export const KpiGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">{children}</div>
);

/* --------------------------------------------------------------- Period */

type Preset = 'today' | 'week' | 'month' | 'year';

const presetRange = (preset: Preset): [string, string] => {
  const now = new Date();
  const today = toISODate(now);
  if (preset === 'today') return [today, today];
  if (preset === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    return [toISODate(start), today];
  }
  if (preset === 'month') {
    return [toISODate(new Date(now.getFullYear(), now.getMonth(), 1)), today];
  }
  return [`${now.getFullYear()}-01-01`, today];
};

const PRESET_LABELS: Record<Preset, string> = {
  today: 'Today',
  week: '7 Days',
  month: 'This Month',
  year: 'This Year',
};

interface PeriodFilterProps {
  fromDate: string;
  toDate: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  /** Called with the chosen range; the screen sets its dates and loads. */
  onPreset: (from: string, to: string) => void;
  onApply: () => void;
  loading?: boolean;
  minFromDate?: string;
  /** Presets hidden for this user (e.g. cashiers cannot see a full year). */
  hiddenPresets?: Preset[];
}

export const PeriodFilter: React.FC<PeriodFilterProps> = ({
  fromDate,
  toDate,
  onFromChange,
  onToChange,
  onPreset,
  onApply,
  loading = false,
  minFromDate,
  hiddenPresets = [],
}) => {
  const today = toISODate(new Date());
  const presets = (Object.keys(PRESET_LABELS) as Preset[]).filter(
    (p) => !hiddenPresets.includes(p)
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center p-1 rounded-lg bg-gray-100 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700">
        {presets.map((preset) => {
          const [from, to] = presetRange(preset);
          const active = fromDate === from && toDate === to;
          return (
            <button
              key={preset}
              type="button"
              onClick={() => onPreset(from, to)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                active
                  ? 'bg-white dark:bg-gray-700 text-emerald-700 dark:text-emerald-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {PRESET_LABELS[preset]}
            </button>
          );
        })}
      </div>

      <div className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus-within:ring-2 focus-within:ring-emerald-500/30 focus-within:border-emerald-500">
        <FiCalendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <input
          type="date"
          aria-label="From date"
          value={fromDate}
          min={minFromDate}
          max={toDate || today}
          onChange={(e) => onFromChange(e.target.value)}
          className="bg-transparent text-xs font-medium text-gray-800 dark:text-gray-100 outline-none"
        />
        <span className="text-gray-300 dark:text-gray-600">→</span>
        <input
          type="date"
          aria-label="To date"
          value={toDate}
          min={fromDate}
          max={today}
          onChange={(e) => onToChange(e.target.value)}
          className="bg-transparent text-xs font-medium text-gray-800 dark:text-gray-100 outline-none"
        />
      </div>

      <button
        type="button"
        onClick={onApply}
        disabled={loading}
        className="h-9 px-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-60"
      >
        {loading ? (
          <FiRefreshCw className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <FiCheck className="w-3.5 h-3.5" />
        )}
        Apply
      </button>
    </div>
  );
};

/* -------------------------------------------------------------- Toolbar */

interface SearchInputProps {
  value: string;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  onClear?: () => void;
  placeholder?: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  onClear,
  placeholder = 'Search…',
}) => (
  <div className="relative flex-1 min-w-[200px] max-w-md">
    <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
    <input
      type="text"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className="w-full h-9 pl-9 pr-8 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-800 dark:text-gray-100 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
    />
    {value && onClear && (
      <button
        type="button"
        onClick={onClear}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        title="Clear search"
      >
        <FiX className="w-3.5 h-3.5" />
      </button>
    )}
  </div>
);

interface ToolbarButtonProps {
  onClick: () => void;
  icon: React.ReactNode;
  label?: string;
  title?: string;
  variant?: 'default' | 'primary' | 'accent';
  disabled?: boolean;
}

export const ToolbarButton: React.FC<ToolbarButtonProps> = ({
  onClick,
  icon,
  label,
  title,
  variant = 'default',
  disabled,
}) => {
  const styles = {
    default:
      'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700',
    primary:
      'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700 hover:border-emerald-700',
    accent:
      'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40',
  }[variant];
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? label}
      disabled={disabled}
      className={`h-9 inline-flex items-center gap-2 rounded-lg border text-xs font-semibold shadow-sm transition-colors disabled:opacity-60 ${
        label ? 'px-3.5' : 'w-9 justify-center'
      } ${styles}`}
    >
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
};

/* ---------------------------------------------------------------- Table */

export const ReportCard: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <div
    className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm ${className}`}
  >
    {children}
  </div>
);

interface TableStatusProps {
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyTitle: string;
  emptyHint?: string;
  loadingText?: string;
}

/** Loading / error / empty states for a report table; renders nothing when there is data. */
export const TableStatus: React.FC<TableStatusProps> = ({
  loading,
  error,
  empty,
  emptyTitle,
  emptyHint,
  loadingText = 'Loading report…',
}) => {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-500 dark:text-gray-400">
        <FiRefreshCw className="w-7 h-7 animate-spin text-emerald-500 mb-3" />
        <p className="text-sm">{loadingText}</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-12 h-12 rounded-full bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center mb-3">
          <FiAlertCircle className="w-6 h-6 text-rose-500" />
        </div>
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Could not load the report</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm">{error}</p>
      </div>
    );
  }
  if (empty) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700/60 flex items-center justify-center mb-3">
          <FiInbox className="w-6 h-6 text-gray-400" />
        </div>
        <p className="text-sm font-semibold text-gray-900 dark:text-white">{emptyTitle}</p>
        {emptyHint && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm">{emptyHint}</p>
        )}
      </div>
    );
  }
  return null;
};

/** Expand/collapse chevron for a row. */
export const ExpandButton: React.FC<{ open: boolean; onClick: () => void }> = ({
  open,
  onClick,
}) => (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    title={open ? 'Hide details' : 'Show details'}
    className={`w-7 h-7 inline-flex items-center justify-center rounded-md border transition-all ${
      open
        ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400'
        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300'
    }`}
  >
    <FiChevronRight className={`w-4 h-4 transition-transform ${open ? 'rotate-90' : ''}`} />
  </button>
);

/** Small coloured label, e.g. payment method or status. */
export const Pill: React.FC<{ tone?: Tone; children: React.ReactNode }> = ({
  tone = 'slate',
  children,
}) => (
  <span
    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${TONES[tone].tile}`}
  >
    {children}
  </span>
);

/** Label/value pair used inside an expanded row. */
export const DetailField: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div className="min-w-0">
    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
      {label}
    </p>
    <div className="mt-0.5 text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
      {children}
    </div>
  </div>
);

/** Invoice-style summary line (right side of an expanded row). */
export const SummaryLine: React.FC<{
  label: React.ReactNode;
  value: React.ReactNode;
  tone?: 'default' | 'negative' | 'total';
}> = ({ label, value, tone = 'default' }) => (
  <div
    className={`flex items-center justify-between gap-6 ${
      tone === 'total'
        ? 'pt-2 mt-1 border-t border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-900 dark:text-white'
        : 'text-xs text-gray-600 dark:text-gray-300'
    }`}
  >
    <span>{label}</span>
    <span
      className={`tabular-nums ${
        tone === 'negative' ? 'text-rose-600 dark:text-rose-400' : ''
      } ${tone === 'total' ? 'text-emerald-700 dark:text-emerald-400' : 'font-medium'}`}
    >
      {value}
    </span>
  </div>
);

/* ----------------------------------------------------------- Pagination */

interface PaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;
}

const pageWindow = (page: number, total: number): (number | '…')[] => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '…')[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(total - 1, page + 1);
  if (start > 2) pages.push('…');
  for (let p = start; p <= end; p += 1) pages.push(p);
  if (end < total - 1) pages.push('…');
  pages.push(total);
  return pages;
};

export const Pagination: React.FC<PaginationProps> = ({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  itemLabel = 'records',
}) => {
  if (totalItems === 0) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalItems);
  const navBtn =
    'w-8 h-8 inline-flex items-center justify-center rounded-md border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:hover:bg-transparent transition-colors';
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 dark:border-gray-700">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Showing <span className="font-semibold text-gray-800 dark:text-gray-200">{first}–{last}</span> of{' '}
        <span className="font-semibold text-gray-800 dark:text-gray-200">{totalItems}</span> {itemLabel}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={navBtn}
            disabled={page === 1}
            onClick={() => onPageChange(page - 1)}
            title="Previous page"
          >
            <FiChevronLeft className="w-4 h-4" />
          </button>
          {pageWindow(page, totalPages).map((p, i) =>
            p === '…' ? (
              // eslint-disable-next-line react/no-array-index-key
              <span key={`gap-${i}`} className="w-8 text-center text-xs text-gray-400">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                className={`w-8 h-8 rounded-md text-xs font-semibold transition-colors ${
                  p === page
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {p}
              </button>
            )
          )}
          <button
            type="button"
            className={navBtn}
            disabled={page === totalPages}
            onClick={() => onPageChange(page + 1)}
            title="Next page"
          >
            <FiChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

/* --------------------------------------------------------------- Export */

interface ExportDialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  format: 'pdf' | 'csv';
  onFormatChange: (format: 'pdf' | 'csv') => void;
  preview: boolean;
  onPreviewChange: (value: boolean) => void;
  fromDate: string;
  toDate: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onExport: () => void;
  exporting: boolean;
  /** Extra filters (e.g. supplier) shown above the date range. */
  children?: React.ReactNode;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({
  open,
  title,
  onClose,
  format,
  onFormatChange,
  preview,
  onPreviewChange,
  fromDate,
  toDate,
  onFromChange,
  onToChange,
  onExport,
  exporting,
  children,
}) => {
  if (!open) return null;
  const formats: { id: 'pdf' | 'csv'; label: string; hint: string; icon: React.ReactNode }[] = [
    { id: 'pdf', label: 'PDF', hint: 'Print-ready document', icon: <FiFileText className="w-5 h-5" /> },
    { id: 'csv', label: 'CSV', hint: 'Open in Excel', icon: <FiGrid className="w-5 h-5" /> },
  ];
  const dateInput =
    'w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-800 dark:text-gray-100 outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <FiDownload className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
              Format
            </p>
            <div className="grid grid-cols-2 gap-3">
              {formats.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onFormatChange(f.id)}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                    format === f.id
                      ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-900/20'
                      : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                  }`}
                >
                  <span
                    className={`${
                      format === f.id ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'
                    }`}
                  >
                    {f.icon}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-gray-900 dark:text-white">
                      {f.label}
                    </span>
                    <span className="block text-[11px] text-gray-500 dark:text-gray-400">{f.hint}</span>
                  </span>
                </button>
              ))}
            </div>
            {format === 'pdf' && (
              <label className="mt-3 flex items-center gap-2 cursor-pointer text-sm text-gray-600 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={preview}
                  onChange={(e) => onPreviewChange(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                Preview before exporting
              </label>
            )}
          </div>

          {children}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
              Date range
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">From</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => onFromChange(e.target.value)}
                  className={dateInput}
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">To</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => onToChange(e.target.value)}
                  className={dateInput}
                />
              </div>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2">
              Leave both empty to export every record.
            </p>
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 bg-gray-50 dark:bg-gray-800/80 border-t border-gray-100 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-10 rounded-lg border border-gray-200 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onExport}
            disabled={exporting}
            className="flex-1 h-10 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-sm transition-colors disabled:opacity-60"
          >
            {exporting ? (
              <>
                <FiRefreshCw className="w-4 h-4 animate-spin" />
                Exporting…
              </>
            ) : (
              <>
                <FiDownload className="w-4 h-4" />
                Export {format.toUpperCase()}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
