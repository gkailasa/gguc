# D1 + Google Sheets Sync Architecture

## Workers

| File | Role | Trigger |
|---|---|---|
| `cloudflare-worker-api.js` | Public API: register, getStatus | HTTP fetch |
| `cloudflare-worker-admin.js` | Admin API: getAdmin, updatePayment | HTTP fetch |
| `cloudflare-worker-sync.js` | Sync D1 rows to Google Sheets | Cron + optional HTTP |

## Flow

1. Resident registers → `cloudflare-worker-api.js` writes to D1 with `synced_at = NULL`.
2. Organizer marks payment received → `cloudflare-worker-admin.js` updates D1 and sets `synced_at = NULL` again.
3. Scheduled sync worker runs → finds rows with `synced_at IS NULL`, upserts them to Sheets, sets `synced_at = NOW()`.

## D1 Migration

Run `migrations/001_add_synced_at.sql` in your D1 database:

```sql
ALTER TABLE registrations ADD COLUMN synced_at TEXT DEFAULT NULL;
```

If you need to backfill existing rows, run:

```sql
UPDATE registrations SET synced_at = timestamp WHERE synced_at IS NULL;
```

This will mark all existing rows as already synced. The sync worker will then only process future changes.

## Update Admin Worker

In `cloudflare-worker-admin.js`, change `handleUpdatePayment` so it does **not** write to Sheets directly. Instead, after updating D1, set `synced_at = NULL`:

```javascript
await db.prepare(
  `UPDATE registrations SET payment_status = ?, payment_date = ?, synced_at = NULL WHERE id = ?`
).bind(paymentStatus, paymentDate, regId).run();
```

You can also remove the Sheets fallback from `handleGetStatus` if all pre-D1 data has been migrated.

## Deploy Sync Worker

### 1. Create the worker

```bash
npx wrangler deploy cloudflare-worker-sync.js --name gguc2026-sync
```

### 2. Set secrets

```bash
npx wrangler secret put SERVICE_ACCOUNT_JSON --name gguc2026-sync
# paste your Google service account JSON

npx wrangler secret put SYNC_SECRET --name gguc2026-sync
# set a strong random string for manual HTTP sync
```

### 3. Bind D1 database

```bash
npx wrangler d1 binding gguc2026-sync --name gguc2026-db
```

Or use the Cloudflare dashboard: Workers & Pages → gguc2026-sync → Settings → Variables → D1 database bindings.

### 4. Add Cron Trigger

In `wrangler.toml` or via dashboard, add:

```toml
[triggers]
crons = ["*/15 * * * *"]
```

This runs every 15 minutes. Adjust as needed (`*/5 * * * *` for every 5 minutes, etc.).

### 5. Test manually (optional)

```bash
curl -X POST https://gguc2026-sync.YOUR_SUBDOMAIN.workers.dev \
  -H "Authorization: Bearer YOUR_SYNC_SECRET"
```

## Update Frontends

Point your registration app to the new API worker URL:

```javascript
// common.js
API_URL: 'https://gguc2026-api.YOUR_SUBDOMAIN.workers.dev/'
```

## Notes

- Google Sheets tabs are created automatically if they don't exist.
- The sync worker does a true upsert: updates existing rows by Reg ID, appends new ones.
- Sheets will be delayed by the cron interval. D1 (admin panel) is always live.
