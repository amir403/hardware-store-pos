-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "variantName" TEXT;

-- CreateTable
CREATE TABLE "ProductGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_groupId_idx" ON "Product"("groupId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ProductGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
