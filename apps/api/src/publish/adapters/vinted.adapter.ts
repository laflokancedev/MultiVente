import type { AssistedPayload, Condition, MappedListing } from '@multimarket/shared';
import type { ListingForAdapter, MarketplaceAdapter } from './adapter';
import { VINTED_CONDITION } from './conditions';

export class VintedAdapter implements MarketplaceAdapter {
  id = 'VINTED' as const;
  mode = 'assisted' as const;

  mapListing(listing: ListingForAdapter): MappedListing {
    return {
      marketplace: 'VINTED',
      title: listing.title.slice(0, 100),
      description: listing.description,
      priceCents: listing.priceCents,
      currency: listing.currency,
      category: listing.category,
      condition: VINTED_CONDITION[listing.condition as Condition] ?? listing.condition,
      photoUrls: listing.photoUrls,
    };
  }

  buildAssistedPayload(mapped: MappedListing): AssistedPayload {
    const price = (mapped.priceCents / 100).toFixed(2);
    return {
      marketplace: 'VINTED',
      title: mapped.title,
      pasteText: `${mapped.title}\n\n${mapped.description}\n\nÉtat : ${mapped.condition}\nPrix : ${price} ${mapped.currency}`,
      deepLink: 'https://www.vinted.fr/items/new',
      photoUrls: mapped.photoUrls,
    };
  }
}
