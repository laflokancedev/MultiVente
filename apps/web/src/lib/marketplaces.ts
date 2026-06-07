import { MARKETPLACES, type Marketplace, type MarketplaceAccountView } from '@multimarket/shared';

export function connectedMarketplaces(accounts: MarketplaceAccountView[]): Marketplace[] {
  return accounts.filter((a) => a.connected).map((a) => a.marketplace);
}

export function marketplaceLabel(id: Marketplace): string {
  return MARKETPLACES.find((m) => m.id === id)?.label ?? id;
}
