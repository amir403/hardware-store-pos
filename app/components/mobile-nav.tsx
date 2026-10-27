"use client";

import { useState } from "react";
import Link from "next/link";
import { MenuIcon, Plus, Wrench, XIcon } from "lucide-react";
import { NavLinks, type NavItem } from "@/app/components/nav-links";
import { UserMenu } from "@/app/components/user-menu";
import { LangToggle, useT } from "@/app/components/lang";

/**
 * Top bar and slide-in menu for screens too narrow for the sidebar. Without it
 * a phone or tablet has no way to move between pages.
 */
export function MobileNav({
  items,
  user,
}: {
  items: NavItem[];
  user: { name: string; email: string; role: string };
}) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const close = () => setOpen(false);

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 lg:hidden print:hidden">
        <Link href="/" className="flex items-center gap-2" onClick={close}>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-white">
            <Wrench className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold text-zinc-900">Hardware POS</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/pos"
            onClick={close}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3 text-sm font-medium text-white"
          >
            <Plus className="h-4 w-4" />
            {t("Sale")}
          </Link>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={t("Open menu")}
            aria-expanded={open}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-300 text-zinc-700"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden print:hidden">
          <button
            type="button"
            aria-label={t("Close menu")}
            onClick={close}
            className="absolute inset-0 animate-fade-in bg-black/40"
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] animate-drawer-in flex-col overflow-y-auto bg-zinc-950 p-4">
            <div className="mb-4 flex items-center justify-between px-2">
              <span className="text-sm font-semibold text-white">{t("Menu")}</span>
              <button
                type="button"
                onClick={close}
                aria-label={t("Close menu")}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>
            {/* Any link tap closes the menu; the page change does the rest. */}
            <div onClick={close} className="flex flex-1 flex-col">
              <NavLinks items={items} />
            </div>
            <div className="mt-2">
              <LangToggle />
            </div>
            <div className="mt-4">
              <UserMenu name={user.name} email={user.email} role={user.role} />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
