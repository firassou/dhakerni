"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useI18n } from "@/lib/i18n";

interface ToastInput {
  message: string;
  /** Shown as a button; runs when pressed. */
  action?: { label: string; run: () => void };
}
interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<{ show: (t: ToastInput) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<ToastItem | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const seq = useRef(0);

  const dismiss = useCallback(() => setItem(null), []);
  const show = useCallback(
    (t: ToastInput) => {
      clearTimeout(timer.current);
      setItem({ ...t, id: ++seq.current });
      timer.current = setTimeout(dismiss, 6000);
    },
    [dismiss],
  );

  useEffect(() => () => clearTimeout(timer.current), []);
  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+104px)] z-30 flex justify-center px-4"
      >
        {item && (
          <div
            key={item.id}
            className="toast glass pointer-events-auto flex items-center gap-3 rounded-full py-1.5 ps-5 pe-1.5"
          >
            <span className="t-small" data-bidi>
              {item.message}
            </span>
            {item.action && (
              <button
                onClick={() => {
                  item.action?.run();
                  dismiss();
                }}
                className="t-small bg-ink text-paper rounded-full px-4 py-2 font-medium active:scale-95"
              >
                {item.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

/** Convenience: toast with a localized Undo button. */
export function useUndoToast() {
  const { show } = useToast();
  const { t } = useI18n();
  return useCallback(
    (message: string, undo: () => void) =>
      show({ message, action: { label: t("toast.undo"), run: undo } }),
    [show, t],
  );
}
