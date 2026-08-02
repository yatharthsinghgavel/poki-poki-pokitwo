# Changelog

All notable changes to Poketwo Autocatcher are documented here.

---

## [v1.6.4] — Catch Speed Modes, Liquid Glass Theme & Dynamic Incense Manager

### Catch Speed — 4-way selector
Replaced the old Boost ON/OFF toggle with a row of **4 dedicated speed buttons** in Bot Controls:

| Mode | Delay | Queue | Use case |
|---|---|---|---|
| 🐢 Slow | 8–20 s gaussian | ✅ | Overnight sessions, maximum stealth |
| 🛡️ Normal | 1–7 s gaussian | ✅ | Default — safe for public servers |
| 🚀 Quick | 300–800 ms | ✅ | Competitive servers, competitor-aware undercut |
| ⚡ Instant | 0 ms | ❌ bypassed | Private incense servers only — high ban risk |

- `$boost` Discord command still works (toggles Normal ↔ Quick)
- New `$speed slow|normal|quick|instant` Discord command for direct control
- Active button highlights in its own colour; Anti-Detection card updates live

### Liquid Glass Theme
- **🪟 Glass** toggle button added to the top-left header (next to the version tag)
- Click once → `🔮 Glass: ON` — all bento modules get Apple-inspired Liquid Glass effect (SVG turbulence displacement, frosted backdrop blur, inset shimmer borders)
- Click again → reverts to default dark bento theme
- Preference persists across refreshes via `localStorage`
- Glass CSS/SVG lazily injected on first activation — zero overhead when unused
- Powered by [Mael-667/Liquid-Glass-CSS](https://github.com/Mael-667/Liquid-Glass-CSS) (MIT)

### Dynamic Incense Channel Manager
- Incense section in the Quest & Incense module is now a **live manager**
- Each channel shows as a row with its live 🟢/⚪ status and a **✕ remove** button
- A Channel ID input + **➕ Add** button is always visible below the list
- Adding a channel: validates it, starts incense spam, checks/buys incense immediately, no restart needed
- Removing a channel: stops tracking it instantly
- **Both operations persist to `config.json`** — survive bot restarts

---

## [v1.6.3] — Bento UI Redesign & Performance Overhaul

### Dashboard — Complete Rewrite (`dashboard/index.html`)

**Visual redesign — Bento-box minimalism**
- Full layout rebuilt as a CSS Grid "Bento-box" — distinct frosted-glass modules with `backdrop-filter: blur(16px)`, rounded corners, and subtle borders
- New background: near-black `#09090b` with dual radial-gradient accent halos (indigo top-left, green bottom-right) fixed to the viewport
- All typography still Outfit (headings/values) + JetBrains Mono (timestamps/code), but hierarchy tightened: large font-weight-800 values, tiny uppercase muted labels
- Responsive: stacks cleanly to 2-column at 1100 px, single column at 700 px

**Memory & performance — target: < 150 MB RAM**
- **Single master chart**: replaced 5 separate Chart.js canvas contexts with one dual-axis line graph (Pokémon/min left axis, PC/min right axis). Eliminates ~4 canvas allocations and their gradient buffers
- **DOM element pooling**: `Recent Catches` and `Live Event Log` both hard-capped at **50 items**; oldest entry removed via `.removeChild(lastChild)` on every insert — no unbounded growth
- **Cached DOM refs**: all frequently-updated elements stored as `const` references at startup (`elCaught`, `elPpm`, `elLog`, etc.) — zero `getElementById` calls in the hot path
- `.innerHTML` avoided for all repeated updates; only `.textContent` and targeted `prepend/appendChild` used in the WebSocket message handler

**New UI components**
- **Catch Efficiency ring**: SVG donut arc that animates to the live catch-rate percentage; colour shifts green → amber → red based on threshold
- **Quest progress bar**: CSS progress bar under the quest percentage, updates live from `quest` events
- **Incense channel chips**: inline pill badges (🟢 on / ⚪ off) per channel inside the Quest & Incense module
- **Live Radar bar**: full-width strip showing the last spawn name, detection method badge, and anti-detection delay alongside the queue counter
- **Rate mini-cards row**: 6 compact rate cards (Poke/min, Poke/hr, PC/min, PC/hr, Avg/min, Avg/hr) in a dedicated row above the chart
- Competitor tracker rebuilt as a clean sorted table inside its own bento module
- Warnings panel retains auto-dismiss pills (30 s timeout)

**Bug fixes carried forward**
- Chart history no longer lost if `init` fires before DOM is ready — `applyHistory()` is called directly from the `init` handler, charts are initialised synchronously on page load
- Audio unlock on first user interaction preserved (browser autoplay policy)

---

## [v1.6.2] — Live stats, rate tracking & Stats window
- **Pokémon / min & / hour**: rolling 60-second and 60-minute catch rate shown on the main dashboard
- **PC / min & / hour**: rolling pokécoin earn rate for both 1-minute and 1-hour windows
- **Session averages**: avg pokemon/min and projected avg/hour since bot boot
- **History snapshots**: every 60 seconds the bot records a data point (caught, PC, rates) for graph display
- **Stats window** (`/stats`): standalone page accessible via 📊 Stats button in the header, showing:
  - 6 live rate cards (poke/min, poke/hr, PC/min, PC/hr, avg/min, avg/hr)
  - Pokémon caught cumulative line graph
  - PC earned cumulative line graph
  - Pokémon/min live rate graph
  - PC/min live rate graph
  - Combined dual-axis Pokémon vs PC rate graph
- Dashboard main page gains 6 new stat cards with live rate data
- `index.js` bumped to v1.6.2; `package.json` version synced

---

## [v1.6.1] — Audio fixes & test button
- Fixed AudioContext not unlocking on first user interaction (browser autoplay policy)
- Added 🔊 Test button in dashboard header to preview alarm for 3 seconds
- Added `alarm.mp3` (retro digital clock sound) directly to repo so it works out of the box
- `alert.wav` retained as fallback if MP3 fails to load
- Fixed `run.bat`: added Node.js version check (v16+ required), config.json existence check, and delayed browser open so dashboard loads after server is ready
- Bumped `package.json` version to match release

---

## [v1.6.0] — Boost mode, smart queue, PC/quest tracking, incense overhaul, competitor tracker
- **Boost mode**: toggleable 300–800 ms catch delay via dashboard button or `$boost` command
- **Smart queue**: max 3 catch slots, drops oldest entry when backlogged
- **PC tracker**: estimates pokécoins earned from catch milestones (35 / 350 / 3500 / 35000)
- **Quest tracker**: broadcasts progress toward next quest milestone across all 8 regions
- **Incense overhaul**: checks incense status at boot and every hour, auto-buys where inactive, sends correct buy command in the target channel
- **Competitor tracker**: watches other users catching in the same channel, auto-undercuts the fastest competitor by 300 ms
- Dashboard stat cards added: delay mode, PC earned, quest progress, incense status
- Competitor tracker table added to dashboard
- Warnings & health panel with auto-dismiss pills

---

## [v1.5.2] — Multi-incense channel support
- `incenseChannelIDs` config field expanded to support up to 4 channel IDs
- Incense manager independently tracks and maintains incense in each configured channel

---

## [v1.5.1] — Incense channel support
- Added `incenseChannelIDs` config field
- Bot now monitors a dedicated incense channel and auto-buys incense when it expires

---

## [v1.4.1] — Poke-Name format fix
- Updated Poke-Name parser to handle the new `## PokemonName <emoji>【types】` message format from bot ID 874910942490677270

---

## [v1.4.0] — First dashboard release
- Express + WebSocket server on port 3000
- Dashboard (`dashboard/index.html`) with live stat cards, event log, recent catches ticker
- Catch mode toggle (Direct / Hint) in dashboard header
- Pause / resume and captcha-solved controls
- 🔔 audio toggle for captcha alarm
- Captcha handler: pauses bot, plays looping alarm, auto-resumes after 5 hours
- Bulk transfer panel: `$transferall <userID>`, batches of 10, auto-clicks confirm button

---

## [v1.0.0] — Initial release
- Discord selfbot using `discord.js-selfbot-v13`
- Anti-detection gaussian delay (1–7 s, centred at 3 s) with unique `SESSION_JITTER` per boot
- Three catch modes: Direct (plain text), Hint (`solveHint`), OCR (image fallback via ocr.space)
- Owner-only commands: `$captcha_completed`, `$say`, `$react`, `$click`, `$help`
- Config fields: `TOKEN`, `OwnerID`, `spamChannelID`, `logChannelID`, `errorChannelID`, `ocrSpaceApiKey`
