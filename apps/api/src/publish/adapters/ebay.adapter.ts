import type { Condition, MappedListing, PublishResult } from '@multimarket/shared';
import type { ListingForAdapter, MarketplaceAdapter } from './adapter';
import type { EbayClient } from './ebay.client';
import { EBAY_CONDITION } from './conditions';

export class EbayAdapter implements MarketplaceAdapter {
  id = 'EBAY' as const;
  mode = 'auto' as const;

  constructor(private client: EbayClient) {}

  mapListing(listing: ListingForAdapter): MappedListing {
    return {
      marketplace: 'EBAY',
      title: listing.title.slice(0, 80),
      description: listing.description,
      priceCents: listing.priceCents,
      currency: listing.currency,
      category: listing.category,
      condition: EBAY_CONDITION[listing.condition as Condition] ?? 'USED_GOOD',
      photoUrls: listing.photoUrls,
    };
  }

  publish(mapped: MappedListing): Promise<PublishResult> {
    return this.client.createListing(mapped);
  }
}
