import { Injectable } from '@nestjs/common';
import { MARKETPLACES, type Marketplace, type MarketplaceAccountView } from '@multimarket/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AccountsService {
  constructor(private prisma: PrismaService) {}

  async list(userId: string): Promise<MarketplaceAccountView[]> {
    const rows = await this.prisma.marketplaceAccount.findMany({ where: { userId } });
    const connectedByMarketplace = new Map<string, boolean>(
      rows.map((r) => [r.marketplace, r.connected]),
    );
    return MARKETPLACES.map((m) => ({
      marketplace: m.id,
      mode: m.mode,
      connected: connectedByMarketplace.has(m.id) ? (connectedByMarketplace.get(m.id) as boolean) : true,
    }));
  }

  async setConnected(userId: string, marketplace: Marketplace, connected: boolean): Promise<MarketplaceAccountView> {
    await this.prisma.marketplaceAccount.upsert({
      where: { userId_marketplace: { userId, marketplace } },
      create: { userId, marketplace, connected },
      update: { connected },
    });
    const meta = MARKETPLACES.find((m) => m.id === marketplace)!;
    return { marketplace, mode: meta.mode, connected };
  }
}
