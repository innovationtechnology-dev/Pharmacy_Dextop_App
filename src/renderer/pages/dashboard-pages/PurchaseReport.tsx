import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDebouncedSearch } from '../../hooks/useDebounce';
import { useDashboardHeader } from './useDashboardHeader';
import {
  FiAlertTriangle,
  FiArrowLeft,
  FiCreditCard,
  FiDownload,
  FiFileText,
  FiPackage,
  FiRefreshCw,
  FiShoppingBag,
  FiTruck,
} from 'react-icons/fi';
import PDFPreviewModal from '../../components/common/PDFPreviewModal';
import { exportPurchasesPdf, exportPurchasesCsv } from '../../utils/purchases';
import { PharmacySettings, getStoredPharmacySettings } from '../../types/pharmacy';
import { getCurrencySymbol as getSymbol } from '../../../common/currency';
import { getAuthUser } from '../../utils/auth';
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
  formatMoney,
} from '../../components/reports/ReportUI';


interface PurchaseItem {
  medicineId: number;
  medicineName: string;
  packetQuantity: number;
  pillsPerPacket: number;
  totalPills: number;
  pricePerPacket: number;
  pricePerPill: number;
  discountAmount: number;
  taxAmount: number;
  lineSubtotal: number;
  lineTotal: number;
  expiryDate: string;
}

interface Purchase {
  id: number;
  supplierId: number;
  supplierName: string;
  items: PurchaseItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  paymentAmount: number;
  remainingBalance: number;
  notes?: string;
  status?: 'ordered' | 'received' | 'completed';
  invoiceNumber?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface Supplier {
  id: number;
  name: string;
  companyName?: string;
  phone?: string;
  email?: string;
  website?:string;
  address?: string;
}

/** SQLite/IPC often returns numeric columns as strings; never use `+` in reduce without coercing or values concatenate into a giant "number". */
function sumPurchaseLinePills(
  items: Array<
    PurchaseItem & { total_pills?: unknown; packet_quantity?: unknown; pills_per_packet?: unknown }
  >
): number {
  let sum = 0;
  for (const i of items) {
    const raw = i.totalPills ?? i.total_pills;
    let n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      const pq = Number(i.packetQuantity ?? i.packet_quantity) || 0;
      const ppp = Number(i.pillsPerPacket ?? i.pills_per_packet) || 0;
      n = pq * ppp;
    }
    if (Number.isFinite(n) && n >= 0) sum += n;
  }
  return sum;
}

export default function Purchases() {
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

  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const { searchTerm: searchQuery, setSearchTerm: setSearchQuery, handleSearchChange, immediateSearchTerm } = useDebouncedSearch('', 300);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'csv'>('pdf');
  const [exportSupplierId, setExportSupplierId] = useState<number | undefined>(undefined);
  const [exportFromDate, setExportFromDate] = useState<string>('');
  const [exportToDate, setExportToDate] = useState<string>('');
  const [exporting, setExporting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [pdfHtmlContent, setPdfHtmlContent] = useState<string | null>(null);
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const pageSize = 10;

  const { setHeader } = useDashboardHeader();
  const [pharmacySettings] = useState<PharmacySettings>(() => getStoredPharmacySettings());
  const isCashier = getAuthUser()?.role === 'cashier';
  // Get currency symbol
  const getCurrencySymbol = () => getSymbol(pharmacySettings.currency || 'PKR');
  // Set header
  useEffect(() => {
    setHeader({
      title: 'Purchase Records',
      subtitle: 'View and manage all purchase transactions',
    });
    return () => setHeader(null);
  }, [setHeader]);

  const fetchPurchases = useCallback(async (overrideFrom?: string, overrideTo?: string) => {
    setLoading(true);
    setError(null);
    try {
      // Simulate a small delay for the animation effect
      await new Promise(resolve => setTimeout(resolve, 500));

      window.electron.ipcRenderer.once('purchase-get-all-reply', (response: any) => {
        setLoading(false);
        if (response.success) {
          setPurchases(response.data || []);
          setPage(1); // Reset to first page on new fetch
        } else {
          setError(response.error || 'Failed to load purchases');
          setPurchases([]);
        }
      });
      // Pass the date range to the backend
      window.electron.ipcRenderer.sendMessage('purchase-get-all', [overrideFrom || fromDate, overrideTo || toDate]);
    } catch (err) {
      setError('An unexpected error occurred');
      console.error(err);
      setLoading(false);
    }
  }, [fromDate, toDate]);

  const handlePreset = (from: string, to: string) => {
    setFromDate(from);
    setToDate(to);
    fetchPurchases(from, to);
  };

  // Initial fetch
  useEffect(() => {
    fetchPurchases();
    // Fetch suppliers list
    window.electron.ipcRenderer.once('supplier-get-all-reply', (response: any) => {
      if (response.success) {
        setSuppliers(response.data || []);
      }
    });
    window.electron.ipcRenderer.sendMessage('supplier-get-all', []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  const handleDownloadPdf = async () => {
    setExporting(true);
    try {
      // Use export dates if provided, otherwise use empty strings to export all
      const fromDateToUse = exportFromDate || '';
      const toDateToUse = exportToDate || '';
      const res = await exportPurchasesPdf(fromDateToUse, toDateToUse, exportSupplierId, showPreview);
      setExporting(false);
      if (!res.success) {
        alert('Failed to export PDF: ' + (res.error || 'Unknown error'));
      } else if (showPreview && res.data?.htmlContent) {
        setPdfHtmlContent(res.data.htmlContent);
        setShowExportDialog(false);
      } else {
        setShowExportDialog(false);
        alert('Purchase report exported successfully!');
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
      const res = await exportPurchasesPdf(fromDateToUse, toDateToUse, exportSupplierId, false);
      if (res.success) {
        setPdfHtmlContent(null);
        alert('Purchase report downloaded successfully!');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to download PDF');
    }
  };

  const handleDownloadCsv = async () => {
    setExporting(true);
    try {
      // Use export dates if provided, otherwise use empty strings to export all
      const fromDateToUse = exportFromDate || '';
      const toDateToUse = exportToDate || '';
      const res = await exportPurchasesCsv(exportSupplierId, fromDateToUse, toDateToUse);
      setExporting(false);
      if (!res.success) {
        alert('Failed to export CSV: ' + (res.error || 'Unknown error'));
      } else {
        setShowExportDialog(false);
        alert('Purchase report exported successfully!');
      }
    } catch (err) {
      setExporting(false);
      console.error(err);
      alert('Failed to export CSV');
    }
  };

  // Filter purchases based on search query only (dates are handled by backend fetch)
  const filteredPurchases = useMemo(() => {
    let filtered = purchases;

    // Filter by search query
    if (!searchQuery.trim()) return filtered;
    const q = searchQuery.trim().toLowerCase();
    const searchWords = q.split(/\s+/).filter(word => word.length > 0);
    return filtered.filter(purchase =>
      searchWords.every(word =>
        purchase.supplierName.toLowerCase().includes(word) ||
        purchase.id.toString().includes(word) ||
        purchase.items.some(item => item.medicineName.toLowerCase().includes(word))
      )
    );
  }, [purchases, searchQuery]);

  // Pagination
  const totalPages = Math.ceil(filteredPurchases.length / pageSize);
  const pagedPurchases = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredPurchases.slice(start, start + pageSize);
  }, [filteredPurchases, page, pageSize]);

  // Stats — coerce with Number() so SQLite/IPC string values never string-concatenate in reduce (+).
  const totalPurchaseAmount = useMemo(
    () => filteredPurchases.reduce((sum, p) => sum + (Number(p.grandTotal) || 0), 0),
    [filteredPurchases]
  );
  const totalPaid = useMemo(
    () => filteredPurchases.reduce((sum, p) => sum + (Number(p.paymentAmount) || 0), 0),
    [filteredPurchases]
  );
  const totalRemaining = useMemo(
    () => filteredPurchases.reduce((sum, p) => sum + (Number(p.remainingBalance) || 0), 0),
    [filteredPurchases]
  );
  const totalItems = useMemo(() => {
    let sum = 0;
    for (const p of filteredPurchases) {
      if (Array.isArray(p.items)) sum += sumPurchaseLinePills(p.items);
    }
    return sum;
  }, [filteredPurchases]);

  const symbol = getCurrencySymbol();
  const ROW_GRID =
    'grid grid-cols-[40px_minmax(140px,1fr)_minmax(0,1.6fr)_96px_64px_minmax(110px,0.9fr)_minmax(110px,0.9fr)_minmax(110px,0.9fr)] gap-4 items-center';
  const paidPercent =
    totalPurchaseAmount > 0 ? Math.round((totalPaid / totalPurchaseAmount) * 100) : 0;

  const paymentStatus = (purchase: Purchase) => {
    const remaining = Number(purchase.remainingBalance) || 0;
    const paid = Number(purchase.paymentAmount) || 0;
    if (remaining <= 0) return { label: 'Paid', tone: 'emerald' as const };
    if (paid > 0) return { label: 'Partial', tone: 'amber' as const };
    return { label: 'Unpaid', tone: 'rose' as const };
  };

  const deliveryTone = (status?: Purchase['status']) => {
    if (status === 'received') return 'emerald' as const;
    if (status === 'completed') return 'blue' as const;
    return 'amber' as const;
  };

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
          onApply={() => fetchPurchases()}
          loading={loading}
          minFromDate={isCashier ? minFromDate : undefined}
          hiddenPresets={isCashier ? ['year'] : []}
        />
        <div className="flex items-center gap-2">
          {isCashier && (
            <ToolbarButton
              variant="accent"
              icon={<FiArrowLeft className="w-4 h-4" />}
              label="Back to Purchasing"
              onClick={() => {
                window.location.hash = '#/purchasing-panel';
              }}
            />
          )}
          <ToolbarButton
            icon={<FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />}
            title="Refresh"
            onClick={() => fetchPurchases()}
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
            tone="emerald"
            icon={<FiShoppingBag className="w-4 h-4" />}
            label="Total purchases"
            value={formatMoney(symbol, totalPurchaseAmount)}
            hint="Invoiced by suppliers in this period"
          />
          <KpiCard
            tone="emerald"
            icon={<FiCreditCard className="w-4 h-4" />}
            label="Paid"
            value={formatMoney(symbol, totalPaid)}
            hint={totalPurchaseAmount > 0 ? `${paidPercent}% of purchases paid` : undefined}
          />
          <KpiCard
            tone={totalRemaining > 0 ? 'rose' : 'slate'}
            icon={<FiAlertTriangle className="w-4 h-4" />}
            label="Outstanding"
            value={formatMoney(symbol, totalRemaining)}
            hint={totalRemaining > 0 ? 'Still owed to suppliers' : 'Nothing owed'}
          />
          <KpiCard
            tone="violet"
            icon={<FiFileText className="w-4 h-4" />}
            label="Purchases"
            value={filteredPurchases.length.toLocaleString()}
            hint={
              filteredPurchases.length > 0
                ? `Avg ${formatMoney(symbol, totalPurchaseAmount / filteredPurchases.length)}`
                : undefined
            }
          />
          <KpiCard
            tone="blue"
            icon={<FiPackage className="w-4 h-4" />}
            label="Total pills"
            value={totalItems.toLocaleString()}
            hint="Received across all purchases"
          />
        </KpiGrid>
      </div>

      {/* Purchases table */}
      <ReportCard className="flex-1 min-h-0 flex flex-col overflow-visible md:overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Purchases</h2>
            <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-[11px] font-semibold text-gray-600 dark:text-gray-300 tabular-nums">
              {filteredPurchases.length}
            </span>
          </div>
          <SearchInput
            value={immediateSearchTerm}
            onChange={handleSearchChange}
            onClear={() => setSearchQuery('')}
            placeholder="Search supplier, medicine or purchase #…"
          />
        </div>

        <div className="flex-1 overflow-visible md:overflow-auto">
          <div
            className={`${ROW_GRID} sticky top-0 z-10 px-4 py-2.5 bg-gray-50/95 dark:bg-gray-800/95 backdrop-blur border-b border-gray-100 dark:border-gray-700 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400`}
          >
            <span />
            <span>Purchase</span>
            <span>Supplier</span>
            <span>Payment</span>
            <span className="text-center">Items</span>
            <span className="text-right">Total</span>
            <span className="text-right">Paid</span>
            <span className="text-right">Outstanding</span>
          </div>

          <TableStatus
            loading={loading}
            error={error}
            empty={pagedPurchases.length === 0}
            loadingText="Loading purchases…"
            emptyTitle="No purchases in this period"
            emptyHint={
              searchQuery
                ? 'No purchase matches your search. Try another word or clear the search.'
                : 'Pick another date range above, or check back after the next purchase.'
            }
          />

          {!loading &&
            !error &&
            pagedPurchases.map((purchase) => {
              const open = selectedPurchase?.id === purchase.id;
              const toggle = () => setSelectedPurchase(open ? null : purchase);
              const grandTotal = Number(purchase.grandTotal) || 0;
              const paid = Number(purchase.paymentAmount) || 0;
              const remaining = Number(purchase.remainingBalance) || 0;
              const status = paymentStatus(purchase);
              const progress = Math.min(100, (paid / (grandTotal || 1)) * 100);
              const supplier = suppliers.find((s) => s.id === purchase.supplierId);
              const wasUpdated =
                !!purchase.updatedAt && purchase.updatedAt !== purchase.createdAt;
              return (
                <div
                  key={purchase.id}
                  className={`border-b border-gray-100 dark:border-gray-700/60 ${
                    open ? 'bg-emerald-50/40 dark:bg-emerald-900/10' : ''
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
                        #{purchase.id}
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        {purchase.createdAt ? formatDisplayDate(purchase.createdAt) : '—'}
                      </p>
                      {wasUpdated && (
                        <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                          <FiRefreshCw className="w-2.5 h-2.5" />
                          Updated {formatDisplayDate(purchase.updatedAt as string)}
                        </p>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p
                        className="text-sm text-gray-800 dark:text-gray-200 truncate"
                        title={purchase.supplierName}
                      >
                        {purchase.supplierName || 'Unknown supplier'}
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                        {purchase.invoiceNumber ? `Invoice ${purchase.invoiceNumber}` : 'No invoice number'}
                      </p>
                    </div>
                    <div>
                      <Pill tone={status.tone}>{status.label}</Pill>
                    </div>
                    <div className="flex justify-center">
                      <span className="min-w-[2rem] text-center px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-200 tabular-nums">
                        {purchase.items.length}
                      </span>
                    </div>
                    <p className="text-right text-sm font-bold text-gray-900 dark:text-white tabular-nums whitespace-nowrap">
                      {formatMoney(symbol, grandTotal)}
                    </p>
                    <p className="text-right text-sm text-emerald-700 dark:text-emerald-400 tabular-nums whitespace-nowrap">
                      {formatMoney(symbol, paid)}
                    </p>
                    <p
                      className={`text-right text-sm tabular-nums whitespace-nowrap ${
                        remaining > 0
                          ? 'font-semibold text-rose-600 dark:text-rose-400'
                          : 'text-gray-400 dark:text-gray-500'
                      }`}
                    >
                      {remaining > 0 ? formatMoney(symbol, remaining) : '—'}
                    </p>
                  </div>

                  {open && (
                    <div className="px-4 pb-4 pl-[72px]">
                      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                          <DetailField label="Supplier">
                            {purchase.supplierName || 'Unknown supplier'}
                          </DetailField>
                          <DetailField label="Contact">{supplier?.phone || '—'}</DetailField>
                          <DetailField label="Invoice">{purchase.invoiceNumber || '—'}</DetailField>
                          <DetailField label="Delivery">
                            <Pill tone={deliveryTone(purchase.status)}>
                              {purchase.status || 'Ordered'}
                            </Pill>
                          </DetailField>
                          <DetailField label="Notes">
                            <span title={purchase.notes}>{purchase.notes || '—'}</span>
                          </DetailField>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                          <div className="flex-1 min-w-[200px]">
                            <div className="flex justify-between text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                              <span>Payment progress</span>
                              <span className="tabular-nums">{Math.round(progress)}% paid</span>
                            </div>
                            <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  remaining <= 0 ? 'bg-emerald-500' : 'bg-amber-500'
                                }`}
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-6 text-right">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                                Paid
                              </p>
                              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                                {formatMoney(symbol, paid)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                                Due
                              </p>
                              <p className="text-sm font-semibold text-rose-600 dark:text-rose-400 tabular-nums">
                                {formatMoney(symbol, remaining)}
                              </p>
                            </div>
                          </div>
                        </div>

                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-gray-50 dark:bg-gray-900/40 text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
                              <th className="px-4 py-2 text-left font-semibold w-10">#</th>
                              <th className="px-4 py-2 text-left font-semibold">Medicine</th>
                              <th className="px-4 py-2 text-left font-semibold">Expiry</th>
                              <th className="px-4 py-2 text-center font-semibold">Pack size</th>
                              <th className="px-4 py-2 text-center font-semibold">Packs</th>
                              <th className="px-4 py-2 text-right font-semibold">Price / pack</th>
                              <th className="px-4 py-2 text-right font-semibold">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                            {purchase.items?.map((item: any, idx: number) => (
                              // eslint-disable-next-line react/no-array-index-key
                              <tr key={idx}>
                                <td className="px-4 py-2.5 text-gray-400 tabular-nums">{idx + 1}</td>
                                <td className="px-4 py-2.5">
                                  <p className="font-medium text-gray-900 dark:text-white">
                                    {item.medicineName}
                                  </p>
                                  <p className="text-[10px] text-gray-400">ID #{item.medicineId}</p>
                                </td>
                                <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                                  {item.expiryDate ? formatDisplayDate(item.expiryDate) : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-center text-gray-600 dark:text-gray-300 whitespace-nowrap">
                                  {item.pillsPerPacket} pills
                                </td>
                                <td className="px-4 py-2.5 text-center tabular-nums text-gray-700 dark:text-gray-300">
                                  {item.packetQuantity}
                                </td>
                                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">
                                  {formatMoney(symbol, Number(item.pricePerPacket) || 0)}
                                </td>
                                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900 dark:text-white">
                                  {formatMoney(symbol, Number(item.lineTotal) || 0)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        <div className="flex justify-end px-4 py-3 bg-gray-50/70 dark:bg-gray-900/30 border-t border-gray-100 dark:border-gray-700">
                          <div className="w-full max-w-xs space-y-1.5">
                            <SummaryLine
                              label="Subtotal"
                              value={formatMoney(symbol, Number(purchase.subtotal) || 0)}
                            />
                            <SummaryLine
                              label="Discount"
                              tone="negative"
                              value={`−${formatMoney(symbol, Number(purchase.discountTotal) || 0)}`}
                            />
                            <SummaryLine
                              label="Tax"
                              value={`+${formatMoney(symbol, Number(purchase.taxTotal) || 0)}`}
                            />
                            <SummaryLine
                              label="Net total"
                              tone="total"
                              value={formatMoney(symbol, grandTotal)}
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

        {!loading && !error && filteredPurchases.length > 0 && (
          <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-4 px-4 py-3 bg-gray-50 dark:bg-gray-900/40 border-t border-gray-200 dark:border-gray-700">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Grand total · {filteredPurchases.length.toLocaleString()} purchases
            </span>
            <div className="flex items-center gap-6 tabular-nums">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Paid{' '}
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                  {formatMoney(symbol, totalPaid)}
                </span>
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Outstanding{' '}
                <span className="font-semibold text-rose-600 dark:text-rose-400">
                  {formatMoney(symbol, totalRemaining)}
                </span>
              </span>
              <span className="text-base font-bold text-emerald-700 dark:text-emerald-400">
                {formatMoney(symbol, totalPurchaseAmount)}
              </span>
            </div>
          </div>
        )}
        {!loading && !error && (
          <Pagination
            page={page}
            totalPages={totalPages}
            totalItems={filteredPurchases.length}
            pageSize={pageSize}
            onPageChange={setPage}
            itemLabel="purchases"
          />
        )}
      </ReportCard>

      <ExportDialog
        open={showExportDialog}
        title="Export purchase report"
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
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
            Supplier
          </p>
          <div className="relative">
            <FiTruck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <select
              value={exportSupplierId || ''}
              onChange={(e) =>
                setExportSupplierId(e.target.value ? parseInt(e.target.value, 10) : undefined)
              }
              className="w-full h-10 pl-9 pr-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-800 dark:text-gray-100 outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
            >
              <option value="">All suppliers</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.companyName ? `(${s.companyName})` : ''}
                </option>
              ))}
            </select>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2">
            {exportSupplierId
              ? 'The report lists each medicine bought from this supplier.'
              : 'The report groups every supplier with the medicines bought from them.'}
          </p>
        </div>
      </ExportDialog>

      <PDFPreviewModal
        isOpen={!!pdfHtmlContent}
        htmlContent={pdfHtmlContent}
        onClose={() => setPdfHtmlContent(null)}
        onDownload={handleDownloadFromPreview}
        title="Purchase Report Preview"
      />
    </div>
  );
}
