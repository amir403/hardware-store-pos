import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../app/lib/prisma";

async function main() {
  console.log("Seeding database…");

  // --- Settings -----------------------------------------------------------
  await prisma.settings.upsert({
    where: { id: "main" },
    update: {},
    create: {
      id: "main",
      storeName: "Raza Hardware & Tools",
      address: "Shop 12, Main Bazaar, Lahore",
      phone: "0300-1234567",
      currency: "PKR",
      taxRate: 0,
      pricesIncludeTax: true,
      receiptFooter: "Thank you for shopping with us!",
    },
  });

  // --- Users ---------------------------------------------------------------
  const hashedAdmin = await bcrypt.hash("admin123", 10);
  const hashedManager = await bcrypt.hash("manager123", 10);
  const hashedCashier = await bcrypt.hash("cashier123", 10);

  const [admin] = await Promise.all([
    prisma.user.upsert({
      where: { email: "admin@store.com" },
      update: {},
      create: {
        name: "Aamir Raza",
        email: "admin@store.com",
        hashedPassword: hashedAdmin,
        role: "ADMIN",
      },
    }),
    prisma.user.upsert({
      where: { email: "manager@store.com" },
      update: {},
      create: {
        name: "Bilal Ahmed",
        email: "manager@store.com",
        hashedPassword: hashedManager,
        role: "MANAGER",
      },
    }),
    prisma.user.upsert({
      where: { email: "cashier@store.com" },
      update: {},
      create: {
        name: "Kashif Ali",
        email: "cashier@store.com",
        hashedPassword: hashedCashier,
        role: "CASHIER",
      },
    }),
  ]);

  // --- Categories ----------------------------------------------------------
  const categoryNames = [
    "Hand Tools",
    "Power Tools",
    "Fasteners",
    "Plumbing",
    "Electrical",
    "Paint & Sundries",
    "Building Materials",
    "Gardening",
  ];

  const categories: Record<string, string> = {};
  for (const name of categoryNames) {
    const category = await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    categories[name] = category.id;
  }

  // --- Products ------------------------------------------------------------
  type ProductSeed = {
    name: string;
    sku: string;
    barcode?: string;
    unit?: string;
    costPrice: number;
    price: number;
    taxRate?: number;
    stockQty: number;
    reorderLevel?: number;
    category: string;
  };

  const products: ProductSeed[] = [
    // Hand Tools
    { name: "Claw Hammer 16oz", sku: "HT-HAM-016", barcode: "8801234500011", costPrice: 450, price: 699, stockQty: 34, reorderLevel: 10, category: "Hand Tools" },
    { name: "Screwdriver Set 6pc", sku: "HT-SCR-006", barcode: "8801234500028", costPrice: 620, price: 950, stockQty: 22, reorderLevel: 8, category: "Hand Tools" },
    { name: "Adjustable Wrench 10\"", sku: "HT-WRE-010", barcode: "8801234500035", costPrice: 780, price: 1199, stockQty: 15, reorderLevel: 6, category: "Hand Tools" },
    { name: "Tape Measure 5m", sku: "HT-TAP-005", barcode: "8801234500042", costPrice: 280, price: 450, stockQty: 48, reorderLevel: 12, category: "Hand Tools" },
    { name: "Hacksaw Frame 12\"", sku: "HT-HSW-012", costPrice: 550, price: 850, stockQty: 9, reorderLevel: 5, category: "Hand Tools" },
    { name: "Spirit Level 24\"", sku: "HT-LEV-024", costPrice: 900, price: 1400, stockQty: 7, reorderLevel: 4, category: "Hand Tools" },

    // Power Tools
    { name: "Electric Drill 650W", sku: "PT-DRL-650", barcode: "8801234500119", costPrice: 4200, price: 6200, stockQty: 8, reorderLevel: 3, category: "Power Tools" },
    { name: "Angle Grinder 4\"", sku: "PT-GRD-004", barcode: "8801234500126", costPrice: 3800, price: 5600, stockQty: 6, reorderLevel: 3, category: "Power Tools" },
    { name: "Circular Saw 7.25\"", sku: "PT-SAW-725", costPrice: 7500, price: 10900, stockQty: 3, reorderLevel: 2, category: "Power Tools" },
    { name: "Jigsaw 720W", sku: "PT-JSG-720", costPrice: 4900, price: 7200, stockQty: 4, reorderLevel: 2, category: "Power Tools" },

    // Fasteners
    { name: "Steel Screws 3x25mm (100pk)", sku: "FS-SCR-325", barcode: "8801234500218", costPrice: 140, price: 240, stockQty: 120, reorderLevel: 30, category: "Fasteners" },
    { name: "Wall Plugs 8mm (100pk)", sku: "FS-PLG-008", barcode: "8801234500225", costPrice: 90, price: 160, stockQty: 200, reorderLevel: 50, category: "Fasteners" },
    { name: "Nails 2\" (500g)", sku: "FS-NAL-002", costPrice: 110, price: 185, stockQty: 85, reorderLevel: 20, category: "Fasteners" },
    { name: "Bolts & Nuts M8 (50pk)", sku: "FS-BLT-008", costPrice: 260, price: 420, stockQty: 40, reorderLevel: 15, category: "Fasteners" },

    // Plumbing
    { name: "PVC Pipe 1\" (10ft)", sku: "PL-PVC-001", unit: "pcs", costPrice: 320, price: 490, stockQty: 60, reorderLevel: 20, category: "Plumbing" },
    { name: "PVC Elbow 1\" (each)", sku: "PL-ELB-001", costPrice: 25, price: 45, stockQty: 300, reorderLevel: 80, category: "Plumbing" },
    { name: "Ball Valve 1/2\"", sku: "PL-VAL-012", costPrice: 350, price: 550, stockQty: 25, reorderLevel: 10, category: "Plumbing" },
    { name: "Teflon Tape (roll)", sku: "PL-TFL-001", barcode: "8801234500317", costPrice: 30, price: 60, stockQty: 150, reorderLevel: 40, category: "Plumbing" },
    { name: "Sink Drain Assembly", sku: "PL-DRN-001", costPrice: 640, price: 990, stockQty: 11, reorderLevel: 5, category: "Plumbing" },

    // Electrical
    { name: "LED Bulb 12W", sku: "EL-LED-012", barcode: "8801234500414", costPrice: 180, price: 320, stockQty: 90, reorderLevel: 25, category: "Electrical" },
    { name: "Switchboard 2-gang", sku: "EL-SWB-002", costPrice: 220, price: 380, stockQty: 35, reorderLevel: 10, category: "Electrical" },
    { name: "Cable 2.5mm (per yard)", sku: "EL-CBL-250", unit: "yard", costPrice: 45, price: 80, stockQty: 500, reorderLevel: 100, category: "Electrical" },
    { name: "Extension Cord 5m", sku: "EL-EXT-005", barcode: "8801234500421", costPrice: 480, price: 750, stockQty: 18, reorderLevel: 6, category: "Electrical" },
    { name: "Socket Outlet 13A", sku: "EL-SOC-013", costPrice: 160, price: 280, stockQty: 44, reorderLevel: 12, category: "Electrical" },

    // Paint & Sundries
    { name: "Emulsion Paint White 4L", sku: "PN-EMW-004", barcode: "8801234500511", costPrice: 1850, price: 2700, stockQty: 14, reorderLevel: 5, category: "Paint & Sundries" },
    { name: "Paint Brush 3\"", sku: "PN-BRS-003", costPrice: 120, price: 210, stockQty: 55, reorderLevel: 15, category: "Paint & Sundries" },
    { name: "Paint Roller 9\"", sku: "PN-ROL-009", costPrice: 190, price: 330, stockQty: 38, reorderLevel: 12, category: "Paint & Sundries" },
    { name: "Masking Tape 2\" (roll)", sku: "PN-MSK-002", costPrice: 55, price: 95, stockQty: 70, reorderLevel: 20, category: "Paint & Sundries" },
    { name: "Turpentine 1L", sku: "PN-TRP-001", costPrice: 340, price: 520, stockQty: 8, reorderLevel: 4, category: "Paint & Sundries" },

    // Building Materials
    { name: "Cement (50kg bag)", sku: "BM-CEM-050", barcode: "8801234500618", costPrice: 1150, price: 1390, stockQty: 25, reorderLevel: 10, category: "Building Materials" },
    { name: "Brick (per 1000)", sku: "BM-BRK-001", costPrice: 13500, price: 16000, stockQty: 2, reorderLevel: 1, category: "Building Materials" },
    { name: "Sand (per cft)", sku: "BM-SND-001", unit: "cft", costPrice: 42, price: 65, stockQty: 320, reorderLevel: 50, category: "Building Materials" },
    { name: "Steel Rod 3/8\" (per sari)", sku: "BM-Rod-038", costPrice: 380, price: 480, stockQty: 40, reorderLevel: 10, category: "Building Materials" },

    // Gardening
    { name: "Garden Shears 8\"", sku: "GD-SHE-008", costPrice: 520, price: 800, stockQty: 12, reorderLevel: 4, category: "Gardening" },
    { name: "Watering Can 10L", sku: "GD-WCN-010", costPrice: 480, price: 720, stockQty: 10, reorderLevel: 4, category: "Gardening" },
    { name: "Garden Hose 15m", sku: "GD-HOS-015", costPrice: 980, price: 1450, stockQty: 6, reorderLevel: 3, category: "Gardening" },

    // Services
    { name: "Tool Sharpening", sku: "SV-SHR-001", unit: "hr", costPrice: 0, price: 500, stockQty: 0, reorderLevel: 0, category: "Hand Tools", taxRate: 0 },
    { name: "Pipe Fitting Service", sku: "SV-PIP-001", unit: "hr", costPrice: 0, price: 1200, stockQty: 0, reorderLevel: 0, category: "Plumbing" },
  ];

  for (const p of products) {
    await prisma.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: {
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        unit: p.unit ?? "pcs",
        costPrice: p.costPrice,
        price: p.price,
        taxRate: p.taxRate ?? 0,
        stockQty: p.stockQty,
        reorderLevel: p.reorderLevel,
        trackStock: !p.sku.startsWith("SV-"),
        categoryId: categories[p.category],
      },
    });
  }

  // --- Parties ---------------------------------------------------------------
  await prisma.supplier.upsert({
    where: { id: "supplier-seed-1" },
    update: {},
    create: {
      id: "supplier-seed-1",
      name: "Lahore Tools Wholesale",
      phone: "042-37123456",
      address: "Shah Alam Market, Lahore",
      notes: "Main supplier for hand & power tools",
    },
  });

  await prisma.customer.upsert({
    where: { id: "customer-seed-1" },
    update: {},
    create: {
      id: "customer-seed-1",
      name: "Walk-in Regulars",
      notes: "Placeholder record; walk-in sales have no customer",
    },
  });

  const counts = {
    users: await prisma.user.count(),
    categories: await prisma.category.count(),
    products: await prisma.product.count(),
    suppliers: await prisma.supplier.count(),
    customers: await prisma.customer.count(),
  };

  console.log("Seed complete:", counts);
  console.log("Admin login:    admin@store.com / admin123");
  console.log("Manager login:  manager@store.com / manager123");
  console.log("Cashier login:  cashier@store.com / cashier123");
  void admin;
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("Seed failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
