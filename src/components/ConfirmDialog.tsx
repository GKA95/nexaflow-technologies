import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-[#080D2B] border border-[#DCE3F2] dark:border-[#1A2550] p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3
              id="confirm-dialog-title"
              className="text-base font-semibold text-[#070B24] dark:text-[#F7F8FF]"
            >
              {title}
            </h3>
            <p className="mt-1.5 text-sm text-[#4A5578] dark:text-[#AEB8D4] leading-relaxed">
              {message}
            </p>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-[#DCE3F2] dark:border-[#1A2550] text-[#070B24] dark:text-[#F7F8FF] hover:bg-[#EEF2FA] dark:hover:bg-[#10183A] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors ${
              destructive
                ? 'bg-[#DC2626] hover:bg-[#B91C1C]'
                : 'bg-[#176BFF] hover:bg-[#0F56D6]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
