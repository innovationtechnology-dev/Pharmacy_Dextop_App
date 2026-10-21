import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useDebouncedSearch } from '../../hooks/useDebounce';
import { getSaleReturnsFlatRowsByRange, FlatSaleReturnRow, exportSaleReturnsPdf, exportSaleReturnsCsv } from '../../utils/sale-return';
import { getAuthUser } from '../../utils/auth';
import { useDashboardHeader } from './useDashboardHeader';
import {
  FiArrowLeft,
  FiDownload,
  FiFileText,
  FiList,
  FiPackage,
  FiPercent,
  FiRefreshCw,
  FiRotateCcw,
} from 'react-icons/fi';
import PDFPreviewModal from '../../components/common/PDFPreviewModal';
import { PharmacySettings, getStoredPharmacySettings } from '../../types/pharmacy';
import { getCurrencySymbol as getSymbol } from '../../../common/currency';
import {
  DetailField,
  ExpandButton,
  ExportDialog,
  KpiCard,
  KpiGrid,
  Pagination,
  PeriodFilter,
  Pill,
  ReportCard,
  SearchInput,
  SummaryLine,
  TableStatus,
  ToolbarButton,
  formatDisplayDate,
  formatDisplayTime,
  formatMoney,
} from '../../components/reports/ReportUI';


export default function SaleReturn() {
  const isCashier = getAuthUser()?.role === 'cashier';

  const today = useMemo(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }, []);

  const [fromDate, setFromDate] = useState<string>(today);
  const [toDate, setToDate] = useState<string>(today);

  // Calculate limit for cashier (1 month ago)
  const minFromDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }, []);

  const [reportRows, setReportRows] = useState<FlatSaleReturnRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const { searchTerm: searchQuery, setSearchTerm: setSearchQuery, handleSearchChange, immediateSearchTerm } = useDebouncedSearch('', 300);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'csv'>('pdf');
  const [exportFromDate, setExportFromDate] = useState<string>('');
  const [exportToDate, setExportToDate] = useState<string>('');
  const [showPreview, setShowPreview] = useState(false);
  const [pdfHtmlContent, setPdfHtmlContent] = useState<string | null>(null);
  const [selectedReturn, setSelectedReturn] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const pageSize = 15;

  const { setHeader } = useDashboardHeader();
  const [pharmacySettings] = useState<PharmacySettings>(() => getStoredPharmacySettings());

  // Get currency symbol
  const getCurrencySymbol = () => getSymbol(pharmacySettings.currency || 'USD');

  // Set header
  useEffect(() => {
    setHeader({
      title: 'Sale Returns',
      subtitle: 'View and export detailed sale return reports',
    });
    return () => setHeader(null);
  }, [setHeader]);

  const fetchReport = useCallback(async (overrideFrom?: string, overrideTo?: string) => {
    setLoading(true);
    setError(null);
    try {
      // Simulate a small delay for the animation effect if the fetch is too fast
      await new Promise(resolve => setTimeout(resolve, 500));

      const res = await getSaleReturnsFlatRowsByRange(overrideFrom || fromDate, overrideTo || toDate);
      if (res.success && res.data) {
        setReportRows(res.data);
        setPage(1); // Reset to first page on new fetch
      } else {
        setError(res.error || 'Failed to fetch sale return data');
        setReportRows([]);
      }
    } catch (err) {
      setError('An unexpected error occurred');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  const handlePreset = (from: string, to: string) => {
    setFromDate(from);
    setToDate(to);
    fetchReport(from, to);
  };

  // Initial fetch
  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDownloadPdf = async () => {
    setExporting(true);
    try {
      const fromDateToUse = exportFromDate || '';
      const toDateToUse = exportToDate || '';
      const res = await exportSaleReturnsPdf(fromDateToUse, toDateToUse, showPreview);
      setExporting(false);
      if (!res.success) {
        alert('Failed to export PDF: ' + (res.error || 'Unknown error'));
      } else if (showPreview && res.data?.htmlContent) {
        setPdfHtmlContent(res.data.htmlContent);
        setShowExportDialog(false);
      } else {
        setShowExportDialog(false);
        alert('Sale return report exported successfully!');
      }
    } catch (err) {
      setExporting(false);
      console.error(err);
      alert('Failed to export PDF');
    }
  };

  const handleDownloadFromPreview = async () => {
    if (!pdfHtmlContent) return;
    try {
      const fromDateToUse = exportFromDate || '';
      const toDateToUse = exportToDate || '';
      const res = await exportSaleReturnsPdf(fromDateToUse, toDateToUse, false);
      if (res.success) {
        setPdfHtmlContent(null);
        alert('Sale return report downloaded successfully!');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to download PDF');
    }
  };

  const handleDownloadCsv = async () => {
    setExporting(true);
    try {
      const fromDateToUse = exportFromDate || '';
      const toDateToUse = exportToDate || '';
      const res = await exportSaleReturnsCsv(fromDateToUse, toDateToUse);
      setExporting(false);
      if (!res.success) {
        alert('Failed to export CSV: ' + (res.error || 'Unknown error'));
      } else {
        setShowExportDialog(false);
        alert('Sale return report exported successfully!');
      }
    } catch (err) {
      setExporting(false);
      console.error(err);
      alert('Failed to export CSV');
    }
  };

  // Filter and Group rows
  const filteredRows = useMemo(() => {
    // Step 1: Group flat rows by saleReturnId
    const map = new Map<number, FlatSaleReturnRow & { itemDetails: string[]; items: FlatSaleReturnRow[] }>();

    reportRows.forEach(row => {


      // Improved formatting with a dot or colon between name and quantity
      const itemDetail = `${row.medicineName}`;
      
      if (!map.has(row.saleReturnId)) {
        map.set(row.saleReturnId, {
          ...row,
          itemDetails: [itemDetail],
          items: [row]
        });
      } else {
        const existing = map.get(row.saleReturnId)!;
        existing.itemDetails.push(itemDetail);
        existing.items.push(row);
        
        // Accumulate totals for the header row
        existing.pills += row.pills;
        existing.total += row.total;
        existing.subtotal += row.subtotal;
        existing.discountAmount += row.discountAmount;
        existing.taxAmount += row.taxAmount;
      }
    });

    const groupedData = Array.from(map.values()).map(row => ({
      ...row,
      displayMedicineName: row.itemDetails.join('\n'), // Use newline for vertical listing
      isGrouped: row.itemDetails.length > 1,
      children: row.items
    }));

    // Step 2: Filter based on search
    if (!searchQuery.trim()) return groupedData;
    const q = searchQuery.trim().toLowerCase();
    const searchWords = q.split(/\s+/).filter(word => word.length > 0);
    return groupedData.filter(row =>
      searchWords.every(word =>
        row.displayMedicineName.toLowerCase().includes(word) ||
        (row.customerName && row.customerName.toLowerCase().includes(word)) ||
        row.saleId.toString().includes(word) ||
        row.saleReturnId.toString().includes(word) ||
        (row.reason && row.reason.toLowerCase().includes(word))
      )
    );
  }, [reportRows, searchQuery]);

  // Pagination
  const totalPages = Math.ceil(filteredRows.length / pageSize);
  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  // Stats
  const totalReturned = useMemo(() => filteredRows.reduce((sum, row) => sum + row.total, 0), [filteredRows]);
  const totalItemsReturned = useMemo(() => filteredRows.reduce((sum, row) => sum + row.pills, 0), [filteredRows]);
  const totalTax = useMemo(() => filteredRows.reduce((sum, row) => sum + (row.taxAmount || 0), 0), [filteredRows]);
  const totalDiscount = useMemo(() => filteredRows.reduce((sum, row) => sum + (row.discountAmount || 0), 0), [filteredRows]);

  const symbol = getCurrencySymbol();
  const ROW_GRID =
    'grid grid-cols-[40px_minmax(150px,1.1fr)_minmax(0,2.4fr)_minmax(0,1.4fr)_80px_minmax(120px,0.9fr)] gap-4 items-center';

  return (
    <div className="flex flex-col gap-3 h-auto md:h-[calc(100vh-80px)] w-full px-4 pb-4 overflow-visible md:overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Toolbar: period + actions */}
      <ReportCard className="flex-shrink-0 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <PeriodFilter
          fromDate={fromDate}
          toDate={toDate}
          onFromChange={setFromDate}
          onToChange={setToDate}
          onPreset={handlePreset}
          onApply={() => fetchReport()}
          loading={loading}
          minFromDate={isCashier ? minFromDate : undefined}
          hiddenPresets={isCashier ? ['year'] : []}
        />
        <div className="flex items-center gap-2">
          {isCashier && (
            <ToolbarButton
              variant="accent"
              icon={<FiArrowLeft className="w-4 h-4" />}
              label="Back to Selling"
              onClick={() => {
                window.location.hash = '#/selling-panel';
              }}
            />
          )}
          <ToolbarButton
            icon={<FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />}
            title="Refresh"
            onClick={() => fetchReport()}
          />
          {!isCashier && (
            <ToolbarButton
              variant="primary"
              icon={<FiDownload className="w-4 h-4" />}
              label="Export"
              onClick={() => setShowExportDialog(true)}
            />
          )}
        </div>
      </ReportCard>

      {/* KPIs */}
      <div className="flex-shrink-0">
        <KpiGrid>
          <KpiCard
            primary
            tone="rose"
            icon={<FiRotateCcw className="w-4 h-4" />}
            label="Total refunded"
            value={formatMoney(symbol, totalReturned)}
            hint="Value returned to customers"
          />
          <KpiCard
            tone="blue"
            icon={<FiPackage className="w-4 h-4" />}
            label="Units returned"
            value={totalItemsReturned.toLocaleString()}
          />
          <KpiCard
            tone="violet"
            icon={<FiList className="w-4 h-4" />}
            label="Returns"
            value={filteredRows.length.toLocaleString()}
            hint={
              filteredRows.length > 0
                ? `Avg ${formatMoney(symbol, totalReturned / filteredRows.length)}`
                : undefined
            }
          />
          <KpiCard
            tone="orange"
            icon={<FiFileText className="w-4 h-4" />}
            label="Tax reversed"
            value={formatMoney(symbol, totalTax)}
          />
          <KpiCard
            tone="slate"
            icon={<FiPercent className="w-4 h-4" />}
            label="Discount adjusted"
            value={formatMoney(symbol, totalDiscount)}
          />
        </KpiGrid>
      </div>

      {/* Returns table */}
      <ReportCard className="flex-1 min-h-0 flex flex-col overflow-visible md:overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Sale returns</h2>
            <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-[11px] font-semibold text-gray-600 dark:text-gray-300 tabular-nums">
              {filteredRows.length}
            </span>
          </div>
          <SearchInput
            value={immediateSearchTerm}
            onChange={handleSearchChange}
            onClear={() => setSearchQuery('')}
            placeholder="Search medicine, customer, sale # or reason…"
          />
        </div>

        <div className="flex-1 overflow-visible md:overflow-auto">
          <div
            className={`${ROW_GRID} sticky top-0 z-10 px-4 py-2.5 bg-gray-50/95 dark:bg-gray-800/95 backdrop-blur border-b border-gray-100 dark:border-gray-700 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400`}
          >
            <span />
            <span>Return</span>
            <span>Items</span>
            <span>Customer</span>
            <span className="text-center">Qty</span>
            <span className="text-right">Refund</span>
          </div>

          <TableStatus
            loading={loading}
            error={error}
            empty={pagedRows.length === 0}
            loadingText="Loading sale returns…"
            emptyTitle="No returns in this period"
            emptyHint={
              searchQuery
                ? 'No return matches your search. Try another word or clear the search.'
                : 'Pick another date range above.'
            }
          />

          {!loading &&
            !error &&
            pagedRows.map((row) => {
              const open = selectedReturn?.saleReturnId === row.saleReturnId;
              const toggle = () => setSelectedReturn(open ? null : row);
              const items = row.children || [];
              return (
                <div
                  key={row.saleReturnId}
                  className={`border-b border-gray-100 dark:border-gray-700/60 ${
                    open ? 'bg-rose-50/40 dark:bg-rose-900/10' : ''
                  }`}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={toggle}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggle();
                      }
                    }}
                    className={`${ROW_GRID} px-4 py-3 cursor-pointer transition-colors ${
                      open ? '' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                    }`}
                  >
                    <ExpandButton open={open} onClick={toggle} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        #{row.saleReturnId}
                        <span className="ml-1.5 text-[11px] font-medium text-gray-400">
                          from sale #{row.saleId}
                        </span>
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        {formatDisplayDate(row.createdAt)} · {formatDisplayTime(row.createdAt)}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p
                        className="text-sm text-gray-800 dark:text-gray-200 truncate"
                        title={row.itemDetails.join(', ')}
                      >
                        {row.itemDetails.join(', ')}
                      </p>
                      <p
                        className="text-[11px] text-gray-500 dark:text-gray-400 truncate"
                        title={row.reason || undefined}
                      >
                        {row.reason
                          ? row.reason
                          : row.isGrouped
                          ? `${items.length} items`
                          : `${formatMoney(symbol, row.unitPrice)} each`}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800 dark:text-gray-200 truncate">
                        {row.customerName || 'Walk-in customer'}
                      </p>
                      {row.customerPhone && (
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                          {row.customerPhone}
                        </p>
                      )}
                    </div>
                    <div className="flex justify-center">
                      <span className="min-w-[2rem] text-center px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-200 tabular-nums">
                        {row.pills}
                      </span>
                    </div>
                    <p className="text-right text-sm font-bold text-rose-600 dark:text-rose-400 tabular-nums whitespace-nowrap">
                      {formatMoney(symbol, row.total)}
                    </p>
                  </div>

                  {open && (
                    <div className="px-4 pb-4 pl-[72px]">
                      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                          <DetailField label="Customer">
                            {row.customerName || 'Walk-in customer'}
                          </DetailField>
                          <DetailField label="Contact">{row.customerPhone || '—'}</DetailField>
                          <DetailField label="Original sale">
                            <Pill tone="rose">Sale #{row.saleId}</Pill>
                          </DetailField>
                          <DetailField label="Reason">
                            <span title={row.reason || undefined}>{row.reason || '—'}</span>
                          </DetailField>
                        </div>

                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-gray-50 dark:bg-gray-900/40 text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
                              <th className="px-4 py-2 text-left font-semibold w-10">#</th>
                              <th className="px-4 py-2 text-left font-semibold">Medicine</th>
                              <th className="px-4 py-2 text-center font-semibold">Qty</th>
                              <th className="px-4 py-2 text-right font-semibold">Unit price</th>
                              <th className="px-4 py-2 text-right font-semibold">Discount</th>
                              <th className="px-4 py-2 text-right font-semibold">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                            {items.map((item: any, idx: number) => (
                              // eslint-disable-next-line react/no-array-index-key
                              <tr key={idx}>
                                <td className="px-4 py-2.5 text-gray-400 tabular-nums">{idx + 1}</td>
                                <td className="px-4 py-2.5">
                                  <p className="font-medium text-gray-900 dark:text-white">
                                    {item.medicineName}
                                  </p>
                                  <p className="text-[10px] text-gray-400">ID #{item.medicineId}</p>
                                </td>
                                <td className="px-4 py-2.5 text-center tabular-nums text-gray-700 dark:text-gray-300">
                                  {item.pills}
                                </td>
                                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">
                                  {formatMoney(symbol, item.unitPrice)}
                                </td>
                                <td className="px-4 py-2.5 text-right tabular-nums text-rose-600 dark:text-rose-400">
                                  {item.discountAmount > 0
                                    ? `−${formatMoney(symbol, item.discountAmount)}`
                                    : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900 dark:text-white">
                                  {formatMoney(symbol, item.total)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        <div className="flex justify-end px-4 py-3 bg-gray-50/70 dark:bg-gray-900/30 border-t border-gray-100 dark:border-gray-700">
                          <div className="w-full max-w-xs space-y-1.5">
                            <SummaryLine
                              label="Gross value"
                              value={formatMoney(symbol, row.subtotal || 0)}
                            />
                            <SummaryLine
                              label="Discount adjustment"
                              tone="negative"
                              value={`−${formatMoney(symbol, row.discountAmount || 0)}`}
                            />
                            <SummaryLine
                              label="Tax reversal"
                              value={formatMoney(symbol, row.taxAmount || 0)}
                            />
                            <SummaryLine
                              label="Refund amount"
                              tone="total"
                              value={formatMoney(symbol, row.total || 0)}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>

        {!loading && !error && filteredRows.length > 0 && (
          <div className="flex-shrink-0 flex items-center justify-between gap-4 px-4 py-3 bg-gray-50 dark:bg-gray-900/40 border-t border-gray-200 dark:border-gray-700">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Total refunded · {totalItemsReturned.toLocaleString()} units
            </span>
            <span className="text-base font-bold text-rose-600 dark:text-rose-400 tabular-nums">
              {formatMoney(symbol, totalReturned)}
            </span>
          </div>
        )}
        {!loading && !error && (
          <Pagination
            page={page}
            totalPages={totalPages}
            totalItems={filteredRows.length}
            pageSize={pageSize}
            onPageChange={setPage}
            itemLabel="returns"
          />
        )}
      </ReportCard>

      <ExportDialog
        open={showExportDialog}
        title="Export sale returns"
        onClose={() => setShowExportDialog(false)}
        format={exportFormat}
        onFormatChange={setExportFormat}
        preview={showPreview}
        onPreviewChange={setShowPreview}
        fromDate={exportFromDate}
        toDate={exportToDate}
        onFromChange={setExportFromDate}
        onToChange={setExportToDate}
        exporting={exporting}
        onExport={() => (exportFormat === 'pdf' ? handleDownloadPdf() : handleDownloadCsv())}
      />

      <PDFPreviewModal
        isOpen={!!pdfHtmlContent}
        htmlContent={pdfHtmlContent}
        onClose={() => setPdfHtmlContent(null)}
        onDownload={handleDownloadFromPreview}
        title="Sale Return Report Preview"
      />
    </div>
  );
}
