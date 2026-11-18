"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { XCircleIcon } from "lucide-react";
import { returnToSupplierAction } from "@/app/actions/purchases";
import { useToast } from "@/app/components/toast";

/**
 * Undo a wrongly entered purchase in one step: everything that can still go
 * back is returned to the supplier, so stock and the supplier's balance both
 * reverse. Items already sold stay out of it — they are no longer on the shelf.
 */
export function CancelPurchaseButton({
  purchaseId,
  items,
}: {
  purchaseId: string;
  items: { purchaseItemId: string; quantity: number }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (
          !window.confirm(
            "Cancel this purchase? Everything still in stock goes back to the supplier and comes off what you owe. This cannot be undone."
          )
        ) {
          return;
        }
        startTransition(async () => {
          const result = await returnToSupplierAction({
            purchaseId,
            items,
            reason: "Purchase cancelled",
          });
          if ("error" in result) {
            toast(result.error, "error");
            return;
          }
          toast("Purchase cancelled — stock and supplier balance reversed");
          router.refresh();
        });
      }}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-4 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <XCircleIcon className="h-4 w-4" />
      {isPending ? "Cancelling…" : "Cancel purchase"}
    </button>
  );
}
