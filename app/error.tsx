"use client";

import { useEffect } from "react";
import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react";

/**
 * Root boundary — catches anything outside the dashboard group (the login
 * screen today, new top-level routes tomorrow) so no page can render blank.
 */
export default function RootError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 p-6">
      <div className="w-full max-w-md rounded-xl border border-red-200 bg-white p-8 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600">
          <AlertTriangleIcon className="h-5 w-5" />
        </span>
        <h2 className="mt-4 text-base font-semibold text-zinc-900">
          Something went wrong
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          {error.message || "An unexpected error occurred."}
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-[11px] text-zinc-400">
            Reference: {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="mx-auto mt-5 inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white transition hover:bg-brand-800"
        >
          <RefreshCwIcon className="h-4 w-4" />
          Try again
        </button>
      </div>
    </div>
  );
}
