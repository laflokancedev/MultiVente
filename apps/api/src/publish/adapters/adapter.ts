import type {
  AssistedPayload,
  MappedListing,
  Marketplace,
  PublishMode,
  PublishResult,
} from '@multimarket/shared';

export interface ListingForAdapter {
  title: string;
  description: string;
  priceCents: number;
  currency: string;
  category: string;
  condition: string;
  brand: string | null;
  color: string | null;
  size: string | null;
  location: string | null;
  photoUrls: string[];
}

export interface MarketplaceAdapter {
  id: Marketplace;
  mode: PublishMode;
  mapListing(listing: ListingForAdapter): MappedListing;
  publish?(mapped: MappedListing): Promise<PublishResult>;
  buildAssistedPayload?(mapped: MappedListing): AssistedPayload;
}
