import "dotenv/config";
import { prisma } from "../app/lib/prisma";

async function main() {
  const [users, categories, products, sales, settings] = await Promise.all([
    prisma.user.count(),
    prisma.category.count(),
    prisma.product.count(),
    prisma.sale.count(),
    prisma.settings.count(),
  ]);

  console.log("DB connection OK:", { users, categories, products, sales, settings });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("DB connection FAILED:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
