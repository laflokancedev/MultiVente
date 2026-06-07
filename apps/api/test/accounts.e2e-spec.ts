import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Accounts (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_acct_${Date.now()}@b.com`;
  let token: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    prisma = app.get(PrismaService);
    await app.init();
    const reg = await request(app.getHttpServer())
      .post('/auth/register').send({ email, password: 'password123' }).expect(201);
    token = reg.body.tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('lists all 6 marketplaces connected by default', async () => {
    const res = await request(app.getHttpServer())
      .get('/accounts').set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body).toHaveLength(6);
    expect(res.body.every((a: any) => a.connected)).toBe(true);
  });

  it('disconnects a marketplace and reflects it on re-fetch', async () => {
    await request(app.getHttpServer())
      .patch('/accounts/KLEINANZEIGEN').set('Authorization', `Bearer ${token}`)
      .send({ connected: false }).expect(200);
    const res = await request(app.getHttpServer())
      .get('/accounts').set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body.find((a: any) => a.marketplace === 'KLEINANZEIGEN').connected).toBe(false);
  });

  it('rejects an unknown marketplace', async () => {
    await request(app.getHttpServer())
      .patch('/accounts/NOPE').set('Authorization', `Bearer ${token}`)
      .send({ connected: false }).expect(400);
  });

  it('publishes a newly-added assisted marketplace (Wallapop) to awaiting_user', async () => {
    const listing = await request(app.getHttpServer())
      .post('/listings').set('Authorization', `Bearer ${token}`)
      .send({ title: 'Veste', description: 'desc', priceCents: 4500, category: 'mode', condition: 'good' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/listings/${listing.body.id}/publish`).set('Authorization', `Bearer ${token}`)
      .send({ marketplaces: ['WALLAPOP'] }).expect(201);

    let pub: any;
    for (let i = 0; i < 25; i++) {
      const res = await request(app.getHttpServer())
        .get(`/listings/${listing.body.id}/publications`).set('Authorization', `Bearer ${token}`).expect(200);
      pub = res.body.find((p: any) => p.marketplace === 'WALLAPOP');
      if (pub && pub.status !== 'pending') break;
      await sleep(500);
    }
    expect(pub.status).toBe('awaiting_user');

    const assisted = await request(app.getHttpServer())
      .get(`/publications/${pub.id}/assisted`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(assisted.body.deepLink).toContain('wallapop');
  }, 30000);
});
