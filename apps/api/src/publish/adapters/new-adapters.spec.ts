import { WallapopAdapter } from './wallapop.adapter';
import { KleinanzeigenAdapter } from './kleinanzeigen.adapter';
import { SubitoAdapter } from './subito.adapter';
import type { ListingForAdapter } from './adapter';

const listing: ListingForAdapter = {
  title: 'Veste en cuir',
  description: 'Très bon état',
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

describe('new assisted adapters', () => {
  it('Wallapop is assisted, maps the ES condition and builds a deep link', () => {
    const a = new WallapopAdapter();
    expect(a.id).toBe('WALLAPOP');
    expect(a.mode).toBe('assisted');
    const mapped = a.mapListing(listing);
    expect(mapped.condition).toBe('En buen estado');
    expect(mapped.marketplace).toBe('WALLAPOP');
    const payload = a.buildAssistedPayload(mapped);
    expect(payload.deepLink).toContain('wallapop');
    expect(payload.pasteText).toContain('Veste en cuir');
    expect(payload.photoUrls).toHaveLength(2);
  });

  it('Kleinanzeigen maps the DE condition and builds a deep link', () => {
    const a = new KleinanzeigenAdapter();
    expect(a.id).toBe('KLEINANZEIGEN');
    expect(a.mapListing(listing).condition).toBe('Gut');
    expect(a.buildAssistedPayload(a.mapListing(listing)).deepLink).toContain('kleinanzeigen');
  });

  it('Subito maps the IT condition and builds a deep link', () => {
    const a = new SubitoAdapter();
    expect(a.id).toBe('SUBITO');
    expect(a.mapListing(listing).condition).toBe('Buono');
    expect(a.buildAssistedPayload(a.mapListing(listing)).deepLink).toContain('subito');
  });
});
