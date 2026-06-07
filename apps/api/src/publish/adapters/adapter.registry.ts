import { Inject, Injectable } from '@nestjs/common';
import type { Marketplace } from '@multimarket/shared';
import type { MarketplaceAdapter } from './adapter';
import { VintedAdapter } from './vinted.adapter';
import { LeboncoinAdapter } from './leboncoin.adapter';
import { EbayAdapter } from './ebay.adapter';
import { WallapopAdapter } from './wallapop.adapter';
import { KleinanzeigenAdapter } from './kleinanzeigen.adapter';
import { SubitoAdapter } from './subito.adapter';
import { EBAY_CLIENT, type EbayClient } from './ebay.client';

@Injectable()
export class AdapterRegistry {
  private adapters: Record<Marketplace, MarketplaceAdapter>;

  constructor(@Inject(EBAY_CLIENT) ebayClient: EbayClient) {
    this.adapters = {
      EBAY: new EbayAdapter(ebayClient),
      VINTED: new VintedAdapter(),
      LEBONCOIN: new LeboncoinAdapter(),
      WALLAPOP: new WallapopAdapter(),
      KLEINANZEIGEN: new KleinanzeigenAdapter(),
      SUBITO: new SubitoAdapter(),
    };
  }

  get(marketplace: Marketplace): MarketplaceAdapter {
    return this.adapters[marketplace];
  }
}
