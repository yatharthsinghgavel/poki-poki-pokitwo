/*
 * Poketwo-Autocatcher
 * Version: V1.6.2
 * Changelog: pokemon/min, pokemon/hour, PC/min, PC/hour rate tracking;
 *            history snapshots every 60s; /stats window with Chart.js graphs
 * Repo: https://github.com/yatharthsinghgavel/poki-poki-pokitwo
 *
 * KEY FACTS (researched from official docs):
 *  - Incense: costs 50 shards (=10,000 PC). Buy with "@Pokétwo incense buy" IN the target channel.
 *    Spawns 1 pokemon every 20s for 1 hour (180 total). Stop with "@Pokétwo stopincense".
 *  - Shards: premium currency. Buy with "@Pokétwo buy shard <n>" (200 PC each), or real money.
 *  - Spawn rate: 1 spawn per 24 messages. 1 user @ 1msg/1.5s = spawn every 36s.
 *  - PC from catches: 35 (1st), 350 (10th), 3500 (100th), 35000 (1000th)
 *  - Quests: up to 50,000 PC per region (8 regions)
 *  - Redirect spawns: "@Pokétwo redirect #channel"
 */
const Discord = require("discord.js-selfbot-v13");
const client  = new Discord.Client({ checkUpdate: false });
const express = require('express');
const http    = require('http');
const WebSocket = require('ws');
const path    = require('path');
const { solveHint, checkRarity } = require("pokehint");
const { ocrSpace } = require('ocr-space-api-wrapper');

const config = require('./config.json');
const json   = require('./namefix.json');

let isSleeping = false;
let catchMode  = 'direct'; // 'direct' | 'hint'

// ─── CATCH SPEED MODE ────────────────────────────────────────────────────────
// 'slow'    — gaussian 8–20 s (maximum stealth)
// 'normal'  — gaussian 1–7 s anti-detection delay (safest for public servers)
// 'quick'   — 300–800 ms, still queued, competitor-aware (old boost mode)
// 'instant' — fires immediately, no queue, no delay (highest ban risk)
let catchSpeed = 'normal';

// ─── ANTI-DETECTION ──────────────────────────────────────────────────────────
// Each session gets a unique jitter so timing fingerprint changes on every restart.
const SESSION_JITTER = Math.floor(Math.random() * 800) - 400; // ±400ms, fixed per session

// humanDelay is defined after boostMode — see BOOST MODE section below

// ─── SMART CATCH QUEUE ───────────────────────────────────────────────────────
// Max 3 pending. If backlogged beyond 3, drop oldest (it's likely already caught).
const catchQueue = [];
let   catchBusy  = false;
let   lastCatchTime = 0;

async function processCatchQueue() {
    if (catchBusy || catchQueue.length === 0) return;
    catchBusy = true;
    while (catchQueue.length > 0) {
        const job = catchQueue.shift();
        broadcast('queue', { size: catchQueue.length });
        const elapsed = Date.now() - lastCatchTime;
        const minGap  = 400 + Math.floor(Math.random() * 200);
        if (elapsed < minGap) await sleep(minGap - elapsed);
        await sleep(job.delay);
        lastCatchTime = Date.now();
        try { await job.fn(); } catch (e) { logEvent(`Queue error: ${e}`, 'error'); }
    }
    catchBusy = false;
    broadcast('queue', { size: 0 });
}

function enqueueCatch(name, fn) {
    // ── INSTANT: skip queue and delay entirely ──
    if (catchSpeed === 'instant') {
        stats.spawns++;
        broadcast('stats', { caught: stats.caught, missed: stats.missed,
                             captchas: stats.captchas, spawns: stats.spawns,
                             pc: stats.pc, queueSize: catchQueue.length, ...calculateRates() });
        fn().catch(e => logEvent(`Instant catch error: ${e}`, 'error'));
        return;
    }

    if (catchQueue.length >= 3) {
        logEvent(`Queue full — dropping oldest (${catchQueue[0].name}) to catch ${name}`, 'warn');
        catchQueue.shift();
    }
    const delay = humanDelay();
    catchQueue.push({ name, delay, fn });
    stats.spawns++;
    broadcast('stats', { caught: stats.caught, missed: stats.missed,
                         captchas: stats.captchas, spawns: stats.spawns,
                         pc: stats.pc, queueSize: catchQueue.length, ...calculateRates() });
    processCatchQueue();
}

// ─── COMPETITOR TRACKER ──────────────────────────────────────────────────────
const spawnTimes  = {}; // channelId → { name, ts }
const competitors = {}; // userId    → { name, times[], fastest, avg }

function recordSpawn(channelId, name) {
    spawnTimes[channelId] = { name, ts: Date.now() };
}

function recordCompetitorCatch(userId, username, channelId) {
    const spawn = spawnTimes[channelId];
    if (!spawn) return;
    const elapsed = Date.now() - spawn.ts;
    if (elapsed < 200 || elapsed > 30000) return;
    if (!competitors[userId]) {
        competitors[userId] = { name: username, times: [], fastest: 9999, avg: 9999 };
        logEvent(`🔍 Competitor detected: ${username}`, 'warn');
    }
    const c = competitors[userId];
    c.name = username;
    c.times.push(elapsed);
    if (c.times.length > 30) c.times.shift();
    c.fastest = Math.min(...c.times);
    c.avg = Math.round(c.times.reduce((a, b) => a + b, 0) / c.times.length);
    logEvent(`⚡ ${username}: caught in ${elapsed}ms (fastest: ${c.fastest}ms, avg: ${c.avg}ms)`, 'warn');
    broadcast('competitor', {
        userId, username, elapsed, fastest: c.fastest, avg: c.avg,
        all: Object.values(competitors).map(x => ({
            name: x.name, fastest: x.fastest, avg: x.avg, samples: x.times.length
        }))
    });
}

// ─── DASHBOARD SERVER ────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

if (Number(process.version.slice(1).split('.')[0]) < 8)
    throw new Error('Node 8.0.0 or higher is required.');

app.use(express.static(path.join(__dirname, 'dashboard')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'dashboard', 'index.html')));
app.get('/stats', (req, res) => res.sendFile(path.join(__dirname, 'dashboard', 'stats.html')));

// ─── STATS ───────────────────────────────────────────────────────────────────
// PC milestones per-pokemon: key = catchCount → PC earned at that milestone
const PC_MILESTONES = { 1:35, 10:350, 100:3500, 1000:35000, 10000:350000 };
const catchCountPerPokemon = {}; // pokemonName → total catches
let   totalPCEarned = 0;

// Quest milestones (per region): 20→2000, 50→5000, 100→10000, 200→20000, 500→50000
const QUEST_MILESTONES = [
    { target: 20,  reward: 2000  },
    { target: 50,  reward: 5000  },
    { target: 100, reward: 10000 },
    { target: 200, reward: 20000 },
    { target: 500, reward: 50000 },
];

const stats = {
    caught: 0, missed: 0, captchas: 0, spawns: 0,
    pc: 0,           // estimated PC earned this session
    startTime: Date.now(),
    recentCatches: [],
    botStatus: 'online',
    username: '',
    incenseStatus: {}, // channelId → { active, name, spawnsLeft }
};

// ─── RATE TRACKING ───────────────────────────────────────────────────────────
// Rolling arrays of timestamps (ms) for the last 60 minutes of catches/PC.
// Every catch pushes { ts, pc } into these arrays.
// calculateRates() trims old entries and derives per-min / per-hour values.
const rateWindow = []; // { ts: Number, pc: Number }

function pushRate(pc) {
    rateWindow.push({ ts: Date.now(), pc });
}

function calculateRates() {
    const now   = Date.now();
    const MIN1  = 60 * 1000;
    const HOUR1 = 60 * MIN1;

    // Trim entries older than 1 hour
    while (rateWindow.length > 0 && now - rateWindow[0].ts > HOUR1) rateWindow.shift();

    const lastMin  = rateWindow.filter(e => now - e.ts <= MIN1);
    const lastHour = rateWindow; // already trimmed to 1h

    const pokemonPerMin  = lastMin.length;
    const pokemonPerHour = lastHour.length;
    const pcPerMin       = lastMin.reduce((s, e) => s + e.pc, 0);
    const pcPerHour      = lastHour.reduce((s, e) => s + e.pc, 0);

    // Session-level averages (since boot)
    const sessionSecs = (now - stats.startTime) / 1000;
    const sessionMins = sessionSecs / 60;
    const avgPerMin   = sessionMins > 0 ? +(stats.caught / sessionMins).toFixed(2) : 0;
    const avgPerHour  = +(avgPerMin * 60).toFixed(1);

    return { pokemonPerMin, pokemonPerHour, pcPerMin, pcPerHour, avgPerMin, avgPerHour };
}

// Broadcast rate snapshot every 10 seconds
let rateInterval = null;
function startRateBroadcast() {
    if (rateInterval) return;
    rateInterval = setInterval(() => {
        const rates = calculateRates();
        broadcast('rates', rates);
    }, 10000);
}

// ─── HISTORY SNAPSHOTS (for graphs) ──────────────────────────────────────────
// Every 60 seconds record a data point so the Stats page can draw time-series graphs.
const history = {
    labels:          [], // HH:MM strings
    caught:          [],
    pc:              [],
    pokemonPerMin:   [],
    pcPerMin:        [],
};
const MAX_HISTORY = 60; // keep last 60 minutes of snapshots

function recordHistorySnapshot() {
    const now   = new Date();
    const label = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const rates = calculateRates();

    history.labels.push(label);
    history.caught.push(stats.caught);
    history.pc.push(stats.pc);
    history.pokemonPerMin.push(rates.pokemonPerMin);
    history.pcPerMin.push(rates.pcPerMin);

    // Trim to last MAX_HISTORY points
    ['labels','caught','pc','pokemonPerMin','pcPerMin'].forEach(k => {
        if (history[k].length > MAX_HISTORY) history[k].shift();
    });

    broadcast('history', history);
}

setInterval(recordHistorySnapshot, 60000);

function broadcast(type, data) {
    const payload = JSON.stringify({ type, data, ts: Date.now() });
    wss.clients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    });
}

function trackPC(pokemonName) {
    catchCountPerPokemon[pokemonName] = (catchCountPerPokemon[pokemonName] || 0) + 1;
    const n = catchCountPerPokemon[pokemonName];
    const pc = PC_MILESTONES[n] || 35; // base 35 PC per catch
    totalPCEarned += pc;
    stats.pc = totalPCEarned;
    pushRate(pc); // record for rate calculations
    // Quest progress broadcast
    const totalCaught = stats.caught;
    const nextQuest = QUEST_MILESTONES.find(q => q.target > totalCaught);
    if (nextQuest) {
        broadcast('quest', {
            total: totalCaught,
            next: nextQuest.target,
            reward: nextQuest.reward,
            pct: Math.round((totalCaught / nextQuest.target) * 100)
        });
    }
    if (PC_MILESTONES[n]) {
        broadcast('milestone', { pokemon: pokemonName, count: n, pc });
        logEvent(`💰 Milestone! ${n}th ${pokemonName} caught — earned ${pc} PC`, 'success');
    }
}

// Transfer state
let transferActive = false;

wss.on('connection', ws => {
    const rates = calculateRates();
    ws.send(JSON.stringify({ type: 'init', data: { ...stats, catchMode, catchSpeed, competitors: Object.values(competitors), ...rates, history } }));
    ws.on('message', raw => {
        try {
            const msg = JSON.parse(raw);
            if (msg.type === 'captcha_done') {
                isSleeping = false; stats.botStatus = 'online';
                broadcast('status', { status: 'online', sleeping: false });
                broadcast('log', { text: '✅ Captcha resolved from dashboard', level: 'success' });
            }
            if (msg.type === 'pause_bot') {
                isSleeping = true; stats.botStatus = 'paused';
                broadcast('status', { status: 'paused', sleeping: true });
                broadcast('log', { text: '⏸ Bot paused.', level: 'warn' });
            }
            if (msg.type === 'resume_bot') {
                isSleeping = false; stats.botStatus = 'online';
                broadcast('status', { status: 'online', sleeping: false });
                broadcast('log', { text: '▶️ Bot resumed.', level: 'success' });
            }
            if (msg.type === 'set_catch_mode') {
                const mode = msg.data?.mode;
                if (mode === 'direct' || mode === 'hint') {
                    catchMode = mode;
                    broadcast('catch_mode', { mode });
                    broadcast('log', { text: `🔄 Catch mode: ${mode.toUpperCase()}`, level: 'success' });
                }
            }
            if (msg.type === 'toggle_boost') {
                // Legacy support — toggle between normal and quick
                catchSpeed = catchSpeed === 'quick' ? 'normal' : 'quick';
                boostMode  = catchSpeed === 'quick';
                broadcast('catch_speed', { speed: catchSpeed });
                broadcast('log', { text: catchSpeed === 'quick' ? '🚀 Quick mode ON — 300–800ms catch delay' : '🛡️ Normal mode restored — stealth timing active', level: catchSpeed === 'quick' ? 'warn' : 'success' });
                logEvent(`Catch speed: ${catchSpeed}`, 'warn');
            }
            if (msg.type === 'set_catch_speed') {
                const speed = msg.data?.speed;
                if (['normal', 'quick', 'instant', 'slow'].includes(speed)) {
                    catchSpeed = speed;
                    boostMode  = speed === 'quick';
                    broadcast('catch_speed', { speed });
                    const labels = { slow: '🐢 Slow mode — 8–20s maximum stealth', normal: '🛡️ Normal mode — stealth timing (1–7s)', quick: '🚀 Quick mode — 300–800ms delay', instant: '⚡ Instant mode — no delay, no queue!' };
                    broadcast('log', { text: labels[speed], level: speed === 'instant' ? 'error' : speed === 'quick' ? 'warn' : 'success' });
                    logEvent(`Catch speed: ${speed}`, 'warn');
                }
            }
            if (msg.type === 'toggle_instant_catch') {
                // Legacy support
                catchSpeed = catchSpeed === 'instant' ? 'normal' : 'instant';
                broadcast('catch_speed', { speed: catchSpeed });
                broadcast('log', { text: catchSpeed === 'instant' ? '⚡ Instant Catch ON — no delay!' : '🛡️ Normal mode restored', level: catchSpeed === 'instant' ? 'error' : 'success' });
            }
            if (msg.type === 'transfer_all') {
                const { targetId, channelId } = msg.data;
                const ch = client.channels.cache.get(channelId);
                if (!ch) { broadcast('log', { text: `❌ Channel ${channelId} not found.`, level: 'error' }); return; }
                startTransfer(ch, targetId);
            }
        } catch (_) {}
    });
});

server.listen(process.env.PORT || 3000, () => {
    console.log(`Dashboard: http://localhost:${process.env.PORT || 3000}`);
    startRateBroadcast();
});

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function findOutput(input) {
    return json.hasOwnProperty(input) ? json[input] : input;
}

function extractPokemonName(message) {
    let raw = null;
    if (message.content) {
        const c = message.content.trim();
        if (c.includes(':_:') || c.includes('【')) {
            const m = c.match(/^[\*\#\s]*([^\n\r:_:\【\<]+?)\s*(?::_|:_:|【)/);
            if (m?.[1]?.trim()) raw = m[1].trim();
        }
        if (!raw && c.startsWith('##')) {
            const m = c.match(/^##\s+([^\n\r\<【]+?)[\s<【]/);
            if (m?.[1]?.trim()) raw = m[1].trim();
        }
    }
    if (!raw && message.embeds?.length) {
        for (const e of message.embeds) {
            const t = (e.title || '') + ' ' + (e.description || '');
            const m = t.match(/^\*?\*?([^\n\r:_:\【🏃\[]+?)\*?\*?\s*(🏃|【|\[|:_:|$)/);
            if (m?.[1]?.trim()) { raw = m[1].trim(); break; }
            const d = (e.description || '').match(/\*\*([^\n\r\*]+?)\*\*/);
            if (d?.[1]?.trim()) { raw = d[1].trim(); break; }
        }
    }
    if (!raw) return null;
    raw = raw.replace(/^[\*\#\s_]+|[\*\#\s_]+$/g, '').trim();
    return raw ? findOutput(raw) : null;
}

function addCatch(name, rarity, guild, channel) {
    const entry = { name, rarity, guild, channel, time: new Date().toLocaleTimeString() };
    stats.caught++;
    stats.recentCatches.unshift(entry);
    if (stats.recentCatches.length > 50) stats.recentCatches.pop();
    trackPC(name); // trackPC calls pushRate internally now
    broadcast('catch', entry);
    const rates = calculateRates();
    broadcast('stats', { caught: stats.caught, missed: stats.missed,
                         captchas: stats.captchas, spawns: stats.spawns,
                         pc: stats.pc, queueSize: catchQueue.length, ...rates });
}

function logEvent(text, level = 'info') {
    console.log(`[${level.toUpperCase()}] ${text}`);
    broadcast('log', { text, level, time: new Date().toLocaleTimeString() });
}

// ─── CATCH EXECUTOR (shared by all methods) ──────────────────────────────────
function doCatch(name, channel, guildName, chanName) {
    recordSpawn(channel.id, name);
    logEvent(`Pokémon spawned: ${name}`, 'info');
    broadcast('spawn', { name, method: 'Direct' });

    enqueueCatch(name, async () => {
        logEvent(`Catching ${name}...`, 'info');
        await channel.send(`<@716390085896962058> c ${name}`)
            .catch(e => { logEvent(`Send error: ${e}`, 'error'); });

        const collector = new Discord.MessageCollector(
            channel, m => m.author.id === '716390085896962058', { max: 1, time: 13000 }
        );
        await new Promise(resolve => {
            collector.on('collect', async collected => {
                if (collected.content.includes('Congratulations')) {
                    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); }
                    let rarity;
                    const n2 = cap(name);
                    try { rarity = await checkRarity(n2); } catch { rarity = 'Not Found'; }
                    addCatch(n2, rarity, guildName, chanName);
                    client.channels.cache.get(config.logChannelID)
                        ?.send(`[${guildName}/#${chanName}] **__${n2}__** Rarity ${rarity}`)
                        .catch(e => logEvent(`Log error: ${e}`, 'error'));
                }
                resolve();
            });
            collector.on('end', () => resolve());
        });
    });
}

// ─── TRANSFER ALL ────────────────────────────────────────────────────────────
async function startTransfer(channel, targetId) {
    if (transferActive) {
        broadcast('log', { text: '⚠️ Transfer already in progress.', level: 'warn' }); return;
    }
    transferActive = true;
    logEvent(`Starting transfer to <@${targetId}>...`, 'info');
    broadcast('transfer', { status: 'started', targetId });

    await channel.send(`<@716390085896962058> trade <@${targetId}>`);
    logEvent('Trade request sent — waiting for accept...', 'info');

    try {
        await new Promise((resolve, reject) => {
            const col = new Discord.MessageCollector(channel, m => m.author.id === '716390085896962058', { time: 120000 });
            col.on('collect', m => {
                const t = (m.content + (m.embeds[0]?.description || '') + (m.embeds[0]?.title || '')).toLowerCase();
                if (t.includes('trade between') || t.includes('trade started')) { col.stop(); resolve(); }
            });
            col.on('end', (_, r) => { if (r !== 'user') reject(new Error('Not accepted in 2 minutes.')); });
        });
    } catch (e) {
        logEvent(`❌ Transfer cancelled: ${e.message}`, 'error');
        broadcast('transfer', { status: 'failed', reason: e.message });
        transferActive = false; return;
    }

    logEvent('Trade accepted! Adding Pokémon in batches...', 'success');
    let batches = 0, done = false;
    while (!done) {
        await sleep(1800);
        await channel.send(`<@716390085896962058> t aa`);
        batches++;
        broadcast('transfer', { status: 'adding', batch: batches });
        await sleep(3500);
        const recent = await channel.messages.fetch({ limit: 6 });
        for (const [, m] of recent) {
            if (m.author.id !== '716390085896962058') continue;
            const t = (m.content + (m.embeds[0]?.description || '')).toLowerCase();
            if (t.includes('no pokémon') || t.includes('nothing to add') || t.includes('added 0') || t.includes("0 pokémon")) { done = true; break; }
        }
        if (batches >= 60) done = true;
    }

    logEvent('All added — confirming...', 'info');
    await sleep(1500);
    await channel.send(`<@716390085896962058> confirm`);
    let confirmed = false;
    try {
        await new Promise((resolve, reject) => {
            const col = new Discord.MessageCollector(channel, m => m.author.id === '716390085896962058', { time: 20000 });
            col.on('collect', async m => {
                if ((m.components?.length > 0) || m.content.toLowerCase().includes('confirm')) {
                    try { await m.clickButton(); confirmed = true; } catch (e) {
                        try {
                            const btn = m.components[0]?.components?.find(c => c.label?.toLowerCase().includes('confirm') || c.emoji?.name === '✅');
                            if (btn) { await m.clickButton(btn.customId); confirmed = true; }
                        } catch (_) {}
                    }
                    col.stop(); resolve();
                }
            });
            col.on('end', (_, r) => { if (r !== 'user') reject(new Error('No confirm button in 20s.')); });
        });
    } catch (e) { logEvent(`Confirm issue: ${e.message}`, 'warn'); }

    if (confirmed) { logEvent(`✅ Transfer to ${targetId} done! (${batches} batches)`, 'success'); broadcast('transfer', { status: 'done', targetId, batches }); }
    else { logEvent('Transfer finished — verify in Discord.', 'warn'); broadcast('transfer', { status: 'maybe_done', targetId, batches }); }
    transferActive = false;
}

// ─── CATCH SPEED — DELAY LOGIC ───────────────────────────────────────────────
// 'slow'    — gaussian 8–20 s (maximum stealth, private servers)
// 'normal'  — gaussian 1–7 s + session jitter (default, safest for public)
// 'quick'   — 300–800 ms, queued, competitor-aware (old boost mode)
// 'instant' — no delay, no queue (max ban risk)
// Toggle from dashboard tray or via $speed command.
let boostMode = false; // kept for backwards compat with $boost Discord command

function getDelay() {
    const allTimes = Object.values(competitors).map(c => c.fastest).filter(f => f < 9999);
    const fastest  = allTimes.length > 0 ? Math.min(...allTimes) : null;

    if (catchSpeed === 'slow') {
        // Slow: gaussian centred at 14 s, range ~8–20 s — maximum stealth
        const r1 = Math.random(), r2 = Math.random();
        const g  = Math.sqrt(-2 * Math.log(r1)) * Math.cos(2 * Math.PI * r2);
        const ms = Math.round(14000 + g * 3000 + SESSION_JITTER);
        return Math.max(8000, Math.min(20000, ms));
    }

    if (catchSpeed === 'quick') {
        // Quick: 300–800 ms with competitor undercut
        const base = Math.floor(Math.random() * 500) + 300;
        if (fastest !== null)
            return Math.max(200, fastest - 200 + Math.floor(Math.random() * 100));
        return base;
    }

    // Normal: gaussian 1–7 s + session jitter + competitor undercut
    const r1 = Math.random(), r2 = Math.random();
    const g  = Math.sqrt(-2 * Math.log(r1)) * Math.cos(2 * Math.PI * r2);
    let ms   = Math.round(3000 + g * 1200 + SESSION_JITTER);
    if (fastest !== null)
        ms = Math.min(ms, fastest - 300 + Math.floor(Math.random() * 150));
    return Math.max(800, Math.min(7000, ms));
}

// Override humanDelay to use getDelay
function humanDelay() { return getDelay(); }


// ─── INCENSE MANAGER ─────────────────────────────────────────────────────────
// Key facts:
//  - "@Pokétwo incense buy" must be sent IN the channel you want incense in
//  - Costs 50 shards. To buy shards: "@Pokétwo buy shard 50" (costs 10,000 PC)
//  - Spawns every 20s for 1 hour (180 spawns total)
//  - Stop: "@Pokétwo stopincense"
//  - Cannot stack in same channel. Can run multiple channels at once.
const incenseActive = {}; // channelId → bool

async function checkIncenseStatus(channel) {
    try {
        await channel.send(`<@716390085896962058> incense`);
        await sleep(3500);
        const msgs = await channel.messages.fetch({ limit: 8 });
        for (const [, m] of msgs) {
            if (m.author.id !== '716390085896962058') continue;
            const txt = (m.content + (m.embeds[0]?.description || '') + (m.embeds[0]?.title || '')
                       + (m.embeds[0]?.fields || []).map(f => f.name + f.value).join(' ')).toLowerCase();
            if (txt.includes(`#${channel.id}`) || txt.includes(`<#${channel.id}>`) ||
                (txt.includes('active') && txt.includes(channel.name?.toLowerCase()))) {
                incenseActive[channel.id] = true;
                logEvent(`Incense #${channel.name}: ACTIVE ✅`, 'success');
                broadcast('incense', { channelId: channel.id, name: channel.name, active: true });
                return true;
            }
            if (txt.includes('incense') || txt.includes('no active')) {
                incenseActive[channel.id] = false;
                logEvent(`Incense #${channel.name}: not active`, 'info');
                broadcast('incense', { channelId: channel.id, name: channel.name, active: false });
                return false;
            }
        }
        incenseActive[channel.id] = false;
        return false;
    } catch (e) {
        logEvent(`Incense check error #${channel.name}: ${e}`, 'error');
        incenseActive[channel.id] = false;
        return false;
    }
}

async function buyIncense(channel) {
    logEvent(`Buying incense in #${channel.name}... (costs 50 shards / 10,000 PC)`, 'info');
    try {
        // buy incense must be sent in the target channel — Pokétwo ties it to that channel
        // Command migrated: old "buy incense" → new "incense buy"
        await channel.send(`<@716390085896962058> incense buy`);
        // Wait for Pokétwo's confirm button and click it
        await new Promise((resolve) => {
            const col = new Discord.MessageCollector(channel, m => m.author.id === '716390085896962058', { time: 15000 });
            col.on('collect', async m => {
                if (m.components?.length > 0) {
                    try { await m.clickButton(); } catch (_) {}
                    col.stop(); resolve();
                } else if (m.content.toLowerCase().includes('incense')) {
                    col.stop(); resolve();
                }
            });
            col.on('end', () => resolve());
        });
        await sleep(1500);
        incenseActive[channel.id] = true;
        logEvent(`Incense activated in #${channel.name} ✅`, 'success');
        broadcast('incense', { channelId: channel.id, name: channel.name, active: true });
        broadcast('log', { text: `🌿 Incense active in #${channel.name}`, level: 'success' });
    } catch (e) {
        logEvent(`Failed to buy incense in #${channel.name}: ${e}`, 'error');
    }
}

async function buyShards(channel, amount = 50) {
    // Buy shards with PC: 200 PC per shard. 50 shards = 10,000 PC
    logEvent(`Buying ${amount} shards (costs ${amount * 200} PC)...`, 'info');
    await channel.send(`<@716390085896962058> buy shard ${amount}`);
    await sleep(2000);
}

async function initIncense(incenseChannels) {
    logEvent('Checking incense on all channels...', 'info');
    for (const ch of incenseChannels) {
        await sleep(1500);
        const active = await checkIncenseStatus(ch);
        if (!active) { await sleep(1000); await buyIncense(ch); }
    }
    logEvent('Incense init complete.', 'success');
}

async function refreshIncense(incenseChannels) {
    for (const ch of incenseChannels) {
        await sleep(1500);
        const active = await checkIncenseStatus(ch);
        if (!active) { await sleep(1000); await buyIncense(ch); }
        else logEvent(`Skipping #${ch.name} — incense still active`, 'info');
    }
}

function startIncenseSpam(ch) {
    (function loop() {
        if (isSleeping) { setTimeout(loop, 3000); return; }
        if (!incenseActive[ch.id]) { setTimeout(loop, 10000); return; }
        ch.send(Math.random().toString(36).substring(2, 15) + ' ').catch(() => {});
        setTimeout(loop, Math.floor(Math.random() * 3000) + 2000);
    })();
}


// ─── ANTI-CRASH ──────────────────────────────────────────────────────────────
process.on('unhandledRejection', (r) => {
    if (String(r) !== 'Error: Unable to identify that pokemon.')
        logEvent(`[antiCrash] Unhandled: ${r}`, 'error');
});
process.on('uncaughtException', (e) => logEvent(`[antiCrash] Exception: ${e}`, 'error'));

// ─── READY ───────────────────────────────────────────────────────────────────
client.on('ready', () => {
    stats.username  = client.user.username;
    stats.botStatus = 'online';
    logEvent(`${client.user.username} is ONLINE — session jitter: ${SESSION_JITTER > 0 ? '+' : ''}${SESSION_JITTER}ms`, 'success');
    logEvent(`Boost mode: ${boostMode ? 'ON 🚀' : 'OFF'} | Catch mode: ${catchMode}`, 'info');
    broadcast('status', { status: 'online', sleeping: false, username: client.user.username, boostMode });

    // Main spam channel
    const spamCh = client.channels.cache.get(config.spamChannelID);
    if (spamCh) {
        (function spam() {
            if (!isSleeping) spamCh.send(Math.random().toString(36).substring(2, 15) + '(Made by 🔥⃤•AK_ØPᵈᵉᵛ✓#6326) ').catch(() => {});
            setTimeout(spam, Math.floor(Math.random() * 3500) + 1500);
        })();
    }

    // Incense channels
    const incenseIDs = Array.isArray(config.incenseChannelIDs)
        ? config.incenseChannelIDs
        : (config.incenseChannelID ? [config.incenseChannelID] : []);
    const incenseChannels = incenseIDs.map(id => client.channels.cache.get(id)).filter(Boolean);

    if (incenseChannels.length > 0) {
        logEvent(`${incenseChannels.length} incense channel(s) found.`, 'info');
        for (const ch of incenseChannels) { incenseActive[ch.id] = false; startIncenseSpam(ch); }
        setTimeout(() => initIncense(incenseChannels), 6000);
        setInterval(() => refreshIncense(incenseChannels), 60 * 60 * 1000); // check every hour
    }
});


// ─── AUTOCATCHER ─────────────────────────────────────────────────────────────
client.on('messageCreate', async message => {

    // Competitor detection — watch for others catching
    if (message.author.id !== client.user?.id &&
        message.author.id !== '716390085896962058' &&
        message.author.id !== config.OwnerID &&
        /^<@716390085896962058>\s+c\s+\S+/i.test(message.content)) {
        recordCompetitorCatch(message.author.id, message.author.username || message.author.id, message.channel.id);
    }

    // ── Owner commands ──
    if (message.author.id !== config.OwnerID) {} // handled below
    if (message.content === '$captcha_completed' && message.author.id === config.OwnerID) {
        isSleeping = false; stats.botStatus = 'online';
        broadcast('status', { status: 'online', sleeping: false });
        broadcast('captcha_resolved', {});
        message.channel.send('Autocatcher resumed!');
        logEvent('Captcha resolved via Discord.', 'success');
    }
    if (message.content === '$boost' && message.author.id === config.OwnerID) {
        catchSpeed = catchSpeed === 'quick' ? 'normal' : 'quick';
        boostMode  = catchSpeed === 'quick';
        message.channel.send(`🚀 Catch speed: **${catchSpeed.toUpperCase()}**`);
        broadcast('catch_speed', { speed: catchSpeed });
        logEvent(`Catch speed via $boost: ${catchSpeed}`, 'warn');
    }
    if (message.content.startsWith('$speed') && message.author.id === config.OwnerID) {
        const arg = message.content.split(' ')[1]?.toLowerCase();
        if (['normal','quick','instant','slow'].includes(arg)) {
            catchSpeed = arg;
            boostMode  = arg === 'quick';
            message.channel.send(`⚡ Catch speed set to **${catchSpeed.toUpperCase()}**`);
            broadcast('catch_speed', { speed: catchSpeed });
            logEvent(`Catch speed via $speed: ${catchSpeed}`, 'warn');
        } else {
            message.channel.send('Usage: `$speed slow|normal|quick|instant`');
        }
    }
    if (message.content === '$help' && message.author.id === config.OwnerID) {
        message.channel.send('```\nPoketwo-Autocatcher v1.6.3\n' +
            '$captcha_completed — resume after captcha\n' +
            '$boost             — toggle between normal and quick speed\n' +
            '$speed <mode>      — set catch speed: normal | quick | instant\n' +
            '$say <text>        — send a message\n' +
            '$react <msgID>     — react ✅\n' +
            '$click <msgID>     — click ✅ button\n' +
            '$transferall <uid> — bulk transfer all pokemon\n' +
            '$help              — this message\n```');
    }
    if (message.content.startsWith('$say') && message.author.id === config.OwnerID) {
        message.channel.send(message.content.split(' ').slice(1).join(' '));
    }
    if (message.content.startsWith('$react') && message.author.id === config.OwnerID) {
        try {
            const id = message.content.trim().split(/\s+/)[1];
            const m  = await message.channel.messages.fetch(id);
            m.react('✅'); message.react('✅');
        } catch { message.react('❌'); }
    }
    if (message.content.startsWith('$click') && message.author.id === config.OwnerID) {
        try {
            const id = message.content.trim().split(/\s+/)[1];
            const m  = await message.channel.messages.fetch(id);
            await m.clickButton(); message.react('✅');
        } catch { message.react('❌'); }
    }
    if (message.content.startsWith('$transferall') && message.author.id === config.OwnerID) {
        const uid = message.content.trim().split(/\s+/)[1];
        if (!uid) { message.channel.send('Usage: `$transferall <userID>`'); return; }
        message.channel.send(`Starting transfer to <@${uid}> — they must accept the trade!`);
        startTransfer(message.channel, uid);
    }

    if (isSleeping) return;

    // ── Pokétwo events ──
    if (message.content.includes('Please tell us') && message.author.id === '716390085896962058') {
        isSleeping = true; stats.botStatus = 'captcha'; stats.captchas++;
        message.channel.send('Autocatcher paused — captcha detected! Type `$captcha_completed` once solved.');
        logEvent('⚠️ CAPTCHA DETECTED', 'warn');
        broadcast('captcha', { time: new Date().toLocaleTimeString() });
        broadcast('status', { status: 'captcha', sleeping: true });
        broadcast('stats', { caught: stats.caught, missed: stats.missed, captchas: stats.captchas, spawns: stats.spawns, pc: stats.pc, ...calculateRates() });
        setTimeout(() => { isSleeping = false; stats.botStatus = 'online'; broadcast('status', { status: 'online', sleeping: false }); logEvent('Auto-resumed (5h timeout).', 'info'); }, 18000000);
        return;
    }

    if (message.content === 'That is the wrong pokémon!' && message.author.id === '716390085896962058') {
        stats.missed++;
        const rate = stats.missed / (stats.caught + stats.missed);
        if (rate > 0.4 && (stats.caught + stats.missed) > 10)
            broadcast('warning', { type: 'miss_rate', msg: `⚠️ Miss rate ${Math.round(rate*100)}% — name detection may be off`, level: 'warn' });
        logEvent('Wrong Pokémon — missed.', 'warn');
        broadcast('stats', { caught: stats.caught, missed: stats.missed, captchas: stats.captchas, spawns: stats.spawns, pc: stats.pc, ...calculateRates() });
        if (catchMode === 'hint') message.channel.send(`<@716390085896962058> h`);
        return;
    }

    // Incense spawn footer
    if (message.author.id === '716390085896962058' && message?.embeds[0]?.footer?.text?.includes('Spawns Remaining')) {
        if (catchMode === 'hint') message.channel.send(`<@716390085896962058> h`);
        if (message.embeds[0].footer.text.includes('Spawns Remaining: 0')) {
            incenseActive[message.channel.id] = false;
            broadcast('incense', { channelId: message.channel.id, name: message.channel.name, active: false });
            logEvent(`Incense ended in #${message.channel.name} — rebuying...`, 'warn');
            await sleep(1000);
            await buyIncense(message.channel);
        }
        return;
    }

    // Hint solve
    if (catchMode === 'hint' && message.author.id === '716390085896962058' && message.content.includes('The pokémon is')) {
        try {
            const pokemon = await solveHint(message);
            const name = pokemon[0];
            doCatch(name, message.channel, message.guild?.name || '?', message.channel?.name || '?');
        } catch (e) { logEvent(`Hint solve error: ${e}`, 'error'); }
        return;
    }

    // Poke-Name / Sierra bot spawn detection
    const POKEBOTS = ['696161886734909481', '874910942490677270'];
    if (!POKEBOTS.includes(message.author.id)) return;

    if (catchMode === 'hint') {
        await message.channel.send(`<@716390085896962058> h`);
        return;
    }

    // Direct mode — extract name from Poke-Name message
    const name = extractPokemonName(message);
    if (name) {
        doCatch(name, message.channel, message.guild?.name || '?', message.channel?.name || '?');
        return;
    }

    // OCR fallback for image embeds (incense channels without Poke-Name)
    let imgURL = null;
    for (const e of message.embeds) {
        if (e.image?.url?.includes('prediction.png')) { imgURL = e.image.url; break; }
        if (e.image?.url?.includes('embed.png') && !imgURL) imgURL = e.image.url;
    }
    if (imgURL) {
        try {
            const res  = await ocrSpace(imgURL, { apiKey: config.ocrSpaceApiKey });
            const raw  = res.ParsedResults[0].ParsedText.split('\r')[0].replace(/Q/g, 'R');
            const ocrName = findOutput(raw);
            if (ocrName) doCatch(ocrName, message.channel, message.guild?.name || '?', message.channel?.name || '?');
        } catch (e) {
            logEvent(`OCR error: ${e}`, 'error');
            client.channels.cache.get(config.errorChannelID)?.send(String(e));
        }
    }
});

client.login(config.TOKEN);
