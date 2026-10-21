/**
 * Module permissions
 * Admins always see every module. Which modules a cashier may open is chosen by
 * an admin in Settings → User Permissions and stored on the main computer, so
 * it applies to every computer on the network.
 */
import { User } from './auth';

export type PermissionGroup = 'operations' | 'reports' | 'settings';

export interface PermissionModule {
  id: string;
  label: string;
  description: string;
  route: string;
  group: PermissionGroup;
  /** Whether cashiers can open it before an admin has changed anything. */
  cashierDefault: boolean;
}

export const PERMISSION_MODULES: PermissionModule[] = [
  { id: 'selling-panel', label: 'Selling Panel', description: 'Point of sale and billing', route: '/selling-panel', group: 'operations', cashierDefault: true },
  { id: 'purchasing-panel', label: 'Purchasing Panel', description: 'Record purchases from suppliers', route: '/purchasing-panel', group: 'operations', cashierDefault: true },
  { id: 'medicines', label: 'Medicines', description: 'Inventory management', route: '/medicines', group: 'operations', cashierDefault: true },
  { id: 'stocks', label: 'Stocks', description: 'Stock monitoring', route: '/stocks', group: 'operations', cashierDefault: true },
  { id: 'customers', label: 'Customers', description: 'Customer database', route: '/customers', group: 'operations', cashierDefault: true },
  { id: 'suppliers', label: 'Suppliers', description: 'Vendor management', route: '/suppliers', group: 'operations', cashierDefault: true },
  { id: 'sale-return', label: 'Sale Return', description: 'Process returns', route: '/sale-return', group: 'operations', cashierDefault: true },
  { id: 'payments', label: 'Payments', description: 'Supplier payments and ledgers', route: '/payments', group: 'operations', cashierDefault: false },
  { id: 'alerts', label: 'Alerts', description: 'Expiry and low-stock notifications', route: '/alerts', group: 'operations', cashierDefault: true },
  { id: 'dashboard', label: 'Dashboard', description: 'Overview and analytics', route: '/dashboard', group: 'reports', cashierDefault: false },
  { id: 'financial-summary', label: 'Financial Summary', description: 'Revenue, cost and profit', route: '/financial-summary', group: 'reports', cashierDefault: false },
  { id: 'sale-report', label: 'Sale Report', description: 'Sales analytics', route: '/sales', group: 'reports', cashierDefault: true },
  { id: 'purchase-report', label: 'Purchase Report', description: 'Purchase analytics', route: '/purchases', group: 'reports', cashierDefault: true },
  { id: 'medicine-analytics', label: 'Medicine Analytics', description: 'Drug performance insights', route: '/medicine-analytics', group: 'reports', cashierDefault: false },
  { id: 'settings', label: 'Settings', description: 'Profile, pharmacy and appearance', route: '/settings', group: 'settings', cashierDefault: true },
];

/** Not permission controlled: cashiers must be able to renew an expired license. */
const ALWAYS_ALLOWED_MODULE = 'license';

export type CashierPermissions = Record<string, boolean>;

const STORAGE_KEY = 'cashierPermissions';
export const PERMISSIONS_UPDATED_EVENT = 'permissions-updated';

export const getDefaultCashierPermissions = (): CashierPermissions =>
  PERMISSION_MODULES.reduce<CashierPermissions>((acc, m) => {
    acc[m.id] = m.cashierDefault;
    return acc;
  }, {});

const withDefaults = (saved?: CashierPermissions | null): CashierPermissions => ({
  ...getDefaultCashierPermissions(),
  ...(saved || {}),
});

/** Last permissions loaded from the main computer (synchronous, for rendering). */
export const getStoredCashierPermissions = (): CashierPermissions => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return withDefaults(stored ? JSON.parse(stored) : null);
  } catch {
    return getDefaultCashierPermissions();
  }
};

const storeCashierPermissions = (permissions: CashierPermissions) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(permissions));
  } catch {
    // ignore storage errors
  }
  window.dispatchEvent(new CustomEvent(PERMISSIONS_UPDATED_EVENT, { detail: permissions }));
};

export const isAdminRole = (role?: string) => role === 'admin' || role === 'super_admin';

/** Whether this user may open the module. Admins can open everything. */
export const canAccessModule = (
  user: Pick<User, 'role'> | null | undefined,
  moduleId: string,
  permissions: CashierPermissions = getStoredCashierPermissions()
): boolean => {
  if (!user) return false;
  // Everyone needs the License page to renew an expired license
  if (isAdminRole(user.role) || moduleId === ALWAYS_ALLOWED_MODULE) return true;
  return permissions[moduleId] ?? true;
};

/** The module a route belongs to, if it is permission controlled. */
export const getModuleForPath = (pathname: string): PermissionModule | undefined =>
  PERMISSION_MODULES.find((m) => pathname === m.route || pathname.startsWith(`${m.route}/`));

/** Load the permissions from the main computer and cache them. */
export const fetchCashierPermissions = (): Promise<CashierPermissions> =>
  new Promise((resolve) => {
    if (!window?.electron) {
      resolve(getStoredCashierPermissions());
      return;
    }
    window.electron.ipcRenderer.once('permissions-get-reply', (response: any) => {
      if (response?.success) {
        const permissions = withDefaults(response.permissions);
        storeCashierPermissions(permissions);
        resolve(permissions);
      } else {
        resolve(getStoredCashierPermissions());
      }
    });
    window.electron.ipcRenderer.sendMessage('permissions-get', []);
  });

/** Save new cashier permissions (admin only). */
export const saveCashierPermissions = (
  adminUserId: number,
  permissions: CashierPermissions
): Promise<{ success: boolean; error?: string }> =>
  new Promise((resolve) => {
    window.electron.ipcRenderer.once('permissions-update-reply', (response: any) => {
      if (response?.success) {
        storeCashierPermissions(withDefaults(response.permissions));
      }
      resolve(response || { success: false, error: 'No response' });
    });
    window.electron.ipcRenderer.sendMessage('permissions-update', [adminUserId, permissions] as any);
  });
