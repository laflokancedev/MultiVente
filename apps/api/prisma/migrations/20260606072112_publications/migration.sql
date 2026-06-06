-- CreateEnum
CREATE TYPE "Marketplace" AS ENUM ('EBAY', 'VINTED', 'LEBONCOIN');

-- CreateEnum
CREATE TYPE "PublishMode" AS ENUM ('auto', 'assisted');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('pending', 'awaiting_user', 'published', 'failed', 'sold', 'expired');

-- CreateTable
CREATE TABLE "Publication" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "marketplace" "Marketplace" NOT NULL,
    "mode" "PublishMode" NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'pending',
    "externalId" TEXT,
    "externalUrl" TEXT,
    "error" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Publication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Publication_listingId_marketplace_key" ON "Publication"("listingId", "marketplace");

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
