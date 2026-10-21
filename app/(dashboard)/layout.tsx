import Link from "next/link";
import { Wrench, Plus } from "lucide-react";
import { getCurrentUser } from "@/app/lib/auth";
import { NavLinks, type NavItem } from "@/app/components/nav-links";
import { UserMenu } from "@/app/components/user-menu";
import { MobileNav } from "@/app/components/mobile-nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Real (secure) session check — the proxy only does an optimistic check.
  const user = await getCurrentUser();

  const navItems: NavItem[] = [
    { href: "/", label: "Dashboard", icon: "dashboard" },
    { href: "/pos", label: "New Sale", icon: "pos" },
    { href: "/sales", label: "Sales", icon: "sales" },
    { href: "/quotations", label: "Quotations", icon: "quotations" },
    { href: "/shifts", label: "Cash register", icon: "shifts" },
    { href: "/expenses", label: "Expenses", icon: "expenses" },
    { href: "/products", label: "Products", icon: "products" },
  ];

  if (user.role !== "CASHIER") {
    navItems.push(
      { href: "/categories", label: "Categories", icon: "categories" },
      { href: "/inventory", label: "Inventory", icon: "inventory" },
      { href: "/purchases", label: "Purchases", icon: "purchases" },
      { href: "/suppliers", label: "Suppliers", icon: "suppliers" },
      { href: "/labels", label: "Labels", icon: "labels" },
      { href: "/reports", label: "Reports", icon: "reports" }
    );
  }

  navItems.push({ href: "/customers", label: "Customers", icon: "customers" });

  if (user.role !== "CASHIER") {
    navItems.push({ href: "/dues", label: "Credits & dues", icon: "dues" });
  }

  if (user.role === "ADMIN") {
    navItems.push(
      { href: "/users", label: "Users", icon: "users" },
      { href: "/audit", label: "Audit log", icon: "audit" },
      { href: "/settings", label: "Settings", icon: "settings" }
    );
  }

  return (
    <div className="flex min-h-screen flex-1">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-zinc-950 p-4 lg:flex print:hidden">
        <Link
          href="/"
          className="mb-6 flex items-center gap-2.5 px-2 py-1"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-zinc-950">
            <Wrench className="h-5 w-5" />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-white">
              Hardware POS
            </span>
            <span className="text-[11px] text-zinc-500">Point of Sale</span>
          </span>
        </Link>

        <NavLinks items={navItems} />

        <div className="mt-4">
          <Link
            href="/pos"
            className="flex h-9 items-center justify-center gap-2 rounded-lg bg-white text-sm font-medium text-zinc-950 transition hover:bg-zinc-200"
          >
            <Plus className="h-4 w-4" />
            New Sale
          </Link>
        </div>

        <div className="mt-4">
          <UserMenu
            name={user.name ?? "User"}
            email={user.email ?? ""}
            role={user.role}
          />
        </div>
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col bg-zinc-50">
        {/* Mobile top bar + slide-in menu */}
        <MobileNav
          items={navItems}
          user={{
            name: user.name ?? "User",
            email: user.email ?? "",
            role: user.role,
          }}
        />

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
