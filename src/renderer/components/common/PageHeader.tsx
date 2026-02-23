import React from 'react';
import { Link } from 'react-router-dom';
import { FiHome, FiChevronLeft } from 'react-icons/fi';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  showBackButton?: boolean;
  backTo?: string;
  actions?: React.ReactNode;
  compact?: boolean;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  showBackButton = true,
  backTo = '/main-menu',
  actions,
  compact = false,
}) => {
  return (
    <div className={`flex items-center justify-between ${compact ? 'gap-3' : 'gap-4'}`}>
      {/* Left Section: Back Button + Title */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {showBackButton && (
          <Link
            to={backTo}
            className="flex-shrink-0 group relative p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-emerald-400 dark:hover:border-emerald-500 hover:shadow-md transition-all duration-200"
            title="Back to Main Menu"
          >
            <div className="relative">
              <FiHome className="w-4 h-4 text-gray-600 dark:text-gray-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors" />
              <FiChevronLeft className="w-3 h-3 text-emerald-600 dark:text-emerald-400 absolute -left-1 top-0 opacity-0 group-hover:opacity-100 group-hover:-translate-x-0.5 transition-all duration-200" />
            </div>
          </Link>
        )}

        {/* Title Section */}
        <div className="flex-1 min-w-0">
          <h1 className={`font-bold text-gray-900 dark:text-white truncate ${
            compact ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl'
          }`}>
            {title}
          </h1>
          {subtitle && !compact && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Right Section: Actions */}
      {actions && (
        <div className="flex-shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
};
