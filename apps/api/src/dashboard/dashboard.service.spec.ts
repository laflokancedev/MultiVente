import { DashboardService } from './dashboard.service';

function makeService(opts: { byStatus: any[]; byMkt: any[]; active?: number }) {
  const prisma: any = {
    listing: { count: async () => opts.active ?? 0 },
    publication: {
      groupBy: async ({ by }: any) => (by.includes('marketplace') ? opts.byMkt : opts.byStatus),
    },
  };
  return new DashboardService(prisma);
}

describe('DashboardService', () => {
  it('aggregates counts, success rate and per-marketplace blocks', async () => {
    const svc = makeService({
      active: 3,
      byStatus: [
        { status: 'published', _count: { _all: 2 } },
        { status: 'awaiting_user', _count: { _all: 1 } },
        { status: 'failed', _count: { _all: 1 } },
      ],
      byMkt: [
        { marketplace: 'EBAY', status: 'published', _count: { _all: 2 } },
        { marketplace: 'EBAY', status: 'failed', _count: { _all: 1 } },
        { marketplace: 'VINTED', status: 'awaiting_user', _count: { _all: 1 } },
      ],
    });
    const stats = await svc.getStats('user1');
    expect(stats.activeListings).toBe(3);
    expect(stats.publicationsByStatus.published).toBe(2);
    expect(stats.publicationsByStatus.failed).toBe(1);
    expect(stats.publicationsByStatus.awaiting_user).toBe(1);
    expect(stats.publicationsByStatus.pending).toBe(0);
    expect(stats.successRate).toBeCloseTo(2 / 3);
    expect(stats.byMarketplace).toHaveLength(3);
    const ebay = stats.byMarketplace.find((m) => m.marketplace === 'EBAY')!;
    expect(ebay.published).toBe(2);
    expect(ebay.failed).toBe(1);
    const lbc = stats.byMarketplace.find((m) => m.marketplace === 'LEBONCOIN')!;
    expect(lbc.published).toBe(0);
  });

  it('returns null success rate when there are no published/failed publications', async () => {
    const svc = makeService({
      active: 0,
      byStatus: [{ status: 'awaiting_user', _count: { _all: 2 } }],
      byMkt: [{ marketplace: 'VINTED', status: 'awaiting_user', _count: { _all: 2 } }],
    });
    const stats = await svc.getStats('user1');
    expect(stats.successRate).toBeNull();
  });
});
