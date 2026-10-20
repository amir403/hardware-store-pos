import "dotenv/config";
import { prisma } from "../app/lib/prisma";
import { getCustomerBalances, getTotalReceivables } from "../app/lib/ledger";
import { toNum, round2 } from "../app/lib/format";

/** End-to-end read of the new ledger pieces, from a fresh process. */
async function main() {
  const customers = await prisma.customer.findMany({
    select: { id: true, name: true, creditLimit: true },
  });
  const balances = await getCustomerBalances(customers.map((c) => c.id));

  for (const customer of customers) {
    const b = balances.get(customer.id)!;
    console.log(
      `${customer.name.padEnd(22)} billed=${b.billed} collected=${b.collected} outstanding=${b.outstanding} invoiceDue=${b.invoiceDue} limit=${customer.creditLimit === null ? "none" : toNum(customer.creditLimit)}`
    );
  }

  console.log("payments recorded:", await prisma.customerPayment.count());
  console.log("total receivables:", await getTotalReceivables());

  // Proves the migrated columns are visible to the generated client.
  const dueDated = await prisma.sale.findMany({
    where: { dueDate: { not: null } },
    select: { invoiceNo: true, dueDate: true, total: true, paidAmount: true },
    orderBy: { dueDate: "asc" },
  });
  console.log(
    "sales with a due date:",
    dueDated.map((s) => `${s.invoiceNo} due ${s.dueDate?.toISOString()} bal=${round2(toNum(s.total) - toNum(s.paidAmount))}`)
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
