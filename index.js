const express = require('express');
const { default: makeWASocket, DisconnectReason } = require('@whiskeysockets/baileys');
const { useSupabaseAuthState } = require('./supabaseAuth');
const http = require('http');

const app = express();
const server = http.createServer(app);

app.use(express.json());

let sock;

async function startBot() {
    const { state, saveCreds } = await useSupabaseAuthState('bot_session');

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            console.log('WhatsApp Web Server Connected! ✅');
        }
        if (connection === 'close') {
            console.log('Connection close ho gaya, reconnecting...');
            setTimeout(startBot, 3000);
        }
    });

    // Smart Message Handler & Multiple Responses
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message) return;
            
            if (mek.key.fromMe || mek.key.remoteJid === 'status@broadcast') return;

            const remoteJid = mek.key.remoteJid;
            const textMessage = (mek.message.conversation || 
                                mek.message.extendedTextMessage?.text || 
                                mek.message.imageMessage?.caption || '').trim().toLowerCase();

            if (!textMessage) return;

            console.log(`[Incoming Message] From: ${remoteJid} | Text: "${textMessage}"`);

            let replyText = '';

            // Alag-alag messages ke hisab se smart replies
            if (textMessage === 'hi' || textMessage === 'hello' || textMessage === 'hey') {
                replyText = 'Hello! Main aapka AI WhatsApp bot hoon. Bataiye main aapki kya madad kar sakta hoon? 🤖✨';
            } 
            else if (textMessage === 'kaise ho' || textMessage === 'how are you') {
                replyText = 'Main ekdum badhiya hoon! Aap bataiye, aap kaise hain? 🚀';
            } 
            else if (textMessage === 'time kya hua hai' || textMessage === 'time') {
                const currentTime = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
                replyText = `Abhi ka Indian time hai: ${currentTime} ⏰`;
            } 
            else {
                // Default AI style smart response agar kuch aur bheja jaye
                replyText = `Aapne kaha: "${textMessage}". Main abhi background mein 24/7 active hoon! 😎`;
            }

            // Reply bhejna
            await sock.sendMessage(remoteJid, { text: replyText });
            console.log(`[Reply Sent Successfully]\n`);

        } catch (err) {
            console.log('Error processing message:', err);
        }
    });
}

app.get('/', (req, res) => {
    res.send('WhatsApp Bot is running live via Express server! 🚀');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    startBot();
});
