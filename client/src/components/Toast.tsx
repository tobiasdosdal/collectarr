import { useEffect, useState, createContext, useContext, ReactNode, useRef } from 'react';
import { CheckCircle, XCircle, X, Info, AlertTriangle } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  duration: number;
}

interface ToastContextType {
  addToast: (message: string, type?: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timeoutIdsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const addToast = (message: string, type: ToastType = 'success', duration = 3000) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type, duration }]);

    const timeoutId = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      timeoutIdsRef.current.delete(timeoutId);
    }, duration);
    timeoutIdsRef.current.add(timeoutId);
  };

  useEffect(() => {
    const ids = timeoutIdsRef.current;
    return () => {
      ids.forEach(id => clearTimeout(id));
      ids.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="toast-container">
        {toasts.map(toast => {
          let Icon;
          switch (toast.type) {
            case 'success': Icon = CheckCircle; break;
            case 'error': Icon = XCircle; break;
            case 'warning': Icon = AlertTriangle; break;
            case 'info': default: Icon = Info; break;
          }

          return (
            <div
              key={toast.id}
              className={`toast toast-${toast.type}`}
              role="status"
              aria-live="polite"
            >
              <Icon size={20} aria-hidden="true" />
              <span>{toast.message}</span>
              <button
                onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                aria-label="Close notification"
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

interface ToastProps {
  message: string;
  type?: ToastType;
  duration?: number;
  onClose?: () => void;
}

export function Toast({ message, type = 'success', duration = 3000 }: ToastProps) {
  const { addToast } = useToast();

  useEffect(() => {
    addToast(message, type, duration);
  }, [message, type, duration, addToast]);

  return null;
}
