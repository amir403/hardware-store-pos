"use client";

import { useActionState, useState } from "react";
import { ImagePlusIcon } from "lucide-react";
import Link from "next/link";
import type { FormState } from "@/app/actions/products";
import { SubmitButton } from "@/app/components/submit-button";
import { ProductThumb } from "@/app/components/product-thumb";

type CategoryOption = { id: string; name: string };

type ProductDefaults = {
  id?: string;
  name: string;
  sku: string;
  barcode: string;
  description: string;
  unit: string;
  categoryId: string;
  costPrice: string;
  price: string;
  wholesalePrice: string;
  taxRate: string;
  stockQty: string;
  reorderLevel: string;
  trackStock: boolean;
  imageUrl: string;
};

const UNITS = ["pcs", "box", "kg", "ltr", "m", "yard", "cft", "hr"];

const inputClass =
  "h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15 disabled:bg-zinc-100";

const labelClass = "text-sm font-medium text-zinc-700";

export function ProductForm({
  action,
  categories,
  defaults,
  isEdit,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  categories: CategoryOption[];
  defaults: ProductDefaults;
  isEdit: boolean;
}) {
  const [state, formAction] = useActionState(action, {});
  /** Local preview of a newly picked photo; the server re-encodes the file. */
  const [preview, setPreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const shownImage = preview ?? (removeImage ? null : defaults.imageUrl || null);

  const fieldError = (field: string) =>
    state?.fieldErrors?.[field]?.[0] as string | undefined;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}

      {state?.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="name" className={labelClass}>
            Product name *
          </label>
          <input
            id="name"
            name="name"
            required
            maxLength={120}
            defaultValue={defaults.name}
            placeholder="e.g. Claw Hammer 16oz"
            className={inputClass}
          />
          {fieldError("name") && (
            <p className="text-xs text-red-600">{fieldError("name")}</p>
          )}
        </div>

        <div className="flex items-center gap-4 sm:col-span-2">
          <ProductThumb src={shownImage} name={defaults.name || "Product photo"} size={72} />
          <div className="flex flex-col gap-1.5">
            <label className="inline-flex h-9 w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-600/15">
              <ImagePlusIcon className="h-4 w-4" />
              {shownImage ? "Change photo" : "Add photo"}
              <input
                type="file"
                name="image"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (preview) URL.revokeObjectURL(preview);
                  setPreview(file ? URL.createObjectURL(file) : null);
                  if (file) setRemoveImage(false);
                }}
              />
            </label>
            {defaults.imageUrl && !preview && (
              <label className="flex items-center gap-2 text-xs text-zinc-600">
                <input
                  type="checkbox"
                  name="removeImage"
                  checked={removeImage}
                  onChange={(e) => setRemoveImage(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-zinc-300"
                />
                Remove photo
              </label>
            )}
            <p className="text-xs text-zinc-400">
              A clear photo helps the cashier pick the right item. JPG, PNG or WebP.
            </p>
            {fieldError("image") && (
              <p className="text-xs text-red-600">{fieldError("image")}</p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="sku" className={labelClass}>
            SKU
          </label>
          <input
            id="sku"
            name="sku"
            maxLength={40}
            defaultValue={defaults.sku}
            placeholder="HT-HAM-016"
            className={inputClass}
          />
          {fieldError("sku") && (
            <p className="text-xs text-red-600">{fieldError("sku")}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="barcode" className={labelClass}>
            Barcode
          </label>
          <input
            id="barcode"
            name="barcode"
            maxLength={60}
            defaultValue={defaults.barcode}
            placeholder="8801234500011"
            className={inputClass}
          />
          {fieldError("barcode") && (
            <p className="text-xs text-red-600">{fieldError("barcode")}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="categoryId" className={labelClass}>
            Category
          </label>
          <select
            id="categoryId"
            name="categoryId"
            defaultValue={defaults.categoryId}
            className={inputClass}
          >
            <option value="none">— No category —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="unit" className={labelClass}>
            Unit
          </label>
          <select
            id="unit"
            name="unit"
            defaultValue={defaults.unit}
            className={inputClass}
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="costPrice" className={labelClass}>
            Cost price
          </label>
          <input
            id="costPrice"
            name="costPrice"
            type="number"
            step="0.01"
            min="0"
            defaultValue={defaults.costPrice}
            className={inputClass}
          />
          {fieldError("costPrice") && (
            <p className="text-xs text-red-600">{fieldError("costPrice")}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="price" className={labelClass}>
            Selling price *
          </label>
          <input
            id="price"
            name="price"
            type="number"
            step="0.01"
            min="0.01"
            required
            defaultValue={defaults.price}
            className={inputClass}
          />
          {fieldError("price") && (
            <p className="text-xs text-red-600">{fieldError("price")}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="wholesalePrice" className={labelClass}>
            Wholesale price
          </label>
          <input
            id="wholesalePrice"
            name="wholesalePrice"
            type="number"
            step="0.01"
            min="0.01"
            defaultValue={defaults.wholesalePrice}
            placeholder="Same as selling price"
            className={inputClass}
          />
          <p className="text-xs text-zinc-400">
            Charged to wholesale customers at the POS.
          </p>
          {fieldError("wholesalePrice") && (
            <p className="text-xs text-red-600">{fieldError("wholesalePrice")}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="taxRate" className={labelClass}>
            Tax rate (%)
          </label>
          <input
            id="taxRate"
            name="taxRate"
            type="number"
            step="0.01"
            min="0"
            max="100"
            defaultValue={defaults.taxRate}
            className={inputClass}
          />
          {fieldError("taxRate") && (
            <p className="text-xs text-red-600">{fieldError("taxRate")}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="stockQty" className={labelClass}>
            Current stock
          </label>
          <input
            id="stockQty"
            name="stockQty"
            type="number"
            step="0.001"
            min="0"
            defaultValue={defaults.stockQty}
            disabled={isEdit}
            title={isEdit ? "Stock is managed via purchases, sales and adjustments" : undefined}
            className={inputClass}
          />
          {fieldError("stockQty") && (
            <p className="text-xs text-red-600">{fieldError("stockQty")}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="reorderLevel" className={labelClass}>
            Reorder level
          </label>
          <input
            id="reorderLevel"
            name="reorderLevel"
            type="number"
            step="0.001"
            min="0"
            defaultValue={defaults.reorderLevel}
            className={inputClass}
          />
          {fieldError("reorderLevel") && (
            <p className="text-xs text-red-600">{fieldError("reorderLevel")}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="description" className={labelClass}>
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={2}
            maxLength={500}
            defaultValue={defaults.description}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15"
          />
          {fieldError("description") && (
            <p className="text-xs text-red-600">{fieldError("description")}</p>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-zinc-700 sm:col-span-2">
          <input
            type="checkbox"
            name="trackStock"
            defaultChecked={defaults.trackStock}
            className="h-4 w-4 rounded border-zinc-300 accent-brand-700"
          />
          Track stock (uncheck for services / untracked items)
        </label>
      </div>

      <div className="flex items-center gap-2 border-t border-zinc-100 pt-4">
        <SubmitButton>
          {isEdit ? "Save changes" : "Create product"}
        </SubmitButton>
        <Link
          href="/products"
          className="inline-flex h-9 items-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
