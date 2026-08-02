# Poketwo Autocatcher

A free, open-source selfbot autocatcher for the [Pokétwo](https://poketwo.net/) Discord bot — with a real-time web dashboard, anti-detection human delay, anti-collision queueing, direct & hint catch modes, captcha alerts, audio warnings, and bulk transfer support.

> ⚠️ **Disclaimer:** Selfbotting violates Discord's Terms of Service. Using this may result in your account being banned. Use a throwaway account. The authors are not responsible for any bans or losses.

---

## Features

- **Direct Autocatching (Default)** — catches spawned Pokémon directly via Poke-Name bot messages across all channels
- **Catch Mode Toggle** — switch seamlessly between **⚡ Direct Catch** and **💡 Hint Catch** from the web dashboard
- **1s – 7s Anti-Detection Delay** — human-like randomized delays with gaussian distribution to prevent bot detection
- **Anti-Collision Catch Queue** — FIFO queue ensures two catches never trigger simultaneously, enforcing a 2–3s gap
- **Web Dashboard** — modern glassmorphism dashboard at `http://localhost:3000` with live stats, ticker, queue pill, and controls
- **Captcha Alert** — pauses catching on captcha detection, shows popup alert + plays alarm sound
- **Audio Toggle** — enable/disable the captcha alarm from the dashboard
- **Pause / Resume** — pause and resume autocatching directly from the dashboard or Discord
- **Bulk Transfer** — transfer all your Pokémon to another user via `$transferall` or dashboard button
- **Auto-levelling** — background spam keeps your selected Pokémon levelling up passively
- **Log & Error Channels** — caught Pokémon logs with rarity and error logs sent to dedicated channels

---

## Requirements

- [Node.js](https://nodejs.org/) v16 or higher
- A Discord account (use a **throwaway account**)
- [Poke-Name bot](https://discord.com/oauth2/authorize?client_id=874910942490677270&permissions=412317379648&scope=applications.commands%20bot) invited to your server
- A free [OCR Space API key](https://ocr.space/ocrapi/freekey)

---

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/yatharthsinghgavel/poki-poki-pokitwo.git
cd poki-poki-pokitwo
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure

Copy the example config and fill in your values:

```bash
cp config.example.json config.json
```

Then open `config.json` and fill in each field:

| Field | Description |
|---|---|
| `TOKEN` | Your Discord account's user token ([how to get it](https://www.youtube.com/watch?v=3W9tAEsK7RM)) |
| `spamChannelID` | Channel ID where the bot spams and catches Pokémon |
| `incenseChannelID` | (Optional) Separate channel for incense spawns — no Poke-Name bot needed here |
| `logChannelID` | Channel ID for caught Pokémon logs |
| `errorChannelID` | Channel ID for error logs |
| `OwnerID` | Your Discord user ID (right-click your name → Copy ID) |
| `ocrSpaceApiKey` | Free API key from [ocr.space](https://ocr.space/ocrapi/freekey) |

> ⚠️ **Never share or commit `config.json`** — it contains your Discord token. It is already in `.gitignore`.

### 4. Start the bot

**Option A — Double-click `run.bat`** (Windows, recommended)
This installs dependencies, starts the bot, and opens the dashboard automatically.

**Option B — Terminal**
```bash
node index.js
```

Then open your browser to `http://localhost:3000` for the dashboard.

---

## Dashboard

The web dashboard runs at `http://localhost:3000` while the bot is active.

| Feature | Description |
|---|---|
| Catch Mode Selector | Toggle between **⚡ Direct Catch** (default) and **💡 Hint Catch** |
| Status badge | Shows Active / Paused / Captcha / Offline |
| Stat cards | Caught, Missed, Total Spawns, Catch Rate %, Anti-Detection Delay, Uptime |
| Anti-Collision Queue Pill | Displays real-time pending catch queue count |
| Live Ticker | Shows live Pokémon spawns with detection method & countdown |
| Recent Catches | Live list of caught Pokémon with rarity, server, and channel |
| Live Event Log | Real-time WebSocket log stream |
| Controls | Pause/Resume, Mark Captcha Solved, Clear Catches |
| Bulk Transfer | Transfer all Pokémon to another user ID via trade |
| 🔔 Captcha Alert Toggle | Enable/disable audio alarm on captcha |

---

## Commands

Type these in any Discord channel. Only works from the account set as `OwnerID`.

| Command | Description |
|---|---|
| `$help` | Shows all available commands |
| `$captcha_completed` | Resumes the bot after solving a captcha |
| `$say <text>` | Makes the bot send a message |
| `$react <messageID>` | Reacts to a message with ✅ |
| `$click <messageID>` | Clicks the ✅ button on a message |
| `$transferall <userID>` | Transfers all your Pokémon to the given user |

---

## Bulk Transfer (`$transferall`)

The transfer system automates the full Pokétwo trade flow:

1. Sends `<@716390085896962058> trade <@targetUser>`
2. Waits up to 2 minutes for the target to accept (they click ✅)
3. Runs `<@716390085896962058> t aa` in batches of 10 until all Pokémon are added
4. Sends `<@716390085896962058> confirm` and clicks the confirm button automatically

You can also trigger this from the **Bulk Transfer** panel in the dashboard.

---

## Changelog

| Version | Changes |
|---|---|
| v1.5.1 | Incense channel support — separate spam + catch channel for incense, auto-rebuy and re-use when incense runs out |
| v1.5.0 | Added Direct Catching as default, 1-7s anti-detection human delay, anti-collision catch queue, Catch Mode Toggle on dashboard, and modernized glassmorphism UI |
| v1.4.0 | Web dashboard, WebSocket events, pause/resume, bulk transfer, captcha audio alert |
| v1.3.2 | Fixed Poke-Name `## PokemonName` message format detection |
| v1.3.0 | Initial open-source release |

---

## License

MIT — see [LICENSE](LICENSE)
