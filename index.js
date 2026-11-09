const express = require('express');
const { generateReply } = require('./replyEngine');
const { default: makeWASocket, DisconnectReason } = require('@whiskeysockets/baileys');
const { useSupabaseAuthState } = require('./supabaseAuth');
const http = require('http');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(express.json());

let sock;
let isBotActive = true;
let isAutoReplyEnabled = true;
let connectionStatus = 'Disconnected';
const greetedUsers = new Set(); // RAM-only; resets after server restart

const WELCOME_MESSAGE =
  '*Heyy! 💗 Mai VIHUHUHU KA OFFLINE ASSISTANT 😴✨ AI HU MERA NAME AAIRA HAI*';

const dashboardHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AAIRA | WhatsApp Assistant</title>
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;color:#f4f4f4;font-family:Arial,sans-serif;
background:radial-gradient(ellipse at 75% 15%,#343434 0%,transparent 32%),
radial-gradient(ellipse at 15% 80%,#242424 0%,transparent 35%),linear-gradient(135deg,#000,#101010 55%,#000)}
body:before{content:"";position:fixed;inset:0;pointer-events:none;
background:linear-gradient(110deg,transparent 35%,rgba(255,255,255,.045) 50%,transparent 65%)}
.wrap{width:min(940px,94%);margin:30px auto}
header{text-align:center;padding:25px 10px}
.logo{font-size:38px;font-weight:900;letter-spacing:5px;text-shadow:0 0 18px #ddd}
.subtitle{color:#aaa;letter-spacing:2px;margin-top:8px}
.panel{background:rgba(15,15,15,.94);border:1px solid #555;border-radius:18px;
padding:22px;margin:16px 0;box-shadow:0 0 22px rgba(255,255,255,.06)}
h2{font-size:17px;letter-spacing:1.5px;margin:0 0 16px;color:#eee}
.status{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.pill{border:1px solid #777;border-radius:30px;padding:8px 14px;font-size:13px}
.green{color:#cfcfcf;border-color:#aaa}.red{color:#999;border-color:#555}
input{width:100%;background:#050505;color:white;border:1px solid #666;border-radius:10px;
padding:13px;margin:8px 0 12px;font-size:15px;outline:none}
input:focus{border-color:#eee;box-shadow:0 0 8px #777}
button{background:#080808;color:#fff;border:1px solid #aaa;border-radius:10px;
padding:12px 16px;margin:4px;cursor:pointer;font-weight:bold;transition:.2s}
button:hover{background:#eee;color:#000;box-shadow:0 0 14px #aaa}
button:disabled{opacity:.45;cursor:not-allowed}
.row{display:flex;gap:10px;flex-wrap:wrap}.row button{flex:1}
.code{font-size:26px;letter-spacing:5px;text-align:center;padding:15px;color:#fff;
border:1px dashed #aaa;border-radius:12px;margin-top:12px;min-height:60px}
.note{font-size:12px;color:#aaa;line-height:1.6}
pre{white-space:pre-wrap;color:#ddd;font-size:13px}
footer{text-align:center;color:#777;padding:20px;font-size:12px}
</style>
</head>
<body><div class="wrap">
<header><div class="logo">AAIRA ✦</div><div class="subtitle">VIHUHUHU KA OFFLINE ASSISTANT</div></header>
<section class="panel">
<div class="status"><h2>WHATSAPP CONNECTION</h2><span id="connection" class="pill red">Disconnected</span></div>
<div class="status"><span>Bot Status</span><span id="bot" class="pill">Checking...</span></div>
<div class="status" style="margin-top:10px"><span>Auto Reply</span><span id="auto" class="pill">Checking...</span></div>
<div class="row" style="margin-top:15px"><button onclick="toggleBot('on')">BOT ON</button><button onclick="toggleBot('off')">BOT OFF</button></div>
<div class="row"><button onclick="toggleAuto('on')">AUTO-REPLY ON</button><button onclick="toggleAuto('off')">AUTO-REPLY OFF</button></div>
<button onclick="refreshStatus()" style="width:100%">↻ REFRESH STATUS</button>
</section>
<section class="panel">
<h2>🔑 REFERENCE PAIRING CODE</h2>
<label for="phone">WhatsApp number (country code ke saath)</label>
<input id="phone" inputmode="numeric" placeholder="Example: 919876543210">
<button onclick="getPairCode()" style="width:100%">GENERATE PAIRING CODE</button>
<div id="pairCode" class="code">----</div>
<p class="note">Code milne par WhatsApp mein Linked Devices → Link a device → Link with phone number se enter karein. Number digits only, country code ke saath.</p>
</section>
<section class="panel">
<h2>📋 AAIRA MENU / STATUS</h2>
<pre>!ping  — Check bot reply
!menu  — Show commands
Welcome message — First message from each sender
Smart auto reply — Hindi/Hinglish template replies</pre>
<p class="note">Dashboard theme: Gothic Dark • Black & White • Silver glow</p>
</section>
<footer>AAIRA • Gothic Dark Theme</footer>
</div>
<script>
async function refreshStatus(){
 try{
  const r=await fetch('/api/status');const d=await r.json();
  const c=document.getElementById('connection');c.textContent=d.connection;
  c.className='pill '+(d.connection==='Connected'?'green':'red');
  document.getElementById('bot').textContent=d.botActive?'ON ✅':'OFF ❌';
  document.getElementById('auto').textContent=d.autoReplyEnabled?'ON ✅':'OFF ❌';
 }catch(e){document.getElementById('connection').textContent='Status unavailable'}
}
async function toggleBot(action){
 const r=await fetch('/toggle?action='+action);const d=await r.json();alert(d.message||d.botStatus);refreshStatus();
}
async function toggleAuto(action){
 const r=await fetch('/auto-reply?action='+action);const d=await r.json();alert(d.message||d.autoReply);refreshStatus();
}
async function getPairCode(){
 const phone=document.getElementById('phone').value.replace(/\\D/g,'');
 const box=document.getElementById('pairCode');
 if(!phone){alert('WhatsApp number enter karein');return}
 box.textContent='Generating...';
 try{
  const r=await fetch('/pair?phone='+encodeURIComponent(phone));const d=await r.json();
  box.textContent=d.pairingCode||d.message||d.error||'Could not generate code';
  if(!r.ok)alert(d.error||'Pairing code error');
 }catch(e){box.textContent='Request failed';alert('Server se connection nahi hua')}
}
refreshStatus();setInterval(refreshStatus,10000);
</script></body></html>`;

app.get('/', (req, res) => res.type('html').send(dashboardHtml));

app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    connection: connectionStatus,
    botActive: isBotActive,
    autoReplyEnabled: isAutoReplyEnabled,
    socketReady: !!sock
  });
});

app.get('/toggle', (req, res) => {
  const action = String(req.query.action || '').toLowerCase();
  if (action === 'on') {
    isBotActive = true;
    return res.json({ success: true, message: 'Bot is now ON ✅', botStatus: 'ON' });
  }
  if (action === 'off') {
    isBotActive = false;
    return res.json({ success: true, message: 'Bot is now OFF ❌', botStatus: 'OFF' });
  }
  res.json({ success: true, botStatus: isBotActive ? 'ON' : 'OFF' });
});

app.get('/auto-reply', (req, res) => {
  const action = String(req.query.action || '').toLowerCase();
  if (action === 'on') {
    isAutoReplyEnabled = true;
    return res.json({ success: true, message: 'Auto-reply is now ON ✅', autoReply: 'ON' });
  }
  if (action === 'off') {
    isAutoReplyEnabled = false;
    return res.json({ success: true, message: 'Auto-reply is now OFF ❌', autoReply: 'OFF' });
  }
  res.json({ success: true, autoReply: isAutoReplyEnabled ? 'ON' : 'OFF' });
});

app.get('/pair', async (req, res) => {
  const phoneNumber = String(req.query.phone || '').replace(/[^0-9]/g, '');
  if (!phoneNumber) {
    return res.status(400).json({ error: 'Phone number required with country code, e.g. 919876543210' });
  }
  if (!sock || connectionStatus !== 'Disconnected' && !sock.authState?.creds) {
    return res.status(503).json({ error: 'WhatsApp socket is not ready yet. Wait and try again.' });
  }
  if (sock.authState.creds.registered) {
    return res.json({ success: true, message: 'WhatsApp session already registered.' });
  }
  try {
    let code = await sock.requestPairingCode(phoneNumber);
    code = code?.match(/.{1,4}/g)?.join('-') || code;
    res.json({ success: true, pairingCode: code });
  } catch (err) {
    console.error('Pairing Error:', err);
    res.status(500).json({ error: 'Failed to generate pairing code. Check number and try again.' });
  }
});

// Gemini-powered natural chat. Conversation context stays in server RAM and is limited per sender.
const chatHistory = new Map();
const MAX_HISTORY_MESSAGES = 10;

async function generateAIReply(sender, userMessage) {
  // Deterministic lookup for common acronym/full-form questions (does not call Gemini).
  const normalizedQuestion = userMessage.toLowerCase().replace(/[?!.]/g, ' ').replace(/\s+/g, ' ').trim();
  const knownFullForms = { mp: 'Madhya Pradesh', up: 'Uttar Pradesh', cid: 'Crime Investigation Department (CID)', usa: 'United States of America', uae: 'United Arab Emirates', rbi: 'Reserve Bank of India', cbi: 'Central Bureau of Investigation', isro: 'Indian Space Research Organisation', nasa: 'National Aeronautics and Space Administration', atm: 'Automated Teller Machine', pnr: 'Passenger Name Record', otp: 'One-Time Password', cpu: 'Central Processing Unit', html: 'HyperText Markup Language', www: 'World Wide Web', lpg: 'Liquefied Petroleum Gas', gst: 'Goods and Services Tax', upsc: 'Union Public Service Commission', ips: 'Indian Police Service', ias: 'Indian Administrative Service' };
  const fullFormMatch = normalizedQuestion.match(/\b([a-z]{2,8})\s*(?:ka|ki)?\s*(?:full\s*form|fullform)\b/) || normalizedQuestion.match(/\b(?:full\s*form|fullform)\s+(?:of\s+)?([a-z]{2,8})\b/);
  if (fullFormMatch) {
    const acronym = fullFormMatch[1].toLowerCase();
    if (knownFullForms[acronym]) return knownFullForms[acronym];
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return generateReply(userMessage);

  const history = chatHistory.get(sender) || [];
  const contents = [...history, { role: 'user', parts: [{ text: userMessage }] }];

  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: `You are AAIRA, a friendly and capable WhatsApp AI assistant. PRIORITY: answer the user's exact question directly, accurately, and usefully. For simple factual questions and full forms, answer in one clear sentence without filler, follow-up questions, or generic chat. Examples: 'MP ka full form?' -> 'Madhya Pradesh.'; 'UP ka full form?' -> 'Uttar Pradesh.'; 'India ki capital?' -> 'New Delhi.' Never respond to a factual question with 'context do', 'aur kya hua', or 'achha sawaal'. For other knowledge questions, give the correct answer first, then a concise explanation. If you are unsure, say you are unsure; do not guess or invent. For casual conversation, be warm, lively, empathetic, and natural. Match the user's language, especially Hindi/Hinglish, and keep responses concise unless the user asks for details. Use supplied chat history only when relevant. Do not claim to be human or provide unsafe instructions.` }]
      },
      contents,
      generationConfig: { temperature: 0.25, maxOutputTokens: 350 }
    }),
    signal: AbortSignal.timeout(25000)
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || 'Gemini API request failed');
  const reply = data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
  if (!reply) throw new Error('Gemini returned an empty response');

  chatHistory.set(sender, [
    ...history,
    { role: 'user', parts: [{ text: userMessage }] },
    { role: 'model', parts: [{ text: reply }] }
  ].slice(-MAX_HISTORY_MESSAGES));
  return reply;
}

function choose(list) {
  return list[Math.floor(Math.random() * list.length)];
}

const replyGroups = {
  greeting: ['Hello dost! 😊 Kya haal hai?', 'Hii! Kaise ho aaj?', 'Arey hello! ❤️', 'Namaste ji 🙏', 'Hey yaar! Kya chal raha hai?'],
  mood: ['Main badhiya hoon! Tum batao?', 'Sab mast hai yaar, tum kaise ho?', 'Achha hoon 😊 Tum sunao.', 'Tumse baat karke achha lag raha hai.'],
  happy: ['Arey waah! Ye sunkar bahut achha laga! 😍', 'Mast! Aise hi khush raho!', 'Bahut badhiya yaar! 🎉', 'Proud of you! ❤️'],
  sad: ['Kya hua dost? Dil ki baat batao.', 'Main sun raha hoon, aaram se batao.', 'Tumhari feelings important hain.', 'Apna khayal rakho dost.'],
  love: ['Aww, kitni sweet baat hai! ❤️', 'Kisi special ki yaad aa rahi hai? 🥰', 'Cute yaar! ❤️', 'Love is a beautiful feeling!'],
  funny: ['Hahaha! 😂', 'Bhai tum toh kamaal ho!', 'Hasi nahi ruk rahi! 😂', 'Haha, aur sunao!'],
  daily: ['Aaj kya kya kiya?', 'Khana kha liya? 😊', 'Abhi kya kar rahe ho?', 'Aaj ka plan kya hai?'],
  thanks: ['Arey koi baat nahi dost! ❤️', 'Welcome yaar!', 'Khushi hui madad karke 😊', 'Always welcome dost!'],
  sorry: ['Arey koi baat nahi 😊', 'Its okay dost!', 'Chinta mat karo.', 'No worries!'],
  question: ['Achha sawaal hai! 😊', 'Iske baare mein thoda aur batao.', 'Chalo isko samajhte hain.', 'Haan ji, pucho!'],
  goodMorning: ['Good morning dost! 🌞', 'Suprabhat! Aaj ka din shubh ho!', 'Nayi subah, nayi umeed! ✨'],
  goodNight: ['Good night dost! 🌙', 'Sweet dreams! ❤️', 'Achhi neend lena!'],
  default: ['Achha! 😊', 'Hmm, samajh raha hoon.', 'Aur kya chal raha hai?', 'Tumhari baat sun raha hoon.', 'Batao dost!']
};

function detectCategory(t) {
  if (/^(hi|hello|hey|hii|hlo|namaste|नमस्ते|हाय)$/.test(t)) return 'greeting';
  if (/good morning|suprabhat|subah bakhair/.test(t)) return 'goodMorning';
  if (/good night|shubh ratri|sweet dreams/.test(t)) return 'goodNight';
  if (/kaise ho|how are you|kya haal|haal chaal/.test(t)) return 'mood';
  if (/khush|happy|mast|maza|awesome|great|wah|waah|congratulations/.test(t)) return 'happy';
  if (/sad|dukhi|udaas|pareshan|tension|akela|रोना|दुख/.test(t)) return 'sad';
  if (/love|pyaar|pyar|mohabbat|jaan|miss you|i love you/.test(t)) return 'love';
  if (/😂|🤣|joke|funny|haha|hahaha|lol/.test(t)) return 'funny';
  if (/thank|thanks|shukriya|धन्यवाद/.test(t)) return 'thanks';
  if (/sorry|maaf|गलती/.test(t)) return 'sorry';
  if (/kya kar|kha liya|khana|din kaisa|plan|breakfast/.test(t)) return 'daily';
  if (/\?|kya|kyu|kaise|kab|where|why|how|what|who/.test(t)) return 'question';
  return 'default';
}

async function startBot() {
  const { state, saveCreds } = await useSupabaseAuthState('bot_session');
  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
    browser: ['Ubuntu', 'Chrome', '20.0.04']
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'open') {
      connectionStatus = 'Connected';
      console.log('WhatsApp Connected Successfully via Supabase! ✅');
    }
    if (connection === 'connecting') connectionStatus = 'Connecting';
    if (connection === 'close') {
      connectionStatus = 'Disconnected';
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.log('Connection closed:', statusCode);
      if (statusCode !== DisconnectReason.loggedOut) {
        setTimeout(() => startBot().catch(console.error), 3000);
      } else {
        console.log('Logged out. Re-pair required.');
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try {
        if (!msg.message || msg.key.fromMe) continue;
        const sender = msg.key.remoteJid;
        if (!sender || sender === 'status@broadcast' || sender.endsWith('@g.us')) continue;

        const textMessage = (
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.imageMessage?.caption ||
          msg.message.videoMessage?.caption ||
          ''
        ).trim().toLowerCase();
        if (!textMessage) continue;

        console.log(`[Incoming Message] From: ${sender} | Text: "${textMessage}"`);
        if (!isBotActive) continue;

        if (textMessage === '!ping') {
          await sock.sendMessage(sender, { text: 'Pong! 🏓 Bot is active and running.' });
          continue;
        }
        if (textMessage === '!menu') {
          await sock.sendMessage(sender, {
            text: '🤖 *AAIRA WhatsApp Bot Menu*\\n\\n!ping - Check bot status\\n!menu - Show commands\\nSmart Auto Reply - Automatic chatting\\n\\nBot Status: ON ✅'
          });
          continue;
        }

        // Send the exact welcome message once when a sender first messages AAIRA.
        if (!greetedUsers.has(sender)) {
          greetedUsers.add(sender);
          await sock.sendMessage(sender, { text: WELCOME_MESSAGE });
        }
        if (!isAutoReplyEnabled) continue;

        let replyText;
        try {
          replyText = await generateAIReply(sender, textMessage);
        } catch (aiErr) {
          console.error('Gemini reply failed; using local fallback:', aiErr.message);
          replyText = generateReply(textMessage);
        }

        await sock.sendMessage(sender, { text: replyText });
        console.log('[Reply Sent Successfully]');
      } catch (err) {
        console.error('Error processing message:', err);
      }
    }
  });
}

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  startBot().catch(console.error);
});
