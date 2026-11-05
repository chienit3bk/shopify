-- CreateTable
CREATE TABLE "PricingRule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyLocationId" TEXT NOT NULL,
    "companyLocationName" TEXT NOT NULL,
    "percentOff" REAL NOT NULL,
    "collectionId" TEXT,
    "collectionTitle" TEXT,
    "collectionPercentOff" REAL,
    "currency" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "priceListId" TEXT NOT NULL,
    "fixedPriceCount" INTEGER NOT NULL DEFAULT 0,
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "ruleId" INTEGER,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SyncLog_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "PricingRule" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PricingRule_shop_idx" ON "PricingRule"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "PricingRule_shop_companyLocationId_key" ON "PricingRule"("shop", "companyLocationId");

-- CreateIndex
CREATE INDEX "SyncLog_shop_createdAt_idx" ON "SyncLog"("shop", "createdAt");
