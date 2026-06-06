import { randomUUID } from 'node:crypto';
import type { MappedListing, PublishResult } from '@multimarket/shared';

export interface EbayClient {
  createListing(mapped: MappedListing): Promise<PublishResult>;
}

// Used until real eBay developer credentials are configured. It does not call
// the network — it simulates a successful eBay listing creation.
export class MockEbayClient implements EbayClient {
  async createListing(_mapped: MappedListing): Promise<PublishResult> {
    const id = `EBAY-MOCK-${randomUUID().slice(0, 8)}`;
    return { externalId: id, externalUrl: `https://sandbox.ebay.com/itm/${id}` };
  }
}

export const EBAY_CLIENT = Symbol('EBAY_CLIENT');
