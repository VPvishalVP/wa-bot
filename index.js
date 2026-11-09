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
let isAutoReplyEnabled = true;
let connectionStatus = 'Disconnected';

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
AAIRA fixed assistant replies — common Hindi/Hinglish/English topics</pre>
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

// Fixed assistant reply bank: no external AI/API calls.
const assistantReplyRules = [
  { keys: /\b(hi|hello|hey|hola|namaste|नमस्ते|हेलो|हाय)\b/i, hi: "Namaste! Main AAIRA hoon. Aap kis cheez mein madad chahte hain?", en: "Hello! I’m AAIRA. What can I help you with?" },
  { keys: /\b(good morning|सु.?प्रभात|शुभ प्रभात)\b/i, hi: "Good morning! Aapka din achha rahe. Bataiye, kis kaam mein madad karun?", en: "Good morning! Hope you have a great day. How can I help?" },
  { keys: /\b(good afternoon|शुभ दोपहर)\b/i, hi: "Good afternoon! Bataiye, main aapki kya help kar sakti hoon?", en: "Good afternoon! How can I help you?" },
  { keys: /\b(good evening|शुभ संध्या)\b/i, hi: "Good evening! Aapko kis cheez mein madad chahiye?", en: "Good evening! What can I help you with?" },
  { keys: /\b(good night|शुभ रात्रि|शुभ रात्री)\b/i, hi: "Good night! Aaram se soiye. 🌙", en: "Good night! Sleep well. 🌙" },
  { keys: /\b(how are you|kaisi ho|kaise ho|कैसी हो|कैसे हो)\b/i, hi: "Main AAIRA hoon—ready aur kaam karne ke liye available! Aap kaise hain?", en: "I’m AAIRA, ready to help! How are you doing?" },
  { keys: /\b(who are you|tum kaun|aap kaun|कौन हो|आप कौन)\b/i, hi: "Main AAIRA hoon, aapka WhatsApp assistant. Main programmed topics par fixed replies deti hoon; main Gemini ya live AI nahi hoon.", en: "I’m AAIRA, your WhatsApp assistant. I use programmed replies for supported topics; I’m not a live AI model." },
  { keys: /\b(your name|naam kya|नाम क्या|name kya)\b/i, hi: "Mera naam AAIRA hai. 😊", en: "My name is AAIRA. 😊" },
  { keys: /\b(help|madad|मदद| सहायता|assist)\b/i, hi: "Main greetings, basic information, study tips, coding basics, WhatsApp bot help, simple maths, time/date aur common questions mein programmed help de sakti hoon. Apna sawaal seedha bhejein.", en: "I can provide programmed help with greetings, basic information, study tips, coding basics, WhatsApp bot help, simple math, time/date, and common questions. Send your question directly." },
  { keys: /\b(menu|commands|command list|options)\b/i, hi: "AAIRA: !ping — bot check; !menu — commands. Main common greetings, help, study, coding, bot-related questions aur basic maths ke replies bhi handle karti hoon.", en: "AAIRA menu: !ping — check bot; !menu — commands. I also handle common greetings, help, study, coding, bot questions, and basic math." },
  { keys: /\b(ping)\b/i, hi: "Pong! ✅ AAIRA online hai.", en: "Pong! ✅ AAIRA is online." },
  { keys: /\b(thank you|thanks|thx|shukriya|धन्यवाद| शुक्रिया)\b/i, hi: "Aapka swagat hai! 😊", en: "You’re welcome! 😊" },
  { keys: /\b(welcome|स्वागत)\b/i, hi: "Khushi hui! 😊", en: "Glad to help! 😊" },
  { keys: /\b(sorry|maaf|माफ़ी|माफ करना)\b/i, hi: "Koi baat nahi. 😊", en: "No worries. 😊" },
  { keys: /\b(bye|goodbye|alvida|फिर मिलेंगे|बाय)\b/i, hi: "Bye! Apna khayal rakhiye. 👋", en: "Goodbye! Take care. 👋" },
  { keys: /\b(love you|i love you|प्यार करता|प्यार करती)\b/i, hi: "Aapki kindness ke liye shukriya! Main ek AI-style programmed assistant hoon, aur help ke liye yahan hoon. 😊", en: "That’s kind of you! I’m a programmed assistant, here to help. 😊" },
  { keys: /\b(joke| मजाक|चुटकुला|funny)\b/i, hi: "Teacher: Homework kahan hai? Student: Sir, Wi-Fi ke saath upload kiya tha—network hi fail ho gaya! 😄", en: "Why did the computer go to the doctor? It had a virus! 😄" },
  { keys: /\b(motivat|motivation|प्रेरणा|inspire)\b/i, hi: "Chhote steps bhi progress hote hain. Roz thoda sa consistent effort rakho—perfect hone se pehle shuru karna zaroori hai. 💪", en: "Small steps are still progress. Stay consistent; starting matters more than being perfect. 💪" },
  { keys: /\b(sad|dukhi|उदास|upset|depressed|tension|pareshan|परेशान)\b/i, hi: "Mujhe afsos hai ki aap aisa feel kar rahe hain. Kisi bharosemand dost ya family member se baat karna helpful ho sakta hai. Agar aap immediate danger mein hain, local emergency help lein.", en: "I’m sorry you’re feeling this way. Talking with someone you trust may help. If you’re in immediate danger, contact local emergency services." },
  { keys: /\b(study|padhai|पढ़ाई|exam| परीक्षा|student)\b/i, hi: "Study tip: 25 minute focus + 5 minute break (Pomodoro) try karein. Topic ko chhote parts mein baant kar active recall aur practice questions karein.", en: "Study tip: try 25 minutes of focus followed by a 5-minute break. Break topics into small parts and use active recall and practice questions." },
  { keys: /\b(time management|manage time|समय प्रबंधन)\b/i, hi: "Aaj ke 3 important tasks likhein, har task ka realistic time set karein, aur distractions ko study/work block ke dauran mute rakhein.", en: "List your three priorities, assign realistic time blocks, and mute distractions during focused work." },
  { keys: /\b(english|अंग्रेजी|अंग्रेज़ी|learn english)\b/i, hi: "English practice ke liye roz 5 naye words, 5 simple sentences aur 10 minute loud reading karein. Aap koi sentence bhejein, main uska programmed correction format de sakti hoon.", en: "Practice English daily with five new words, five sentences, and ten minutes of reading aloud." },
  { keys: /\b(hindi|हिंदी)\b/i, hi: "Main Hindi aur Hinglish messages samajhne ke liye common patterns par programmed hoon. Apna sentence ya sawaal bhejiye.", en: "I can handle common Hindi/Hinglish patterns. Send your sentence or question." },
  { keys: /\b(meaning|मतलब|अर्थ|define|definition)\b/i, hi: "Kis word ka meaning chahiye? Word ke saath bhejein, main common meanings ke programmed replies mein check karungi.", en: "Which word would you like defined? Send the word so I can check my programmed replies." },
  { keys: /\b(what is|kya hai|क्या है|explain|samjhao|समझाओ)\b/i, hi: "Is topic ka detailed jawab meri fixed reply list mein shayad nahi hai. Sawaal ko thoda specific karein; main supported topics par help kar sakti hoon.", en: "I may not have a programmed detailed answer for that topic. Please make the question more specific; I can help with supported topics." },
  { keys: /\b(whatsapp|wa bot|baileys)\b/i, hi: "WhatsApp bot Baileys library se connect hota hai. AAIRA ka status Render dashboard par check karein; pairing ke liye dashboard ka Pairing Code section use karein. Apna API key ya pairing code kisi ke saath share na karein.", en: "This WhatsApp bot connects using the Baileys library. Check its status in the Render dashboard and use the Pairing Code section to link it. Never share your API key or pairing code." },
  { keys: /\b(render|hosting|host)\b/i, hi: "AAIRA Render par hosted hai. Service ke Events/Logs mein deployment aur runtime status check karein. Code update ke baad Manual Deploy → Deploy latest commit karein.", en: "AAIRA is hosted on Render. Check the service Events/Logs for deployment and runtime status. After code changes, use Manual Deploy → Deploy latest commit." },
  { keys: /\b(supabase|database|session)\b/i, hi: "Supabase AAIRA ke WhatsApp authentication session ko store karta hai. Supabase project active rahe aur service-role secret private rakhein.", en: "Supabase stores AAIRA’s WhatsApp authentication session. Keep the project active and its service-role secret private." },
  { keys: /\b(github|git hub|repository|repo)\b/i, hi: "AAIRA ka source code GitHub repository mein hai. Code changes commit hone ke baad Render par latest commit deploy karna hota hai.", en: "AAIRA’s source code is in its GitHub repository. After committing code changes, deploy the latest commit on Render." },
  { keys: /\b(api key|apikey|secret key)\b/i, hi: "API key ek secret credential hai. Use chat, screenshot, GitHub code ya public logs mein share na karein. Agar leak ho gayi ho toh provider dashboard se rotate/revoke karein.", en: "An API key is a secret credential. Never share it in chat, screenshots, GitHub code, or public logs. If exposed, rotate or revoke it in the provider dashboard." },
  { keys: /\b(error|bug|problem|issue|not working|काम नहीं|nahi chal|band hai)\b/i, hi: "Problem solve karne ke liye exact error message aur relevant log ka text bhejein—API keys, phone numbers, pairing codes aur secrets hide karke.", en: "To troubleshoot, send the exact error message and relevant logs, with API keys, phone numbers, pairing codes, and secrets hidden." },
  { keys: /\b(password|पासवर्ड)\b/i, hi: "Strong password rakhein: lamba, unique, aur doosri sites par reuse na karein. Password kisi ke saath share na karein.", en: "Use a long, unique password and don’t reuse it across sites or share it with anyone." },
  { keys: /\b(internet|wifi|wi-fi|नेट)\b/i, hi: "Internet issue ke liye router restart, mobile data/Wi-Fi toggle, aur doosri website check karein. Agar sirf bot issue hai, Render logs dekhein.", en: "For internet issues, restart the router, toggle Wi-Fi/mobile data, and test another site. If only the bot is affected, check Render logs." },
  { keys: /\b(weather|मौसम)\b/i, hi: "Mere paas live weather access nahi hai. Current weather ke liye phone ka Weather app ya trusted weather service check karein.", en: "I don’t have live weather access. Please check your phone’s Weather app or a trusted weather service." },
  { keys: /\b(news|खबर|समाचार)\b/i, hi: "Mere paas live news access nahi hai. Latest news ke liye trusted news source check karein.", en: "I don’t have live news access. Please check a trusted news source for the latest updates." },
  { keys: /\b(today|आज|date|तारीख)\b/i, hi: "Aaj ki date: " + new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full' }) + ".", en: "Today’s date is " + new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', dateStyle: 'full' }) + "." },
  { keys: /\b(time|समय|kitne baje)\b/i, hi: "Abhi India time: " + new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) + ".", en: "Current India time: " + new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) + "." },
  { keys: /\b(calculator|calculate|गणना|math|गणित)\b/i, hi: "Simple calculation ke liye expression is format mein bhejein: 12 + 8, 9 * 7, 20 / 4 ya 15 - 6.", en: "For simple calculations, send an expression like 12 + 8, 9 * 7, 20 / 4, or 15 - 6." },
  { keys: /\b(health|healthy|सेहत|स्वास्थ्य|fitness)\b/i, hi: "General wellness: regular sleep, balanced meals, hydration aur light physical activity helpful hote hain. Personal medical concern ke liye qualified doctor se salah lein.", en: "General wellness includes regular sleep, balanced meals, hydration, and light activity. Consult a qualified clinician for personal medical concerns." },
  { keys: /\b(food|khana|भोजन|recipe|रेसिपी)\b/i, hi: "Simple healthy meal idea: dal, roti/rice, seasonal sabzi aur dahi. Specific recipe chahiye toh dish ka naam bhejein.", en: "A simple balanced meal idea is dal, roti/rice, seasonal vegetables, and yogurt. Send a dish name for a recipe topic." },
  { keys: /\b(hello there|hey there|sup|kya haal|क्या हाल)\b/i, hi: "Sab theek! Aapko kis kaam mein help chahiye?", en: "All good! What can I help you with?" },
  { keys: /\b(are you human|real person| इंसान|human ho)\b/i, hi: "Nahi, main AAIRA ek programmed WhatsApp assistant hoon, insaan nahi.", en: "No, I’m AAIRA, a programmed WhatsApp assistant, not a human." },
  { keys: /\b(creator|owner|kisne banaya|who made you|बनाया)\b/i, hi: "Mujhe Vishal ke WhatsApp assistant project AAIRA ke roop mein configure kiya gaya hai.", en: "I was configured as AAIRA for Vishal’s WhatsApp assistant project." },
  { keys: /\b(what can you do|capabilities|kya kar sakti|क्या कर सकती)\b/i, hi: "Main common conversational replies, greetings, basic tips, simple maths, time/date aur AAIRA bot troubleshooting ke programmed messages de sakti hoon. Main internet se live information ya open-ended AI answers generate nahi karti.", en: "I can provide programmed conversational replies, greetings, basic tips, simple math, time/date, and AAIRA bot troubleshooting. I cannot fetch live information or generate open-ended AI answers." }
];

function createAssistantReply(userMessage) {
  const message = String(userMessage || '').trim();
  const lower = message.toLowerCase();
  const isHindi = /[\u0900-\u097F]/.test(message) ||
    /\b(kaise|kaisa|kaisi|kya|kyu|kyun|hai|hain|ho|hoga|hogi|batao|bataiye|madad|namaste|shukriya|dhanyawad|mera|meri|aap|tum|nahi|haan|han|theek|karna|karo|chahiye|padhai|khana|samjhao)\b/i.test(lower);

  // Handle elementary arithmetic without eval or executing user-provided code.
  const mathMatch = lower.match(/(?:what is|calculate|solve|kitna|=?\s*)?(-?\d+(?:\.\d+)?)\s*([+\-*\/])\s*(-?\d+(?:\.\d+)?)(?:\s*=?\s*\??)?$/);
  if (mathMatch) {
    const a = Number(mathMatch[1]), b = Number(mathMatch[3]), op = mathMatch[2];
    let result;
    if (op === '+') result = a + b;
    else if (op === '-') result = a - b;
    else if (op === '*') result = a * b;
    else if (op === '/') result = b === 0 ? null : a / b;
    if (result !== undefined) return result === null ? "Zero se divide nahi kar sakte. / Division by zero is undefined." : String(result);
  }

  for (const rule of assistantReplyRules) {
    if (rule.keys.test(message)) return isHindi ? rule.hi : rule.en;
  }

  return isHindi
    ? "Is message ka exact jawab meri fixed reply list mein abhi nahi hai. Gemini AI hata diya gaya hai, isliye main sirf programmed topics handle kar sakti hoon. Sawaal ko greetings, basic maths, study, coding, WhatsApp bot, ya help se related specific banakar bhejein."
    : "I don’t have a programmed reply for this exact message yet. Gemini AI has been removed, so I can only handle predefined topics. Please ask something specific about greetings, basic math, study, coding, the WhatsApp bot, or help.";
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
        ).trim();
        if (!textMessage) continue;

        console.log(`[Incoming Message] From: ${sender} | Text: "${textMessage}"`);
        if (!isBotActive) continue;

        if (!isAutoReplyEnabled) continue;

        let replyText;
        try {
          replyText = createAssistantReply(textMessage);
        } catch (aiErr) {
          console.error('Fixed reply handler failed:', aiErr.message);
          replyText = 'Sorry, is message ko process nahi kar paayi. Please dobara try karein.';
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
