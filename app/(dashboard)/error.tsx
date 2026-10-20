"use client";

import { useEffect } from "react";
import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react";

/**
 * Catches render/data errors for every screen under the dashboard group, so a
 * dead database connection shows a readable card instead of a blank page.
 *
 * `unstable_retry` re-fetches and re-renders this segment (Next.js 16.2+),
 * which is exactly what we want: most of the failures here are transient
 * connection drops that succeed on the next attempt.
 */
export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // The digest ties this screen back to the matching server-side log line.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md rounded-xl border border-red-200 bg-white p-8 text-center">
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600">
        <AlertTriangleIcon className="h-5 w-5" />
      </span>
      <h2 className="mt-4 text-base font-semibold text-zinc-900">
        This screen could not be loaded
      </h2>
      <p className="mt-1 text-sm text-zinc-500">
        {error.message ||
          "The server did not return the data for this page. Check that the database is running, then try again."}
      </p>
      {error.digest && (
        <p className="mt-3 font-mono text-[11px] text-zinc-400">
          Reference: {error.digest}
        </p>
      )}
      <button
        type="button"
        onClick={() => unstable_retry()}
        className="mx-auto mt-5 inline-flex h-9 items-center gap-1.5 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition hover:bg-zinc-700"
      >
        <RefreshCwIcon className="h-4 w-4" />
        Try again
      </button>
    </div>
  );
}
