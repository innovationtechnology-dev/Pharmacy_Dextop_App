import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
  FiClock,
  FiCalendar,
  FiArrowLeft,
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
  FiX
} from 'react-icons/fi';

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

const MainMenu: React.FC = () => {
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);

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
      if (menuBarRef.current && !menuBarRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const categories = [
    { id: 'all', label: 'All Modules', icon: FiDatabase, shortcut: 'Ctrl+1' },
    { id: 'operations', label: 'Operations', icon: FiPackage, shortcut: 'Ctrl+2' },
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
      disabled: isAdmin,
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
      id: 'purchasing-panel',
      title: 'Purchasing Panel',
      icon: <FiPackage className="w-5 h-5" />,
      color: 'from-amber-500 to-amber-600',
      gradient: 'bg-gradient-to-br from-amber-500/10 to-amber-600/10',
      description: 'Purchase Management',
      route: '/purchasing-panel',
      shortcut: 'Ctrl+P',
      disabled: isAdmin,
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
      disabled: isAdmin,
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
      disabled: isAdmin,
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
      disabled: isCashier,
    },
  ];

  const allModules = [
    ...operationsModules,
    ...reportModules,
    ...settingsModules
  ];

  const filteredModules = allModules.filter((module) => {
    const matchesCategory =
      activeCategory === 'all' ||
      (activeCategory === 'operations' && operationsModules.includes(module)) ||
      (activeCategory === 'reports' && reportModules.includes(module)) ||
      (activeCategory === 'settings' && settingsModules.includes(module));
    const matchesSearch = module.title
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch && !module.disabled;
  });

  const quickAccessModules = [
    !isAdmin ? allModules.find((m) => m.id === 'selling-panel') : null,
    allModules.find((m) => m.id === 'medicines'),
    !isCashier ? allModules.find((m) => m.id === 'dashboard') : null,
  ].filter(Boolean) as MenuItem[];

  const handleModuleClick = (module: MenuItem) => {
    if (module.disabled) return;
    if (module.route) {
      navigate(module.route);
    }
  };

  const handleLogout = () => {
    authLogout();
    navigate('/login');
  };

  const menuBarItems: MenuBarItem[] = [
    {
      label: 'File',
      items: [
        { label: 'New Transaction', shortcut: 'Ctrl+N', icon: <FiPlus className="w-4 h-4" /> },
        { label: 'Open', shortcut: 'Ctrl+O', icon: <FiUpload className="w-4 h-4" /> },
        { label: '', separator: true },
        { label: 'Save', shortcut: 'Ctrl+S', icon: <FiSave className="w-4 h-4" /> },
        { label: 'Export', shortcut: 'Ctrl+E', icon: <FiDownload className="w-4 h-4" /> },
        { label: 'Print', shortcut: 'Ctrl+P', icon: <FiPrinter className="w-4 h-4" /> },
        { label: '', separator: true },
        { label: 'Exit', action: handleLogout, icon: <FiX className="w-4 h-4" /> },
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
        { label: 'Find', shortcut: 'Ctrl+F', icon: <FiSearch className="w-4 h-4" /> },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Refresh', shortcut: 'Ctrl+R', icon: <FiRefreshCw className="w-4 h-4" /> },
        { label: '', separator: true },
        { label: 'All Modules', shortcut: 'Ctrl+1', action: () => setActiveCategory('all') },
        { label: 'Operations', shortcut: 'Ctrl+2', action: () => setActiveCategory('operations') },
        { label: 'Reports', shortcut: 'Ctrl+3', action: () => setActiveCategory('reports') },
        { label: 'Settings', shortcut: 'Ctrl+4', action: () => setActiveCategory('settings') },
      ],
    },
    {
      label: 'Tools',
      items: [
        { label: 'Dashboard', shortcut: 'Ctrl+D', action: () => navigate('/dashboard') },
        { label: 'Settings', shortcut: 'Ctrl+,', action: () => navigate('/settings') },
        { label: '', separator: true },
        { label: 'Alerts', shortcut: 'Ctrl+A', action: () => navigate('/alerts') },
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
      {/* Menu Bar */}
      <div 
        ref={menuBarRef}
        className="flex-shrink-0 bg-gray-100 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700 px-2 h-7 flex items-center text-xs font-medium text-gray-700 dark:text-gray-300 select-none"
      >
        {menuBarItems.map((menuItem) => (
          <div key={menuItem.label} className="relative">
            <button
              type="button"
              onClick={() => setActiveMenu(activeMenu === menuItem.label ? null : menuItem.label)}
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
                        {item.icon && <span className="text-gray-500 dark:text-gray-400">{item.icon}</span>}
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
        <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
          {/* Search */}
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search modules..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-2">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setActiveCategory(category.id)}
                className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${
                  activeCategory === category.id
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-l-2 border-blue-500'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <category.icon className="w-4 h-4" />
                  <span className="font-medium">{category.label}</span>
                </div>
                {category.shortcut && (
                  <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                    {category.shortcut.split('+')[1]}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* Sidebar Footer */}
          <div className="p-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
            <button
              type="button"
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded text-sm font-medium transition-colors"
            >
              <FiRefreshCw className="w-4 h-4" />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-700 dark:text-red-400 rounded text-sm font-medium transition-colors border border-red-200 dark:border-red-800"
            >
              <FiLogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>

        {/* Main Area */}
        <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
          <div className="max-w-7xl mx-auto p-6">
            {/* Page Header */}
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                  {categories.find((c) => c.id === activeCategory)?.label || 'All Modules'}
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {activeCategory === 'all' && 'Access all your business management modules'}
                  {activeCategory === 'operations' && 'Daily operations and transaction management'}
                  {activeCategory === 'reports' && 'Analytics, reports and business insights'}
                  {activeCategory === 'settings' && 'System configuration and preferences'}
                </p>
              </div>
              {currentUser && (
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 text-xs font-medium shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>{currentUser.name || 'User'}</span>
                  <span className="w-px h-3 bg-emerald-300/70 dark:bg-emerald-600/70" />
                  <span className="uppercase tracking-wide">{roleLabel}</span>
                </div>
              )}
            </div>

            {/* Quick Access */}
            {activeCategory === 'all' && quickAccessModules.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                  Quick Access
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {quickAccessModules.map((module) => (
                    <button
                      key={module.id}
                      type="button"
                      onClick={() => handleModuleClick(module)}
                      className="group relative p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-md transition-all text-left"
                    >
                      <div className={`w-10 h-10 bg-gradient-to-br ${module.color} rounded-lg flex items-center justify-center text-white mb-3 shadow-sm`}>
                        {module.icon}
                      </div>
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                        {module.title}
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        {module.description}
                      </p>
                      {module.shortcut && (
                        <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                          {module.shortcut}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Module Grid */}
            {activeCategory === 'all' && filteredModules.length > quickAccessModules.length && (
              <>
                <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                  All Modules
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {filteredModules
                    .filter((m) => !quickAccessModules.some((q) => q.id === m.id))
                    .map((module) => (
                      <button
                        key={module.id}
                        type="button"
                        onClick={() => handleModuleClick(module)}
                        disabled={module.disabled}
                        className={`group relative p-4 border rounded-lg text-left transition-all ${
                          module.disabled
                            ? 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 opacity-60 cursor-not-allowed'
                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-md'
                        }`}
                      >
                        <div className={`w-10 h-10 bg-gradient-to-br ${module.color} rounded-lg flex items-center justify-center text-white mb-3 shadow-sm ${
                          !module.disabled && 'group-hover:scale-105 transition-transform'
                        }`}>
                          {module.icon}
                        </div>
                        <h3 className={`text-sm font-semibold mb-1 ${
                          module.disabled
                            ? 'text-gray-400 dark:text-gray-600'
                            : 'text-gray-900 dark:text-white'
                        }`}>
                          {module.title}
                        </h3>
                        <p className={`text-xs mb-2 ${
                          module.disabled
                            ? 'text-gray-400 dark:text-gray-600'
                            : 'text-gray-500 dark:text-gray-400'
                        }`}>
                          {module.description}
                        </p>
                        {module.shortcut && !module.disabled && (
                          <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                            {module.shortcut}
                          </span>
                        )}
                      </button>
                    ))}
                </div>
              </>
            )}

            {activeCategory !== 'all' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {filteredModules.map((module) => (
                  <button
                    key={module.id}
                    type="button"
                    onClick={() => handleModuleClick(module)}
                    disabled={module.disabled}
                    className={`group relative p-4 border rounded-lg text-left transition-all ${
                      module.disabled
                        ? 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 opacity-60 cursor-not-allowed'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-md'
                    }`}
                  >
                    <div className={`w-10 h-10 bg-gradient-to-br ${module.color} rounded-lg flex items-center justify-center text-white mb-3 shadow-sm ${
                      !module.disabled && 'group-hover:scale-105 transition-transform'
                    }`}>
                      {module.icon}
                    </div>
                    <h3 className={`text-sm font-semibold mb-1 ${
                      module.disabled
                        ? 'text-gray-400 dark:text-gray-600'
                        : 'text-gray-900 dark:text-white'
                    }`}>
                      {module.title}
                    </h3>
                    <p className={`text-xs mb-2 ${
                      module.disabled
                        ? 'text-gray-400 dark:text-gray-600'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}>
                      {module.description}
                    </p>
                    {module.shortcut && !module.disabled && (
                      <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                        {module.shortcut}
                      </span>
                    )}
                  </button>
                ))}
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
        </div>
      </div>

      {/* Status Bar */}
      <div className="flex-shrink-0 bg-gray-100 dark:bg-gray-800 border-t border-gray-300 dark:border-gray-700 px-4 py-1.5 flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full" />
            <span className="font-medium">System Online</span>
          </span>
          <span>v2.0.1</span>
          <span>Build 2025.01</span>
          {currentUser && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200">
              <span className="font-semibold">{currentUser.name || 'User'}</span>
              <span className="w-px h-3 bg-gray-400 dark:bg-gray-500" />
              <span>{roleLabel}</span>
            </span>
          )}
        </div>
        <div>
          <span>© 2025 Pharmacy Management System</span>
        </div>
      </div>
    </div>
  );
};

export default MainMenu;