# MultiMarket A2 — Unified Listing + Photos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an authenticated user create/edit/delete a unified product listing with up to 20 photos uploaded to S3-compatible storage (MinIO locally, Cloudflare R2 in prod), and view their listings in the PWA.

**Architecture:** Extend the existing NestJS API with `Listing` + `ListingPhoto` Prisma models, a `StorageModule` that issues presigned PUT URLs (AWS SDK v3, S3-compatible), and a `ListingsModule` (CRUD + photo attach, all ownership-scoped behind the existing `JwtAuthGuard`). The Next.js PWA gets an authed fetch helper, a create-listing form with direct-to-storage photo upload, and a "My listings" page.

**Tech Stack:** NestJS 10, Prisma 5 (Postgres), `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, MinIO (dev), class-validator, Jest + supertest (api), Next.js 15 + Vitest (web).

---

## File Structure

```
docker-compose.yml                      # + minio + createbuckets services (modify)
packages/shared/src/
  listing.ts                            # Listing, ListingPhoto, Condition, ListingStatus, inputs (create)
  index.ts                              # re-export listing (modify)
apps/api/
  .env / .env.example                   # + S3_* vars (modify)
  prisma/schema.prisma                  # + Listing, ListingPhoto, enums, User.listings (modify)
  src/
    storage/
      storage.service.ts                # buildKey + presignUpload + publicUrl
      storage.service.spec.ts
      storage.module.ts
    listings/
      dto/create-listing.dto.ts
      dto/update-listing.dto.ts
      dto/attach-photo.dto.ts
      listings.service.ts               # ownership-scoped CRUD + photo attach (<=20)
      listings.service.spec.ts
      listings.controller.ts            # protected REST endpoints
      listings.module.ts
    app.module.ts                       # + StorageModule, ListingsModule (modify)
  test/listings.e2e-spec.ts             # register -> create -> list -> presign -> attach
apps/web/src/
  lib/api-client.ts                     # + authedFetch + listing functions (modify)
  lib/listings-client.test.ts
  app/listings/new/page.tsx             # create-listing form + photo upload
  app/listings/page.tsx                 # my-listings list
```

---

## Task 1: MinIO storage infrastructure

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add MinIO + bucket-init services**

Append these services to `docker-compose.yml` (keep the existing `postgres`/`redis` services and the `volumes:` block; add `mm_minio` under volumes):

```yaml
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "127.0.0.1:9000:9000"
      - "127.0.0.1:9001:9001"
    volumes: ["mm_minio:/data"]
  createbuckets:
    image: minio/mc:latest
    depends_on: [minio]
    entrypoint: >
      /bin/sh -c "
      until (/usr/bin/mc alias set local http://minio:9000 minioadmin minioadmin) do echo waiting; sleep 2; done;
      /usr/bin/mc mb -p local/multimarket;
      /usr/bin/mc anonymous set download local/multimarket;
      exit 0;
      "
```

Under the existing `volumes:` block add the new named volume line:
```yaml
  mm_minio:
```

- [ ] **Step 2: Bring up MinIO and confirm the bucket exists**

Run: `docker compose up -d minio createbuckets`
Then: `docker run --rm --network host minio/mc:latest sh -c "mc alias set h http://127.0.0.1:9000 minioadmin minioadmin && mc ls h/multimarket"`
Expected: command succeeds (empty bucket listing, no error). The bucket is created with public download access for objects.

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "chore(infra): add MinIO + bucket init for photo storage"
```

---

## Task 2: Prisma — Listing + ListingPhoto models

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/.env.example` (and create matching `.env` values)

- [ ] **Step 1: Add enums, models, and the User relation to schema.prisma**

Add to `apps/api/prisma/schema.prisma` (keep the existing `generator`, `datasource`, `Plan` enum and `User` model — but add the `listings` relation field to `User`):

```prisma
enum ListingStatus {
  draft
  active
  sold
  archived
}

enum Condition {
  new
  like_new
  good
  fair
}

model Listing {
  id              String        @id @default(cuid())
  userId          String
  user            User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  title           String
  description     String
  priceCents      Int
  currency        String        @default("EUR")
  category        String
  condition       Condition
  brand           String?
  color           String?
  size            String?
  location        String?
  shippingOptions Json          @default("{}")
  status          ListingStatus @default(draft)
  photos          ListingPhoto[]
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
}

model ListingPhoto {
  id        String   @id @default(cuid())
  listingId String
  listing   Listing  @relation(fields: [listingId], references: [id], onDelete: Cascade)
  url       String
  order     Int      @default(0)
  createdAt DateTime @default(now())
}
```

Add this line inside the existing `User` model:
```prisma
  listings     Listing[]
```

- [ ] **Step 2: Add S3 env vars**

Append to `apps/api/.env.example` AND to `apps/api/.env`:
```
S3_ENDPOINT="http://localhost:9000"
S3_REGION="us-east-1"
S3_BUCKET="multimarket"
S3_ACCESS_KEY="minioadmin"
S3_SECRET_KEY="minioadmin"
S3_PUBLIC_URL="http://localhost:9000/multimarket"
```

- [ ] **Step 3: Create and apply the migration**

Run: `pnpm --filter @multimarket/api exec prisma migrate dev --name listings`
Expected: creates `prisma/migrations/*_listings`, applies it, regenerates the client. (Postgres must be up on host 5433.)

- [ ] **Step 4: Verify the tables exist**

Run: `docker run --rm -e PGPASSWORD=multimarket --network host postgres:16 psql -h 127.0.0.1 -p 5433 -U multimarket -d multimarket -tAc "select count(*) from \"Listing\"; select count(*) from \"ListingPhoto\";"`
Expected: prints `0` and `0` (tables exist, empty).

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma apps/api/.env.example
git commit -m "feat(api): add Listing + ListingPhoto models and migration"
```

---

## Task 3: Shared listing types

**Files:**
- Create: `packages/shared/src/listing.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create the listing types**

`packages/shared/src/listing.ts`:
```ts
export type Condition = 'new' | 'like_new' | 'good' | 'fair';
export type ListingStatus = 'draft' | 'active' | 'sold' | 'archived';

export interface ListingPhoto {
  id: string;
  url: string;
  order: number;
}

export interface Listing {
  id: string;
  title: string;
  description: string;
  priceCents: number;
  currency: string;
  category: string;
  condition: Condition;
  brand: string | null;
  color: string | null;
  size: string | null;
  location: string | null;
  shippingOptions: unknown;
  status: ListingStatus;
  photos: ListingPhoto[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateListingInput {
  title: string;
  description: string;
  priceCents: number;
  currency?: string;
  category: string;
  condition: Condition;
  brand?: string;
  color?: string;
  size?: string;
  location?: string;
  shippingOptions?: unknown;
}

export type UpdateListingInput = Partial<CreateListingInput> & { status?: ListingStatus };

export interface PresignResponse {
  uploadUrl: string;
  key: string;
  publicUrl: string;
}
```

- [ ] **Step 2: Re-export it**

Modify `packages/shared/src/index.ts` to add:
```ts
export * from './listing';
```
(Keep the existing `export * from './auth';` line.)

- [ ] **Step 3: Verify the workspace resolves**

Run: `pnpm install`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add listing types"
```

---

## Task 4: Storage service (presigned uploads)

**Files:**
- Create: `apps/api/src/storage/storage.service.ts`
- Create: `apps/api/src/storage/storage.service.spec.ts`
- Create: `apps/api/src/storage/storage.module.ts`
- Modify: `apps/api/package.json` (add AWS SDK deps)

- [ ] **Step 1: Add AWS SDK dependencies**

Add to `apps/api/package.json` dependencies:
```json
    "@aws-sdk/client-s3": "^3.620.0",
    "@aws-sdk/s3-request-presigner": "^3.620.0",
```
Then run `pnpm install` from the repo root.

- [ ] **Step 2: Write the failing test for key building + publicUrl**

`apps/api/src/storage/storage.service.spec.ts`:
```ts
import { StorageService } from './storage.service';

describe('StorageService.buildKey', () => {
  const svc = new StorageService();

  it('namespaces keys by user and listing and keeps a safe filename', () => {
    const key = svc.buildKey('user1', 'listingA', 'My Photo!.JPG');
    expect(key.startsWith('user1/listingA/')).toBe(true);
    expect(key.endsWith('-my-photo-.jpg')).toBe(true);
  });

  it('builds a public url from the configured base', () => {
    process.env.S3_PUBLIC_URL = 'http://localhost:9000/multimarket';
    expect(svc.publicUrl('user1/listingA/x-y.jpg'))
      .toBe('http://localhost:9000/multimarket/user1/listingA/x-y.jpg');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @multimarket/api test storage.service`
Expected: FAIL — cannot find module `./storage.service`.

- [ ] **Step 4: Implement the storage service**

`apps/api/src/storage/storage.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService {
  private client() {
    return new S3Client({
      region: process.env.S3_REGION ?? 'us-east-1',
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY as string,
        secretAccessKey: process.env.S3_SECRET_KEY as string,
      },
    });
  }

  buildKey(userId: string, listingId: string, filename: string): string {
    const safe = filename.toLowerCase().replace(/[^a-z0-9.]+/g, '-');
    return `${userId}/${listingId}/${randomUUID()}-${safe}`;
  }

  publicUrl(key: string): string {
    return `${process.env.S3_PUBLIC_URL}/${key}`;
  }

  async presignUpload(key: string, contentType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.client(), command, { expiresIn: 900 });
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @multimarket/api test storage.service`
Expected: PASS (2 tests).

- [ ] **Step 6: Create the storage module**

`apps/api/src/storage/storage.module.ts`:
```ts
import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/storage apps/api/package.json pnpm-lock.yaml
git commit -m "feat(api): storage service with S3 presigned uploads"
```

---

## Task 5: Listings service (ownership-scoped CRUD)

**Files:**
- Create: `apps/api/src/listings/listings.service.ts`
- Create: `apps/api/src/listings/listings.service.spec.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/listings/listings.service.spec.ts`:
```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @multimarket/api test listings.service`
Expected: FAIL — cannot find module `./listings.service`.

- [ ] **Step 3: Implement the listings service**

`apps/api/src/listings/listings.service.ts`:
```ts
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateListingInput, UpdateListingInput } from '@multimarket/shared';

const MAX_PHOTOS = 20;

@Injectable()
export class ListingsService {
  constructor(private prisma: PrismaService) {}

  create(userId: string, input: CreateListingInput) {
    return this.prisma.listing.create({
      data: {
        userId,
        title: input.title,
        description: input.description,
        priceCents: input.priceCents,
        currency: input.currency ?? 'EUR',
        category: input.category,
        condition: input.condition,
        brand: input.brand,
        color: input.color,
        size: input.size,
        location: input.location,
        shippingOptions: (input.shippingOptions ?? {}) as object,
      },
    });
  }

  listForUser(userId: string) {
    return this.prisma.listing.findMany({ where: { userId } });
  }

  async getOwned(userId: string, id: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.userId !== userId) throw new ForbiddenException('Not your listing');
    return listing;
  }

  async update(userId: string, id: string, input: UpdateListingInput) {
    await this.getOwned(userId, id);
    return this.prisma.listing.update({ where: { id }, data: input as object });
  }

  async remove(userId: string, id: string) {
    await this.getOwned(userId, id);
    await this.prisma.listing.delete({ where: { id } });
    return { deleted: true };
  }

  async attachPhoto(userId: string, listingId: string, photo: { url: string; order: number }) {
    await this.getOwned(userId, listingId);
    const count = await this.prisma.listingPhoto.count({ where: { listingId } });
    if (count >= MAX_PHOTOS) throw new BadRequestException(`A listing can have at most ${MAX_PHOTOS} photos`);
    return this.prisma.listingPhoto.create({ data: { listingId, url: photo.url, order: photo.order } });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @multimarket/api test listings.service`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/listings/listings.service.ts apps/api/src/listings/listings.service.spec.ts
git commit -m "feat(api): listings service with ownership checks + photo limit"
```

---

## Task 6: Listings DTOs + controller + module

**Files:**
- Create: `apps/api/src/listings/dto/create-listing.dto.ts`
- Create: `apps/api/src/listings/dto/update-listing.dto.ts`
- Create: `apps/api/src/listings/dto/attach-photo.dto.ts`
- Create: `apps/api/src/listings/listings.controller.ts`
- Create: `apps/api/src/listings/listings.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Create the DTOs**

`apps/api/src/listings/dto/create-listing.dto.ts`:
```ts
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

const CONDITIONS = ['new', 'like_new', 'good', 'fair'] as const;

export class CreateListingDto {
  @IsString() @MaxLength(120)
  title!: string;

  @IsString() @MaxLength(5000)
  description!: string;

  @IsInt() @Min(0)
  priceCents!: number;

  @IsOptional() @IsString() @MaxLength(3)
  currency?: string;

  @IsString() @MaxLength(60)
  category!: string;

  @IsIn(CONDITIONS)
  condition!: (typeof CONDITIONS)[number];

  @IsOptional() @IsString() @MaxLength(60)
  brand?: string;

  @IsOptional() @IsString() @MaxLength(40)
  color?: string;

  @IsOptional() @IsString() @MaxLength(40)
  size?: string;

  @IsOptional() @IsString() @MaxLength(120)
  location?: string;

  @IsOptional()
  shippingOptions?: unknown;
}
```

`apps/api/src/listings/dto/update-listing.dto.ts`:
```ts
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

const CONDITIONS = ['new', 'like_new', 'good', 'fair'] as const;
const STATUSES = ['draft', 'active', 'sold', 'archived'] as const;

export class UpdateListingDto {
  @IsOptional() @IsString() @MaxLength(120)
  title?: string;

  @IsOptional() @IsString() @MaxLength(5000)
  description?: string;

  @IsOptional() @IsInt() @Min(0)
  priceCents?: number;

  @IsOptional() @IsString() @MaxLength(3)
  currency?: string;

  @IsOptional() @IsString() @MaxLength(60)
  category?: string;

  @IsOptional() @IsIn(CONDITIONS)
  condition?: (typeof CONDITIONS)[number];

  @IsOptional() @IsString() @MaxLength(60)
  brand?: string;

  @IsOptional() @IsString() @MaxLength(40)
  color?: string;

  @IsOptional() @IsString() @MaxLength(40)
  size?: string;

  @IsOptional() @IsString() @MaxLength(120)
  location?: string;

  @IsOptional()
  shippingOptions?: unknown;

  @IsOptional() @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}
```

`apps/api/src/listings/dto/attach-photo.dto.ts`:
```ts
import { IsInt, IsString, Min } from 'class-validator';

export class PresignPhotoDto {
  @IsString()
  filename!: string;

  @IsString()
  contentType!: string;
}

export class AttachPhotoDto {
  @IsString()
  key!: string;

  @IsInt() @Min(0)
  order!: number;
}
```

- [ ] **Step 2: Create the controller**

`apps/api/src/listings/listings.controller.ts`:
```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StorageService } from '../storage/storage.service';
import { ListingsService } from './listings.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { AttachPhotoDto, PresignPhotoDto } from './dto/attach-photo.dto';

@UseGuards(JwtAuthGuard)
@Controller('listings')
export class ListingsController {
  constructor(private listings: ListingsService, private storage: StorageService) {}

  @Post()
  create(@Req() req: any, @Body() dto: CreateListingDto) {
    return this.listings.create(req.user.id, dto);
  }

  @Get()
  list(@Req() req: any) {
    return this.listings.listForUser(req.user.id);
  }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.listings.getOwned(req.user.id, id);
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateListingDto) {
    return this.listings.update(req.user.id, id, dto);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.listings.remove(req.user.id, id);
  }

  @Post(':id/photos/presign')
  async presign(@Req() req: any, @Param('id') id: string, @Body() dto: PresignPhotoDto) {
    await this.listings.getOwned(req.user.id, id);
    const key = this.storage.buildKey(req.user.id, id, dto.filename);
    const uploadUrl = await this.storage.presignUpload(key, dto.contentType);
    return { uploadUrl, key, publicUrl: this.storage.publicUrl(key) };
  }

  @Post(':id/photos')
  attach(@Req() req: any, @Param('id') id: string, @Body() dto: AttachPhotoDto) {
    return this.listings.attachPhoto(req.user.id, id, {
      url: this.storage.publicUrl(dto.key),
      order: dto.order,
    });
  }
}
```

- [ ] **Step 3: Create the module and register it**

`apps/api/src/listings/listings.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ListingsService } from './listings.service';
import { ListingsController } from './listings.controller';

@Module({
  providers: [ListingsService],
  controllers: [ListingsController],
})
export class ListingsModule {}
```

Modify `apps/api/src/app.module.ts` to import `StorageModule` and `ListingsModule` (keep ConfigModule, PrismaModule, AuthModule):
```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { StorageModule } from './storage/storage.module';
import { ListingsModule } from './listings/listings.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    StorageModule,
    ListingsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 4: Verify build**

Run: `pnpm --filter @multimarket/api build`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/listings apps/api/src/app.module.ts
git commit -m "feat(api): listings controller + DTOs (protected CRUD + photos)"
```

---

## Task 7: Listings e2e (register → create → list → presign → attach)

**Files:**
- Create: `apps/api/test/listings.e2e-spec.ts`

- [ ] **Step 1: Write the e2e test**

`apps/api/test/listings.e2e-spec.ts`:
```ts
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
```

- [ ] **Step 2: Run the e2e suite**

Run: `pnpm --filter @multimarket/api test:e2e`
Expected: both e2e suites pass (auth + listings). Postgres on 5433 must be up. (MinIO need not be running — presign only builds a URL, it does not contact MinIO.)

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/listings.e2e-spec.ts
git commit -m "test(api): listings e2e (create/list/presign/attach + 401)"
```

---

## Task 8: Web — authed fetch + listings client (TDD)

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`
- Create: `apps/web/src/lib/listings-client.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/listings-client.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createListing } from './api-client';

describe('createListing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('POSTs to /listings with the bearer token and returns the listing', async () => {
    localStorage.setItem('accessToken', 'tok123');
    const fake = { id: 'l1', title: 'Veste' };
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(fake), { status: 201, headers: { 'Content-Type': 'application/json' } }),
    );
    const res = await createListing({ title: 'Veste', description: 'x', priceCents: 100, category: 'mode', condition: 'good' });
    expect(res.id).toBe('l1');
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('http://localhost:4000/listings');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as any).headers.Authorization).toBe('Bearer tok123');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @multimarket/web test listings-client`
Expected: FAIL — `createListing` is not exported from `./api-client`.

- [ ] **Step 3: Extend the api-client**

Append to `apps/web/src/lib/api-client.ts` (keep the existing `postJson`, `registerUser`, `loginUser`):
```ts
import type {
  CreateListingInput,
  Listing,
  ListingPhoto,
  PresignResponse,
  UpdateListingInput,
} from '@multimarket/shared';

function authHeaders(): Record<string, string> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('accessToken') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function authedJson<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.message) message = Array.isArray(data.message) ? data.message.join(', ') : data.message;
    } catch {
      /* ignore non-JSON bodies */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export function createListing(input: CreateListingInput): Promise<Listing> {
  return authedJson<Listing>('/listings', 'POST', input);
}

export function listListings(): Promise<Listing[]> {
  return authedJson<Listing[]>('/listings', 'GET');
}

export function updateListing(id: string, input: UpdateListingInput): Promise<Listing> {
  return authedJson<Listing>(`/listings/${id}`, 'PATCH', input);
}

export function deleteListing(id: string): Promise<{ deleted: boolean }> {
  return authedJson<{ deleted: boolean }>(`/listings/${id}`, 'DELETE');
}

export function presignPhoto(listingId: string, filename: string, contentType: string): Promise<PresignResponse> {
  return authedJson<PresignResponse>(`/listings/${listingId}/photos/presign`, 'POST', { filename, contentType });
}

export function attachPhoto(listingId: string, key: string, order: number): Promise<ListingPhoto> {
  return authedJson<ListingPhoto>(`/listings/${listingId}/photos`, 'POST', { key, order });
}

export async function uploadPhotoFile(listingId: string, file: File, order: number): Promise<ListingPhoto> {
  const { uploadUrl, key } = await presignPhoto(listingId, file.name, file.type || 'application/octet-stream');
  const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
  if (!put.ok) throw new Error(`Upload failed (${put.status})`);
  return attachPhoto(listingId, key, order);
}
```

> Note: the `import type { ... } from '@multimarket/shared'` line must sit at the TOP of the file with the other imports — move it up next to the existing `import type { AuthResponse... }` line rather than mid-file.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @multimarket/web test listings-client`
Expected: PASS (1 test). Also run the whole suite: `pnpm --filter @multimarket/web test` (3 tests total: registerUser x2 + createListing).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/api-client.ts apps/web/src/lib/listings-client.test.ts
git commit -m "feat(web): authed listings api client + photo upload helper"
```

---

## Task 9: Web — create-listing page

**Files:**
- Create: `apps/web/src/app/listings/new/page.tsx`

- [ ] **Step 1: Create the create-listing page**

`apps/web/src/app/listings/new/page.tsx`:
```tsx
'use client';
import { useState } from 'react';
import { createListing, uploadPhotoFile } from '@/lib/api-client';
import type { Condition } from '@multimarket/shared';

export default function NewListingPage() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [condition, setCondition] = useState<Condition>('good');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const listing = await createListing({
        title,
        description,
        priceCents: Math.round(parseFloat(price || '0') * 100),
        category,
        condition,
      });
      const chosen = files.slice(0, 20);
      for (let i = 0; i < chosen.length; i++) {
        await uploadPhotoFile(listing.id, chosen[i], i);
      }
      setCreatedId(listing.id);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (createdId) return <p className="p-6">Annonce créée ✅ (id {createdId})</p>;

  return (
    <form onSubmit={onSubmit} className="mx-auto mt-10 flex max-w-lg flex-col gap-3 p-6">
      <h1 className="text-xl font-semibold">Nouvelle annonce</h1>
      <input className="rounded border p-2" placeholder="Titre" value={title}
        onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
      <textarea className="rounded border p-2" placeholder="Description" value={description}
        onChange={(e) => setDescription(e.target.value)} required />
      <input className="rounded border p-2" type="number" step="0.01" min="0" placeholder="Prix (€)"
        value={price} onChange={(e) => setPrice(e.target.value)} required />
      <input className="rounded border p-2" placeholder="Catégorie" value={category}
        onChange={(e) => setCategory(e.target.value)} required />
      <select className="rounded border p-2" value={condition}
        onChange={(e) => setCondition(e.target.value as Condition)}>
        <option value="new">Neuf</option>
        <option value="like_new">Comme neuf</option>
        <option value="good">Bon état</option>
        <option value="fair">État correct</option>
      </select>
      <input className="rounded border p-2" type="file" accept="image/*" multiple
        onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
      <p className="text-xs text-gray-500">{files.length} photo(s) sélectionnée(s) (max 20)</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="rounded bg-blue-600 p-2 text-white" type="submit">Publier l'annonce</button>
    </form>
  );
}
```

- [ ] **Step 2: Verify the web build**

Run: `pnpm --filter @multimarket/web build`
Expected: exit 0, route `/listings/new` listed.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/listings/new/page.tsx
git commit -m "feat(web): create-listing page with photo upload"
```

---

## Task 10: Web — my-listings page

**Files:**
- Create: `apps/web/src/app/listings/page.tsx`

- [ ] **Step 1: Create the my-listings page**

`apps/web/src/app/listings/page.tsx`:
```tsx
'use client';
import { useEffect, useState } from 'react';
import { listListings } from '@/lib/api-client';
import type { Listing } from '@multimarket/shared';

export default function ListingsPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listListings()
      .then(setListings)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="p-6">Chargement…</p>;
  if (error) return <p className="p-6 text-red-600">{error}</p>;

  return (
    <main className="mx-auto mt-10 max-w-2xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Mes annonces</h1>
        <a className="rounded bg-blue-600 px-3 py-2 text-white" href="/listings/new">+ Nouvelle</a>
      </div>
      {listings.length === 0 ? (
        <p className="text-gray-500">Aucune annonce pour l'instant.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {listings.map((l) => (
            <li key={l.id} className="flex items-center justify-between rounded border p-3">
              <span>{l.title}</span>
              <span className="text-sm text-gray-500">
                {(l.priceCents / 100).toFixed(2)} {l.currency} · {l.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Verify the web build**

Run: `pnpm --filter @multimarket/web build`
Expected: exit 0, routes `/listings` and `/listings/new` listed.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/listings/page.tsx
git commit -m "feat(web): my-listings page"
```

---

## Done criteria for A2

- `docker compose up -d` brings up Postgres, Redis, and MinIO (bucket `multimarket` created).
- `pnpm --filter @multimarket/api test` green (adds storage + listings service tests).
- `pnpm --filter @multimarket/api test:e2e` green (auth + listings e2e).
- `pnpm --filter @multimarket/web test` green (adds createListing test).
- Both apps build (exit 0). A logged-in user can create a listing with photos and see it in "My listings".

**Next plan:** A3 — Adapters + publish queue + SSE (eBay auto + Vinted/Leboncoin assisted).
