'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  FiPackage, 
  FiCalendar, 
  FiBarChart2, 
  FiTrendingUp, 
  FiDatabase,
  FiShoppingBag,
  FiChevronRight,
  FiLayers,
  FiFileText,
  FiAlertCircle
} from 'react-icons/fi';
import ReportDetailModal from '../common/DetailModal';

interface BatchDetail {
  purchaseId: number;
  medicineName: string;
  pillQuantity: number;
  totalPills: number;
  availablePills: number;
  soldPills: number;
  purchaseDate: string;
  expiryDate: string;
  originalPricePerPacket: number;
  discountPerPacket: number;
  sellingPricePerPill: number;
}

interface MedicineInventoryDetailsProps {
  medicineId: number;
  medicineName: string;
  currencySymbol: string;
  onClose: () => void;
}

const MedicineInventoryDetails: React.FC<MedicineInventoryDetailsProps> = ({
  medicineId,
  medicineName,
  currencySymbol,
  onClose,
}) => {
  const [details, setDetails] = useState<BatchDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDetails = useCallback(() => {
    if (!window?.electron) return;
    setIsLoading(true);
    setError(null);

    window.electron.ipcRenderer.once(
      'medicine-get-inventory-details-reply',
      (response: any) => {
        setIsLoading(false);
        if (response.success) {
          setDetails(response.data || []);
        } else {
          setError(response.error || 'Failed to load inventory details');
        }
      }
    );
    window.electron.ipcRenderer.sendMessage('medicine-get-inventory-details', [
      medicineId,
    ]);
  }, [medicineId]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  // Calculations for summary and info cards
  const stats = useMemo(() => {
    const totalPurchased = details.reduce((sum, b) => sum + (b.totalPills || 0), 0);
    const totalAvailable = details.reduce((sum, b) => sum + (b.availablePills || 0), 0);
    const totalSold = details.reduce((sum, b) => sum + (b.soldPills || 0), 0);
    const avgSellingPrice = details.length > 0 
      ? details.reduce((sum, b) => sum + (b.sellingPricePerPill || 0), 0) / details.length 
      : 0;

    return { totalPurchased, totalAvailable, totalSold, avgSellingPrice };
  }, [details]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm">
        <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-100 dark:border-emerald-900/30 border-t-emerald-500 rounded-full animate-spin"></div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Loading inventory breakdown...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm">
        <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl flex flex-col items-center gap-4 max-w-sm text-center">
          <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center">
             <FiAlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Request Failed</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{error}</p>
          <button onClick={onClose} className="w-full py-2 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm font-bold uppercase transition-all hover:bg-gray-200">Dismiss</button>
        </div>
      </div>
    );
  }

  return (
    <ReportDetailModal
      isOpen={true}
      onClose={onClose}
      title="Stock History & Batch Status"
      icon={FiDatabase}
      colorTheme="emerald"
      headerBadges={[
        { label: 'MEDICINE', value: medicineName.toUpperCase() },
        { label: 'ID', value: `#${medicineId}` }
      ]}
      infoCards={[
        { 
          title: 'Total Purchased', 
          value: `${stats.totalPurchased.toLocaleString()} Units`, 
          icon: FiShoppingBag, 
          theme: 'blue' 
        },
        { 
          title: 'Currently Available', 
          value: `${stats.totalAvailable.toLocaleString()} Units`, 
          icon: FiPackage, 
          theme: 'emerald',
          badge: {
            label: stats.totalAvailable > 0 ? 'In Stock' : 'Out of Stock',
            color: stats.totalAvailable > 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40' : 'bg-red-100 text-red-700 dark:bg-red-900/40'
          }
        },
        { 
          title: 'Market Performance', 
          value: `${currencySymbol}${stats.avgSellingPrice.toFixed(2)}/pill`, 
          icon: FiTrendingUp, 
          theme: 'purple' 
        }
      ]}
      tableTitle="Inventory Batch Log"
      tableItemsCount={details.length}
      tableHeaders={['Purchase Date', 'Pack Info', 'Availability', 'Pricing Metrics']}
      items={details}
      renderTableRow={(batch, idx) => {
        const remainingPercent = Math.min(100, Math.max(0, (batch.availablePills / batch.totalPills) * 100));
        const daysToExpiry = Math.ceil((new Date(batch.expiryDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
        const isExpiringSoon = daysToExpiry < 90 && daysToExpiry > 0;
        const isExpired = daysToExpiry <= 0;

        return (
          <div key={idx} className="grid grid-cols-12 gap-3 px-5 py-4 items-center hover:bg-gray-50/80 dark:hover:bg-gray-800/30 transition-all border-b border-gray-50 dark:border-gray-800/50">
            {/* Purchase Date Column */}
            <div className="col-span-2">
              <div className="text-[10px] font-medium text-gray-800 dark:text-gray-100">
                {batch.purchaseDate ? new Date(batch.purchaseDate).toLocaleDateString() : '—'}
              </div>
              <div className="text-[8px] text-gray-400 mt-0.5 uppercase tracking-tighter italic">From PO #{batch.purchaseId || '—'}</div>
            </div>

            {/* Pack Info Column */}
            <div className="col-span-3">
              <div className="flex items-center gap-2">
                <div className="text-[10px] font-bold text-gray-700 dark:text-gray-200">{batch.pillQuantity || 0} pills/pack</div>
              </div>
              <div className={`text-[9px] mt-1 flex items-center gap-1 ${isExpired ? 'text-red-500' : isExpiringSoon ? 'text-orange-500' : 'text-emerald-500'}`}>
                <FiCalendar className="w-2.5 h-2.5" />
                <span>Exp: {batch.expiryDate ? new Date(batch.expiryDate).toLocaleDateString() : '—'}</span>
              </div>
            </div>

            {/* Availability Column */}
            <div className="col-span-4">
              <div className="flex justify-between text-[9px] mb-1 px-1">
                <span className="text-gray-400 uppercase font-black tracking-widest leading-none">Stock Flow</span>
                <span className="font-bold text-gray-700 dark:text-gray-300 tabular-nums">{(batch.availablePills || 0)} / {(batch.totalPills || 0)} units</span>
              </div>
              <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden shadow-inner flex">
                <div 
                  className={`h-full ${remainingPercent > 50 ? 'bg-emerald-500' : remainingPercent > 20 ? 'bg-orange-400' : 'bg-red-500'}`}
                  style={{ width: `${remainingPercent}%` }}
                />
              </div>
            </div>

            {/* Pricing Metrics Column */}
            <div className="col-span-3 text-right">
              <div className="text-[10px] font-bold text-gray-900 dark:text-white leading-none">
                {currencySymbol}{(batch.sellingPricePerPill || 0).toFixed(2)} <span className="text-[8px] text-gray-400 font-normal uppercase">SRP</span>
              </div>
              <div className="text-[9px] text-gray-400 mt-1 flex items-center justify-end gap-1">
                <span>Cost: {currencySymbol}{((batch.originalPricePerPacket || 0) / (batch.pillQuantity || 1)).toFixed(2)}</span>
                <span className="w-0.5 h-0.5 bg-gray-400 rounded-full"></span>
                <span className="text-emerald-500 font-bold">Disc: {currencySymbol}{((batch.discountPerPacket || 0) / (batch.pillQuantity || 1)).toFixed(2)}</span>
              </div>
            </div>
          </div>
        );
      }}
      remarks={{
        title: 'Inventory Insights',
        content: (
          <div className="space-y-1">
             <p className="text-[10px] text-gray-500 dark:text-gray-400">
               Showing batch-level breakdown for item <span className="font-bold text-emerald-600 dark:text-emerald-400">#{medicineId}</span>. 
               The safety margin indicators show real-time exhaustion rates per procurement lot.
             </p>
          </div>
        )
      }}
      summaryItems={[
        { label: 'Total Stocked', value: stats.totalPurchased.toLocaleString() },
        { label: 'Units Sold', value: stats.totalSold.toLocaleString() },
        { label: 'Market SRP', type: 'normal', value: `${currencySymbol}${stats.avgSellingPrice.toFixed(2)}` },
        { label: 'Current Assets', type: 'total', value: stats.totalAvailable.toLocaleString() }
      ]}
      footerStatus={{
        label: 'Procurement Verified',
        color: 'emerald'
      }}
    />
  );
};

export default MedicineInventoryDetails;
