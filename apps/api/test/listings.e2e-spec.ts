import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Listings (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_listings_${Date.now()}@b.com`;
  let token: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    prisma = app.get(PrismaService);
    await app.init();
    const reg = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123' })
      .expect(201);
    token = reg.body.tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('creates, lists, presigns, and attaches a photo', async () => {
    const created = await request(app.getHttpServer())
      .post('/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Veste', description: 'Bon etat', priceCents: 2500, category: 'mode', condition: 'good' })
      .expect(201);
    const id = created.body.id;
    expect(created.body.currency).toBe('EUR');

    const list = await request(app.getHttpServer())
      .get('/listings')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body).toHaveLength(1);

    const presign = await request(app.getHttpServer())
      .post(`/listings/${id}/photos/presign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ filename: 'p.jpg', contentType: 'image/jpeg' })
      .expect(201);
    expect(presign.body.uploadUrl).toContain('http');
    expect(presign.body.key).toContain(id);

    const attach = await request(app.getHttpServer())
      .post(`/listings/${id}/photos`)
      .set('Authorization', `Bearer ${token}`)
      .send({ key: presign.body.key, order: 0 })
      .expect(201);
    expect(attach.body.url).toContain(presign.body.key);
  });

  it('rejects listing access without a token', async () => {
    await request(app.getHttpServer()).get('/listings').expect(401);
  });
});
