"use client";

import { PrinterIcon } from "lucide-react";

export function PrintButton({ label = "Print receipt" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 print:hidden"
    >
      <PrinterIcon className="h-4 w-4" />
      {label}
    </button>
  );
}
