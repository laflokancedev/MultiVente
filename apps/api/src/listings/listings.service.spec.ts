import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ListingsService } from './listings.service';

function makeService() {
  const rows = new Map<string, any>();
  let seq = 0;
  const prisma: any = {
    listing: {
      create: async ({ data }: any) => {
        const row = { id: `l${++seq}`, photos: [], createdAt: new Date(), updatedAt: new Date(), ...data };
        rows.set(row.id, row);
        return row;
      },
      findMany: async ({ where }: any) =>
        [...rows.values()].filter((r) => r.userId === where.userId),
      findUnique: async ({ where: { id } }: any) => rows.get(id) ?? null,
      update: async ({ where: { id }, data }: any) => {
        const row = { ...rows.get(id), ...data, updatedAt: new Date() };
        rows.set(id, row);
        return row;
      },
      delete: async ({ where: { id } }: any) => { rows.delete(id); return {}; },
    },
    listingPhoto: {
      count: async ({ where: { listingId } }: any) =>
        (rows.get(listingId)?.photos ?? []).length,
      create: async ({ data }: any) => {
        const photo = { id: `p${++seq}`, ...data };
        rows.get(data.listingId).photos.push(photo);
        return photo;
      },
    },
  };
  return { svc: new ListingsService(prisma), rows };
}

const sample = {
  title: 'Veste', description: 'Bon etat', priceCents: 2500,
  category: 'mode', condition: 'good' as const,
};

describe('ListingsService', () => {
  it('creates a listing owned by the user', async () => {
    const { svc } = makeService();
    const l = await svc.create('user1', sample);
    expect(l.id).toBe('l1');
    expect(l.userId).toBe('user1');
    expect(l.currency).toBe('EUR');
  });

  it('lists only the owner\'s listings', async () => {
    const { svc } = makeService();
    await svc.create('user1', sample);
    await svc.create('user2', sample);
    const mine = await svc.listForUser('user1');
    expect(mine).toHaveLength(1);
    expect(mine[0].userId).toBe('user1');
  });

  it('rejects reading another user\'s listing', async () => {
    const { svc } = makeService();
    const l = await svc.create('user1', sample);
    await expect(svc.getOwned('user2', l.id)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws NotFound for a missing listing', async () => {
    const { svc } = makeService();
    await expect(svc.getOwned('user1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('attaches a photo to an owned listing', async () => {
    const { svc } = makeService();
    const l = await svc.create('user1', sample);
    const photo = await svc.attachPhoto('user1', l.id, { url: 'http://x/p.jpg', order: 0 });
    expect(photo.url).toBe('http://x/p.jpg');
  });

  it('rejects attaching a 21st photo', async () => {
    const { svc, rows } = makeService();
    const l = await svc.create('user1', sample);
    rows.get(l.id).photos = new Array(20).fill({ id: 'x', url: 'u', order: 0 });
    await expect(svc.attachPhoto('user1', l.id, { url: 'u', order: 20 }))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});
