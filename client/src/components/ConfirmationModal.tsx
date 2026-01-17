import { FC, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmationModalProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDangerous?: boolean;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}

export const ConfirmationModal: FC<ConfirmationModalProps> = ({
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDangerous = false,
  onConfirm,
  onCancel,
}) => {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '400px' }}
      >
        <div className="modal-header">
          <h2 className="flex items-center gap-2">
            {isDangerous && <AlertTriangle size={20} className="text-destructive" />}
            {title}
          </h2>
          <button className="modal-close" onClick={onCancel} disabled={loading}>
            <X size={18} />
          </button>
        </div>

        <div className="p-5 sm:p-6">
          <p className="text-muted-foreground text-sm leading-relaxed">{message}</p>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 mt-6 pt-4 border-t border-border/30">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onCancel}
              disabled={loading}
            >
              {cancelText}
            </button>
            <button
              type="button"
              className={`btn ${isDangerous ? 'btn-danger' : 'btn-primary'}`}
              onClick={handleConfirm}
              disabled={loading}
            >
              {loading ? 'Please wait...' : confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Hook for easier usage
interface UseConfirmationOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDangerous?: boolean;
}

interface UseConfirmationReturn {
  showConfirmation: boolean;
  confirm: () => void;
  handleConfirm: () => void;
  handleCancel: () => void;
  ConfirmationDialog: FC<{ onConfirm: () => Promise<void> | void }>;
}

export function useConfirmation(options: UseConfirmationOptions): UseConfirmationReturn {
  const [showConfirmation, setShowConfirmation] = useState(false);

  const confirm = () => setShowConfirmation(true);
  const handleCancel = () => setShowConfirmation(false);
  const handleConfirm = () => setShowConfirmation(false);

  const ConfirmationDialog: FC<{ onConfirm: () => Promise<void> | void }> = ({ onConfirm }) => {
    if (!showConfirmation) return null;

    return (
      <ConfirmationModal
        {...options}
        onConfirm={async () => {
          await onConfirm();
          setShowConfirmation(false);
        }}
        onCancel={handleCancel}
      />
    );
  };

  return {
    showConfirmation,
    confirm,
    handleConfirm,
    handleCancel,
    ConfirmationDialog,
  };
}

export default ConfirmationModal;
