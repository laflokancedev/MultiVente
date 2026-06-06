export type Marketplace = 'EBAY' | 'VINTED' | 'LEBONCOIN';
export type PublishMode = 'auto' | 'assisted';
export type PublicationStatus =
  | 'pending'
  | 'awaiting_user'
  | 'published'
  | 'failed'
  | 'sold'
  | 'expired';

export interface Publication {
  id: string;
  marketplace: Marketplace;
  mode: PublishMode;
  status: PublicationStatus;
  externalId: string | null;
  externalUrl: string | null;
  error: string | null;
}

export interface MappedListing {
  marketplace: Marketplace;
  title: string;
  description: string;
  priceCents: number;
  currency: string;
  category: string;
  condition: string;
  photoUrls: string[];
}

export interface AssistedPayload {
  marketplace: Marketplace;
  title: string;
  pasteText: string;
  deepLink: string;
  photoUrls: string[];
}

export interface PublishResult {
  externalId: string;
  externalUrl: string;
}
