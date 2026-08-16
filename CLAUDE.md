# GGUC 2026 — Pooja Registration App
## Project Spec for AI Sessions

---

## What This Is
A single-page mobile-first web app for **Greenmark Galaxy Apartments** (Greenmark Galaxy Utsav Committee) to manage registrations for Ganesh Chaturthi 2026 pooja events.

---

## Files
```
gguc/
├── index.html        ← Single-page frontend HTML (structure + section divs)
├── app.js            ← All JavaScript: CONFIG, nav, form logic, API calls
├── style.css         ← All CSS styling
├── admin.html        ← Admin dashboard (calls Google Apps Script directly)
├── firebase.json     ← Firebase hosting config (rewrites: /admin → admin.html, ** → index.html)
├── .firebaserc       ← Firebase project: gguc2026
├── CLAUDE.md         ← This file
└── src/
    ├── Code.js           ← Google Apps Script backend (used by admin.html)
    └── bkp_index.html    ← Backup/reference only
```

---

## Architecture

```
User Browser
    │
    ▼
Firebase Hosting  (gguc2026.web.app)
    │  Serves: index.html, app.js, style.css
    │
    ▼  fetch() POST — Content-Type: text/plain
Cloudflare Worker  (https://ggucapi.giri-kailasam.workers.dev/)
    │  Validates request, enforces capacity/duplicate logic
    │  Authenticates with Google Cloud service account credentials
    │  (credentials stored as Cloudflare Worker secrets/env vars)
    │
    ▼  Google Sheets API (googleapis)
Google Sheets  (Sheet ID: 1-P3FOKShM4aBRPqL5qAWblXbO0X6XqtB6uMRHL6-rh8)
    │  One tab per event, auto-created on first registration
    ▼
Data at rest (Reg ID, Name, Flat, Phone, Payment Status, etc.)
```

### Admin panel (separate flow)
```
admin.html
    │
    ▼  fetch() POST — Content-Type: text/plain
Google Apps Script  (script.google.com/macros/s/…/exec)
    │  src/Code.js deployed as Web App
    ▼
Same Google Sheet
```

### Key Points
- **Frontend** is pure static files — no build step, no bundler.
- **Cloudflare Worker** is the primary API for the public registration app (`index.html`/`app.js`).
- **Google Apps Script** (`src/Code.js`) is only used by `admin.html`. It talks to the same Google Sheet.
- **Google Cloud credentials**: A Google Cloud service account was created and its key (JSON) is stored as a secret in the Cloudflare Worker environment. The Worker uses the `googleapis` Node.js library (bundled into the worker) to authenticate and call the Sheets API.
- **Navigation**: Hash-based (`#daily-pooja`, `#status`, etc.), all sections show/hide via `nav()` in `app.js`.

---

## Hosting
| Service | URL | Status |
|---|---|---|
| **Firebase** (primary) | `gguc2026.web.app` | Active — 4x faster than Netlify |
| Netlify (backup) | `gguc.netlify.app` | Active |

Firebase free tier: unlimited deploys, 360MB/day bandwidth — sufficient for apartment community.

---

## API Endpoints

### Cloudflare Worker (used by app.js / index.html)
- **URL**: `https://ggucapi.giri-kailasam.workers.dev/`
- **Method**: POST, `Content-Type: text/plain`, body is JSON
- **Actions**: `register`, `getStatus`

### Google Apps Script (used by admin.html only)
- **Exec URL**: `https://script.google.com/macros/s/AKfycbxJ3O50Tcq3wFONxE5mkgLYMRGlQs3l5j8Y50LfVZXdrx_2RKgDCdANrQtDLzdNzDTa/exec`
- **Method**: POST, `Content-Type: text/plain`, body is JSON
- **Actions**: `register`, `getStatus`, `getAdmin`
- **Deployment**: Web App → Execute as: Me → Who has access: Anyone

---

## Google Sheet
- **Sheet ID**: `1-P3FOKShM4aBRPqL5qAWblXbO0X6XqtB6uMRHL6-rh8`
- One tab per event, auto-created on first registration.

| Tab | Columns |
|---|---|
| `daily-pooja` | Reg ID, Timestamp, Name, Flat, Phone, Date, Slot, Payment Status, Payment Link, Payment Date |
| `kumkuma-pooja` | Reg ID, Timestamp, Name, Flat, Phone, Payment Status, Payment Date |
| `ganapathi-homam` | Reg ID, Timestamp, Name, Flat, Phone, Payment Status, Payment Link, Payment Date |

### Payment Status Values (organizer updates manually in sheet)
- `Pending` → default on registration
- `Received` → update after verifying payment screenshot

---

## Events Configuration

### In app.js (CONFIG block) — controls frontend display
| Event | Date | Amount | Key |
|---|---|---|---|
| Daily Pooja | Sep 14–20, 2026 | Rs.516/slot | `daily-pooja` |
| Kumkuma Pooja | Sep 18, 2026 | Free | `kumkuma-pooja` |
| Ganapathi Homam | Sep 16, 2026 | Rs.1116 | `ganapathi-homam` |

### In Cloudflare Worker (and also src/Code.js) — backend enforces these
- Daily Pooja: `maxPerSlot: 10` (per date + Morning/Evening combo)
- Kumkuma Pooja: `maxRegistrations: null` (no limit)
- Ganapathi Homam: `maxRegistrations: 5`

### Blocked Slots (backend only — Cloudflare Worker enforces)
```javascript
blockedSlots: [
  { date: '2026-09-14', slot: 'Morning' },  // Ganesh Chaturthi — reserved
  { date: '2026-09-20', slot: 'Evening' },  // Closing day — reserved
]
```

---

## How to Deploy / Update

### If you changed index.html, app.js, or style.css (frontend only)
```bash
# From the repo root (/Users/giridhar.kailasam/gguc/gguc2026/gguc)
firebase deploy --only hosting
```
No API or worker changes needed. Takes ~10 seconds.

### If you changed admin.html (admin frontend only)
```bash
firebase deploy --only hosting
```
Same as above — admin.html is also a static file served by Firebase.

### If you changed src/Code.js (Google Apps Script — admin backend)
1. Open [script.google.com](https://script.google.com) → find the GGUC project
2. Paste the updated `src/Code.js` content into the editor
3. Click **Deploy → Manage deployments**
4. Click the pencil (edit) icon on the existing deployment → set Version to **New version** → click **Deploy**
5. The exec URL stays the same — no changes needed in `admin.html`

### If you changed the Cloudflare Worker (registration API backend)
The worker code is managed in the **Cloudflare Dashboard** (not in this repo):
1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → `ggucapi`
2. Click **Edit code** → update the worker JS → click **Deploy**
3. The worker URL stays the same — no changes needed in `app.js`

> Note: If the worker uses a bundled package (like `googleapis`), you may need to use `wrangler` CLI:
> ```bash
> wrangler deploy
> ```
> from the worker's own project directory (separate from this repo).

---

## What to Change for Common Updates

### Change event dates (displayed in UI)
- Edit `app.js` → `CONFIG.events['daily-pooja'].displayDate` / `dateFrom` / `dateTo`
- Also update the hardcoded date text in `index.html` event strip divs
- **Deploy**: `firebase deploy --only hosting`

### Change event amounts
- Edit `app.js` → `CONFIG.events[key].amount` and `amountLabel`
- **Deploy**: `firebase deploy --only hosting`

### Open or close registrations
- Edit `app.js` → `CONFIG.events[key].status` → `'active'` or `'closed'`
- Also update in Cloudflare Worker EVENT_CONFIG (same field) to enforce at backend
- **Deploy frontend**: `firebase deploy --only hosting`
- **Deploy worker**: via Cloudflare Dashboard

### Change capacity limits
- Edit Cloudflare Worker → `EVENT_CONFIG[key].maxPerSlot` or `maxRegistrations`
- **Deploy worker**: via Cloudflare Dashboard

### Change blocked slots
- Edit Cloudflare Worker → `EVENT_CONFIG['daily-pooja'].blockedSlots`
- **Deploy worker**: via Cloudflare Dashboard

### Change UPI ID
- Edit `app.js` → `CONFIG.UPI_ID`
- **Deploy**: `firebase deploy --only hosting`

### Change payment WhatsApp contacts
- Edit `app.js` → `CONFIG.PAYMENT_CONTACTS`
- **Deploy**: `firebase deploy --only hosting`

---

## Design
### Colors
```css
--red:    #8B1A1A   /* Register buttons, accents */
--gold:   #C9A84C   /* Check Status pill, borders */
--gold-l: #F5E6B8   /* Footer text */
--bg:     #FFFBF0   /* Page background (warm cream) */
```
- **Header/Footer background**: `#0D3535` (Deep Teal)
- **Top/bottom page bar**: `#8B1A1A` (5px crimson strip)
- **OM badge**: `#D4620A` saffron circle with `om` character

### Fonts
- **Headings**: Cormorant Garamond (serif)
- **Body/UI**: DM Sans

### Background
Subtle diamond tile pattern via SVG data URI on body.

### Key UI Decisions
- No "Check Status" button on event cards — header gold pill is the only entry point
- Single full-width "Register" button per card
- Swipe right (left-to-right from left 50% of screen) = go back to home
- `alert()` removed everywhere — all validation uses inline `showError()` boxes
- Safe area insets applied for iPhone notch/home indicator

---

## Payment Flow
1. Resident registers → status = `Pending`
2. Resident pays via UPI → sends screenshot to **9966514485 or 9490133404**
3. Organizer opens sheet → finds row → changes `Pending` to `Received`
4. Resident checks status on site → sees Payment Received

---

## Section IDs (for nav() function in app.js)
```javascript
const ALL_SECTIONS = ['home', 'daily-pooja', 'kumkuma-pooja', 'ganapathi-homam', 'status'];
```

## Form Prefixes (used throughout app.js)
| Event | Prefix |
|---|---|
| Daily Pooja | `dp` |
| Kumkuma Pooja | `kp` |
| Ganapathi Homam | `gh` |

---

## Known Issues / Decisions
- **iframe scroll on iOS**: Not fixable — Apple restricts iframe touch scrolling. Share direct URL instead of embedding in Google Sites.
- **Google Sites embedding**: Blocked by X-Frame-Options on all hosting providers. Use a button/link in Google Sites pointing to the direct URL.
- **alert() suppressed in iframes**: Fixed — all validation uses inline error boxes now.
- **Button stuck disabled on slow network**: Fixed via `resetForm(pfx)` called in `nav()` on section entry.
- **Duplicate registration**: Cloudflare Worker checks for duplicates. Frontend shows "Already Registered" inline error.
