import { ReactNode } from 'react';
import { useOutletContext } from 'react-router-dom';

export type DashboardHeaderConfig = {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
};

export type ExpiringAlert = {
  id: number;
  name: string;
  barcode?: string;
  nextExpiryDate: string;
  availablePills: number;
  daysUntilExpiry: number;
};

export type DashboardHeaderContextValue = {
  setHeader: (config: DashboardHeaderConfig | null) => void;
  expiringAlerts: ExpiringAlert[];
  refreshExpiringAlerts: () => void;
  alertThresholdDays: number;
};

export const useDashboardHeader = () => {
  return useOutletContext<DashboardHeaderContextValue>();
};

