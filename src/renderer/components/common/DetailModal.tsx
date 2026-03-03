import React from 'react';
import { FiX } from 'react-icons/fi';
import { IconType } from 'react-icons';

interface ReportDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon: IconType;
  colorTheme: 'emerald' | 'blue' | 'orange' | 'purple';
  headerBadges: Array<{
    label: string;
    value: string;
    isItalic?: boolean;
  }>;
  infoCards: Array<{
    title: string;
    value: string;
    icon: IconType;
    theme: 'emerald' | 'blue' | 'orange' | 'purple';
    badge?: {
      label: string;
      color: string;
    };
  }>;
  tableTitle: string;
  tableItemsCount: number;
  tableHeaders: string[];
  items: any[];
  renderTableRow: (item: any, idx: number) => React.ReactNode;
  remarks: {
    title: string;
    content: React.ReactNode;
  };
  summaryItems: Array<{
    label: string;
    value: string | number;
    type?: 'discount' | 'tax' | 'total' | 'normal';
  }>;
  footerStatus: {
    label: string;
    color: string;
  };
  children?: React.ReactNode; // For extra sections like payment progress
}

const ReportDetailModal: React.FC<ReportDetailModalProps> = ({
  isOpen,
  onClose,
  title,
  icon: Icon,
  colorTheme,
  headerBadges,
  infoCards,
  tableTitle,
  tableItemsCount,
  tableHeaders,
  items,
  renderTableRow,
  remarks,
  summaryItems,
  footerStatus,
  children
}) => {
  if (!isOpen) return null;

  const themes = {
    emerald: 'from-emerald-500/10 via-emerald-500/5 to-transparent text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 dark:bg-emerald-500/20 border-emerald-500/20',
    blue: 'from-blue-500/10 via-blue-500/5 to-transparent text-blue-600 dark:text-blue-400 bg-blue-500/10 dark:bg-blue-500/20 border-blue-500/20',
    orange: 'from-orange-500/10 via-orange-500/5 to-transparent text-orange-600 dark:text-orange-400 bg-orange-500/10 dark:bg-orange-500/20 border-orange-500/20',
    purple: 'from-purple-500/10 via-purple-500/5 to-transparent text-purple-600 dark:text-purple-400 bg-purple-500/10 dark:bg-purple-500/20 border-purple-500/20',
  };

  const cardThemes = {
    emerald: 'bg-emerald-50/20 dark:bg-emerald-500/5 border-emerald-100/50 dark:border-emerald-500/10 text-emerald-600/60 dark:text-emerald-400/50',
    blue: 'bg-blue-50/20 dark:bg-blue-500/5 border-blue-100/50 dark:border-blue-500/10 text-blue-600/60 dark:text-blue-400/50',
    orange: 'bg-orange-50/20 dark:bg-orange-500/5 border-orange-100/50 dark:border-orange-500/10 text-orange-600/60 dark:text-orange-400/50',
    purple: 'bg-purple-50/20 dark:bg-purple-500/5 border-purple-100/50 dark:border-purple-500/10 text-purple-600/60 dark:text-purple-400/50',
  };

  const iconThemes = {
    emerald: 'text-emerald-600 dark:text-emerald-400 border-emerald-50 dark:border-gray-700',
    blue: 'text-blue-600 dark:text-blue-400 border-blue-50 dark:border-gray-700',
    orange: 'text-orange-600 dark:text-orange-400 border-orange-50 dark:border-gray-700',
    purple: 'text-purple-600 dark:text-purple-400 border-purple-50 dark:border-gray-700',
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div 
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300 border border-gray-200 dark:border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className={`px-6 py-4 bg-gradient-to-r ${themes[colorTheme]} border-b border-gray-100 dark:border-gray-700/50 flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl border ${themes[colorTheme].split(' ').slice(2).join(' ')}`}>
              <Icon size={16} />
            </div>
            <div>
              <h2 className="text-base font-medium text-gray-800 dark:text-gray-100 tracking-tight">{title}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                {headerBadges.map((badge, idx) => (
                  <React.Fragment key={idx}>
                    {idx > 0 && <span className="w-0.5 h-0.5 rounded-full bg-gray-300 dark:bg-gray-600"></span>}
                    <span className={`text-[9px] font-medium uppercase tracking-wider ${idx === 0 ? 'px-1 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded' : 'text-[10px] text-gray-500 dark:text-gray-400 font-normal ' + (badge.isItalic ? 'italic' : '')}`}>
                      {badge.label}: {badge.value}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all duration-200 border border-gray-100 dark:border-gray-700"
            title="Close"
          >
            <FiX className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700">
          {/* Info Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
            {infoCards.map((card, idx) => {
              const CardIcon = card.icon;
              return (
                <div key={idx} className={`${cardThemes[card.theme]} p-4 rounded-xl border shadow-sm transition-all hover:shadow-md h-full`}>
                  <div className="flex items-center gap-3 h-full">
                    <div className={`p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm border ${iconThemes[card.theme]}`}>
                      <CardIcon size={16} />
                    </div>
                    <div className="flex-1">
                      <div className={`text-[9px] font-medium uppercase tracking-widest mb-0.5 ${cardThemes[card.theme].split(' ').slice(-1)}`}>
                        {card.title}
                      </div>
                      <div className="flex items-center justify-between gap-1">
                        <div className="text-xs font-medium text-gray-800 dark:text-white leading-tight">
                          {card.value}
                        </div>
                        {card.badge && (
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-medium uppercase tracking-wider ${card.badge.color}`}>
                            {card.badge.label}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Table Section */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4 px-1">
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-4 rounded-full ${colorTheme === 'orange' ? 'bg-orange-500' : 'bg-emerald-500'}`}></div>
                <h3 className="text-[11px] font-medium text-gray-700 dark:text-gray-200 uppercase tracking-wider">{tableTitle}</h3>
              </div>
              <div className="text-[9px] font-medium text-gray-400 uppercase tracking-widest">
                Items: <span className="text-gray-600 dark:text-gray-300 italic">{tableItemsCount}</span>
              </div>
            </div>
            
            <div className="bg-white dark:bg-gray-900/20 rounded-xl border border-gray-100 dark:border-gray-700/50 overflow-hidden shadow-sm">
              <div className="grid grid-cols-12 gap-3 px-5 py-3 bg-gray-50/50 dark:bg-gray-800/50 text-[9px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-widest border-b border-gray-100 dark:border-gray-700">
                {tableHeaders.map((header, idx) => {
                  let alignmentClass = 'text-center';
                  let colSpanClass = 'col-span-2';
                  const headerText = header.toLowerCase();

                  if (headerText === '#') {
                    colSpanClass = 'col-span-1';
                  } else if (headerText.includes('name') || headerText.includes('product') || headerText.includes('medicine')) {
                    colSpanClass = 'col-span-5';
                    // Check if we need to make it smaller to accommodate other columns like 'Pack'
                    if (tableHeaders.length > 5) {
                      const hasPack = tableHeaders.some(h => h.toLowerCase().includes('pack'));
                      if (hasPack) colSpanClass = 'col-span-4';
                    }
                    alignmentClass = 'text-left';
                  } else if (headerText.includes('qty')) {
                    colSpanClass = 'col-span-1';
                    alignmentClass = 'text-right';
                  } else if (headerText.includes('price')) {
                    alignmentClass = 'text-right';
                    colSpanClass = 'col-span-2';
                  } else if (headerText.includes('disc')) {
                    alignmentClass = 'text-right';
                    colSpanClass = 'col-span-1';
                  } else if (headerText.includes('total') || headerText.includes('subtotal')) {
                    alignmentClass = 'text-right';
                    colSpanClass = 'col-span-2';
                  } else if (headerText.includes('pack')) {
                    colSpanClass = 'col-span-2';
                    alignmentClass = 'text-center';
                  }

                  return (
                    <div key={idx} className={`${colSpanClass} ${alignmentClass}`}>
                      {header}
                    </div>
                  );
                })}
              </div>
              <div className="divide-y divide-gray-50 dark:divide-gray-800/50">
                {items.map((item, idx) => renderTableRow(item, idx))}
              </div>
            </div>
          </div>

          {/* Summary Section */}
          <div className="flex flex-col lg:flex-row justify-between items-start gap-8">
            {/* Remarks Left side */}
            <div className="bg-gray-50/30 dark:bg-gray-900/20 p-5 rounded-xl border border-dashed border-gray-200 dark:border-gray-700/50 flex-1">
              <h4 className="text-[9px] font-medium text-gray-400 uppercase tracking-widest mb-2">{remarks.title}</h4>
              <div className="text-[10px] leading-relaxed text-gray-500 dark:text-gray-400">
                {remarks.content}
              </div>
            </div>

            {/* Totals Right side */}
            <div className="w-full lg:w-[320px] space-y-3">
              <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm space-y-3">
                {summaryItems.map((item, idx) => {
                  if (item.type === 'total') {
                    const themeColor = colorTheme === 'orange' ? 'emerald' : colorTheme; // Totals are usually emerald in your code
                    const finalTheme = colorTheme === 'orange' ? 'orange' : 'emerald';
                    
                    return (
                      <React.Fragment key={idx}>
                        <div className="h-px bg-gray-50 dark:bg-gray-700 my-1"></div>
                        <div className={`flex justify-between items-center py-2 px-3 rounded-xl ${finalTheme === 'orange' ? 'bg-orange-500/5 dark:bg-orange-500/10 border-orange-500/10' : 'bg-emerald-500/5 dark:bg-emerald-500/10 border-emerald-500/10'} border`}>
                          <div>
                            <div className={`text-[9px] font-medium uppercase tracking-wider leading-none ${finalTheme === 'orange' ? 'text-orange-600 dark:text-orange-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{item.label}</div>
                          </div>
                          <div className={`text-lg font-medium tracking-tight ${finalTheme === 'orange' ? 'text-orange-600 dark:text-orange-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            {item.value}
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  }
                  
                  return (
                    <div key={idx} className="flex justify-between items-center px-1">
                      {item.type === 'discount' ? (
                        <div className="flex items-center gap-1.5 py-0.5 px-2 bg-red-50 dark:bg-red-500/5 rounded-full">
                          <span className="text-[8px] font-medium text-red-500 uppercase tracking-tighter">{item.label}</span>
                        </div>
                      ) : item.type === 'tax' ? (
                        <div className="flex items-center gap-1.5 py-0.5 px-2 bg-blue-50 dark:bg-blue-500/5 rounded-full">
                          <span className="text-[8px] font-medium text-blue-500 uppercase tracking-tighter">{item.label}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] font-normal text-gray-400 uppercase tracking-wider">{item.label}</span>
                      )}
                      <span className={`text-xs font-medium ${item.type === 'discount' ? 'text-red-500' : item.type === 'tax' ? 'text-blue-500' : 'text-gray-600 dark:text-gray-300'}`}>
                        {item.type === 'discount' ? `-${item.value}` : item.type === 'tax' ? `+${item.value}` : item.value}
                      </span>
                    </div>
                  );
                })}
              </div>
              {children}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-8 py-5 bg-gray-50/50 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-700/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
             <div className={`w-1.5 h-1.5 rounded-full ${footerStatus.color.includes('blue') ? 'bg-blue-400/40' : footerStatus.color.includes('emerald') ? 'bg-emerald-400/40' : 'bg-orange-400/40'}`}></div>
             <span className="text-[9px] font-medium text-gray-400 uppercase tracking-widest">{footerStatus.label}</span>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={onClose}
              className="px-6 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-[10px] font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all active:scale-95 uppercase tracking-widest"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportDetailModal;
