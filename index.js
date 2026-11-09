const express = require('express');
const { default: makeWASocket, DisconnectReason, fetchLatestWaWebVersion } = require('@whiskeysockets/baileys');
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
<body><section id="authGate" style="position:fixed;inset:0;z-index:99;background:#050505;display:flex;align-items:center;justify-content:center;padding:18px"><div class="panel" style="width:min(440px,100%);margin:0"><h2>🔐 AAIRA ACCOUNT</h2><p class="note">Mobile number aur 6-64 characters password se login karein ya account banayein.</p><label>Mobile number (country code ke saath)</label><input id="authPhone" inputmode="numeric" placeholder="919876543210"><label>Password (minimum 6 characters)</label><input id="authPassword" type="password" minlength="6" maxlength="64" placeholder="Password"><div class="row"><button onclick="authAction('login')">LOGIN</button><button onclick="authAction('register')">REGISTER</button></div><button onclick="forgotAccount()" style="width:100%">FORGOT PASSWORD? DELETE ACCOUNT DATA</button><p id="authMessage" class="note"></p></div></section><div class="wrap">
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
async function authAction(action){const phone=document.getElementById('authPhone').value.replace(/\\D/g,'');const password=document.getElementById('authPassword').value;const msg=document.getElementById('authMessage');if(!/^\\d{10,15}$/.test(phone)){msg.textContent='Valid phone number country code ke saath enter karein.';return}if(!/^\\S{6,64}$/.test(password)){msg.textContent='Password 6-64 characters ka hona chahiye (spaces allowed nahi).';return}try{const r=await fetch('/api/auth/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone,password})});const d=await r.json();msg.textContent=d.message||d.error||'Request complete';if(r.ok)document.getElementById('authGate').style.display='none';}catch(e){msg.textContent='Server connection failed.'}}
async function forgotAccount(){const phone=document.getElementById('authPhone').value.replace(/\\D/g,'');if(!/^\\d{10,15}$/.test(phone)){alert('Phone number country code ke saath enter karein.');return}if(prompt('Account data permanently delete karne ke liye DELETE type karein:')!=='DELETE')return;try{const r=await fetch('/api/auth/forgot',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone,confirm:'DELETE'})});const d=await r.json();document.getElementById('authMessage').textContent=d.message||d.error||'Done';}catch(e){document.getElementById('authMessage').textContent='Server connection failed.'}}
async function refreshStatus(){try{const r=await fetch('/api/status');const d=await r.json();const c=document.getElementById('connection');c.textContent=d.connection;c.className='pill '+(d.connection==='Connected'?'green':'red');document.getElementById('bot').textContent=d.botActive?'ON ✅':'OFF ❌';document.getElementById('auto').textContent=d.autoReplyEnabled?'ON ✅':'OFF ❌';}catch(e){document.getElementById('connection').textContent='Status unavailable'}}
async function toggleBot(action){const r=await fetch('/toggle?action='+action);const d=await r.json();alert(d.message||d.botStatus);refreshStatus()}
async function toggleAuto(action){const r=await fetch('/auto-reply?action='+action);const d=await r.json();alert(d.message||d.autoReply);refreshStatus()}
async function getPairCode(){const phone=document.getElementById('phone').value.replace(/\\D/g,'');const box=document.getElementById('pairCode');if(!phone){alert('WhatsApp number enter karein');return}box.textContent='Generating...';try{const r=await fetch('/pair?phone='+encodeURIComponent(phone));const d=await r.json();box.textContent=d.pairingCode||d.message||d.error||'Could not generate code';if(!r.ok)alert(d.error||'Pairing code error')}catch(e){box.textContent='Request failed';alert('Server se connection nahi hua')}}
refreshStatus();setInterval(refreshStatus,10000);
</script></body></html>`;

const webSessions=new Map();
function getWebSession(req){const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('aaira_session='))?.slice(14);const session=token&&webSessions.get(token);if(session&&session.expiresAt>Date.now())return session;if(token)webSessions.delete(token);return null;}
function requireWebLogin(req,res,next){if(!getWebSession(req))return res.status(401).json({error:'Please login first.'});next();}
function createWebSession(phone,res){const token=crypto.randomBytes(32).toString('hex');webSessions.set(token,{phone,expiresAt:Date.now()+86400000});res.setHeader('Set-Cookie','aaira_session='+token+'; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400');}
app.post('/api/auth/register',async(req,res)=>{try{const phone=String(req.body.phone||'').replace(/\D/g,'');const password=String(req.body.password||'');if(!/^\d{10,15}$/.test(phone)||!/\S{6,64}$/.test(password))return res.status(400).json({error:'Phone valid karein aur password 6 se 64 characters ka rakhein (spaces nahi).'});const result=await aairaAuth.register(phone,password);if(result!=='created')return res.status(409).json({error:'Account already exists. Login karein.'});createWebSession(phone,res);res.json({success:true,message:'Account created, login successful.'});}catch(e){console.error('Register error:',e.message);res.status(500).json({error:'Account create nahi hua. Try again.'});}});
app.post('/api/auth/login',async(req,res)=>{try{const phone=String(req.body.phone||'').replace(/\D/g,'');const password=String(req.body.password||'');if(!/^\d{10,15}$/.test(phone)||!/\S{6,64}$/.test(password))return res.status(400).json({error:'Phone/password format invalid. Password 6-64 characters ka hona chahiye (spaces nahi).'});const result=await aairaAuth.verify(phone,password);if(result!=='ok')return res.status(401).json({error:result==='locked'?'Account 15 minutes locked hai.':'Phone number ya password galat hai.'});createWebSession(phone,res);res.json({success:true,message:'Login successful.'});}catch(e){console.error('Login error:',e.message);res.status(500).json({error:'Login failed. Try again.'});}});
app.post('/api/auth/forgot',async(req,res)=>{try{const phone=String(req.body.phone||'').replace(/\D/g,'');if(!/^\d{10,15}$/.test(phone)||req.body.confirm!=='DELETE')return res.status(400).json({error:'Phone and DELETE confirmation required.'});const result=await aairaAuth.deleteAccount(phone);for(const [token,session] of webSessions){if(session.phone===phone)webSessions.delete(token);}res.json({success:true,message:result==='deleted'?'Stored account data deleted. You can register again.':'Account not found for this number.'});}catch(e){console.error('Delete account error:',e.message);res.status(500).json({error:'Account data delete failed.'});}});
app.get('/', (req, res) => res.type('html').send(dashboardHtml));

app.get('/api/status', (req, res) => {res.json({success:true,connection:connectionStatus,botActive:isBotActive,autoReplyEnabled:isAutoReplyEnabled,socketReady:!!sock});});
app.get('/toggle', requireWebLogin, (req, res) => {const action=String(req.query.action||'').toLowerCase();if(action==='on'){isBotActive=true;return res.json({success:true,message:'Bot is now ON ✅',botStatus:'ON'});}if(action==='off'){isBotActive=false;return res.json({success:true,message:'Bot is now OFF ❌',botStatus:'OFF'});}res.json({success:true,botStatus:isBotActive?'ON':'OFF'});});
app.get('/auto-reply', requireWebLogin, (req, res) => {const action=String(req.query.action||'').toLowerCase();if(action==='on'){isAutoReplyEnabled=true;return res.json({success:true,message:'Auto-reply is now ON ✅',autoReply:'ON'});}if(action==='off'){isAutoReplyEnabled=false;return res.json({success:true,message:'Auto-reply is now OFF ❌',autoReply:'OFF'});}res.json({success:true,autoReply:isAutoReplyEnabled?'ON':'OFF'});});
app.get('/pair', requireWebLogin, async (req, res) => {const phoneNumber=String(req.query.phone||'').replace(/[^0-9]/g,'');if(!/^\d{8,15}$/.test(phoneNumber)return res.status(400).json({error:'Phone number required with country code, e.g. 919876543210'});if(!sock||!sock.authState?.creds)return res.status(503).json({error:'WhatsApp socket initialize nahi hua. Refresh karke dobara try karein.'});if(sock.authState.creds.registered)return res.json({success:true,message:'WhatsApp session already registered.'});try{res.setHeader('Cache-Control','no-store');console.log('[PAIR] Pair code requested; current connection:',connectionStatus);await new Promise(resolve=>setTimeout(resolve,1500));if(!sock||connectionStatus==='Disconnected')return res.status(503).json({error:'WhatsApp connection band ho gayi (408). Live version ke saath reconnect hone dein, phir try karein.'});let code=await sock.requestPairingCode(phoneNumber);code=code?.match(/.{1,4}/g)?.join('-')||code;if(!code)throw new Error('Empty pairing code');console.log('[PAIR] Pairing code generated successfully');res.json({success:true,pairingCode:code});}catch(err){console.error('Pairing Error:',err);res.status(500).json({error:'Pairing code generate nahi hua: '+String(err?.message||'Connection error').slice(0,120)});}});

const { getChatReply } = require('./chatBank');
const crypto = require('crypto');
const aairaAuth = require('./aairaAuth');
const greetedSenders = new Set();
async function startBot(){const {state,saveCreds}=await useSupabaseAuthState('bot_session');let waVersion;try{const live=await fetchLatestWaWebVersion();if(Array.isArray(live?.version)&&live.version.length===3){waVersion=live.version;console.log('[WA] Live Web version:',waVersion.join('.'));}}catch(e){console.warn('[WA] Live version lookup failed; using Baileys default:',e.message);}sock=makeWASocket({... (waVersion ? {version:waVersion} : {}),auth:state,printQRInTerminal:false,connectTimeoutMs:60000,keepAliveIntervalMs:25000,browser:['Ubuntu','Chrome','20.0.04']});sock.ev.on('creds.update',saveCreds);sock.ev.on('connection.update',(update)=>{const {connection,lastDisconnect}=update;if(connection==='open'){connectionStatus='Connected';console.log('WhatsApp Connected Successfully via Supabase! ✅');}if(connection==='connecting')connectionStatus='Connecting';if(connection==='close'){connectionStatus='Disconnected';const statusCode=lastDisconnect?.error?.output?.statusCode;console.log('Connection closed:',statusCode);if(statusCode!==DisconnectReason.loggedOut){setTimeout(()=>startBot().catch(console.error),3000);}else console.log('Logged out. Re-pair required.');}});sock.ev.on('messages.upsert',async({messages,type})=>{if(type!=='notify')return;for(const msg of messages){try{if(!msg.message||msg.key.fromMe)continue;const sender=msg.key.remoteJid;if(!sender||sender==='status@broadcast'||sender.endsWith('@g.us'))continue;const phone=sender.split('@')[0].replace(/[^0-9]/g,'');const textMessage=(msg.message.conversation||msg.message.extendedTextMessage?.text||msg.message.imageMessage?.caption||msg.message.videoMessage?.caption||'').trim();if(!textMessage||!isBotActive||!isAutoReplyEnabled)continue;const send=(text)=>sock.sendMessage(sender,{text});if(!greetedSenders.has(sender)){await send('*Heyy! 💗 Mai VIHUHUHU KA OFFLINE ASSISTANT 😴✨ AI HU MERA NAME AAIRA HAI*');greetedSenders.add(sender);}let replyText;try{replyText=getChatReply(textMessage);}catch(aiErr){console.error('Chat bank reply failed:',aiErr.message);continue;}if(replyText){await send(replyText);console.log('[Reply Sent Successfully]');}}catch(err){console.error('Error processing message:',err);}}});}
server.listen(PORT,()=>{console.log(`Server is running on port ${PORT}`);startBot().catch(console.error);});