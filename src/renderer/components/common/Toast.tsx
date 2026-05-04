import React, { useEffect, useCallback, useState } from 'react';
import { FiX, FiAlertCircle } from 'react-icons/fi';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastProps {
  toast: Toast;
  onClose: (id: string) => void;
}

const EXIT_DURATION_MS = 300;

const ToastItem: React.FC<ToastProps> = ({ toast, onClose }) => {
  const [dismissing, setDismissing] = useState(false);

  const dismiss = useCallback(() => {
    setDismissing(true);
    setTimeout(() => onClose(toast.id), EXIT_DURATION_MS);
  }, [toast.id, onClose]);

  useEffect(() => {
    const defaultDuration =
      toast.type === 'error' || toast.type === 'warning' ? 5000 : 3000;
    const timer = setTimeout(dismiss, toast.duration ?? defaultDuration);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, dismiss]);

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return <span className="text-emerald-600">✓</span>;
      case 'error':
        return <FiAlertCircle className="w-5 h-5" />;
      case 'warning':
        return <FiAlertCircle className="w-5 h-5" />;
      case 'info':
        return <span className="text-blue-600">ℹ</span>;
      default:
        return <span className="text-gray-600">ℹ</span>;
    }
  };

  const getStyles = () => {
    switch (toast.type) {
      case 'success':
        return 'bg-emerald-50 border-emerald-200 text-emerald-800';
      case 'error':
        return 'bg-red-50 border-red-200 text-red-800';
      case 'warning':
        return 'bg-amber-50 border-amber-200 text-amber-800';
      case 'info':
        return 'bg-blue-50 border-blue-200 text-blue-800';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-800';
    }
  };

  return (
    <div
      className={`${getStyles()} border-l-4 rounded-lg shadow-lg p-3 sm:p-4 mb-3 flex items-center gap-2 sm:gap-3 w-[280px] sm:w-[320px] md:w-[360px] lg:w-[400px] xl:w-[440px] 2xl:w-[480px] ${dismissing ? 'animate-slide-out-right' : 'animate-slide-in-right'}`}
    >
      <div className="flex-shrink-0">{getIcon()}</div>
      <div className="flex-1 text-xs sm:text-sm font-medium break-words">{toast.message}</div>
      <button
        onClick={dismiss}
        className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
      >
        <FiX className="w-4 h-4" />
      </button>
    </div>
  );
};

interface ToastContainerProps {
  toasts: Toast[];
  onClose: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onClose }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-2 sm:top-4 right-2 sm:right-4 z-[10000] flex flex-col items-end max-w-[calc(100vw-1rem)] sm:max-w-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={onClose} />
      ))}
    </div>
  );
};

// Hook for managing toasts
export const useToast = () => {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info', duration?: number) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: Toast = { id, message, type, duration };
    setToasts((prev) => [...prev, newToast]);
    return id;
  }, []);

  const success = useCallback((message: string, duration?: number) => showToast(message, 'success', duration), [showToast]);
  const error = useCallback((message: string, duration?: number) => showToast(message, 'error', duration), [showToast]);
  const warning = useCallback((message: string, duration?: number) => showToast(message, 'warning', duration), [showToast]);
  const info = useCallback((message: string, duration?: number) => showToast(message, 'info', duration), [showToast]);

  return {
    toasts,
    showToast,
    removeToast,
    success,
    error,
    warning,
    info,
  };
};

export default ToastContainer;

