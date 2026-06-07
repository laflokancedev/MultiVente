import type { Marketplace, PublishMode } from './publish';

export interface MarketplaceMeta {
  id: Marketplace;
  label: string;
  mode: PublishMode;
}

export const MARKETPLACES: MarketplaceMeta[] = [
  { id: 'EBAY', label: 'eBay', mode: 'auto' },
  { id: 'VINTED', label: 'Vinted', mode: 'assisted' },
  { id: 'LEBONCOIN', label: 'Leboncoin', mode: 'assisted' },
  { id: 'WALLAPOP', label: 'Wallapop', mode: 'assisted' },
  { id: 'KLEINANZEIGEN', label: 'Kleinanzeigen', mode: 'assisted' },
  { id: 'SUBITO', label: 'Subito', mode: 'assisted' },
];

export interface MarketplaceAccountView {
  marketplace: Marketplace;
  mode: PublishMode;
  connected: boolean;
}
