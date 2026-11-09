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

const { getChatReply } = require('./chatBank');
const crypto = require('crypto');
const aairaAuth = require('./aairaAuth');
const greetedSenders = new Set();
// Authentication stages and reset OTPs are transient server memory; OTPs expire after 5 minutes.
const authStages = new Map();
const resetCodes = new Map();
const authenticatedSenders = new Set();

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
        const phone = sender.split('@')[0].replace(/[^0-9]/g, '');
        const textMessage = (
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.imageMessage?.caption ||
          msg.message.videoMessage?.caption || ''
        ).trim();
        if (!textMessage || !isBotActive || !isAutoReplyEnabled) continue;

        const send = (text) => sock.sendMessage(sender, { text });
        const stage = authStages.get(sender);

        if (textMessage.toLowerCase() === '!reset' || textMessage.toLowerCase() === 'forgot password') {
          const code = String(crypto.randomInt(100000, 1000000));
          resetCodes.set(sender, { code, expiresAt: Date.now() + 5 * 60 * 1000, attempts: 0 });
          authStages.set(sender, 'reset_otp');
          await send('🔐 Password reset code: *' + code + '*\nYe code 5 minute valid hai. Isi WhatsApp chat mein code enter karein.');
          continue;
        }

        if (stage === 'register_password') {
          if (!/^[0-9]{8}$/.test(textMessage)) {
            await send('❌ Password exactly 8 digits ka numeric hona chahiye. Naya password enter karein.');
            continue;
          }
          const result = await aairaAuth.register(phone, textMessage);
          if (result === 'created') {
            authenticatedSenders.add(sender);
            authStages.delete(sender);
            await send('✅ Account create aur verify ho gaya! AAIRA bot ab use kar sakte hain.');
          } else {
            authStages.set(sender, 'login_password');
            await send('Account pehle se hai. 🔑 Apna 8-digit password enter karein.');
          }
          continue;
        }

        if (stage === 'login_password') {
          if (!/^[0-9]{8}$/.test(textMessage)) {
            await send('🔑 Password exactly 8 digits ka hona chahiye. Dobara enter karein.');
            continue;
          }
          const result = await aairaAuth.verify(phone, textMessage);
          if (result === 'ok') {
            authenticatedSenders.add(sender);
            authStages.delete(sender);
            await send('✅ Number aur password verify ho gaye! Welcome to AAIRA.');
          } else if (result === 'locked') {
            await send('⏳ 5 wrong attempts ho gaye. Account 15 minutes ke liye locked hai.');
          } else if (result === 'not_found') {
            authStages.set(sender, 'register_password');
            await send('🆕 Account nahi mila. Apna naya *8-digit numeric password* banayein aur bhejein.');
          } else {
            await send('❌ Password galat hai. Dobara enter karein, ya password reset ke liye !reset bhejein.');
          }
          continue;
        }

        if (stage === 'reset_otp') {
          const record = resetCodes.get(sender);
          if (!record || Date.now() > record.expiresAt) {
            resetCodes.delete(sender); authStages.delete(sender);
            await send('⌛ Reset code expire ho gaya. !reset bhej kar naya code lein.');
            continue;
          }
          record.attempts++;
          if (record.attempts > 5) {
            resetCodes.delete(sender); authStages.delete(sender);
            await send('🚫 Too many attempts. !reset bhej kar naya code request karein.');
            continue;
          }
          if (textMessage !== record.code) {
            await send('❌ Code galat hai. Sahi reset code enter karein.');
            continue;
          }
          resetCodes.delete(sender);
          authStages.set(sender, 'reset_password');
          await send('✅ Code verify ho gaya. Ab naya exactly 8-digit password enter karein.');
          continue;
        }

        if (stage === 'reset_password') {
          if (!/^[0-9]{8}$/.test(textMessage)) {
            await send('❌ Naya password exactly 8 digits ka hona chahiye.');
            continue;
          }
          const result = await aairaAuth.resetPassword(phone, textMessage);
          authStages.delete(sender);
          if (result === 'reset') {
            authenticatedSenders.add(sender);
            await send('🔐 Password reset successful! AAIRA access restored.');
          } else {
            await send('Account nahi mila. Pehle account register karein.');
          }
          continue;
        }

        if (!authenticatedSenders.has(sender)) {
          const result = await aairaAuth.verify(phone, textMessage);
          if (result === 'ok') {
            authenticatedSenders.add(sender);
            await send('✅ Password verify ho gaya! AAIRA ready hai.');
            continue;
          }
          if (result === 'not_found') {
            authStages.set(sender, 'register_password');
            await send('🔐 AAIRA account verification\nAapka WhatsApp number automatically detect hua. Apna naya *8-digit numeric password* enter karein.');
          } else if (result === 'locked') {
            await send('⏳ Account 15 minutes ke liye locked hai. Baad mein try karein.');
          } else {
            authStages.set(sender, 'login_password');
            await send('🔑 AAIRA account protected hai. Apna *8-digit password* enter karein. Password bhool gaye? !reset bhejein.');
          }
          continue;
        }

        if (!greetedSenders.has(sender)) {
          await send('*Heyy! 💗 Mai VIHUHUHU KA OFFLINE ASSISTANT 😴✨ AI HU MERA NAME AAIRA HAI*');
          greetedSenders.add(sender);
        }

        let replyText;
        try { replyText = getChatReply(textMessage); }
        catch (aiErr) { console.error('Chat bank reply failed:', aiErr.message); continue; }
        if (replyText) {
          await send(replyText);
          console.log('[Reply Sent Successfully]');
        }
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
