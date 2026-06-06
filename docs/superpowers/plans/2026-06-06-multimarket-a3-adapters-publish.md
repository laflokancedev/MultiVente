# MultiMarket A3 — Adapters + Publish Queue + SSE — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Publier partout" — fan a unified listing out to selected marketplaces via a background queue: eBay auto-publishes through an injectable client (mocked until real creds), Vinted/Leboncoin produce an assisted hand-off payload; per-platform status is tracked and streamed to the PWA.

**Architecture:** A `MarketplaceAdapter` interface with one implementation per marketplace, behind an adapter registry. `POST /listings/:id/publish` creates one `Publication` row per marketplace and enqueues one BullMQ job each; a worker runs each adapter and updates the row (`published`/`failed` for auto, `awaiting_user` for assisted). The PWA reads status via REST + SSE and renders the assisted hand-off (paste text + deep link). eBay's network call sits behind an `EbayClient` interface so the pipeline is fully testable with `MockEbayClient`.

**Tech Stack:** NestJS 10, `@nestjs/bullmq` + `bullmq` (Redis), Prisma 5, Jest + supertest, Next.js 15 + Vitest.

---

## File Structure

```
apps/api/
  package.json                                  # + @nestjs/bullmq, bullmq (modify)
  prisma/schema.prisma                          # + Publication, enums, Listing.publications (modify)
  src/
    publish/
      adapters/adapter.ts                       # MarketplaceAdapter + ListingForAdapter interfaces
      adapters/conditions.ts                    # per-marketplace condition label maps
      adapters/vinted.adapter.ts                # assisted
      adapters/leboncoin.adapter.ts             # assisted
      adapters/ebay.client.ts                   # EbayClient interface + MockEbayClient
      adapters/ebay.adapter.ts                  # auto (uses EbayClient)
      adapters/adapter.registry.ts              # Marketplace -> adapter
      adapters/vinted.adapter.spec.ts
      adapters/ebay.adapter.spec.ts
      publish.service.ts                        # publishEverywhere, processPublication, getters
      publish.service.spec.ts
      publish.processor.ts                      # BullMQ worker -> publish.service.processPublication
      publish.controller.ts                     # POST publish, GET publications, GET assisted, SSE
      publish.module.ts
    app.module.ts                               # + BullMQ root + PublishModule (modify)
  test/publish.e2e-spec.ts
packages/shared/src/
  publish.ts                                    # Marketplace, PublishMode, PublicationStatus, Publication, MappedListing, AssistedPayload, PublishResult
  index.ts                                      # re-export (modify)
apps/web/src/
  lib/api-client.ts                             # + publishEverywhere/getPublications/getAssisted (modify)
  lib/publish-client.test.ts
  app/listings/[id]/publish/page.tsx            # publish UI + per-platform report + assisted hand-off
```

---

## Task 1: Shared publish types

**Files:**
- Create: `packages/shared/src/publish.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create the publish types**

`packages/shared/src/publish.ts`:
```ts
export type Marketplace = 'EBAY' | 'VINTED' | 'LEBONCOIN';
export type PublishMode = 'auto' | 'assisted';
export type PublicationStatus =
  | 'pending'
  | 'awaiting_user'
  | 'published'
  | 'failed'
  | 'sold'
  | 'expired';

export interface Publication {
  id: string;
  marketplace: Marketplace;
  mode: PublishMode;
  status: PublicationStatus;
  externalId: string | null;
  externalUrl: string | null;
  error: string | null;
}

export interface MappedListing {
  marketplace: Marketplace;
  title: string;
  description: string;
  priceCents: number;
  currency: string;
  category: string;
  condition: string;
  photoUrls: string[];
}

export interface AssistedPayload {
  marketplace: Marketplace;
  title: string;
  pasteText: string;
  deepLink: string;
  photoUrls: string[];
}

export interface PublishResult {
  externalId: string;
  externalUrl: string;
}
```

- [ ] **Step 2: Re-export**

Add to `packages/shared/src/index.ts` (keep existing exports):
```ts
export * from './publish';
```

- [ ] **Step 3: Verify + commit**

Run: `pnpm install` (expect no errors).
```bash
git add packages/shared
git commit -m "feat(shared): add publish/marketplace types"
```

---

## Task 2: Publication model

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add enums + model + Listing relation**

Add to `apps/api/prisma/schema.prisma` (keep existing content; add `publications ListingPhoto`-style relation to `Listing`):

```prisma
enum Marketplace {
  EBAY
  VINTED
  LEBONCOIN
}

enum PublishMode {
  auto
  assisted
}

enum PublicationStatus {
  pending
  awaiting_user
  published
  failed
  sold
  expired
}

model Publication {
  id          String            @id @default(cuid())
  listingId   String
  listing     Listing           @relation(fields: [listingId], references: [id], onDelete: Cascade)
  marketplace Marketplace
  mode        PublishMode
  status      PublicationStatus @default(pending)
  externalId  String?
  externalUrl String?
  error       String?
  publishedAt DateTime?
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt

  @@unique([listingId, marketplace])
}
```

Add this line inside the existing `Listing` model:
```prisma
  publications    Publication[]
```

- [ ] **Step 2: Migrate**

Run: `pnpm --filter @multimarket/api exec prisma migrate dev --name publications`
Expected: creates + applies `*_publications`, regenerates client. (Postgres up on 5433.)

- [ ] **Step 3: Verify table**

Run: `docker run --rm -e PGPASSWORD=multimarket --network host postgres:16 psql -h 127.0.0.1 -p 5433 -U multimarket -d multimarket -tAc "select count(*) from \"Publication\";"`
Expected: prints `0`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma
git commit -m "feat(api): add Publication model + enums and migration"
```

---

## Task 3: Adapter interface + condition maps

**Files:**
- Create: `apps/api/src/publish/adapters/adapter.ts`
- Create: `apps/api/src/publish/adapters/conditions.ts`

- [ ] **Step 1: Create the adapter interface**

`apps/api/src/publish/adapters/adapter.ts`:
```ts
import type {
  AssistedPayload,
  MappedListing,
  Marketplace,
  PublishMode,
  PublishResult,
} from '@multimarket/shared';

export interface ListingForAdapter {
  title: string;
  description: string;
  priceCents: number;
  currency: string;
  category: string;
  condition: string;
  brand: string | null;
  color: string | null;
  size: string | null;
  location: string | null;
  photoUrls: string[];
}

export interface MarketplaceAdapter {
  id: Marketplace;
  mode: PublishMode;
  mapListing(listing: ListingForAdapter): MappedListing;
  publish?(mapped: MappedListing): Promise<PublishResult>;
  buildAssistedPayload?(mapped: MappedListing): AssistedPayload;
}
```

- [ ] **Step 2: Create condition label maps**

`apps/api/src/publish/adapters/conditions.ts`:
```ts
import type { Condition } from '@multimarket/shared';

export const VINTED_CONDITION: Record<Condition, string> = {
  new: 'Neuf avec étiquette',
  like_new: 'Neuf sans étiquette',
  good: 'Très bon état',
  fair: 'Bon état',
};

export const LEBONCOIN_CONDITION: Record<Condition, string> = {
  new: 'Neuf',
  like_new: 'Comme neuf',
  good: 'Bon état',
  fair: 'État correct',
};

export const EBAY_CONDITION: Record<Condition, string> = {
  new: 'NEW',
  like_new: 'LIKE_NEW',
  good: 'USED_GOOD',
  fair: 'USED_ACCEPTABLE',
};
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/publish/adapters/adapter.ts apps/api/src/publish/adapters/conditions.ts
git commit -m "feat(api): marketplace adapter interface + condition maps"
```

---

## Task 4: Vinted + Leboncoin assisted adapters (TDD)

**Files:**
- Create: `apps/api/src/publish/adapters/vinted.adapter.ts`
- Create: `apps/api/src/publish/adapters/leboncoin.adapter.ts`
- Create: `apps/api/src/publish/adapters/vinted.adapter.spec.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/publish/adapters/vinted.adapter.spec.ts`:
```ts
import { VintedAdapter } from './vinted.adapter';
import type { ListingForAdapter } from './adapter';

const listing: ListingForAdapter = {
  title: 'Veste en cuir',
  description: 'Très bon état, peu portée',
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

describe('VintedAdapter', () => {
  const adapter = new VintedAdapter();

  it('is an assisted adapter for VINTED', () => {
    expect(adapter.id).toBe('VINTED');
    expect(adapter.mode).toBe('assisted');
  });

  it('maps the condition to a Vinted label and carries photos', () => {
    const mapped = adapter.mapListing(listing);
    expect(mapped.condition).toBe('Très bon état');
    expect(mapped.photoUrls).toHaveLength(2);
    expect(mapped.marketplace).toBe('VINTED');
  });

  it('builds an assisted payload with paste text and a deep link', () => {
    const payload = adapter.buildAssistedPayload(adapter.mapListing(listing));
    expect(payload.deepLink).toContain('vinted');
    expect(payload.pasteText).toContain('Veste en cuir');
    expect(payload.pasteText).toContain('45');
    expect(payload.photoUrls).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @multimarket/api test vinted.adapter`
Expected: FAIL — cannot find module `./vinted.adapter`.

- [ ] **Step 3: Implement the Vinted adapter**

`apps/api/src/publish/adapters/vinted.adapter.ts`:
```ts
import type { AssistedPayload, Condition, MappedListing } from '@multimarket/shared';
import type { ListingForAdapter, MarketplaceAdapter } from './adapter';
import { VINTED_CONDITION } from './conditions';

export class VintedAdapter implements MarketplaceAdapter {
  id = 'VINTED' as const;
  mode = 'assisted' as const;

  mapListing(listing: ListingForAdapter): MappedListing {
    return {
      marketplace: 'VINTED',
      title: listing.title.slice(0, 100),
      description: listing.description,
      priceCents: listing.priceCents,
      currency: listing.currency,
      category: listing.category,
      condition: VINTED_CONDITION[listing.condition as Condition] ?? listing.condition,
      photoUrls: listing.photoUrls,
    };
  }

  buildAssistedPayload(mapped: MappedListing): AssistedPayload {
    const price = (mapped.priceCents / 100).toFixed(2);
    return {
      marketplace: 'VINTED',
      title: mapped.title,
      pasteText: `${mapped.title}\n\n${mapped.description}\n\nÉtat : ${mapped.condition}\nPrix : ${price} ${mapped.currency}`,
      deepLink: 'https://www.vinted.fr/items/new',
      photoUrls: mapped.photoUrls,
    };
  }
}
```

- [ ] **Step 4: Implement the Leboncoin adapter**

`apps/api/src/publish/adapters/leboncoin.adapter.ts`:
```ts
import type { AssistedPayload, Condition, MappedListing } from '@multimarket/shared';
import type { ListingForAdapter, MarketplaceAdapter } from './adapter';
import { LEBONCOIN_CONDITION } from './conditions';

export class LeboncoinAdapter implements MarketplaceAdapter {
  id = 'LEBONCOIN' as const;
  mode = 'assisted' as const;

  mapListing(listing: ListingForAdapter): MappedListing {
    return {
      marketplace: 'LEBONCOIN',
      title: listing.title.slice(0, 50),
      description: listing.description,
      priceCents: listing.priceCents,
      currency: listing.currency,
      category: listing.category,
      condition: LEBONCOIN_CONDITION[listing.condition as Condition] ?? listing.condition,
      photoUrls: listing.photoUrls,
    };
  }

  buildAssistedPayload(mapped: MappedListing): AssistedPayload {
    const price = (mapped.priceCents / 100).toFixed(2);
    return {
      marketplace: 'LEBONCOIN',
      title: mapped.title,
      pasteText: `${mapped.title}\n\n${mapped.description}\n\nÉtat : ${mapped.condition}\nPrix : ${price} ${mapped.currency}`,
      deepLink: 'https://www.leboncoin.fr/deposer-une-annonce',
      photoUrls: mapped.photoUrls,
    };
  }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter @multimarket/api test vinted.adapter`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/publish/adapters/vinted.adapter.ts apps/api/src/publish/adapters/leboncoin.adapter.ts apps/api/src/publish/adapters/vinted.adapter.spec.ts
git commit -m "feat(api): Vinted + Leboncoin assisted adapters"
```

---

## Task 5: eBay client + auto adapter (TDD)

**Files:**
- Create: `apps/api/src/publish/adapters/ebay.client.ts`
- Create: `apps/api/src/publish/adapters/ebay.adapter.ts`
- Create: `apps/api/src/publish/adapters/ebay.adapter.spec.ts`

- [ ] **Step 1: Create the EbayClient interface + mock**

`apps/api/src/publish/adapters/ebay.client.ts`:
```ts
import { randomUUID } from 'node:crypto';
import type { MappedListing, PublishResult } from '@multimarket/shared';

export interface EbayClient {
  createListing(mapped: MappedListing): Promise<PublishResult>;
}

// Used until real eBay developer credentials are configured. It does not call
// the network — it simulates a successful eBay listing creation.
export class MockEbayClient implements EbayClient {
  async createListing(_mapped: MappedListing): Promise<PublishResult> {
    const id = `EBAY-MOCK-${randomUUID().slice(0, 8)}`;
    return { externalId: id, externalUrl: `https://sandbox.ebay.com/itm/${id}` };
  }
}

export const EBAY_CLIENT = Symbol('EBAY_CLIENT');
```

- [ ] **Step 2: Write the failing test**

`apps/api/src/publish/adapters/ebay.adapter.spec.ts`:
```ts
import { EbayAdapter } from './ebay.adapter';
import { MockEbayClient } from './ebay.client';
import type { ListingForAdapter } from './adapter';

const listing: ListingForAdapter = {
  title: 'Veste',
  description: 'desc',
  priceCents: 4500,
  currency: 'EUR',
  category: 'mode',
  condition: 'good',
  brand: null,
  color: null,
  size: null,
  location: null,
  photoUrls: ['http://x/1.jpg'],
};

describe('EbayAdapter', () => {
  const adapter = new EbayAdapter(new MockEbayClient());

  it('is an auto adapter for EBAY', () => {
    expect(adapter.id).toBe('EBAY');
    expect(adapter.mode).toBe('auto');
  });

  it('maps condition to an eBay enum', () => {
    expect(adapter.mapListing(listing).condition).toBe('USED_GOOD');
  });

  it('publishes via the client and returns an external id + url', async () => {
    const result = await adapter.publish(adapter.mapListing(listing));
    expect(result.externalId).toContain('EBAY');
    expect(result.externalUrl).toContain('ebay.com');
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @multimarket/api test ebay.adapter`
Expected: FAIL — cannot find module `./ebay.adapter`.

- [ ] **Step 4: Implement the eBay adapter**

`apps/api/src/publish/adapters/ebay.adapter.ts`:
```ts
import type { Condition, MappedListing, PublishResult } from '@multimarket/shared';
import type { ListingForAdapter, MarketplaceAdapter } from './adapter';
import type { EbayClient } from './ebay.client';
import { EBAY_CONDITION } from './conditions';

export class EbayAdapter implements MarketplaceAdapter {
  id = 'EBAY' as const;
  mode = 'auto' as const;

  constructor(private client: EbayClient) {}

  mapListing(listing: ListingForAdapter): MappedListing {
    return {
      marketplace: 'EBAY',
      title: listing.title.slice(0, 80),
      description: listing.description,
      priceCents: listing.priceCents,
      currency: listing.currency,
      category: listing.category,
      condition: EBAY_CONDITION[listing.condition as Condition] ?? 'USED_GOOD',
      photoUrls: listing.photoUrls,
    };
  }

  publish(mapped: MappedListing): Promise<PublishResult> {
    return this.client.createListing(mapped);
  }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter @multimarket/api test ebay.adapter`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/publish/adapters/ebay.client.ts apps/api/src/publish/adapters/ebay.adapter.ts apps/api/src/publish/adapters/ebay.adapter.spec.ts
git commit -m "feat(api): eBay auto adapter behind injectable EbayClient (mock)"
```

---

## Task 6: Adapter registry

**Files:**
- Create: `apps/api/src/publish/adapters/adapter.registry.ts`

- [ ] **Step 1: Implement the registry**

`apps/api/src/publish/adapters/adapter.registry.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import type { Marketplace } from '@multimarket/shared';
import type { MarketplaceAdapter } from './adapter';
import { VintedAdapter } from './vinted.adapter';
import { LeboncoinAdapter } from './leboncoin.adapter';
import { EbayAdapter } from './ebay.adapter';
import { EBAY_CLIENT, type EbayClient } from './ebay.client';

@Injectable()
export class AdapterRegistry {
  private adapters: Record<Marketplace, MarketplaceAdapter>;

  constructor(@Inject(EBAY_CLIENT) ebayClient: EbayClient) {
    this.adapters = {
      EBAY: new EbayAdapter(ebayClient),
      VINTED: new VintedAdapter(),
      LEBONCOIN: new LeboncoinAdapter(),
    };
  }

  get(marketplace: Marketplace): MarketplaceAdapter {
    return this.adapters[marketplace];
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/publish/adapters/adapter.registry.ts
git commit -m "feat(api): adapter registry"
```

---

## Task 7: Publish service (TDD)

**Files:**
- Create: `apps/api/src/publish/publish.service.ts`
- Create: `apps/api/src/publish/publish.service.spec.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/publish/publish.service.spec.ts`:
```ts
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
    const ebay = pubs.find((p) => p.marketplace === 'EBAY');
    const vinted = pubs.find((p) => p.marketplace === 'VINTED');
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
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @multimarket/api test publish.service`
Expected: FAIL — cannot find module `./publish.service`.

- [ ] **Step 3: Implement the publish service**

`apps/api/src/publish/publish.service.ts`:
```ts
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import type { AssistedPayload, Marketplace } from '@multimarket/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AdapterRegistry } from './adapters/adapter.registry';
import type { ListingForAdapter } from './adapters/adapter';

@Injectable()
export class PublishService {
  constructor(
    private prisma: PrismaService,
    private registry: AdapterRegistry,
    @InjectQueue('publish') private queue: Queue,
  ) {}

  private async ownedListing(userId: string, listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: { photos: { orderBy: { order: 'asc' } } },
    } as any);
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.userId !== userId) throw new ForbiddenException('Not your listing');
    return listing;
  }

  private toAdapterInput(listing: any): ListingForAdapter {
    return {
      title: listing.title,
      description: listing.description,
      priceCents: listing.priceCents,
      currency: listing.currency,
      category: listing.category,
      condition: listing.condition,
      brand: listing.brand ?? null,
      color: listing.color ?? null,
      size: listing.size ?? null,
      location: listing.location ?? null,
      photoUrls: (listing.photos ?? []).map((p: any) => p.url),
    };
  }

  async publishEverywhere(userId: string, listingId: string, marketplaces: Marketplace[]) {
    await this.ownedListing(userId, listingId);
    const created = [];
    for (const marketplace of marketplaces) {
      const adapter = this.registry.get(marketplace);
      const pub = await this.prisma.publication.upsert({
        where: { listingId_marketplace: { listingId, marketplace } },
        create: { listingId, marketplace, mode: adapter.mode, status: 'pending', error: null, externalId: null, externalUrl: null },
        update: { mode: adapter.mode, status: 'pending', error: null, externalId: null, externalUrl: null },
      });
      await this.queue.add('publish', { publicationId: pub.id });
      created.push(pub);
    }
    return created;
  }

  async processPublication(publicationId: string) {
    const pub = await this.prisma.publication.findUnique({ where: { id: publicationId } });
    if (!pub) throw new NotFoundException('Publication not found');
    const listing = await this.prisma.listing.findUnique({
      where: { id: pub.listingId },
      include: { photos: { orderBy: { order: 'asc' } } },
    } as any);
    const adapter = this.registry.get(pub.marketplace as Marketplace);
    try {
      const mapped = adapter.mapListing(this.toAdapterInput(listing));
      if (adapter.mode === 'auto' && adapter.publish) {
        const result = await adapter.publish(mapped);
        return this.prisma.publication.update({
          where: { id: publicationId },
          data: { status: 'published', externalId: result.externalId, externalUrl: result.externalUrl, publishedAt: new Date(), error: null },
        });
      }
      return this.prisma.publication.update({
        where: { id: publicationId },
        data: { status: 'awaiting_user', error: null },
      });
    } catch (err) {
      return this.prisma.publication.update({
        where: { id: publicationId },
        data: { status: 'failed', error: (err as Error).message },
      });
    }
  }

  async getPublications(userId: string, listingId: string) {
    await this.ownedListing(userId, listingId);
    return this.prisma.publication.findMany({ where: { listingId } });
  }

  async getAssisted(userId: string, publicationId: string): Promise<AssistedPayload> {
    const pub = await this.prisma.publication.findUnique({ where: { id: publicationId } });
    if (!pub) throw new NotFoundException('Publication not found');
    const listing = await this.ownedListing(userId, pub.listingId);
    const adapter = this.registry.get(pub.marketplace as Marketplace);
    if (!adapter.buildAssistedPayload) throw new NotFoundException('Not an assisted marketplace');
    return adapter.buildAssistedPayload(adapter.mapListing(this.toAdapterInput(listing)));
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @multimarket/api test publish.service`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/publish/publish.service.ts apps/api/src/publish/publish.service.spec.ts
git commit -m "feat(api): publish service (fan-out, process, assisted payload)"
```

---

## Task 8: BullMQ wiring — processor + module + app wiring

**Files:**
- Modify: `apps/api/package.json` (add `@nestjs/bullmq`, `bullmq`)
- Create: `apps/api/src/publish/publish.processor.ts`
- Create: `apps/api/src/publish/publish.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Add deps**

Add to `apps/api/package.json` dependencies:
```json
    "@nestjs/bullmq": "^10.2.0",
    "bullmq": "^5.12.0",
```
Run `pnpm install` from repo root (approve any new builds in `pnpm-workspace.yaml` `allowBuilds` if prompted — set them to `true` and re-run `pnpm install`).

- [ ] **Step 2: Create the processor**

`apps/api/src/publish/publish.processor.ts`:
```ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { PublishService } from './publish.service';

@Processor('publish')
export class PublishProcessor extends WorkerHost {
  constructor(private publish: PublishService) {
    super();
  }

  async process(job: Job<{ publicationId: string }>): Promise<void> {
    await this.publish.processPublication(job.data.publicationId);
  }
}
```

- [ ] **Step 3: Create the publish module**

`apps/api/src/publish/publish.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PublishService } from './publish.service';
import { PublishProcessor } from './publish.processor';
import { PublishController } from './publish.controller';
import { AdapterRegistry } from './adapters/adapter.registry';
import { EBAY_CLIENT, MockEbayClient } from './adapters/ebay.client';

@Module({
  imports: [BullModule.registerQueue({ name: 'publish' })],
  providers: [
    PublishService,
    PublishProcessor,
    AdapterRegistry,
    { provide: EBAY_CLIENT, useClass: MockEbayClient },
  ],
  controllers: [PublishController],
})
export class PublishModule {}
```

- [ ] **Step 4: Wire BullMQ root + PublishModule into app.module.ts**

Modify `apps/api/src/app.module.ts` (keep all existing imports; add BullModule.forRoot and PublishModule):
```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { StorageModule } from './storage/storage.module';
import { ListingsModule } from './listings/listings.module';
import { PublishModule } from './publish/publish.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? '127.0.0.1',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    }),
    PrismaModule,
    AuthModule,
    StorageModule,
    ListingsModule,
    PublishModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
```

Add to `apps/api/.env.example` AND `apps/api/.env`:
```
REDIS_HOST="127.0.0.1"
REDIS_PORT=6379
```

- [ ] **Step 5: Build**

Run: `pnpm --filter @multimarket/api build`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/publish/publish.processor.ts apps/api/src/publish/publish.module.ts apps/api/src/app.module.ts apps/api/package.json apps/api/.env.example pnpm-lock.yaml pnpm-workspace.yaml
git commit -m "feat(api): BullMQ publish queue, processor, module wiring"
```

---

## Task 9: Publish controller + SSE + e2e

**Files:**
- Create: `apps/api/src/publish/publish.controller.ts`
- Create: `apps/api/test/publish.e2e-spec.ts`

- [ ] **Step 1: Create the controller (REST + SSE)**

`apps/api/src/publish/publish.controller.ts`:
```ts
import { Body, Controller, Get, Param, Post, Req, Sse, UseGuards } from '@nestjs/common';
import { IsArray, IsIn } from 'class-validator';
import { interval, switchMap, map, takeWhile, type Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Marketplace } from '@multimarket/shared';
import { PublishService } from './publish.service';

class PublishDto {
  @IsArray()
  @IsIn(['EBAY', 'VINTED', 'LEBONCOIN'], { each: true })
  marketplaces!: Marketplace[];
}

const TERMINAL = ['published', 'failed', 'sold', 'expired', 'awaiting_user'];

@UseGuards(JwtAuthGuard)
@Controller()
export class PublishController {
  constructor(private publish: PublishService) {}

  @Post('listings/:id/publish')
  publishEverywhere(@Req() req: any, @Param('id') id: string, @Body() dto: PublishDto) {
    return this.publish.publishEverywhere(req.user.id, id, dto.marketplaces);
  }

  @Get('listings/:id/publications')
  list(@Req() req: any, @Param('id') id: string) {
    return this.publish.getPublications(req.user.id, id);
  }

  @Get('publications/:pubId/assisted')
  assisted(@Req() req: any, @Param('pubId') pubId: string) {
    return this.publish.getAssisted(req.user.id, pubId);
  }

  @Sse('listings/:id/publications/stream')
  stream(@Req() req: any, @Param('id') id: string): Observable<{ data: unknown }> {
    return interval(1000).pipe(
      switchMap(() => this.publish.getPublications(req.user.id, id)),
      map((pubs) => ({ data: pubs })),
      takeWhile(
        (msg) => !(msg.data as any[]).every((p) => TERMINAL.includes(p.status)),
        true,
      ),
    );
  }
}
```

- [ ] **Step 2: Write the e2e test**

`apps/api/test/publish.e2e-spec.ts`:
```ts
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
```

- [ ] **Step 3: Run unit + e2e**

Run: `pnpm --filter @multimarket/api test` (all unit tests pass)
Run: `pnpm --filter @multimarket/api test:e2e` (auth + listings + publish all pass; Postgres AND Redis must be up).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/publish/publish.controller.ts apps/api/test/publish.e2e-spec.ts
git commit -m "feat(api): publish controller (REST + SSE) + e2e"
```

---

## Task 10: Web — publish page

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`
- Create: `apps/web/src/lib/publish-client.test.ts`
- Create: `apps/web/src/app/listings/[id]/publish/page.tsx`

- [ ] **Step 1: Write the failing client test**

`apps/web/src/lib/publish-client.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { publishEverywhere } from './api-client';

describe('publishEverywhere', () => {
  beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

  it('POSTs selected marketplaces with the bearer token', async () => {
    localStorage.setItem('accessToken', 'tok');
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{ id: 'p1', marketplace: 'EBAY', mode: 'auto', status: 'pending' }]), { status: 201 }),
    );
    const res = await publishEverywhere('l1', ['EBAY']);
    expect(res[0].marketplace).toBe('EBAY');
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('http://localhost:4000/listings/l1/publish');
    expect((init as any).headers.Authorization).toBe('Bearer tok');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @multimarket/web test publish-client`
Expected: FAIL — `publishEverywhere` is not exported.

- [ ] **Step 3: Extend the api-client**

Add to the TOP import block of `apps/web/src/lib/api-client.ts` (extend the `@multimarket/shared` import) the names `Marketplace`, `Publication`, `AssistedPayload`, then append these functions at the end of the file:
```ts
export function publishEverywhere(listingId: string, marketplaces: Marketplace[]): Promise<Publication[]> {
  return authedJson<Publication[]>(`/listings/${listingId}/publish`, 'POST', { marketplaces });
}

export function getPublications(listingId: string): Promise<Publication[]> {
  return authedJson<Publication[]>(`/listings/${listingId}/publications`, 'GET');
}

export function getAssisted(publicationId: string): Promise<AssistedPayload> {
  return authedJson<AssistedPayload>(`/publications/${publicationId}/assisted`, 'GET');
}
```
The import line at the top becomes:
```ts
import type {
  AssistedPayload,
  AuthResponse,
  CreateListingInput,
  Listing,
  ListingPhoto,
  LoginInput,
  Marketplace,
  Publication,
  PresignResponse,
  RegisterInput,
  UpdateListingInput,
} from '@multimarket/shared';
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @multimarket/web test publish-client`
Expected: PASS. Also run `pnpm --filter @multimarket/web test` (4 tests total).

- [ ] **Step 5: Create the publish page**

`apps/web/src/app/listings/[id]/publish/page.tsx`:
```tsx
'use client';
import { use, useState } from 'react';
import { publishEverywhere, getPublications, getAssisted } from '@/lib/api-client';
import type { AssistedPayload, Marketplace, Publication } from '@multimarket/shared';

const ALL: Marketplace[] = ['EBAY', 'VINTED', 'LEBONCOIN'];

export default function PublishPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [selected, setSelected] = useState<Marketplace[]>(ALL);
  const [pubs, setPubs] = useState<Publication[]>([]);
  const [assisted, setAssisted] = useState<Record<string, AssistedPayload>>({});
  const [error, setError] = useState<string | null>(null);

  function toggle(m: Marketplace) {
    setSelected((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]));
  }

  async function refresh() {
    const list = await getPublications(id);
    setPubs(list);
    for (const p of list) {
      if (p.status === 'awaiting_user' && !assisted[p.id]) {
        setAssisted((a) => ({ ...a, [p.id]: undefined as unknown as AssistedPayload }));
        getAssisted(p.id).then((payload) => setAssisted((a) => ({ ...a, [p.id]: payload }))).catch(() => {});
      }
    }
  }

  async function onPublish() {
    setError(null);
    try {
      await publishEverywhere(id, selected);
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 800));
        await refresh();
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <main className="mx-auto mt-10 max-w-2xl p-6">
      <h1 className="text-xl font-semibold">Publier partout</h1>
      <div className="mt-4 flex gap-4">
        {ALL.map((m) => (
          <label key={m} className="flex items-center gap-2">
            <input type="checkbox" checked={selected.includes(m)} onChange={() => toggle(m)} />
            {m}
          </label>
        ))}
      </div>
      <button className="mt-4 rounded bg-blue-600 px-4 py-2 text-white" onClick={onPublish}>
        Publier partout
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <ul className="mt-6 flex flex-col gap-3">
        {pubs.map((p) => (
          <li key={p.id} className="rounded border p-3">
            <div className="flex justify-between">
              <span className="font-medium">{p.marketplace}</span>
              <span className="text-sm text-gray-500">{p.status}</span>
            </div>
            {p.status === 'published' && p.externalUrl && (
              <a className="text-sm text-blue-600 underline" href={p.externalUrl} target="_blank" rel="noreferrer">
                Voir l&apos;annonce
              </a>
            )}
            {p.status === 'failed' && <p className="text-sm text-red-600">{p.error}</p>}
            {p.status === 'awaiting_user' && assisted[p.id] && (
              <div className="mt-2 text-sm">
                <a className="text-blue-600 underline" href={assisted[p.id].deepLink} target="_blank" rel="noreferrer">
                  Ouvrir {p.marketplace} pour publier
                </a>
                <textarea className="mt-2 w-full rounded border p-2" rows={4} readOnly value={assisted[p.id].pasteText} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 6: Build the web app**

Run: `pnpm --filter @multimarket/web build`
Expected: exit 0, route `/listings/[id]/publish` listed.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/api-client.ts apps/web/src/lib/publish-client.test.ts "apps/web/src/app/listings/[id]/publish/page.tsx"
git commit -m "feat(web): publish-everywhere page with per-platform report + assisted hand-off"
```

---

## Done criteria for A3

- `docker compose up -d` provides Postgres + Redis (+ MinIO).
- `pnpm --filter @multimarket/api test` green (adds vinted/ebay adapter + publish service tests).
- `pnpm --filter @multimarket/api test:e2e` green (auth + listings + publish; eBay via mock client publishes, Vinted/Leboncoin go to awaiting_user).
- `pnpm --filter @multimarket/web test` green (adds publishEverywhere test).
- Both apps build. A user can click "Publier partout", see eBay auto-published (mock) and get assisted hand-off (deep link + paste text) for Vinted/Leboncoin.

**External dependency:** real eBay auto-publish requires swapping `MockEbayClient` for a real `EbayClient` implementation using the user's eBay Sandbox/production keyset (deferred until credentials are provided).

**Next plan:** A4 — Dashboard + PWA polish.
```
