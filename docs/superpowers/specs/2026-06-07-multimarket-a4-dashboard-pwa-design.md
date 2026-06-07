# MultiMarket — A4 (Dashboard + PWA polish) — Design

**Date:** 2026-06-07
**Status:** Approved (pending final spec review)
**Author:** Brainstormed with user
**Builds on:** Slice A design (`2026-06-05-multimarket-slice-a-design.md`) + A3 (adapters + publish queue + SSE).

---

## 1. Goal

Close the gaps left after A3 so the "publier partout" loop is usable end-to-end and
the seller has a place to see how things are going:

1. **Finish the assisted hand-off** — let the user actually push an assisted listing
   into the target app (Web Share with photos on mobile, copy/download/deep-link
   fallback on desktop) and confirm "I posted it" so the publication flips to
   `published`.
2. **Dashboard** — the minimal per-user stats panel from Slice A §8 (active listings,
   publications by status, publish success-rate) with a per-marketplace breakdown.
3. **Live status (SSE) + app shell** — consume the existing A3 SSE stream on the publish
   page, add a shared nav bar, and a light/dark theme toggle.

## 2. Scope

**In scope (3 lots):**
- Lot 1 — assisted hand-off completion (Web Share + "I posted it" + status update API).
- Lot 2 — dashboard stats API + page.
- Lot 3 — SSE live status on the publish page, shared nav shell, light/dark theme,
  publication-status badges on the listings list.

**Explicitly OUT of A4:**
- True PWA installability / offline (manifest icons + service worker) — deferred.
  (The manifest exists but has no icons and there is no service worker; not addressed here.)
- Live SSE on the **listings list** — the list shows publication status fetched on load,
  not streamed. Live streaming stays on the publish page only.
- Graphs, time ranges, revenue (€) metrics — simple counters only.

---

## 3. Decisions summary

| Decision | Choice |
|---|---|
| Mobile hand-off | `navigator.share({ files, text, url })` with photos as `File[]`; fallback to `share({text,url})`, then to copy-text + download-photos + deep-link |
| "I posted it" | `PATCH /publications/:pubId/posted` → `awaiting_user` → `published` (+ optional `externalUrl`) |
| Active listings | `Listing.status ∉ {sold, archived}` (drafts included; `Listing` has no `expired` status) |
| Success rate | `published / (published + failed)`, `awaiting_user` **excluded**; `null` when denominator is 0 |
| Dashboard layout | Global block + 3 per-marketplace mini-blocks (Vinted / Leboncoin / eBay) |
| SSE auth | Extend `JwtStrategy` to read the token from the `Authorization` header **or** `?access_token=` query; native `EventSource` on the publish page. Token-in-URL accepted for MVP (localhost), to harden in prod. |
| Listings list status | `GET /listings` enriched with each listing's publications → compact status badge per row, fetched on load (not live) |
| Theme | Tailwind `darkMode: 'class'` (already configured) + `<ThemeToggle/>` persisted in `localStorage`, default `prefers-color-scheme`, anti-flash inline script |

---

## 4. Lot 1 — Assisted hand-off completion

### 4.1 API

- **`PATCH /publications/:pubId/posted`** (JWT-guarded), DTO `{ externalUrl?: string }`
  (validated as a URL when present, `whitelist` strips unknown fields).
- **`PublishService.markPosted(userId, pubId, externalUrl?)`:**
  1. `findUnique` the publication; 404 if missing.
  2. Verify ownership via the parent listing (reuse the `ownedListing` pattern used by
     `getAssisted`); 403 if not the owner.
  3. Require current `status === 'awaiting_user'`; otherwise `409 Conflict`
     ("Publication is not awaiting user action").
  4. Update to `status='published'`, `externalUrl ?? null`, `publishedAt = new Date()`,
     `error = null`. Return the updated row.

This is the only state transition the user can trigger directly; auto (eBay) publications
are still driven by the worker.

### 4.2 Web (publish page)

For each publication with `status === 'awaiting_user'`, render a hand-off block:

- **"Partager"** (primary, mobile): build `File[]` by `fetch`-ing each `photoUrls` entry
  → `Blob` → `File`. If `navigator.canShare?.({ files })` → `navigator.share({ files,
  text: pasteText, url: deepLink })`. Else if `navigator.share` exists →
  `share({ text, url })`. Else hide the button and show the fallback.
- **Fallback** (desktop / unsupported): "Copier le texte" (clipboard), "Télécharger les
  photos" (per-photo anchor download), "Ouvrir <marketplace>" (deep link). The paste
  textarea + deep link from A3 remain.
- **"J'ai posté"**: reveals an optional URL field, then calls `markPosted(pubId, url?)`;
  on success the row flips to `published` and renders the live link.

`api-client.ts` gains `markPosted(pubId, externalUrl?) : Promise<Publication>`.

A small shareable unit (e.g. `lib/share.ts`) holds the `File[]` building +
`canShare`/`share`/fallback branching so it is testable with a mocked `navigator`.

---

## 5. Lot 2 — Dashboard

### 5.1 Shared types (`packages/shared`)

```ts
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
  successRate: number | null; // published / (published + failed); null if 0
  byMarketplace: MarketplaceStat[]; // EBAY, VINTED, LEBONCOIN (always 3 entries)
}
```

### 5.2 API

- **`DashboardModule`** with `DashboardService` + `DashboardController`.
- **`GET /dashboard`** (JWT, scoped to `req.user.id`) → `DashboardStats`.
- Service queries (all filtered to the user's listings):
  - `activeListings`: `prisma.listing.count({ where: { userId, status: { notIn: ['sold','archived'] } } })`.
  - `publicationsByStatus`: `groupBy(['status'])` over publications whose listing belongs
    to the user; zero-fill the full `PublicationStatus` set.
  - `byMarketplace`: `groupBy(['marketplace','status'])`; assemble one `MarketplaceStat`
    per marketplace (zero-filled), always returning all three.
  - `successRate`: `published / (published + failed)` or `null` if the denominator is 0.

### 5.3 Web

- **`/dashboard` page** (client): `getDashboard()` on mount → global block (active listings,
  status counters, success-rate %) + 3 per-marketplace mini-blocks. `getDashboard()` added
  to `api-client.ts`.

---

## 6. Lot 3 — Live status (SSE) + shell/nav + theme

### 6.1 SSE auth + consumption

- **`JwtStrategy`** uses `ExtractJwt.fromExtractors([fromAuthHeaderAsBearerToken(),
  fromUrlQueryParameter('access_token')])` so the same strategy authenticates REST and the
  SSE route. No new guard.
- **Publish page** replaces the polling loop with `new EventSource(\`${API_URL}/listings/${id}/publications/stream?access_token=${token}\`)`; each
  message updates the `pubs` state; the connection is closed when all publications reach a
  terminal status or on `error`. A normal `getPublications` fetch seeds initial state.

### 6.2 Listings list status badges

- **`GET /listings`** is enriched to include each listing's publications
  (`marketplace`, `status`) — extend `ListingsService.listForUser` with
  `include: { publications: true }` and the shared `Listing` type with an optional
  `publications?: Pick<Publication,'marketplace'|'status'>[]`.
- The list renders a compact badge row per listing (e.g. `EBAY ✓ · VINTED ⏳`), computed
  from the included publications. Fetched on load; not streamed.

### 6.3 App shell / nav

- **`<NavBar/>`** (client component) in the root layout: links to Dashboard, Mes annonces,
  + Nouvelle, and Déconnexion (clears tokens → `/login`). Rendered only when an
  `accessToken` is present in `localStorage`.

### 6.4 Theme

- **`<ThemeToggle/>`** flips the `dark` class on `<html>`, persists the choice in
  `localStorage` (`theme`), defaults to `prefers-color-scheme`.
- An inline `<script>` in the layout applies the stored/system theme before paint to avoid
  a flash of the wrong theme.
- `dark:` variants added to shared surfaces (body, cards, nav, dashboard blocks).

---

## 7. Testing strategy (TDD)

- **API unit:**
  - `dashboard.service` — counts, zero-fill, success-rate (incl. `null` when denominator 0,
    `awaiting_user` excluded), per-marketplace assembly.
  - `publish.service.markPosted` — happy path, wrong-status `409`, non-owner `403`,
    missing `404`.
- **API e2e:** extend `publish.e2e-spec` — mark a Vinted `awaiting_user` publication as
  posted → `published`; `GET /dashboard` returns the expected shape and counts; basic SSE
  connectivity with `?access_token`.
- **Web (vitest):** `markPosted` + `getDashboard` (URL/headers/body); a dashboard render
  test; theme toggle (class + `localStorage`); the `lib/share.ts` branching with a mocked
  `navigator` (files path vs text-only vs fallback).

---

## 8. Risks & open items

- **Token-in-URL (SSE):** the `?access_token` extractor is **scoped to the SSE stream route
  only** (a custom `sseQueryTokenExtractor` in `JwtStrategy` returns the query token solely
  when the request path ends with `/publications/stream`); every other route remains
  header-only. Accepted for the MVP on localhost; for production, switch to a short-lived
  single-use stream ticket or a cookie-scoped SSE route. Isolated in `JwtStrategy` so it is
  cheap to change.
- **Web Share with files:** behaviour varies by browser/OS; the `lib/share.ts` feature
  detection (`canShare({files})`) must degrade cleanly. Real-device validation recommended
  (carried over from Slice A §11).
- **Photo `fetch` for share/download:** requires the photo URLs to be CORS-readable (MinIO
  bucket is public-download in dev per the compose `createbuckets` step); confirmed for dev.

## 9. Next

After A4: remaining Slice A polish is essentially done; future slices (B — adapter
expansion, C — AI assistant, etc.) per the Slice A decomposition. PWA installability/offline
can be revisited as a small follow-up if desired.
