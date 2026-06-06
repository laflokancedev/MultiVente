import { Injectable } from '@nestjs/common';
import type { DashboardStats, Marketplace } from '@multimarket/shared';
import { PrismaService } from '../prisma/prisma.service';

const STATUSES = ['pending', 'awaiting_user', 'published', 'failed', 'sold', 'expired'] as const;
const MARKETPLACES: Marketplace[] = ['EBAY', 'VINTED', 'LEBONCOIN'];

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getStats(userId: string): Promise<DashboardStats> {
    const where = { listing: { userId } };

    const activeListings = await this.prisma.listing.count({
      where: { userId, status: { notIn: ['sold', 'archived'] } } as any,
    });

    const byStatus: any[] = await this.prisma.publication.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    } as any);

    const byMkt: any[] = await this.prisma.publication.groupBy({
      by: ['marketplace', 'status'],
      where,
      _count: { _all: true },
    } as any);

    const publicationsByStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as DashboardStats['publicationsByStatus'];
    for (const row of byStatus) publicationsByStatus[row.status as keyof typeof publicationsByStatus] = row._count._all;

    const denom = publicationsByStatus.published + publicationsByStatus.failed;
    const successRate = denom === 0 ? null : publicationsByStatus.published / denom;

    const byMarketplace = MARKETPLACES.map((marketplace) => {
      const block = { marketplace, published: 0, awaiting_user: 0, failed: 0, pending: 0 };
      for (const row of byMkt) {
        if (row.marketplace !== marketplace) continue;
        if (row.status in block) (block as any)[row.status] = row._count._all;
      }
      return block;
    });

    return { activeListings, publicationsByStatus, successRate, byMarketplace };
  }
}
