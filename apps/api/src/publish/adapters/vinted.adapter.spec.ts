import { VintedAdapter } from './vinted.adapter';
import type { ListingForAdapter } from './adapter';

const listing: ListingForAdapter = {
  title: 'Veste en cuir',
  description: 'Très bon état, peu portée',
  priceCents: 4500,
  currency: 'EUR',
  category: 'mode',
  condition: 'good',
  brand: 'Levis',
  color: 'noir',
  size: 'M',
  location: 'Paris',
  photoUrls: ['http://x/1.jpg', 'http://x/2.jpg'],
};

describe('VintedAdapter', () => {
  const adapter = new VintedAdapter();

  it('is an assisted adapter for VINTED', () => {
    expect(adapter.id).toBe('VINTED');
    expect(adapter.mode).toBe('assisted');
  });

  it('maps the condition to a Vinted label and carries photos', () => {
    const mapped = adapter.mapListing(listing);
    expect(mapped.condition).toBe('Très bon état');
    expect(mapped.photoUrls).toHaveLength(2);
    expect(mapped.marketplace).toBe('VINTED');
  });

  it('builds an assisted payload with paste text and a deep link', () => {
    const payload = adapter.buildAssistedPayload(adapter.mapListing(listing));
    expect(payload.deepLink).toContain('vinted');
    expect(payload.pasteText).toContain('Veste en cuir');
    expect(payload.pasteText).toContain('45');
    expect(payload.photoUrls).toHaveLength(2);
  });
});
