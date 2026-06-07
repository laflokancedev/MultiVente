import { describe, it, expect } from 'vitest';
import { connectedMarketplaces, marketplaceLabel } from './marketplaces';
import type { MarketplaceAccountView } from '@multimarket/shared';

const accounts: MarketplaceAccountView[] = [
  { marketplace: 'EBAY', mode: 'auto', connected: true },
  { marketplace: 'VINTED', mode: 'assisted', connected: false },
  { marketplace: 'SUBITO', mode: 'assisted', connected: true },
];

describe('marketplaces helper', () => {
  it('filters to the connected marketplace ids', () => {
    expect(connectedMarketplaces(accounts)).toEqual(['EBAY', 'SUBITO']);
  });
  it('looks up the catalog label', () => {
    expect(marketplaceLabel('LEBONCOIN')).toBe('Leboncoin');
    expect(marketplaceLabel('WALLAPOP')).toBe('Wallapop');
  });
});
