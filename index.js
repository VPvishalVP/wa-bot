const { default: makeWASocket, delay } = require('@whiskeysockets/baileys');
const { useSupabaseAuthState } = require('./supabaseAuth');
const pino = require('pino');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

let connectionStatus = "Disconnected ❌";
let isAutoReplyOn = true;
let pairingCodeOutput = "Number daal kar Code generate karein.";
let activePairingCode = "";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>WhatsApp AI Dashboard</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body { font-family: Arial, sans-serif; background: #0f172a; color: #fff; padding: 15px; margin: 0; text-align: center; }
                    .card { background: #1e293b; padding: 25px; border-radius: 12px; max-width: 420px; margin: 20px auto; box-shadow: 0 4px 15px rgba(0,0,0,0.4); }
                    h2 { color: #38bdf8; margin-top: 0; }
                    .status { font-weight: bold; padding: 6px 12px; border-radius: 6px; display: inline-block; margin: 10px 0; font-size: 14px; }
                    .connected { background: #166534; color: #bbf7d0; }
                    .disconnected { background: #991b1b; color: #fee2e2; }
                    button { background: #2563eb; color: white; border: none; padding: 10px 20px; font-size: 15px; border-radius: 6px; cursor: pointer; font-weight: bold; margin-top: 10px; }
                    button:hover { background: #1d4ed8; }
                    input { padding: 10px; width: 80%; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #fff; font-size: 16px; margin-top: 10px; text-align: center; }
                    .code-box { background: #0f172a; padding: 12px; border-radius: 6px; border: 1px dashed #38bdf8; color: #facc15; font-size: 24px; font-weight: bold; margin-top: 15px; word-break: break-all; }
                    .refresh-btn { background: #0ea5e9; font-size: 13px; padding: 6px 12px; margin-top: 15px; display: inline-block; text-decoration: none; color: white; border-radius: 4px; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h2>WhatsApp Dashboard</h2>
                    <p>Connection Status:</p>
                    <div class="status ${connectionStatus.includes('Connected') ? 'connected' : 'disconnected'}">
                        ${connectionStatus}
                    </div>
                    <hr style="border: 0.5px solid #334155; margin: 15px 0;">
                    <p>Auto Reply: <b>${isAutoReplyOn ? 'ON 🟢' : 'OFF 🔴'}</b></p>
                    <form action="/toggle" method="POST">
                        <button type="submit">Toggle ON / OFF</button>
                    </form>
                </div>
                <div class="card">
                    <h3 style="color: #38bdf8; margin-top: 0;">Web Pairing Code</h3>
                    <p style="font-size: 13px; color: #94a3b8;">Country code ke sath number dalein (jaise: 919876543210)</p>
                    <form action="/pair" method="POST">
                        <input type="text" name="phone" placeholder="91xxxxxxxxxx" required>
                        <br>
                        <button type="submit" style="background: #16a34a;">Generate Code</button>
                    </form>
                    <div class="code-box">
                        ${activePairingCode ? activePairingCode : pairingCodeOutput}
                    </div>
                    <br>
                    <a href="/" class="refresh-btn">🔄 Check Code / Refresh Page</a>
                </div>
            </body>
        </html>
    `);
});

app.post('/toggle', (req, res) => {
    isAutoReplyOn = !isAutoReplyOn;
    res.redirect('/');
});

app.post('/pair', async (req, res) => {
    let phoneNumber = req.body.phone.replace(/[^0-9]/g, '');
    if (!phoneNumber) {
        pairingCodeOutput = "Galat number hai!";
        return res.redirect('/');
    }

    pairingCodeOutput = "Code generate ho raha hai...";
    activePairingCode = "";
    res.redirect('/');

    startPairingBot(phoneNumber);
});

app.listen(PORT, () => {
    console.log(`🌐 Dashboard website chal rahi hai: http://localhost:${PORT}`);
});

async function startPairingBot(phoneNumber) {
    const { state, saveCreds } = await useSupabaseAuthState('bot_session');

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);

    if (!sock.authState.creds.registered) {
        try {
            await delay(6000);
            let rawCode = await sock.requestPairingCode(phoneNumber);
            let formattedCode = rawCode?.match(/.{1,4}/g)?.join("-") || rawCode;

            activePairingCode = formattedCode;
            console.log(`🔑 Pairing Code Successfully Generated: ${formattedCode}`);
        } catch (error) {
            console.error("Pairing error:", error);
            pairingCodeOutput = "Code generate karne mein error aaya!";
        }
    }

    sock.ev.on('connection.update', (update) => {
        const { connection } = update;
        if (connection === 'open') {
            connectionStatus = "Connected ✅";
            activePairingCode = "CONNECTED 🎉";
            console.log('✅ WhatsApp successfully connect ho gaya!');
        } else if (connection === 'close') {
            connectionStatus = "Disconnected ❌";
            console.log('❌ Connection close ho gaya.');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const senderJid = msg.key.remoteJid;
        const messageContent = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase();

        if (!messageContent || !isAutoReplyOn) return;

        let replyText = (messageContent.includes('hello') || messageContent.includes('hi'))
            ? "Hello! Main ek automated bot hoon."
            : `Aapka message mila: "${messageContent}"`;

        await sock.sendMessage(senderJid, { text: replyText });
    });
}
