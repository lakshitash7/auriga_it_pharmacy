# Reasoning

## Reading the brief

The differentiator in this brief is the twist: stock isn't a single number per
medicine, it's split across **batches**, each with its own expiry date. That
implies two things have to be correct before anything else matters:

1. Dispensing has to consume the soonest-expiring stock first (FEFO), not just
   decrement an arbitrary total.
2. "How much stock do we have" has to mean "how much *usable* (non-expired)
   stock do we have" — an expired batch sitting in the DB with quantity > 0
   should not make a medicine look available.

So I built in this order: schema → batches CRUD → FEFO dispense → in-date
stock count → search → alerts → auth/UI polish, rather than starting with
auth/UI, since the core logic is what would be judged hardest and is also
what's easiest to get subtly wrong under time pressure.

## Key design decisions

- **Batches are the source of truth for stock**, not a `medicines.quantity`
  column. A medicine's stock is always *derived* (summed from its batches) at
  query time. This avoids the classic bug where a cached total quantity drifts
  out of sync with the batches that back it.
- **FEFO as a single DB transaction.** The dispense endpoint reads eligible
  batches (in-date, quantity > 0, ordered by `expiry_date ASC`), greedily
  deducts from each until the requested quantity is satisfied, and logs every
  batch touched in `dispense_log`. It's wrapped in `db.transaction(...)` so a
  failure partway through (e.g. insufficient total stock) rolls back cleanly
  instead of leaving a partial deduction.
- **In-date stock is a filtered SUM, computed everywhere consistently** via
  the same predicate (`expiry_date >= date('now') AND quantity > 0`), used in:
  the medicines list, the `/stock` endpoint, FEFO eligibility, and the
  low-stock alert. Keeping that predicate identical in every query was
  deliberate — a mismatch between "what counts as available stock" in
  different endpoints is a realistic bug to introduce by accident.
- **Expired stock isn't deleted or hidden** — it still shows in the batch list
  (flagged `is_expired`) and in the expired-stock alert, since a real pharmacy
  needs to know it's sitting there to dispose of it, even though it no longer
  counts toward sellable stock.
- **Auth via JWT in an httpOnly cookie** rather than localStorage, mainly to
  avoid XSS token theft, and it lets the static frontend just call `fetch()`
  without manually attaching headers.
- **Pagination/sorting is on both the medicines list and the batches-per-medicine
  list**, using a server-side whitelist of sortable columns (`SORTABLE` array)
  rather than interpolating the client-provided sort field directly into SQL,
  to avoid SQL injection through the `sort` query param.

## Trade-offs made under the time limit

- Frontend is plain HTML/CSS/vanilla JS rather than React — faster to build
  and debug without a build step, at the cost of some code being more verbose
  (manual DOM string templates instead of components).
- No delete/edit endpoints for medicines or batches — the brief prioritizes
  get-batches-and-FEFO-right over full CRUD symmetry, so create + list was
  prioritized over update/delete.
- No batch-level "adjust quantity" (e.g. for stock corrections) — only
  additions (new batch) and deductions (dispense) exist.

## Testing

<!--
TODO (fill in after running this in your Codespace): describe the concrete
scenarios you ran through the UI/API and what you found, e.g.:

- Seeded data includes a medicine with an already-expired batch (PCM-OLD,
  expiry 2024-01-01) alongside two in-date batches. Verified the medicines
  list "in-date stock" excludes the expired batch's quantity, and that the
  expired batch still appears (flagged) in the batches modal.
- Dispensed a quantity larger than the soonest-expiring batch but smaller
  than total in-date stock, and confirmed via the FEFO breakdown in the
  response that it pulled the remainder from the next batch by expiry date.
- Attempted to dispense more than total in-date stock and confirmed a 409
  with no partial deduction (checked batch quantities were unchanged after).
- Verified pagination/sorting on the medicines list with >10 rows.
- Tried registering with a duplicate email and a too-short password to check
  validation.
-->
