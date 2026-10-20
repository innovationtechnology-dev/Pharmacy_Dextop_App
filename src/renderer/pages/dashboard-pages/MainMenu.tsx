import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';
import { logout as authLogout, getAuthUser } from '../../utils/auth';
import {
  FiUsers,
  FiPackage,
  FiShoppingCart,
  FiFileText,
  FiPieChart,
  FiCreditCard,
  FiBarChart2,
  FiSettings,
  FiDatabase,
  FiRefreshCw,
  FiBriefcase,
  FiAlertTriangle,
  FiAlertCircle,
  FiBell,
  FiSun,
  FiUser,
  FiClock,
  FiCalendar,
  FiArrowLeft,
  FiChevronDown,
  FiChevronLeft,
  FiChevronRight,
  FiSearch,
  FiTrendingUp,
  FiShield,
  FiLogOut,
  FiHome,
  FiEdit,
  FiEye,
  FiTool,
  FiLayers,
  FiHelpCircle,
  FiPlus,
  FiSave,
  FiDownload,
  FiUpload,
  FiPrinter,
  FiX,
  FiMail,
  FiPhone,
} from 'react-icons/fi';

interface PanelVisibilitySettings {
  showSellingPanel: boolean;
  showPurchasingPanel: boolean;
}

const defaultPanelVisibilitySettings: PanelVisibilitySettings = {
  showSellingPanel: true,
  showPurchasingPanel: true,
};

const getStoredPanelVisibilitySettings = (): PanelVisibilitySettings => {
  try {
    const stored = localStorage.getItem('panelVisibilitySettings');
    return stored ? JSON.parse(stored) : defaultPanelVisibilitySettings;
  } catch {
    return defaultPanelVisibilitySettings;
  }
};

interface MenuItem {
  id: string;
  title: string;
  icon: React.ReactNode;
  color: string;
  gradient: string;
  route?: string;
  description?: string;
  disabled?: boolean;
  shortcut?: string;
}

interface MenuBarItem {
  label: string;
  items: {
    label: string;
    shortcut?: string;
    icon?: React.ReactNode;
    action?: () => void;
    separator?: boolean;
    disabled?: boolean;
  }[];
}

import WelcomeNotification from '../../components/WelcomeNotification';
import { useDashboardHeader } from './useDashboardHeader';
import CalendarPanel from '../../components/common/CalendarPanel';

const MainMenu: React.FC = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [showWelcomeNotification, setShowWelcomeNotification] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('mainMenuSidebarCollapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [panelVisibility, setPanelVisibility] =
    useState<PanelVisibilitySettings>(getStoredPanelVisibilitySettings());
  const menuBarRef = useRef<HTMLDivElement>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const { expiringAlerts = [], lowStockAlerts = [] } =
    useDashboardHeader() || {};
  const alertCount = expiringAlerts.length + lowStockAlerts.length;

  useEffect(() => {
    const shouldShow = sessionStorage.getItem('shouldShowWelcome');
    if (shouldShow === 'true') {
      const timer = setTimeout(() => setShowWelcomeNotification(true), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  // Listen for panel visibility changes
  useEffect(() => {
    const handlePanelVisibilityUpdate = (event: any) => {
      setPanelVisibility(event.detail);
    };

    window.addEventListener(
      'panel-visibility-updated',
      handlePanelVisibilityUpdate
    );

    return () => {
      window.removeEventListener(
        'panel-visibility-updated',
        handlePanelVisibilityUpdate
      );
    };
  }, []);

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('mainMenuSidebarCollapsed', String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const handleCloseWelcomeNotification = () => {
    setShowWelcomeNotification(false);
    sessionStorage.removeItem('shouldShowWelcome');
  };

  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
      );
      setCurrentDate(
        now.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })
      );
    };
    updateDateTime();
    const interval = setInterval(updateDateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuBarRef.current &&
        !menuBarRef.current.contains(event.target as Node)
      ) {
        setActiveMenu(null);
      }
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
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const categories = [
    { id: 'all', label: 'All Modules', icon: FiDatabase, shortcut: 'Ctrl+1' },
    {
      id: 'operations',
      label: 'Operations',
      icon: FiPackage,
      shortcut: 'Ctrl+2',
    },
    { id: 'reports', label: 'Reports', icon: FiBarChart2, shortcut: 'Ctrl+3' },
    { id: 'settings', label: 'Settings', icon: FiSettings, shortcut: 'Ctrl+4' },
  ];

  const currentUser = getAuthUser();
  const isCashier = currentUser?.role === 'cashier';
  const isAdmin = currentUser?.role === 'admin';
  const roleLabel = isAdmin ? 'Admin' : isCashier ? 'Cashier' : 'User';

  const operationsModules: MenuItem[] = [
    {
      id: 'selling-panel',
      title: 'Selling Panel',
      icon: <FiShoppingCart className="w-5 h-5" />,
      color: 'from-green-500 to-green-600',
      gradient: 'bg-gradient-to-br from-green-500/10 to-green-600/10',
      description: 'Point of Sale',
      route: '/selling-panel',
      shortcut: 'Ctrl+S',
      // disabled: isAdmin ? !panelVisibility.showSellingPanel : false,
      disabled: isAdmin ? true : false,
    },
    {
      id: 'medicines',
      title: 'Medicines',
      icon: <FiPackage className="w-5 h-5" />,
      color: 'from-purple-500 to-purple-600',
      gradient: 'bg-gradient-to-br from-purple-500/10 to-purple-600/10',
      description: 'Inventory Management',
      route: '/medicines',
      shortcut: 'Ctrl+M',
    },
    {
      id: 'stocks',
      title: 'Stocks',
      icon: <FiLayers className="w-5 h-5" />,
      color: 'from-emerald-500 to-emerald-600',
      gradient: 'bg-gradient-to-br from-emerald-500/10 to-emerald-600/10',
      description: 'Stock Monitoring',
      route: '/stocks',
    },
    {
      id: 'purchasing-panel',
      title: 'Purchasing Panel',
      icon: <FiPackage className="w-5 h-5" />,
      color: 'from-amber-500 to-amber-600',
      gradient: 'bg-gradient-to-br from-amber-500/10 to-amber-600/10',
      description: 'Purchase Management',
      route: '/purchasing-panel',
      shortcut: 'Ctrl+P',
      // disabled: isAdmin ? !panelVisibility.showSellingPanel : false,
      disabled: isAdmin ? true : false,
    },
    {
      id: 'customers',
      title: 'Customers',
      icon: <FiUsers className="w-5 h-5" />,
      color: 'from-indigo-500 to-indigo-600',
      gradient: 'bg-gradient-to-br from-indigo-500/10 to-indigo-600/10',
      description: 'Customer Database',
      route: '/customers',
      shortcut: 'Ctrl+C',
    },
    {
      id: 'suppliers',
      title: 'Suppliers',
      icon: <FiBriefcase className="w-5 h-5" />,
      color: 'from-teal-500 to-teal-600',
      gradient: 'bg-gradient-to-br from-teal-500/10 to-teal-600/10',
      description: 'Vendor Management',
      route: '/suppliers',
      shortcut: 'Ctrl+V',
    },
    {
      id: 'sale-return',
      title: 'Sale Return',
      icon: <FiArrowLeft className="w-5 h-5" />,
      color: 'from-pink-500 to-pink-600',
      gradient: 'bg-gradient-to-br from-pink-500/10 to-pink-600/10',
      description: 'Process Returns',
      route: '/sale-return',
    },
    {
      id: 'payments',
      title: 'Payments',
      icon: <FiCreditCard className="w-5 h-5" />,
      color: 'from-violet-500 to-violet-600',
      gradient: 'bg-gradient-to-br from-violet-500/10 to-violet-600/10',
      description: 'Transaction Management',
      route: '/payments',
      disabled: isCashier,
    },
    {
      id: 'alerts',
      title: 'Alerts',
      icon: <FiAlertTriangle className="w-5 h-5" />,
      color: 'from-red-500 to-red-600',
      gradient: 'bg-gradient-to-br from-red-500/10 to-red-600/10',
      description: 'System Notifications',
      route: '/alerts',
      shortcut: 'Ctrl+A',
      disabled: false,
    },
  ];

  const reportModules: MenuItem[] = [
    {
      id: 'dashboard',
      title: 'Dashboard',
      icon: <FiDatabase className="w-5 h-5" />,
      color: 'from-blue-500 to-blue-600',
      gradient: 'bg-gradient-to-br from-blue-500/10 to-blue-600/10',
      description: 'Overview & Analytics',
      route: '/dashboard',
      shortcut: 'Ctrl+D',
      disabled: isCashier,
    },
    {
      id: 'financial-summary',
      title: 'Financial Summary',
      icon: <FiPieChart className="w-5 h-5" />,
      color: 'from-blue-500 to-cyan-500',
      gradient: 'bg-gradient-to-br from-blue-500/10 to-cyan-600/10',
      description: 'Finance Overview',
      route: '/financial-summary',
      shortcut: 'Ctrl+F',
      disabled: isCashier,
    },
    {
      id: 'sale-report',
      title: 'Sale Report',
      icon: <FiFileText className="w-5 h-5" />,
      color: 'from-green-500 to-emerald-500',
      gradient: 'bg-gradient-to-br from-green-500/10 to-emerald-600/10',
      description: 'Sales Analytics',
      route: '/sales',
      shortcut: 'Ctrl+R',
    },
    {
      id: 'purchase-report',
      title: 'Purchase Report',
      icon: <FiFileText className="w-5 h-5" />,
      color: 'from-orange-500 to-amber-500',
      gradient: 'bg-gradient-to-br from-orange-500/10 to-amber-600/10',
      description: 'Purchase Analytics',
      route: '/purchases',
    },
    {
      id: 'medicine-analytics',
      title: 'Medicine Analytics',
      icon: <FiTrendingUp className="w-5 h-5" />,
      color: 'from-violet-500 to-purple-600',
      gradient: 'bg-gradient-to-br from-violet-500/10 to-purple-600/10',
      description: 'Drug Performance Insights',
      route: '/medicine-analytics',
      disabled: isCashier,
    },
  ];

  const settingsModules: MenuItem[] = [
    {
      id: 'license',
      title: 'License',
      icon: <FiShield className="w-5 h-5" />,
      color: 'from-blue-500 to-indigo-600',
      gradient: 'bg-gradient-to-br from-blue-500/10 to-indigo-600/10',
      description: 'License Management',
      route: '/license',
    },
    {
      id: 'settings',
      title: 'Settings',
      icon: <FiSettings className="w-5 h-5" />,
      color: 'from-gray-500 to-gray-600',
      gradient: 'bg-gradient-to-br from-gray-500/10 to-gray-600/10',
      description: 'System Configuration',
      route: '/settings',
      shortcut: 'Ctrl+,',
    },
  ];

  const allModules = [
    ...operationsModules,
    ...reportModules,
    ...settingsModules,
  ];

  const filteredModules = allModules.filter((module) => {
    const matchesCategory =
      activeCategory === 'all' ||
      (activeCategory === 'operations' && operationsModules.includes(module)) ||
      (activeCategory === 'reports' && reportModules.includes(module)) ||
      (activeCategory === 'settings' && settingsModules.includes(module));
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !query ||
      module.title.toLowerCase().includes(query) ||
      (module.description || '').toLowerCase().includes(query);
    return matchesCategory && matchesSearch && !module.disabled;
  });

  const quickAccessModules = [
    !isAdmin ? allModules.find((m) => m.id === 'selling-panel') : null,
    allModules.find((m) => m.id === 'medicines'),
    !isCashier ? allModules.find((m) => m.id === 'dashboard') : null,
  ]
    .filter(Boolean)
    .filter((m) =>
      filteredModules.some((f) => f.id === (m as MenuItem).id)
    ) as MenuItem[];

  const remainingModules = filteredModules.filter(
    (m) => !quickAccessModules.some((q) => q.id === m.id)
  );

  const getCategoryModules = (categoryId: string): MenuItem[] => {
    const modules =
      categoryId === 'operations'
        ? operationsModules
        : categoryId === 'reports'
        ? reportModules
        : categoryId === 'settings'
        ? settingsModules
        : allModules;
    return modules.filter((m) => !m.disabled);
  };

  const handleSidebarCategoryClick = (categoryId: string) => {
    setActiveCategory(categoryId);
    if (isSidebarCollapsed) toggleSidebar();
  };

  const handleModuleClick = (module: MenuItem) => {
    if (module.disabled) return;
    if (module.route) {
      navigate(module.route);
    }
  };

  const renderModuleCard = (module: MenuItem) => (
    <button
      key={module.id}
      type="button"
      onClick={() => handleModuleClick(module)}
      disabled={module.disabled}
      className={`group relative h-full flex flex-col p-4 border rounded-xl text-left transition-all duration-200 ${
        module.disabled
          ? 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 opacity-60 cursor-not-allowed'
          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-lg hover:-translate-y-0.5'
      }`}
    >
      <div className="w-full flex items-start gap-3">
        <div
          className={`w-11 h-11 flex-shrink-0 bg-gradient-to-br ${
            module.color
          } rounded-xl flex items-center justify-center text-white shadow-sm ${
            module.disabled ? '' : 'group-hover:scale-105 transition-transform'
          }`}
        >
          {module.icon}
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <h3
            className={`truncate text-[15px] font-semibold leading-tight ${
              module.disabled
                ? 'text-gray-400 dark:text-gray-600'
                : 'text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors'
            }`}
          >
            {module.title}
          </h3>
          <p
            className={`mt-1 text-[13px] leading-snug ${
              module.disabled
                ? 'text-gray-400 dark:text-gray-600'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {module.description}
          </p>
        </div>
        {!module.disabled && (
          <FiChevronRight className="w-4 h-4 mt-3 flex-shrink-0 text-gray-300 dark:text-gray-600 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
        )}
      </div>
      {module.shortcut && !module.disabled && (
        <div className="w-full mt-auto pt-3 pl-14">
          <kbd className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/60 text-[11px] font-mono text-gray-500 dark:text-gray-400 shadow-[inset_0_-1px_0_rgba(0,0,0,0.06)]">
            {module.shortcut}
          </kbd>
        </div>
      )}
    </button>
  );

  const handleLogout = () => {
    authLogout();
    navigate('/login');
  };

  const menuBarItems: MenuBarItem[] = [
    {
      label: 'File',
      items: [
        {
          label: 'New Transaction',
          shortcut: 'Ctrl+N',
          icon: <FiPlus className="w-4 h-4" />,
        },
        {
          label: 'Open',
          shortcut: 'Ctrl+O',
          icon: <FiUpload className="w-4 h-4" />,
        },
        { label: '', separator: true },
        {
          label: 'Save',
          shortcut: 'Ctrl+S',
          icon: <FiSave className="w-4 h-4" />,
        },
        {
          label: 'Export',
          shortcut: 'Ctrl+E',
          icon: <FiDownload className="w-4 h-4" />,
        },
        {
          label: 'Print',
          shortcut: 'Ctrl+P',
          icon: <FiPrinter className="w-4 h-4" />,
        },
        { label: '', separator: true },
        {
          label: 'Exit',
          action: handleLogout,
          icon: <FiX className="w-4 h-4" />,
        },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', shortcut: 'Ctrl+Z' },
        { label: 'Redo', shortcut: 'Ctrl+Y' },
        { label: '', separator: true },
        { label: 'Cut', shortcut: 'Ctrl+X' },
        { label: 'Copy', shortcut: 'Ctrl+C' },
        { label: 'Paste', shortcut: 'Ctrl+V' },
        { label: '', separator: true },
        {
          label: 'Find',
          shortcut: 'Ctrl+F',
          icon: <FiSearch className="w-4 h-4" />,
        },
      ],
    },
    {
      label: 'View',
      items: [
        {
          label: 'Refresh',
          shortcut: 'Ctrl+R',
          icon: <FiRefreshCw className="w-4 h-4" />,
        },
        { label: '', separator: true },
        {
          label: 'All Modules',
          shortcut: 'Ctrl+1',
          action: () => setActiveCategory('all'),
        },
        {
          label: 'Operations',
          shortcut: 'Ctrl+2',
          action: () => setActiveCategory('operations'),
        },
        {
          label: 'Reports',
          shortcut: 'Ctrl+3',
          action: () => setActiveCategory('reports'),
        },
        {
          label: 'Settings',
          shortcut: 'Ctrl+4',
          action: () => setActiveCategory('settings'),
        },
      ],
    },
    {
      label: 'Tools',
      items: [
        {
          label: 'Dashboard',
          shortcut: 'Ctrl+D',
          action: () => navigate('/dashboard'),
        },
        {
          label: 'Settings',
          shortcut: 'Ctrl+,',
          action: () => navigate('/settings'),
        },
        { label: '', separator: true },
        {
          label: 'Alerts',
          shortcut: 'Ctrl+A',
          action: () => navigate('/alerts'),
        },
      ],
    },
    {
      label: 'Window',
      items: [
        { label: 'Minimize', shortcut: 'Ctrl+M' },
        { label: 'Close', shortcut: 'Ctrl+W' },
      ],
    },
    {
      label: 'Help',
      items: [
        { label: 'User Guide', icon: <FiHelpCircle className="w-4 h-4" /> },
        { label: 'Keyboard Shortcuts', shortcut: 'Ctrl+?' },
        { label: '', separator: true },
        { label: 'About', action: () => {} },
      ],
    },
  ];

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 overflow-hidden">
      {showWelcomeNotification && (
        <WelcomeNotification onClose={handleCloseWelcomeNotification} />
      )}
      {/* Menu Bar */}
      <div
        ref={menuBarRef}
        className="flex-shrink-0 bg-gray-100 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700 px-2 h-7 flex items-center text-xs font-medium text-gray-700 dark:text-gray-300 select-none"
      >
        {menuBarItems.map((menuItem) => (
          <div key={menuItem.label} className="relative">
            <button
              type="button"
              onClick={() =>
                setActiveMenu(
                  activeMenu === menuItem.label ? null : menuItem.label
                )
              }
              className={`px-3 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${
                activeMenu === menuItem.label
                  ? 'bg-gray-200 dark:bg-gray-700'
                  : ''
              }`}
            >
              {menuItem.label}
            </button>
            {activeMenu === menuItem.label && (
              <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded shadow-lg z-50 min-w-[200px] py-1">
                {menuItem.items.map((item, idx) => {
                  if (item.separator) {
                    return (
                      <div
                        key={idx}
                        className="h-px bg-gray-200 dark:bg-gray-700 my-1"
                      />
                    );
                  }
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        if (item.action) item.action();
                        setActiveMenu(null);
                      }}
                      disabled={item.disabled}
                      className="w-full flex items-center justify-between px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-center gap-3">
                        {item.icon && (
                          <span className="text-gray-500 dark:text-gray-400">
                            {item.icon}
                          </span>
                        )}
                        <span>{item.label}</span>
                      </div>
                      {item.shortcut && (
                        <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                          {item.shortcut}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <FiClock className="w-3 h-3" />
          <span>{currentTime}</span>
          <span className="mx-1">•</span>
          <span>{currentDate}</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center gap-1 h-10">
        <button
          type="button"
          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          title="Home (Ctrl+H)"
        >
          <FiHome className="w-4 h-4 text-gray-600 dark:text-gray-300" />
        </button>
        <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />
        {!isAdmin && (
          <button
            type="button"
            onClick={() => navigate('/selling-panel')}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            title="Selling Panel (Ctrl+S)"
          >
            <FiShoppingCart className="w-4 h-4 text-gray-600 dark:text-gray-300" />
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate('/medicines')}
          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          title="Medicines (Ctrl+M)"
        >
          <FiPackage className="w-4 h-4 text-gray-600 dark:text-gray-300" />
        </button>
        <button
          type="button"
          onClick={() => navigate('/stocks')}
          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          title="Stocks"
        >
          <FiLayers className="w-4 h-4 text-gray-600 dark:text-gray-300" />
        </button>
        {!isCashier && (
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            title="Dashboard (Ctrl+D)"
          >
            <FiBarChart2 className="w-4 h-4 text-gray-600 dark:text-gray-300" />
          </button>
        )}
        <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />
        <button
          type="button"
          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          title="Refresh (Ctrl+R)"
        >
          <FiRefreshCw className="w-4 h-4 text-gray-600 dark:text-gray-300" />
        </button>
        <div className="flex-1" />
        {!isAdmin && (
          <button
            type="button"
            onClick={() => navigate('/alerts')}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors relative"
            title="Alerts"
          >
            <FiAlertTriangle className="w-4 h-4 text-gray-600 dark:text-gray-300" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />
          </button>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div
          className={`${
            isSidebarCollapsed ? 'w-16' : 'w-64'
          } flex-shrink-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-all duration-300 overflow-hidden`}
        >
          {/* Sidebar Header + Collapse Toggle */}
          <div
            className={`h-14 px-3 border-b border-gray-200 dark:border-gray-700 flex items-center ${
              isSidebarCollapsed ? 'justify-center' : 'justify-between'
            }`}
          >
            {!isSidebarCollapsed && (
              <span className="pl-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Modules
              </span>
            )}
            <button
              type="button"
              onClick={toggleSidebar}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-300 transition-colors"
              title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isSidebarCollapsed ? (
                <FiChevronRight className="w-4 h-4" />
              ) : (
                <FiChevronLeft className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-2">
            {categories.map((category) => {
              // Only the active category's list is open, and it always is.
              const isExpanded =
                !isSidebarCollapsed && activeCategory === category.id;
              const categoryModules = getCategoryModules(category.id);
              return (
                <div key={category.id}>
                  <button
                    type="button"
                    onClick={() => handleSidebarCategoryClick(category.id)}
                    title={isSidebarCollapsed ? category.label : undefined}
                    className={`w-full flex items-center ${
                      isSidebarCollapsed ? 'justify-center' : 'justify-between'
                    } px-4 py-2.5 text-sm transition-colors ${
                      activeCategory === category.id
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-l-2 border-blue-500'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <category.icon className="w-4 h-4" />
                      {!isSidebarCollapsed && (
                        <span className="font-medium">{category.label}</span>
                      )}
                    </div>
                    {!isSidebarCollapsed && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {categoryModules.length}
                        </span>
                        <FiChevronDown
                          className={`w-4 h-4 text-gray-400 transition-transform ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                        />
                      </div>
                    )}
                  </button>
                  {isExpanded && (
                    <div className="py-1 bg-gray-50/60 dark:bg-gray-900/30">
                      {categoryModules.length === 0 ? (
                        <p className="pl-11 pr-4 py-2 text-xs text-gray-400 dark:text-gray-500">
                          No modules found
                        </p>
                      ) : (
                        categoryModules.map((module) => (
                          <button
                            key={module.id}
                            type="button"
                            onClick={() => handleModuleClick(module)}
                            className="w-full flex items-center gap-3 pl-8 pr-4 py-2 text-sm text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                          >
                            <span
                              className={`w-6 h-6 flex-shrink-0 bg-gradient-to-br ${module.color} rounded flex items-center justify-center text-white`}
                            >
                              <span className="scale-75">{module.icon}</span>
                            </span>
                            <span className="truncate">{module.title}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Sidebar Footer */}
          <div className="p-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
            <button
              type="button"
              title={isSidebarCollapsed ? 'Refresh' : undefined}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded text-sm font-medium transition-colors"
            >
              <FiRefreshCw className="w-4 h-4" />
              {!isSidebarCollapsed && <span>Refresh</span>}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              title={isSidebarCollapsed ? 'Logout' : undefined}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-700 dark:text-red-400 rounded text-sm font-medium transition-colors border border-red-200 dark:border-red-800"
            >
              <FiLogOut className="w-4 h-4" />
              {!isSidebarCollapsed && <span>Logout</span>}
            </button>
          </div>
        </div>

        {/* Main Area */}
        <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
          <div
            className={`${isSidebarCollapsed ? '' : 'max-w-7xl'} mx-auto p-6`}
          >
            {/* Page Header */}
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex-shrink-0 flex items-center gap-1 p-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setActiveCategory(category.id)}
                    title={`${category.label} (${category.shortcut})`}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      activeCategory === category.id
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    <category.icon className="w-4 h-4" />
                    <span>{category.label}</span>
                  </button>
                ))}
              </div>
              <div className="flex-1 flex items-center gap-3">
                <div className="relative flex-1">
                  <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search modules..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                      title="Clear search"
                    >
                      <FiX className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div
                  className="relative flex-shrink-0"
                  ref={notificationMenuRef}
                >
                  <button
                    type="button"
                    onClick={() => setNotificationsOpen((prev) => !prev)}
                    className="relative p-2.5 rounded-lg bg-transparent border border-transparent hover:border-gray-200 dark:hover:border-gray-700 transition-all duration-200 group"
                    title="Alerts"
                    aria-label="View alerts"
                  >
                    <FiBell className="w-5 h-5 text-gray-600 dark:text-gray-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors" />
                    {alertCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 bg-gradient-to-r from-red-500 to-red-600 text-white text-[10px] font-bold rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center shadow-lg">
                        {Math.min(alertCount, 9)}
                        {alertCount > 9 ? '+' : ''}
                      </span>
                    )}
                  </button>
                  {notificationsOpen && (
                    <div className="absolute right-0 mt-1 w-80 bg-white dark:bg-[#1a2130] rounded-lg shadow-2xl border border-gray-200 dark:border-[#242d3d] z-50 overflow-hidden">
                      <div className="px-4 py-2.5">
                        <p className="text-[13px] font-bold text-gray-800 dark:text-white flex items-center gap-2">
                          <FiBell className="w-3.5 h-3.5 text-emerald-500 dark:text-blue-400" />
                          Alerts & Notifications
                        </p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 font-semibold">
                          {alertCount > 0
                            ? `${alertCount} active alert${
                                alertCount > 1 ? 's' : ''
                              } require attention.`
                            : 'All medicines are healthy for now.'}
                        </p>
                      </div>
                      <div className="bg-gray-50 dark:bg-[#151b27] border-y border-gray-100 dark:border-[#242d3d]">
                        {alertCount > 0 ? (
                          <div className="max-h-64 overflow-y-auto divide-y divide-gray-100 dark:divide-[#242d3d]">
                            {expiringAlerts.slice(0, 3).map((alert) => (
                              <div
                                key={`exp-${alert.id}`}
                                className="px-4 py-2.5"
                              >
                                <p className="text-xs font-bold text-gray-700 dark:text-white">
                                  {alert.name}
                                </p>
                                <div className="text-[10px] mt-0.5 flex justify-between font-bold">
                                  <span className="text-amber-500">
                                    ⏰ Expiring
                                  </span>
                                  <span className="text-orange-600 dark:text-orange-500/60">
                                    {Math.max(alert.daysUntilExpiry, 0)} days
                                    left
                                  </span>
                                </div>
                              </div>
                            ))}
                            {lowStockAlerts.slice(0, 3).map((alert) => (
                              <div
                                key={`ls-${alert.id}`}
                                className="px-4 py-2.5"
                              >
                                <p className="text-xs font-bold text-gray-700 dark:text-white">
                                  {alert.name}
                                </p>
                                <div className="text-[10px] mt-0.5 flex justify-between font-bold">
                                  <span className="text-red-500">
                                    📦 Low Stock
                                  </span>
                                  <span className="text-red-600 dark:text-red-400">
                                    {alert.sellablePills} /{' '}
                                    {alert.minimumStockLevel} pills
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="px-4 py-6 text-xs text-gray-400 dark:text-gray-500 text-center font-semibold">
                            No alerts detected.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {currentUser && (
                  <div className="relative flex-shrink-0" ref={profileMenuRef}>
                    <button
                      type="button"
                      onClick={() => setProfileMenuOpen((prev) => !prev)}
                      className="flex items-center gap-2 p-1.5 pr-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-emerald-300 dark:hover:border-emerald-700 shadow-sm transition-all duration-200 group"
                    >
                      <div className="relative">
                        <img
                          src={
                            currentUser.profilePicture ||
                            'https://i.pravatar.cc/40?img=32'
                          }
                          alt="avatar"
                          className="w-8 h-8 rounded-full object-cover shadow-md ring-2 ring-emerald-100 dark:ring-emerald-900/50 group-hover:ring-emerald-300 dark:group-hover:ring-emerald-700 transition-all"
                        />
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-gray-800 rounded-full shadow-sm" />
                      </div>
                      <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                        {roleLabel}
                      </span>
                      <FiChevronDown
                        className={`w-4 h-4 text-gray-400 dark:text-gray-500 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-transform ${
                          profileMenuOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    {profileMenuOpen && (
                      <div className="absolute right-0 mt-1 w-60 bg-white dark:bg-[#1a2130] rounded-lg shadow-2xl border border-gray-200 dark:border-[#242d3d] z-50 overflow-hidden">
                        <div className="px-5 py-4 flex items-center gap-3">
                          <img
                            src={
                              currentUser.profilePicture ||
                              'https://i.pravatar.cc/80?img=32'
                            }
                            alt="avatar"
                            className="w-10 h-10 rounded-full object-cover border-2 border-emerald-500/20"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-gray-800 dark:text-white truncate">
                              {currentUser.name || 'User'}
                            </div>
                            <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mt-0.5">
                              {isAdmin ? 'Administrator' : roleLabel}
                            </div>
                          </div>
                        </div>
                        <div className="px-4 py-2 bg-gray-50 dark:bg-[#151b27] border-y border-gray-100 dark:border-[#242d3d]">
                          <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-tight">
                            Signed in as
                          </div>
                          <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 truncate mt-0.5">
                            {currentUser.email}
                          </div>
                        </div>
                        <div className="p-1.5 space-y-1">
                          <button
                            type="button"
                            onClick={() => {
                              setProfileMenuOpen(false);
                              navigate('/settings', {
                                state: { section: 'profile' },
                              });
                            }}
                            className="w-full h-9 flex items-center px-3 gap-3 rounded-lg hover:bg-emerald-500/5 text-gray-600 dark:text-gray-300 text-sm font-medium transition-all"
                          >
                            <FiUser className="w-4 h-4 text-emerald-500/70" />
                            Profile
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setProfileMenuOpen(false);
                              navigate('/settings', {
                                state: { section: 'appearance' },
                              });
                            }}
                            className="w-full h-9 flex items-center px-3 gap-3 rounded-lg hover:bg-emerald-500/5 text-gray-600 dark:text-gray-300 text-sm font-medium transition-all"
                          >
                            <FiSun className="w-4 h-4 text-emerald-500/70" />
                            Theme
                          </button>
                          <div className="h-px bg-gray-100 dark:bg-[#242d3d] my-1 mx-2" />
                          <button
                            type="button"
                            onClick={() => {
                              setProfileMenuOpen(false);
                              handleLogout();
                            }}
                            className="w-full h-9 flex items-center justify-center gap-2 rounded-lg bg-red-500/5 hover:bg-red-500/10 text-red-500 text-sm font-medium transition-all border border-red-500/10"
                          >
                            <FiLogOut className="w-4 h-4" />
                            Logout
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-6 items-start">
              <div className="flex-1 min-w-0">
                {/* Quick Access */}
                {activeCategory === 'all' && quickAccessModules.length > 0 && (
                  <div className="mb-8">
                    <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                      Quick Access
                    </h2>
                    <div
                      className={`grid grid-cols-1 gap-3 ${
                        quickAccessModules.length >= 3
                          ? 'md:grid-cols-3'
                          : 'md:grid-cols-2'
                      }`}
                    >
                      {quickAccessModules.map(renderModuleCard)}
                    </div>
                  </div>
                )}

                {/* Module Grid */}
                {activeCategory === 'all' && remainingModules.length > 0 && (
                  <>
                    <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                      All Modules
                    </h2>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                      {remainingModules.map(renderModuleCard)}
                    </div>
                  </>
                )}

                {activeCategory !== 'all' && (
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredModules.map(renderModuleCard)}
                  </div>
                )}

                {filteredModules.length === 0 && (
                  <div className="text-center py-16">
                    <FiAlertCircle className="w-12 h-12 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      No modules found
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Try adjusting your search or category filter
                    </p>
                  </div>
                )}
              </div>

              {/* Calendar & Clock */}
              <aside className="hidden lg:block w-80 flex-shrink-0 sticky top-0">
                <CalendarPanel
                  userName={currentUser?.name}
                  expiringCount={expiringAlerts.length}
                  lowStockCount={lowStockAlerts.length}
                />
              </aside>
            </div>
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div
        className={`flex-shrink-0 border-t px-4 py-1.5 flex items-center justify-between text-[10px] font-semibold transition-all duration-300 ${
          theme === 'light'
            ? 'bg-black border-gray-700 text-white'
            : 'bg-white/90 border-gray-300 text-black'
        }`}
      >
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2">
            <div
              className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                theme === 'light'
                  ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.7)]'
                  : 'bg-green-600 shadow-[0_0_8px_rgba(22,163,74,0.7)]'
              }`}
            />
            <span>System Online</span>
          </span>
          <span>v2.0.1</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-4">
            <span>Developed By</span>
            <span
              className={`w-px h-3 ${
                theme === 'light' ? 'bg-white' : 'bg-black'
              }`}
            />
            <span>Innovation Technology</span>
            <a
              href="mailto:innovationtechnology.dev@gmail.com"
              target="_blank"
              rel="noopener noreferrer"
              title="Open Email"
              className={`flex items-center gap-1.5 transition-colors  cursor-pointer ${
                theme === 'light'
                  ? 'hover:text-emerald-400'
                  : 'hover:text-emerald-600'
              }`}
            >
              <FiMail className="w-3" />
              innovationtechnology.dev@gmail.com
            </a>
            <a
              href="https://wa.me/923205720774"
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-1.5 transition-colors  cursor-pointer ${
                theme === 'light'
                  ? 'hover:text-emerald-400'
                  : 'hover:text-emerald-600'
              }`}
              title="Open WhatsApp"
            >
              <FiPhone className="w-3" />
              (+92) 3205720-774
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MainMenu;
