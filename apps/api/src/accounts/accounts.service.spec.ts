import { AccountsService } from './accounts.service';

function makeService(rows: any[] = []) {
  const store = new Map<string, any>(rows.map((r) => [`${r.userId}:${r.marketplace}`, r]));
  const prisma: any = {
    marketplaceAccount: {
      findMany: async ({ where: { userId } }: any) =>
        [...store.values()].filter((r) => r.userId === userId),
      upsert: async ({ where: { userId_marketplace }, create, update }: any) => {
        const key = `${userId_marketplace.userId}:${userId_marketplace.marketplace}`;
        const row = store.has(key) ? { ...store.get(key), ...update } : { ...create };
        store.set(key, row);
        return row;
      },
    },
  };
  return new AccountsService(prisma);
}

describe('AccountsService', () => {
  it('returns all 6 marketplaces connected by default when no rows exist', async () => {
    const list = await makeService().list('user1');
    expect(list).toHaveLength(6);
    expect(list.every((a) => a.connected)).toBe(true);
    expect(list.find((a) => a.marketplace === 'EBAY')!.mode).toBe('auto');
  });

  it('reflects a disconnected row', async () => {
    const svc = makeService([{ userId: 'user1', marketplace: 'VINTED', connected: false }]);
    const list = await svc.list('user1');
    expect(list.find((a) => a.marketplace === 'VINTED')!.connected).toBe(false);
    expect(list.find((a) => a.marketplace === 'EBAY')!.connected).toBe(true);
  });

  it('upserts the connected flag', async () => {
    const svc = makeService();
    const updated = await svc.setConnected('user1', 'SUBITO', false);
    expect(updated.connected).toBe(false);
    const list = await svc.list('user1');
    expect(list.find((a) => a.marketplace === 'SUBITO')!.connected).toBe(false);
  });
});
