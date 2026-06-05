# MultiMarket — Slice A (MVP Spine) — Design

**Date:** 2026-06-05
**Status:** Approved (pending final spec review)
**Author:** Brainstormed with user

---

## 1. Context & the central constraint

MultiMarket lets a seller create one product listing and publish it across several
European second-hand marketplaces (Vinted, Leboncoin, Wallapop, eBay, Facebook
Marketplace, Kleinanzeigen, Subito, …) from a single interface.

**Hard reality that shapes everything:** most of these marketplaces offer **no
legitimate third-party API for creating listings**. Reverse-engineering their
private APIs or driving headless browsers violates their Terms of Service, fights a
permanent battle against anti-bot systems (DataDome / Cloudflare), and risks getting
the user's account banned.

| Platform | Legitimate listing API? | Approach in MultiMarket |
|---|---|---|
| eBay | ✅ Sell / Inventory API | `auto` — real auto-publish |
| Facebook Marketplace | ⚠️ Only approved Commerce/Catalog (no C2C) | `assisted` (later slice) |
| Vinted | ❌ None | `assisted` |
| Leboncoin | ❌ None | `assisted` |
| Wallapop | ❌ None | `assisted` (later slice) |
| Kleinanzeigen | ❌ None | `assisted` (later slice) |
| Subito | ❌ None | `assisted` (later slice) |

### Chosen product model: **Compliant + Assisted**
- **`auto` mode** — auto-publish only where a real API exists (eBay, plus any partner
  APIs obtainable later).
- **`assisted` mode** — for the rest, MultiMarket maps the listing to the target
  platform's fields, generates paste-ready content + bundled photos + a deep link into
  that platform's "create listing" page, so the user posts in a couple of taps. Legal,
  reliable, shippable.

This is the explicit decision over "automation anyway." We will **not** build
ToS-violating automation.

---

## 2. Scope decomposition

The full CLAUDE.md vision is 6+ independent subsystems. It is decomposed into slices,
each with its own spec → plan → build cycle:

- **A — Core spine (THIS SPEC):** auth → create one unified listing with photos →
  "My listings" with statuses → publish to eBay (`auto`) + Vinted & Leboncoin
  (`assisted`) → minimal dashboard.
- **B — Adapter expansion:** more marketplaces, account-linking UI, session/status checks.
- **C — AI assistant:** descriptions, pricing suggestions, photo→object detection, SEO.
- **D — Sync intelligence:** sold-detection, cross-removal, notifications.
- **E — Monetization:** free vs premium limits, billing.
- **F — Native mobile:** native apps (PWA covers mobile initially).

---

## 3. Slice A — decisions summary

| Decision | Choice |
|---|---|
| Integration model | Compliant + Assisted |
| MVP marketplaces | eBay (`auto`), Vinted (`assisted`), Leboncoin (`assisted`) |
| Platform surface | Web PWA first (Next.js 15); native deferred to slice F |
| Backend topology | Separate NestJS API + Next.js PWA in a pnpm monorepo |
| Publish execution | Background job queue (BullMQ on Redis), one job per marketplace |
| Photo storage | Cloudflare R2 (S3-compatible, presigned uploads) |
| Auth scope | Email + password + JWT (access+refresh, argon2). MFA & social login deferred |

---

## 4. Architecture

pnpm **monorepo**:
- `apps/web` — Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui, configured
  as an installable **PWA**. Light/dark theme. Pure client of the API.
- `apps/api` — NestJS + Prisma (PostgreSQL) + BullMQ (Redis) for the publish queue.
  Houses all adapters and the publish pipeline server-side.
- `packages/shared` — shared TS types (the unified `Listing` shape, adapter interfaces,
  marketplace enums) consumed by both apps.

Local dev: Postgres + Redis via `docker-compose`. eBay calls hit **eBay Sandbox** in dev.

---

## 5. Data model (Prisma)

- **User** — `id, email, passwordHash, plan(free|premium), createdAt`
- **MarketplaceAccount** — `id, userId, marketplace(EBAY|VINTED|LEBONCOIN),
  authType(oauth|assisted), encryptedTokens?, status, connectedAt`.
  eBay stores **encrypted** OAuth tokens; Vinted/Leboncoin store **no credentials** —
  only a flag that the user has that account.
- **Listing** — `id, userId, title, description, priceCents, currency, category,
  condition, brand, color, size, location, shippingOptions(json), status, createdAt,
  updatedAt`
- **ListingPhoto** — `id, listingId, url, order` (≤20 per listing)
- **Publication** — one row per (listing × marketplace):
  `id, listingId, marketplace, mode(auto|assisted),
  status(pending|awaiting_user|published|failed|sold|expired),
  externalId?, externalUrl?, error?, publishedAt?`.
  Powers the per-platform report and the "My listings" status column.

---

## 6. The Adapter model (core abstraction)

One interface, two implementation styles:

```ts
interface MarketplaceAdapter {
  id: 'EBAY' | 'VINTED' | 'LEBONCOIN'
  mode: 'auto' | 'assisted'
  mapListing(listing: Listing): MappedListing   // category + condition mapping, title/field limits
  publish?(account, mapped): Promise<PublishResult>      // auto only (eBay)
  buildAssistedPayload?(mapped): AssistedPayload         // assisted only (Vinted/Leboncoin)
}
```

- **eBay adapter (`auto`)** — OAuth2 connect; Inventory API flow
  `createOrReplaceInventoryItem` → `createOffer` → `publishOffer`; returns the live URL.
  Category resolved via eBay taxonomy / a maintained category map. Condition enum mapped.
- **Vinted / Leboncoin adapters (`assisted`)** — `buildAssistedPayload` returns:
  1. the listing mapped to that platform's fields + limits,
  2. a copy-paste-ready title + description block,
  3. the photos bundled for download,
  4. a deep link to that platform's "create listing" page.

`MappedListing`, `PublishResult`, and `AssistedPayload` are defined in
`packages/shared` so web and api agree on shape.

---

## 7. Publish flow ("Publier partout")

1. User selects target marketplaces → API creates `Publication` rows (`pending`) and
   enqueues **one BullMQ job per marketplace**.
2. Worker handles each job independently, with retries on transient failure:
   - **auto (eBay):** call the Sell API → `published` + `externalUrl`, or `failed` + `error`.
   - **assisted:** build payload → `awaiting_user`; the PWA drives the hand-off.
3. **Assisted hand-off in the PWA:**
   - **Mobile:** Web Share API pushes photos + caption straight into the
     Vinted/Leboncoin app share sheet.
   - **Desktop:** fall back to copy-paste + download-photos + deep-link.
   - User taps "I posted it" (optionally pastes the live URL) → `published`.
4. The PWA subscribes to status via **SSE** and renders the per-platform success/error
   report.

---

## 8. Auth, storage, dashboard

- **Auth:** email + password, **JWT** (access + refresh), **argon2** hashing.
  MFA and social/OAuth *login* deferred. (eBay OAuth is account-connection, not login,
  and IS in scope.)
- **Storage:** **Cloudflare R2** via **presigned upload URLs**; the PWA uploads photos
  directly. Local dev via MinIO. ≤20 photos per listing.
- **Dashboard (minimal):** active-listings count, counts by status, publish success-rate.
  Revenue and advanced stats are a later slice.

---

## 9. Testing strategy

TDD throughout:
- Unit tests for each adapter's `mapListing` / payload-building logic (category &
  condition mapping, field limits).
- Publish pipeline tested against a **fake adapter** (covers fan-out, retries,
  per-platform status transitions).
- Auth unit/e2e (register, login, refresh, guard).
- eBay adapter unit-tested against a **mocked** eBay client; a manual eBay **Sandbox**
  integration test documented in the repo.

---

## 10. Explicitly OUT of slice A

AI assistant, sold-detection / cross-platform sync, push notifications, premium-limit
enforcement, native mobile apps, the other four marketplaces, in-app messaging.
The `plan` field exists on `User` but is **not** gated in slice A.

---

## 11. Risks & open items

- **eBay API onboarding:** requires an eBay developer account + app keys (Sandbox first,
  then production keyset which needs eBay review). Flagged as an external dependency.
- **Assisted UX validation:** the Web Share API hand-off should be validated on real
  Android/iOS devices early — share-target behavior varies by browser/OS.
- **Deep-link stability:** Vinted/Leboncoin "create listing" URLs are not contractual and
  may change; adapters must isolate these so they're cheap to update.
- **Token encryption:** eBay OAuth tokens must be encrypted at rest (KMS or app-level
  envelope encryption); key management approach to be confirmed in the implementation plan.
