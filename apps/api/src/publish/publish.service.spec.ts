import { PublishService } from './publish.service';
import { AdapterRegistry } from './adapters/adapter.registry';
import { MockEbayClient } from './adapters/ebay.client';

function makeService() {
  const listing = {
    id: 'l1', userId: 'user1', title: 'Veste', description: 'd', priceCents: 4500,
    currency: 'EUR', category: 'mode', condition: 'good', brand: null, color: null,
    size: null, location: null, photos: [{ url: 'http://x/1.jpg', order: 0 }],
  };
  const pubs = new Map<string, any>();
  let seq = 0;
  const prisma: any = {
    listing: { findUnique: async ({ where: { id } }: any) => (id === 'l1' ? listing : null) },
    publication: {
      upsert: async ({ where, create }: any) => {
        const key = `${where.listingId_marketplace.listingId}:${where.listingId_marketplace.marketplace}`;
        const row = { id: `pub${++seq}`, status: 'pending', externalId: null, externalUrl: null, error: null, ...create };
        pubs.set(row.id, row);
        return row;
      },
      findUnique: async ({ where: { id } }: any) => pubs.get(id) ?? null,
      findMany: async ({ where: { listingId } }: any) =>
        [...pubs.values()].filter((p) => p.listingId === listingId),
      update: async ({ where: { id }, data }: any) => {
        const row = { ...pubs.get(id), ...data };
        pubs.set(id, row);
        return row;
      },
    },
  };
  const queue: any = { add: async () => ({}) };
  const registry = new AdapterRegistry(new MockEbayClient());
  return { svc: new PublishService(prisma, registry, queue), pubs };
}

describe('PublishService', () => {
  it('creates one pending publication per marketplace with the right mode', async () => {
    const { svc } = makeService();
    const pubs = await svc.publishEverywhere('user1', 'l1', ['EBAY', 'VINTED']);
    expect(pubs).toHaveLength(2);
    const ebay = pubs.find((p) => p.marketplace === 'EBAY')!;
    const vinted = pubs.find((p) => p.marketplace === 'VINTED')!;
    expect(ebay.mode).toBe('auto');
    expect(vinted.mode).toBe('assisted');
    expect(ebay.status).toBe('pending');
  });

  it('processes an auto publication to published with an external url', async () => {
    const { svc } = makeService();
    const [pub] = await svc.publishEverywhere('user1', 'l1', ['EBAY']);
    const done = await svc.processPublication(pub.id);
    expect(done.status).toBe('published');
    expect(done.externalUrl).toContain('ebay.com');
  });

  it('processes an assisted publication to awaiting_user', async () => {
    const { svc } = makeService();
    const [pub] = await svc.publishEverywhere('user1', 'l1', ['VINTED']);
    const done = await svc.processPublication(pub.id);
    expect(done.status).toBe('awaiting_user');
  });

  it('builds an assisted payload for an assisted publication', async () => {
    const { svc } = makeService();
    const [pub] = await svc.publishEverywhere('user1', 'l1', ['VINTED']);
    const payload = await svc.getAssisted('user1', pub.id);
    expect(payload.deepLink).toContain('vinted');
    expect(payload.pasteText).toContain('Veste');
  });

  it('marks an awaiting_user publication as posted (published)', async () => {
    const { svc } = makeService();
    const [pub] = await svc.publishEverywhere('user1', 'l1', ['VINTED']);
    await svc.processPublication(pub.id); // -> awaiting_user
    const done = await svc.markPosted('user1', pub.id, 'https://www.vinted.fr/items/123');
    expect(done.status).toBe('published');
    expect(done.externalUrl).toBe('https://www.vinted.fr/items/123');
  });

  it('rejects marking a publication that is not awaiting_user', async () => {
    const { svc } = makeService();
    const [pub] = await svc.publishEverywhere('user1', 'l1', ['EBAY']);
    await svc.processPublication(pub.id); // auto -> published
    await expect(svc.markPosted('user1', pub.id)).rejects.toThrow();
  });

  it('rejects marking a publication the user does not own', async () => {
    const { svc } = makeService();
    const [pub] = await svc.publishEverywhere('user1', 'l1', ['VINTED']);
    await svc.processPublication(pub.id);
    await expect(svc.markPosted('otheruser', pub.id)).rejects.toThrow();
  });
});
