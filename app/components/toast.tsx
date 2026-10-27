"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2Icon, InfoIcon, XCircleIcon, XIcon } from "lucide-react";

export type ToastTone = "success" | "error" | "info";

type Toast = { id: number; message: string; tone: ToastTone };

type ToastApi = (message: string, tone?: ToastTone) => void;

const ToastContext = createContext<ToastApi | null>(null);

const DURATION_MS = 4000;

/**
 * Short-lived confirmations ("Payment recorded") shown over every dashboard
 * page. Errors stay a little longer and can be dismissed by hand.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback<ToastApi>(
    (message, tone = "success") => {
      const id = nextId.current++;
      setToasts((prev) =>
        // The same message twice in a row (double click, strict-mode replay)
        // shows once.
        prev.some((t) => t.message === message && t.tone === tone)
          ? prev
          : [...prev.slice(-3), { id, message, tone }]
      );
      setTimeout(() => dismiss(id), tone === "error" ? DURATION_MS * 2 : DURATION_MS);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-16 z-50 flex flex-col items-center gap-2 px-4 lg:inset-x-auto lg:right-6 lg:top-6 lg:items-end print:hidden"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg shadow-zinc-900/10 ${
              t.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : t.tone === "error"
                  ? "border-red-200 bg-red-50 text-red-800"
                  : "border-zinc-200 bg-white text-zinc-800"
            }`}
          >
            {t.tone === "success" ? (
              <CheckCircle2Icon className="mt-0.5 h-4 w-4 shrink-0" />
            ) : t.tone === "error" ? (
              <XCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span className="flex-1">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="-mr-1 rounded p-0.5 opacity-60 hover:opacity-100"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  // Outside the dashboard (e.g. the login page) toasts are simply dropped.
  return api ?? (() => {});
}

/**
 * Shows a toast once for a page reached by a redirect (`?new=1`), then strips
 * the flag from the URL so a reload or the back button does not repeat it.
 */
export function FlashToast({
  message,
  tone = "success",
  clearParams,
}: {
  message: string;
  tone?: ToastTone;
  clearParams: string[];
}) {
  const toast = useToast();
  const router = useRouter();
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    toast(message, tone);

    const url = new URL(window.location.href);
    for (const key of clearParams) url.searchParams.delete(key);
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
  }, [toast, message, tone, clearParams, router]);

  return null;
}

/**
 * Wraps a `useActionState` action so a successful submit raises a toast.
 * "Successful" means the result carries no `error` and no `fieldErrors` —
 * those stay inline next to the fields they belong to.
 */
export function useSuccessToast<S, P = FormData>(
  action: (state: S, payload: P) => Promise<S>,
  successMessage: string | ((result: S) => string) | undefined
): (state: S, payload: P) => Promise<S> {
  const toast = useToast();
  return async (state, payload) => {
    const result = await action(state, payload);
    const failed =
      typeof result === "object" &&
      result !== null &&
      ("error" in result || "fieldErrors" in result) &&
      Boolean(
        (result as { error?: unknown }).error ||
          (result as { fieldErrors?: unknown }).fieldErrors
      );
    if (!failed && successMessage) {
      toast(
        typeof successMessage === "function"
          ? successMessage(result)
          : successMessage
      );
    }
    return result;
  };
}
