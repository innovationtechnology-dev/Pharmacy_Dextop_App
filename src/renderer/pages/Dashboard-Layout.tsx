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

    // Route Guarding
    const cashierProhibitedRoutes = ['/dashboard', '/payments', '/financial-summary'];
    const adminProhibitedRoutes = ['/selling-panel', '/purchasing-panel', '/sale-return', '/alerts'];
    
    if (authUser.role === 'cashier' && cashierProhibitedRoutes.some(route => location.pathname.startsWith(route))) {
      navigate('/main-menu');
    } else if (authUser.role === 'admin' && adminProhibitedRoutes.some(route => location.pathname.startsWith(route))) {
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
      <div className="h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 text-gray-800 dark:text-gray-100">
        {/* Scrollable Main Content */}
        <main
          className={`h-screen ${location.pathname.includes('/selling-panel') ||
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


            ? 'overflow-hidden flex flex-col'
            : 'overflow-auto flex flex-col'
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
                ? 'p-0 flex-1 flex flex-col min-h-0 overflow-hidden h-full'
                : 'p-6 md:p-8 flex-1'
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
                    {/* Current role badge */}
                    <div className="hidden xs:flex items-center px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 text-[11px] font-medium mr-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5" />
                      <span className="mr-1">{user?.name || 'User'}</span>
                      <span className="w-px h-3 bg-emerald-300/70 dark:bg-emerald-600/70 mx-1" />
                      <span className="uppercase tracking-wide">
                        {user?.role === 'admin'
                          ? 'Admin'
                          : user?.role === 'cashier'
                          ? 'Cashier'
                          : 'User'}
                      </span>
                    </div>

                    {user?.role !== 'admin' && (
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
                        <div className="absolute right-0 mt-1 w-80 bg-[#1e293b] dark:bg-[#1a2130] rounded-lg shadow-2xl border border-[#2d3a4f] dark:border-[#242d3d] z-50 overflow-hidden transform origin-top-right transition-all animate-in fade-in zoom-in-95">
                          {/* Header section */}
                          <div className="px-4 py-2.5 bg-[#1e293b] dark:bg-[#1a2130]">
                            <p className="text-[13px] font-semibold text-white flex items-center gap-2">
                              <FiBell className="w-3.5 h-3.5 text-blue-400" />
                              Alerts & Notifications
                            </p>
                            <p className="text-[10px] text-gray-400 mt-0.5 font-medium">
                              {expiringAlertCount > 0
                                ? `You have ${expiringAlertCount} medicine${expiringAlertCount > 1 ? 's' : ''} expiring soon.`
                                : 'All medicines are healthy for now.'}
                            </p>
                          </div>

                          {/* Body section with even darker background */}
                          <div className="bg-[#1a2130] dark:bg-[#151b27] border-y border-[#2d3a4f] dark:border-[#242d3d]">
                            {expiringAlertCount > 0 ? (
                              <div className="max-h-64 overflow-y-auto divide-y divide-[#2d3a4f] dark:divide-[#242d3d]">
                                {expiringAlerts.slice(0, 4).map((alert) => (
                                  <button
                                    key={alert.id}
                                    onClick={() => {
                                      navigate('/alerts');
                                      setNotificationsOpen(false);
                                    }}
                                    className="w-full text-left px-4 py-2.5 hover:bg-[#2d3a4f] transition-colors group"
                                  >
                                    <p className="text-[11px] font-semibold text-white group-hover:text-blue-400">
                                      {alert.name}
                                    </p>
                                    <div className="text-[8px] text-gray-500 mt-0.5 flex justify-between font-bold">
                                      <span>{alert.barcode || '—'}</span>
                                      <span className="text-orange-500/60">
                                        {Math.max(alert.daysUntilExpiry, 0)} days left
                                      </span>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <div className="px-4 py-6 text-[12px] text-gray-500 text-center font-medium">
                                No expiring medicines detected.
                              </div>
                            )}
                          </div>

                          {/* Footer section */}
                          <div className="px-5 py-3 bg-[#1e293b] dark:bg-[#1a2130]">
                            <Link
                              to="/alerts"
                              className="text-[11px] font-semibold text-[#3b82f6] hover:text-blue-400 transition-colors"
                              onClick={() => setNotificationsOpen((prev) => !prev)}
                            >
                              View Alerts Center
                            </Link>
                          </div>
                        </div>
                      )}
                    </div>
                    )}

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
                            src={user?.profilePicture || user?.avatar || `https://i.pravatar.cc/40?img=32`}
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
                              ? 'w-7 h-7 rounded-full'
                              : 'w-10 h-10 rounded-full'
                              } dark:border-emerald-700 shadow-md ring-2 ring-emerald-100 dark:ring-emerald-900/50 group-hover:ring-emerald-300 dark:group-hover:ring-emerald-700 transition-all`}
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
                                {user?.name?.split(' ')[0] || 'Alex'}
                              </div>
                              {/* <div className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                                <span className="w-1 h-1 rounded-full bg-emerald-500" />
                                {user?.role === 'admin' ? 'Administrator' : 'Cashier'}
                              </div> */}
                            </div>
                          )}
                        {(location.pathname.includes('/selling-panel') ||
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
                          location.pathname.includes('/dashboard')) && (
                            <div className="hidden sm:block text-left">
                              <div className="text-xs font-semibold text-gray-800 dark:text-gray-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                                {user?.name?.split(' ')[0] || 'Alex'}
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
                        <div className="absolute right-0 mt-1 w-60 bg-[#1e293b] dark:bg-[#1a2130] rounded-lg shadow-2xl border border-[#2d3a4f] dark:border-[#242d3d] z-50 overflow-hidden transform origin-top-right transition-all animate-in fade-in zoom-in-95">
                          {/* Profile Header */}
                          <div className="px-5 py-4 bg-[#1e293b] dark:bg-[#1a2130]">
                            <div className="flex items-center gap-3">
                              <div className="relative">
                                <img
                                  src={user?.profilePicture || user?.avatar || `https://i.pravatar.cc/80?img=32`}
                                  alt="avatar"
                                  className="w-10 h-10 rounded-full border-2 border-blue-500/30 object-cover"
                                />
                                <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-[#1e293b] rounded-full" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-[11px] font-bold text-white truncate">
                                  {user?.name || 'Wali Cashier'}
                                </div>
                                <div className="text-[7.5px] font-semibold text-blue-400 uppercase tracking-widest mt-0.5">
                                  {user?.role === 'admin' ? 'Administrator' : 'Cashier'}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Email/Info section with darker background */}
                          <div className="px-4 py-1.5 bg-[#1a2130] dark:bg-[#151b27] border-y border-[#2d3a4f] dark:border-[#242d3d]">
                            <div className="text-[8px] font-semibold text-gray-500 uppercase tracking-tight">Signed in as</div>
                            <div className="text-[9px] font-semibold text-gray-300 truncate mt-0.5">
                              {user?.email || 'admin@pharmacy.com'}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="p-1.5 bg-[#1e293b] dark:bg-[#1a2130]">
                            <button
                              type="button"
                              onClick={() => {
                                setProfileMenuOpen(false);
                                handleLogout();
                              }}
                              className="w-full h-8 flex items-center justify-center gap-2 rounded-lg bg-red-500/5 hover:bg-red-500/10 text-red-500 text-[10px] font-semibold transition-all border border-red-500/10 group hover:border-red-500/20"
                            >
                              <FiLogOut className="w-2.5 h-2.5 group-hover:-translate-x-0.5 transition-transform" />
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
            <div className="flex-1 overflow-hidden min-h-0">
              <Outlet context={outletContextValue} />
            </div>
          </div>
        </main>
      </div>
    </LicenseOverlay>
  );
};

export default Dashboard_Layout;
