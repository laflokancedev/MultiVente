# MultiMarket A4 — Dashboard + PWA polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the assisted hand-off (Web Share + "I posted it"), add a per-user dashboard, and make publish status live via SSE behind a shared app shell (nav + light/dark theme).

**Architecture:** Three lots on top of A3. Lot 1 adds a user-triggered `awaiting_user → published` transition (`PATCH /publications/:id/posted`) plus a browser Web Share / download helper. Lot 2 adds a `DashboardService` that aggregates the user's listings + publications into a `DashboardStats` shape served at `GET /dashboard`. Lot 3 extends `JwtStrategy` to read the JWT from `?access_token` so the native `EventSource` can consume the existing A3 SSE stream, enriches the listings list with publication badges, and adds a `<NavBar/>` + `<ThemeToggle/>` shell.

**Tech Stack:** NestJS 10, Prisma 5 (`groupBy`), Jest + supertest, Next.js 15 (App Router) + Vitest, Tailwind (`darkMode: 'class'`, already configured), Web Share API / `EventSource`.

---

## File Structure

```
packages/shared/src/
  dashboard.ts                         # DashboardStats, MarketplaceStat (create)
  listing.ts                           # + optional publications field (modify)
  index.ts                             # export dashboard (modify)
apps/api/src/
  publish/publish.service.ts           # + markPosted (modify)
  publish/publish.service.spec.ts      # + markPosted tests (modify)
  publish/publish.controller.ts        # + PATCH posted (modify)
  dashboard/dashboard.service.ts       # aggregation (create)
  dashboard/dashboard.service.spec.ts  # (create)
  dashboard/dashboard.controller.ts    # GET /dashboard (create)
  dashboard/dashboard.module.ts        # (create)
  auth/jwt.strategy.ts                 # header OR ?access_token (modify)
  listings/listings.service.ts         # include publications in listForUser (modify)
  app.module.ts                        # + DashboardModule (modify)
  test/publish.e2e-spec.ts             # + markPosted + dashboard + query-auth (modify)
apps/web/src/
  lib/api-client.ts                    # + markPosted, getDashboard (modify)
  lib/share.ts                         # Web Share + download helper (create)
  lib/share.test.ts                    # (create)
  lib/a4-client.test.ts                # markPosted + getDashboard (create)
  lib/format.ts                        # successRateLabel helper (create)
  lib/format.test.ts                   # (create)
  lib/theme.ts                         # theme read/apply helpers (create)
  lib/theme.test.ts                    # (create)
  app/dashboard/page.tsx               # dashboard page (create)
  app/listings/[id]/publish/page.tsx   # SSE + hand-off rewrite (modify)
  app/listings/page.tsx                # status badges + dark (modify)
  app/layout.tsx                       # nav + anti-flash theme script (modify)
  components/nav-bar.tsx               # (create)
  components/theme-toggle.tsx          # (create)
```

---

## Task 1: Shared types (dashboard + listing.publications)

**Files:**
- Create: `packages/shared/src/dashboard.ts`
- Modify: `packages/shared/src/listing.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create the dashboard types**

`packages/shared/src/dashboard.ts`:
```ts
import type { Marketplace, PublicationStatus } from './publish';

export interface MarketplaceStat {
  marketplace: Marketplace;
  published: number;
  awaiting_user: number;
  failed: number;
  pending: number;
}

export interface DashboardStats {
  activeListings: number;
  publicationsByStatus: Record<PublicationStatus, number>;
  successRate: number | null; // published / (published + failed); null when denominator is 0
  byMarketplace: MarketplaceStat[]; // always EBAY, VINTED, LEBONCOIN
}
```

- [ ] **Step 2: Add the optional publications field to Listing**

In `packages/shared/src/listing.ts`, add an import at the very top of the file:
```ts
import type { Marketplace, PublicationStatus } from './publish';
```
Then, inside the `Listing` interface, add this field right after `photos: ListingPhoto[];`:
```ts
  publications?: { marketplace: Marketplace; status: PublicationStatus }[];
```

- [ ] **Step 3: Re-export dashboard types**

`packages/shared/src/index.ts` becomes:
```ts
export * from './auth';
export * from './listing';
export * from './publish';
export * from './dashboard';
```

- [ ] **Step 4: Verify the shared edits compile in a consumer**

Run: `pnpm --filter @multimarket/api build`
Expected: exit 0 (the api imports `Listing`; the build type-checks the shared source).

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): dashboard stats types + listing.publications"
```

---

## Task 2: API — markPosted (user confirms an assisted publication) (TDD)

**Files:**
- Modify: `apps/api/src/publish/publish.service.spec.ts`
- Modify: `apps/api/src/publish/publish.service.ts`
- Modify: `apps/api/src/publish/publish.controller.ts`

- [ ] **Step 1: Add the failing tests**

In `apps/api/src/publish/publish.service.spec.ts`, add these three tests inside the
`describe('PublishService', ...)` block (after the existing `it(...)` blocks, before the
closing `});`):
```ts
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @multimarket/api test publish.service`
Expected: FAIL — `svc.markPosted is not a function` (TS: property 'markPosted' does not exist).

- [ ] **Step 3: Implement markPosted**

In `apps/api/src/publish/publish.service.ts`, change the first import line to add
`ConflictException`:
```ts
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
```
Then add this method inside the `PublishService` class (e.g. after `getAssisted`):
```ts
  async markPosted(userId: string, publicationId: string, externalUrl?: string) {
    const pub = await this.prisma.publication.findUnique({ where: { id: publicationId } });
    if (!pub) throw new NotFoundException('Publication not found');
    await this.ownedListing(userId, pub.listingId); // throws 404/403
    if (pub.status !== 'awaiting_user') {
      throw new ConflictException('Publication is not awaiting user action');
    }
    return this.prisma.publication.update({
      where: { id: publicationId },
      data: { status: 'published', externalUrl: externalUrl ?? null, publishedAt: new Date(), error: null },
    });
  }
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm --filter @multimarket/api test publish.service`
Expected: PASS (7 tests total).

- [ ] **Step 5: Add the controller endpoint**

Replace the whole `apps/api/src/publish/publish.controller.ts` with:
```ts
import { Body, Controller, Get, Param, Patch, Post, Req, Sse, UseGuards } from '@nestjs/common';
import { IsArray, IsIn, IsOptional, IsUrl } from 'class-validator';
import { interval, switchMap, map, takeWhile, type Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Marketplace } from '@multimarket/shared';
import { PublishService } from './publish.service';

class PublishDto {
  @IsArray()
  @IsIn(['EBAY', 'VINTED', 'LEBONCOIN'], { each: true })
  marketplaces!: Marketplace[];
}

class MarkPostedDto {
  @IsOptional()
  @IsUrl()
  externalUrl?: string;
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

  @Patch('publications/:pubId/posted')
  posted(@Req() req: any, @Param('pubId') pubId: string, @Body() dto: MarkPostedDto) {
    return this.publish.markPosted(req.user.id, pubId, dto.externalUrl);
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

- [ ] **Step 6: Build**

Run: `pnpm --filter @multimarket/api build`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/publish/publish.service.ts apps/api/src/publish/publish.service.spec.ts apps/api/src/publish/publish.controller.ts
git commit -m "feat(api): mark assisted publication as posted (awaiting_user -> published)"
```

---

## Task 3: API — Dashboard stats (TDD)

**Files:**
- Create: `apps/api/src/dashboard/dashboard.service.spec.ts`
- Create: `apps/api/src/dashboard/dashboard.service.ts`
- Create: `apps/api/src/dashboard/dashboard.controller.ts`
- Create: `apps/api/src/dashboard/dashboard.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/dashboard/dashboard.service.spec.ts`:
```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @multimarket/api test dashboard.service`
Expected: FAIL — cannot find module `./dashboard.service`.

- [ ] **Step 3: Implement the service**

`apps/api/src/dashboard/dashboard.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import type { DashboardStats, Marketplace } from '@multimarket/shared';
import { PrismaService } from '../prisma/prisma.service';

const STATUSES = ['pending', 'awaiting_user', 'published', 'failed', 'sold', 'expired'] as const;
const MARKETPLACES: Marketplace[] = ['EBAY', 'VINTED', 'LEBONCOIN'];

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getStats(userId: string): Promise<DashboardStats> {
    const where = { listing: { userId } };

    const activeListings = await this.prisma.listing.count({
      where: { userId, status: { notIn: ['sold', 'archived'] } } as any,
    });

    const byStatus: any[] = await this.prisma.publication.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    } as any);

    const byMkt: any[] = await this.prisma.publication.groupBy({
      by: ['marketplace', 'status'],
      where,
      _count: { _all: true },
    } as any);

    const publicationsByStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as DashboardStats['publicationsByStatus'];
    for (const row of byStatus) publicationsByStatus[row.status as keyof typeof publicationsByStatus] = row._count._all;

    const denom = publicationsByStatus.published + publicationsByStatus.failed;
    const successRate = denom === 0 ? null : publicationsByStatus.published / denom;

    const byMarketplace = MARKETPLACES.map((marketplace) => {
      const block = { marketplace, published: 0, awaiting_user: 0, failed: 0, pending: 0 };
      for (const row of byMkt) {
        if (row.marketplace !== marketplace) continue;
        if (row.status in block) (block as any)[row.status] = row._count._all;
      }
      return block;
    });

    return { activeListings, publicationsByStatus, successRate, byMarketplace };
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @multimarket/api test dashboard.service`
Expected: PASS (2 tests).

- [ ] **Step 5: Create the controller**

`apps/api/src/dashboard/dashboard.controller.ts`:
```ts
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DashboardService } from './dashboard.service';

@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private dashboard: DashboardService) {}

  @Get()
  stats(@Req() req: any) {
    return this.dashboard.getStats(req.user.id);
  }
}
```

- [ ] **Step 6: Create the module**

`apps/api/src/dashboard/dashboard.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
  providers: [DashboardService],
  controllers: [DashboardController],
})
export class DashboardModule {}
```

- [ ] **Step 7: Wire DashboardModule into app.module.ts**

In `apps/api/src/app.module.ts`, add the import near the other module imports:
```ts
import { DashboardModule } from './dashboard/dashboard.module';
```
and add `DashboardModule` to the `imports` array (after `PublishModule`).

- [ ] **Step 8: Build**

Run: `pnpm --filter @multimarket/api build`
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/dashboard apps/api/src/app.module.ts
git commit -m "feat(api): dashboard stats service + GET /dashboard"
```

---

## Task 4: API — SSE query-param auth + listings publication badges

**Files:**
- Modify: `apps/api/src/auth/jwt.strategy.ts`
- Modify: `apps/api/src/listings/listings.service.ts`

- [ ] **Step 1: Let JwtStrategy read the token from the header OR `?access_token`**

Replace the whole `apps/api/src/auth/jwt.strategy.ts` with:
```ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        ExtractJwt.fromUrlQueryParameter('access_token'),
      ]),
      secretOrKey: process.env.JWT_ACCESS_SECRET as string,
    });
  }

  async validate(payload: { sub: string; email: string }) {
    return { id: payload.sub, email: payload.email };
  }
}
```

- [ ] **Step 2: Include publications in the listings list**

In `apps/api/src/listings/listings.service.ts`, replace the `listForUser` method:
```ts
  listForUser(userId: string) {
    return this.prisma.listing.findMany({
      where: { userId },
      include: { publications: { select: { marketplace: true, status: true } } },
    });
  }
```

- [ ] **Step 3: Run the affected unit tests + build**

Run: `pnpm --filter @multimarket/api test listings.service`
Expected: PASS (the spec's `findMany` mock ignores `include`).
Run: `pnpm --filter @multimarket/api build`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/auth/jwt.strategy.ts apps/api/src/listings/listings.service.ts
git commit -m "feat(api): SSE token via query param + publications on listings list"
```

---

## Task 5: API — e2e (markPosted + dashboard + query-param auth)

**Files:**
- Modify: `apps/api/test/publish.e2e-spec.ts`

- [ ] **Step 1: Add the e2e cases**

In `apps/api/test/publish.e2e-spec.ts`, add these three `it(...)` blocks inside the
`describe('Publish (e2e)', ...)` block, immediately after the existing
`it('publishes everywhere and resolves per-platform statuses', ...)` test (so the
publications already exist):
```ts
  it('lets the user mark an assisted publication as posted', async () => {
    const list = await request(app.getHttpServer())
      .get(`/listings/${listingId}/publications`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const vinted = list.body.find((p: any) => p.marketplace === 'VINTED');
    expect(vinted.status).toBe('awaiting_user');

    const res = await request(app.getHttpServer())
      .patch(`/publications/${vinted.id}/posted`)
      .set('Authorization', `Bearer ${token}`)
      .send({ externalUrl: 'https://www.vinted.fr/items/999' })
      .expect(200);
    expect(res.body.status).toBe('published');
    expect(res.body.externalUrl).toBe('https://www.vinted.fr/items/999');
  });

  it('returns dashboard stats for the user', async () => {
    const res = await request(app.getHttpServer())
      .get('/dashboard')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.activeListings).toBeGreaterThanOrEqual(1);
    expect(res.body.byMarketplace).toHaveLength(3);
    expect(res.body).toHaveProperty('publicationsByStatus');
  });

  it('authenticates via the access_token query param (for SSE)', async () => {
    await request(app.getHttpServer())
      .get(`/listings/${listingId}/publications?access_token=${token}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/listings/${listingId}/publications`)
      .expect(401);
  });
```

- [ ] **Step 2: Run unit + e2e (Postgres AND Redis must be up)**

Run: `pnpm --filter @multimarket/api test`
Expected: all unit suites PASS.
Run: `pnpm --filter @multimarket/api test:e2e`
Expected: auth + listings + publish all PASS (publish now has the 3 new cases).

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/publish.e2e-spec.ts
git commit -m "test(api): e2e for mark-posted, dashboard, and SSE query-param auth"
```

---

## Task 6: Web — api-client additions + share helper (TDD)

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`
- Create: `apps/web/src/lib/a4-client.test.ts`
- Create: `apps/web/src/lib/share.ts`
- Create: `apps/web/src/lib/share.test.ts`

- [ ] **Step 1: Write the failing api-client test**

`apps/web/src/lib/a4-client.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { markPosted, getDashboard } from './api-client';

describe('A4 api-client', () => {
  beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

  it('PATCHes mark-posted with the optional url and bearer token', async () => {
    localStorage.setItem('accessToken', 'tok');
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'p1', status: 'published' }), { status: 200 }),
    );
    const res = await markPosted('p1', 'https://www.vinted.fr/items/9');
    expect(res.status).toBe('published');
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('http://localhost:4000/publications/p1/posted');
    expect((init as any).method).toBe('PATCH');
    expect(JSON.parse((init as any).body).externalUrl).toBe('https://www.vinted.fr/items/9');
    expect((init as any).headers.Authorization).toBe('Bearer tok');
  });

  it('GETs the dashboard with the bearer token', async () => {
    localStorage.setItem('accessToken', 'tok');
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ activeListings: 3, publicationsByStatus: {}, successRate: null, byMarketplace: [] }), { status: 200 }),
    );
    const res = await getDashboard();
    expect(res.activeListings).toBe(3);
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('http://localhost:4000/dashboard');
    expect((init as any).headers.Authorization).toBe('Bearer tok');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @multimarket/web test a4-client`
Expected: FAIL — `markPosted` / `getDashboard` are not exported.

- [ ] **Step 3: Extend the api-client**

In `apps/web/src/lib/api-client.ts`, extend the `@multimarket/shared` import block to add
`DashboardStats` (alphabetically near the top, alongside the existing names):
```ts
  DashboardStats,
```
Then append at the end of the file:
```ts
export function markPosted(publicationId: string, externalUrl?: string): Promise<Publication> {
  return authedJson<Publication>(`/publications/${publicationId}/posted`, 'PATCH', externalUrl ? { externalUrl } : {});
}

export function getDashboard(): Promise<DashboardStats> {
  return authedJson<DashboardStats>('/dashboard', 'GET');
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @multimarket/web test a4-client`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing share-helper test**

`apps/web/src/lib/share.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shareAssisted } from './share';
import type { AssistedPayload } from '@multimarket/shared';

const payload: AssistedPayload = {
  marketplace: 'VINTED',
  title: 'Veste',
  pasteText: 'Veste\n\nbelle veste',
  deepLink: 'https://www.vinted.fr/items/new',
  photoUrls: ['http://x/1.jpg'],
};

describe('shareAssisted', () => {
  beforeEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('returns "unsupported" when navigator.share is absent', async () => {
    vi.stubGlobal('navigator', {});
    expect(await shareAssisted(payload)).toBe('unsupported');
  });

  it('shares files when canShare({files}) is true', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share, canShare: () => true });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Blob(['x'], { type: 'image/jpeg' })));
    expect(await shareAssisted(payload)).toBe('shared');
    const arg = share.mock.calls[0][0];
    expect(arg.files).toHaveLength(1);
    expect(arg.url).toContain('vinted');
  });

  it('falls back to text share when files are not shareable', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share, canShare: () => false });
    expect(await shareAssisted(payload)).toBe('shared-text');
    expect(share.mock.calls[0][0].files).toBeUndefined();
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm --filter @multimarket/web test share`
Expected: FAIL — cannot find module `./share`.

- [ ] **Step 7: Implement the share helper**

`apps/web/src/lib/share.ts`:
```ts
import type { AssistedPayload } from '@multimarket/shared';

export type ShareOutcome = 'shared' | 'shared-text' | 'unsupported';

async function fetchAsFiles(urls: string[]): Promise<File[]> {
  const files: File[] = [];
  for (let i = 0; i < urls.length; i++) {
    const res = await fetch(urls[i]);
    const blob = await res.blob();
    files.push(new File([blob], `photo-${i + 1}.jpg`, { type: blob.type || 'image/jpeg' }));
  }
  return files;
}

export async function shareAssisted(payload: AssistedPayload): Promise<ShareOutcome> {
  const nav = navigator as Navigator & { canShare?: (data?: unknown) => boolean };
  if (typeof nav.share !== 'function') return 'unsupported';
  try {
    const files = await fetchAsFiles(payload.photoUrls);
    if (files.length > 0 && nav.canShare?.({ files })) {
      await nav.share({ files, text: payload.pasteText, url: payload.deepLink } as ShareData);
      return 'shared';
    }
  } catch {
    // fall through to text-only share
  }
  try {
    await nav.share({ text: payload.pasteText, url: payload.deepLink });
    return 'shared-text';
  } catch {
    return 'unsupported';
  }
}

export async function downloadPhotos(urls: string[]): Promise<void> {
  for (let i = 0; i < urls.length; i++) {
    const res = await fetch(urls[i]);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = `photo-${i + 1}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  }
}
```

- [ ] **Step 8: Run to verify it passes + full web test run**

Run: `pnpm --filter @multimarket/web test share`
Expected: PASS (3 tests).
Run: `pnpm --filter @multimarket/web test`
Expected: all web tests PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/api-client.ts apps/web/src/lib/a4-client.test.ts apps/web/src/lib/share.ts apps/web/src/lib/share.test.ts
git commit -m "feat(web): markPosted/getDashboard clients + Web Share helper"
```

---

## Task 7: Web — dashboard page

**Files:**
- Create: `apps/web/src/lib/format.ts`
- Create: `apps/web/src/lib/format.test.ts`
- Create: `apps/web/src/app/dashboard/page.tsx`

- [ ] **Step 1: Write the failing format-helper test**

`apps/web/src/lib/format.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { successRateLabel } from './format';

describe('successRateLabel', () => {
  it('renders a dash when the rate is null', () => {
    expect(successRateLabel(null)).toBe('—');
  });
  it('rounds the rate to a whole percentage', () => {
    expect(successRateLabel(2 / 3)).toBe('67%');
    expect(successRateLabel(1)).toBe('100%');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @multimarket/web test format`
Expected: FAIL — cannot find module `./format`.

- [ ] **Step 3: Implement the helper**

`apps/web/src/lib/format.ts`:
```ts
export function successRateLabel(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @multimarket/web test format`
Expected: PASS (2 tests).

- [ ] **Step 5: Create the dashboard page**

`apps/web/src/app/dashboard/page.tsx`:
```tsx
'use client';
import { useEffect, useState } from 'react';
import { getDashboard } from '@/lib/api-client';
import { successRateLabel } from '@/lib/format';
import type { DashboardStats } from '@multimarket/shared';

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded border p-4 dark:border-gray-700">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDashboard().then(setStats).catch((e) => setError((e as Error).message));
  }, []);

  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!stats) return <p className="p-6">Chargement…</p>;

  const rate = successRateLabel(stats.successRate);

  return (
    <main className="mx-auto mt-10 max-w-3xl p-6">
      <h1 className="text-xl font-semibold">Tableau de bord</h1>
      <section className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Annonces actives" value={stats.activeListings} />
        <Stat label="Publiées" value={stats.publicationsByStatus.published} />
        <Stat label="En attente" value={stats.publicationsByStatus.awaiting_user} />
        <Stat label="Échecs" value={stats.publicationsByStatus.failed} />
        <Stat label="En file" value={stats.publicationsByStatus.pending} />
        <Stat label="Taux de succès" value={rate} />
      </section>

      <h2 className="mt-8 text-lg font-medium">Par marketplace</h2>
      <section className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.byMarketplace.map((m) => (
          <div key={m.marketplace} className="rounded border p-4 dark:border-gray-700">
            <h3 className="font-medium">{m.marketplace}</h3>
            <ul className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              <li>Publiées : {m.published}</li>
              <li>En attente : {m.awaiting_user}</li>
              <li>Échecs : {m.failed}</li>
              <li>En file : {m.pending}</li>
            </ul>
          </div>
        ))}
      </section>
    </main>
  );
}
```

- [ ] **Step 6: Build**

Run: `pnpm --filter @multimarket/web build`
Expected: exit 0, route `/dashboard` listed.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/format.ts apps/web/src/lib/format.test.ts apps/web/src/app/dashboard/page.tsx
git commit -m "feat(web): dashboard page (global + per-marketplace stats)"
```

---

## Task 8: Web — publish page (SSE live status + hand-off)

**Files:**
- Modify: `apps/web/src/app/listings/[id]/publish/page.tsx`

- [ ] **Step 1: Rewrite the publish page**

Replace the whole `apps/web/src/app/listings/[id]/publish/page.tsx` with:
```tsx
'use client';
import { use, useEffect, useRef, useState } from 'react';
import { publishEverywhere, getPublications, getAssisted, markPosted } from '@/lib/api-client';
import { shareAssisted, downloadPhotos } from '@/lib/share';
import type { AssistedPayload, Marketplace, Publication } from '@multimarket/shared';

const ALL: Marketplace[] = ['EBAY', 'VINTED', 'LEBONCOIN'];
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const TERMINAL = ['published', 'failed', 'sold', 'expired', 'awaiting_user'];

export default function PublishPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [selected, setSelected] = useState<Marketplace[]>(ALL);
  const [pubs, setPubs] = useState<Publication[]>([]);
  const [assisted, setAssisted] = useState<Record<string, AssistedPayload>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
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
          <li key={p.id} className="rounded border p-3 dark:border-gray-700">
            <div className="flex justify-between">
              <span className="font-medium">{p.marketplace}</span>
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
                    Ouvrir {p.marketplace}
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

- [ ] **Step 2: Build**

Run: `pnpm --filter @multimarket/web build`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/listings/[id]/publish/page.tsx"
git commit -m "feat(web): live SSE status + Web Share/I-posted hand-off on publish page"
```

---

## Task 9: Web — app shell (nav + theme) + listings status badges

**Files:**
- Create: `apps/web/src/lib/theme.ts`
- Create: `apps/web/src/lib/theme.test.ts`
- Create: `apps/web/src/components/theme-toggle.tsx`
- Create: `apps/web/src/components/nav-bar.tsx`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/listings/page.tsx`

- [ ] **Step 1: Write the failing theme-helper test**

`apps/web/src/lib/theme.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getStoredTheme, isDark, applyTheme } from './theme';

describe('theme', () => {
  beforeEach(() => { localStorage.clear(); document.documentElement.className = ''; });

  it('reads the stored theme preference', () => {
    expect(getStoredTheme()).toBeNull();
    localStorage.setItem('theme', 'dark');
    expect(getStoredTheme()).toBe('dark');
    expect(isDark()).toBe(true);
  });

  it('applyTheme toggles the dark class and persists the choice', () => {
    applyTheme(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('dark');
    applyTheme(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('theme')).toBe('light');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @multimarket/web test theme`
Expected: FAIL — cannot find module `./theme`.

- [ ] **Step 3: Implement the theme helper**

`apps/web/src/lib/theme.ts`:
```ts
const KEY = 'theme';

export function prefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
}

export function getStoredTheme(): 'dark' | 'light' | null {
  const t = localStorage.getItem(KEY);
  return t === 'dark' || t === 'light' ? t : null;
}

export function isDark(): boolean {
  const stored = getStoredTheme();
  return stored ? stored === 'dark' : prefersDark();
}

export function applyTheme(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark);
  localStorage.setItem(KEY, dark ? 'dark' : 'light');
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @multimarket/web test theme`
Expected: PASS (2 tests).

- [ ] **Step 5: Create the theme toggle**

`apps/web/src/components/theme-toggle.tsx`:
```tsx
'use client';
import { useEffect, useState } from 'react';
import { applyTheme } from '@/lib/theme';

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    applyTheme(next);
  }

  return (
    <button onClick={toggle} aria-label="Basculer le thème" className="rounded border px-2 py-1 dark:border-gray-700">
      {dark ? '☀️' : '🌙'}
    </button>
  );
}
```

- [ ] **Step 6: Create the nav bar**

`apps/web/src/components/nav-bar.tsx`:
```tsx
'use client';
import { useEffect, useState } from 'react';
import { ThemeToggle } from './theme-toggle';

export function NavBar() {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setAuthed(!!localStorage.getItem('accessToken'));
  }, []);

  function logout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    window.location.href = '/login';
  }

  return (
    <nav className="flex items-center justify-between border-b px-4 py-3 dark:border-gray-700">
      <a href="/" className="font-semibold">MultiMarket</a>
      <div className="flex items-center gap-4 text-sm">
        {authed && (
          <>
            <a href="/dashboard">Tableau de bord</a>
            <a href="/listings">Mes annonces</a>
            <a href="/listings/new">+ Nouvelle</a>
            <button onClick={logout} className="text-red-600">Déconnexion</button>
          </>
        )}
        <ThemeToggle />
      </div>
    </nav>
  );
}
```

- [ ] **Step 7: Wire the nav + anti-flash theme script into the layout**

Replace the whole `apps/web/src/app/layout.tsx` with:
```tsx
import './globals.css';
import type { Metadata } from 'next';
import { NavBar } from '@/components/nav-bar';

export const metadata: Metadata = {
  title: 'MultiMarket',
  manifest: '/manifest.webmanifest',
};

const themeScript = `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
        <NavBar />
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 8: Add publication-status badges to the listings page**

Replace the whole `apps/web/src/app/listings/page.tsx` with:
```tsx
'use client';
import { useEffect, useState } from 'react';
import { listListings } from '@/lib/api-client';
import type { Listing, PublicationStatus } from '@multimarket/shared';

const ICON: Record<PublicationStatus, string> = {
  pending: '⏳',
  awaiting_user: '✋',
  published: '✓',
  failed: '✕',
  sold: '€',
  expired: '⌛',
};

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
        <p className="text-gray-500 dark:text-gray-400">Aucune annonce pour l&apos;instant.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {listings.map((l) => (
            <li key={l.id} className="rounded border p-3 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <a className="font-medium hover:underline" href={`/listings/${l.id}/publish`}>{l.title}</a>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {(l.priceCents / 100).toFixed(2)} {l.currency} · {l.status}
                </span>
              </div>
              {l.publications && l.publications.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {l.publications.map((p) => (
                    <span key={p.marketplace} className="rounded bg-gray-100 px-2 py-0.5 dark:bg-gray-800">
                      {p.marketplace} {ICON[p.status]}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 9: Build**

Run: `pnpm --filter @multimarket/web build`
Expected: exit 0, routes `/dashboard`, `/listings`, `/listings/[id]/publish` listed.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/lib/theme.ts apps/web/src/lib/theme.test.ts apps/web/src/components/theme-toggle.tsx apps/web/src/components/nav-bar.tsx apps/web/src/app/layout.tsx apps/web/src/app/listings/page.tsx
git commit -m "feat(web): app shell (nav + light/dark theme) + listing status badges"
```

---

## Task 10: Full verification

**Files:** none (verification only).

- [ ] **Step 1: API unit tests**

Run: `pnpm --filter @multimarket/api test`
Expected: all suites PASS (adds dashboard.service + markPosted).

- [ ] **Step 2: API e2e (Postgres + Redis up)**

Run: `pnpm --filter @multimarket/api test:e2e`
Expected: auth + listings + publish all PASS.

- [ ] **Step 3: Web tests**

Run: `pnpm --filter @multimarket/web test`
Expected: all PASS (adds a4-client + share).

- [ ] **Step 4: Builds**

Run: `pnpm --filter @multimarket/api build` (exit 0)
Run: `pnpm --filter @multimarket/web build` (exit 0)

---

## Done criteria for A4

- **Lot 1:** an assisted publication can be confirmed posted (`PATCH /publications/:id/posted`), flipping `awaiting_user → published`; the publish page offers Web Share (photos+text+link) with copy/download/deep-link fallback and an "I posted it" action.
- **Lot 2:** `GET /dashboard` returns active-listings, publications-by-status, success-rate (`published/(published+failed)`, `awaiting_user` excluded, `null` when no published/failed) and a per-marketplace breakdown; `/dashboard` renders them.
- **Lot 3:** the publish page consumes the SSE stream via `EventSource` (token via `?access_token`); the listings list shows per-listing publication badges; a shared nav bar + light/dark theme toggle wrap every page.
- All unit + e2e + web tests green; both apps build.

**Out of scope (deferred):** PWA installability/offline (manifest icons + service worker), live SSE on the listings list, graphs/time-ranges/revenue metrics.

**Next:** future Slice A follow-ups or Slice B (adapter expansion) per the Slice A decomposition.
