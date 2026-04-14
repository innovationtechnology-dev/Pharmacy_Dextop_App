'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useDebouncedSearch } from '../../hooks/useDebounce';
import { 
  FiPackage, 
  FiSearch, 
  FiAlertCircle, 
  FiRefreshCw, 
  FiFilter,
  FiEye,
  FiBox,
  FiAlertTriangle
} from 'react-icons/fi';
import { useDashboardHeader } from './useDashboardHeader';
import { PharmacySettings, getStoredPharmacySettings } from '../../types/pharmacy';
import { currencySymbols, getCurrencySymbol as getSymbol } from '../../../common/currency';
import MedicineInventoryDetails from '../../components/medicines/MedicineInventoryDetails';

interface MedicineStock {
  id: number;
  name: string;
  pillQuantity: number;
  totalAvailablePills: number;
  sellablePills: number;
  minimumStockLevel: number;
  status: string;
  manufacturer: string;
  brandName: string;
}

const Stocks: React.FC = () => {
  const [medicines, setMedicines] = useState<MedicineStock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'low' | 'out'>('all');
  const { searchTerm, setSearchTerm, handleSearchChange } = useDebouncedSearch('', 300);
  const [selectedMedicineForDetails, setSelectedMedicineForDetails] = useState<{ id: number; name: string } | null>(null);
  const [pharmacySettings] = useState<PharmacySettings>(getStoredPharmacySettings());

  const { setHeader } = useDashboardHeader();
  const currencySymbol = getSymbol(pharmacySettings.currency || 'USD');

  useEffect(() => {
    setHeader({
      title: 'Inventory Stocks',
    });
    return () => setHeader(null);
  }, [setHeader]);

  const loadStocks = useCallback(() => {
    if (!window?.electron) return;
    setIsLoading(true);
    
    window.electron.ipcRenderer.once('medicine-get-all-reply', (response: any) => {
      setIsLoading(false);
      if (response.success) {
        setMedicines(response.data);
      }
    });
    window.electron.ipcRenderer.sendMessage('medicine-get-all', []);
  }, []);

  useEffect(() => {
    loadStocks();
  }, [loadStocks]);

  const filteredStocks = useMemo(() => {
    return medicines.filter(med => {
      const matchesSearch = med.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           (med.brandName && med.brandName.toLowerCase().includes(searchTerm.toLowerCase())) ||
                           (med.manufacturer && med.manufacturer.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const isLow = med.totalAvailablePills <= med.minimumStockLevel && med.totalAvailablePills > 0;
      const isOut = med.totalAvailablePills === 0;

      if (statusFilter === 'low') return matchesSearch && isLow;
      if (statusFilter === 'out') return matchesSearch && isOut;
      return matchesSearch;
    });
  }, [medicines, searchTerm, statusFilter]);

  const stats = useMemo(() => {
    const totalItems = medicines.length;
    const lowStock = medicines.filter(m => m.totalAvailablePills <= m.minimumStockLevel && m.totalAvailablePills > 0).length;
    const outOfStock = medicines.filter(m => m.totalAvailablePills === 0).length;
    const totalPills = medicines.reduce((sum, m) => sum + m.totalAvailablePills, 0);
    
    return { totalItems, lowStock, outOfStock, totalPills };
  }, [medicines]);

  return (
    <div className="flex flex-col h-auto md:h-[calc(100vh-80px)] w-full bg-gray-50 dark:bg-gray-950 overflow-visible md:overflow-hidden px-4 pb-4 md:pb-0">
      
      {/* Stats — neutral chips; status shown with small accent dots only */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-3 mb-2 flex flex-wrap items-center gap-2">
        
        <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800/80 px-2.5 py-1.5 rounded-md border border-gray-200 dark:border-gray-600">
            <FiBox className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
            <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
              Total Items
            </span>
            <span className="text-xs font-bold text-gray-900 dark:text-gray-100 tabular-nums">
              {stats.totalItems}
            </span>
        </div>

        <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800/80 px-2.5 py-1.5 rounded-md border border-gray-200 dark:border-gray-600">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500" aria-hidden />
            <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
              Healthy
            </span>
            <span className="text-xs font-bold text-gray-900 dark:text-gray-100 tabular-nums">
              {stats.totalItems - stats.lowStock - stats.outOfStock}
            </span>
        </div>

        <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800/80 px-2.5 py-1.5 rounded-md border border-gray-200 dark:border-gray-600">
            <FiAlertTriangle className="w-3.5 h-3.5 text-gray-600 dark:text-gray-400" />
            <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
              Low Stock
            </span>
            <span className="text-xs font-bold text-gray-900 dark:text-gray-100 tabular-nums">
              {stats.lowStock}
            </span>
        </div>

        <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800/80 px-2.5 py-1.5 rounded-md border border-gray-200 dark:border-gray-600">
            <FiAlertCircle className="w-3.5 h-3.5 text-gray-600 dark:text-gray-400" />
            <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
              Out of Stock
            </span>
            <span className="text-xs font-bold text-gray-900 dark:text-gray-100 tabular-nums">
              {stats.outOfStock}
            </span>
        </div>

        <button
          onClick={loadStocks}
          className="ml-auto px-3 py-1.5 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-xs font-semibold rounded-md transition-colors uppercase tracking-wide flex items-center gap-1.5 shadow-sm"
        >
          <FiRefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Criteria & Search Section */}
      <div className="flex-shrink-0 mb-2">
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="p-3 flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1 w-full">
              <label className="block text-[10px] font-bold mb-1 uppercase tracking-wide text-gray-600 dark:text-gray-400">
                Search Inventory
              </label>
              <div className="relative">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Filter by name, brand, or manufacturer..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-gray-400 outline-none dark:text-white"
                />
              </div>
            </div>
            
            <div className="w-full sm:w-auto">
              <label className="block text-[10px] font-bold mb-1 uppercase tracking-wide text-gray-600 dark:text-gray-400">
                Stock Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="w-full sm:w-40 px-3 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-gray-400 outline-none dark:text-white"
              >
                <option value="all">All Stocks</option>
                <option value="low">Low Inventory</option>
                <option value="out">Out of Stock</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Table Section — bordered grid (readability) */}
      <div className="flex-1 flex flex-col overflow-visible md:overflow-hidden min-h-0">
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm flex-1 flex flex-col overflow-visible md:overflow-hidden min-h-0">
          
          {/* Grid Header Row */}
          <div className="grid grid-cols-12 gap-0 min-w-[880px] w-full items-center bg-gradient-to-r from-gray-50/90 to-gray-100/60 dark:from-gray-700/50 dark:to-gray-700/30 border-b-2 border-gray-300 dark:border-gray-500 text-[10px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide sticky top-0 z-10 [&>div]:border-r [&>div]:border-gray-200 dark:[&>div]:border-gray-600 [&>div:last-child]:border-r-0 [&>div]:px-2.5 [&>div]:py-2.5">
            <div className="col-span-1">ID</div>
            <div className="col-span-4">Medicine Details</div>
            <div className="col-span-2 text-center">Safety Margin</div>
            <div className="col-span-2 text-right">Available Pills</div>
            <div className="col-span-2 text-right">Min. Level</div>
            <div className="col-span-1 text-center">Details</div>
          </div>

          {/* Grid Body */}
          <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto overscroll-contain border-x border-b border-gray-200/90 dark:border-gray-600/90 rounded-b-lg">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                <FiRefreshCw className="w-8 h-8 animate-spin mb-2 text-gray-400" />
                <p className="text-xs">Analyzing stocks...</p>
              </div>
            ) : filteredStocks.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 text-sm">
                No matching medicines found.
              </div>
            ) : (
              (selectedMedicineForDetails 
                ? filteredStocks.filter(med => med.id === selectedMedicineForDetails.id) 
                : filteredStocks
              ).map((med, rowIndex) => {
                const isOutOfStock = med.totalAvailablePills === 0;
                const isLowStock = !isOutOfStock && med.totalAvailablePills <= med.minimumStockLevel;
                const safetyMargin = Math.min(100, (med.totalAvailablePills / (med.minimumStockLevel || 100)) * 50);

                return (
                  <React.Fragment key={med.id}>
                    <div
                      className={`grid grid-cols-12 gap-0 min-w-[880px] w-full items-center text-[10px] border-b border-gray-200 dark:border-gray-600 [&>div]:border-r [&>div]:border-gray-200 dark:[&>div]:border-gray-600 [&>div:last-child]:border-r-0 [&>div]:px-2.5 [&>div]:py-2 ${
                        selectedMedicineForDetails?.id === med.id
                          ? 'bg-gray-100 dark:bg-gray-700/40 border-gray-300 dark:border-gray-500'
                          : rowIndex % 2 === 0
                            ? 'bg-white dark:bg-gray-800/30 hover:bg-gray-100/90 dark:hover:bg-gray-700/35'
                            : 'bg-gray-50/95 dark:bg-gray-800/55 hover:bg-gray-100/90 dark:hover:bg-gray-700/40'
                      } transition-colors`}
                    >
                      <div className="col-span-1 text-gray-400 dark:text-gray-600 font-bold tabular-nums">#{med.id}</div>
                    
                    <div className="col-span-4 min-w-0 py-1">
                      <div className="font-bold text-gray-900 dark:text-white uppercase truncate">{med.name}</div>
                      <div className="text-[9px] text-gray-400 dark:text-gray-500 font-medium">
                        {med.brandName || 'Generic'} • {med.manufacturer || 'Unknown Mfr'}
                      </div>
                    </div>

                    <div className="col-span-2 flex flex-col items-center justify-center gap-0.5 px-1 sm:px-2 py-1">
                      <div className="w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${isOutOfStock ? 'bg-red-700/85' : isLowStock ? 'bg-amber-600/85' : 'bg-gray-600 dark:bg-gray-400'}`}
                          style={{ width: `${safetyMargin}%` }}
                        />
                      </div>
                      <span className={`text-[8px] mt-1 font-bold uppercase tracking-tight ${isOutOfStock ? 'text-red-800 dark:text-red-300' : isLowStock ? 'text-amber-900 dark:text-amber-200' : 'text-gray-600 dark:text-gray-400'}`}>
                        {isOutOfStock ? 'Critical' : isLowStock ? 'Low' : 'Healthy'}
                      </span>
                    </div>

                    <div className="col-span-2 flex justify-end items-center">
                      <span className={`text-xs font-bold tabular-nums ${isOutOfStock ? 'text-red-800 dark:text-red-300' : isLowStock ? 'text-amber-900 dark:text-amber-100' : 'text-gray-900 dark:text-white'}`}>
                        {(med.totalAvailablePills || 0).toLocaleString()}
                      </span>
                    </div>

                    <div className="col-span-2 flex justify-end items-center font-medium text-gray-500 dark:text-gray-400 tabular-nums">
                      {(med.minimumStockLevel || 0).toLocaleString()}
                    </div>

                    <div className="col-span-1 flex justify-center items-center font-medium text-gray-500">
                       <button
                         onClick={() => setSelectedMedicineForDetails(selectedMedicineForDetails?.id === med.id ? null : { id: med.id, name: med.name })}
                          className={`px-2.5 py-1 text-[10px] font-semibold uppercase rounded border transition-colors ${selectedMedicineForDetails?.id === med.id ? 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white border-gray-300 dark:border-gray-500 hover:bg-gray-300 dark:hover:bg-gray-500' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                         title={selectedMedicineForDetails?.id === med.id ? "Close Batch Details" : "View Batch Details"}
                       >
                         {selectedMedicineForDetails?.id === med.id ? "Close" : "View"}
                       </button>
                    </div>
                  </div>
                  
                  {/* Expanded Row for Inline Details */}
                  {selectedMedicineForDetails?.id === med.id && (
                    <div className="min-w-[880px] border-b border-x-0 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 animate-in slide-in-from-top-1 fade-in duration-200">
                      <MedicineInventoryDetails
                        medicineId={selectedMedicineForDetails.id}
                        medicineName={selectedMedicineForDetails.name}
                        currencySymbol={currencySymbol}
                        inline={true}
                      />
                    </div>
                  )}
                </React.Fragment>
              );
            })
            )}
          </div>
          
          {/* Table Footer Stats */}
          {!isLoading && filteredStocks.length > 0 && (
            <div className="px-4 py-2.5 bg-gray-50/90 dark:bg-gray-700/40 border-t-2 border-gray-200 dark:border-gray-600 flex justify-between items-center text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              <span>Showing {filteredStocks.length} of {medicines.length} medicines</span>
              <div className="flex gap-4">
                 <span>Total Pooled Units: {(stats.totalPills || 0).toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Background modales removed in favor of Inline expansion */}
    </div>
  );
};

export default Stocks;
