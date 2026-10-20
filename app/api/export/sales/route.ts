import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { toNum } from "@/app/lib/format";

export const runtime = "nodejs";

const STATUSES = ["COMPLETED", "HELD", "REFUNDED", "VOID"] as const;
type SaleStatusValue = (typeof STATUSES)[number];

/** RFC 4180 quoting: anything with a comma, quote or newline gets wrapped. */
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(",");
}

/**
 * GET /api/export/sales?q=&status=&from=&to=
 * Streams the sales list as a UTF-8 (BOM) CSV so Excel opens the currency
 * symbols correctly. Same filters as the on-screen table.
 */
export async function GET(req: Request) {
  // The proxy deliberately skips /api, so verify the session here.
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const statusParam = searchParams.get("status") ?? "";
  const status: "" | SaleStatusValue = STATUSES.includes(
    statusParam as SaleStatusValue
  )
    ? (statusParam as SaleStatusValue)
    : "";
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const sales = await prisma.sale.findMany({
    where: {
      ...(q
        ? {
            OR: [
              { invoiceNo: { contains: q, mode: "insensitive" } },
              { customer: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
      ...(status ? { status } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(`${to}T23:59:59.999`) } : {}),
            },
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
    include: {
      user: { select: { name: true } },
      customer: { select: { name: true } },
      _count: { select: { items: true } },
    },
  });

  const header = [
    "Invoice",
    "Date",
    "Cashier",
    "Customer",
    "Items",
    "Payment",
    "Status",
    "Subtotal",
    "Discount",
    "Tax",
    "Total",
    "Paid",
    "Change",
    "Note",
  ];

  const lines = [
    csvRow(header),
    ...sales.map((s) =>
      csvRow([
        s.invoiceNo,
        s.createdAt.toISOString(),
        s.user.name ?? "",
        s.customer?.name ?? "Walk-in",
        s._count.items,
        s.paymentMethod,
        s.status,
        toNum(s.subtotal).toFixed(2),
        toNum(s.discountAmount).toFixed(2),
        toNum(s.taxAmount).toFixed(2),
        toNum(s.total).toFixed(2),
        toNum(s.paidAmount).toFixed(2),
        toNum(s.changeAmount).toFixed(2),
        s.note ?? "",
      ])
    ),
  ];

  // BOM keeps Excel from mangling the currency symbol.
  const csv = `\uFEFF${lines.join("\r\n")}\r\n`;

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sales-${status ? status.toLowerCase() : "all"}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
