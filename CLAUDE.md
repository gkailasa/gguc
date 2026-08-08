# GGUC 2026 — Pooja Registration App
## Project Spec for AI Sessions

---

## What This Is
A single-page mobile-first web app for **Greenmark Galaxy Apartments** (Greenmark Galaxy Utsav Committee) to manage registrations for Ganesh Chaturthi 2026 pooja events.

---

## Files
```
v5-simple/
├── index.html        ← Single-page frontend (THE main file)
├── Code.js           ← Google Apps Script backend (paste into Apps Script editor)
├── CLAUDE.md         ← This file
```

---

## Architecture
- **Frontend**: Single `index.html` — all sections show/hide via JS (`nav()` function)
- **Backend**: Google Apps Script (`Code.js`) deployed as Web App — pure JSON API
- **Database**: Google Sheets — auto-creates tabs per event on first registration
- **API call**: `fetch()` with `Content-Type: text/plain` and `redirect: follow` to Apps Script exec URL
- **Navigation**: Hash-based (`#daily-pooja`, `#status`, etc.)

---

## Hosting
| Service | URL | Status |
|---|---|---|
| **Firebase** (primary) | `gguc2026.web.app` | Active — 4x faster than Netlify |
| Netlify (backup) | `gguc.netlify.app` | Active |

Firebase free tier: unlimited deploys, 360MB/day bandwidth — sufficient for apartment community.

---

## Google Apps Script
- **Exec URL**: `https://script.google.com/macros/s/AKfycbxJ3O50Tcq3wFONxE5mkgLYMRGlQs3l5j8Y50LfVZXdrx_2RKgDCdANrQtDLzdNzDTa/exec`
- **Sheet ID**: `1-P3FOKShM4aBRPqL5qAWblXbO0X6XqtB6uMRHL6-rh8`
- **Deployment**: Web App → Execute as: Me → Who has access: Anyone
- **After Code.js changes**: Must save + redeploy (new deployment or manage existing) in Apps Script editor
- **After index.html changes**: Just re-upload to Firebase — no Apps Script changes needed

---

## Events Configuration (in index.html CONFIG block)
| Event | Date | Amount | Key |
|---|---|---|---|
| Daily Pooja | Sep 14–20, 2026 | ₹516/slot | `daily-pooja` |
| Kumkuma Pooja | Sep 18, 2026 | Free | `kumkuma-pooja` |
| Ganapathi Homam | Sep 16, 2026 | ₹1116 | `ganapathi-homam` |

### Capacity Limits (in Code.js)
- Daily Pooja: `maxPerSlot: 10` (per date + Morning/Evening)
- Kumkuma Pooja: `maxRegistrations: null` (no limit)
- Ganapathi Homam: `maxRegistrations: 5`

### Blocked Slots (in Code.js only — backend enforces)
```javascript
blockedSlots: [
  { date: '2026-09-14', slot: 'Morning' },  // Ganesh Chaturthi — reserved
  { date: '2026-09-20', slot: 'Evening' },  // Closing day — reserved
]
```

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
- **OM badge**: `#D4620A` saffron circle with `ॐ` character

### Fonts
- **Headings**: Cormorant Garamond (serif)
- **Body/UI**: DM Sans

### Background
Subtle diamond tile pattern via SVG data URI on body.

### Key UI Decisions
- No "Check Status" button on event cards — header gold pill is the only entry point
- Single full-width "Register →" button per card
- Swipe right (left-to-right from left 40% of screen) = go back to home
- `alert()` removed everywhere — all validation uses inline `showError()` boxes
- Safe area insets applied for iPhone notch/home indicator

---

## Google Sheet Structure
Each event gets its own tab (auto-created on first registration):

| Tab | Columns |
|---|---|
| `daily-pooja` | Reg ID, Timestamp, Name, Flat, Phone, Date, Slot, Payment Status, Payment Link, Payment Date |
| `kumkuma-pooja` | Reg ID, Timestamp, Name, Flat, Phone, Payment Status, Payment Date |
| `ganapathi-homam` | Reg ID, Timestamp, Name, Flat, Phone, Payment Status, Payment Link, Payment Date |

### Payment Status Values (organizer updates manually in sheet)
- `Pending` → default on registration
- `Received` → update after verifying payment screenshot

---

## Payment Flow
1. Resident registers → status = `Pending`
2. Resident pays via UPI → sends screenshot to **9966514485 or 9490133404**
3. Organizer opens sheet → finds row → changes `Pending` to `Received`
4. Resident checks status on site → sees ✅ Payment Received

**UPI ID** (update in index.html CONFIG): `temple@upi` ← replace with real UPI ID

---

## Section IDs (for nav() function)
```javascript
const ALL_SECTIONS = ['home', 'daily-pooja', 'kumkuma-pooja', 'ganapathi-homam', 'status'];
```

---

## Form Prefixes (used throughout JS)
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
- **Duplicate registration**: Backend `checkDuplicate` is the guard. Frontend shows "Already Registered" inline error.

---

## To Update Blocked Slots
Edit only `Code.js` → `EVENT_CONFIG['daily-pooja'].blockedSlots` → redeploy Apps Script.

## To Close/Open Registrations
Edit `status: 'active'` → `status: 'closed'` in both `index.html` CONFIG and `Code.js` EVENT_CONFIG.

## To Change Capacity
Edit `maxPerSlot` (daily pooja) or `maxRegistrations` (other events) in `Code.js` → redeploy.
