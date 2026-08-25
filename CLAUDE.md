# GGUC 2026 — Pooja Registration App
## Project Spec for AI Sessions

---

## What This Is
A mobile-first web app for **Greenmark Galaxy Apartments** (Greenmark Galaxy Utsav Committee) to manage registrations for Ganesh Chaturthi 2026 pooja events.

---

## Files
```
gguc/
├── public/
│   ├── index.html     <- Registration SPA (home + event forms)
│   ├── app.js         <- Registration form logic, nav, API calls
│   ├── status.html    <- Status check page (search by flat or phone)
│   ├── admin.html     <- Admin dashboard (view all registrations, mark payment)
│   ├── admin.js       <- Admin page JS
│   ├── common.js      <- Shared: CONFIG, api(), adminApi(), payment helpers
│   └── style.css / admin.css / ...
├── cloudflare/
│   ├── cloudflare-worker-api.js    <- Public API worker: register, getStatus
│   ├── cloudflare-worker-admin.js  <- Admin API worker: getAdmin, updatePayment
│   ├── cloudflare-worker-sync.js   <- Scheduled sync: D1 → Google Sheets
│   └── SYNC_SETUP.md               <- Sync architecture & deploy instructions
├── firebase.json      <- Firebase hosting config (public: "public" dir)
├── .firebaserc        <- Firebase project: gguc2026
├── CLAUDE.md          <- This file
└── src/
    └── bkp_index.html <- Backup/reference only (not deployed)
```

---

## Architecture

### Registration & Status (public users)
```
User Browser
    │
    ▼
Firebase Hosting  (gguc2026.web.app)
    │  Serves: public/index.html, public/app.js, public/common.js, etc.
    │
    ▼  fetch() POST — Content-Type: text/plain
Cloudflare Worker: ggucapi  (cloudflare-worker-api.js)
    │  Actions: register, getStatus
    │  Validates request, enforces capacity/duplicate/blocked-slot logic
    │
    ▼
Cloudflare D1 Database  (primary data store)
    │  Table: registrations
    │  Columns: id, event_key, timestamp, name, flat, phone,
    │           event_date, slot, payment_status, payment_date, synced_at
    ▼
Data at rest (fast reads, no external auth needed)
```

### Admin panel
```
admin.html + admin.js
    │
    ▼  fetch() POST — Content-Type: text/plain
Cloudflare Worker: ggucadmin  (cloudflare-worker-admin.js)
    │  Actions: getStatus, getAdmin (password-protected), updatePayment (password-protected)
    │  Admin users stored in env var ADMIN_USERS (JSON array with name/password/canUpdate)
    │
    ▼
Cloudflare D1 Database
    │  updatePayment sets synced_at = NULL to queue re-sync
    ▼
Payment updated in D1 immediately (no Sheets latency for admin)
```

### Google Sheets sync (read replica)
```
Cloudflare Cron Trigger  (every ~15 min)
    │
    ▼
Cloudflare Worker: gguc2026-sync  (cloudflare-worker-sync.js)
    │  Finds rows WHERE synced_at IS NULL
    │  Upserts to Google Sheets (update if Reg ID exists, append if new)
    │  Sets synced_at = NOW() on success (batch D1 update)
    │
    ├── Auth: Google service account JWT (no googleapis library — raw Web Crypto API)
    │         Credentials stored as env secret SERVICE_ACCOUNT_JSON
    ▼
Google Sheets  (Sheet ID: 1-P3FOKShM4aBRPqL5qAWblXbO0X6XqtB6uMRHL6-rh8)
    One tab per event. Acts as a read replica / export — not the source of truth.
```

### Key Points
- **Primary data store**: Cloudflare D1 (SQLite). All registrations, status checks, and payment updates go to D1.
- **Google Sheets**: Read replica only. Synced asynchronously by the cron worker. Organizers can view it but should not edit it (edits will be overwritten on next sync).
- **No Google Apps Script**: The old `src/Code.js` GAS approach is deprecated. Admin panel now calls the Cloudflare admin worker directly.
- **Frontend**: Pure static files in `public/` — no build step, no bundler. Served by Firebase Hosting.
- **Shared config**: `common.js` is loaded by all pages. It contains `CONFIG`, `api()`, `adminApi()`, and payment modal helpers.
- **Navigation** (index.html): Hash-based (`#daily-pooja`, etc.), sections show/hide via `nav()` in `app.js`.
- **Status check**: Separate page `status.html` — search by flat number or phone number.

---

## Hosting
| Service | URL | Status |
|---|---|---|
| **Firebase** (primary) | `gguc2026.web.app` | Active |
| Netlify (backup) | `gguc.netlify.app` | Active |

Firebase hosting `public` directory is `public/`. `firebase.json` rewrites `/admin` → `admin.html`, `**` → `index.html`.

---

## API Endpoints

### Public API Worker — `cloudflare-worker-api.js`
- **Worker name**: `ggucapi`
- **URL**: `https://ggucapi.giri-kailasam.workers.dev/`
- **Method**: POST, body is JSON (Content-Type: text/plain)
- **Actions**: `register`, `getStatus`
- **Data source**: Cloudflare D1 only

### Admin API Worker — `cloudflare-worker-admin.js`
- **Worker name**: `ggucadmin`
- **URL**: `https://ggucadmin.giri-kailasam.workers.dev/`
- **Method**: POST, body is JSON (Content-Type: text/plain)
- **Actions**: `getStatus` (open), `getAdmin` (password), `updatePayment` (password + canUpdate)
- **Data source**: Cloudflare D1 only
- **Env vars**: `DB` (D1 binding), `ADMIN_USERS` (JSON array: `[{name, password, canUpdate}]`)

### Sync Worker — `cloudflare-worker-sync.js`
- **Worker name**: `gguc2026-sync`
- **Trigger**: Cloudflare Cron (`*/15 * * * *`) + optional HTTP POST with `Authorization: Bearer SYNC_SECRET`
- **Env vars**: `DB` (D1 binding), `SERVICE_ACCOUNT_JSON` (Google service account key), `SYNC_SECRET`

---

## D1 Database Schema

```sql
CREATE TABLE registrations (
  id             TEXT PRIMARY KEY,   -- Reg ID e.g. DP1A2B3C
  event_key      TEXT,               -- 'daily-pooja' | 'kumkuma-pooja' | 'ganapathi-homam'
  timestamp      TEXT,               -- ISO 8601
  name           TEXT,
  flat           TEXT,
  phone          TEXT,
  event_date     TEXT,               -- YYYY-MM-DD (empty for non-slot events)
  slot           TEXT,               -- 'Morning' | 'Evening' (empty for non-slot events)
  payment_status TEXT,               -- 'Pending' | 'Received'
  payment_date   TEXT,
  synced_at      TEXT DEFAULT NULL   -- NULL = pending sync to Sheets
);
```

---

## Google Sheet
- **Sheet ID**: `1-P3FOKShM4aBRPqL5qAWblXbO0X6XqtB6uMRHL6-rh8`
- One tab per event key. Columns: Reg ID, Timestamp, Name, Flat, Phone, Date, Slot, Payment Status, Payment Date.
- **Read replica** — do not manually edit rows (sync worker will overwrite).

---

## Events Configuration

### In `common.js` (CONFIG block) — controls frontend display
| Event | Date | Amount | Key |
|---|---|---|---|
| Daily Pooja | Sep 15–24, 2026 | Rs.516 weekday / Rs.1116 weekend | `daily-pooja` |
| Kumkuma Pooja | Sep 18, 2026 | Rs.216/person | `kumkuma-pooja` |
| Ganapathi Homam | Sep 16, 2026 | Rs.2116/family | `ganapathi-homam` |

### In `cloudflare-worker-api.js` (EVENT_CONFIG) — backend enforces these
- Daily Pooja: `maxPerSlot: 10` (per date + Morning/Evening combo)
- Kumkuma Pooja: `maxRegistrations: null` (no limit)
- Ganapathi Homam: `maxRegistrations: 10`

### Blocked Slots (enforced by api worker)
```javascript
blockedSlots: [
  { date: '2026-09-14', slot: 'Morning' },
  { date: '2026-09-14', slot: 'Evening' },
  { date: '2026-09-24', slot: 'Evening' },
]
```

---

## How to Deploy / Update

### Changed `public/` files (index.html, app.js, common.js, status.html, admin.html, admin.js, CSS)
```bash
# From repo root: /Users/giridhar.kailasam/gguc/gguc2026/gguc
firebase deploy --only hosting
```

### Changed `cloudflare/cloudflare-worker-api.js` (public API)
1. Cloudflare Dashboard → Workers & Pages → `ggucapi` → Edit code → paste → Deploy
2. No frontend changes needed.

### Changed `cloudflare/cloudflare-worker-admin.js` (admin API)
1. Cloudflare Dashboard → Workers & Pages → `ggucadmin` → Edit code → paste → Deploy
2. No frontend changes needed.

### Changed `cloudflare/cloudflare-worker-sync.js` (sync worker)
1. Cloudflare Dashboard → Workers & Pages → `gguc2026-sync` → Edit code → paste → Deploy
2. Or via wrangler: `npx wrangler deploy cloudflare/cloudflare-worker-sync.js --name gguc2026-sync`

---

## What to Change for Common Updates

### Change event dates (UI display)
- Edit `public/common.js` → `CONFIG.events[key].displayDate` / `dateFrom` / `dateTo`
- Deploy: `firebase deploy --only hosting`

### Change event amounts
- Edit `public/common.js` → `CONFIG.events[key].amount` and `amountLabel`
- Deploy: `firebase deploy --only hosting`

### Open or close registrations
- Edit `public/common.js` → `CONFIG.events[key].status` → `'active'` or `'closed'`
- Deploy frontend: `firebase deploy --only hosting`
- (Backend capacity limits in api worker are the hard enforcement)

### Change capacity limits
- Edit `cloudflare/cloudflare-worker-api.js` → `EVENT_CONFIG[key].maxPerSlot` or `maxRegistrations`
- Deploy via Cloudflare Dashboard

### Change blocked slots
- Edit `cloudflare/cloudflare-worker-api.js` → `EVENT_CONFIG['daily-pooja'].blockedSlots`
- Deploy via Cloudflare Dashboard

### Change UPI ID
- Edit `public/common.js` → `CONFIG.UPI_ID`
- Deploy: `firebase deploy --only hosting`

### Change payment WhatsApp contacts
- Edit `public/common.js` → `CONFIG.PAYMENT_CONTACTS`
- Deploy: `firebase deploy --only hosting`

### Update admin users / passwords
- Update `ADMIN_USERS` env var in Cloudflare Dashboard → `ggucadmin` worker → Settings → Variables
- Format: `[{"name":"Teja","password":"xxx","canUpdate":true}]`

---

## Payment Flow
1. Resident registers → status = `Pending` (written to D1)
2. Resident pays via UPI → sends screenshot to **9966514485 (Giridhar) or 9490133404 (Teja)**
3. Organizer logs into `admin.html` → finds row → clicks "Mark Received"
4. Admin worker updates D1 immediately, sets `synced_at = NULL`
5. Sync worker picks it up within 15 min and updates Google Sheets
6. Resident checks `status.html` → sees "Payment Received"

---

## Design
### Colors
```css
--red:    #8B1A1A   /* Register buttons, accents */
--gold:   #C9A84C   /* Borders, pills */
--gold-l: #F5E6B8   /* Footer text */
--bg:     #FFFBF0   /* Page background (warm cream) */
```
- **Header/Footer background**: `#0D3535` (Deep Teal)
- **Top/bottom page bar**: `#8B1A1A` (5px crimson strip)
- **OM badge**: `#D4620A` saffron circle

### Fonts
- **Headings**: Cormorant Garamond (serif)
- **Body/UI**: DM Sans

### Key UI Decisions
- Status check is a separate page (`status.html`), not a section in `index.html`
- Single full-width "Register" button per event card
- `alert()` removed everywhere — all validation uses inline `showError()` boxes
- Safe area insets applied for iPhone notch/home indicator

---

## Form Prefixes (used throughout app.js)
| Event | Prefix |
|---|---|
| Daily Pooja | `dp` |
| Kumkuma Pooja | `kp` |
| Ganapathi Homam | `gh` |

## Section IDs (for nav() in app.js)
```javascript
const ALL_SECTIONS = ['home', 'daily-pooja', 'kumkuma-pooja', 'ganapathi-homam'];
```

---

## Known Issues / Decisions
- **Google Sheets is a read replica**: Admins should use `admin.html` to update payment status, not edit the sheet directly — sync worker will overwrite manual sheet edits.
- **Sync delay**: Sheets are updated within ~15 min of a D1 change. Admin panel always shows live D1 data.
- **iframe scroll on iOS**: Not fixable — share direct URL instead of embedding in Google Sites.
- **Duplicate registration**: Api worker checks D1 for duplicates. Frontend shows "Already Registered" inline error.
