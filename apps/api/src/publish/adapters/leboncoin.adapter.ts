import type { AssistedPayload, Condition, MappedListing } from '@multimarket/shared';
import type { ListingForAdapter, MarketplaceAdapter } from './adapter';
import { LEBONCOIN_CONDITION } from './conditions';

export class LeboncoinAdapter implements MarketplaceAdapter {
  id = 'LEBONCOIN' as const;
  mode = 'assisted' as const;

  mapListing(listing: ListingForAdapter): MappedListing {
    return {
      marketplace: 'LEBONCOIN',
      title: listing.title.slice(0, 50),
      description: listing.description,
      priceCents: listing.priceCents,
      currency: listing.currency,
      category: listing.category,
      condition: LEBONCOIN_CONDITION[listing.condition as Condition] ?? listing.condition,
      photoUrls: listing.photoUrls,
    };
  }

  buildAssistedPayload(mapped: MappedListing): AssistedPayload {
    const price = (mapped.priceCents / 100).toFixed(2);
    return {
      marketplace: 'LEBONCOIN',
      title: mapped.title,
      pasteText: `${mapped.title}\n\n${mapped.description}\n\nÉtat : ${mapped.condition}\nPrix : ${price} ${mapped.currency}`,
      deepLink: 'https://www.leboncoin.fr/deposer-une-annonce',
      photoUrls: mapped.photoUrls,
    };
  }
}
