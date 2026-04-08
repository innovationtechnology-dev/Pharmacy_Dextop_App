'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  FiPackage, 
  FiSearch, 
  FiAlertCircle, 
  FiRefreshCw, 
  FiFilter,
  FiEye,
  FiBox,
  FiCheckCircle,
  FiTrendingUp,
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
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'low' | 'out'>('all');
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
    <div className="flex flex-col h-auto md:h-[calc(100vh-80px)] w-full bg-gradient-to-br from-gray-50 via-gray-50 to-gray-100/50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800/80 overflow-visible md:overflow-hidden px-4 pb-4 md:pb-0">
      
      {/* Stats Header Row */}
      <div className="bg-gradient-to-br from-white via-white to-gray-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-gray-800/90 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-3 mb-2 flex flex-wrap items-center gap-3">
        
        {/* Total Items */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1.5 rounded-md border border-blue-200 dark:border-blue-700/50 shadow-sm">
            <FiBox className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              Total Items
            </span>
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 ml-1">
              {stats.totalItems}
            </span>
          </div>
        </div>

        {/* Healthy Stock */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1.5 rounded-md border border-emerald-200 dark:border-emerald-700/50 shadow-sm">
            <FiCheckCircle className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              Healthy
            </span>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 ml-1">
              {stats.totalItems - stats.lowStock - stats.outOfStock}
            </span>
          </div>
        </div>

        {/* Low Stock */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-orange-50 dark:bg-orange-900/20 px-2.5 py-1.5 rounded-md border border-orange-200 dark:border-orange-700/50 shadow-sm">
            <FiAlertTriangle className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              Low Stock
            </span>
            <span className="text-xs font-bold text-orange-600 dark:text-orange-400 ml-1">
              {stats.lowStock}
            </span>
          </div>
        </div>

        {/* Out of Stock */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-900/20 px-2.5 py-1.5 rounded-md border border-red-200 dark:border-red-700/50 shadow-sm">
            <FiAlertCircle className="w-3.5 h-3.5 text-red-500" />
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              Out of Stock
            </span>
            <span className="text-xs font-bold text-red-600 dark:text-red-400 ml-1">
              {stats.outOfStock}
            </span>
          </div>
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
        <div className="bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md">
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
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-emerald-500 outline-none dark:text-white"
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
                className="w-full sm:w-40 px-3 py-1.5 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-emerald-500 outline-none dark:text-white"
              >
                <option value="all">All Stocks</option>
                <option value="low">Low Inventory</option>
                <option value="out">Out of Stock</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div className="flex-1 flex flex-col overflow-visible md:overflow-hidden min-h-0">
        <div className="bg-gradient-to-br from-white via-white to-blue-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-md flex-1 flex flex-col overflow-visible md:overflow-hidden">
          
          {/* Grid Header Row */}
          <div className="grid grid-cols-12 gap-3 px-3 py-2 bg-gray-50/50 dark:bg-gray-700/30 border-b border-gray-100 dark:border-gray-700 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            <div className="col-span-1">ID</div>
            <div className="col-span-4">Medicine Details</div>
            <div className="col-span-2 text-center">Safety Margin</div>
            <div className="col-span-2 text-right">Available Pills</div>
            <div className="col-span-2 text-right">Min. Level</div>
            <div className="col-span-1 text-center">Details</div>
          </div>

          {/* Grid Body */}
          <div className="flex-1 overflow-visible md:overflow-y-auto">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                <FiRefreshCw className="w-8 h-8 animate-spin mb-2 text-emerald-500" />
                <p className="text-xs">Analyzing stocks...</p>
              </div>
            ) : filteredStocks.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 text-sm">
                No matching medicines found.
              </div>
            ) : (
              filteredStocks.map((med) => {
                const isOutOfStock = med.totalAvailablePills === 0;
                const isLowStock = !isOutOfStock && med.totalAvailablePills <= med.minimumStockLevel;
                const safetyMargin = Math.min(100, (med.totalAvailablePills / (med.minimumStockLevel || 100)) * 50);

                return (
                  <div key={med.id} className="grid grid-cols-12 gap-3 px-3 py-2 text-[10px] items-center border-b border-gray-50 dark:border-gray-800 hover:bg-emerald-50/20 dark:hover:bg-emerald-900/5 transition-all">
                    <div className="col-span-1 text-gray-400 dark:text-gray-600 font-bold">#{med.id}</div>
                    
                    <div className="col-span-4">
                      <div className="font-bold text-gray-900 dark:text-white uppercase truncate">{med.name}</div>
                      <div className="text-[9px] text-gray-400 dark:text-gray-500 font-medium">
                        {med.brandName || 'Generic'} • {med.manufacturer || 'Unknown Mfr'}
                      </div>
                    </div>

                    <div className="col-span-2 flex flex-col items-center px-4">
                      <div className="w-full h-1 bg-gray-100 dark:bg-gray-900 rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${isOutOfStock ? 'bg-red-500' : isLowStock ? 'bg-orange-500' : 'bg-emerald-500'}`}
                          style={{ width: `${safetyMargin}%` }}
                        />
                      </div>
                      <span className={`text-[8px] mt-1 font-black uppercase tracking-tighter ${isOutOfStock ? 'text-red-500' : isLowStock ? 'text-orange-500' : 'text-emerald-500'}`}>
                        {isOutOfStock ? 'Crticial' : isLowStock ? 'Low' : 'Healthy'}
                      </span>
                    </div>

                    <div className="col-span-2 text-right">
                      <span className={`text-xs font-black tabular-nums ${isOutOfStock ? 'text-red-500' : isLowStock ? 'text-orange-500' : 'text-gray-900 dark:text-white'}`}>
                        {(med.totalAvailablePills || 0).toLocaleString()}
                      </span>
                    </div>

                    <div className="col-span-2 text-right font-medium text-gray-500 dark:text-gray-400">
                      {(med.minimumStockLevel || 0).toLocaleString()}
                    </div>

                    <div className="col-span-1 text-center font-medium text-gray-500">
                       <button
                         onClick={() => setSelectedMedicineForDetails({ id: med.id, name: med.name })}
                         className="p-1.5 bg-blue-500 dark:bg-blue-900 text-white rounded hover:bg-blue-600 dark:hover:bg-blue-800 transition-colors shadow-sm"
                         title="View Batch Details"
                       >
                         <FiEye className="w-3.5 h-3.5" />
                       </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          
          {/* Table Footer Stats */}
          {!isLoading && filteredStocks.length > 0 && (
            <div className="px-4 py-2 bg-gray-50/50 dark:bg-gray-700/30 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              <span>Showing {filteredStocks.length} of {medicines.length} medicines</span>
              <div className="flex gap-4">
                 <span>Total Pooled Units: {(stats.totalPills || 0).toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Batch Details Modal */}
      {selectedMedicineForDetails && (
        <MedicineInventoryDetails
          medicineId={selectedMedicineForDetails.id}
          medicineName={selectedMedicineForDetails.name}
          currencySymbol={currencySymbol}
          onClose={() => setSelectedMedicineForDetails(null)}
        />
      )}
    </div>
  );
};

export default Stocks;
