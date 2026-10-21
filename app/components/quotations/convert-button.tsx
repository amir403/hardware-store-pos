"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCartIcon } from "lucide-react";
import { convertQuotationAction } from "@/app/actions/quotations";
import { useToast } from "@/app/components/toast";

/** Turns the quote into a held bill and opens it at the POS. */
export function ConvertQuotationButton({ quotationId }: { quotationId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await convertQuotationAction(quotationId);
            if ("error" in result) {
              setError(result.error);
              return;
            }
            toast("Quotation converted — complete the sale at the POS");
            router.push(`/pos?recall=${result.heldSaleId}`);
          })
        }
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 print:hidden"
      >
        <ShoppingCartIcon className="h-4 w-4" />
        {isPending ? "Converting…" : "Convert to sale"}
      </button>
      {error && <p className="max-w-xs text-right text-xs text-red-600">{error}</p>}
    </div>
  );
}
