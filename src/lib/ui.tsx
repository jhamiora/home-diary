import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

/* Back button closes the top overlay (sheet, viewer, markup) instead of leaving the app. */

const stack: { id: number; close: () => void }[] = [];
let nextId = 1;
let ignorePops = 0;
let afterPops: (() => void)[] = [];

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    if (ignorePops > 0) {
      ignorePops--;
      if (ignorePops === 0) {
        const run = afterPops;
        afterPops = [];
        run.forEach((fn) => fn());
      }
      return;
    }
    const top = stack.pop();
    top?.close();
  });
}

// Open the next overlay only once the last one has given back its history step.
export function afterOverlayClosed(fn: () => void) {
  setTimeout(() => (ignorePops > 0 ? afterPops.push(fn) : fn()), 0);
}

export function useBackClose(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const id = nextId++;
    const entry = { id, close: () => closeRef.current() };
    stack.push(entry);
    history.pushState({ overlay: id }, "");
    return () => {
      const i = stack.findIndex((e) => e.id === id);
      if (i !== -1) {
        // Closed from the UI, not the back button: drop our history step.
        stack.splice(i, 1);
        ignorePops++;
        history.back();
      }
    };
  }, [open]);
}

/* Toasts with optional Undo */

interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

const ToastCtx = createContext<(text: string, action?: Toast["action"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((text: string, action?: Toast["action"]) => {
    const id = Date.now() + Math.random();
    setToasts([{ id, text, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 5000 : 1800);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-[calc(10px+env(safe-area-inset-top))] z-[80] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast-in flex ${t.action ? "pointer-events-auto" : ""} w-full max-w-md items-center justify-between gap-3 rounded bg-ink px-4 py-3 text-[14px] text-white shadow-lg`}
          >
            <span>{t.text}</span>
            {t.action && (
              <button
                className="text-[14px] font-semibold text-white underline-offset-2 active:opacity-60"
                onClick={() => {
                  t.action!.run();
                  setToasts((all) => all.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* Full-screen page that slides over the tabs (phone first). */

export function Screen({
  open,
  onClose,
  title,
  right,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useBackClose(open, onClose);
  if (!open) return null;
  return (
    <div className="screen-in fixed inset-0 z-40 flex flex-col bg-white">
      <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-line px-2 pt-[env(safe-area-inset-top)]">
        <button aria-label="Back" className="icon-btn" onClick={onClose}>
          <X size={20} strokeWidth={1.75} />
        </button>
        <div className="min-w-0 flex-1 truncate text-[16px] font-semibold">{title}</div>
        {right}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      {footer}
    </div>
  );
}

/* Bottom sheet for small pickers and confirms. */

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  useBackClose(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end">
      <div className="fade-in absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="sheet-in relative max-h-[85svh] overflow-y-auto rounded-t bg-white pb-[calc(16px+env(safe-area-inset-bottom))]">
        {title && <div className="px-4 pb-2 pt-4 text-[13px] font-medium uppercase tracking-wide text-muted">{title}</div>}
        {children}
      </div>
    </div>
  );
}

export function ConfirmSheet({
  open,
  onClose,
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  body?: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose}>
      <div className="px-4 pt-5">
        <div className="text-[17px] font-semibold">{title}</div>
        {body && <p className="mt-1 text-[14px] text-muted">{body}</p>}
        <div className="mt-5 flex gap-2">
          <button className="btn flex-1" onClick={onClose}>
            Cancel
          </button>
          <button
            className={`btn flex-1 ${danger ? "btn-danger" : "btn-primary"}`}
            onClick={() => {
              onClose();
              onConfirm();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 pb-2 pt-5">
      <div className="text-[12px] font-medium uppercase tracking-[0.06em] text-muted">{children}</div>
      {right}
    </div>
  );
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <div className="px-8 py-16 text-center">
      <div className="text-[15px] font-medium">{title}</div>
      {body && <p className="mt-1 text-[14px] leading-relaxed text-muted">{body}</p>}
    </div>
  );
}

export function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private mode */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

export function formatDay(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-NZ", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

export const formatTime = (ts: number) =>
  new Date(ts).toLocaleTimeString("en-NZ", { hour: "numeric", minute: "2-digit" });
