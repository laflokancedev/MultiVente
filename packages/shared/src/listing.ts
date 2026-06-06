import type { Marketplace, PublicationStatus } from './publish';

export type Condition = 'new' | 'like_new' | 'good' | 'fair';
export type ListingStatus = 'draft' | 'active' | 'sold' | 'archived';

export interface ListingPhoto {
  id: string;
  url: string;
  order: number;
}

export interface Listing {
  id: string;
  title: string;
  description: string;
  priceCents: number;
  currency: string;
  category: string;
  condition: Condition;
  brand: string | null;
  color: string | null;
  size: string | null;
  location: string | null;
  shippingOptions: unknown;
  status: ListingStatus;
  photos: ListingPhoto[];
  publications?: { marketplace: Marketplace; status: PublicationStatus }[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateListingInput {
  title: string;
  description: string;
  priceCents: number;
  currency?: string;
  category: string;
  condition: Condition;
  brand?: string;
  color?: string;
  size?: string;
  location?: string;
  shippingOptions?: unknown;
}

export type UpdateListingInput = Partial<CreateListingInput> & { status?: ListingStatus };

export interface PresignResponse {
  uploadUrl: string;
  key: string;
  publicUrl: string;
}
