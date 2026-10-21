"use client";

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
};

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-1">
      {items.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);

        const Icon = icons[item.icon];

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              active
                ? "bg-white/10 text-white"
                : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
            }`}
          >
            <Icon className="h-4.5 w-4.5 shrink-0" strokeWidth={2} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
