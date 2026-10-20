# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Overview

Point-of-sale and back-office app for a single hardware store: POS terminal, products/categories, purchases, inventory, customers (credit/udhaar ledger), suppliers, sales/refunds, reports, barcode labels, users and settings. Stack: Next.js 16 App Router, React 19, Prisma 7 on PostgreSQL, NextAuth v5 (credentials), Zod 4, Tailwind 4. `POS-UPGRADES.md` holds the feature roadmap (in Roman Urdu).

## Commands

```bash
npm run dev            # Next dev server on :3000
npm run build
npm run lint           # eslint (flat config, next core-web-vitals + typescript)
npm run db:start       # start local Postgres via `prisma dev` (detached); db:stop / db:ls
npm run db:migrate     # prisma migrate dev
npm run db:seed        # seed settings, users (admin/manager/cashier @store.com), sample data
npx prisma generate    # regenerate client into app/generated/prisma (gitignored — required after clone or schema change)
```

There is no test framework. Verification is done with standalone scripts run via `tsx` against the real database:

- `npm run db:check` — connectivity and row counts
- `npm run check:ledger` — prints customer balances/receivables from `app/lib/ledger.ts`
- `npm run check:barcode` — Code128 encoder checks
- `scripts/smoke-pages.ps1 [-Port 3000]` — PowerShell 7 smoke test: logs in as the seeded admin, fetches the main dashboard pages, and flags Prisma/runtime error markers in the HTML (dev server must be running)

`DATABASE_URL` (and optionally `SHADOW_DATABASE_URL`) come from `.env`; the datasource URL is set in `prisma.config.ts`, not in `schema.prisma`.

## Architecture

- **Routing**: `app/(auth)/login` and `app/(dashboard)/*`. The `(dashboard)/layout.tsx` performs the real session check; `proxy.ts` (Next 16's replacement for `middleware.ts`) only does an optimistic cookie-presence redirect.
- **Auth**: `auth.ts` at the root configures NextAuth with a JWT session and a Credentials provider (bcrypt, `isActive` check); `role` (`ADMIN | MANAGER | CASHIER`) is carried on the token (types in `types/next-auth.d.ts`). Use the helpers in `app/lib/auth.ts`: `getCurrentUser()` in server components (redirects), `getActionUser()` in server actions (throws), and `hasRole(user, ...)` for permission gates.
- **Data flow**: dashboard pages are server components that query Prisma directly. All mutations are server actions in `app/actions/*.ts` (`"use server"`), validated with Zod, wrapped in `prisma.$transaction` where stock/money is involved, followed by `revalidatePath(...)` for every affected route. Client forms in `app/components/` use `useActionState`; actions return `{ error }` or a result object rather than throwing on validation failures.
- **Prisma client**: always import `prisma` from `@/app/lib/prisma` and types from `@/app/generated/prisma/client`. That module uses the `@prisma/adapter-pg` driver adapter with a `pg.Pool`, and wraps the client in a Proxy that retries model queries on dropped connections (the `prisma dev` proxy severs idle sockets). `$transaction`/`$queryRaw` are passed through **without** retry.
- **Inventory**: every stock change (sale, purchase, refund, adjustment, damage) writes a signed `StockMovement` row alongside updating the product's stock, inside the same transaction. Quantities are `Decimal(12,3)` (fractional units like meters/kg); money is 2-decimal. Convert Prisma `Decimal`s with `toNum` and round with `round2`/`round3` from `app/lib/format.ts`.
- **Customer ledger**: balances are *derived* from sales and `CustomerPayment` rows and never stored on `Customer`; all ledger math lives in `app/lib/ledger.ts` so the POS credit-limit check, customer list and ledger page agree. Pass the transaction client when checking credit inside a sale.
- **Settings**: a single `Settings` row with `id = "main"`, read via the React-cached `getSettings()` in `app/lib/settings.ts`.
- **Other libs**: `app/lib/barcode.ts` is a self-contained Code128 encoder (used by labels); `app/lib/reorder.ts` builds the low-stock reorder plan that feeds draft purchase orders. `app/api/export/sales` is a CSV export route.
