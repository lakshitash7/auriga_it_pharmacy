# PharmaBatch — Batch-wise Pharmacy Inventory with FEFO Dispensing

A pharmacy inventory system where stock is tracked per **batch** (not just a
raw quantity per medicine), dispensing follows **FEFO** (First-Expiry-First-Out),
and stock counts only include **non-expired** batches.

## Tech stack

- Node.js + Express (REST API)
- SQLite via `better-sqlite3` (file-based, zero external setup)
- Vanilla JS + HTML/CSS frontend (no build step)
- JWT stored in an httpOnly cookie for auth

## Setup & run

```bash
npm install
npm start
```

The app starts on **http://localhost:3000**. The SQLite DB file is created
automatically at `db/pharmacy.db` on first run, with the schema and a small
seed dataset (so the UI isn't empty on first load — includes one already-expired
batch to make FEFO/in-date-count behavior visible immediately).

Open `http://localhost:3000` for the landing page, then **Sign up** to create
an account and reach the dashboard.

If running in GitHub Codespaces, make the forwarded port (3000) **Public** (or
just open it in the Codespaces browser preview) so you can access the UI.

## Debugging notes

- If the server won't start, delete `db/pharmacy.db*` and restart — it will
  be recreated with a fresh schema + seed data.
- All dates are compared using SQLite's `date('now')`, which uses UTC. If
  batches you expect to be "expiring soon" don't show up, check the server's
  system date (`date` in the Codespaces terminal).
- `JWT_SECRET` defaults to a dev value; set it via environment variable in
  production.

## Data model

- `users` — id, name, email (unique), password_hash, created_at
- `medicines` — id, name, generic_name, category, unit, reorder_level, created_at
- `batches` — id, medicine_id, batch_no, mfg_date, expiry_date, quantity, cost_price, created_at
- `dispense_log` — id, medicine_id, batch_id, quantity, dispensed_at, dispensed_by

## Core logic

**FEFO dispensing** (`POST /api/dispense`): given a medicine and a quantity,
fetch all in-date batches (`expiry_date >= today`, `quantity > 0`) ordered by
`expiry_date ASC`. Deduct greedily from the soonest-expiring batch first,
spilling into the next batch if it isn't enough, until the requested quantity
is fully allocated or stock runs out (in which case the whole operation is
rejected — it's wrapped in a DB transaction, so it's all-or-nothing).

**In-date stock count**: `SUM(quantity)` over batches for a medicine where
`expiry_date >= today`. Expired batches are excluded from this number
everywhere (medicine list, stock endpoint, dispense eligibility) but are
still visible in the batch list and surfaced via the expired-stock alert.

## API Endpoints

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account `{ name, email, password }` |
| POST | `/api/auth/login` | Log in `{ email, password }` |
| POST | `/api/auth/logout` | Clear session cookie |
| GET | `/api/auth/me` | Current logged-in user |

### Medicines
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/medicines?search=&page=&limit=&sort=&dir=` | List medicines with in-date stock, search, pagination, sorting |
| POST | `/api/medicines` | Create a medicine |
| GET | `/api/medicines/:id` | Get one medicine |
| GET | `/api/medicines/:id/stock` | In-date / expired / total stock breakdown |
| GET | `/api/medicines/:id/batches?page=&limit=&sort=&dir=` | List batches for a medicine, paginated & sorted |
| POST | `/api/medicines/:id/batches` | Add a new batch `{ batch_no, mfg_date, expiry_date, quantity, cost_price }` |

### Dispensing
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/dispense` | FEFO dispense `{ medicine_id, quantity }` → returns per-batch breakdown |
| GET | `/api/dispense/history?medicine_id=&page=&limit=` | Dispense history, paginated |

### Alerts
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/alerts/expiring?days=30` | In-date batches expiring within N days |
| GET | `/api/alerts/expired` | Batches already past expiry with stock still on record |
| GET | `/api/alerts/low-stock` | Medicines at/below their reorder level (in-date stock) |

All `/api/medicines`, `/api/dispense`, `/api/alerts` routes require auth
(the JWT cookie set on login/register).

## What's next (roadmap)

See the "What we'd build next" section on the landing page — supplier/purchase
order management, barcode scanning for receiving and dispensing, and a
wastage/analytics dashboard.
