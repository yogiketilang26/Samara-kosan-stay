import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Bell, Sparkles, Activity, Calendar, X, CheckCircle, 
  AlertCircle, ShieldAlert, DollarSign, Hammer, User, Clock
} from 'lucide-react';
import { getSupabaseClient, getIsSupabaseConfigured, realtimeManager } from '../lib/supabase';
import { Booking, ActivityLog } from '../types';

export type ToastType = 'info' | 'success' | 'warning' | 'error' | 'booking' | 'activity';

export interface Toast {
  id: string;
  title: string;
  message: string;
  type: ToastType;
  timestamp: Date;
  duration?: number; // duration in ms, defaults to 5000
}

interface NotificationContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id' | 'timestamp'>) => void;
  removeToast: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Function to remove a toast
  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  // Function to add a toast
  const addToast = useCallback((toast: Omit<Toast, 'id' | 'timestamp'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newToast: Toast = {
      ...toast,
      id,
      timestamp: new Date(),
      duration: toast.duration ?? 5000,
    };

    setToasts((prev) => [...prev, newToast]);

    // Setup auto-dismissal
    if (newToast.duration && newToast.duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, newToast.duration);
    }
  }, [removeToast]);

  // Real-time integration (Supabase + Local events)
  useEffect(() => {
    const isConfigured = getIsSupabaseConfigured();
    const client = getSupabaseClient();
    let bookingChannel: any = null;
    let activityChannel: any = null;

    // A helper to translate activity action categories into nice descriptions/icons
    const handleNewActivityLog = (log: Partial<ActivityLog>) => {
      const action = log.action || 'ACTIVITY';
      const detail = log.detail || '';
      
      let title = 'Aktivitas Sistem';
      let type: ToastType = 'activity';

      if (action.includes('LOGIN')) {
        title = '🔑 Admin Masuk Sesi';
        type = 'info';
      } else if (action.includes('CREATE_BOOKING')) {
        title = '📝 Booking Dibuat';
        type = 'booking';
      } else if (action.includes('UPDATE_BOOKING')) {
        title = '🔄 Booking Diperbarui';
        type = 'booking';
      } else if (action.includes('UPDATE_PAYMENT') || action.includes('PAID')) {
        title = '💰 Pembayaran Diterima';
        type = 'success';
      } else if (action.includes('MAINTENANCE')) {
        title = '🔧 Perbaikan Unit';
        type = 'warning';
      } else if (action.includes('DELETE')) {
        title = '🗑️ Data Dihapus';
        type = 'error';
      } else if (action.includes('CREATE')) {
        title = '➕ Data Ditambahkan';
        type = 'success';
      }

      addToast({
        title,
        message: detail,
        type,
        duration: 6000, // keep activity logs a bit longer
      });
    };

    // A helper to translate booking updates into beautiful toast messages
    const handleBookingChange = (type: 'INSERT' | 'UPDATE', booking: Partial<Booking>) => {
      const tenant = booking.tenant_name || 'Pelanggan';
      const room = booking.room_number || 'N/A';
      const status = booking.status || 'pending';

      if (type === 'INSERT') {
        addToast({
          title: '🆕 Pesanan Kamar Masuk!',
          message: `${tenant} memesan Kamar ${room}. Menunggu verifikasi admin.`,
          type: 'booking',
          duration: 7000,
        });
      } else if (type === 'UPDATE') {
        let title = '🔔 Update Booking';
        let toastType: ToastType = 'info';
        let detailMsg = `Sewa ${tenant} di Kamar ${room} diperbarui.`;

        if (status === 'approved') {
          title = '✅ Booking Disetujui';
          toastType = 'success';
          detailMsg = `Booking ${tenant} untuk Kamar ${room} telah disetujui & diverifikasi!`;
        } else if (status === 'rejected') {
          title = '❌ Booking Ditolak';
          toastType = 'error';
          detailMsg = `Booking ${tenant} untuk Kamar ${room} ditolak.`;
        } else if (status === 'checkout') {
          title = '🚪 Tenant Check-out';
          toastType = 'warning';
          detailMsg = `${tenant} telah check-out dari Kamar ${room}.`;
        }

        addToast({
          title,
          message: detailMsg,
          type: toastType,
          duration: 7000,
        });
      }
    };

    // 1. SUPABASE REALTIME SUBSCRIPTION
    let unsubscribeBookings = () => {};
    let unsubscribeActivity = () => {};

    if (isConfigured && client) {
      console.log('[NOTIFICATION SYSTEM] Setting up Supabase real-time listeners via realtimeManager...');
      
      // Listen to new bookings using the centralized subscription manager to share channels and avoid WebSocket leaks
      unsubscribeBookings = realtimeManager.subscribe('bookings', {}, (payload: any) => {
        if (payload.eventType === 'POLLING_REFRESH') return;
        console.log('[NOTIFICATION SYSTEM] Received booking change:', payload);
        if (payload.eventType === 'INSERT') {
          handleBookingChange('INSERT', payload.new);
        } else if (payload.eventType === 'UPDATE') {
          handleBookingChange('UPDATE', payload.new);
        }
      });

      // Listen to new activity logs using the centralized subscription manager
      unsubscribeActivity = realtimeManager.subscribe('activity_logs', {}, (payload: any) => {
        if (payload.eventType === 'POLLING_REFRESH') return;
        console.log('[NOTIFICATION SYSTEM] Received activity log:', payload);
        if (payload.eventType === 'INSERT') {
          handleNewActivityLog(payload.new);
        }
      });
    }

    // 2. SANDBOX OFFLINE EVENT LISTENERS
    // Setup listeners for custom local events triggered from offline writes
    const handleLocalActivity = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        handleNewActivityLog(customEvent.detail);
      }
    };

    const handleLocalBooking = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        const { type, booking } = customEvent.detail;
        handleBookingChange(type, booking);
      }
    };

    window.addEventListener('samara_activity_log', handleLocalActivity);
    window.addEventListener('samara_booking_change', handleLocalBooking);

    return () => {
      // Cleanup Supabase subscriptions safely using central unsubscribe
      unsubscribeBookings();
      unsubscribeActivity();

      // Cleanup local event listeners
      window.removeEventListener('samara_activity_log', handleLocalActivity);
      window.removeEventListener('samara_booking_change', handleLocalBooking);
    };
  }, [addToast]);

  return (
    <NotificationContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used inside a NotificationProvider');
  }
  return context;
};

// --- COMPONENT: TOAST CONTAINER & CARDS ---

const ToastContainer: React.FC<{ toasts: Toast[]; removeToast: (id: string) => void }> = ({ toasts, removeToast }) => {
  return (
    <div className="fixed bottom-6 right-6 z-[99999] flex flex-col gap-3 max-w-sm w-full pointer-events-none px-4 sm:px-0">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
};

const ToastCard: React.FC<{ toast: Toast; onClose: () => void }> = ({ toast, onClose }) => {
  const [hovered, setHovered] = useState(false);

  // Pick nice background, borders, and icons
  const config = {
    booking: {
      bg: 'bg-emerald-50/95 border-emerald-100',
      text: 'text-emerald-900',
      icon: <Calendar className="w-5 h-5 text-emerald-600 animate-pulse" />,
      accent: 'bg-emerald-500',
      progressBar: 'bg-emerald-500',
    },
    activity: {
      bg: 'bg-indigo-50/95 border-indigo-100',
      text: 'text-indigo-900',
      icon: <Activity className="w-5 h-5 text-indigo-600" />,
      accent: 'bg-indigo-500',
      progressBar: 'bg-indigo-500',
    },
    success: {
      bg: 'bg-green-50/95 border-green-100',
      text: 'text-green-900',
      icon: <CheckCircle className="w-5 h-5 text-green-600" />,
      accent: 'bg-green-500',
      progressBar: 'bg-green-500',
    },
    error: {
      bg: 'bg-rose-50/95 border-rose-100',
      text: 'text-rose-900',
      icon: <ShieldAlert className="w-5 h-5 text-rose-600" />,
      accent: 'bg-rose-500',
      progressBar: 'bg-rose-500',
    },
    warning: {
      bg: 'bg-amber-50/95 border-amber-100',
      text: 'text-amber-900',
      icon: <AlertCircle className="w-5 h-5 text-amber-600" />,
      accent: 'bg-amber-500',
      progressBar: 'bg-amber-500',
    },
    info: {
      bg: 'bg-sky-50/95 border-sky-100',
      text: 'text-sky-900',
      icon: <Bell className="w-5 h-5 text-sky-600" />,
      accent: 'bg-sky-500',
      progressBar: 'bg-sky-500',
    }
  }[toast.type] || {
    bg: 'bg-white border-slate-100',
    text: 'text-slate-900',
    icon: <Bell className="w-5 h-5 text-slate-600" />,
    accent: 'bg-slate-500',
    progressBar: 'bg-slate-500',
  };

  const formattedTime = toast.timestamp.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 50, scale: 0.9, x: 20 }}
      animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.85, x: 50, transition: { duration: 0.2 } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`pointer-events-auto relative overflow-hidden backdrop-blur-md rounded-2xl border ${config.bg} shadow-xl p-4 flex gap-3 transition-shadow duration-300 ${hovered ? 'shadow-2xl' : ''}`}
    >
      {/* Accent strip on left */}
      <div className={`absolute left-0 top-0 bottom-0 w-[5px] ${config.accent}`} />

      {/* Main Content Row */}
      <div className="flex-1 flex gap-3 pl-1.5">
        <div className="flex-shrink-0 mt-0.5">
          {config.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start gap-2">
            <h4 className={`text-sm font-semibold tracking-tight ${config.text} truncate`}>
              {toast.title}
            </h4>
            <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1 flex-shrink-0">
              <Clock className="w-2.5 h-2.5" />
              {formattedTime}
            </span>
          </div>
          <p className="text-xs text-slate-600 font-normal leading-relaxed mt-1">
            {toast.message}
          </p>
        </div>
      </div>

      {/* Close button */}
      <button 
        onClick={onClose}
        className="text-slate-400 hover:text-slate-600 hover:bg-slate-100/50 p-1 rounded-full flex-shrink-0 self-start transition-colors duration-150"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      {/* Animated progress bar at the bottom */}
      {!hovered && toast.duration && (
        <motion.div 
          initial={{ width: '100%' }}
          animate={{ width: '0%' }}
          transition={{ duration: toast.duration / 1000, ease: 'linear' }}
          className={`absolute bottom-0 left-0 h-1 ${config.progressBar}`}
        />
      )}
    </motion.div>
  );
};
