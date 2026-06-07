import type { AssistedPayload, Condition, MappedListing } from '@multimarket/shared';
import type { ListingForAdapter, MarketplaceAdapter } from './adapter';
import { KLEINANZEIGEN_CONDITION } from './conditions';

export class KleinanzeigenAdapter implements MarketplaceAdapter {
  id = 'KLEINANZEIGEN' as const;
  mode = 'assisted' as const;

  mapListing(listing: ListingForAdapter): MappedListing {
    return {
      marketplace: 'KLEINANZEIGEN',
      title: listing.title.slice(0, 70),
      description: listing.description,
      priceCents: listing.priceCents,
      currency: listing.currency,
      category: listing.category,
      condition: KLEINANZEIGEN_CONDITION[listing.condition as Condition] ?? listing.condition,
      photoUrls: listing.photoUrls,
    };
  }

  buildAssistedPayload(mapped: MappedListing): AssistedPayload {
    const price = (mapped.priceCents / 100).toFixed(2);
    return {
      marketplace: 'KLEINANZEIGEN',
      title: mapped.title,
      pasteText: `${mapped.title}\n\n${mapped.description}\n\nÉtat : ${mapped.condition}\nPrix : ${price} ${mapped.currency}`,
      deepLink: 'https://www.kleinanzeigen.de/p-anzeige-aufgeben.html',
      photoUrls: mapped.photoUrls,
    };
  }
}
