"use client";

import Link from "next/link";
import { useActionState } from "react";
import { LayersIcon } from "lucide-react";
import {
  addDesignAction,
  joinGroupAction,
  leaveGroupAction,
  makeGroupAction,
  renameDesignAction,
  setGroupPriceAction,
  type GroupResult,
} from "@/app/actions/product-groups";
import { ConfirmForm } from "@/app/components/confirm-form";
import { ProductThumb } from "@/app/components/product-thumb";
import { SubmitButton } from "@/app/components/submit-button";
import { useSuccessToast } from "@/app/components/toast";
import { formatMoney, formatQty } from "@/app/lib/format";
import { variantLabel } from "@/app/lib/variants";

export type DesignRow = {
  id: string;
  variantName: string | null;
  size: string | null;
  color: string | null;
  price: number;
  stockQty: number;
  unit: string;
  trackStock: boolean;
  imageUrl: string | null;
  barcode: string | null;
};

const inputClass =
  "h-9 w-full rounded-lg border border-zinc-300 bg-white px-2.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15";
const labelClass = "text-xs font-medium text-zinc-600";

function useGroupForm(action: (s: GroupResult, f: FormData) => Promise<GroupResult>, message: string) {
  return useActionState(useSuccessToast(action, message), {} as GroupResult);
}

function FormError({ state }: { state: GroupResult }) {
  return state.error ? (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{state.error}</p>
  ) : null;
}

/** Design, size and colour — any one is enough to tell designs apart. */
function VariantInputs({ current }: { current?: Pick<DesignRow, "variantName" | "size" | "color"> }) {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      <label className={labelClass}>
        Design
        <input name="variantName" maxLength={80} defaultValue={current?.variantName ?? ""} placeholder="e.g. Flower" className={`${inputClass} mt-1`} />
      </label>
      <label className={labelClass}>
        Size
        <input name="size" maxLength={40} defaultValue={current?.size ?? ""} placeholder="e.g. 2x2" className={`${inputClass} mt-1`} />
      </label>
      <label className={labelClass}>
        Colour
        <input name="color" maxLength={40} defaultValue={current?.color ?? ""} placeholder="e.g. White" className={`${inputClass} mt-1`} />
      </label>
    </div>
  );
}

/**
 * Designs of the same item (ceiling panel patterns, tile prints…). Each design
 * is its own product with its own stock, barcode and photo; the group only
 * ties them together at the POS and for one-shot pricing.
 */
export function ProductDesigns({
  product,
  group,
  groups,
  currency,
}: {
  product: { id: string; name: string; price: number };
  group: { id: string; name: string; designs: DesignRow[] } | null;
  groups: { id: string; name: string }[];
  currency: string;
}) {
  const [makeState, makeAction] = useGroupForm(makeGroupAction, "Group created — now add the other designs");
  const [joinState, joinAction] = useGroupForm(joinGroupAction, "Added to the group");
  const [addState, addAction] = useGroupForm(addDesignAction, "Design added — open it to add a photo");
  const [priceState, priceAction] = useGroupForm(setGroupPriceAction, "Price set for every design");
  const [renameState, renameAction] = useGroupForm(renameDesignAction, "Names saved");

  return (
    <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-6">
      <div className="mb-4 flex items-center gap-2">
        <LayersIcon className="h-4 w-4 text-brand-600" />
        <h2 className="text-sm font-semibold text-zinc-900">
          {group ? `Designs of ${group.name}` : "Designs"}
        </h2>
        {group && (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
            {group.designs.length}
          </span>
        )}
      </div>

      {!group ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <form action={makeAction} className="flex flex-col gap-2.5">
            <p className="text-sm text-zinc-600">
              Same item in several designs? Make this the first design of a group.
            </p>
            <input type="hidden" name="productId" value={product.id} />
            <label className={labelClass}>
              Item name (shared by all designs)
              <input name="groupName" required maxLength={80} defaultValue={product.name} className={`${inputClass} mt-1`} />
            </label>
            <VariantInputs />
            <FormError state={makeState} />
            <SubmitButton>Make a group</SubmitButton>
          </form>

          {groups.length > 0 && (
            <form action={joinAction} className="flex flex-col gap-2.5">
              <p className="text-sm text-zinc-600">Or add this product to an existing group.</p>
              <input type="hidden" name="productId" value={product.id} />
              <label className={labelClass}>
                Group
                <select name="groupId" required defaultValue="" className={`${inputClass} mt-1`}>
                  <option value="" disabled>
                    Choose a group…
                  </option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
              <VariantInputs />
              <FormError state={joinState} />
              <SubmitButton>Add to group</SubmitButton>
            </form>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {group.designs.map((d) => (
              <li key={d.id} className={`flex items-center gap-3 px-3 py-2 ${d.id === product.id ? "bg-brand-50" : ""}`}>
                <ProductThumb src={d.imageUrl} name={variantLabel(d)} size={36} />
                <div className="min-w-0 flex-1">
                  <Link href={`/products/${d.id}`} className="font-medium text-zinc-900 hover:underline">
                    {variantLabel(d) || "—"}
                  </Link>
                  <p className="text-xs text-zinc-400">
                    {d.barcode ?? "no barcode"}
                    {d.id === product.id ? " · this one" : ""}
                  </p>
                </div>
                <span className="text-sm tabular-nums text-zinc-600">
                  {d.trackStock ? `${formatQty(d.stockQty)} ${d.unit}` : "service"}
                </span>
                <span className="w-24 text-right text-sm font-medium tabular-nums text-zinc-900">
                  {formatMoney(d.price, currency)}
                </span>
              </li>
            ))}
          </ul>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <form action={addAction} className="flex flex-col gap-2.5">
              <h3 className="text-sm font-semibold text-zinc-900">Add a design</h3>
              <p className="text-xs text-zinc-500">Category, unit, cost and tax are copied from this design.</p>
              <input type="hidden" name="templateId" value={product.id} />
              <VariantInputs />
              <div className="grid grid-cols-2 gap-2.5">
                <label className={labelClass}>
                  Price *
                  <input name="price" type="number" min="0.01" step="0.01" required defaultValue={product.price} className={`${inputClass} mt-1`} />
                </label>
                <label className={labelClass}>
                  Opening stock
                  <input name="stockQty" type="number" min="0" step="any" defaultValue={0} className={`${inputClass} mt-1`} />
                </label>
                <label className={labelClass}>
                  Barcode
                  <input name="barcode" maxLength={60} className={`${inputClass} mt-1`} />
                </label>
                <label className={labelClass}>
                  SKU
                  <input name="sku" maxLength={40} className={`${inputClass} mt-1`} />
                </label>
              </div>
              <FormError state={addState} />
              <SubmitButton>Add design</SubmitButton>
            </form>

            <div className="flex flex-col gap-6">
              <form action={renameAction} className="flex flex-col gap-2.5">
                <h3 className="text-sm font-semibold text-zinc-900">Names</h3>
                <p className="text-xs text-zinc-500">
                  Changing the item name renames all {group.designs.length} designs.
                </p>
                <input type="hidden" name="productId" value={product.id} />
                <label className={labelClass}>
                  Item name *
                  <input name="groupName" required maxLength={80} defaultValue={group.name} className={`${inputClass} mt-1`} />
                </label>
                <VariantInputs current={group.designs.find((d) => d.id === product.id)} />
                <FormError state={renameState} />
                <SubmitButton>Save names</SubmitButton>
              </form>

              <form action={priceAction} className="flex flex-col gap-2.5">
                <h3 className="text-sm font-semibold text-zinc-900">Price for every design</h3>
                <input type="hidden" name="groupId" value={group.id} />
                <div className="grid grid-cols-2 gap-2.5">
                  <label className={labelClass}>
                    Price *
                    <input name="price" type="number" min="0.01" step="0.01" required defaultValue={product.price} className={`${inputClass} mt-1`} />
                  </label>
                  <label className={labelClass}>
                    Wholesale
                    <input name="wholesalePrice" type="number" min="0.01" step="0.01" placeholder="keep" className={`${inputClass} mt-1`} />
                  </label>
                </div>
                <FormError state={priceState} />
                <SubmitButton>Apply to all {group.designs.length}</SubmitButton>
              </form>

              <ConfirmForm
                action={leaveGroupAction}
                message="Take this design out of the group? It stays a normal product with its stock and sales."
                successMessage="Removed from the group"
                className="flex flex-col gap-2.5 border-t border-zinc-100 pt-4"
              >
                <h3 className="text-sm font-semibold text-zinc-900">Remove from group</h3>
                <input type="hidden" name="productId" value={product.id} />
                <label className={labelClass}>
                  Name as a separate product *
                  <input
                    name="name"
                    required
                    maxLength={120}
                    defaultValue={`${group.name} ${variantLabel(group.designs.find((d) => d.id === product.id) ?? {})}`.trim()}
                    className={`${inputClass} mt-1`}
                  />
                </label>
                <button type="submit" className="w-fit text-xs font-medium text-zinc-500 underline-offset-2 hover:text-red-600 hover:underline">
                  Remove this design from the group
                </button>
              </ConfirmForm>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
