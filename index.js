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
    ws.send(JSON.stringify({ type: 'init', data: stats }));

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

client.on('ready', () => {
    stats.username = client.user.username;
    stats.botStatus = 'online';

    logEvent(`Account: ${client.user.username} is ONLINE`, 'success');
    logEvent('Autocatcher started and ready.', 'info');
    broadcast('status', { status: 'online', sleeping: false, username: client.user.username });

    const channel = client.channels.cache.get(config.spamChannelID);
    const incenseChannel = config.incenseChannelID ? client.channels.cache.get(config.incenseChannelID) : null;

    function getRandomInterval(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // Spam in the main spam channel (generates spawns + XP)
    function spam() {
        const result = Math.random().toString(36).substring(2, 15);
        channel.send(result + "(Made by 🔥⃤•AK_ØPᵈᵉᵛ✓#6326) ");
        const randomInterval = getRandomInterval(1500, 5000);
        setTimeout(spam, randomInterval);
    }
    spam();

    // Also spam in the incense channel to trigger incense spawns
    if (incenseChannel) {
        logEvent(`Incense channel active: #${incenseChannel.name}`, 'info');
        function incenseSpam() {
            if (isSleeping) { setTimeout(incenseSpam, 3000); return; }
            const result = Math.random().toString(36).substring(2, 15);
            incenseChannel.send(result + " ");
            const randomInterval = getRandomInterval(2000, 5000);
            setTimeout(incenseSpam, randomInterval);
        }
        incenseSpam();
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
            message.channel.send(`<@716390085896962058> h`);

        } else if (message.author.id == "716390085896962058") {
            if (message?.embeds[0]?.footer?.text.includes("Spawns Remaining")) {
                await message.channel.send(`<@716390085896962058> h`);
                if ((message.embeds[0]?.footer?.text == "Incense: Active.\nSpawns Remaining: 0.")) {
                    logEvent('Incense ran out — rebuying...', 'warn');
                    message.channel.send(`<@716390085896962058> buy incense`);
                    await sleep(2000);
                    message.channel.send(`<@716390085896962058> use incense`);
                }
            } else if (message.content.includes("The pokémon is")) {
                let rarity;
                const pokemon = await solveHint(message);
                logEvent(`Catching ${pokemon[0]} (hint method)`, 'info');
                await message.channel.send(`<@716390085896962058> c ${pokemon[0]}`);
                try { rarity = await checkRarity(`${pokemon[0]}`); } catch { rarity = "Not Found in Database"; }
                addCatch(pokemon[0], rarity, message.guild?.name || '?', message.channel?.name || '?');
                const channel6 = client.channels.cache.get(config.logChannelID);
                channel6.send("[" + message.guild.name + "/#" + message.channel.name + "] " + "**__" + pokemon[0] + "__** " + "Rarity " + rarity);
            }

        } else {

            const Pokebots = ["696161886734909481", "874910942490677270"];
            if (allowedChannels.length > 0 && !allowedChannels.includes(message.channel.id)) return;

            // Also allow incense channel catches even if allowedChannels is set
            const isIncenseChannel = config.incenseChannelID && message.channel.id === config.incenseChannelID;
            if (allowedChannels.length > 0 && !allowedChannels.includes(message.channel.id) && !isIncenseChannel) return;

            if (Pokebots.includes(message.author.id)) {

                // Extract name from Poke-Name embed text
                let textName = null;
                if (message.embeds.length > 0) {
                    for (const e of message.embeds) {
                        const raw = (e.title || "") + " " + (e.description || "");
                        const match = raw.match(/^\*?\*?([A-Za-z\-\. ]+?)\*?\*?\s*(🏃|【|\[|$)/);
                        if (match) { textName = match[1].trim(); break; }
                        const descMatch = (e.description || "").match(/\*\*([A-Za-z\-\. ]+?)\*\*/);
                        if (descMatch) { textName = descMatch[1].trim(); break; }
                    }
                }

                // Extract name from "## PokemonName <emoji>" content format
                if (!textName && message.content) {
                    const contentMatch = message.content.match(/^##\s+([A-Za-z\-\.\(\) ]+?)[\s<【]/);
                    if (contentMatch) textName = contentMatch[1].trim();
                }

                if (textName) {
                    const name = findOutput(textName);
                    const delay = Math.floor(Math.random() * 6 + 5) * 1000;
                    logEvent(`Pokémon spawned: ${name} — catching in ${delay / 1000}s`, 'info');
                    broadcast('spawn', { name, delay: delay / 1000 });

                    setTimeout(async () => {
                        message.channel.send(`<@716390085896962058> c ${name}`)
                            .catch(error => {
                                logEvent(`Send error: ${error}`, 'error');
                                client.channels.cache.get(config.errorChannelID)?.send(String(error));
                            });

                        const filter = (msg) => msg.author.id === "716390085896962058";
                        const collector = new Discord.MessageCollector(message.channel, filter, { max: 1, time: 13000 });
                        collector.on('collect', async (collected) => {
                            if (collected.content.includes("Congratulations")) {
                                function capitalizeFirstLetter(str) {
                                    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
                                }
                                let rareity;
                                const name2 = capitalizeFirstLetter(name);
                                try { rareity = await checkRarity(`${name2}`); } catch { rareity = "Not Found in Database"; }
                                addCatch(name2, rareity, collected.guild?.name || '?', collected.channel?.name || '?');
                                const logchannel = client.channels.cache.get(config.logChannelID);
                                logchannel?.send("[" + collected.guild.name + "/#" + collected.channel.name + "] " + "**__" + name2 + "__** " + "Rarity " + rareity)
                                    .catch(error => {
                                        logEvent(`Log error: ${error}`, 'error');
                                        client.channels.cache.get(config.errorChannelID)?.send(String(error));
                                    });
                                collector.stop();
                            }
                        });
                    }, delay);
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
                        const delay = Math.floor(Math.random() * 6 + 5) * 1000;
                        logEvent(`[OCR] Pokémon spawned: ${name} — catching in ${delay / 1000}s`, 'info');
                        broadcast('spawn', { name, delay: delay / 1000 });

                        setTimeout(async () => {
                            message.channel.send(`<@716390085896962058> c ${name}`)
                                .catch(error => {
                                    logEvent(`Send error: ${error}`, 'error');
                                    client.channels.cache.get(config.errorChannelID)?.send(String(error));
                                });

                            const filter = (msg) => msg.author.id === "716390085896962058";
                            const collector = new Discord.MessageCollector(message.channel, filter, { max: 1, time: 13000 });
                            collector.on('collect', async (collected) => {
                                if (collected.content.includes("Congratulations")) {
                                    function capitalizeFirstLetter(str) {
                                        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
                                    }
                                    let rareity;
                                    const name2 = capitalizeFirstLetter(name);
                                    try { rareity = await checkRarity(`${name2}`); } catch { rareity = "Not Found in Database"; }
                                    addCatch(name2, rareity, collected.guild?.name || '?', collected.channel?.name || '?');
                                    const logchannel = client.channels.cache.get(config.logChannelID);
                                    logchannel?.send("[" + collected.guild.name + "/#" + collected.channel.name + "] " + "**__" + name2 + "__** " + "Rarity " + rareity)
                                        .catch(error => {
                                            logEvent(`Log error: ${error}`, 'error');
                                            client.channels.cache.get(config.errorChannelID)?.send(String(error));
                                        });
                                    collector.stop();
                                }
                            });
                        }, delay);
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
