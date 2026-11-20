"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  ReceiptText,
  Package,
  Tags,
  Boxes,
  Truck,
  Users,
  UserCog,
  Settings,
  Wallet,
  BarChart3,
  Barcode,
  ReceiptIcon,
  VaultIcon,
  FileTextIcon,
  ShieldCheckIcon,
  CalendarCheckIcon,
  type LucideIcon,
} from "lucide-react";

// Icon components themselves are not serializable across the server→client
// boundary, so the server passes a plain string key and we resolve it here.
const icons = {
  dashboard: LayoutDashboard,
  pos: ShoppingCart,
  sales: ReceiptText,
  products: Package,
  categories: Tags,
  inventory: Boxes,
  purchases: Truck,
  suppliers: Users,
  customers: Users,
  dues: Wallet,
  reports: BarChart3,
  closing: CalendarCheckIcon,
  labels: Barcode,
  expenses: ReceiptIcon,
  shifts: VaultIcon,
  quotations: FileTextIcon,
  audit: ShieldCheckIcon,
  users: UserCog,
  settings: Settings,
} satisfies Record<string, LucideIcon>;

export type NavIcon = keyof typeof icons;

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  /** Section heading; consecutive items with the same group sit together. */
  group?: string;
};

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  // The most specific match wins, so /reports/daily lights "Daily closing", not "Reports".
  const activeHref = items
    .map((item) => item.href)
    .filter((href) =>
      href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`)
    )
    .sort((a, b) => b.length - a.length)[0];

  return (
    <nav className="flex flex-1 flex-col gap-0.5">
      {items.map((item, index) => {
        const startsGroup =
          item.group !== undefined && item.group !== items[index - 1]?.group;
        const active = item.href === activeHref;

        const Icon = icons[item.icon];

        return (
          <Fragment key={item.href}>
            {startsGroup && (
              <>
                <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 group-data-[collapsed=true]/side:hidden">
                  {item.group}
                </p>
                <hr className="mx-2 my-2 hidden border-white/10 group-data-[collapsed=true]/side:block" />
              </>
            )}
            <Link
              href={item.href}
              title={item.label}
              className={`flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium transition group-data-[collapsed=true]/side:justify-center group-data-[collapsed=true]/side:px-0 group-data-[collapsed=true]/side:py-2 ${
                active
                  ? "bg-brand-500/15 text-white"
                  : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
              }`}
            >
              <Icon
                className={`h-4.5 w-4.5 shrink-0 transition-colors ${active ? "text-brand-400" : ""}`}
                strokeWidth={2}
              />
              <span className="truncate group-data-[collapsed=true]/side:hidden">{item.label}</span>
            </Link>
          </Fragment>
        );
      })}
    </nav>
  );
}
