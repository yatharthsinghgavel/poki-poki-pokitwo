/*
@Developer: 🔥⃤•AK_ØPᵈᵉᵛ✓#6326 / akshatop
Name: Poketwo-Autocatcher
Version: V1.3.2
Description: bot to help users with catching pokemons
@Supported: poketwo/pokemon
*/
const Discord = require("discord.js-selfbot-v13")
const client = new Discord.Client({ checkUpdate: false });
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { solveHint, checkRarity } = require("pokehint")
const { ocrSpace } = require('ocr-space-api-wrapper');

const config = require('./config.json')
const json = require('./namefix.json');
const allowedChannels = [];
let isSleeping = false;
let catchMode = 'direct'; // 'direct' or 'hint' — toggled from dashboard

// ---- CATCH QUEUE (anti-detection: never send two catches at the same time) ----
const catchQueue = [];
let catchBusy = false;
let lastCatchTime = 0;

function humanDelay() {
    // Fast mode: 300-6500ms — beats public version while looking human
    return Math.floor(Math.random() * 6200) + 300;
}

async function processCatchQueue() {
    if (catchBusy || catchQueue.length === 0) return;
    catchBusy = true;

    while (catchQueue.length > 0) {
        const job = catchQueue.shift();
        broadcast('queue', { size: catchQueue.length, processing: job.name });

        // Ensure minimum gap from last catch (at least 300ms between any two catch commands)
        const elapsed = Date.now() - lastCatchTime;
        const minGap = 300 + Math.floor(Math.random() * 200); // 300-500ms minimum gap
        if (elapsed < minGap) {
            await sleep(minGap - elapsed);
        }

        // Wait the human-like delay
        await sleep(job.delay);

        lastCatchTime = Date.now();
        try {
            await job.execute();
        } catch (err) {
            logEvent(`Catch queue error: ${err}`, 'error');
        }
    }

    catchBusy = false;
    broadcast('queue', { size: 0, processing: null });
}

function enqueueCatch(name, delay, executeFn) {
    catchQueue.push({ name, delay, execute: executeFn });
    stats.spawns++;
    broadcast('stats', {
        caught: stats.caught, missed: stats.missed, captchas: stats.captchas,
        spawns: stats.spawns, queueSize: catchQueue.length
    });
    processCatchQueue();
}

//------------------------- DASHBOARD SERVER --------------------------------//

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

if (Number(process.version.slice(1).split(".")[0]) < 8)
    throw new Error("Node 8.0.0 or higher is required.");

// Serve dashboard static files
app.use(express.static(path.join(__dirname, 'dashboard')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard', 'index.html'));
});

// Stats tracking
const stats = {
    caught: 0,
    missed: 0,
    captchas: 0,
    spawns: 0,
    startTime: Date.now(),
    recentCatches: [],   // last 50 catches
    botStatus: 'online',
    username: '',
};

// Broadcast to all connected dashboard clients
function broadcast(type, data) {
    const payload = JSON.stringify({ type, data, ts: Date.now() });
    wss.clients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    });
}

// Transfer state
let transferActive = false;
let transferChannelId = null;

// Send full state to a newly connected client
wss.on('connection', ws => {
    ws.send(JSON.stringify({ type: 'init', data: { ...stats, catchMode } }));

    ws.on('message', raw => {
        try {
            const msg = JSON.parse(raw);
            if (msg.type === 'captcha_done') {
                isSleeping = false;
                stats.botStatus = 'online';
                broadcast('status', { status: 'online', sleeping: false });
                broadcast('log', { text: '✅ Captcha marked as completed from dashboard', level: 'success' });
            }
            if (msg.type === 'pause_bot') {
                isSleeping = true;
                stats.botStatus = 'paused';
                broadcast('status', { status: 'paused', sleeping: true });
                broadcast('log', { text: '⏸ Bot paused from dashboard.', level: 'warn' });
            }
            if (msg.type === 'resume_bot') {
                isSleeping = false;
                stats.botStatus = 'online';
                broadcast('status', { status: 'online', sleeping: false });
                broadcast('log', { text: '▶️ Bot resumed from dashboard.', level: 'success' });
            }
            // Dashboard triggered transfer
            if (msg.type === 'transfer_all') {
                const { targetId, channelId } = msg.data;
                if (!targetId || !channelId) return;
                const ch = client.channels.cache.get(channelId);
                if (!ch) {
                    broadcast('log', { text: `❌ Channel ${channelId} not found.`, level: 'error' });
                    return;
                }
                startTransfer(ch, targetId);
            }
            if (msg.type === 'set_catch_mode') {
                const mode = msg.data?.mode;
                if (mode === 'direct' || mode === 'hint') {
                    catchMode = mode;
                    broadcast('catch_mode', { mode: catchMode });
                    broadcast('log', { text: `🔄 Catch mode changed to: ${catchMode.toUpperCase()}`, level: 'success' });
                    logEvent(`Catch mode changed to: ${catchMode}`, 'info');
                }
            }
        } catch (_) {}
    });
});

server.listen(process.env.PORT || 3000, () => {
    console.log(`Dashboard running at http://localhost:${process.env.PORT || 3000}`);
});

//--------------------------------------------------------------//

//------------------------- HELPERS --------------------------------//

function findOutput(input) {
    if (json.hasOwnProperty(input)) return json[input];
    return input;
}

function extractPokemonName(message) {
    let rawText = null;

    if (message.content) {
        const content = message.content.trim();

        // 1. Format: "Deino :_:【:dark_type::dragon_type:】" or "Pidove :_:【:normal_type::flying_type:】"
        if (content.includes(":_:") || content.includes("【")) {
            const match = content.match(/^[\*\#\s]*([^\n\r:_:\【\<]+?)\s*(?::_|:_:|【)/);
            if (match && match[1].trim()) {
                rawText = match[1].trim();
            }
        }

        // 2. Format: "## PokemonName <emoji>"
        if (!rawText && content.startsWith("##")) {
            const contentMatch = content.match(/^##\s+([^\n\r\<【]+?)[\s<【]/);
            if (contentMatch && contentMatch[1].trim()) {
                rawText = contentMatch[1].trim();
            }
        }
    }

    // 3. Fallback: Embed titles and descriptions
    if (!rawText && message.embeds && message.embeds.length > 0) {
        for (const e of message.embeds) {
            const raw = (e.title || "") + " " + (e.description || "");
            const match = raw.match(/^\*?\*?([^\n\r:_:\【🏃\[]+?)\*?\*?\s*(🏃|【|\[|:_:|$)/);
            if (match && match[1].trim()) {
                rawText = match[1].trim();
                break;
            }
            const descMatch = (e.description || "").match(/\*\*([^\n\r\*]+?)\*\*/);
            if (descMatch && descMatch[1].trim()) {
                rawText = descMatch[1].trim();
                break;
            }
        }
    }

    if (!rawText) return null;

    // Clean up markdown formatting characters (*, #, _, spaces)
    rawText = rawText.replace(/^[\*\#\s_]+|[\*\#\s_]+$/g, '').trim();
    if (!rawText) return null;

    return findOutput(rawText);
}

function addCatch(name, rarity, guild, channel) {
    const entry = {
        name,
        rarity,
        guild,
        channel,
        time: new Date().toLocaleTimeString()
    };
    stats.caught++;
    stats.recentCatches.unshift(entry);
    if (stats.recentCatches.length > 50) stats.recentCatches.pop();
    broadcast('catch', entry);
    broadcast('stats', { caught: stats.caught, missed: stats.missed, captchas: stats.captchas });
}

function logEvent(text, level = 'info') {
    console.log(`[${level.toUpperCase()}] ${text}`);
    broadcast('log', { text, level, time: new Date().toLocaleTimeString() });
}

//--------------------------------------------------------------//

//------------------------- TRANSFER ALL --------------------------------//

// startTransfer: initiates a trade with targetId in the given channel,
// waits for them to accept, then batch-adds all pokemon (p!t aa repeated),
// then confirms via button click.
async function startTransfer(channel, targetId) {
    if (transferActive) {
        broadcast('log', { text: '⚠️ A transfer is already in progress.', level: 'warn' });
        return;
    }
    transferActive = true;
    transferChannelId = channel.id;

    logEvent(`Starting transfer to <@${targetId}>...`, 'info');
    broadcast('transfer', { status: 'started', targetId });

    // Step 1: Initiate trade
    await channel.send(`<@716390085896962058> trade <@${targetId}>`);
    logEvent('Trade request sent — waiting for target to accept...', 'info');

    // Step 2: Wait for Pokétwo to confirm trade opened (embed with "Trade between")
    let tradeOpenMsg = null;
    try {
        tradeOpenMsg = await new Promise((resolve, reject) => {
            const collector = new Discord.MessageCollector(channel, m => m.author.id === '716390085896962058', { time: 120000 });
            collector.on('collect', m => {
                const txt = m.content + (m.embeds[0]?.description || '') + (m.embeds[0]?.title || '');
                if (txt.toLowerCase().includes('trade between') || txt.toLowerCase().includes('trade started')) {
                    collector.stop();
                    resolve(m);
                }
            });
            collector.on('end', (col, reason) => {
                if (reason !== 'user') reject(new Error('Trade not accepted within 2 minutes.'));
            });
        });
    } catch (err) {
        logEvent(`❌ Transfer cancelled: ${err.message}`, 'error');
        broadcast('transfer', { status: 'failed', reason: err.message });
        transferActive = false;
        return;
    }

    logEvent('Trade accepted! Adding all Pokémon in batches of 10...', 'success');

    // Step 3: Batch add — p!t aa adds 10 at a time, repeat until Pokétwo
    // signals nothing left to add.
    let batchCount = 0;
    let done = false;

    while (!done) {
        await sleep(1800);
        await channel.send(`<@716390085896962058> t aa`);
        batchCount++;
        logEvent(`Batch ${batchCount}: sent p!t aa`, 'info');
        broadcast('transfer', { status: 'adding', batch: batchCount });

        // Wait for Pokétwo's response to this batch
        await sleep(3500);

        const recent = await channel.messages.fetch({ limit: 6 });
        for (const [, m] of recent) {
            if (m.author.id !== '716390085896962058') continue;
            const txt = (m.content + (m.embeds[0]?.description || '')).toLowerCase();
            if (
                txt.includes('no pokémon') || txt.includes('no pokemon') ||
                txt.includes('nothing to add') || txt.includes('added 0') ||
                txt.includes("you don't have") || txt.includes('0 pokémon added')
            ) {
                done = true;
                break;
            }
        }

        if (batchCount >= 60) done = true; // safety cap (600 pokemon)
    }

    logEvent(`All Pokémon added (${batchCount} batches). Sending confirm...`, 'info');

    // Step 4: Send "@Pokétwo confirm" — Pokétwo replies with a confirm button
    await sleep(1500);
    await channel.send(`<@716390085896962058> confirm`);

    // Step 5: Wait for Pokétwo's confirm button message and click it
    let confirmed = false;
    try {
        await new Promise((resolve, reject) => {
            const collector = new Discord.MessageCollector(channel, m => m.author.id === '716390085896962058', { time: 20000 });
            collector.on('collect', async m => {
                // Pokétwo sends a message with a confirm/✅ button
                const hasButton = m.components && m.components.length > 0;
                const txt = (m.content + (m.embeds[0]?.description || '')).toLowerCase();
                if (hasButton || txt.includes('confirm') || txt.includes('are you sure')) {
                    try {
                        await m.clickButton();
                        confirmed = true;
                        logEvent('✅ Confirm button clicked!', 'success');
                    } catch (e) {
                        // Try clicking the first available button by label
                        try {
                            const btn = m.components[0]?.components?.find(c =>
                                c.label?.toLowerCase().includes('confirm') || c.emoji?.name === '✅'
                            );
                            if (btn) await m.clickButton(btn.customId);
                            confirmed = true;
                        } catch (e2) {
                            logEvent(`Button click error: ${e2}`, 'error');
                        }
                    }
                    collector.stop();
                    resolve();
                }
            });
            collector.on('end', (_, reason) => {
                if (reason !== 'user') reject(new Error('No confirm button appeared within 20s.'));
            });
        });
    } catch (err) {
        logEvent(`⚠️ Confirm step issue: ${err.message}`, 'warn');
    }

    // Step 6: Wait briefly and check for completion message
    await sleep(3000);
    const finalMsgs = await channel.messages.fetch({ limit: 5 });
    const completedMsg = [...finalMsgs.values()].find(m =>
        m.author.id === '716390085896962058' &&
        (m.content.toLowerCase().includes('trade completed') ||
         m.content.toLowerCase().includes('successfully traded') ||
         (m.embeds[0]?.description || '').toLowerCase().includes('completed'))
    );

    if (completedMsg || confirmed) {
        logEvent(`✅ Transfer to <@${targetId}> completed! (${batchCount} batches)`, 'success');
        broadcast('transfer', { status: 'done', targetId, batches: batchCount });
    } else {
        logEvent(`⚠️ Transfer finished — verify in Discord.`, 'warn');
        broadcast('transfer', { status: 'maybe_done', targetId, batches: batchCount });
    }

    transferActive = false;
    transferChannelId = null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

//--------------------------------------------------------------//

//------------------------- INCENSE MANAGER --------------------------------//

// Tracks which incense channels currently have active incense
const incenseActive = {}; // channelId -> true/false

// Check a single incense channel by sending @Pokétwo incense and reading response
async function checkIncenseStatus(channel) {
    try {
        await channel.send(`<@716390085896962058> incense`);
        await sleep(3000);
        const msgs = await channel.messages.fetch({ limit: 5 });
        for (const [, m] of msgs) {
            if (m.author.id !== '716390085896962058') continue;
            const txt = (m.content + (m.embeds[0]?.description || '') + (m.embeds[0]?.footer?.text || '')).toLowerCase();
            if (txt.includes('active') || txt.includes('spawns remaining') || txt.includes('incense is active')) {
                incenseActive[channel.id] = true;
                logEvent(`Incense check #${channel.name}: ACTIVE ✅`, 'success');
                return true;
            }
            if (txt.includes('no active') || txt.includes('not active') || txt.includes('you don') || txt.includes('inactive')) {
                incenseActive[channel.id] = false;
                logEvent(`Incense check #${channel.name}: inactive`, 'info');
                return false;
            }
        }
        // Couldn't determine — assume inactive to be safe
        incenseActive[channel.id] = false;
        return false;
    } catch (e) {
        logEvent(`Incense check error on #${channel.name}: ${e}`, 'error');
        incenseActive[channel.id] = false;
        return false;
    }
}

// Buy shards then buy + use 2h incense in a channel
async function buyAndUseIncense(channel) {
    logEvent(`Buying 2h incense in #${channel.name}...`, 'info');
    try {
        // Buy 2h incense (costs shards — item ID for 2h incense is "incense2")
        await channel.send(`<@716390085896962058> buy incense2`);
        await sleep(2500);
        await channel.send(`<@716390085896962058> use incense`);
        await sleep(2000);
        incenseActive[channel.id] = true;
        logEvent(`2h incense activated in #${channel.name} ✅`, 'success');
        broadcast('log', { text: `🌿 2h incense activated in #${channel.name}`, level: 'success' });
    } catch (e) {
        logEvent(`Failed to buy/use incense in #${channel.name}: ${e}`, 'error');
    }
}

// Farm shards in the spam channel before buying incense
async function farmShards() {
    const spamCh = client.channels.cache.get(config.spamChannelID);
    if (!spamCh) return;
    logEvent('Farming shards...', 'info');
    try {
        await spamCh.send(`<@716390085896962058> sh`); // check shard balance
        await sleep(2000);
    } catch (e) {
        logEvent(`Shard farm error: ${e}`, 'error');
    }
}

// On boot: check each incense channel — skip active ones, buy for inactive ones
async function initIncense(incenseChannels) {
    logEvent('Checking incense status on all channels at startup...', 'info');
    for (const ch of incenseChannels) {
        await sleep(1500);
        const active = await checkIncenseStatus(ch);
        if (!active) {
            await sleep(1000);
            await buyAndUseIncense(ch);
        }
    }
    logEvent('Incense init complete.', 'success');
}

// Every 2h: farm shards, then check each channel and rebuy where needed
async function scheduledIncenseRefresh(incenseChannels) {
    await farmShards();
    await sleep(3000);
    for (const ch of incenseChannels) {
        await sleep(1500);
        const active = await checkIncenseStatus(ch);
        if (!active) {
            await sleep(1000);
            await buyAndUseIncense(ch);
        } else {
            logEvent(`Skipping #${ch.name} — incense still active`, 'info');
        }
    }
}

// Spam a single incense channel continuously
function startIncenseSpam(ch) {
    function incenseSpam() {
        if (isSleeping) { setTimeout(incenseSpam, 3000); return; }
        // Only spam if incense is active in this channel
        if (!incenseActive[ch.id]) { setTimeout(incenseSpam, 10000); return; }
        const result = Math.random().toString(36).substring(2, 15);
        ch.send(result + " ").catch(() => {});
        const interval = Math.floor(Math.random() * 3000) + 2000; // 2-5s
        setTimeout(incenseSpam, interval);
    }
    incenseSpam();
}

//--------------------------------------------------------------//

client.on('ready', () => {
    stats.username = client.user.username;
    stats.botStatus = 'online';

    logEvent(`Account: ${client.user.username} is ONLINE`, 'success');
    logEvent('Autocatcher started and ready.', 'info');
    broadcast('status', { status: 'online', sleeping: false, username: client.user.username });

    const channel = client.channels.cache.get(config.spamChannelID);

    // Resolve all incense channels (supports both old single ID and new array)
    const incenseIDs = Array.isArray(config.incenseChannelIDs)
        ? config.incenseChannelIDs
        : (config.incenseChannelID ? [config.incenseChannelID] : []);
    const incenseChannels = incenseIDs
        .map(id => client.channels.cache.get(id))
        .filter(Boolean);

    function getRandomInterval(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // Main spam channel
    function spam() {
        const result = Math.random().toString(36).substring(2, 15);
        channel.send(result + "(Made by 🔥⃤•AK_ØPᵈᵉᵛ✓#6326) ");
        const randomInterval = getRandomInterval(1500, 5000);
        setTimeout(spam, randomInterval);
    }
    spam();

    if (incenseChannels.length > 0) {
        logEvent(`Found ${incenseChannels.length} incense channel(s). Initialising...`, 'info');

        // Start spam loop for each incense channel
        for (const ch of incenseChannels) {
            incenseActive[ch.id] = false; // default until checked
            startIncenseSpam(ch);
        }

        // Boot-up incense check — wait 5s for bot to fully settle first
        setTimeout(() => initIncense(incenseChannels), 5000);

        // Every 2 hours: farm shards + rebuy incense where needed
        setInterval(() => scheduledIncenseRefresh(incenseChannels), 2 * 60 * 60 * 1000);
    }
});

//--------------------------------------------------------------//

//------------------------- ANTI-CRASH --------------------------------//

process.on("unhandledRejection", (reason, p) => {
    if (reason == "Error: Unable to identify that pokemon.") {} else {
        logEvent(`[antiCrash] Unhandled Rejection: ${reason}`, 'error');
    }
});
process.on("uncaughtException", (err, origin) => {
    logEvent(`[antiCrash] Uncaught Exception: ${err}`, 'error');
});

//--------------------------------------------------------------//

//------------------------- AUTOCATCHER --------------------------------//

client.on('messageCreate', async message => {

    // Owner commands
    if (message.content === "$captcha_completed" && message.author.id === config.OwnerID) {
        isSleeping = false;
        stats.botStatus = 'online';
        broadcast('status', { status: 'online', sleeping: false });
        broadcast('captcha_resolved', {});
        message.channel.send("Autocatcher Started!");
        logEvent('Captcha resolved via Discord command.', 'success');
    }

    if (message.content === "$help" && message.author.id === config.OwnerID) {
        await message.channel.send(
            "``` Poketwo-Autocatcher\n Link: https://github.com/AkshatOP/Poketwo-Autocatcher\n\n $captcha_completed : Use to restart the bot once captcha is solved\n $say <content> : Make the bot say whatever you want\n $react <messageID> : React with ✅ emoji\n $click <messageID> : Clicks the button which has ✅ emoji\n $transferall <userID> : Transfer ALL your pokemon to the given user (they must accept the trade)\n $help : To show this message ```"
        );
    }

    // $transferall <userID> — transfer all pokemon to a user via trade
    if (message.content.startsWith("$transferall") && message.author.id === config.OwnerID) {
        const args = message.content.trim().split(/\s+/);
        const targetId = args[1];
        if (!targetId) {
            message.channel.send("Usage: `$transferall <userID>`");
            return;
        }
        message.channel.send(`Starting transfer to <@${targetId}>. They need to accept the trade request!`);
        startTransfer(message.channel, targetId);
    }

    if (!isSleeping) {

        // Captcha detection
        if (message.content.includes("Please tell us") && message.author.id === "716390085896962058") {
            isSleeping = true;
            stats.botStatus = 'captcha';
            stats.captchas++;
            message.channel.send("Autocatcher Stopped , Captcha Detected! Use `$captcha_completed` once the captcha is solved ");
            logEvent('⚠️ CAPTCHA DETECTED! Autocatcher paused.', 'warn');
            broadcast('captcha', { time: new Date().toLocaleTimeString() });
            broadcast('status', { status: 'captcha', sleeping: true });
            broadcast('stats', { caught: stats.caught, missed: stats.missed, captchas: stats.captchas });
            setTimeout(async function () {
                isSleeping = false;
                stats.botStatus = 'online';
                broadcast('status', { status: 'online', sleeping: false });
                logEvent('Auto-resumed after 5 hour captcha timeout.', 'info');
            }, 18000000);

        } else if (message.content.startsWith("$say") && message.author.id == config.OwnerID) {
            let say = message.content.split(" ").slice(1).join(" ");
            message.channel.send(say);

        } else if (message.content.startsWith("$react") && message.author.id == config.OwnerID) {
            let msg;
            try {
                const args = message.content.slice(1).trim().split(/ +/g);
                msg = await message.channel.messages.fetch(args[1]);
            } catch (err) {
                message.reply(`Please Specify the message ID as an argument like "$react <messageID>"`);
            }
            if (msg) {
                try { msg.react("✅"); message.react("✅"); }
                catch (err) { message.react("❌"); logEvent(err, 'error'); }
            }

        } else if (message.content.startsWith("$click") && message.author.id == config.OwnerID) {
            let msg;
            try {
                var args = message.content.slice(1).trim().split(/ +/g);
                msg = await message.channel.messages.fetch(args[1]);
            } catch (err) {
                message.reply(`Please Specify the message ID as an argument like "$click <messageID>".`);
            }
            if (msg) {
                try { await msg.clickButton(); message.react("✅"); }
                catch (err) { message.react("❌"); logEvent(err, 'error'); }
            }

        } else if (message.content == "That is the wrong pokémon!" && message.author.id == "716390085896962058") {
            stats.missed++;
            broadcast('stats', { caught: stats.caught, missed: stats.missed, captchas: stats.captchas });
            logEvent('Wrong Pokémon sent — missed catch.', 'warn');
            // In hint mode, re-request hint after wrong guess
            if (catchMode === 'hint') {
                message.channel.send(`<@716390085896962058> h`);
            }

        } else if (message.author.id == "716390085896962058") {
            if (message?.embeds[0]?.footer?.text.includes("Spawns Remaining")) {
                // In hint mode, request hint for incense spawns
                if (catchMode === 'hint') {
                    await message.channel.send(`<@716390085896962058> h`);
                }
                if ((message.embeds[0]?.footer?.text == "Incense: Active.\nSpawns Remaining: 0.")) {
                    logEvent(`Incense ran out in #${message.channel.name} — rebuying...`, 'warn');
                    incenseActive[message.channel.id] = false;
                    const ch = message.channel;
                    await sleep(1000);
                    await buyAndUseIncense(ch);
                }
            } else if (message.content?.toLowerCase().includes('incense has ended') ||
                       message.content?.toLowerCase().includes('your incense has run out')) {
                logEvent(`Incense ended in #${message.channel.name} — rebuying...`, 'warn');
                incenseActive[message.channel.id] = false;
                await sleep(1000);
                await buyAndUseIncense(message.channel);
            } else if (catchMode === 'hint' && message.content.includes("The pokémon is")) {
                // Hint mode: solve the hint from Pokétwo
                try {
                    const pokemon = await solveHint(message);
                    const name = pokemon[0];
                    const delay = humanDelay();
                    logEvent(`[Hint] Solved hint: ${name} — queued (${delay / 1000}s delay)`, 'info');
                    broadcast('spawn', { name, delay: delay / 1000, method: 'Hint', queueSize: catchQueue.length + 1 });

                    const chan = message.channel;
                    const guildName = message.guild?.name || '?';
                    const chanName = message.channel?.name || '?';

                    enqueueCatch(name, delay, async () => {
                        logEvent(`[Hint] Catching ${name} now...`, 'info');
                        await chan.send(`<@716390085896962058> c ${name}`)
                            .catch(error => {
                                logEvent(`Send error: ${error}`, 'error');
                                client.channels.cache.get(config.errorChannelID)?.send(String(error));
                            });

                        const filter = (msg) => msg.author.id === "716390085896962058";
                        const collector = new Discord.MessageCollector(chan, filter, { max: 1, time: 13000 });
                        await new Promise(resolve => {
                            collector.on('collect', async (collected) => {
                                if (collected.content.includes("Congratulations")) {
                                    let rareity;
                                    try { rareity = await checkRarity(name); } catch { rareity = "Not Found in Database"; }
                                    addCatch(name, rareity, guildName, chanName);
                                    const logchannel = client.channels.cache.get(config.logChannelID);
                                    logchannel?.send("[" + guildName + "/#" + chanName + "] " + "**__" + name + "__** " + "Rarity " + rareity)
                                        .catch(error => {
                                            logEvent(`Log error: ${error}`, 'error');
                                            client.channels.cache.get(config.errorChannelID)?.send(String(error));
                                        });
                                    collector.stop();
                                }
                                resolve();
                            });
                            collector.on('end', () => resolve());
                        });
                    });
                } catch (err) {
                    logEvent(`[Hint] Failed to solve hint: ${err}`, 'error');
                }
            }

        } else {

            const Pokebots = ["696161886734909481", "874910942490677270"];
            if (allowedChannels.length > 0 && !allowedChannels.includes(message.channel.id)) return;

            if (Pokebots.includes(message.author.id)) {

                // In hint mode with Poke-Name bot, request a hint instead of catching directly
                if (catchMode === 'hint') {
                    logEvent(`[Hint Mode] Poke-Name detected spawn, requesting hint...`, 'info');
                    await message.channel.send(`<@716390085896962058> h`);
                    return;
                }

                // Direct mode: extract name from Poke-Name (bot 874910942490677270) message or embed
                const textName = extractPokemonName(message);

                if (textName) {
                    const name = textName;
                    const delay = humanDelay();
                    logEvent(`[Direct] Pokémon spawned: ${name} — queued (${delay / 1000}s delay, ${catchQueue.length} in queue)`, 'info');
                    broadcast('spawn', { name, delay: delay / 1000, method: 'Direct', queueSize: catchQueue.length + 1 });

                    const chan = message.channel;
                    const guildName = message.guild?.name || '?';
                    const chanName = message.channel?.name || '?';

                    enqueueCatch(name, delay, async () => {
                        logEvent(`[Poke-Name] Catching ${name} now...`, 'info');
                        await chan.send(`<@716390085896962058> c ${name}`)
                            .catch(error => {
                                logEvent(`Send error: ${error}`, 'error');
                                client.channels.cache.get(config.errorChannelID)?.send(String(error));
                            });

                        const filter = (msg) => msg.author.id === "716390085896962058";
                        const collector = new Discord.MessageCollector(chan, filter, { max: 1, time: 13000 });
                        await new Promise(resolve => {
                            collector.on('collect', async (collected) => {
                                if (collected.content.includes("Congratulations")) {
                                    function capitalizeFirstLetter(str) {
                                        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
                                    }
                                    let rareity;
                                    const name2 = capitalizeFirstLetter(name);
                                    try { rareity = await checkRarity(`${name2}`); } catch { rareity = "Not Found in Database"; }
                                    addCatch(name2, rareity, guildName, chanName);
                                    const logchannel = client.channels.cache.get(config.logChannelID);
                                    logchannel?.send("[" + guildName + "/#" + chanName + "] " + "**__" + name2 + "__** " + "Rarity " + rareity)
                                        .catch(error => {
                                            logEvent(`Log error: ${error}`, 'error');
                                            client.channels.cache.get(config.errorChannelID)?.send(String(error));
                                        });
                                    collector.stop();
                                }
                                resolve();
                            });
                            collector.on('end', () => resolve());
                        });
                    });
                    return;
                }

                // Fallback: OCR image embed
                let preferredURL = null;
                message.embeds.forEach((e) => {
                    if (e.image) {
                        const imageURL = e.image.url;
                        if (imageURL.includes("prediction.png")) preferredURL = imageURL;
                        else if (imageURL.includes("embed.png") && !preferredURL) preferredURL = imageURL;
                    }
                });

                if (preferredURL) {
                    try {
                        const res1 = await ocrSpace(preferredURL, { apiKey: config.ocrSpaceApiKey });
                        const name1 = res1.ParsedResults[0].ParsedText.split('\r')[0];
                        const name5 = name1.replace(/Q/g, 'R');
                        const name = findOutput(name5);
                        const delay = humanDelay();
                        logEvent(`[OCR] Pokémon spawned: ${name} — queued (${delay / 1000}s delay, ${catchQueue.length} in queue)`, 'info');
                        broadcast('spawn', { name, delay: delay / 1000, method: 'OCR', queueSize: catchQueue.length + 1 });

                        const chan = message.channel;
                        const guildName = message.guild?.name || '?';
                        const chanName = message.channel?.name || '?';

                        enqueueCatch(name, delay, async () => {
                            logEvent(`[OCR] Catching ${name} now...`, 'info');
                            await chan.send(`<@716390085896962058> c ${name}`)
                                .catch(error => {
                                    logEvent(`Send error: ${error}`, 'error');
                                    client.channels.cache.get(config.errorChannelID)?.send(String(error));
                                });

                            const filter = (msg) => msg.author.id === "716390085896962058";
                            const collector = new Discord.MessageCollector(chan, filter, { max: 1, time: 13000 });
                            await new Promise(resolve => {
                                collector.on('collect', async (collected) => {
                                    if (collected.content.includes("Congratulations")) {
                                        function capitalizeFirstLetter(str) {
                                            return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
                                        }
                                        let rareity;
                                        const name2 = capitalizeFirstLetter(name);
                                        try { rareity = await checkRarity(`${name2}`); } catch { rareity = "Not Found in Database"; }
                                        addCatch(name2, rareity, guildName, chanName);
                                        const logchannel = client.channels.cache.get(config.logChannelID);
                                        logchannel?.send("[" + guildName + "/#" + chanName + "] " + "**__" + name2 + "__** " + "Rarity " + rareity)
                                            .catch(error => {
                                                logEvent(`Log error: ${error}`, 'error');
                                                client.channels.cache.get(config.errorChannelID)?.send(String(error));
                                            });
                                        collector.stop();
                                    }
                                    resolve();
                                });
                                collector.on('end', () => resolve());
                            });
                        });
                    } catch (error) {
                        logEvent(`OCR error: ${error}`, 'error');
                        client.channels.cache.get(config.errorChannelID)?.send(String(error));
                    }
                }
            }
        }
    }
});

client.login(config.TOKEN);
