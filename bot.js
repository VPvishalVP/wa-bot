const { default: makeWASocket, DisconnectReason } = require('@whiskeysockets/baileys');
const { useSupabaseAuthState } = require('./supabaseAuth');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function startBot() {
    const { state, saveCreds } = await useSupabaseAuthState('bot_session');

    const sock = makeWASocket({
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
            console.log('\nWhatsApp successfully connected! ✅\n');
        }
        if (connection === 'close') {
            console.log('Connection close ho gaya, dubara start ho raha hai...');
            setTimeout(startBot, 3000);
        }
    });

    // Loop fix message listener
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message) return;

            // Ignore own messages and status
            if (mek.key.fromMe || mek.key.remoteJid === 'status@broadcast') return;

            // Only new messages
            if (chatUpdate.type !== 'notify') return;

            const remoteJid = mek.key.remoteJid;
            const textMessage = mek.message.conversation ||
                                mek.message.extendedTextMessage?.text || '';

            if (!textMessage) return;

            console.log(`[Message Received] From: ${remoteJid} | Text: "${textMessage}"`);

            // 2000 Random Reply Combinations
            const replyStarts = [
                "Namaste! 🙏",
                "Hello dost! 😊",
                "Hey! 🤖",
                "Arey wah! ❤️",
                "Ji boliye!",
                "Hiiiii! 😄",
                "Ram Ram! 🙏",
                "Welcome dost! 💖",
                "Kya haal hai? 😎",
                "Hello ji! 🌸"
            ];

            const replyMessages = [
                "Aapka message mil gaya hai",
                "Aapse baat karke accha laga",
                "Main VIHUHUHU bot hoon",
                "Aap kaise ho aaj",
                "Aapka swagat hai",
                "Main aapki baat sun raha hoon",
                "Aapka message bahut special hai",
                "Batao kya chal raha hai",
                "Aapse milkar khushi hui",
                "Main yahin hoon aapki help ke liye",
                "Aap tension mat lo",
                "Aaj ka din kaisa raha",
                "Aap bahut acche ho",
                "Dosti bani rahe",
                "Aapki baat samajh gaya",
                "Kuch naya batao",
                "Aapka din shubh ho",
                "Aapko ek smile bhej raha hoon",
                "Main ready hoon",
                "Aapka reply ka intezar rahega"
            ];

            const replyEndings = [
                "😊",
                "❤️",
                "🤖",
                "🙏",
                "😎",
                "✨",
                "🌸",
                "💫",
                "🥰",
                "😄"
            ];

            const allReplies = [];

            for (const start of replyStarts) {
                for (const message of replyMessages) {
                    for (const ending of replyEndings) {
                        allReplies.push(`${start} ${message} ${ending}`);
                    }
                }
            }

            const randomReply =
                allReplies[Math.floor(Math.random() * allReplies.length)];

            await sock.sendMessage(remoteJid, { text: randomReply });

            console.log(`[Reply Sent] ${randomReply}\n`);

        } catch (err) {
            console.log('Error:', err);
        }
    });

    if (!sock.authState.creds.registered) {
        rl.question('Apna WhatsApp number daalo (jaise 919876543210): ', async (phoneNumber) => {
            phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
            let code = await sock.requestPairingCode(phoneNumber);
            code = code?.match(/.{1,4}/g)?.join("-") || code;
            console.log(`\n🔑 Aapka Pairing Code yeh hai: ${code}\n`);
            rl.close();
        });
    }
}

startBot();
