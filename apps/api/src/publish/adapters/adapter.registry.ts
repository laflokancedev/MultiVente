import { Inject, Injectable } from '@nestjs/common';
import type { Marketplace } from '@multimarket/shared';
import type { MarketplaceAdapter } from './adapter';
import { VintedAdapter } from './vinted.adapter';
import { LeboncoinAdapter } from './leboncoin.adapter';
import { EbayAdapter } from './ebay.adapter';
import { EBAY_CLIENT, type EbayClient } from './ebay.client';

@Injectable()
export class AdapterRegistry {
  private adapters: Record<Marketplace, MarketplaceAdapter>;

  constructor(@Inject(EBAY_CLIENT) ebayClient: EbayClient) {
    this.adapters = {
      EBAY: new EbayAdapter(ebayClient),
      VINTED: new VintedAdapter(),
      LEBONCOIN: new LeboncoinAdapter(),
    };
  }

  get(marketplace: Marketplace): MarketplaceAdapter {
    return this.adapters[marketplace];
  }
}
