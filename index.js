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
let currentDashboardOwnerPhone = null;
const liveChatBuffers=new Map(),liveChatListeners=new Map();
function publishLiveChat(owner,item){if(!owner||!item?.jid)return;let b=liveChatBuffers.get(owner);if(!b){b=[];liveChatBuffers.set(owner,b)}if(item.id&&b.some(x=>x.id===item.id))return;const entry={id:item.id||crypto.randomUUID(),jid:item.jid,text:String(item.text||'').slice(0,4000),contactName:String(item.contactName||'').slice(0,100),fromMe:!!item.fromMe,timestamp:item.timestamp||Date.now()};const existing=b.findIndex(x=>x.jid===entry.jid&&!x.text);if(existing>=0&&entry.text)b.splice(existing,1);b.push(entry);if(b.length>100)b.splice(0,b.length-100);for(const fn of liveChatListeners.get(owner)||[]){try{fn(entry)}catch{}}}

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
.chat-layout{display:grid;grid-template-columns:minmax(110px,32%) 1fr;gap:10px;min-height:300px}.chat-contacts,.chat-messages{border:1px solid #555;border-radius:10px;padding:8px;min-width:0}.chat-contacts{max-height:360px;overflow:auto}.contact{display:block;width:100%;text-align:left;margin:3px 0;overflow-wrap:anywhere}.chat-messages{display:flex;flex-direction:column;gap:8px;max-height:360px;overflow:auto;background:#050505}.bubble{max-width:90%;padding:9px 11px;border:1px solid #666;border-radius:12px;white-space:pre-wrap;overflow-wrap:anywhere}.bubble.in{align-self:flex-start}.bubble.out{align-self:flex-end;border-color:#aaa;background:#171717}.chat-compose{display:flex;gap:6px;margin-top:10px}.chat-compose input{margin:0;flex:1;min-width:0}
pre{white-space:pre-wrap;color:#ddd;font-size:13px}
footer{text-align:center;color:#777;padding:20px;font-size:12px}
</style>
</head>
<body><section id="authGate" style="position:fixed;inset:0;z-index:99;background:#050505;display:flex;align-items:center;justify-content:center;padding:18px"><div class="panel" style="width:min(440px,100%);margin:0"><h2>🔐 AAIRA ACCOUNT</h2><p class="note">Mobile number aur 6-64 characters password se login karein ya account banayein.</p><label>Mobile number (country code ke saath)</label><input id="authPhone" inputmode="numeric" placeholder="919876543210"><label>Password (minimum 6 characters)</label><input id="authPassword" type="password" minlength="6" maxlength="64" placeholder="Password"><div class="row"><button onclick="authAction('login')">LOGIN</button><button onclick="authAction('register')">REGISTER</button></div><button onclick="forgotAccount()" style="width:100%">FORGOT PASSWORD? DELETE ACCOUNT DATA</button><p id="authMessage" class="note"></p></div></section><div class="wrap">
<header id="mainHeader"><div class="logo">AAIRA ✦</div><div class="subtitle">VIHUHUHU KA OFFLINE ASSISTANT</div><button id="openLiveDashboard" onclick="openLiveDashboard()" style="width:100%;max-width:420px;margin:18px auto;font-size:16px">💬 LIVE WHATSAPP</button></header>
<section class="panel">
<div class="status"><h2>WHATSAPP CONNECTION</h2><span id="connection" class="pill red">Disconnected</span></div>
<div class="status"><span>Bot Status</span><span id="bot" class="pill">Checking...</span></div>
<div class="status" style="margin-top:10px"><span>Auto Reply</span><span id="auto" class="pill">Checking...</span></div>
<div class="row" style="margin-top:15px"><button onclick="toggleBot('on')">BOT ON</button><button onclick="toggleBot('off')">BOT OFF</button></div>
<div class="row"><button onclick="toggleAuto('on')">AUTO-REPLY ON</button><button onclick="toggleAuto('off')">AUTO-REPLY OFF</button></div>
<button onclick="refreshStatus()" style="width:100%">↻ REFRESH STATUS</button>
</section>
<section class="panel" id="liveChatPanel" style="display:none"><button onclick="backToMainDashboard()" style="width:100%;margin:0 0 12px">← BACK</button><h2>💬 LIVE WHATSAPP CHAT</h2><p id="liveChatStatus" class="note">Live chat connection status check ho raha hai… Chats RAM mein temporarily rehte hain, permanent history nahi.</p><div class="chat-layout"><div id="liveChatContacts" class="chat-contacts"><p class="note">Live contacts yahan aayenge</p></div><div id="liveChatMessages" class="chat-messages"><p class="note">Koi live message nahi hai.</p></div></div><div class="chat-compose"><input id="liveChatReply" placeholder="Reply likhein..." maxlength="4000"><button onclick="sendLiveChatReply()">SEND</button></div></section>
<section class="panel">
<h2>💗 GREETING NAME SETTINGS</h2>
<label for="displayName">Greeting mein naam (VIHUHUHU ko badlein)</label>
<input id="displayName" maxlength="40" placeholder="VIHUHUHU">
<button onclick="saveDisplayName()" style="width:100%">SAVE GREETING NAME</button>
<p id="nameMessage" class="note">Default: VIHUHUHU</p>
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
async function authAction(action){const phone=document.getElementById('authPhone').value.replace(/\\D/g,'');const password=document.getElementById('authPassword').value;const msg=document.getElementById('authMessage');if(!/^\\d{10,15}$/.test(phone)){msg.textContent='Valid phone number country code ke saath enter karein.';return}if(!/^\\S{6,64}$/.test(password)){msg.textContent='Password 6-64 characters ka hona chahiye (spaces allowed nahi).';return}try{const r=await fetch('/api/auth/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone,password})});const d=await r.json();msg.textContent=d.message||d.error||'Request complete';if(r.ok){document.getElementById('authGate').style.display='none';refreshStatus();loadDisplayName();}}catch(e){msg.textContent='Server connection failed: '+(e?.message||'Network error')+'. Dashboard ko reload karke dobara try karein.'}}
async function forgotAccount(){const phone=document.getElementById('authPhone').value.replace(/\\D/g,'');const password=document.getElementById('authPassword').value;if(!/^\\d{10,15}$/.test(phone)){alert('Phone number country code ke saath enter karein.');return}if(!/^\\S{6,64}$/.test(password)){alert('Account delete karne ke liye apna password enter karein.');return}if(prompt('Account data permanently delete karne ke liye DELETE type karein:')!=='DELETE')return;try{const r=await fetch('/api/auth/forgot',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone,password,confirm:'DELETE'})});const d=await r.json();document.getElementById('authMessage').textContent=d.message||d.error||'Done';}catch(e){document.getElementById('authMessage').textContent='Server connection failed.'}}
async function loadDisplayName(){try{const r=await fetch('/api/settings/display-name');const d=await r.json();if(r.ok){document.getElementById('displayName').value=d.displayName||'VIHUHUHU';document.getElementById('nameMessage').textContent='Current greeting name: '+(d.displayName||'VIHUHUHU');}}catch(e){document.getElementById('nameMessage').textContent='Settings load nahi hui.'}}
async function saveDisplayName(){const displayName=document.getElementById('displayName').value.trim();if(!displayName||displayName.length>40){document.getElementById('nameMessage').textContent='Naam 1-40 characters ka hona chahiye.';return}try{const r=await fetch('/api/settings/display-name',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({displayName})});const d=await r.json();document.getElementById('nameMessage').textContent=d.message||d.error||'Saved';if(r.ok)loadDisplayName();}catch(e){document.getElementById('nameMessage').textContent='Save failed.'}}
async function refreshStatus(){try{const r=await fetch('/api/status');const d=await r.json();const c=document.getElementById('connection');c.textContent=d.connection;c.className='pill '+(d.connection==='Connected'?'green':'red');document.getElementById('bot').textContent=d.botActive?'ON ✅':'OFF ❌';document.getElementById('auto').textContent=d.autoReplyEnabled?'ON ✅':'OFF ❌';}catch(e){document.getElementById('connection').textContent='Status unavailable'}}
async function toggleBot(action){const r=await fetch('/toggle?action='+action);const d=await r.json();alert(d.message||d.botStatus);refreshStatus()}
async function toggleAuto(action){const r=await fetch('/auto-reply?action='+action);const d=await r.json();alert(d.message||d.autoReply);refreshStatus()}

refreshStatus();loadDisplayName();setInterval(refreshStatus,10000);
function openLiveDashboard(){const wrap=document.querySelector('.wrap');for(const el of wrap.children){if(el.id==='liveChatPanel'){el.style.display='block';}else{el.style.display='none';}}document.getElementById('liveChatPanel').scrollIntoView({behavior:'smooth',block:'start'});renderLiveChats()}function backToMainDashboard(){const wrap=document.querySelector('.wrap');for(const el of wrap.children){el.style.display='';}document.getElementById('liveChatPanel').style.display='none';window.scrollTo({top:0,behavior:'smooth'})}
let liveChatSource=null,liveChatItems=[],selectedLiveJid=null;
function connectLiveChat(){if(liveChatSource)liveChatSource.close();liveChatSource=new EventSource('/api/live-chat/stream');liveChatSource.onopen=()=>document.getElementById('liveChatStatus').textContent='Live chat connected • RAM-only • history save nahi hoti';liveChatSource.onerror=()=>document.getElementById('liveChatStatus').textContent='Live chat reconnecting / login required';liveChatSource.addEventListener('snapshot',e=>{liveChatItems=JSON.parse(e.data);renderLiveChats()});liveChatSource.addEventListener('message',e=>{const item=JSON.parse(e.data);liveChatItems.push(item);if(liveChatItems.length>100)liveChatItems=liveChatItems.slice(-100);if(!selectedLiveJid)selectedLiveJid=item.jid;renderLiveChats()})}
function renderLiveChats(){const contacts=document.getElementById('liveChatContacts'),messages=document.getElementById('liveChatMessages'),jids=[...new Set(liveChatItems.map(x=>x.jid))];contacts.replaceChildren();if(!jids.length){const p=document.createElement('p');p.className='note';p.textContent='WhatsApp contacts sync hone ka intezar hai';contacts.appendChild(p)}jids.forEach(jid=>{const item=[...liveChatItems].reverse().find(x=>x.jid===jid),b=document.createElement('button');b.className='contact';b.textContent=item?.contactName||jid.replace(/@.*/,'');b.onclick=()=>{selectedLiveJid=jid;renderLiveChats()};contacts.appendChild(b)});messages.replaceChildren();const shown=liveChatItems.filter(x=>x.jid===selectedLiveJid&&x.text);if(!shown.length){const p=document.createElement('p');p.className='note';p.textContent='Is contact ka message abhi nahi hai';messages.appendChild(p)}shown.forEach(x=>{const d=document.createElement('div');d.className='bubble '+(x.fromMe?'out':'in');d.textContent=x.text;messages.appendChild(d)});messages.scrollTop=messages.scrollHeight}
async function sendLiveChatReply(){if(!selectedLiveJid){alert('Pehle contact select karein');return}const input=document.getElementById('liveChatReply'),text=input.value.trim();if(!text)return;try{const r=await fetch('/api/live-chat/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jid:selectedLiveJid,text})}),d=await r.json();if(!r.ok){alert(d.error||'Message send nahi hua');return}input.value=''}catch(e){alert('Server connection failed')}}
connectLiveChat();
</script></body></html>`;

const webSessions=new Map();
function getWebSession(req){const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('aaira_session='))?.slice(14);const session=token&&webSessions.get(token);if(session&&session.expiresAt>Date.now())return session;if(token)webSessions.delete(token);return null;}
function requireWebLogin(req,res,next){if(!getWebSession(req))return res.status(401).json({error:'Please login first.'});next();}
function createWebSession(phone,res){const token=crypto.randomBytes(32).toString('hex');webSessions.set(token,{phone,expiresAt:Date.now()+86400000});res.setHeader('Set-Cookie','aaira_session='+token+'; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400');}
app.post('/api/auth/register',async(req,res)=>{try{const phone=String(req.body.phone||'').replace(/\D/g,'');const password=String(req.body.password||'');if(!/^\d{10,15}$/.test(phone)||!/\S{6,64}$/.test(password))return res.status(400).json({error:'Phone valid karein aur password 6 se 64 characters ka rakhein (spaces nahi).'});const result=await aairaAuth.register(phone,password);if(result!=='created')return res.status(409).json({error:'Account already exists. Login karein.'});createWebSession(phone,res);currentDashboardOwnerPhone=phone;res.json({success:true,message:'Account created, login successful.'});}catch(e){console.error('Register error:',e.message);res.status(500).json({error:'Account create nahi hua. Try again.'});}});
app.post('/api/auth/login',async(req,res)=>{try{const phone=String(req.body.phone||'').replace(/\D/g,'');const password=String(req.body.password||'');if(!/^\d{10,15}$/.test(phone)||!/\S{6,64}$/.test(password))return res.status(400).json({error:'Phone/password format invalid. Password 6-64 characters ka hona chahiye (spaces nahi).'});const result=await aairaAuth.verify(phone,password);if(result!=='ok')return res.status(401).json({error:result==='locked'?'Account 15 minutes locked hai.':'Phone number ya password galat hai.'});createWebSession(phone,res);currentDashboardOwnerPhone=phone;res.json({success:true,message:'Login successful.'});}catch(e){console.error('Login error:',e.message);res.status(500).json({error:'Login failed. Try again.'});}});
app.post('/api/auth/forgot',async(req,res)=>{try{const phone=String(req.body.phone||'').replace(/\D/g,'');const password=String(req.body.password||'');if(!/^\d{10,15}$/.test(phone)||!/\S{6,64}$/.test(password)||req.body.confirm!=='DELETE')return res.status(400).json({error:'Phone, password, and DELETE confirmation required.'});const verified=await aairaAuth.verify(phone,password);if(verified!=='ok')return res.status(401).json({error:verified==='locked'?'Account 15 minutes locked hai.':'Phone number ya password galat hai.'});const result=await aairaAuth.deleteAccount(phone);const socket=accountSockets.get(phone);if(socket){try{socket.end(undefined);}catch(e){}accountSockets.delete(phone);accountStatus.set(phone,'Disconnected');}const timer=accountReconnectTimers.get(phone);if(timer){clearTimeout(timer);accountReconnectTimers.delete(phone);}const lockTimer=accountLockTimers.get(phone);if(lockTimer){clearInterval(lockTimer);accountLockTimers.delete(phone);}await aairaAuth.deleteWhatsAppSession(phone);try{await aairaAuth.releaseWhatsAppSessionLock(phone,instanceToken);}catch(e){}for(const [token,session] of webSessions){if(session.phone===phone)webSessions.delete(token);}res.json({success:true,message:result==='deleted'?'Account and stored WhatsApp session data deleted. You can register again.':'Account not found for this number.'});}catch(e){console.error('Delete account error:',e.message);res.status(500).json({error:'Account data delete failed.'});}});
app.get('/api/settings/display-name',requireWebLogin,async(req,res)=>{try{const session=getWebSession(req);const displayName=await aairaAuth.getDisplayName(session.phone);res.json({success:true,displayName});}catch(e){console.error('Get greeting name error:',e.message);res.status(500).json({error:'Greeting name load nahi hua.'});}});
app.post('/api/settings/display-name',requireWebLogin,async(req,res)=>{try{const session=getWebSession(req);const displayName=String(req.body.displayName||'').trim();if(!displayName||displayName.length>40)return res.status(400).json({error:'Naam 1-40 characters ka hona chahiye.'});await aairaAuth.setDisplayName(session.phone,displayName);currentDashboardOwnerPhone=session.phone;res.json({success:true,message:'Greeting name save ho gaya! 💗'});}catch(e){console.error('Save greeting name error:',e.message);res.status(500).json({error:'Greeting name save nahi hua.'});}});
app.get('/', (req, res) => res.type('html').send(dashboardHtml));

app.get('/api/live-chat/stream',(req,res)=>{const session=getWebSession(req);if(!session)return res.status(401).end('Login required');const owner=session.phone;res.setHeader('Content-Type','text/event-stream');res.setHeader('Cache-Control','no-cache, no-transform');res.setHeader('Connection','keep-alive');res.flushHeaders?.();const send=(event,data)=>res.write('event: '+event+'\ndata: '+JSON.stringify(data)+'\n\n');send('snapshot',liveChatBuffers.get(owner)||[]);let listeners=liveChatListeners.get(owner);if(!listeners){listeners=new Set();liveChatListeners.set(owner,listeners)}const listener=item=>send('message',item);listeners.add(listener);const keepAlive=setInterval(()=>res.write(': keep-alive\n\n'),25000);req.on('close',()=>{clearInterval(keepAlive);listeners.delete(listener);if(!listeners.size)liveChatListeners.delete(owner)});});
app.post('/api/live-chat/send',requireWebLogin,async(req,res)=>{const owner=getWebSession(req).phone,jid=String(req.body.jid||''),text=String(req.body.text||'').trim();if(!/^\d{8,20}@(s\.whatsapp\.net|lid)$/.test(jid))return res.status(400).json({error:'Contact address invalid.'});if(!text||text.length>4000)return res.status(400).json({error:'Message 1-4000 characters ka hona chahiye.'});const socket=accountSockets.get(owner);if(!socket||accountStatus.get(owner)!=='Connected')return res.status(503).json({error:'WhatsApp disconnected.'});try{const sent=await socket.sendMessage(jid,{text});publishLiveChat(owner,{id:sent?.key?.id,jid,text,fromMe:true,timestamp:Date.now()});res.json({success:true})}catch(e){console.error('[LIVE CHAT] Send failed:',e.message);res.status(500).json({error:'Message send failed.'})}});
app.get('/api/status', requireWebLogin, async (req,res)=>{try{const owner=getWebSession(req).phone;const settings=await aairaAuth.getBotSettings(owner);const connection=accountStatus.get(owner)||'Disconnected';res.json({success:true,connection,botActive:settings.botActive,autoReplyEnabled:settings.autoReplyEnabled,socketReady:!!accountSockets.get(owner)});}catch(e){res.status(500).json({error:'Status load failed'});}});
app.get('/toggle', requireWebLogin, async(req,res)=>{try{const owner=getWebSession(req).phone;const action=String(req.query.action||'').toLowerCase();if(!['on','off'].includes(action))return res.status(400).json({error:'Invalid action'});const value=action==='on';await aairaAuth.setBotSetting(owner,'botActive',value);res.json({success:true,message:value?'Bot is now ON ✅':'Bot is now OFF ❌',botStatus:value?'ON':'OFF'});}catch(e){console.error('Bot setting error:',e.message);res.status(500).json({error:'Bot setting save failed'});}});
app.get('/auto-reply', requireWebLogin, async(req,res)=>{try{const owner=getWebSession(req).phone;const action=String(req.query.action||'').toLowerCase();if(!['on','off'].includes(action))return res.status(400).json({error:'Invalid action'});const value=action==='on';await aairaAuth.setBotSetting(owner,'autoReplyEnabled',value);res.json({success:true,message:value?'Auto-reply is now ON ✅':'Auto-reply is now OFF ❌',autoReply:value?'ON':'OFF'});}catch(e){console.error('Auto-reply setting error:',e.message);res.status(500).json({error:'Auto-reply setting save failed'});}});
app.get('/pair', requireWebLogin, async(req,res)=>{const owner=getWebSession(req).phone;const phoneNumber=String(req.query.phone||'').replace(/[^0-9]/g,'');if(!/^\d{8,15}$/.test(phoneNumber))return res.status(400).json({error:'Phone number required with country code, e.g. 919876543210'});if(phoneNumber!==owner)return res.status(403).json({error:'AAIRA account aur WhatsApp number same hone chahiye. Apne registered mobile number ka WhatsApp connect karein.'});try{let socket=accountSockets.get(owner);if(!socket){await startAccountBot(owner);socket=accountSockets.get(owner);}if(!socket?.authState?.creds)return res.status(503).json({error:'WhatsApp socket initialize nahi hua. Refresh karke dobara try karein.'});if(socket.authState.creds.registered)return res.json({success:true,message:'WhatsApp session already registered.'});res.setHeader('Cache-Control','no-store');await new Promise(resolve=>setTimeout(resolve,1800));socket=accountSockets.get(owner);if(!socket||accountStatus.get(owner)==='Disconnected')return res.status(503).json({error:'WhatsApp connection band hai. Thodi der baad dobara try karein.'});let code=await socket.requestPairingCode(phoneNumber);code=code?.match(/.{1,4}/g)?.join('-')||code;if(!code)throw new Error('Empty pairing code');res.json({success:true,pairingCode:code});}catch(err){console.error('[PAIR] Pairing error:',err.message);res.status(500).json({error:'Pairing code generate nahi hua: '+String(err?.message||'Connection error').slice(0,100)});}});
const { getChatReply } = require('./chatBank');
const crypto = require('crypto');
const aairaAuth = require('./aairaAuth');
const greetedSenders = new Set();
const accountSockets = new Map();
const accountStatus = new Map();
const accountStarting = new Map();
const accountReconnectTimers = new Map();
const accountLockTimers = new Map();
const instanceToken = crypto.randomBytes(24).toString('hex');
async function startAccountBot(ownerPhone){
  ownerPhone=String(ownerPhone||'').replace(/\D/g,'');
  if(!/^\d{10,20}$/.test(ownerPhone))throw new Error('Invalid account owner phone');
  if(accountStarting.has(ownerPhone))return accountStarting.get(ownerPhone);
  if(accountSockets.has(ownerPhone))return accountSockets.get(ownerPhone);
  const promise=(async()=>{
    let lock=false;
    // During Render deploy overlap, the previous instance's lease may still be valid.
    // Wait for that lease to expire rather than marking the WhatsApp session disconnected permanently.
    for(let lockAttempt=0;lockAttempt<6;lockAttempt++){
      lock=await aairaAuth.claimWhatsAppSessionLock(ownerPhone,instanceToken,120);
      if(lock===true || lock==='claimed' || lock?.claimed===true)break;
      if(lockAttempt<5)await new Promise(resolve=>setTimeout(resolve,25000));
    }
    if(lock!==true && lock!=='claimed' && lock?.claimed!==true)throw new Error('WhatsApp account session lock is held by another live instance; retry after lease expires');
    const {state,saveCreds,clearAuthState}=await useSupabaseAuthState('account_'+ownerPhone);
    let waVersion;try{const live=await fetchLatestWaWebVersion();if(Array.isArray(live?.version)&&live.version.length===3)waVersion=live.version;}catch(e){console.warn('[WA] Version lookup:',e.message);}
    const socket=makeWASocket({... (waVersion?{version:waVersion}:{}),auth:state,printQRInTerminal:false,connectTimeoutMs:60000,keepAliveIntervalMs:25000,browser:['Ubuntu','Chrome','20.0.04']});
    const oldLockTimer=accountLockTimers.get(ownerPhone);if(oldLockTimer)clearInterval(oldLockTimer);
    const lockTimer=setInterval(()=>{aairaAuth.claimWhatsAppSessionLock(ownerPhone,instanceToken,120).then(ok=>{if(!ok){console.error('[WA] Session lock lost for account',ownerPhone);const active=accountSockets.get(ownerPhone);if(active===socket){accountSockets.delete(ownerPhone);accountStatus.set(ownerPhone,'Disconnected');try{socket.end(undefined);}catch(e){}}}}).catch(e=>console.error('[WA] Session lock renewal failed:',e.message));},45000);accountLockTimers.set(ownerPhone,lockTimer);
    accountSockets.set(ownerPhone,socket);accountStatus.set(ownerPhone,'Connecting');
    // Persist WhatsApp credentials to Supabase immediately whenever Baileys updates them.
    socket.ev.on('creds.update',async()=>{
      try{
        await saveCreds();
        console.log('[WA] Session credentials saved for account',ownerPhone);
      }catch(err){
        console.error('[WA] Session credentials save failed for account',ownerPhone,err.message);
      }
    });
    socket.ev.on('connection.update',async(update)=>{
      const {connection,lastDisconnect}=update;
      if(connection==='open'){accountStatus.set(ownerPhone,'Connected');console.log('[WA] Connected account',ownerPhone);}
      if(connection==='connecting')accountStatus.set(ownerPhone,'Connecting');
      if(connection==='close'){
        liveChatBuffers.delete(ownerPhone);
        if(accountSockets.get(ownerPhone)!==socket)return;
        accountSockets.delete(ownerPhone);accountStatus.set(ownerPhone,'Disconnected');const lockTimer=accountLockTimers.get(ownerPhone);if(lockTimer){clearInterval(lockTimer);accountLockTimers.delete(ownerPhone);}
        const statusCode=lastDisconnect?.error?.output?.statusCode;console.log('[WA] Closed account',ownerPhone,statusCode);
        if(statusCode===DisconnectReason.loggedOut){
          try{await clearAuthState();}catch(e){console.error('[WA] Clear auth failed:',e.message);}
          try{await aairaAuth.releaseWhatsAppSessionLock(ownerPhone,instanceToken);}catch(e){}
          console.log('[WA] Account logged out; user can pair again.');
        }else if(!accountReconnectTimers.has(ownerPhone)){
          const timer=setTimeout(()=>{accountReconnectTimers.delete(ownerPhone);startAccountBot(ownerPhone).catch(e=>console.error('[WA] Reconnect failed:',e.message));},4000);
          accountReconnectTimers.set(ownerPhone,timer);
        }
      }
    });
    socket.ev.on('contacts.upsert',contacts=>{for(const contact of contacts||[]){const jid=contact.id||contact.jid;if(jid&&jid!=='status@broadcast'&&!jid.endsWith('@g.us'))publishLiveChat(ownerPhone,{jid,contactName:contact.name||contact.notify||contact.pushName||''});}});
    socket.ev.on('chats.upsert',chats=>{for(const chat of chats||[]){const jid=chat.id||chat.jid;if(jid&&jid!=='status@broadcast'&&!jid.endsWith('@g.us'))publishLiveChat(ownerPhone,{jid,contactName:chat.name||chat.subject||chat.pushName||''});}});
    socket.ev.on('messaging-history.set',({contacts,chats})=>{for(const contact of contacts||[]){const jid=contact.id||contact.jid;if(jid&&jid!=='status@broadcast'&&!jid.endsWith('@g.us'))publishLiveChat(ownerPhone,{jid,contactName:contact.name||contact.notify||contact.pushName||''});}for(const chat of chats||[]){const jid=chat.id||chat.jid;if(jid&&jid!=='status@broadcast'&&!jid.endsWith('@g.us'))publishLiveChat(ownerPhone,{jid,contactName:chat.name||chat.subject||chat.pushName||''});}});
    socket.ev.on('messages.upsert',async({messages,type})=>{
      if(type!=='notify')return;
      for(const msg of messages){try{
        if(!msg.message)continue;
        const liveJid=msg.key.remoteJid;
        if(liveJid&&liveJid!=='status@broadcast'&&!liveJid.endsWith('@g.us')){const liveText=(msg.message.conversation||msg.message.extendedTextMessage?.text||msg.message.imageMessage?.caption||msg.message.videoMessage?.caption||'[Media message]').trim();if(liveText)publishLiveChat(ownerPhone,{id:msg.key.id,jid:liveJid,text:liveText,fromMe:!!msg.key.fromMe,timestamp:msg.messageTimestamp?Number(msg.messageTimestamp)*1000:Date.now()})}
        if(msg.key.fromMe)continue;
        const sender=msg.key.remoteJid;if(!sender||sender==='status@broadcast'||sender.endsWith('@g.us'))continue;
        const textMessage=(msg.message.conversation||msg.message.extendedTextMessage?.text||msg.message.imageMessage?.caption||msg.message.videoMessage?.caption||'').trim();
        if(!textMessage)continue;
        const settings=await aairaAuth.getBotSettings(ownerPhone);
        if(!settings.botActive||!settings.autoReplyEnabled)continue;
        const send=(text)=>socket.sendMessage(sender,{text});
        const greetingKey=ownerPhone+':'+sender;
        if(!greetedSenders.has(greetingKey)){
          let greetingName='VIHUHUHU';try{greetingName=await aairaAuth.getDisplayName(ownerPhone);}catch(e){console.warn('[WA] Greeting name lookup:',e.message);}
          await send('*Heyy! 💗 Mai '+greetingName+' KA OFFLINE ASSISTANT 😴✨ AI HU MERA NAME AAIRA HAI*');
          greetedSenders.add(greetingKey);
        }
        let replyText;try{replyText=getChatReply(textMessage);}catch(e){console.error('[WA] Chat reply error:',e.message);continue;}
        if(replyText)await send(replyText);
      }catch(err){console.error('[WA] Message processing error:',err.message);}}
    });
    return socket;
  })();
  accountStarting.set(ownerPhone,promise);
  try{return await promise;}finally{accountStarting.delete(ownerPhone);}
}
async function resumeRegisteredAccounts(){
  try{const phones=await aairaAuth.listRegisteredPhones();console.log('[WA] Registered account sessions found:',phones.length);for(const phone of phones){startAccountBot(phone).catch(e=>console.error('[WA] Resume account failed:',phone,e.message));}}catch(e){console.error('[WA] Resume registered accounts failed:',e.message);}
}
server.listen(PORT,()=>{console.log(`Server is running on port ${PORT}`);resumeRegisteredAccounts();});