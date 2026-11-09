
const express = require('express');
const { default: makeWASocket, DisconnectReason } = require('@whiskeysockets/baileys');
const { useSupabaseAuthState } = require('./supabaseAuth');
const http = require('http');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

app.use(express.json());

let sock;
let isBotActive = true;

// Root Route - Status Check
app.get('/', (req, res) => {
    res.send(`WhatsApp Bot is Running! 🚀 | Status: ${isBotActive ? 'ON ✅' : 'OFF ❌'}`);
});

// Chat ON/OFF Toggle Route
app.get('/toggle', (req, res) => {
    const action = req.query.action;

    if (action === 'on') {
        isBotActive = true;
        return res.json({
            success: true,
            message: 'Bot is now ON ✅'
        });
    }

    if (action === 'off') {
        isBotActive = false;
        return res.json({
            success: true,
            message: 'Bot is now OFF ❌'
        });
    }

    res.json({
        success: true,
        botStatus: isBotActive ? 'ON' : 'OFF'
    });
});

// Pairing Code Route
app.get('/pair', async (req, res) => {
    const phoneNumber = req.query.phone;

    if (!phoneNumber) {
        return res.status(400).json({
            error: 'Phone number is required (e.g., ?phone=919876543210)'
        });
    }

    if (!sock) {
        return res.status(503).json({
            error: 'WhatsApp socket is not ready yet'
        });
    }

    if (!sock.authState.creds.registered) {
        try {
            let code = await sock.requestPairingCode(
                phoneNumber.replace(/[^0-9]/g, '')
            );

            code = code?.match(/.{1,4}/g)?.join('-') || code;

            return res.json({
                success: true,
                pairingCode: code
            });

        } catch (err) {
            console.log('Pairing Error:', err);

            return res.status(500).json({
                error: 'Failed to generate pairing code'
            });
        }
    } else {
        return res.json({
            success: true,
            message: 'Already registered and connected!'
        });
    }
});

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
            console.log('WhatsApp Connected Successfully via Supabase! ✅');
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;

            console.log('Connection closed, reconnecting...', statusCode);

            if (statusCode !== DisconnectReason.loggedOut) {
                setTimeout(() => startBot(), 3000);
            }
        }
    });

    // Smart Message Handler & Bot ON/OFF Handler
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            try {
                if (!msg.message || msg.key.fromMe) continue;

                if (msg.key.remoteJid === 'status@broadcast') continue;

                const sender = msg.key.remoteJid;

                const textMessage = (
                    msg.message.conversation ||
                    msg.message.extendedTextMessage?.text ||
                    msg.message.imageMessage?.caption ||
                    ''
                ).trim().toLowerCase();

                if (!textMessage) continue;

                console.log(`[Incoming Message] From: ${sender} | Text: "${textMessage}"`);

                // Bot OFF hone par auto replies band
                if (!isBotActive) continue;

                // Command Handler
                if (textMessage === '!ping') {
                    await sock.sendMessage(sender, {
                        text: 'Pong! 🏓 Bot is active and running.'
                    });
                    continue;
                }

                if (textMessage === '!menu') {
                    await sock.sendMessage(sender, {
                        text: '🤖 *WhatsApp Bot Menu*\n\n' +
                              '1. !ping - Check bot status\n' +
                              '2. !menu - Show commands\n' +
                              '3. Smart Auto Reply - Automatic chatting\n\n' +
                              'Bot Status: ON ✅'
                    });
                    continue;
                }

                let replyText = '';

                const replies = {
                    greeting: [
                        'Hello dost! 😊 Kya haal hai?',
                        'Hii! Kaise ho aaj?',
                        'Arey hello! ❤️',
                        'Namaste ji 🙏',
                        'Hey yaar! Kya chal raha hai?',
                        'Hii! Bahut din baad baat hui.',
                        'Hello hello! Batao kya haal?',
                        'Aao baat karte hain 😊',
                        'Hii dost! Sab badhiya?',
                        'Hey! Aaj ka din kaisa hai?',
                        'Hello ji! Kaise ho?',
                        'Hey buddy!',
                        'Kya haal hai mere dost?',
                        'Hii! Bolo kya baat hai?',
                        'Arey wah! Tum aa gaye!'
                    ],

                    mood: [
                        'Main badhiya hoon! Tum batao?',
                        'Sab mast hai yaar, tum kaise ho?',
                        'Achha hoon 😊 Tum sunao.',
                        'Tumse baat karke achha lag raha hai.',
                        'Bas yahin hoon, tumhari baat sun raha hoon.',
                        'Kya haal chaal hain dost?',
                        'Life kaisi chal rahi hai?',
                        'Aaj mood kaisa hai tumhara?',
                        'Sab theek hai na?',
                        'Batao, kya chal raha hai?',
                        'Ekdam mast! Tum kaise ho?',
                        'Badhiya ji, aap batao?',
                        'Main theek hoon, tumhari sunao.',
                        'Aaj ka din achha ja raha hai.',
                        'Tumse baat karne ke liye ready hoon!'
                    ],

                    happy: [
                        'Arey waah! Ye sunkar bahut achha laga! 😍',
                        'Kya baat hai! Khushi bani rahe!',
                        'Mast! Aise hi khush raho!',
                        'Tumhari khushi dekhkar achha laga!',
                        'Bahut badhiya yaar!',
                        'Aaj toh celebration banta hai! 🎉',
                        'Keep smiling dost!',
                        'Ye hui na baat!',
                        'Khush rehna sabse zaroori hai!',
                        'Waah! Dil khush kar diya!',
                        'Bahut achhi news hai!',
                        'Congratulations dost!',
                        'Aise hi progress karte raho!',
                        'Kamaal kar diya!',
                        'Proud of you! ❤️'
                    ],

                    sad: [
                        'Kya hua dost? Dil ki baat batao.',
                        'Main sun raha hoon, aaram se batao.',
                        'Kabhi kabhi din mushkil hote hain.',
                        'Tumhari feelings important hain.',
                        'Agar share karna chaho toh bata sakte ho.',
                        'Kya kisi baat ne pareshan kiya hai?',
                        'Thoda waqt lena bhi theek hai.',
                        'Tum akele nahi ho, baat kar sakte ho.',
                        'Dil halka karna chaho toh main sun raha hoon.',
                        'Umeed hai cheezein dheere dheere behtar hongi.',
                        'Sab kuch ek saath solve karna zaroori nahi.',
                        'Apna khayal rakho dost.',
                        'Kya hua? Kisi ne kuch kaha?',
                        'Main tumhari baat samajhna chahta hoon.',
                        'Thoda rest kar lo, yaar.'
                    ],

                    love: [
                        'Aww, kitni sweet baat hai! ❤️',
                        'Dil se kaha hai kya? 😊',
                        'Pyaar wali baat lag rahi hai!',
                        'Kya khoobsurat feeling hai!',
                        'Aaj toh romantic mood hai!',
                        'Kisi special ki yaad aa rahi hai?',
                        'Love is a beautiful feeling!',
                        'Waah, dil ki baat hai!',
                        'Cute yaar! ❤️',
                        'Achha ji, aur batao!',
                        'Kya baat hai, pyaar ho gaya?',
                        'Dil ki baatein hain!',
                        'Aaj feelings strong hain!',
                        'Kitni pyari baat kahi!',
                        'Romantic vibes! 🥰'
                    ],

                    funny: [
                        'Hahaha! 😂',
                        'Arey yaar, kya baat hai!',
                        'Bhai tum toh kamaal ho!',
                        'Ye toh mast tha!',
                        'Hasi nahi ruk rahi! 😂',
                        'Comedy king ho tum!',
                        'Kya joke maara hai!',
                        'Haha, aur sunao!',
                        'Mood bana diya!',
                        'Badiya yaar!',
                        'LOL 😂',
                        'Tum toh bade funny ho!',
                        'Ek aur joke sunao!',
                        'Hahaha, sahi hai!',
                        'Bhai gazab!'
                    ],

                    daily: [
                        'Aaj kya kya kiya?',
                        'Din kaisa raha tumhara?',
                        'Khana kha liya? 😊',
                        'Aaj kuch naya hua?',
                        'Abhi kya kar rahe ho?',
                        'Aaj ka plan kya hai?',
                        'Kuch interesting batao!',
                        'Kaam kaisa chal raha hai?',
                        'Aaj relax kar rahe ho ya busy ho?',
                        'Aur sunao, sab badhiya?',
                        'Breakfast kiya?',
                        'Aaj ghar par ho?',
                        'Kya chal raha hai life mein?',
                        'Aaj ka din kaisa tha?',
                        'Kal ka kya plan hai?'
                    ],

                    thanks: [
                        'Arey koi baat nahi dost! ❤️',
                        'Welcome yaar!',
                        'Khushi hui madad karke 😊',
                        'Kabhi bhi!',
                        'Arey thanks ki kya baat hai!',
                        'Tumhara welcome hai!',
                        'Always welcome dost!',
                        'Bas khush raho!',
                        'Koi tension nahi!',
                        'Achha laga sunke!',
                        'Mention not!',
                        'No problem!',
                        'Arey apne logon mein thanks kaisa!',
                        'Glad to help!',
                        'Koi baat nahi bhai!'
                    ],

                    sorry: [
                        'Arey koi baat nahi 😊',
                        'Its okay dost!',
                        'Chinta mat karo.',
                        'Sab theek hai!',
                        'Maaf kiya yaar ❤️',
                        'Koi problem nahi!',
                        'Relax, sab normal hai.',
                        'It happens!',
                        'Dil pe mat lo.',
                        'Sab badhiya hai dost!',
                        'No worries!',
                        'Koi baat nahi bhai!',
                        'Chill karo!',
                        'Sab theek hai.',
                        'Arey rehne do!'
                    ],

                    question: [
                        'Achha sawaal hai! 😊',
                        'Iske baare mein thoda aur batao.',
                        'Tum kya sochte ho is baare mein?',
                        'Chalo isko samajhte hain.',
                        'Interesting! Aage batao.',
                        'Thoda context doge?',
                        'Tumhara point samajh aaya.',
                        'Kya tum iske baare mein detail mein baat karna chahoge?',
                        'Chalo, baat karte hain!',
                        'Haan ji, pucho!',
                        'Batao kya jaan na hai?',
                        'Achha, ye kaise?',
                        'Hmm, interesting question!',
                        'Iska jawab dhoondhte hain.',
                        'Kya tum detail mein bata sakte ho?'
                    ],

                    default: [
                        'Achha! 😊',
                        'Hmm, samajh raha hoon.',
                        'Achha ji, aage batao.',
                        'Aur kya chal raha hai?',
                        'Interesting baat hai!',
                        'Tumhari baat sun raha hoon.',
                        'Achha, phir kya hua?',
                        'Kuch aur batao dost.',
                        'Haan ji, bolo!',
                        'Main yahin hoon, baat karo.',
                        'Sahi hai yaar!',
                        'Achha achha!',
                        'Hmm, phir?',
                        'Batao dost!',
                        'Aur sunao!'
                    ],

                    goodMorning: [
                        'Good morning dost! 🌞',
                        'Suprabhat! Aaj ka din shubh ho!',
                        'Good morning! Smile karo 😊',
                        'Subah ki shubhkamnayein!',
                        'Utho aur chamko! ✨',
                        'Aaj ka din tumhara hai!',
                        'Morning! Kya haal hai?',
                        'Nayi subah, nayi umeed!',
                        'Good morning! Khush raho!',
                        'Good morning! Aaj kya plan hai?'
                    ],

                    goodNight: [
                        'Good night dost! 🌙',
                        'Shubh ratri! Achhe sapne dekhna.',
                        'Sweet dreams! ❤️',
                        'Aaram se sona.',
                        'Good night, kal milte hain!',
                        'Sapno ki duniya mein milte hain!',
                        'Take care, good night!',
                        'Achhi neend lena!',
                        'Night night! 😊',
                        'Kal ka din achha ho!'
                    ]
                };

                // Message Category Detection
                let category = 'default';

                if (/^(hi|hello|hey|hii|hlo|namaste|नमस्ते|हाय)$/.test(textMessage)) {
                    category = 'greeting';
                }
                else if (/good morning|suprabhat|subah bakhair/.test(textMessage)) {
                    category = 'goodMorning';
                }
                else if (/good night|shubh ratri|sweet dreams/.test(textMessage)) {
                    category = 'goodNight';
                }
                else if (/kaise ho|how are you|kya haal|haal chaal/.test(textMessage)) {
                    category = 'mood';
                }
                else if (/khush|happy|mast|maza|awesome|great|wah|waah|congratulations/.test(textMessage)) {
                    category = 'happy';
                }
                else if (/sad|dukhi|udaas|pareshan|tension|akela|रोना|दुख/.test(textMessage)) {
                    category = 'sad';
                }
                else if (/love|pyaar|pyar|mohabbat|jaan|miss you|i love you/.test(textMessage)) {
                    category = 'love';
                }
                else if (/😂|🤣|joke|funny|haha|hahaha|lol/.test(textMessage)) {
                    category = 'funny';
                }
                else if (/thank|thanks|shukriya|धन्यवाद/.test(textMessage)) {
                    category = 'thanks';
                }
                else if (/sorry|maaf|गलती/.test(textMessage)) {
                    category = 'sorry';
                }
                else if (/kya kar|kha liya|khana|din kaisa|plan|breakfast/.test(textMessage)) {
                    category = 'daily';
                }
                else if (/\?|kya|kyu|kaise|kab|where|why|how|what|who/.test(textMessage)) {
                    category = 'question';
                }

                const pool = replies[category] || replies.default;

                const randomReply = pool[Math.floor(Math.random() * pool.length)];

                const followups = [
                    'Tum batao?',
                    'Aur sunao!',
                    'Phir kya hua?',
                    'Kya sochte ho?',
                    'Thoda aur batao.',
                    'Main sun raha hoon.',
                    'Aage bolo!',
                    'Kya baat hai?',
                    'Batao dost!',
                    'Achha ji!'
                ];

                const endings = [
                    ' 😊', ' ❤️', ' 😄', ' ✨', ' 🤗',
                    ' 💫', ' 🌸', ' 😎', ' 🥰', ' 🙌'
                ];

                const randomFollowup = followups[Math.floor(Math.random() * followups.length)];

                const randomEnding = endings[Math.floor(Math.random() * endings.length)];

                replyText = `${randomReply} ${randomFollowup}${randomEnding}`;

                await sock.sendMessage(sender, {
                    text: replyText
                });

                console.log(`[Reply Sent Successfully]\n`);

            } catch (err) {
                console.log('Error processing message:', err);
            }
        }
    });
}

// Start Server
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    startBot();
});
                
