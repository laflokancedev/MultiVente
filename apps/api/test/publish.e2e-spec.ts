import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Publish (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_pub_${Date.now()}@b.com`;
  let token: string;
  let listingId: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    prisma = app.get(PrismaService);
    await app.init();
    const reg = await request(app.getHttpServer())
      .post('/auth/register').send({ email, password: 'password123' }).expect(201);
    token = reg.body.tokens.accessToken;
    const listing = await request(app.getHttpServer())
      .post('/listings').set('Authorization', `Bearer ${token}`)
      .send({ title: 'Veste', description: 'desc', priceCents: 4500, category: 'mode', condition: 'good' })
      .expect(201);
    listingId = listing.body.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('publishes everywhere and resolves per-platform statuses', async () => {
    await request(app.getHttpServer())
      .post(`/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .send({ marketplaces: ['EBAY', 'VINTED', 'LEBONCOIN'] })
      .expect(201);

    // Poll until the queue worker has processed all three.
    let pubs: any[] = [];
    for (let i = 0; i < 25; i++) {
      const res = await request(app.getHttpServer())
        .get(`/listings/${listingId}/publications`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      pubs = res.body;
      if (pubs.length === 3 && pubs.every((p) => p.status !== 'pending')) break;
      await sleep(500);
    }

    const ebay = pubs.find((p) => p.marketplace === 'EBAY');
    const vinted = pubs.find((p) => p.marketplace === 'VINTED');
    expect(ebay.status).toBe('published');
    expect(ebay.externalUrl).toContain('ebay.com');
    expect(vinted.status).toBe('awaiting_user');

    const assisted = await request(app.getHttpServer())
      .get(`/publications/${vinted.id}/assisted`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(assisted.body.deepLink).toContain('vinted');
  }, 30000);

  it('rejects publish without a token', async () => {
    await request(app.getHttpServer()).post(`/listings/${listingId}/publish`).send({ marketplaces: ['EBAY'] }).expect(401);
  });
});
