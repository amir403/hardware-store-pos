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

  return (
    <nav className="flex flex-1 flex-col gap-0.5">
      {items.map((item, index) => {
        const startsGroup =
          item.group !== undefined && item.group !== items[index - 1]?.group;
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);

        const Icon = icons[item.icon];

        return (
          <Fragment key={item.href}>
            {startsGroup && (
              <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                {item.group}
              </p>
            )}
            <Link
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                active
                  ? "bg-brand-500/15 text-white"
                  : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
              }`}
            >
              <Icon
                className={`h-4.5 w-4.5 shrink-0 transition-colors ${active ? "text-brand-400" : ""}`}
                strokeWidth={2}
              />
              {item.label}
            </Link>
          </Fragment>
        );
      })}
    </nav>
  );
}
