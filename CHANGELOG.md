# Changelog

All notable changes to Poketwo Autocatcher are documented here.

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
