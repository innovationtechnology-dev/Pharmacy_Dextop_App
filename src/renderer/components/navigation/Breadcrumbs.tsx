import React from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { FiChevronRight, FiHome, FiArrowLeft } from 'react-icons/fi';

interface BreadcrumbItem {
  label: string;
  path: string;
}

const ROUTE_LABELS: { [key: string]: string } = {
  '/main-menu': 'Main Menu',
  '/dashboard': 'Dashboard',
  '/medicines': 'Medicines',
  '/customers': 'Customers',
  '/products': 'Products',
  '/purchasing-panel': 'Purchasing',
  '/purchase-return': 'Purchase Return',
  '/selling-panel': 'Selling Panel',
  '/sale-return': 'Sale Return',
  '/suppliers': 'Suppliers',
  '/payments': 'Payments',
  '/alerts': 'Alerts',
  '/financial-summary': 'Financial Summary',
  '/purchase-report': 'Purchase Report',
  '/sales': 'Sales Report',
  '/stock-report': 'Stock Report',
  '/customer-balance': 'Customer Balance',
  '/settings': 'Settings',
};

const Breadcrumbs: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const generateBreadcrumbs = (): BreadcrumbItem[] => {
    const paths = location.pathname.split('/').filter(Boolean);
    const breadcrumbs: BreadcrumbItem[] = [
      { label: 'Home', path: '/main-menu' },
    ];

    let currentPath = '';
    paths.forEach((path) => {
      currentPath += `/${path}`;
      const label = ROUTE_LABELS[currentPath] || path.charAt(0).toUpperCase() + path.slice(1).replace(/-/g, ' ');
      breadcrumbs.push({ label, path: currentPath });
    });

    return breadcrumbs;
  };

  const breadcrumbs = generateBreadcrumbs();

  // Don't show breadcrumbs on main menu
  if (location.pathname === '/main-menu' || location.pathname === '/') {
    return null;
  }

  return (
    <nav className="flex items-center gap-2 text-sm mb-4" aria-label="Breadcrumb">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-200 hover:shadow-sm group"
        title="Go back"
      >
        <FiArrowLeft className="w-4 h-4 text-gray-600 dark:text-gray-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors" />
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
          Back
        </span>
      </button>

      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;
          
          return (
            <React.Fragment key={crumb.path}>
              {index === 0 ? (
                <Link
                  to={crumb.path}
                  className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                >
                  <FiHome className="w-3.5 h-3.5" />
                </Link>
              ) : (
                <Link
                  to={crumb.path}
                  className={`text-xs font-medium transition-colors ${
                    isLast
                      ? 'text-gray-900 dark:text-white font-semibold'
                      : 'text-gray-600 dark:text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400'
                  }`}
                >
                  {crumb.label}
                </Link>
              )}
              {!isLast && (
                <FiChevronRight className="w-3 h-3 text-gray-400 dark:text-gray-500 mx-1" />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </nav>
  );
};

export default Breadcrumbs;

