import type { Marketplace, PublicationStatus } from './publish';

export interface MarketplaceStat {
  marketplace: Marketplace;
  published: number;
  awaiting_user: number;
  failed: number;
  pending: number;
}

export interface DashboardStats {
  activeListings: number;
  publicationsByStatus: Record<PublicationStatus, number>;
  successRate: number | null; // published / (published + failed); null when denominator is 0
  byMarketplace: MarketplaceStat[]; // always EBAY, VINTED, LEBONCOIN
}
