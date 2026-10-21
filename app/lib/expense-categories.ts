// Client-safe: no database imports, so forms can share the same list.
export const EXPENSE_CATEGORIES = [
  "RENT",
  "UTILITIES",
  "SALARY",
  "TRANSPORT",
  "MAINTENANCE",
  "SUPPLIES",
  "FOOD",
  "OTHER",
] as const;

export type ExpenseCategoryValue = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_LABELS: Record<ExpenseCategoryValue, string> = {
  RENT: "Rent",
  UTILITIES: "Bills & utilities",
  SALARY: "Salaries & wages",
  TRANSPORT: "Transport & delivery",
  MAINTENANCE: "Repairs & maintenance",
  SUPPLIES: "Shop supplies",
  FOOD: "Tea & food",
  OTHER: "Other",
};
