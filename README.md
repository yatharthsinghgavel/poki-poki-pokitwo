# Poketwo Autocatcher

A free, open-source selfbot autocatcher for the [Pokétwo](https://poketwo.net/) Discord bot — with a real-time web dashboard, captcha alerts, audio warnings, and bulk transfer support.

> ⚠️ **Disclaimer:** Selfbotting violates Discord's Terms of Service. Using this may result in your account being banned. Use a throwaway account. The authors are not responsible for any bans or losses.

---

## Features

- **Autocatching** — detects Pokémon spawns via Poke-Name bot and catches them automatically
- **Web Dashboard** — live stats, event log, spawn ticker, and controls at `http://localhost:3000`
- **Captcha Alert** — stops catching on captcha detection, shows a popup + plays an alarm sound
- **Audio Toggle** — enable/disable the captcha alarm from the dashboard
- **Pause / Resume** — pause and resume the autocatcher directly from the dashboard
- **Bulk Transfer** — transfer all your Pokémon to another user via a single command or dashboard button
- **Auto-levelling** — spam keeps your selected Pokémon levelling up passively
- **Log Channel** — every caught Pokémon is logged with name and rarity to a Discord channel
- **Error Channel** — errors are sent to a dedicated Discord channel
- **Incense Support** — handles incense spawns (use a separate channel without Poke-Name for best results)

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
git clone https://github.com/YOUR_USERNAME/Poketwo-Autocatcher.git
cd Poketwo-Autocatcher
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

| Section | Description |
|---|---|
| Status badge | Shows Online / Paused / Captcha |
| Stat cards | Caught, Missed, Captchas, Account name + uptime |
| Spawn ticker | Shows each Pokémon the moment it's detected |
| Recent Catches | Live list of caught Pokémon with rarity, server, channel |
| Live Log | All bot events in real time |
| Controls | Pause/Resume bot, Mark Captcha Solved, Clear Catches |
| Transfer All | Bulk transfer all Pokémon to another user |
| 🔔 Captcha Alert toggle | Enable/disable alarm sound on captcha |

---

## Commands

Type these in any Discord channel. Only works from the account set as `OwnerID`.

| Command | Description |
|---|---|
| `$help` | Shows all available commands |
| `$captcha_completed` | Resumes the bot after solving a captcha |
| `$say <text>` | Makes the bot send a message (useful for trading) |
| `$react <messageID>` | Reacts to a message with ✅ |
| `$click <messageID>` | Clicks the ✅ button on a message |
| `$transferall <userID>` | Transfers all your Pokémon to the given user |

---

## Bulk Transfer (`$transferall`)

The transfer system automates the full Pokétwo trade flow:

1. Sends `@Pokétwo trade @targetUser`
2. Waits up to 2 minutes for the target to accept (they click ✅)
3. Runs `@Pokétwo t aa` in batches of 10 until all Pokémon are added
4. Sends `@Pokétwo confirm` and clicks the confirm button automatically

You can also trigger this from the **Transfer All** panel in the dashboard — enter the User ID and the Channel ID where the trade should happen.

> The receiving user must be in the same server and click ✅ to accept the trade request.

---

## Pokétwo Command Reference

Useful Pokétwo commands to know when managing your account manually:

| Command | Description |
|---|---|
| `@Pokétwo start` | Pick your starter Pokémon (required before catching) |
| `@Pokétwo c <name>` | Catch a spawned Pokémon |
| `@Pokétwo p` | View your Pokémon collection |
| `@Pokétwo info` | View your currently selected Pokémon |
| `@Pokétwo select <id>` | Select a Pokémon to level up |
| `@Pokétwo trade @user` | Start a trade with a user |
| `@Pokétwo t a <id>` | Add a Pokémon to an open trade |
| `@Pokétwo t aa` | Add up to 10 Pokémon at once to an open trade |
| `@Pokétwo confirm` | Confirm a trade (then click the button) |
| `@Pokétwo t cancel` | Cancel an ongoing trade |
| `@Pokétwo bal` | Check your Pokécoins balance |
| `@Pokétwo buy incense` | Buy an incense for more spawns |
| `@Pokétwo release <id>` | Release a Pokémon |
| `@Pokétwo h` | Get a hint on the current Pokémon spawn |
| `@Pokétwo dex <name>` | View a Pokémon's Pokédex entry |

---

## Captcha Handling

When Pokétwo sends a captcha:
1. The autocatcher **stops catching immediately**
2. A **popup alert appears on the dashboard**
3. An **alarm sound plays** (if audio is enabled)
4. The bot auto-resumes after **5 hours** if you don't respond

To resolve manually:
- Solve the captcha in Discord
- Click **"Mark Captcha Solved"** on the dashboard, **or** type `$captcha_completed` in Discord

---

## Specific Channel Support

To restrict catching to specific channels only, open `index.js` and add channel IDs to the `allowedChannels` array at the top:

```js
const allowedChannels = ["123456789", "987654321"]; // leave [] for all channels
```

---

## Versioning

This project follows [Semantic Versioning](https://semver.org/):

- **MAJOR** version for breaking changes
- **MINOR** version for new features
- **PATCH** version for bug fixes

Releases are tagged on GitHub (e.g. `v1.3.0`, `v1.4.0`). Check the [Releases](../../releases) page for changelogs.

### Changelog

| Version | Changes |
|---|---|
| v1.4.1 | Incense channel support — separate spam + catch channel for incense, auto-rebuy and re-use when incense runs out |
| v1.4.0 | Web dashboard, WebSocket events, pause/resume, bulk transfer, captcha audio alert |
| v1.3.2 | Fixed Poke-Name `## PokemonName` message format detection |
| v1.3.0 | Initial open-source release |

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m "feat: add your feature"`
4. Push to your branch: `git push origin feature/your-feature`
5. Open a Pull Request against `main`

Please use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages (`feat:`, `fix:`, `chore:`, etc.).

---

## Support

Join the support server: [discord.gg/FJD29BV8Np](https://discord.gg/FJD29BV8Np)

---

## License

MIT — see [LICENSE](LICENSE)
