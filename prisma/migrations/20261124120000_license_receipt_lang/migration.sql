-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "licenseKey" TEXT,
ADD COLUMN     "receiptLang" TEXT NOT NULL DEFAULT 'en';
