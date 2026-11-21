// Client-safe: what each role can do, in words, for the Users page.
// This describes the checks in app/actions and the (dashboard) pages; when a
// hasRole(...) gate changes there, change the matching row here.
import type { Role } from "@/app/lib/auth";

export const ROLE_INFO: Record<Role, { label: string; summary: string }> = {
  ADMIN: {
    label: "Admin",
    summary: "Everything, including users, settings, the audit log and deleting payments.",
  },
  MANAGER: {
    label: "Manager",
    summary: "Runs the shop: stock, purchases, suppliers, refunds and reports. No users or settings.",
  },
  CASHIER: {
    label: "Cashier",
    summary: "Sells at the counter at catalogue prices, with a capped discount. No stock, refunds or reports.",
  },
};

/** Listed most powerful first, the way the badge colours read. */
export const ROLE_ORDER: Role[] = ["ADMIN", "MANAGER", "CASHIER"];

/** `cashier` may be a note instead of a plain yes/no. */
export type Permission = { label: string; admin: boolean; manager: boolean; cashier: boolean | string };

export function rolePermissions(cashierMaxDiscountPct: number): Permission[] {
  return [
    { label: "Sell, hold bills, quotations, cash register", admin: true, manager: true, cashier: true },
    { label: "Change prices on a bill", admin: true, manager: true, cashier: false },
    { label: "Discount on a bill", admin: true, manager: true, cashier: `up to ${cashierMaxDiscountPct}%` },
    { label: "Add customers and take their payments", admin: true, manager: true, cashier: true },
    { label: "Add expenses", admin: true, manager: true, cashier: true },
    { label: "Refund, return or void a sale", admin: true, manager: true, cashier: false },
    { label: "Products, stock, purchases, labels", admin: true, manager: true, cashier: "view products" },
    { label: "Suppliers, credits & dues", admin: true, manager: true, cashier: false },
    { label: "Reports and daily closing", admin: true, manager: true, cashier: false },
    { label: "Delete payments and expenses", admin: true, manager: false, cashier: false },
    { label: "Users, settings, audit log", admin: true, manager: false, cashier: false },
  ];
}

/** Passwords the demo seed gives its users; an account still using one is open to anyone. */
export const SEED_PASSWORDS = ["admin123", "manager123", "cashier123"];
