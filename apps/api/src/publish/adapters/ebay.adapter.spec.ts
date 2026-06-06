import { EbayAdapter } from './ebay.adapter';
import { MockEbayClient } from './ebay.client';
import type { ListingForAdapter } from './adapter';

const listing: ListingForAdapter = {
  title: 'Veste',
  description: 'desc',
  priceCents: 4500,
  currency: 'EUR',
  category: 'mode',
  condition: 'good',
  brand: null,
  color: null,
  size: null,
  location: null,
  photoUrls: ['http://x/1.jpg'],
};

describe('EbayAdapter', () => {
  const adapter = new EbayAdapter(new MockEbayClient());

  it('is an auto adapter for EBAY', () => {
    expect(adapter.id).toBe('EBAY');
    expect(adapter.mode).toBe('auto');
  });

  it('maps condition to an eBay enum', () => {
    expect(adapter.mapListing(listing).condition).toBe('USED_GOOD');
  });

  it('publishes via the client and returns an external id + url', async () => {
    const result = await adapter.publish(adapter.mapListing(listing));
    expect(result.externalId).toContain('EBAY');
    expect(result.externalUrl).toContain('ebay.com');
  });
});
