/* eslint-disable react/button-has-type */
'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate, Outlet, Link, useLocation } from 'react-router-dom';
import {
  FiBell,
  FiChevronDown,
  FiHelpCircle,
  FiLogOut,
} from 'react-icons/fi';
import { getAuthUser, getAuthToken, logout as authLogout } from '../utils/auth';
import {
  DashboardHeaderConfig,
  DashboardHeaderContextValue,
  ExpiringAlert,
} from './dashboard-pages/useDashboardHeader';
import Breadcrumbs from '../components/navigation/Breadcrumbs';
import Loader from '../components/Loader';
import LicenseOverlay from '../components/license/LicenseOverlay';
import { PageHeader } from '../components/common/PageHeader';

const ALERT_THRESHOLD_DAYS = 30;

const Dashboard_Layout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [customHeader, setCustomHeader] =
    useState<DashboardHeaderConfig | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const [pageTitle, setPageTitle] = useState('Dashboard');
  const [expiringAlerts, setExpiringAlerts] = useState<ExpiringAlert[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationMenuRef = useRef<HTMLDivElement | null>(null);

  const ROUTE_TITLES: { [key: string]: string } = {
    '/main-menu': 'Main Menu',
    '/dashboard': 'Dashboard',
    '/medicines': 'Medicine Management',
    '/selling-panel': 'Selling Panel',
    '/purchasing-panel': 'Purchasing Panel',
    '/suppliers': 'Suppliers',
    '/customers': 'Customers',
    '/sale-return': 'Sale Return',
    '/sales': 'Sales Analytics',
    '/purchases': 'Purchase Records',
    '/alerts': 'Alerts Center',
    '/payments': 'Payments',
    '/financial-summary': 'Financial Summary',
    '/license': 'License Management',
    '/settings': 'Settings',
  };

  // Update the useEffect to properly match routes
  useEffect(() => {
    const pathname = location.pathname;

    // First try exact pathname match
    let title = ROUTE_TITLES[pathname];

    // If no exact match, try to extract the base path
    if (!title) {
      const pathSegments = pathname.split('/').filter(Boolean);
      if (pathSegments.length > 0) {
        const basePath = `/${pathSegments[0]}`;
        title = ROUTE_TITLES[basePath];
      }
    }

    // Fallback to Dashboard if still no match
    const finalTitle = title || 'Dashboard';

    // Always update pageTitle to ensure it's set
    if (finalTitle) {
      setPageTitle(finalTitle);
    }
  }, [location.pathname]);

  useEffect(() => {
    const authUser = getAuthUser();
    const authToken = getAuthToken();
    if (!authUser || !authToken) {
      navigate('/login');
      return;
    }

    setUser(authUser);
    setToken(authToken);

    // Route Guarding for Cashier
    const prohibitedRoutes = ['/settings', '/dashboard', '/payments', '/financial-summary'];
    if (authUser.role === 'cashier' && prohibitedRoutes.some(route => location.pathname.startsWith(route))) {
      navigate('/main-menu');
    }
  }, [navigate, location.pathname]);

  const handleLogout = () => {
    authLogout();
    navigate('/login');
  };

  const fetchExpiringAlerts = useCallback(() => {
    if (!window?.electron) {
      return;
    }

    window.electron.ipcRenderer.once(
      'medicine-get-expiring-reply',
      (response: any) => {
        if (response?.success) {
          setExpiringAlerts(response.data || []);
        } else {
          console.error('Unable to load expiring medicines', response?.error);
        }
      }
    );
    window.electron.ipcRenderer.sendMessage('medicine-get-expiring', [
      ALERT_THRESHOLD_DAYS,
    ]);
  }, []);

  useEffect(() => {
    fetchExpiringAlerts();
    const interval = setInterval(fetchExpiringAlerts, 60000);
    return () => clearInterval(interval);
  }, [fetchExpiringAlerts]);

  const setHeaderConfig = useCallback<DashboardHeaderContextValue['setHeader']>(
    (config) => {
      setCustomHeader(config);
    },
    []
  );

  useEffect(() => {
    setProfileMenuOpen(false);
    setNotificationsOpen(false);
  }, [location.pathname]);

  const outletContextValue = useMemo<DashboardHeaderContextValue>(
    () => ({
      setHeader: setHeaderConfig,
      expiringAlerts,
      refreshExpiringAlerts: fetchExpiringAlerts,
      alertThresholdDays: ALERT_THRESHOLD_DAYS,
    }),
    [setHeaderConfig, expiringAlerts, fetchExpiringAlerts]
  );

  const expiringAlertCount = expiringAlerts.length;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target as Node)
      ) {
        setProfileMenuOpen(false);
      }
      if (
        notificationMenuRef.current &&
        !notificationMenuRef.current.contains(event.target as Node)
      ) {
        setNotificationsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  if (!user || !token) {
    return <Loader />;
  }

  return (
    <LicenseOverlay>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 text-gray-800 dark:text-gray-100">
        {/* Scrollable Main Content */}
        <main
          className={`min-h-screen ${location.pathname.includes('/selling-panel') ||
            location.pathname.includes('/purchasing-panel') ||
            location.pathname.includes('/suppliers') ||
            location.pathname.includes('/customers') ||
            location.pathname.includes('/medicines') ||
            location.pathname.includes('/settings') ||
            location.pathname.includes('/license') ||
            location.pathname.includes('/payment') ||
            location.pathname.includes('/sales') ||
            location.pathname.includes('/purchases') ||
            location.pathname.includes('/sale-return') ||
            location.pathname.includes('/financial-summary') ||
            location.pathname.includes('/alerts') ||
            location.pathname.includes('/dashboard')


            ? 'overflow-hidden'
            : 'overflow-auto'
            }`}
        >
          <div
            className={
              location.pathname.includes('/main-menu') ||
                location.pathname.includes('/selling-panel') ||
                location.pathname.includes('/purchasing-panel') ||
                location.pathname.includes('/suppliers') ||
                location.pathname.includes('/customers') ||
                location.pathname.includes('/medicines') ||
                location.pathname.includes('/sales') ||
                location.pathname.includes('/purchases') ||
                location.pathname.includes('/settings') ||
                location.pathname.includes('/license') ||
                location.pathname.includes('/payment') ||
                location.pathname.includes('/purchases') ||
                location.pathname.includes('/alerts') ||
                location.pathname.includes('/sale-return') ||
                location.pathname.includes('/financial-summary') ||
                location.pathname.includes('/dashboard')
                ? 'p-0'
                : 'p-6 md:p-8'
            }
          >
            { }
            {!location.pathname.includes('/main-menu') && (
              <header
                className={`sticky top-0 z-30 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-700/50 shadow-sm ${location.pathname.includes('/selling-panel') ||
                  location.pathname.includes('/purchasing-panel') ||
                  location.pathname.includes('/suppliers') ||
                  location.pathname.includes('/suppliers') ||
                  location.pathname.includes('/medicines') ||
                  location.pathname.includes('/medicines') ||
                  location.pathname.includes('/customers') ||
                  location.pathname.includes('/sales') ||
                  location.pathname.includes('/purchases') ||
                  location.pathname.includes('/settings') ||
                  location.pathname.includes('/license') ||
                  location.pathname.includes('/payment') ||
                  location.pathname.includes('/purchases') ||
                  location.pathname.includes('/alerts') ||
                  location.pathname.includes('/sale-return') ||
                  location.pathname.includes('/financial-summary') ||
                  location.pathname.includes('/dashboard')

                  ? 'py-2 mb-1'
                  : 'py-4 mb-2'
                  }`}
              >

                <div
                  className={`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between ${location.pathname.includes('/selling-panel') || location.pathname.includes('/purchasing-panel') || location.pathname.includes('/customers') ? 'gap-2' : ''
                    }`}
                >
                  { }
                  {!location.pathname.includes('/selling-panel') &&
                    !location.pathname.includes('/purchasing-panel') &&
                    !location.pathname.includes('/suppliers') &&
                    !location.pathname.includes('/customers') &&
                    !location.pathname.includes('/medicines') &&
                    !location.pathname.includes('/sales') &&
                    !location.pathname.includes('/purchases') &&
                    !location.pathname.includes('/settings') &&
                    !location.pathname.includes('/license') &&
                    !location.pathname.includes('/payment') &&
                    !location.pathname.includes('/alerts') &&
                    !location.pathname.includes('/financial-summary') &&
                    !location.pathname.includes('/sale-return') &&
                    !location.pathname.includes('/dashboard') &&
                    (
                      <PageHeader
                        title={pageTitle || customHeader?.title || 'Dashboard'}
                        subtitle={customHeader?.subtitle}
                        actions={customHeader?.actions}
                      />
                    )}

                  {/* Compact header for selling-panel */}
                  {location.pathname.includes('/selling-panel') && (
                    <div className="ml-3 flex-1">
                      <PageHeader
                        title={pageTitle || customHeader?.title || 'Selling Panel'}
                        subtitle={customHeader?.subtitle}
                        actions={customHeader?.actions}
                        compact
                      />
                    </div>
                  )}

                  {/* Compact header for purchasing-panel */}
                  {location.pathname.includes('/purchasing-panel') && (
                    <div className="ml-3 flex-1">
                      <PageHeader
                        title={pageTitle || customHeader?.title || 'Purchasing Panel'}
                        subtitle={customHeader?.subtitle}
                        actions={customHeader?.actions}
                        compact
                      />
                    </div>
                  )}

                  {/* Compact header for suppliers */}
                  {location.pathname.includes('/suppliers') && (
                    <div className="ml-3 flex-1">
                      <PageHeader
                        title={pageTitle || customHeader?.title || 'Supplier Management'}
                        subtitle={customHeader?.subtitle}
                        actions={customHeader?.actions}
                        compact
                      />
                    </div>
                  )}

                  {/* Compact header for customers */}
                  {location.pathname.includes('/customers') && (
                    <div className="ml-3 flex-1">
                      <PageHeader
                        title={pageTitle || customHeader?.title || 'Customer Management'}
                        subtitle={customHeader?.subtitle}
                        actions={customHeader?.actions}
                        compact
                      />
                    </div>
                  )}

                  {/* Compact header for medicines */}
                  {location.pathname.includes('/medicines') && (
                    <div className="ml-3 flex-1">
                      <PageHeader
                        title={pageTitle || customHeader?.title || 'Medicine Management'}
                        subtitle={customHeader?.subtitle}
                        actions={customHeader?.actions}
                        compact
                      />
                    </div>
                  )}

                  {/* Compact header for sales */}
                  {location.pathname.includes('/sales') && (
                    <div className="ml-3 flex-1">
                      <PageHeader
                        title={pageTitle || customHeader?.title || 'Sales Report'}
                        subtitle={customHeader?.subtitle}
                        actions={customHeader?.actions}
                        compact
                      />
                    </div>
                  )}

                  {/* Compact header for purchases */}
                  {location.pathname.includes('/purchases') && (
                    <div className="ml-3 flex-1">
                      <PageHeader
                        title={pageTitle || customHeader?.title || 'Purchase Records'}
                        subtitle={customHeader?.subtitle}
                        actions={customHeader?.actions}
                        compact
                      />
                    </div>
                  )}

                  {/* Compact header for settings */}
                  {location.pathname.includes('/settings') && (
                    <div className="ml-3 flex-1">
                      <PageHeader
                        title={pageTitle || customHeader?.title || 'Settings'}
                        subtitle={customHeader?.subtitle}
                        actions={customHeader?.actions}
                        compact
                      />
                    </div>
                  )}

                  {/* Compact header for dashboard */}
                  {location.pathname.includes('/dashboard') && (
                    <div className="ml-3 flex-1">
                      <PageHeader
                        title={pageTitle || 'Dashboard'}
                        subtitle={customHeader?.subtitle}
                        actions={customHeader?.actions}
                        compact
                      />
                    </div>
                  )}

                  {/* Compact header for license */}
                  {location.pathname.includes('/license') && (
                    <div className="ml-3 flex-1">
                      <PageHeader
                        title={pageTitle || 'License'}
                        subtitle={customHeader?.subtitle}
                        actions={customHeader?.actions}
                        compact
                      />
                    </div>
                  )}

                  {/* Compact header for sale return */}
                  {location.pathname.includes('/sale-return') && (
                    <div className="ml-3 flex-1">
                      <PageHeader
                        title={pageTitle || 'Sale Return'}
                        subtitle={customHeader?.subtitle}
                        actions={customHeader?.actions}
                        compact
                      />
                    </div>
                  )}

                  {/* Compact header for financial summary */}
                  {location.pathname.includes('/financial-summary') && (
                    <div className="ml-3 flex-1">
                      <PageHeader
                        title={pageTitle || 'Financial Summary'}
                        subtitle={customHeader?.subtitle}
                        actions={customHeader?.actions}
                        compact
                      />
                    </div>
                  )}

                  {/* Compact header for alerts */}
                  {location.pathname.includes('/alerts') && (
                    <div className="ml-3 flex-1">
                      <PageHeader
                        title={pageTitle || 'Alerts'}
                        subtitle={customHeader?.subtitle}
                        actions={customHeader?.actions}
                        compact
                      />
                    </div>
                  )}

                  {/* Compact header for payment */}
                  {location.pathname.includes('/payment') && (
                    <div className="ml-3 flex-1">
                      <PageHeader
                        title={pageTitle || 'Payment'}
                        subtitle={customHeader?.subtitle}
                        actions={customHeader?.actions}
                        compact
                      />
                    </div>
                  )}



                  <div
                    className={`flex flex-wrap items-center gap-3 justify-end ${location.pathname.includes('/selling-panel') ||
                      location.pathname.includes('/purchasing-panel') ||
                      location.pathname.includes('/suppliers') ||
                      location.pathname.includes('/customers') ||
                      location.pathname.includes('/medicines') ||
                      location.pathname.includes('/sales') ||
                      location.pathname.includes('/purchases') ||
                      location.pathname.includes('/settings') ||
                      location.pathname.includes('/license') ||
                      location.pathname.includes('/payment') ||
                      location.pathname.includes('/alerts') ||
                      location.pathname.includes('/sale-return') ||
                      location.pathname.includes('/financial-summary') ||
                      location.pathname.includes('/dashboard')
                      ? 'gap-2'
                      : ''
                      }`}
                  >

                    <div className="relative" ref={notificationMenuRef}>
                      <button
                        type="button"
                        className={`relative ${location.pathname.includes('/selling-panel') ||
                          location.pathname.includes('/purchasing-panel') ||
                          location.pathname.includes('/suppliers') ||
                          location.pathname.includes('/customers') ||
                          location.pathname.includes('/medicines') ||
                          location.pathname.includes('/sales') ||
                          location.pathname.includes('/purchases') ||
                          location.pathname.includes('/settings') ||
                          location.pathname.includes('/license') ||
                          location.pathname.includes('/payment') ||
                          location.pathname.includes('/alerts') ||
                          location.pathname.includes('/sale-return') ||
                          location.pathname.includes('/financial-summary') ||
                          location.pathname.includes('/dashboard')
                          ? 'p-2.5 rounded-lg'
                          : 'p-3 rounded-xl'
                          } bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-700/50 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-lg hover:border-emerald-300 dark:hover:border-emerald-600 transition-all duration-200 group`}
                        onClick={() => setNotificationsOpen((prev) => !prev)}
                        aria-label="View alerts"
                      >
                        <FiBell
                          className={`${location.pathname.includes('/selling-panel') ||
                            location.pathname.includes('/purchasing-panel') ||
                            location.pathname.includes('/suppliers') ||
                            location.pathname.includes('/customers') ||
                            location.pathname.includes('/medicines') ||
                            location.pathname.includes('/sales') ||
                            location.pathname.includes('/purchases') ||
                            location.pathname.includes('/settings') ||
                            location.pathname.includes('/license') ||
                            location.pathname.includes('/payment') ||
                            location.pathname.includes('/alerts') ||
                            location.pathname.includes('/financial-summary') ||
                            location.pathname.includes('/sale-return') ||
                            location.pathname.includes('/dashboard')
                            ? 'w-4 h-4'
                            : 'w-5 h-5'
                            } text-gray-600 dark:text-gray-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors`}
                        />
                        {expiringAlertCount > 0 && (
                          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 bg-gradient-to-r from-red-500 to-red-600 text-white text-[10px] font-bold rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center shadow-lg animate-pulse">
                            {Math.min(expiringAlertCount, 9)}
                            {expiringAlertCount > 9 ? '+' : ''}
                          </span>
                        )}
                      </button>
                      {notificationsOpen && (
                        <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl z-50 overflow-hidden backdrop-blur-xl">
                          <div className="px-4 py-3.5 bg-gradient-to-r from-emerald-50 to-emerald-100/50 dark:from-emerald-900/30 dark:to-emerald-800/20 border-b border-emerald-200/50 dark:border-emerald-700/50">
                            <p className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                              <FiBell className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                              Alerts & Notifications
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              {expiringAlertCount > 0
                                ? `You have ${expiringAlertCount} medicine${expiringAlertCount > 1 ? 's' : ''
                                } expiring within ${ALERT_THRESHOLD_DAYS} days.`
                                : 'All medicines are healthy for now.'}
                            </p>
                          </div>
                          {expiringAlertCount > 0 ? (
                            <div className="max-h-64 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
                              {expiringAlerts.slice(0, 4).map((alert) => (
                                <button
                                  key={alert.id}
                                  onClick={() => {
                                    navigate('/alerts');
                                    setNotificationsOpen(false);
                                  }}
                                  className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                >
                                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                    {alert.name}
                                  </p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 flex justify-between">
                                    <span>{alert.barcode || '—'}</span>
                                    <span>
                                      {Math.max(alert.daysUntilExpiry, 0)} days
                                      left
                                    </span>
                                  </p>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400 text-center">
                              No expiring medicines detected.
                            </div>
                          )}
                          <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-2 bg-gray-50 dark:bg-gray-700">
                            <Link
                              to="/alerts"
                              className="text-sm font-semibold text-emerald-600 hover:text-emerald-700"
                              onClick={() => setNotificationsOpen(false)}
                            >
                              View alerts center
                            </Link>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="relative" ref={profileMenuRef}>
                      <button
                        type="button"
                        onClick={() => setProfileMenuOpen((prev) => !prev)}
                        className={`flex items-center ${location.pathname.includes('/selling-panel') ||
                          location.pathname.includes('/purchasing-panel') ||
                          location.pathname.includes('/suppliers') ||
                          location.pathname.includes('/customers') ||
                          location.pathname.includes('/medicines') ||
                          location.pathname.includes('/sales') ||
                          location.pathname.includes('/settings') ||
                          location.pathname.includes('/license') ||
                          location.pathname.includes('/payment') ||
                          location.pathname.includes('/alerts') ||
                          location.pathname.includes('/financial-summary') ||
                          location.pathname.includes('/sale-return') ||
                          location.pathname.includes('/purchases') ||
                          location.pathname.includes('/dashboard')


                          ? 'gap-1.5 p-1.5 rounded-lg'
                          : 'gap-3 p-2 rounded-xl'
                          } bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-700/50 border border-gray-200 dark:border-gray-700 hover:shadow-lg hover:border-emerald-300 dark:hover:border-emerald-600 transition-all duration-200 group`}
                      >
                        <div className="relative">
                          <img
                            src={user?.avatar || `https://i.pravatar.cc/40?img=32`}
                            alt="avatar"
                            className={`${location.pathname.includes('/selling-panel') ||
                              location.pathname.includes('/purchasing-panel') ||
                              location.pathname.includes('/suppliers') ||
                              location.pathname.includes('/customers') ||
                              location.pathname.includes('/medicines') ||
                              location.pathname.includes('/sales') ||
                              location.pathname.includes('/settings') ||
                              location.pathname.includes('/license') ||
                              location.pathname.includes('/payment') ||
                              location.pathname.includes('/alerts') ||
                              location.pathname.includes('/sale-return') ||
                              location.pathname.includes('/financial-summary') ||
                              location.pathname.includes('/purchases') ||
                              location.pathname.includes('/dashboard')
                              ? 'w-7 h-7 rounded-lg'
                              : 'w-10 h-10 rounded-xl'
                              } border-2 border-emerald-200 dark:border-emerald-700 shadow-md ring-2 ring-emerald-100 dark:ring-emerald-900/50 group-hover:ring-emerald-300 dark:group-hover:ring-emerald-700 transition-all`}
                          />
                          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-gray-800 rounded-full shadow-sm" />
                        </div>
                        {!location.pathname.includes('/selling-panel') &&
                          !location.pathname.includes('/purchasing-panel') &&
                          !location.pathname.includes('/suppliers') &&
                          !location.pathname.includes('/customers') &&
                          !location.pathname.includes('/medicines') &&
                          !location.pathname.includes('/sales') &&
                          !location.pathname.includes('/settings') &&
                          !location.pathname.includes('/license') &&
                          !location.pathname.includes('/payment') &&
                          !location.pathname.includes('/alerts') &&
                          !location.pathname.includes('/financial-summary') &&
                          !location.pathname.includes('/sale-return') &&
                          !location.pathname.includes('/purchases') &&
                          !location.pathname.includes('/dashboard') && (
                            <div className="hidden sm:block text-left">
                              <div className="font-semibold text-gray-800 dark:text-gray-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                                {user?.name || 'Alex James'}
                              </div>
                              <div className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                                <span className="w-1 h-1 rounded-full bg-emerald-500" />
                                {user?.role === 'admin' ? 'Administrator' : 'Cashier'}
                              </div>
                            </div>
                          )}
                        {(location.pathname.includes('/selling-panel') ||
                          location.pathname.includes('/purchasing-panel') ||
                          location.pathname.includes('/suppliers') ||
                          location.pathname.includes('/customers') ||
                          location.pathname.includes('/medicines') ||
                          location.pathname.includes('/sales') ||
                          location.pathname.includes('/settings') ||
                          location.pathname.includes('/license')) ||
                          location.pathname.includes('/payment') ||
                          location.pathname.includes('/alerts') ||
                          location.pathname.includes('/sale-return') ||
                          location.pathname.includes('/financial-summary') ||
                          location.pathname.includes('/purchases') ||
                          location.pathname.includes('/dashboard') && (
                            <div className="hidden sm:block text-left">
                              <div className="text-xs font-semibold text-gray-800 dark:text-gray-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                                {user?.name || 'Alex James'}
                              </div>
                            </div>
                          )}
                        <FiChevronDown
                          className={`${location.pathname.includes('/selling-panel') ||
                            location.pathname.includes('/purchasing-panel') ||
                            location.pathname.includes('/suppliers') ||
                            location.pathname.includes('/customers') ||
                            location.pathname.includes('/medicines') ||
                            location.pathname.includes('/sales') ||
                            location.pathname.includes('/settings') ||
                            location.pathname.includes('/license') ||
                            location.pathname.includes('/payment') ||
                            location.pathname.includes('/alerts') ||
                            location.pathname.includes('/financial-summary') ||
                            location.pathname.includes('/sale-return') ||
                            location.pathname.includes('/purchases') ||
                            location.pathname.includes('/dashboard')
                            ? 'w-3 h-3'
                            : 'w-4 h-4'
                            } text-gray-400 dark:text-gray-500 hidden sm:block group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors`}
                        />
                      </button>
                      {profileMenuOpen && (
                        <div className="absolute right-0 mt-3 w-64 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl overflow-hidden z-50 backdrop-blur-xl">
                          <div className="px-4 py-4 bg-gradient-to-br from-emerald-600 via-emerald-500 to-emerald-600 text-white relative overflow-hidden">
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.2),_transparent_50%)]" />
                            <div className="relative">
                              <div className="text-xs font-medium opacity-90 mb-1">
                                Signed in as
                              </div>
                              <div className="text-sm font-bold truncate flex items-center gap-2">
                                <span className="flex-1 truncate">
                                  {user?.email || 'admin@pharmacy.com'}
                                </span>
                                <div className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
                              </div>
                            </div>
                          </div>
                          <div className="py-2">
                            <button
                              type="button"
                              className="w-full px-4 py-3 flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-lime-50 dark:hover:bg-gray-700 transition-colors"
                            >
                              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime-100 dark:bg-lime-900/30 text-lime-700 dark:text-lime-400">
                                <FiHelpCircle className="w-4 h-4" />
                              </span>
                              <div className="text-left">
                                <div className="font-medium">Support</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  Contact pharmacy helpdesk
                                </div>
                              </div>
                            </button>
                          </div>
                          <div className="border-t border-gray-100 dark:border-gray-700">
                            <button
                              type="button"
                              onClick={() => {
                                setProfileMenuOpen(false);
                                handleLogout();
                              }}
                              className="w-full px-4 py-3 text-sm font-semibold text-white bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-500 transition-colors flex items-center justify-center gap-2"
                            >
                              <FiLogOut className="w-4 h-4" />
                              Logout
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </header>
            )}

            {/* Scrollable Content */}
            <Outlet context={outletContextValue} />
          </div>
        </main>
      </div>
    </LicenseOverlay>
  );
};

export default Dashboard_Layout;
