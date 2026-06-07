# MultiMarket Slice B — Adapter expansion + account-linking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Wallapop/Kleinanzeigen/Subito as assisted marketplaces and let users pick which marketplaces the publish flow offers, via a per-user `MarketplaceAccount` flag.

**Architecture:** Extend the `Marketplace` enum + a shared `MARKETPLACES` catalog (single source of truth), add three assisted adapters behind the existing `AdapterRegistry`, and a new `AccountsModule` exposing `GET /accounts` (catalog merged with the user's rows; a missing row means connected) and `PATCH /accounts/:marketplace`. The web publish page reads the connected marketplaces from the API instead of a hardcoded list; a new "Mes comptes" page toggles them.

**Tech Stack:** NestJS 10, Prisma 5 (enum + model + migration), Jest + supertest, Next.js 15 + Vitest, Tailwind.

---

## File Structure

```
packages/shared/src/
  publish.ts                                  # extend Marketplace union (modify)
  marketplaces.ts                             # MARKETPLACES catalog + MarketplaceMeta + MarketplaceAccountView (create)
  index.ts                                    # export marketplaces (modify)
apps/api/
  prisma/schema.prisma                        # extend Marketplace enum + MarketplaceAccount model + User relation (modify)
  src/
    publish/adapters/conditions.ts            # + WALLAPOP/KLEINANZEIGEN/SUBITO condition maps (modify)
    publish/adapters/wallapop.adapter.ts      # (create)
    publish/adapters/kleinanzeigen.adapter.ts # (create)
    publish/adapters/subito.adapter.ts        # (create)
    publish/adapters/new-adapters.spec.ts     # (create)
    publish/adapters/adapter.registry.ts      # register the 3 new adapters (modify)
    publish/publish.controller.ts             # PublishDto @IsIn from MARKETPLACES (modify)
    accounts/accounts.service.ts              # (create)
    accounts/accounts.service.spec.ts         # (create)
    accounts/accounts.controller.ts           # (create)
    accounts/accounts.module.ts               # (create)
    app.module.ts                             # + AccountsModule (modify)
  test/accounts.e2e-spec.ts                   # (create)
apps/web/src/
  lib/api-client.ts                           # + getAccounts/setAccountConnected (modify)
  lib/accounts.test.ts                        # (create)
  lib/marketplaces.ts                         # connectedMarketplaces + marketplaceLabel (create)
  lib/marketplaces.test.ts                    # (create)
  app/accounts/page.tsx                        # "Mes comptes" page (create)
  app/listings/[id]/publish/page.tsx          # drive selection from connected accounts (modify)
  components/nav-bar.tsx                       # + "Mes comptes" link (modify)
```

---

## Task 1: Shared — extend Marketplace + catalog

**Files:**
- Modify: `packages/shared/src/publish.ts`
- Create: `packages/shared/src/marketplaces.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Extend the Marketplace union**

In `packages/shared/src/publish.ts`, replace the first line:
```ts
export type Marketplace = 'EBAY' | 'VINTED' | 'LEBONCOIN';
```
with:
```ts
export type Marketplace = 'EBAY' | 'VINTED' | 'LEBONCOIN' | 'WALLAPOP' | 'KLEINANZEIGEN' | 'SUBITO';
```

- [ ] **Step 2: Create the catalog**

`packages/shared/src/marketplaces.ts`:
```ts
import type { Marketplace, PublishMode } from './publish';

export interface MarketplaceMeta {
  id: Marketplace;
  label: string;
  mode: PublishMode;
}

export const MARKETPLACES: MarketplaceMeta[] = [
  { id: 'EBAY', label: 'eBay', mode: 'auto' },
  { id: 'VINTED', label: 'Vinted', mode: 'assisted' },
  { id: 'LEBONCOIN', label: 'Leboncoin', mode: 'assisted' },
  { id: 'WALLAPOP', label: 'Wallapop', mode: 'assisted' },
  { id: 'KLEINANZEIGEN', label: 'Kleinanzeigen', mode: 'assisted' },
  { id: 'SUBITO', label: 'Subito', mode: 'assisted' },
];

export interface MarketplaceAccountView {
  marketplace: Marketplace;
  mode: PublishMode;
  connected: boolean;
}
```

- [ ] **Step 3: Re-export**

`packages/shared/src/index.ts` becomes:
```ts
export * from './auth';
export * from './listing';
export * from './publish';
export * from './dashboard';
export * from './marketplaces';
```

- [ ] **Step 4: Verify it compiles in a consumer**

Run: `pnpm --filter @multimarket/api build`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): extend Marketplace + add MARKETPLACES catalog and account view"
```

---

## Task 2: Prisma — Marketplace enum + MarketplaceAccount model

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Extend the enum + add the model + User relation**

In `apps/api/prisma/schema.prisma`, replace the `Marketplace` enum block:
```prisma
enum Marketplace {
  EBAY
  VINTED
  LEBONCOIN
}
```
with:
```prisma
enum Marketplace {
  EBAY
  VINTED
  LEBONCOIN
  WALLAPOP
  KLEINANZEIGEN
  SUBITO
}
```

Add the relation line inside the existing `User` model (after `listings Listing[]`):
```prisma
  marketplaceAccounts MarketplaceAccount[]
```

Add this model (e.g. after `Publication`):
```prisma
model MarketplaceAccount {
  id          String      @id @default(cuid())
  userId      String
  user        User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  marketplace Marketplace
  connected   Boolean     @default(true)
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  @@unique([userId, marketplace])
}
```

- [ ] **Step 2: Migrate**

Run: `pnpm --filter @multimarket/api exec prisma migrate dev --name marketplace_accounts`
Expected: creates + applies `*_marketplace_accounts`, regenerates the client. (Postgres up on 5433.)

- [ ] **Step 3: Verify**

Run: `pnpm --filter @multimarket/api exec prisma migrate status`
Expected: "Database schema is up to date!"

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma
git commit -m "feat(api): MarketplaceAccount model + extend Marketplace enum (migration)"
```

---

## Task 3: Adapters — Wallapop / Kleinanzeigen / Subito (TDD)

**Files:**
- Modify: `apps/api/src/publish/adapters/conditions.ts`
- Create: `apps/api/src/publish/adapters/new-adapters.spec.ts`
- Create: `apps/api/src/publish/adapters/wallapop.adapter.ts`
- Create: `apps/api/src/publish/adapters/kleinanzeigen.adapter.ts`
- Create: `apps/api/src/publish/adapters/subito.adapter.ts`

- [ ] **Step 1: Add condition maps**

Append to `apps/api/src/publish/adapters/conditions.ts`:
```ts
export const WALLAPOP_CONDITION: Record<Condition, string> = {
  new: 'Nuevo',
  like_new: 'Como nuevo',
  good: 'En buen estado',
  fair: 'Aceptable',
};

export const KLEINANZEIGEN_CONDITION: Record<Condition, string> = {
  new: 'Neu',
  like_new: 'Neuwertig',
  good: 'Gut',
  fair: 'In Ordnung',
};

export const SUBITO_CONDITION: Record<Condition, string> = {
  new: 'Nuovo',
  like_new: 'Come nuovo',
  good: 'Buono',
  fair: 'Accettabile',
};
```

- [ ] **Step 2: Write the failing test**

`apps/api/src/publish/adapters/new-adapters.spec.ts`:
```ts
import { WallapopAdapter } from './wallapop.adapter';
import { KleinanzeigenAdapter } from './kleinanzeigen.adapter';
import { SubitoAdapter } from './subito.adapter';
import type { ListingForAdapter } from './adapter';

const listing: ListingForAdapter = {
  title: 'Veste en cuir',
  description: 'Très bon état',
  priceCents: 4500,
  currency: 'EUR',
  category: 'mode',
  condition: 'good',
  brand: 'Levis',
  color: 'noir',
  size: 'M',
  location: 'Paris',
  photoUrls: ['http://x/1.jpg', 'http://x/2.jpg'],
};

describe('new assisted adapters', () => {
  it('Wallapop is assisted, maps the ES condition and builds a deep link', () => {
    const a = new WallapopAdapter();
    expect(a.id).toBe('WALLAPOP');
    expect(a.mode).toBe('assisted');
    const mapped = a.mapListing(listing);
    expect(mapped.condition).toBe('En buen estado');
    expect(mapped.marketplace).toBe('WALLAPOP');
    const payload = a.buildAssistedPayload(mapped);
    expect(payload.deepLink).toContain('wallapop');
    expect(payload.pasteText).toContain('Veste en cuir');
    expect(payload.photoUrls).toHaveLength(2);
  });

  it('Kleinanzeigen maps the DE condition and builds a deep link', () => {
    const a = new KleinanzeigenAdapter();
    expect(a.id).toBe('KLEINANZEIGEN');
    expect(a.mapListing(listing).condition).toBe('Gut');
    expect(a.buildAssistedPayload(a.mapListing(listing)).deepLink).toContain('kleinanzeigen');
  });

  it('Subito maps the IT condition and builds a deep link', () => {
    const a = new SubitoAdapter();
    expect(a.id).toBe('SUBITO');
    expect(a.mapListing(listing).condition).toBe('Buono');
    expect(a.buildAssistedPayload(a.mapListing(listing)).deepLink).toContain('subito');
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @multimarket/api test new-adapters`
Expected: FAIL — cannot find module `./wallapop.adapter`.

- [ ] **Step 4: Implement the Wallapop adapter**

`apps/api/src/publish/adapters/wallapop.adapter.ts`:
```ts
import type { AssistedPayload, Condition, MappedListing } from '@multimarket/shared';
import type { ListingForAdapter, MarketplaceAdapter } from './adapter';
import { WALLAPOP_CONDITION } from './conditions';

export class WallapopAdapter implements MarketplaceAdapter {
  id = 'WALLAPOP' as const;
  mode = 'assisted' as const;

  mapListing(listing: ListingForAdapter): MappedListing {
    return {
      marketplace: 'WALLAPOP',
      title: listing.title.slice(0, 50),
      description: listing.description,
      priceCents: listing.priceCents,
      currency: listing.currency,
      category: listing.category,
      condition: WALLAPOP_CONDITION[listing.condition as Condition] ?? listing.condition,
      photoUrls: listing.photoUrls,
    };
  }

  buildAssistedPayload(mapped: MappedListing): AssistedPayload {
    const price = (mapped.priceCents / 100).toFixed(2);
    return {
      marketplace: 'WALLAPOP',
      title: mapped.title,
      pasteText: `${mapped.title}\n\n${mapped.description}\n\nÉtat : ${mapped.condition}\nPrix : ${price} ${mapped.currency}`,
      deepLink: 'https://es.wallapop.com/app/catalog/upload',
      photoUrls: mapped.photoUrls,
    };
  }
}
```

- [ ] **Step 5: Implement the Kleinanzeigen adapter**

`apps/api/src/publish/adapters/kleinanzeigen.adapter.ts`:
```ts
import type { AssistedPayload, Condition, MappedListing } from '@multimarket/shared';
import type { ListingForAdapter, MarketplaceAdapter } from './adapter';
import { KLEINANZEIGEN_CONDITION } from './conditions';

export class KleinanzeigenAdapter implements MarketplaceAdapter {
  id = 'KLEINANZEIGEN' as const;
  mode = 'assisted' as const;

  mapListing(listing: ListingForAdapter): MappedListing {
    return {
      marketplace: 'KLEINANZEIGEN',
      title: listing.title.slice(0, 70),
      description: listing.description,
      priceCents: listing.priceCents,
      currency: listing.currency,
      category: listing.category,
      condition: KLEINANZEIGEN_CONDITION[listing.condition as Condition] ?? listing.condition,
      photoUrls: listing.photoUrls,
    };
  }

  buildAssistedPayload(mapped: MappedListing): AssistedPayload {
    const price = (mapped.priceCents / 100).toFixed(2);
    return {
      marketplace: 'KLEINANZEIGEN',
      title: mapped.title,
      pasteText: `${mapped.title}\n\n${mapped.description}\n\nÉtat : ${mapped.condition}\nPrix : ${price} ${mapped.currency}`,
      deepLink: 'https://www.kleinanzeigen.de/p-anzeige-aufgeben.html',
      photoUrls: mapped.photoUrls,
    };
  }
}
```

- [ ] **Step 6: Implement the Subito adapter**

`apps/api/src/publish/adapters/subito.adapter.ts`:
```ts
import type { AssistedPayload, Condition, MappedListing } from '@multimarket/shared';
import type { ListingForAdapter, MarketplaceAdapter } from './adapter';
import { SUBITO_CONDITION } from './conditions';

export class SubitoAdapter implements MarketplaceAdapter {
  id = 'SUBITO' as const;
  mode = 'assisted' as const;

  mapListing(listing: ListingForAdapter): MappedListing {
    return {
      marketplace: 'SUBITO',
      title: listing.title.slice(0, 50),
      description: listing.description,
      priceCents: listing.priceCents,
      currency: listing.currency,
      category: listing.category,
      condition: SUBITO_CONDITION[listing.condition as Condition] ?? listing.condition,
      photoUrls: listing.photoUrls,
    };
  }

  buildAssistedPayload(mapped: MappedListing): AssistedPayload {
    const price = (mapped.priceCents / 100).toFixed(2);
    return {
      marketplace: 'SUBITO',
      title: mapped.title,
      pasteText: `${mapped.title}\n\n${mapped.description}\n\nÉtat : ${mapped.condition}\nPrix : ${price} ${mapped.currency}`,
      deepLink: 'https://www.subito.it/inserisci-annuncio.htm',
      photoUrls: mapped.photoUrls,
    };
  }
}
```

- [ ] **Step 7: Run to verify it passes**

Run: `pnpm --filter @multimarket/api test new-adapters`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/publish/adapters/conditions.ts apps/api/src/publish/adapters/wallapop.adapter.ts apps/api/src/publish/adapters/kleinanzeigen.adapter.ts apps/api/src/publish/adapters/subito.adapter.ts apps/api/src/publish/adapters/new-adapters.spec.ts
git commit -m "feat(api): Wallapop + Kleinanzeigen + Subito assisted adapters"
```

---

## Task 4: Registry + publish DTO validation

**Files:**
- Modify: `apps/api/src/publish/adapters/adapter.registry.ts`
- Modify: `apps/api/src/publish/publish.controller.ts`

- [ ] **Step 1: Register the new adapters**

Replace the whole `apps/api/src/publish/adapters/adapter.registry.ts` with:
```ts
import { Inject, Injectable } from '@nestjs/common';
import type { Marketplace } from '@multimarket/shared';
import type { MarketplaceAdapter } from './adapter';
import { VintedAdapter } from './vinted.adapter';
import { LeboncoinAdapter } from './leboncoin.adapter';
import { EbayAdapter } from './ebay.adapter';
import { WallapopAdapter } from './wallapop.adapter';
import { KleinanzeigenAdapter } from './kleinanzeigen.adapter';
import { SubitoAdapter } from './subito.adapter';
import { EBAY_CLIENT, type EbayClient } from './ebay.client';

@Injectable()
export class AdapterRegistry {
  private adapters: Record<Marketplace, MarketplaceAdapter>;

  constructor(@Inject(EBAY_CLIENT) ebayClient: EbayClient) {
    this.adapters = {
      EBAY: new EbayAdapter(ebayClient),
      VINTED: new VintedAdapter(),
      LEBONCOIN: new LeboncoinAdapter(),
      WALLAPOP: new WallapopAdapter(),
      KLEINANZEIGEN: new KleinanzeigenAdapter(),
      SUBITO: new SubitoAdapter(),
    };
  }

  get(marketplace: Marketplace): MarketplaceAdapter {
    return this.adapters[marketplace];
  }
}
```

- [ ] **Step 2: Validate publish DTO against the catalog**

In `apps/api/src/publish/publish.controller.ts`, change the shared import line:
```ts
import type { Marketplace } from '@multimarket/shared';
```
to:
```ts
import { MARKETPLACES, type Marketplace } from '@multimarket/shared';
```
Add this constant just below the imports (above `class PublishDto`):
```ts
const MARKETPLACE_IDS = MARKETPLACES.map((m) => m.id);
```
And change the `PublishDto` decorator from:
```ts
  @IsIn(['EBAY', 'VINTED', 'LEBONCOIN'], { each: true })
```
to:
```ts
  @IsIn(MARKETPLACE_IDS, { each: true })
```

- [ ] **Step 3: Build**

Run: `pnpm --filter @multimarket/api build`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/publish/adapters/adapter.registry.ts apps/api/src/publish/publish.controller.ts
git commit -m "feat(api): register new adapters + validate publish DTO from catalog"
```

---

## Task 5: Accounts service + module + controller (TDD)

**Files:**
- Create: `apps/api/src/accounts/accounts.service.spec.ts`
- Create: `apps/api/src/accounts/accounts.service.ts`
- Create: `apps/api/src/accounts/accounts.controller.ts`
- Create: `apps/api/src/accounts/accounts.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/accounts/accounts.service.spec.ts`:
```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @multimarket/api test accounts.service`
Expected: FAIL — cannot find module `./accounts.service`.

- [ ] **Step 3: Implement the service**

`apps/api/src/accounts/accounts.service.ts`:
```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @multimarket/api test accounts.service`
Expected: PASS (3 tests).

- [ ] **Step 5: Create the controller**

`apps/api/src/accounts/accounts.controller.ts`:
```ts
import { BadRequestException, Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MARKETPLACES, type Marketplace } from '@multimarket/shared';
import { AccountsService } from './accounts.service';

const MARKETPLACE_IDS = MARKETPLACES.map((m) => m.id);

class SetConnectedDto {
  @IsBoolean()
  connected!: boolean;
}

@UseGuards(JwtAuthGuard)
@Controller('accounts')
export class AccountsController {
  constructor(private accounts: AccountsService) {}

  @Get()
  list(@Req() req: any) {
    return this.accounts.list(req.user.id);
  }

  @Patch(':marketplace')
  setConnected(@Req() req: any, @Param('marketplace') marketplace: string, @Body() dto: SetConnectedDto) {
    if (!MARKETPLACE_IDS.includes(marketplace as Marketplace)) {
      throw new BadRequestException('Unknown marketplace');
    }
    return this.accounts.setConnected(req.user.id, marketplace as Marketplace, dto.connected);
  }
}
```

- [ ] **Step 6: Create the module**

`apps/api/src/accounts/accounts.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { AccountsController } from './accounts.controller';

@Module({
  providers: [AccountsService],
  controllers: [AccountsController],
})
export class AccountsModule {}
```

- [ ] **Step 7: Wire AccountsModule into app.module.ts**

In `apps/api/src/app.module.ts`, add the import near the other module imports:
```ts
import { AccountsModule } from './accounts/accounts.module';
```
and add `AccountsModule` to the `imports` array (after `DashboardModule`).

- [ ] **Step 8: Build**

Run: `pnpm --filter @multimarket/api build`
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/accounts apps/api/src/app.module.ts
git commit -m "feat(api): accounts service + GET/PATCH /accounts (marketplace linking)"
```

---

## Task 6: Accounts e2e (+ new-marketplace publish)

**Files:**
- Create: `apps/api/test/accounts.e2e-spec.ts`

- [ ] **Step 1: Write the e2e test**

`apps/api/test/accounts.e2e-spec.ts`:
```ts
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
```

- [ ] **Step 2: Run unit + e2e (Postgres AND Redis up)**

Run: `pnpm --filter @multimarket/api test`
Expected: all unit suites PASS.
Run: `pnpm --filter @multimarket/api test:e2e`
Expected: auth + listings + publish + accounts all PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/accounts.e2e-spec.ts
git commit -m "test(api): accounts e2e + new-marketplace publish"
```

---

## Task 7: Web — accounts client + helper (TDD)

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`
- Create: `apps/web/src/lib/accounts.test.ts`
- Create: `apps/web/src/lib/marketplaces.ts`
- Create: `apps/web/src/lib/marketplaces.test.ts`

- [ ] **Step 1: Write the failing api-client test**

`apps/web/src/lib/accounts.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAccounts, setAccountConnected } from './api-client';

describe('accounts api-client', () => {
  beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

  it('GETs the accounts with the bearer token', async () => {
    localStorage.setItem('accessToken', 'tok');
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    await getAccounts();
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('http://localhost:4000/accounts');
    expect((init as any).headers.Authorization).toBe('Bearer tok');
  });

  it('PATCHes a marketplace connected flag', async () => {
    localStorage.setItem('accessToken', 'tok');
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ marketplace: 'SUBITO', mode: 'assisted', connected: false }), { status: 200 }),
    );
    const res = await setAccountConnected('SUBITO', false);
    expect(res.connected).toBe(false);
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('http://localhost:4000/accounts/SUBITO');
    expect((init as any).method).toBe('PATCH');
    expect(JSON.parse((init as any).body).connected).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @multimarket/web test accounts`
Expected: FAIL — `getAccounts` / `setAccountConnected` are not exported.

- [ ] **Step 3: Extend the api-client**

In `apps/web/src/lib/api-client.ts`, add `MarketplaceAccountView` to the `@multimarket/shared` import block:
```ts
  MarketplaceAccountView,
```
Then append at the end of the file:
```ts
export function getAccounts(): Promise<MarketplaceAccountView[]> {
  return authedJson<MarketplaceAccountView[]>('/accounts', 'GET');
}

export function setAccountConnected(marketplace: Marketplace, connected: boolean): Promise<MarketplaceAccountView> {
  return authedJson<MarketplaceAccountView>(`/accounts/${marketplace}`, 'PATCH', { connected });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @multimarket/web test accounts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing helper test**

`apps/web/src/lib/marketplaces.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { connectedMarketplaces, marketplaceLabel } from './marketplaces';
import type { MarketplaceAccountView } from '@multimarket/shared';

const accounts: MarketplaceAccountView[] = [
  { marketplace: 'EBAY', mode: 'auto', connected: true },
  { marketplace: 'VINTED', mode: 'assisted', connected: false },
  { marketplace: 'SUBITO', mode: 'assisted', connected: true },
];

describe('marketplaces helper', () => {
  it('filters to the connected marketplace ids', () => {
    expect(connectedMarketplaces(accounts)).toEqual(['EBAY', 'SUBITO']);
  });
  it('looks up the catalog label', () => {
    expect(marketplaceLabel('LEBONCOIN')).toBe('Leboncoin');
    expect(marketplaceLabel('WALLAPOP')).toBe('Wallapop');
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm --filter @multimarket/web test marketplaces`
Expected: FAIL — cannot find module `./marketplaces`.

- [ ] **Step 7: Implement the helper**

`apps/web/src/lib/marketplaces.ts`:
```ts
import { MARKETPLACES, type Marketplace, type MarketplaceAccountView } from '@multimarket/shared';

export function connectedMarketplaces(accounts: MarketplaceAccountView[]): Marketplace[] {
  return accounts.filter((a) => a.connected).map((a) => a.marketplace);
}

export function marketplaceLabel(id: Marketplace): string {
  return MARKETPLACES.find((m) => m.id === id)?.label ?? id;
}
```

- [ ] **Step 8: Run to verify it passes + full web run**

Run: `pnpm --filter @multimarket/web test marketplaces`
Expected: PASS (2 tests).
Run: `pnpm --filter @multimarket/web test`
Expected: all web tests PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/api-client.ts apps/web/src/lib/accounts.test.ts apps/web/src/lib/marketplaces.ts apps/web/src/lib/marketplaces.test.ts
git commit -m "feat(web): accounts client + connected-marketplaces helper"
```

---

## Task 8: Web — "Mes comptes" page

**Files:**
- Create: `apps/web/src/app/accounts/page.tsx`

- [ ] **Step 1: Create the accounts page**

`apps/web/src/app/accounts/page.tsx`:
```tsx
'use client';
import { useEffect, useState } from 'react';
import { getAccounts, setAccountConnected } from '@/lib/api-client';
import { marketplaceLabel } from '@/lib/marketplaces';
import type { MarketplaceAccountView } from '@multimarket/shared';

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<MarketplaceAccountView[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAccounts().then(setAccounts).catch((e) => setError((e as Error).message));
  }, []);

  async function toggle(a: MarketplaceAccountView) {
    const next = !a.connected;
    setAccounts((list) => list.map((x) => (x.marketplace === a.marketplace ? { ...x, connected: next } : x)));
    try {
      await setAccountConnected(a.marketplace, next);
    } catch (e) {
      setError((e as Error).message);
      setAccounts((list) => list.map((x) => (x.marketplace === a.marketplace ? { ...x, connected: a.connected } : x)));
    }
  }

  if (error) return <p className="p-6 text-red-600">{error}</p>;

  return (
    <main className="mx-auto mt-10 max-w-2xl p-6">
      <h1 className="text-xl font-semibold">Mes comptes</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Choisissez les marketplaces proposés lors de la publication.
      </p>
      <ul className="mt-4 flex flex-col gap-2">
        {accounts.map((a) => (
          <li key={a.marketplace} className="flex items-center justify-between rounded border p-3 dark:border-gray-700">
            <span>
              {marketplaceLabel(a.marketplace)}
              <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{a.mode}</span>
            </span>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={a.connected} onChange={() => toggle(a)} />
              {a.connected ? 'Activé' : 'Désactivé'}
            </label>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2: Build**

Run: `pnpm --filter @multimarket/web build`
Expected: exit 0, route `/accounts` listed.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/accounts/page.tsx
git commit -m "feat(web): Mes comptes page (toggle marketplaces)"
```

---

## Task 9: Web — publish page driven by accounts + nav link

**Files:**
- Modify: `apps/web/src/app/listings/[id]/publish/page.tsx`
- Modify: `apps/web/src/components/nav-bar.tsx`

- [ ] **Step 1: Drive the publish selection from connected accounts**

Replace the whole `apps/web/src/app/listings/[id]/publish/page.tsx` with:
```tsx
'use client';
import { use, useEffect, useRef, useState } from 'react';
import { publishEverywhere, getPublications, getAssisted, markPosted, getAccounts } from '@/lib/api-client';
import { shareAssisted, downloadPhotos } from '@/lib/share';
import { connectedMarketplaces, marketplaceLabel } from '@/lib/marketplaces';
import type { AssistedPayload, Marketplace, Publication } from '@multimarket/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const TERMINAL = ['published', 'failed', 'sold', 'expired', 'awaiting_user'];

export default function PublishPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [available, setAvailable] = useState<Marketplace[]>([]);
  const [selected, setSelected] = useState<Marketplace[]>([]);
  const [pubs, setPubs] = useState<Publication[]>([]);
  const [assisted, setAssisted] = useState<Record<string, AssistedPayload>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    getAccounts()
      .then((accts) => {
        const conn = connectedMarketplaces(accts);
        setAvailable(conn);
        setSelected(conn);
      })
      .catch(() => {});
    getPublications(id).then(setPubs).catch(() => {});
    return () => esRef.current?.close();
  }, [id]);

  // Load assisted payloads for any awaiting_user publication we don't have yet.
  useEffect(() => {
    for (const p of pubs) {
      if (p.status === 'awaiting_user' && !assisted[p.id]) {
        getAssisted(p.id).then((payload) => setAssisted((a) => ({ ...a, [p.id]: payload }))).catch(() => {});
      }
    }
  }, [pubs, assisted]);

  function toggle(m: Marketplace) {
    setSelected((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]));
  }

  function openStream() {
    esRef.current?.close();
    const token = localStorage.getItem('accessToken') ?? '';
    const es = new EventSource(`${API_URL}/listings/${id}/publications/stream?access_token=${encodeURIComponent(token)}`);
    es.onmessage = (e) => {
      const data = JSON.parse(e.data) as Publication[];
      setPubs(data);
      if (data.length > 0 && data.every((p) => TERMINAL.includes(p.status))) es.close();
    };
    es.onerror = () => es.close();
    esRef.current = es;
  }

  async function onPublish() {
    setError(null);
    try {
      await publishEverywhere(id, selected);
      openStream();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function onPosted(pubId: string) {
    try {
      await markPosted(pubId, urls[pubId] || undefined);
      setPubs(await getPublications(id));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <main className="mx-auto mt-10 max-w-2xl p-6">
      <h1 className="text-xl font-semibold">Publier partout</h1>
      {available.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          Aucun marketplace activé. Active-les dans <a className="text-blue-600 underline" href="/accounts">Mes comptes</a>.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-4">
          {available.map((m) => (
            <label key={m} className="flex items-center gap-2">
              <input type="checkbox" checked={selected.includes(m)} onChange={() => toggle(m)} />
              {marketplaceLabel(m)}
            </label>
          ))}
        </div>
      )}
      <button className="mt-4 rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50" onClick={onPublish} disabled={selected.length === 0}>
        Publier partout
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <ul className="mt-6 flex flex-col gap-3">
        {pubs.map((p) => (
          <li key={p.id} className="rounded border p-3 dark:border-gray-700">
            <div className="flex justify-between">
              <span className="font-medium">{marketplaceLabel(p.marketplace)}</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">{p.status}</span>
            </div>
            {p.status === 'published' && p.externalUrl && (
              <a className="text-sm text-blue-600 underline" href={p.externalUrl} target="_blank" rel="noreferrer">
                Voir l&apos;annonce
              </a>
            )}
            {p.status === 'failed' && <p className="text-sm text-red-600">{p.error}</p>}
            {p.status === 'awaiting_user' && assisted[p.id] && (
              <div className="mt-2 flex flex-col gap-2 text-sm">
                <div className="flex flex-wrap gap-2">
                  <button className="rounded bg-blue-600 px-3 py-1 text-white" onClick={() => shareAssisted(assisted[p.id])}>
                    Partager
                  </button>
                  <button className="rounded border px-3 py-1 dark:border-gray-700" onClick={() => navigator.clipboard?.writeText(assisted[p.id].pasteText)}>
                    Copier le texte
                  </button>
                  <button className="rounded border px-3 py-1 dark:border-gray-700" onClick={() => downloadPhotos(assisted[p.id].photoUrls)}>
                    Télécharger les photos
                  </button>
                  <a className="rounded border px-3 py-1 dark:border-gray-700" href={assisted[p.id].deepLink} target="_blank" rel="noreferrer">
                    Ouvrir {marketplaceLabel(p.marketplace)}
                  </a>
                </div>
                <textarea className="w-full rounded border p-2 dark:border-gray-700 dark:bg-gray-800" rows={4} readOnly value={assisted[p.id].pasteText} />
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded border p-2 dark:border-gray-700 dark:bg-gray-800"
                    placeholder="URL de l'annonce (optionnel)"
                    value={urls[p.id] ?? ''}
                    onChange={(e) => setUrls((u) => ({ ...u, [p.id]: e.target.value }))}
                  />
                  <button className="rounded bg-green-600 px-3 py-1 text-white" onClick={() => onPosted(p.id)}>
                    J&apos;ai posté
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2: Add the nav link**

In `apps/web/src/components/nav-bar.tsx`, add a "Mes comptes" link inside the authenticated block, after the "Mes annonces" link:
```tsx
            <a href="/accounts">Mes comptes</a>
```

- [ ] **Step 3: Build**

Run: `pnpm --filter @multimarket/web build`
Expected: exit 0, routes `/accounts` and `/listings/[id]/publish` listed.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/listings/[id]/publish/page.tsx" apps/web/src/components/nav-bar.tsx
git commit -m "feat(web): publish selection from connected accounts + Mes comptes nav link"
```

---

## Task 10: Full verification

**Files:** none (verification only).

- [ ] **Step 1: API unit tests**

Run: `pnpm --filter @multimarket/api test`
Expected: all suites PASS (adds new-adapters + accounts.service).

- [ ] **Step 2: API e2e (Postgres + Redis up)**

Run: `pnpm --filter @multimarket/api test:e2e`
Expected: auth + listings + publish + accounts all PASS.

- [ ] **Step 3: Web tests**

Run: `pnpm --filter @multimarket/web test`
Expected: all PASS (adds accounts + marketplaces).

- [ ] **Step 4: Builds**

Run: `pnpm --filter @multimarket/api build` (exit 0)
Run: `pnpm --filter @multimarket/web build` (exit 0)

---

## Done criteria for Slice B

- Wallapop, Kleinanzeigen and Subito publish as assisted (one `Publication` each → `awaiting_user` with a localized condition + deposit deep link).
- `GET /accounts` returns all six marketplaces (default connected); `PATCH /accounts/:marketplace` toggles a per-user flag; unknown marketplace → 400.
- The publish page offers only the user's connected marketplaces (labels from the shared catalog); "Mes comptes" toggles them; nav links to it.
- All unit + e2e + web tests green; both apps build.

**Out of scope (deferred):** eBay OAuth / real auto-publish, marketplace session/status checks, Facebook Marketplace, server-side enforcement of account state in `publishEverywhere`, per-locale paste-text label translation.

**Next:** Slice C (AI assistant) or eBay OAuth (credential-gated), per the Slice A decomposition.
