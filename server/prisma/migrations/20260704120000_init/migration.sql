-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('STOCK', 'FII');

-- CreateTable
CREATE TABLE "Asset" (
    "id" SERIAL NOT NULL,
    "ticker" TEXT NOT NULL,
    "name" TEXT,
    "type" "AssetType" NOT NULL,
    "sector" TEXT,
    "segment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteSnapshot" (
    "id" SERIAL NOT NULL,
    "ticker" TEXT NOT NULL,
    "price" DOUBLE PRECISION,
    "changePercent" DOUBLE PRECISION,
    "volume" DOUBLE PRECISION,
    "marketCap" DOUBLE PRECISION,
    "source" TEXT NOT NULL,
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundamentalsSnapshot" (
    "id" SERIAL NOT NULL,
    "ticker" TEXT NOT NULL,
    "assetType" "AssetType" NOT NULL,
    "rawJson" TEXT NOT NULL,
    "normalizedJson" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundamentalsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DividendSnapshot" (
    "id" SERIAL NOT NULL,
    "ticker" TEXT NOT NULL,
    "rawJson" TEXT NOT NULL,
    "normalizedJson" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DividendSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreSnapshot" (
    "id" SERIAL NOT NULL,
    "ticker" TEXT NOT NULL,
    "finalScore" DOUBLE PRECISION NOT NULL,
    "qualityScore" DOUBLE PRECISION NOT NULL,
    "valuationScore" DOUBLE PRECISION NOT NULL,
    "incomeScore" DOUBLE PRECISION NOT NULL,
    "growthScore" DOUBLE PRECISION,
    "riskScore" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "missingFields" TEXT NOT NULL,
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL,
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAnalysis" (
    "id" SERIAL NOT NULL,
    "ticker" TEXT NOT NULL,
    "scoreSnapshotId" INTEGER,
    "analysisText" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiFailureLog" (
    "id" SERIAL NOT NULL,
    "ticker" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "statusCode" INTEGER,
    "errorMessage" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiFailureLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Asset_ticker_key" ON "Asset"("ticker");

-- CreateIndex
CREATE INDEX "QuoteSnapshot_ticker_createdAt_idx" ON "QuoteSnapshot"("ticker", "createdAt");

-- CreateIndex
CREATE INDEX "FundamentalsSnapshot_ticker_createdAt_idx" ON "FundamentalsSnapshot"("ticker", "createdAt");

-- CreateIndex
CREATE INDEX "DividendSnapshot_ticker_createdAt_idx" ON "DividendSnapshot"("ticker", "createdAt");

-- CreateIndex
CREATE INDEX "ScoreSnapshot_ticker_createdAt_idx" ON "ScoreSnapshot"("ticker", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiAnalysis_ticker_inputHash_key" ON "AiAnalysis"("ticker", "inputHash");

-- CreateIndex
CREATE INDEX "AiAnalysis_ticker_createdAt_idx" ON "AiAnalysis"("ticker", "createdAt");

-- CreateIndex
CREATE INDEX "ApiFailureLog_ticker_createdAt_idx" ON "ApiFailureLog"("ticker", "createdAt");

-- AddForeignKey
ALTER TABLE "AiAnalysis" ADD CONSTRAINT "AiAnalysis_scoreSnapshotId_fkey" FOREIGN KEY ("scoreSnapshotId") REFERENCES "ScoreSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAnalysis" ADD CONSTRAINT "AiAnalysis_ticker_fkey" FOREIGN KEY ("ticker") REFERENCES "Asset"("ticker") ON DELETE RESTRICT ON UPDATE CASCADE;
