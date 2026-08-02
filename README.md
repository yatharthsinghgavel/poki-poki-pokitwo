<div align="center">

# ⚡ Poketwo Autocatcher

**The most feature-complete free & open-source Pokétwo selfbot autocatcher.**

Real-time dashboard · Anti-detection · Boost mode · Incense manager · Competitor tracker · PC/Quest tracking

[![Version](https://img.shields.io/badge/version-v1.6.0-6366f1?style=for-the-badge)](https://github.com/yatharthsinghgavel/poki-poki-pokitwo/releases)
[![Node](https://img.shields.io/badge/node-v16+-10b981?style=for-the-badge&logo=node.js)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-f59e0b?style=for-the-badge)](LICENSE)

</div>

---

> ⚠️ **Disclaimer:** Selfbotting violates Discord's Terms of Service and may result in your account being banned. Use a throwaway account. The authors are not responsible for any bans or losses.

---

## What is this?

Poketwo Autocatcher is a selfbot that automatically catches Pokémon spawned by the [Pokétwo](https://poketwo.net/) Discord bot. It uses [Poke-Name bot](https://discord.com/oauth2/authorize?client_id=874910942490677270&permissions=412317379648&scope=applications.commands%20bot) to identify spawns in real time, then fires catch commands with human-like timing so it doesn't look like a bot.

Everything is controlled from a **live web dashboard** at `http://localhost:3000` — no terminal required after first launch.

---

## Features

### Autocatching
- **Direct mode** — reads Pokémon name instantly from Poke-Name bot messages
- **Hint mode** — requests a hint from Pokétwo and solves it algorithmically
- **OCR fallback** — identifies Pokémon from images using OCR Space API (used in incense channels)
- **Smart 3-slot queue** — prevents message collision, drops oldest if backlogged so you never fall behind
- **Session jitter** — each bot restart has a unique timing fingerprint, reducing detection patterns

### Anti-Detection
- **Gaussian delay** — 1–7s human-like random delay centred at ~3s, not a flat random
- **Boost mode** — 300–800ms fast mode for competitive servers, toggleable anytime
- **Competitor tracker** — watches other users catching in the same channel, auto-adjusts your delay to always undercut the fastest competitor
- **Session jitter** — ±400ms unique offset baked into every session

### Incense Manager
- Supports up to **4 incense channels** simultaneously
- Checks incense status on every channel at startup — skips active ones, buys for inactive ones
- Re-checks every hour and auto-buys where needed
- Spams incense channels only while incense is active — pauses automatically when it runs out
- Uses correct Pokétwo commands: `buy incense` in-channel → clicks confirm button

### Economy Tracking
- **PC earnings tracker** — estimates Pokécoins earned from catch milestones (35 → 350 → 3500 → 35,000 PC)
- **Quest milestone alerts** — notifies when you hit quest targets (20/50/100/200/500 catches per region)
- All tracked live on the dashboard

### Other
- **Bulk transfer** — `$transferall <userID>` or dashboard button — trades all Pokémon in batches with auto-confirm button click
- **Captcha handling** — detects captcha, pauses catching, plays alarm, shows popup. Auto-resumes after 5 hours
- **Spawn redirect** — supports `@Pokétwo redirect #channel` to focus spawns
- **Auto-levelling** — background spam passively levels up your selected Pokémon
- **Log channels** — every caught Pokémon logged with name + rarity to a dedicated Discord channel

---

## Dashboard

> Open at `http://localhost:3000` — updates live via WebSocket, no refresh needed.

### Header
| Element | Description |
|---|---|
| ⚡ Direct Catch / 💡 Hint Catch | Toggle catch mode — Direct uses Poke-Name, Hint solves Pokétwo's hint |
| 🔔 Captcha Alert toggle | Enable/disable audio alarm when a captcha is detected. Click **🔊 Test** next to it to preview the sound. |
| Status badge | 🟢 Active / ⏸ Paused / 🔴 Captcha / ⚫ Offline |

### Stat Cards (top row)
| Card | What it shows |
|---|---|
| Caught | Total Pokémon caught this session |
| Missed | Wrong guesses / failed catches |
| Spawns Seen | Total spawns detected |
| Captchas | Number of captchas hit |
| Anti-Detection | Current delay mode (1s–7s normal / boost) |
| Est. PC Earned | Estimated Pokécoins earned from milestones |
| Quest Progress | % toward next quest milestone + PC reward |
| Incense Channels | 🟢/⚪ live status pill for each incense channel |

### Live Ticker
Shows each Pokémon the instant it's detected — name, detection method (Direct/Hint/OCR), and anti-detection delay assigned.

### Panels
| Panel | Description |
|---|---|
| Recent Catches | Live list — name, rarity, server, channel, time |
| Live Event Log | Full real-time log of every bot action. Colour coded: green=success, yellow=warn, red=error |
| Bot Controls | Pause/Resume, 🚀 Boost mode toggle, ✅ Mark Captcha Solved, 🗑 Clear Catches, uptime |
| ⚡ Competitor Tracker | Table of detected competitors with fastest catch time, average, sample count. Shows your current auto-adjusted delay ceiling |
| 🛡️ Warnings & Health | Live warning pills — miss rate alerts, high catch rate, milestones. Auto-dismiss after 30s |
| Bulk Transfer | Enter target User ID + channel ID → bulk trade all Pokémon automatically |

---

## Requirements

- [Node.js](https://nodejs.org/) v16 or higher
- A Discord account (throwaway recommended)
- [Poke-Name bot](https://discord.com/oauth2/authorize?client_id=874910942490677270&permissions=412317379648&scope=applications.commands%20bot) invited to your server
- A free [OCR Space API key](https://ocr.space/ocrapi/freekey)

---

## Setup

### 1. Clone

```bash
git clone https://github.com/yatharthsinghgavel/poki-poki-pokitwo.git
cd poki-poki-pokitwo
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure

```bash
cp config.example.json config.json
```

Open `config.json` and fill in your values:

| Field | Description |
|---|---|
| `TOKEN` | Your Discord account token ([how to get it](https://www.youtube.com/watch?v=3W9tAEsK7RM)) |
| `spamChannelID` | Channel where the bot spams to trigger natural spawns |
| `incenseChannelIDs` | Array of up to 4 channel IDs for incense farming |
| `logChannelID` | Channel for caught Pokémon logs |
| `errorChannelID` | Channel for error logs |
| `OwnerID` | Your Discord user ID (right-click your name → Copy ID) |
| `ocrSpaceApiKey` | Free key from [ocr.space](https://ocr.space/ocrapi/freekey) |

> ⚠️ `config.json` is in `.gitignore` — never commit it. Your token gives full access to your account.

### 4. Run

**Windows — double-click `run.bat`**
Installs dependencies, starts the bot, and opens the dashboard automatically.

**Terminal**
```bash
node index.js
```

Then open `http://localhost:3000`.

---

## Discord Commands

All commands only work from the account set as `OwnerID`.

| Command | Description |
|---|---|
| `$help` | List all commands |
| `$captcha_completed` | Resume bot after solving a captcha |
| `$boost` | Toggle boost mode ON/OFF (fast 300-800ms delay) |
| `$say <text>` | Make the bot send a message |
| `$react <messageID>` | React to a message with ✅ |
| `$click <messageID>` | Click the ✅ button on a message |
| `$transferall <userID>` | Bulk transfer all Pokémon to a user |

---

## Pokétwo Reference

Useful commands and facts for managing your account:

| Command | Description |
|---|---|
| `@Pokétwo start` | Pick your starter (required before catching) |
| `@Pokétwo c <name>` | Catch a spawned Pokémon |
| `@Pokétwo h` | Get a hint for the current spawn |
| `@Pokétwo buy incense` | Buy incense in the current channel (50 shards) |
| `@Pokétwo stopincense` | Permanently stop active incense in this channel |
| `@Pokétwo buy shard <n>` | Buy shards with PC (200 PC per shard) |
| `@Pokétwo redirect #channel` | Force natural spawns to a specific channel |
| `@Pokétwo bal` | Check your Pokécoins + shards balance |
| `@Pokétwo trade @user` | Start a trade |
| `@Pokétwo t aa` | Add up to 10 Pokémon to an open trade |
| `@Pokétwo confirm` | Confirm a trade (then click the button) |
| `@Pokétwo shinyhunt <name>` | Start shiny hunting a specific Pokémon |

**Economy facts:**
- Incense: 50 shards = 10,000 PC. Spawns 1 Pokémon every 20s for 1 hour (180 total)
- Shards: 200 PC each. Non-tradable. Also buyable at [poketwo.net/store](https://poketwo.net/store)
- Catch PC: 35 (1st) · 350 (10th) · 3,500 (100th) · 35,000 (1,000th)
- Quest PC: 2,000 · 5,000 · 10,000 · 20,000 · 50,000 per region (8 regions total)

---

## Incense Setup (Recommended)

For maximum catching with incense:

1. Create a **private server** — only you and Pokétwo (no Poke-Name needed)
2. Create up to 4 channels (e.g. `#incense-1` through `#incense-4`)
3. Add their IDs to `incenseChannelIDs` in your config
4. Make sure your account has the **Incense** role or admin permissions in that server
5. The bot handles buying, activating, and re-buying automatically

> Running incense in a private server means zero competition — every spawn is yours.

---

## Changelog

| Version | Changes |
|---|---|
| **v1.6.0** | Full overhaul — gaussian anti-detection delay, boost mode, smart 3-slot queue, competitor tracker with auto-undercut, PC & quest tracker, incense manager (4 channels, correct commands, confirm click), warnings panel, `$boost` command |
| v1.5.2 | Multi-incense channel support (up to 4), hourly refresh, auto-rebuy |
| v1.5.1 | Incense channel support, auto-rebuy on expiry |
| v1.5.0 | Direct catch default, 1-7s anti-detection delay, anti-collision queue, catch mode toggle, modernized UI |
| v1.4.0 | Web dashboard, WebSocket events, pause/resume, bulk transfer, captcha audio alert |
| v1.3.2 | Fixed Poke-Name `## PokemonName` message format detection |
| v1.3.0 | Initial open-source release |

---

## Custom Alarm Sound

The captcha alert plays `dashboard/alarm.mp3` by default (falls back to `dashboard/alert.wav` if not found). You can swap it out with any sound you want.

### Option A — Drop in a file manually
1. Find any `.mp3`, `.wav`, or `.ogg` sound file you want (e.g. from [freesound.org](https://freesound.org))
2. Rename it to `alarm.mp3`
3. Drop it into the `dashboard/` folder, replacing the existing one
4. Reload the dashboard — done

### Option B — Using Kiro IDE
1. Open the project in [Kiro](https://kiro.dev)
2. In the file explorer, navigate to the `dashboard/` folder
3. Right-click → **Upload file** (or drag your audio file directly into the folder)
4. Rename it to `alarm.mp3`
5. Reload the dashboard

### Option C — Using VS Code
1. Open the project folder in VS Code
2. Drag your audio file from Explorer directly into the `dashboard/` folder in the VS Code sidebar
3. Rename it to `alarm.mp3`
4. Reload the dashboard

### Testing the sound
Hit the **🔊 Test** button in the top-right of the dashboard header. It plays the alarm for 3 seconds so you can hear it without triggering a real captcha.

### Supported formats
`.mp3` · `.wav` · `.ogg` — all work in modern browsers. MP3 has the best compatibility.

> The alarm loops until you dismiss the captcha popup or click the ✅ button.

---



1. Fork the repo
2. Create a branch: `git checkout -b feature/your-feature`
3. Commit with [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `chore:`
4. Push and open a Pull Request against `main`

---

<div align="center">

Made with ❤️ · [Report an issue](https://github.com/yatharthsinghgavel/poki-poki-pokitwo/issues) · [Releases](https://github.com/yatharthsinghgavel/poki-poki-pokitwo/releases)

</div>
