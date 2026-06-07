# MultiMarket — Slice B (Adapter expansion + account-linking) — Design

**Date:** 2026-06-07
**Status:** Approved (pending final spec review)
**Author:** Brainstormed with user
**Builds on:** Slice A (A1–A4) + the SSE-token hardening. See `2026-06-05-multimarket-slice-a-design.md` §2 (Slice B), §5 (MarketplaceAccount), §11 (deep-link risk).

---

## 1. Goal

Extend the publish fan-out to more second-hand marketplaces and let the user control
which ones they actually use:

1. **More assisted marketplaces** — add **Wallapop** (ES), **Kleinanzeigen** (DE) and
   **Subito** (IT) as `assisted` adapters, reusing the A3 adapter pattern.
2. **Account-linking** — a per-user `MarketplaceAccount` flag per marketplace and a
   "Mes comptes" page; the publish page offers **only the marketplaces the user has
   enabled**. First-run default is **all enabled** (opt-out).

## 2. Scope

**In scope:**
- 3 new assisted adapters (Wallapop, Kleinanzeigen, Subito) + condition maps + registry.
- `Marketplace` enum extended (Prisma + shared).
- Shared `MARKETPLACES` catalog (single source of truth) replacing the hardcoded list.
- `MarketplaceAccount` model + `GET /accounts` / `PATCH /accounts/:marketplace`.
- "Mes comptes" web page + publish page driven by enabled accounts + nav link.

**Explicitly OUT:**
- eBay OAuth / real auto-publish, marketplace **session/status checks** (blocked on eBay
  keyset; deferred).
- Facebook Marketplace.
- Server-side enforcement of account state in `publishEverywhere` (UI-gated; harmless for
  assisted — noted as a possible later hardening).
- Per-locale translation of paste-text **label prefixes** (the condition **value** is
  localized; "État : / Prix :" prefixes stay as-is, consistent with Vinted/Leboncoin).

---

## 3. Decisions summary

| Decision | Choice |
|---|---|
| New marketplaces | Wallapop, Kleinanzeigen, Subito — all `assisted` |
| Account model | New `MarketplaceAccount { userId, marketplace, connected }`, `@@unique([userId, marketplace])` |
| Default state | All enabled (opt-out): a **missing row means connected** — no seeding needed |
| Publish gating | UI-only: publish page offers solely connected marketplaces (fetched from `GET /accounts`) |
| Catalog source | `MARKETPLACES` constant in `packages/shared` (id, label, mode), used by web + accounts API |
| eBay in linking | Listed with a toggle like the others (still publishes via the A3 mock when selected) |

---

## 4. Data model (Prisma)

Extend the `Marketplace` enum (and the shared `Marketplace` type) with `WALLAPOP`,
`KLEINANZEIGEN`, `SUBITO`.

New model:
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
Add `marketplaceAccounts MarketplaceAccount[]` to `User`. One migration covers the enum
values + the new model. Kept minimal (no tokens) — extensible later for eBay OAuth.

---

## 5. Shared catalog (`packages/shared`)

```ts
export interface MarketplaceMeta { id: Marketplace; label: string; mode: PublishMode; }

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
`Marketplace` becomes `'EBAY' | 'VINTED' | 'LEBONCOIN' | 'WALLAPOP' | 'KLEINANZEIGEN' | 'SUBITO'`.

---

## 6. Adapters (assisted; reuse the A3 pattern)

Three new adapters mirroring `VintedAdapter`/`LeboncoinAdapter`: `id`, `mode: 'assisted'`,
`mapListing` (localized condition + title length cap) and `buildAssistedPayload`
(`pasteText` + `deepLink`). Added to `AdapterRegistry`.

Condition maps in `conditions.ts` (`Record<Condition, string>`):

| Condition | Wallapop (ES) | Kleinanzeigen (DE) | Subito (IT) |
|---|---|---|---|
| new | Nuevo | Neu | Nuovo |
| like_new | Como nuevo | Neuwertig | Come nuovo |
| good | En buen estado | Gut | Buono |
| fair | Aceptable | In Ordnung | Accettabile |

Deposit deep links (isolated per adapter — not contractual, cheap to update per §11):
- Wallapop: `https://es.wallapop.com/app/catalog/upload`
- Kleinanzeigen: `https://www.kleinanzeigen.de/p-anzeige-aufgeben.html`
- Subito: `https://www.subito.it/inserisci-annuncio.htm`

Title caps: Wallapop 50, Kleinanzeigen 70, Subito 50 (isolated constants). `pasteText`
keeps the existing Vinted/Leboncoin structure (`title … description … État : <localized
condition> … Prix : <price> <currency>`).

---

## 7. API — accounts

`AccountsModule` (service + controller), JWT-guarded, scoped to `req.user.id`.

- **`GET /accounts` → `MarketplaceAccountView[]`**: iterate `MARKETPLACES`, left-join the
  user's `MarketplaceAccount` rows; a missing row ⇒ `connected: true`.
- **`PATCH /accounts/:marketplace`** body `{ connected: boolean }` (validated against the
  `Marketplace` set) → `upsert` the row for `(userId, marketplace)`; returns the updated
  `MarketplaceAccountView`.

`publishEverywhere` is unchanged (UI gates selection).

---

## 8. Web

- **`/accounts` page** ("Mes comptes"): `getAccounts()` on mount → one labelled toggle per
  marketplace (label/mode from the catalog); toggling calls
  `setAccountConnected(marketplace, connected)` and updates local state.
- **Publish page**: replace the hardcoded `ALL` with the **connected** marketplaces from
  `getAccounts()`; checkboxes/selection derive from that list (labels via the catalog).
- **`api-client`**: `getAccounts()`, `setAccountConnected(marketplace, connected)`.
- **NavBar**: add a "Mes comptes" link (authenticated only).

---

## 9. Testing strategy (TDD)

- **API unit:** one adapter spec covering the three new adapters (id/mode, condition
  mapping per locale, `buildAssistedPayload` deep link + paste text); `accounts.service`
  (default-on merge when no rows, `connected:false` after a disconnect upsert,
  all six marketplaces returned).
- **API e2e:** `GET /accounts` returns 6 entries all `connected:true`; `PATCH` one to
  `connected:false` → reflected on re-fetch; publishing a newly-added assisted marketplace
  (e.g. WALLAPOP) lands in `awaiting_user` with an assisted payload whose deep link matches.
- **Web (vitest):** `getAccounts`/`setAccountConnected` (URL/method/headers/body); a small
  pure helper that filters the catalog/accounts to the connected list used by the publish
  page.

---

## 10. Risks & open items

- **Deep-link stability:** Wallapop/Kleinanzeigen/Subito "create listing" URLs are not
  contractual and may change; each lives in its adapter so updates are one-line (§11).
- **Locale correctness:** condition labels are best-effort per the platforms' usual wording;
  easy to refine later.
- **Stale-UI publish:** since the server doesn't enforce account state, a stale client could
  publish to a disconnected assisted marketplace — harmless (same as the user posting
  manually). Server enforcement can be added later if auto marketplaces need it.

## 11. Next

Future slices per the Slice A decomposition: C (AI assistant), D (sync intelligence),
E (monetization), F (native). eBay OAuth + session/status checks remain a separate
credential-gated effort.
