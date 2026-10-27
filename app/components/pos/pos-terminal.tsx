"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  SearchIcon,
  PlusIcon,
  MinusIcon,
  Trash2Icon,
  BarcodeIcon,
  PauseCircleIcon,
  RotateCcwIcon,
  FileTextIcon,
} from "lucide-react";
import {
  createSaleAction,
  holdSaleAction,
  discardHeldSaleAction,
} from "@/app/actions/sales";
import { createQuotationAction } from "@/app/actions/quotations";
import { useToast } from "@/app/components/toast";
import { CustomerPicker } from "@/app/components/pos/customer-picker";
import { formatDateTime, formatMoney, round2 } from "@/app/lib/format";
import { ConfirmForm } from "@/app/components/confirm-form";
import { useT } from "@/app/components/lang";
import { ProductThumb } from "@/app/components/product-thumb";

export type PosProduct = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  price: number;
  /** Charged instead of `price` to WHOLESALE customers; null = no special rate. */
  wholesalePrice: number | null;
  taxRate: number;
  stockQty: number;
  unit: string;
  trackStock: boolean;
  categoryName: string | null;
  imageUrl: string | null;
};

export type PosCustomer = {
  id: string;
  name: string;
  phone: string | null;
  priceTier: "RETAIL" | "WHOLESALE";
};

/** Products shown before the cashier types or picks a category. */
const DEFAULT_RESULTS = 12;
/** Upper bound once a search or category narrows the list. */
const FILTERED_RESULTS = 40;

export type PosHeldSaleLine = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
};

export type PosHeldSale = {
  id: string;
  invoiceNo: string;
  note: string | null;
  customerId: string | null;
  customerName: string | null;
  discountAmount: number;
  total: number;
  itemCount: number;
  createdAt: string;
  lines: PosHeldSaleLine[];
};

type CartLine = {
  productId: string;
  name: string;
  unit: string;
  unitPrice: number;
  taxRate: number;
  trackStock: boolean;
  stockQty: number;
  quantity: number;
  discount: number;
};

const PAYMENT_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "CARD", label: "Card" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "MOBILE", label: "Mobile" },
  { value: "OTHER", label: "Other" },
] as const;

/** Function keys the terminal claims; also rendered as the on-screen hint. */
const SHORTCUTS = [
  { keys: "F2", label: "search" },
  { keys: "Alt ↑/↓", label: "qty" },
  { keys: "F9", label: "hold" },
  { keys: "F4", label: "complete" },
];

const inputClass =
  "h-9 w-full rounded-lg border border-zinc-300 bg-white px-2.5 text-sm text-zinc-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15";

export function PosTerminal({
  products,
  customers,
  currency,
  pricesIncludeTax,
  heldSales,
  initialHeldId = null,
  canEditPrices = true,
}: {
  products: PosProduct[];
  customers: PosCustomer[];
  currency: string;
  pricesIncludeTax: boolean;
  heldSales: PosHeldSale[];
  /** A held bill to open straight into the cart, e.g. a converted quotation. */
  initialHeldId?: string | null;
  /** Cashiers sell at list price; only managers may change it. */
  canEditPrices?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const toast = useToast();
  const t = useT();

  /** Cart lines for a parked bill, re-reading live product data. */
  function linesFromHeld(held: PosHeldSale): CartLine[] {
    return held.lines.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      return {
        productId: item.productId,
        // Fall back to the snapshot if the product has since been removed.
        name: product?.name ?? item.productName,
        unit: product?.unit ?? "pcs",
        unitPrice: item.unitPrice,
        taxRate: product?.taxRate ?? 0,
        trackStock: product?.trackStock ?? false,
        stockQty: product?.stockQty ?? 0,
        quantity: item.quantity,
        discount: item.discount,
      };
    });
  }

  // Opened from a converted quotation: start with that bill already recalled.
  // Read once on mount via lazy initialisers, so no effect is needed.
  const initialHeld = initialHeldId
    ? (heldSales.find((h) => h.id === initialHeldId) ?? null)
    : null;

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  /** Starts from the server list; customers added at the POS join it here. */
  const [customerList, setCustomerList] = useState(customers);
  const [cart, setCart] = useState<CartLine[]>(() =>
    initialHeld ? linesFromHeld(initialHeld) : []
  );
  const [customerId, setCustomerId] = useState(
    () => initialHeld?.customerId ?? ""
  );
  const [discountAmount, setDiscountAmount] = useState(() =>
    String(initialHeld?.discountAmount ?? 0)
  );
  const [paymentMethod, setPaymentMethod] = useState<string>("CASH");
  const [paidAmount, setPaidAmount] = useState("");
  /** Only used when the customer is paying part of the bill on credit. */
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState(() => initialHeld?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  /** Set when a parked bill has been recalled into this cart. */
  const [heldSaleId, setHeldSaleId] = useState<string | null>(
    () => initialHeld?.id ?? null
  );
  const searchRef = useRef<HTMLInputElement>(null);

  const categories = useMemo(
    () =>
      [...new Set(products.map((p) => p.categoryName).filter((c): c is string => !!c))].sort(),
    [products]
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = category
      ? products.filter((p) => p.categoryName === category)
      : products;
    if (!q) return pool.slice(0, category ? FILTERED_RESULTS : DEFAULT_RESULTS);
    return pool
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.sku && p.sku.toLowerCase().includes(q)) ||
          (p.barcode && p.barcode.toLowerCase().includes(q))
      )
      .slice(0, FILTERED_RESULTS);
  }, [products, query, category]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let taxAmount = 0;
    for (const line of cart) {
      const gross = round2(line.quantity * line.unitPrice);
      const lineTotal = round2(Math.max(0, gross - line.discount));
      subtotal = round2(subtotal + lineTotal);
      if (line.taxRate > 0) {
        taxAmount = round2(
          taxAmount +
            (pricesIncludeTax
              ? (lineTotal * line.taxRate) / (100 + line.taxRate)
              : (lineTotal * line.taxRate) / 100)
        );
      }
    }
    const discount = round2(Math.min(Number(discountAmount) || 0, subtotal));
    const total = pricesIncludeTax
      ? round2(subtotal - discount)
      : round2(subtotal - discount + taxAmount);
    return { subtotal, taxAmount, discount, total };
  }, [cart, discountAmount, pricesIncludeTax]);

  const isWholesale =
    customerList.find((c) => c.id === customerId)?.priceTier === "WHOLESALE";

  /** The rate a product rings up at for the customer on the bill. */
  function priceFor(product: PosProduct, wholesale: boolean): number {
    return wholesale && product.wholesalePrice !== null
      ? product.wholesalePrice
      : product.price;
  }

  /**
   * Switching between a retail and a wholesale customer re-prices the lines
   * still at a list price; a price the cashier typed in by hand is kept.
   */
  function applyTier(nextWholesale: boolean) {
    if (nextWholesale === isWholesale) return;
    setCart((prev) =>
      prev.map((line) => {
        const product = products.find((p) => p.id === line.productId);
        if (!product || line.unitPrice !== priceFor(product, isWholesale)) {
          return line;
        }
        return { ...line, unitPrice: priceFor(product, nextWholesale) };
      })
    );
  }

  function changeCustomer(nextId: string) {
    applyTier(
      customerList.find((c) => c.id === nextId)?.priceTier === "WHOLESALE"
    );
    setCustomerId(nextId);
  }

  const paid = paidAmount === "" ? totals.total : Number(paidAmount) || 0;
  const change = round2(Math.max(0, paid - totals.total));
  /** Anything not paid at the counter goes onto the customer's account. */
  const balanceDue = round2(Math.max(0, totals.total - paid));
  const isCreditSale = cart.length > 0 && balanceDue > 0;

  function addToCart(product: PosProduct) {
    setError(null);
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === product.id ? { ...l, quantity: l.quantity + 1 } : l
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          unit: product.unit,
          unitPrice: priceFor(product, isWholesale),
          taxRate: product.taxRate,
          trackStock: product.trackStock,
          stockQty: product.stockQty,
          quantity: 1,
          discount: 0,
        },
      ];
    });
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const q = query.trim().toLowerCase();
    if (!q) return;

    // Exact barcode / SKU match → straight into the cart
    const exact = products.find(
      (p) =>
        (p.barcode && p.barcode.toLowerCase() === q) ||
        (p.sku && p.sku.toLowerCase() === q)
    );
    if (exact) {
      addToCart(exact);
      setQuery("");
      return;
    }

    // Otherwise add the first filtered result
    if (results.length > 0) {
      addToCart(results[0]);
      setQuery("");
    }
  }

  function updateLine(
    productId: string,
    patch: Partial<Pick<CartLine, "quantity" | "unitPrice" | "discount">>
  ) {
    setCart((prev) =>
      prev.map((l) =>
        l.productId === productId
          ? {
              ...l,
              ...patch,
              quantity: Math.max(0.001, patch.quantity ?? l.quantity),
              unitPrice: Math.max(0, patch.unitPrice ?? l.unitPrice),
              discount: Math.max(0, patch.discount ?? l.discount),
            }
          : l
      )
    );
  }

  function removeLine(productId: string) {
    setCart((prev) => prev.filter((l) => l.productId !== productId));
  }

  function clearCart() {
    setCart([]);
    setDiscountAmount("0");
    setPaidAmount("");
    setDueDate("");
    setNote("");
    setCustomerId("");
    setHeldSaleId(null);
    setError(null);
    searchRef.current?.focus();
  }

  /** Park the cart as a HELD bill without touching stock. */
  function holdBill() {
    setError(null);
    if (cart.length === 0) {
      setError(t("The cart is empty."));
      return;
    }

    startTransition(async () => {
      const result = await holdSaleAction({
        items: cart.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discount: l.discount,
        })),
        customerId: customerId || null,
        discountAmount: Number(discountAmount) || 0,
        note: note || null,
        replaceHeldSaleId: heldSaleId,
      });

      if ("error" in result) {
        setError(result.error);
        return;
      }

      clearCart();
      toast(
        heldSaleId
          ? `Held bill ${result.invoiceNo} updated`
          : `Bill parked as ${result.invoiceNo}`
      );
      router.refresh();
    });
  }

  /** Load a parked bill back into the cart, re-reading live product data. */
  function recall(held: PosHeldSale) {
    setError(null);

    setCart(linesFromHeld(held));
    setCustomerId(held.customerId ?? "");
    setDiscountAmount(String(held.discountAmount || 0));
    setNote(held.note ?? "");
    setPaidAmount("");
    setHeldSaleId(held.id);
    toast(`${held.invoiceNo} loaded into the cart`, "info");
    searchRef.current?.focus();
  }

  /** Save the cart as a printable estimate; nothing is reserved or charged. */
  function saveQuotation() {
    setError(null);
    if (cart.length === 0) {
      setError(t("The cart is empty."));
      return;
    }

    startTransition(async () => {
      const result = await createQuotationAction({
        items: cart.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discount: l.discount,
        })),
        customerId: customerId || null,
        discountAmount: Number(discountAmount) || 0,
        note: note || null,
      });

      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.push(`/quotations/${result.quotationId}?new=1`);
    });
  }

  function checkout() {
    setError(null);
    if (cart.length === 0) {
      setError(t("The cart is empty."));
      return;
    }
    // Checked here too so the cashier sees the reason instead of a server error.
    if (isCreditSale && !customerId) {
      setError(
        t("Credit needs an account customer. Select a customer, or collect the full amount.")
      );
      return;
    }

    startTransition(async () => {
      const result = await createSaleAction({
        items: cart.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discount: l.discount,
        })),
        customerId: customerId || null,
        discountAmount: Number(discountAmount) || 0,
        paymentMethod: paymentMethod as CreateSaleInputPaymentMethod,
        paidAmount: paid,
        dueDate: isCreditSale && dueDate ? dueDate : null,
        note: note || null,
        replaceHeldSaleId: heldSaleId,
      });

      if ("error" in result) {
        setError(result.error);
        return;
      }

      router.push(`/sales/${result.saleId}?new=1`);
    });
  }

  /** Alt+↑/↓ nudges the quantity on the line the cashier last touched. */
  function bumpQty(delta: number) {
    const last = cart[cart.length - 1];
    if (!last) return;
    updateLine(last.productId, { quantity: round2(last.quantity + delta) });
  }

  // Keep the latest handlers in a ref so the global listener is registered
  // once instead of re-binding on every keystroke-driven re-render.
  const handlers = useRef({ checkout, holdBill, bumpQty });
  useEffect(() => {
    handlers.current = { checkout, holdBill, bumpQty };
  });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const h = handlers.current;

      if (e.key === "Escape") {
        // Never destructive: Esc only gets the cashier out of the search box.
        if (searchRef.current && document.activeElement === searchRef.current) {
          searchRef.current.blur();
        }
        return;
      }

      switch (e.key) {
        case "F2":
          e.preventDefault();
          searchRef.current?.focus();
          searchRef.current?.select();
          break;
        case "F4":
          e.preventDefault();
          if (!isPending) h.checkout();
          break;
        case "F9":
          e.preventDefault();
          if (!isPending) h.holdBill();
          break;
        case "ArrowUp":
          if (e.altKey) {
            e.preventDefault();
            h.bumpQty(1);
          }
          break;
        case "ArrowDown":
          if (e.altKey) {
            e.preventDefault();
            h.bumpQty(-1);
          }
          break;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPending]);

  return (
    // Bottom padding below xl leaves room for the sticky checkout bar.
    <div className="grid grid-cols-1 gap-6 pb-24 xl:grid-cols-[1fr_420px] xl:pb-0">
      {/* Left: search + results */}
      <div className="flex min-w-0 flex-col gap-4">
        <div className="relative">
          <BarcodeIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            ref={searchRef}
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder={t("Scan barcode or search product name / SKU, then press Enter…")}
            className="h-11 w-full rounded-xl border border-zinc-300 bg-white pl-9 pr-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15"
          />
        </div>

        {/* Shortcut hints — only useful on a real keyboard */}
        <div className="hidden items-center gap-3 text-[11px] text-zinc-500 md:flex">
          {SHORTCUTS.map((s) => (
            <span key={s.keys} className="flex items-center gap-1">
              <kbd className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-zinc-700 shadow-sm">
                {s.keys}
              </kbd>
              {t(s.label)}
            </span>
          ))}
        </div>

        {categories.length > 0 && (
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {["", ...categories].map((c) => (
              <button
                key={c || "all"}
                type="button"
                onClick={() => setCategory(c)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition ${
                  category === c
                    ? "border-brand-700 bg-brand-700 text-white"
                    : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                {c || t("All")}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {results.map((product) => {
            const outOfStock =
              product.trackStock && product.stockQty <= 0;
            const inCart = cart.find((l) => l.productId === product.id);
            return (
              <button
                key={product.id}
                type="button"
                disabled={outOfStock}
                onClick={() => addToCart(product)}
                className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-2.5 text-left transition hover:border-brand-400 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="flex min-w-0 items-center gap-3">
                <ProductThumb src={product.imageUrl} name={product.name} size={44} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-900">
                    {product.name}
                  </p>
                  <p className="truncate text-xs text-zinc-400">
                    {product.sku ?? t("No SKU")}
                    {product.trackStock && ` · ${product.stockQty} ${product.unit} ${t("in stock")}`}
                    {!product.trackStock && ` · ${t("service")}`}
                  </p>
                </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-zinc-900">
                    {formatMoney(priceFor(product, isWholesale), currency)}
                  </p>
                  {inCart && (
                    <p className="text-[11px] font-medium text-emerald-600">
                      ×{inCart.quantity} {t("in cart")}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
          {results.length === 0 && (
            <div className="col-span-full rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-400">
              <SearchIcon className="mx-auto mb-2 h-5 w-5" />
              {t("No products match")} “{query}”.
            </div>
          )}
        </div>

        {/* Cart */}
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-zinc-900">
              {t("Cart")}
              <span className="ml-2 text-xs font-normal text-zinc-400">
                {cart.length} {t(cart.length === 1 ? "item" : "items")}
              </span>
            </h2>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={clearCart}
                className="text-xs font-medium text-zinc-500 hover:text-red-600"
              >
                {t("Clear cart")}
              </button>
            )}
          </div>

          {cart.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-zinc-400">
              {t("Scan or click a product to start a sale.")}
            </div>
          ) : (
            <table className="w-full min-w-[640px] text-left lg:min-w-0 text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-3 py-2 font-medium">{t("Item")}</th>
                  <th className="px-2 py-2 font-medium">{t("Qty")}</th>
                  <th className="px-2 py-2 font-medium">{t("Price")}</th>
                  <th className="px-2 py-2 font-medium">{t("Disc.")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("Total")}</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {cart.map((line) => {
                  const lineTotal = round2(
                    Math.max(
                      0,
                      line.quantity * line.unitPrice - line.discount
                    )
                  );
                  const overStock =
                    line.trackStock && line.quantity > line.stockQty;

                  return (
                    <tr key={line.productId} className="animate-line-in">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2.5">
                        <ProductThumb
                          src={products.find((p) => p.id === line.productId)?.imageUrl}
                          name={line.name}
                          size={32}
                        />
                        <div className="min-w-0">
                        <p className="max-w-56 truncate font-medium text-zinc-900">
                          {line.name}
                        </p>
                        {overStock ? (
                          <p className="text-[11px] font-medium text-red-600">
                            {t("only {n} available", { n: `${line.stockQty} ${line.unit}` })}
                          </p>
                        ) : (
                          <p className="text-[11px] text-zinc-400">
                            {t("per")} {line.unit}
                          </p>
                        )}
                        </div>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              updateLine(line.productId, {
                                quantity: round2(line.quantity - 1),
                              })
                            }
                            className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 hover:bg-zinc-50"
                          >
                            <MinusIcon className="h-3 w-3" />
                          </button>
                          <input
                            type="number"
                            min="0.001"
                            step="any"
                            value={line.quantity}
                            onChange={(e) =>
                              updateLine(line.productId, {
                                quantity: Number(e.target.value),
                              })
                            }
                            className="h-7 w-16 rounded-md border border-zinc-300 bg-white px-1.5 text-center text-sm text-zinc-900 outline-none focus:border-brand-600"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              updateLine(line.productId, {
                                quantity: round2(line.quantity + 1),
                              })
                            }
                            className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 hover:bg-zinc-50"
                          >
                            <PlusIcon className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unitPrice}
                          readOnly={!canEditPrices}
                          title={canEditPrices ? undefined : t("Only a manager can change prices")}
                          onChange={(e) =>
                            updateLine(line.productId, {
                              unitPrice: Number(e.target.value),
                            })
                          }
                          className="h-7 w-20 rounded-md border border-zinc-300 bg-white px-1.5 text-right text-sm text-zinc-900 outline-none focus:border-brand-600"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.discount}
                          onChange={(e) =>
                            updateLine(line.productId, {
                              discount: Number(e.target.value),
                            })
                          }
                          className="h-7 w-16 rounded-md border border-zinc-300 bg-white px-1.5 text-right text-sm text-zinc-900 outline-none focus:border-brand-600"
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-zinc-900">
                        <span key={lineTotal} className="inline-block animate-tick">
                          {formatMoney(lineTotal, currency)}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => removeLine(line.productId)}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2Icon className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Held bills */}
        {heldSales.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-amber-200 bg-white">
            <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-4 py-3">
              <PauseCircleIcon className="h-4 w-4 text-amber-700" />
              <h2 className="text-sm font-semibold text-amber-900">
                {t("Held bills")}
                <span className="ml-2 text-xs font-normal text-amber-700">
                  {heldSales.length} {t("parked")}
                </span>
              </h2>
            </div>
            <ul className="divide-y divide-zinc-100">
              {heldSales.map((held) => (
                <li
                  key={held.id}
                  className={`flex items-center justify-between gap-3 px-4 py-3 ${
                    held.id === heldSaleId ? "bg-amber-50/60" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900">
                      {held.invoiceNo}
                      {held.id === heldSaleId && (
                        <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                          {t("in cart")}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-zinc-400">
                      {held.itemCount} item{held.itemCount === 1 ? "" : "s"} ·{" "}
                      {held.customerName ?? t("Walk-in")} ·{" "}
                      {formatDateTime(held.createdAt)}
                    </p>
                    {held.note && (
                      <p className="truncate text-xs italic text-zinc-400">
                        “{held.note}”
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-900">
                      {formatMoney(held.total, currency)}
                    </span>
                    <button
                      type="button"
                      onClick={() => recall(held)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-amber-600 px-3 text-xs font-medium text-white transition hover:bg-amber-500"
                    >
                      <RotateCcwIcon className="h-3.5 w-3.5" />
                      {t("Recall")}
                    </button>
                    <ConfirmForm
                      action={discardHeldSaleAction}
                      successMessage={`Held bill ${held.invoiceNo} discarded`}
                      message={`Discard held bill ${held.invoiceNo} (${formatMoney(held.total, currency)})? It cannot be recovered.`}
                    >
                      <input type="hidden" name="id" value={held.id} />
                      <button
                        type="submit"
                        title={t("Discard held bill")}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2Icon className="h-3.5 w-3.5" />
                      </button>
                    </ConfirmForm>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Right: checkout panel */}
      <div
        id="pos-checkout"
        className="flex h-fit scroll-mt-20 flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5 xl:sticky xl:top-6"
      >
        <h2 className="text-sm font-semibold text-zinc-900">{t("Checkout")}</h2>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {/* Totals */}
        <div className="flex flex-col gap-1.5 border-b border-zinc-100 pb-4 text-sm">
          <div className="flex justify-between text-zinc-500">
            <span>{t("Subtotal")}</span>
            <span>{formatMoney(totals.subtotal, currency)}</span>
          </div>
          <div className="flex items-center justify-between text-zinc-500">
            <span>{t("Sale discount")}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={discountAmount}
              onChange={(e) => setDiscountAmount(e.target.value)}
              className="h-8 w-28 rounded-md border border-zinc-300 bg-white px-2 text-right text-sm text-zinc-900 outline-none focus:border-brand-600"
            />
          </div>
          {totals.taxAmount > 0 && (
            <div className="flex justify-between text-zinc-500">
              <span>{t("Tax")} {pricesIncludeTax ? t("(included)") : ""}</span>
              <span>{formatMoney(totals.taxAmount, currency)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-zinc-100 pt-2 text-base font-semibold text-zinc-900">
            <span>{t("Total")}</span>
            <span key={totals.total} className="inline-block animate-tick">
              {formatMoney(totals.total, currency)}
            </span>
          </div>
        </div>

        {/* Payment */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700">
              {t("Customer")}
            </label>
            <CustomerPicker
              customers={customerList}
              value={customerId}
              onChange={changeCustomer}
              onCreated={(customer) => {
                setCustomerList((prev) =>
                  [...prev, customer].sort((a, b) => a.name.localeCompare(b.name))
                );
                // A brand-new customer is not in the list `changeCustomer`
                // reads yet, so apply their tier directly.
                applyTier(customer.priceTier === "WHOLESALE");
                setCustomerId(customer.id);
              }}
            />
            {isWholesale && (
              <p className="text-xs font-medium text-sky-700">
                {t("Wholesale prices applied.")}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700">
              {t("Payment method")}
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className={inputClass}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {t(m.label)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="text-sm font-medium text-zinc-700">
                {t("Amount paid")}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder={String(totals.total)}
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="text-sm font-medium text-zinc-700">
                {isCreditSale ? t("Balance due") : t("Change")}
              </label>
              <div
                className={`flex h-9 items-center justify-end rounded-lg px-2.5 text-sm font-semibold ${
                  isCreditSale
                    ? "bg-amber-50 text-amber-800"
                    : "bg-zinc-100 text-zinc-900"
                }`}
              >
                {formatMoney(isCreditSale ? balanceDue : change, currency)}
              </div>
            </div>
          </div>

          {isCreditSale && (
            <div className="flex flex-col gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
              <p className="text-xs font-medium text-amber-900">
                {formatMoney(balanceDue, currency)} {t("goes on")}{" "}
                {customerList.find((c) => c.id === customerId)?.name ??
                  "this account"}{" "}
                {t("'s ledger.")}
              </p>
              <label className="text-xs font-medium text-amber-800">
                {t("Payable by (optional)")}
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-amber-300 bg-white px-2.5 text-sm text-zinc-900 outline-none focus:border-amber-700"
                />
              </label>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700">
              {t("Note (optional)")}
            </label>
            <input
              type="text"
              maxLength={300}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("e.g. delivery arranged")}
              className={inputClass}
            />
          </div>
        </div>

        {heldSaleId && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            {t("Recalled from a held bill — completing this sale replaces it.")}
          </p>
        )}

        <button
          type="button"
          disabled={isPending || cart.length === 0}
          onClick={checkout}
          className="flex h-11 items-center justify-center rounded-xl bg-brand-700 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending
            ? `${t("Processing")}…`
            : isCreditSale
              ? `${t("Complete on credit")} · ${formatMoney(balanceDue, currency)} ${t("due")}`
              : `${t("Complete sale")} · ${formatMoney(totals.total, currency)}`}
        </button>

        <button
          type="button"
          disabled={isPending || cart.length === 0}
          onClick={holdBill}
          className="flex h-10 items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 text-sm font-medium text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PauseCircleIcon className="h-4 w-4" />
          {heldSaleId ? t("Update held bill") : t("Hold bill")}
        </button>

        <button
          type="button"
          disabled={isPending || cart.length === 0}
          onClick={saveQuotation}
          className="flex h-10 items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FileTextIcon className="h-4 w-4" />
          {t("Save as quotation")}
        </button>
      </div>

      {/* Below xl the checkout panel sits under the cart, so keep the total
          and the complete button pinned to the bottom of the screen. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur lg:left-60 xl:hidden print:hidden">
        {error && (
          <p className="mb-2 truncate text-xs font-medium text-red-600">{error}</p>
        )}
        <div className="flex items-center gap-3">
          <a href="#pos-checkout" className="min-w-0 flex-1">
            <p className="text-xs text-zinc-500">
              {cart.length} {t(cart.length === 1 ? "item" : "items")} · {t("tap for payment details")}
            </p>
            <p className="truncate text-lg font-semibold text-zinc-900">
              <span key={totals.total} className="inline-block animate-tick">
                {formatMoney(totals.total, currency)}
              </span>
              {isCreditSale && (
                <span className="ml-2 text-xs font-medium text-amber-700">
                  {formatMoney(balanceDue, currency)} {t("on credit")}
                </span>
              )}
            </p>
          </a>
          <button
            type="button"
            disabled={isPending || cart.length === 0}
            onClick={checkout}
            className="flex h-11 shrink-0 items-center justify-center rounded-xl bg-brand-700 px-5 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? `${t("Processing")}…` : t("Complete")}
          </button>
        </div>
      </div>
    </div>
  );
}

type CreateSaleInputPaymentMethod =
  | "CASH"
  | "CARD"
  | "BANK_TRANSFER"
  | "MOBILE"
  | "OTHER";
