"use client";

import { useState, useTransition } from "react";
import { SearchIcon, UserPlusIcon, XIcon } from "lucide-react";
import {
  quickCreateCustomerAction,
  type QuickCustomer,
} from "@/app/actions/parties";
import { useToast } from "@/app/components/toast";
import { useT } from "@/app/components/lang";

const inputClass =
  "h-9 w-full rounded-lg border border-zinc-300 bg-white px-2.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15";

const MAX_MATCHES = 8;

/**
 * Pick the customer on the bill by typing part of a name or phone number, or
 * add a new one on the spot. Empty means a walk-in sale.
 */
export function CustomerPicker({
  customers,
  value,
  onChange,
  onCreated,
}: {
  customers: QuickCustomer[];
  value: string;
  onChange: (id: string) => void;
  onCreated: (customer: QuickCustomer) => void;
}) {
  const toast = useToast();
  const t = useT();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newWholesale, setNewWholesale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = customers.find((c) => c.id === value) ?? null;

  const q = query.trim().toLowerCase();
  const matches = (
    q
      ? customers.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.phone ?? "").replace(/\D/g, "").includes(q.replace(/\D/g, "") || "\u0000")
        )
      : customers
  ).slice(0, MAX_MATCHES);

  function choose(id: string) {
    onChange(id);
    setQuery("");
    setOpen(false);
  }

  function startAdding() {
    setAdding(true);
    setOpen(false);
    setError(null);
    // Typing a number first is the common case at the counter.
    if (/^[\d\s+-]+$/.test(query.trim())) {
      setNewPhone(query.trim());
      setNewName("");
    } else {
      setNewName(query.trim());
      setNewPhone("");
    }
  }

  function saveNew() {
    setError(null);
    startTransition(async () => {
      const result = await quickCreateCustomerAction({
        name: newName,
        phone: newPhone,
        priceTier: newWholesale ? "WHOLESALE" : "RETAIL",
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onCreated(result.customer);
      toast(`${result.customer.name} added and selected`);
      setAdding(false);
      setQuery("");
      setNewName("");
      setNewPhone("");
      setNewWholesale(false);
    });
  }

  if (adding) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
        <p className="text-xs font-semibold text-zinc-700">{t("New customer")}</p>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t("Name *")}
          maxLength={80}
          className={inputClass}
        />
        <input
          value={newPhone}
          onChange={(e) => setNewPhone(e.target.value)}
          placeholder={t("Phone (optional)")}
          maxLength={20}
          inputMode="tel"
          className={inputClass}
        />
        <label className="flex items-center gap-2 text-xs text-zinc-700">
          <input
            type="checkbox"
            checked={newWholesale}
            onChange={(e) => setNewWholesale(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 accent-brand-700"
          />
          {t("Wholesale customer")}
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isPending || newName.trim() === ""}
            onClick={saveNew}
            className="h-8 flex-1 rounded-lg bg-brand-700 text-xs font-medium text-white transition hover:bg-brand-800 disabled:opacity-50"
          >
            {isPending ? `${t("Saving")}…` : t("Add & select")}
          </button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="h-8 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            {t("Cancel")}
          </button>
        </div>
      </div>
    );
  }

  if (selected) {
    return (
      <div className="flex h-9 items-center justify-between gap-2 rounded-lg border border-zinc-300 bg-white px-2.5 text-sm">
        <span className="min-w-0 truncate text-zinc-900">
          {selected.name}
          {selected.phone && (
            <span className="ml-1.5 text-xs text-zinc-400">{selected.phone}</span>
          )}
          {selected.priceTier === "WHOLESALE" && (
            <span className="ml-1.5 rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
              {t("wholesale")}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => onChange("")}
          title={t("Back to walk-in")}
          aria-label="Remove customer"
          className="shrink-0 rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            // Let a click on a match land before the list closes.
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && matches[0]) {
                e.preventDefault();
                choose(matches[0].id);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder={t("Walk-in — search name or phone")}
            className={`${inputClass} pl-8`}
          />
        </div>
        <button
          type="button"
          onClick={startAdding}
          title={t("Add a new customer")}
          aria-label={t("Add a new customer")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900"
        >
          <UserPlusIcon className="h-4 w-4" />
        </button>
      </div>

      {open && (
        <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 origin-top animate-pop-in overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 text-sm shadow-lg">
          {matches.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(c.id)}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-zinc-50"
              >
                <span className="min-w-0 truncate text-zinc-900">{c.name}</span>
                <span className="shrink-0 text-xs text-zinc-400">
                  {c.priceTier === "WHOLESALE" ? "wholesale · " : ""}
                  {c.phone ?? ""}
                </span>
              </button>
            </li>
          ))}
          {matches.length === 0 && (
            <li className="px-3 py-2 text-xs text-zinc-400">{t("No customer matches.")}</li>
          )}
          <li className="border-t border-zinc-100">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={startAdding}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              <UserPlusIcon className="h-3.5 w-3.5" />
              {q ? `+ "${query.trim()}"` : t("Add a new customer")}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
