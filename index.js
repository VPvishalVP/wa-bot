const express = require('express');
const { default: makeWASocket, DisconnectReason, fetchLatestWaWebVersion, downloadMediaMessage } = require('@whiskeysockets/baileys');
const { useSupabaseAuthState } = require('./supabaseAuth');
const http = require('http');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
const { createClient } = require('@supabase/supabase-js');
const aairaSupabase=createClient('https://rthezmmpatudgjfahsrv.supabase.co',process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const adminRouter = require('./adminRouter');
app.use(adminRouter);
async function rejectBlockedAccount(req,res,next){try{const phone=String(req.body.phone||'').replace(/\\D/g,'');if(phone&&await adminRouter.isBlocked(phone))return res.status(403).json({error:'This AAIRA account has been blocked by admin.'});next();}catch(e){console.error('[ADMIN] Block check failed:',e.message);res.status(503).json({error:'Account access check unavailable.'});}}
app.use('/api/auth/register',rejectBlockedAccount);
app.use('/api/auth/login',rejectBlockedAccount);
// Serve dashboard background assets explicitly (the dashboard HTML is inline).
app.get('/background.jpg',(req,res)=>res.sendFile(require('path').join(__dirname,'background.jpg')));
app.get('/anime-bg.jpg',(req,res)=>res.sendFile(require('path').join(__dirname,'anime-bg.jpg')));
app.get('/background.svg',(req,res)=>res.type('image/svg+xml').sendFile(require('path').join(__dirname,'background.svg')));

let sock;
let isBotActive = true;
let isAutoReplyEnabled = true;
let connectionStatus = 'Disconnected';
let currentDashboardOwnerPhone = null;
const liveChatBuffers=new Map(),liveChatListeners=new Map(),liveContactNames=new Map(),liveWhatsAppNames=new Map(),liveContactNumbers=new Map();
function preferredContactJid(primary,alternate){const pn=/^\d{8,15}@s\.whatsapp\.net$/;if(pn.test(String(primary||'')))return primary;if(pn.test(String(alternate||'')))return alternate;return primary||alternate||'';}
function liveMessageText(message){let m=message||{};for(let i=0;i<5;i++){if(m.ephemeralMessage?.message)m=m.ephemeralMessage.message;else if(m.viewOnceMessage?.message)m=m.viewOnceMessage.message;else if(m.viewOnceMessageV2?.message)m=m.viewOnceMessageV2.message;else if(m.documentWithCaptionMessage?.message)m=m.documentWithCaptionMessage.message;else break;}const t=m.conversation||m.extendedTextMessage?.text||m.imageMessage?.caption||m.videoMessage?.caption||m.documentMessage?.caption||m.buttonsResponseMessage?.selectedDisplayText||m.listResponseMessage?.title||m.templateButtonReplyMessage?.selectedDisplayText||m.pollCreationMessage?.name||m.pollCreationMessageV3?.name||m.locationMessage?.name||m.locationMessage?.address||m.contactMessage?.displayName||m.contactsArrayMessage?.displayName;if(t)return String(t);if(m.imageMessage)return '🖼️ Image'+(m.imageMessage.caption?' — '+m.imageMessage.caption:'');if(m.videoMessage)return '🎥 Video'+(m.videoMessage.caption?' — '+m.videoMessage.caption:'');if(m.audioMessage)return m.audioMessage.ptt?'🎤 Voice message':'🔊 Audio message';if(m.stickerMessage)return '🎭 Sticker';if(m.documentMessage)return '📎 Document: '+(m.documentMessage.fileName||'file');if(m.locationMessage)return '📍 Location';if(m.liveLocationMessage)return '📍 Live location';if(m.contactMessage||m.contactsArrayMessage)return '👤 Contact card';if(m.reactionMessage)return '😊 Reaction: '+(m.reactionMessage.text||'');if(m.pollUpdateMessage)return '📊 Poll vote';if(m.protocolMessage)return 'ℹ️ Message update';return '[Unsupported message content]';}
function publishLiveChat(owner,item){if(!owner||!item?.jid)return;let b=liveChatBuffers.get(owner);if(!b){b=[];liveChatBuffers.set(owner,b)}const names=liveContactNames.get(owner)||new Map();liveContactNames.set(owner,names);const numbers=liveContactNumbers.get(owner)||new Map();liveContactNumbers.set(owner,numbers);const pnJid=/^(\d{8,15})@s\.whatsapp\.net$/.exec(item.jid);const suppliedNumber=String(item.phoneNumber||'').replace(/\D/g,'');const incomingNumber=pnJid?.[1]||(/^\d{8,15}$/.test(suppliedNumber)?suppliedNumber:'');if(incomingNumber)numbers.set(item.jid,incomingNumber);const incomingName=String(item.contactName||'').trim().slice(0,100),incomingWhatsAppName=String(item.whatsappName||'').trim().slice(0,100);if(incomingName)names.set(item.jid,incomingName);const waNames=liveWhatsAppNames.get(owner)||new Map();liveWhatsAppNames.set(owner,waNames);if(incomingWhatsAppName)waNames.set(item.jid,incomingWhatsAppName);const prior=[...b].reverse().find(x=>x.jid===item.jid&&x.contactName)?.contactName||'',resolvedName=names.get(item.jid)||incomingName||prior||waNames.get(item.jid)||incomingWhatsAppName||'';const entry={id:item.id||crypto.randomUUID(),jid:item.jid,text:String(item.text||'').slice(0,4000),contactName:resolvedName,phoneNumber:incomingNumber||numbers.get(item.jid)||'',fromMe:!!item.fromMe,timestamp:item.timestamp||Date.now()};if(item.id&&b.some(x=>x.id===item.id&&x.jid===item.jid))return;const existing=b.findIndex(x=>x.jid===entry.jid&&!x.text);if(existing>=0&&entry.text)b.splice(existing,1);else if(existing>=0&&!entry.text){b[existing]={...b[existing],contactName:entry.contactName||b[existing].contactName,timestamp:entry.timestamp};entry.id=b[existing].id;entry.timestamp=b[existing].timestamp;}if(!b.some(x=>x.id===entry.id))b.push(entry);const perJid=b.filter(x=>x.jid===entry.jid);if(perJid.length>100){const remove=new Set(perJid.slice(0,perJid.length-100).map(x=>x.id));b=b.filter(x=>!remove.has(x.id));}const latestByJid=new Map();for(const x of b){const prev=latestByJid.get(x.jid);if(!prev||x.timestamp>prev.timestamp)latestByJid.set(x.jid,x);}const newestJids=[...latestByJid.values()].sort((a,c)=>c.timestamp-a.timestamp).slice(0,100).map(x=>x.jid);const keep=new Set(newestJids);b=b.filter(x=>keep.has(x.jid));if(b.length>1000)b.splice(0,b.length-1000);liveChatBuffers.set(owner,b);aairaAuth.saveLiveChatBuffer(owner,b.slice()).catch(e=>console.error('[LIVE CHAT] Persistent save failed:',e.message));for(const fn of liveChatListeners.get(owner)||[]){try{fn(entry)}catch{}}}

const dashboardHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AAIRA | WhatsApp Assistant</title>
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;color:#f4f4f4;font-family:Arial,sans-serif;
background:linear-gradient(rgba(0,0,0,.30),rgba(0,0,0,.40)),url("/anime-bg.jpg") center center / cover no-repeat;background-color:#050505}
body:has(#authGate:target) #welcomeGate{display:none!important}#authGate:target{display:flex!important;visibility:visible!important;opacity:1!important;z-index:2147483647!important}body:before{content:"";position:fixed;inset:0;pointer-events:none;
background:linear-gradient(110deg,transparent 35%,rgba(255,255,255,.045) 50%,transparent 65%)}
.wrap{display:none;width:min(940px,94%);margin:30px auto}
header{text-align:center;padding:25px 10px}
.logo{font-size:38px;font-weight:900;letter-spacing:5px;text-shadow:0 0 18px #ddd}
.subtitle{color:#aaa;letter-spacing:2px;margin-top:8px}
.panel{background:rgba(15,15,15,.58);border:1px solid #555;border-radius:18px;
padding:22px;margin:16px 0;box-shadow:0 0 22px rgba(255,255,255,.06)}
h2{font-size:17px;letter-spacing:1.5px;margin:0 0 16px;color:#eee}
.status{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.pill{border:1px solid #777;border-radius:30px;padding:8px 14px;font-size:13px}
.green{color:#cfcfcf;border-color:#aaa}.red{color:#999;border-color:#555}
input{width:100%;background:rgba(5,5,5,.58);color:white;border:1px solid #666;border-radius:10px;
padding:13px;margin:8px 0 12px;font-size:15px;outline:none}
input:focus{border-color:#eee;box-shadow:0 0 8px #777}
button{background:rgba(8,8,8,.58);color:#fff;border:1px solid #aaa;border-radius:10px;
padding:12px 16px;margin:4px;cursor:pointer;font-weight:bold;transition:.2s}
button:hover{background:#eee;color:#000;box-shadow:0 0 14px #aaa}
button:disabled{opacity:.45;cursor:not-allowed}
.row{display:flex;gap:10px;flex-wrap:wrap}.row button{flex:1}
.code{font-size:26px;letter-spacing:5px;text-align:center;padding:15px;color:#fff;
border:1px dashed #aaa;border-radius:12px;margin-top:12px;min-height:60px}
.note{font-size:12px;color:#aaa;line-height:1.6}
.chat-layout{display:grid;grid-template-columns:minmax(110px,32%) 1fr;gap:10px;min-height:300px}.chat-contacts,.chat-messages{border:1px solid #555;border-radius:10px;padding:8px;min-width:0}.chat-contacts{max-height:360px;overflow:auto}.contact{display:block;width:100%;text-align:left;margin:3px 0;overflow-wrap:anywhere}.chat-messages{display:flex;flex-direction:column;gap:8px;max-height:360px;overflow:auto;background:rgba(5,5,5,.42)}.chat-contacts{background:rgba(5,5,5,.28)}.bubble{max-width:90%;padding:9px 11px;border:1px solid #666;border-radius:12px;white-space:pre-wrap;overflow-wrap:anywhere}.message-time{font-size:10px;color:#aaa;text-align:right;margin-top:5px;white-space:nowrap}.bubble.in{align-self:flex-start}.bubble.out{align-self:flex-end;border-color:#aaa;background:#171717}.chat-compose{display:flex;gap:6px;margin-top:10px}.chat-compose input{margin:0;flex:1;min-width:0}
pre{white-space:pre-wrap;color:#ddd;font-size:13px}
footer{text-align:center;color:#777;padding:20px;font-size:12px}
</style>
</head>
<body><section id="welcomeGate" style="position:fixed;inset:0;z-index:100;background:linear-gradient(rgba(0,0,0,.48),rgba(0,0,0,.68)),url('/anime-bg.jpg') center center / cover no-repeat;display:flex;align-items:center;justify-content:center;padding:18px"><div class="panel" style="width:min(440px,100%);margin:0;text-align:center"><div class="logo" style="font-size:30px;letter-spacing:3px">VIHUHUHU KA</div><h2 style="font-size:25px;margin:12px 0;text-shadow:0 0 14px #ddd">✦ AAIRA BOT ✦</h2><p class="note" style="font-size:14px">WELCOME TO AAIRA WHATSAPP BOT</p><a id="welcomeStartButton" href="#authGate" role="button" style="display:block;background:rgba(8,8,8,.58);color:#fff;border:1px solid #aaa;border-radius:10px;padding:12px 16px;margin:18px 4px 4px;cursor:pointer;font-weight:bold;text-decoration:none;font-size:16px;width:100%">✨ START / REGISTER</a></div></section><section id="authGate" style="position:fixed;inset:0;z-index:99;background:linear-gradient(rgba(0,0,0,.48),rgba(0,0,0,.62)),url('/anime-bg.jpg') center center / cover no-repeat;display:none;align-items:center;justify-content:center;padding:18px"><div class="panel" style="width:min(440px,100%);margin:0"><h2>🔐 AAIRA ACCOUNT</h2><p class="note">Mobile number aur 6-64 characters password se login karein ya account banayein.</p><label>Mobile number (country code ke saath)</label><input id="authPhone" inputmode="numeric" placeholder="919876543210"><label>Password (minimum 6 characters)</label><input id="authPassword" type="password" minlength="6" maxlength="64" placeholder="Password"><div class="row"><button type="button" id="loginButton" onclick="window.authAction('login')">LOGIN</button><button type="button" id="registerButton" onclick="window.authAction('register')">REGISTER</button></div><button onclick="forgotAccount()" style="width:100%">FORGOT PASSWORD? DELETE ACCOUNT DATA</button><p id="authMessage" class="note"></p></div></section><div class="wrap">
<header id="mainHeader"><div class="logo">AAIRA ✦</div><div class="subtitle">VIHUHUHU KA OFFLINE ASSISTANT</div><button id="openLiveDashboard" onclick="openLiveDashboard()" style="width:100%;max-width:420px;margin:18px auto;font-size:16px">💬 LIVE WHATSAPP</button></header>
<section class="panel">
<div class="status"><h2>WHATSAPP CONNECTION</h2><span id="connection" class="pill red">Disconnected</span></div>
<div id="waIdentity" class="note" style="margin-top:12px;display:none"><b id="waProfileName"></b><div id="waProfileNumber" style="margin-top:5px"></div><div id="waDeviceName" style="margin-top:5px;color:#aaa"></div></div>
<div class="status"><span>Bot Status</span><span id="bot" class="pill">Checking...</span></div>
<div class="status" style="margin-top:10px"><span>Auto Reply</span><span id="auto" class="pill">Checking...</span></div>
</section>
<section class="panel">
<div class="row" style="margin-top:15px"><button onclick="toggleBot('on')">BOT ON</button><button onclick="toggleBot('off')">BOT OFF</button></div>
<div class="row"><button onclick="toggleAuto('on')">AUTO-REPLY ON</button><button onclick="toggleAuto('off')">AUTO-REPLY OFF</button></div>
<button onclick="refreshStatus()" style="width:100%">↻ REFRESH STATUS</button>
<p id="pairMessage" class="note">WhatsApp mein Linked devices → Link a device → Link with phone number par code enter karein.</p>
</section>
<section class="panel">
<h2>💗 GREETING NAME SETTINGS</h2>
<label for="displayName">Greeting mein naam (VIHUHUHU ko badlein)</label>
<input id="displayName" maxlength="40" placeholder="VIHUHUHU">
<button onclick="saveDisplayName()" style="width:100%">SAVE GREETING NAME</button>
<p id="nameMessage" class="note">Default: VIHUHUHU</p>
</section>

<section class="panel" id="connectWhatsAppPanel">

<div style="margin-top:15px;border:1px solid #555;border-radius:12px;padding:14px"><h2 style="margin-bottom:8px">📱 CONNECT WHATSAPP</h2><label for="waPhone">WhatsApp number (country code ke saath)</label><input id="waPhone" inputmode="numeric" placeholder="919876543210"><button onclick="connectWhatsApp()" style="width:100%">🔗 CONNECT WHATSAPP</button><div id="pairCode" class="code" style="display:none"></div></div>

</section>
<section class="panel" id="supportPanel"><h2>🎧 HELP & SUPPORT CENTER</h2><p class="note">Apni problem Admin tak bhejein. Ticket ka status aur Admin ke replies yahan dekh sakte hain.</p><label>Problem title</label><input id="supportTitle" maxlength="120" placeholder="WhatsApp disconnect problem"><label>Problem detail</label><textarea id="supportDescription" maxlength="3000" rows="4" style="width:100%;background:rgba(5,5,5,.58);color:white;border:1px solid #666;border-radius:10px;padding:12px" placeholder="Apni problem detail mein likhein (minimum 10 characters)"></textarea><label>Priority</label><select id="supportPriority" style="width:100%;background:#080808;color:white;border:1px solid #666;border-radius:10px;padding:12px"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option></select><button onclick="submitSupportTicket()" style="width:100%">🎫 SUBMIT TICKET</button><p id="supportMessage" class="note"></p><h2 style="margin-top:18px">📋 MY SUPPORT TICKETS</h2><button onclick="loadSupportTickets()" style="width:100%">↻ REFRESH TICKETS</button><div id="supportTickets"><p class="note">Tickets load honge...</p></div><div id="supportThread" style="display:none"><h2 id="supportThreadTitle"></h2><div id="supportThreadMessages" style="border:1px solid #555;border-radius:10px;padding:10px;max-height:300px;overflow:auto;white-space:pre-wrap"></div><textarea id="supportReply" rows="3" maxlength="3000" placeholder="Admin ko reply likhein..." style="width:100%;background:#080808;color:white;border:1px solid #666;border-radius:10px;padding:12px;margin-top:10px"></textarea><button onclick="sendSupportReply()" style="width:100%">SEND REPLY</button><button onclick="document.getElementById(\'supportThread\').style.display=\'none\'" style="width:100%">CLOSE CHAT</button></div></section><section class="panel" id="liveChatPanel" style="display:none"><button onclick="backToMainDashboard()" style="width:100%;margin:0 0 12px">← BACK</button><h2>💬 LIVE WHATSAPP CHAT</h2><p id="liveChatStatus" class="note">Live messages + synced history • har contact ke 100 latest messages • text, media captions aur media-type labels dikhte hain. History sync WhatsApp se aane par populate hoti hai.</p><div class="chat-layout"><div id="liveChatContacts" class="chat-contacts"><p class="note">Live contacts yahan aayenge</p></div><div id="liveChatMessages" class="chat-messages"><p class="note">Koi live message nahi hai.</p></div></div><div class="chat-compose"><input id="liveChatReply" placeholder="Reply likhein..." maxlength="4000"><button onclick="sendLiveChatReply()">SEND</button></div></section>
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
function openRegister(){const welcome=document.getElementById("welcomeGate");const gate=document.getElementById("authGate");if(welcome){welcome.style.setProperty("display","none","important");welcome.setAttribute("aria-hidden","true");}if(gate){gate.style.setProperty("display","flex","important");gate.style.setProperty("visibility","visible","important");gate.style.setProperty("opacity","1","important");gate.setAttribute("aria-hidden","false");gate.style.zIndex="2147483647";}const phone=document.getElementById("authPhone");if(phone){phone.focus();}return false;}window.openRegister=openRegister;const welcomeStart=document.getElementById("welcomeStartButton");if(welcomeStart){welcomeStart.addEventListener("click",openRegister);welcomeStart.onclick=openRegister;}
window.authAction=async function authAction(action){const phone=document.getElementById('authPhone').value.replace(/\\D/g,'');const password=document.getElementById('authPassword').value;const msg=document.getElementById('authMessage');if(!/^\\d{10,15}$/.test(phone)){msg.textContent='Valid phone number country code ke saath enter karein.';return}if(!/^\\S{6,64}$/.test(password)){msg.textContent='Password 6-64 characters ka hona chahiye (spaces allowed nahi).';return}try{const r=await fetch('/api/auth/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone,password})});const d=await r.json();msg.textContent=d.message||d.error||'Request complete';if(r.ok&&action==='login'){const gate=document.getElementById('authGate');if(gate)gate.style.setProperty('display','none','important');document.getElementById('welcomeGate')?.style.setProperty('display','none','important');if(location.hash==='#authGate')history.replaceState(null,'',location.pathname+location.search);const dashboard=document.querySelector('.wrap');if(dashboard)dashboard.style.setProperty('display','block','important');refreshStatus();loadDisplayName();loadSupportTickets();}else if(r.ok&&action==='register'){msg.textContent=(d.message||'Registration successful.')+' Login admin approval ke baad karein. Form yahin rahega.';}}catch(e){msg.textContent='Server connection failed: '+(e?.message||'Network error')+'. Dashboard ko reload karke dobara try karein.'}};
async function forgotAccount(){const phone=document.getElementById('authPhone').value.replace(/\\D/g,'');const password=document.getElementById('authPassword').value;if(!/^\\d{10,15}$/.test(phone)){alert('Phone number country code ke saath enter karein.');return}if(!/^\\S{6,64}$/.test(password)){alert('Account delete karne ke liye apna password enter karein.');return}if(prompt('Account data permanently delete karne ke liye DELETE type karein:')!=='DELETE')return;try{const r=await fetch('/api/auth/forgot',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone,password,confirm:'DELETE'})});const d=await r.json();document.getElementById('authMessage').textContent=d.message||d.error||'Done';}catch(e){document.getElementById('authMessage').textContent='Server connection failed.'}}
async function loadDisplayName(){try{const r=await fetch('/api/settings/display-name');const d=await r.json();if(r.ok){document.getElementById('displayName').value=d.displayName||'VIHUHUHU';document.getElementById('nameMessage').textContent='Current greeting name: '+(d.displayName||'VIHUHUHU');}}catch(e){document.getElementById('nameMessage').textContent='Settings load nahi hui.'}}
async function saveDisplayName(){const displayName=document.getElementById('displayName').value.trim();if(!displayName||displayName.length>40){document.getElementById('nameMessage').textContent='Naam 1-40 characters ka hona chahiye.';return}try{const r=await fetch('/api/settings/display-name',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({displayName})});const d=await r.json();document.getElementById('nameMessage').textContent=d.message||d.error||'Saved';if(r.ok)loadDisplayName();}catch(e){document.getElementById('nameMessage').textContent='Save failed.'}}
async function refreshStatus(){try{const r=await fetch('/api/status?refresh='+Date.now(),{cache:'no-store'});const d=await r.json();const c=document.getElementById('connection');c.textContent=d.connection;c.className='pill '+(d.connection==='Connected'?'green':'red');const connectPanel=document.getElementById('connectWhatsAppPanel');if(connectPanel)connectPanel.style.display=d.connection==='Connected'?'none':'block';document.getElementById('bot').textContent=d.botActive?'ON ✅':'OFF ❌';document.getElementById('auto').textContent=d.autoReplyEnabled?'ON ✅':'OFF ❌';const identity=document.getElementById('waIdentity');if(d.connection==='Connected'&&(d.waProfileName||d.waPhoneNumber)){identity.style.display='block';document.getElementById('waProfileName').textContent=d.waProfileName||'WhatsApp account';document.getElementById('waProfileNumber').textContent=d.waPhoneNumber||'';document.getElementById('waDeviceName').textContent=d.waDeviceName?'Device: '+d.waDeviceName:'Linked device';}else{identity.style.display='none';}}catch(e){document.getElementById('connection').textContent='Status unavailable'}}
async function connectWhatsApp(){let phone=document.getElementById("waPhone").value.trim().replace(/\\D/g,""),msg=document.getElementById("pairMessage"),code=document.getElementById("pairCode");code.style.display="none";code.textContent="";if(phone.startsWith("00"))phone=phone.slice(2);if(phone.length===10)phone="91"+phone;document.getElementById("waPhone").value=phone;if(!/^\\d{8,15}$/.test(phone)){msg.textContent="10 digit Indian mobile number ya country code ke saath international number enter karein (example: 919876543210).";return}msg.textContent="Pairing code generate ho raha hai…";try{const r=await fetch("/pair?phone="+encodeURIComponent(phone)),d=await r.json();if(!r.ok){msg.textContent=d.error||"WhatsApp connect nahi hua.";return}if(d.pairingCode){code.textContent=d.pairingCode;code.style.display="block";msg.textContent="WhatsApp mein Linked devices → Link a device → Link with phone number par code enter karein."}else{msg.textContent=d.message||"WhatsApp session registered hai.";refreshStatus()}}catch(e){msg.textContent="Server connection failed. Dobara try karein."}}
async function toggleBot(action){const r=await fetch('/toggle?action='+action);const d=await r.json();alert(d.message||d.botStatus);refreshStatus()}
async function toggleAuto(action){const r=await fetch('/auto-reply?action='+action);const d=await r.json();alert(d.message||d.autoReply);refreshStatus()}

refreshStatus();loadDisplayName();
function openLiveDashboard(){const wrap=document.querySelector('.wrap');for(const el of wrap.children){if(el.id==='liveChatPanel'){el.style.display='block';}else{el.style.display='none';}}document.getElementById('liveChatPanel').scrollIntoView({behavior:'smooth',block:'start'});renderLiveChats()}function backToMainDashboard(){const wrap=document.querySelector('.wrap');for(const el of wrap.children){el.style.display='';}document.getElementById('liveChatPanel').style.display='none';window.scrollTo({top:0,behavior:'smooth'})}
let liveChatSource=null,liveChatItems=[],selectedLiveJid=null;
function connectLiveChat(){if(liveChatSource)liveChatSource.close();liveChatSource=new EventSource('/api/live-chat/stream');liveChatSource.onopen=()=>document.getElementById('liveChatStatus').textContent='Live chat connected • contacts alag JID se pehchane jaate hain • chat history saved';liveChatSource.onerror=()=>document.getElementById('liveChatStatus').textContent='Live chat reconnecting / login required';liveChatSource.addEventListener('snapshot',e=>{liveChatItems=JSON.parse(e.data);renderLiveChats()});liveChatSource.addEventListener('message',e=>{const item=JSON.parse(e.data);liveChatItems.push(item);if(liveChatItems.length>1000)liveChatItems=liveChatItems.slice(-1000);if(!selectedLiveJid)selectedLiveJid=item.jid;renderLiveChats()})}
function renderLiveChats(){const contacts=document.getElementById('liveChatContacts'),messages=document.getElementById('liveChatMessages'),jids=[...new Set(liveChatItems.map(x=>x.jid))];contacts.replaceChildren();if(!jids.length){const p=document.createElement('p');p.className='note';p.textContent='WhatsApp contacts sync hone ka intezar hai';contacts.appendChild(p)}jids.forEach(jid=>{const item=[...liveChatItems].reverse().find(x=>x.jid===jid),b=document.createElement('button');b.className='contact';const phone=/^\\d{8,15}@s\\.whatsapp\\.net$/.test(jid)?jid.split('@')[0]:(/^\\d{8,15}$/.test(item?.phoneNumber||'')?item.phoneNumber:'');const label=(item?.contactName&&item.contactName!=='WhatsApp Contact')?item.contactName:'WhatsApp Contact';b.textContent=phone?label+' · '+phone:label+' · Number not synced';b.onclick=()=>{selectedLiveJid=jid;renderLiveChats()};contacts.appendChild(b)});messages.replaceChildren();const shown=liveChatItems.filter(x=>x.jid===selectedLiveJid&&x.text).sort((a,b)=>a.timestamp-b.timestamp).slice(-100);if(!shown.length){const p=document.createElement('p');p.className='note';p.textContent='Is contact ka message abhi nahi hai';messages.appendChild(p)}shown.forEach(x=>{const d=document.createElement('div');d.className='bubble '+(x.fromMe?'out':'in');const body=document.createElement('div');body.textContent=x.text;d.appendChild(body);const time=document.createElement('div');time.className='message-time';const stamp=new Date(Number(x.timestamp)||Date.now());time.textContent=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric'}).format(stamp)+' · '+new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:true}).format(stamp);d.appendChild(time);messages.appendChild(d)});messages.scrollTop=messages.scrollHeight}
async function sendLiveChatReply(){if(!selectedLiveJid){alert('Pehle contact select karein');return}const input=document.getElementById('liveChatReply'),text=input.value.trim();if(!text)return;try{const r=await fetch('/api/live-chat/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jid:selectedLiveJid,text})}),d=await r.json();if(!r.ok){alert(d.error||'Message send nahi hua');return}input.value=''}catch(e){alert('Server connection failed')}}
connectLiveChat();
async function supportApi(path,body){const r=await fetch('/api/support/'+path,{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store'});let d={};try{d=await r.json()}catch(e){}if(!r.ok)throw Error(d.error||'Support request failed');return d}function supportEsc(v){return String(v||'').replace(/[&<>"']/g,ch=>{const entities={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};return entities[ch]})}async function loadSupportTickets(){const box=document.getElementById('supportTickets');try{const d=await supportApi('tickets');box.innerHTML=(d.tickets||[]).map(t=>'<div style=\'border:1px solid #555;border-radius:12px;padding:12px;margin:8px 0;background:#080808aa\'><b>'+supportEsc(t.ticket_ref)+' — '+supportEsc(t.title)+'</b><p class=\'note\'>Status: '+supportEsc(t.status.replace('_',' ').toUpperCase())+' | Priority: '+supportEsc(t.priority.toUpperCase())+' | '+new Date(t.created_at).toLocaleString()+'</p><button onclick=\'openSupportTicket('+Number(t.id)+',this.dataset.title)\' data-title=\''+supportEsc(t.title)+'\' style=\'width:100%\'>OPEN CHAT / VIEW REPLIES</button></div>').join('')||'<p class=\'note\'>Abhi koi ticket nahi. Upar se naya ticket create karein.</p>'}catch(e){box.textContent=e.message}}async function submitSupportTicket(){const title=document.getElementById('supportTitle').value.trim(),description=document.getElementById('supportDescription').value.trim(),priority=document.getElementById('supportPriority').value,msg=document.getElementById('supportMessage');if(title.length<3||description.length<10){msg.textContent='Title kam se kam 3 aur problem detail 10 characters likhein.';return}try{const d=await supportApi('tickets',{title,description,priority});msg.textContent='Ticket '+d.ticket.ticket_ref+' Admin ko bhej diya gaya!';document.getElementById('supportTitle').value='';document.getElementById('supportDescription').value='';await loadSupportTickets()}catch(e){msg.textContent=e.message}}let activeSupportTicket=null;async function openSupportTicket(id,title){activeSupportTicket=id;document.getElementById('supportThread').style.display='block';document.getElementById('supportThreadTitle').textContent='Ticket chat: '+title;try{const d=await supportApi('messages/'+id);document.getElementById('supportThreadMessages').innerHTML=(d.messages||[]).map(m=>'<div style=\'padding:8px;margin:6px 0;border:1px solid #555;border-radius:10px\'><b>'+supportEsc(m.sender_role==='admin'?'ADMIN':'YOU')+'</b><p>'+supportEsc(m.message)+'</p><small>'+new Date(m.created_at).toLocaleString()+'</small></div>').join('')||'No messages yet';}catch(e){alert(e.message)}}async function sendSupportReply(){const message=document.getElementById('supportReply').value.trim();if(!activeSupportTicket||!message)return;try{await supportApi('messages/'+activeSupportTicket,{message});document.getElementById('supportReply').value='';await openSupportTicket(activeSupportTicket,document.getElementById('supportThreadTitle').textContent.replace('Ticket chat: ',''));await loadSupportTickets()}catch(e){alert(e.message)}}</script></body></html>`;

const webSessions=new Map();
function getWebSession(req){const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('aaira_session='))?.slice(14);const session=token&&webSessions.get(token);if(session&&session.expiresAt>Date.now())return session;if(token)webSessions.delete(token);return null;}
function requireWebLogin(req,res,next){if(!getWebSession(req))return res.status(401).json({error:'Please login first.'});next();}
function createWebSession(phone,res){const token=crypto.randomBytes(32).toString('hex');webSessions.set(token,{phone,expiresAt:Date.now()+86400000});res.setHeader('Set-Cookie','aaira_session='+token+'; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400');}
app.post('/api/auth/register',async(req,res)=>{try{const phone=String(req.body.phone||'').replace(/\D/g,'');const password=String(req.body.password||'');if(!/^\d{10,15}$/.test(phone)||!/\S{6,64}$/.test(password))return res.status(400).json({error:'Phone valid karein aur password 6 se 64 characters ka rakhein (spaces nahi).'});const result=await aairaAuth.register(phone,password);if(result!=='created')return res.status(409).json({error:'Account already exists. Login karein.'});res.json({success:true,message:'Registration successful. Admin authorization pending hai. Approval ke baad login kar sakte hain.'});}catch(e){console.error('Register error:',e.message);res.status(500).json({error:'Account create nahi hua. Try again.'});}});
app.post('/api/auth/login',async(req,res)=>{try{const phone=String(req.body.phone||'').replace(/\D/g,'');const password=String(req.body.password||'');if(!/^\d{10,15}$/.test(phone)||!/\S{6,64}$/.test(password))return res.status(400).json({error:'Phone/password format invalid. Password 6-64 characters ka hona chahiye (spaces nahi).'});const result=await aairaAuth.verify(phone,password);if(result!=='ok')return res.status(result==='pending'?403:result==='locked'?429:401).json({error:result==='pending'?'Account Pending Authorization hai. Admin approval ka wait karein.':result==='locked'?'5 galat password attempts ke baad account 15 minutes ke liye locked hai.':'Phone number ya password galat hai.'});createWebSession(phone,res);currentDashboardOwnerPhone=phone;res.json({success:true,message:'Login successful.'});}catch(e){console.error('Login error:',e.message);res.status(500).json({error:'Login failed. Try again.'});}});
app.post('/api/auth/forgot',async(req,res)=>{try{const phone=String(req.body.phone||'').replace(/\D/g,'');const password=String(req.body.password||'');if(!/^\d{10,15}$/.test(phone)||!/\S{6,64}$/.test(password)||req.body.confirm!=='DELETE')return res.status(400).json({error:'Phone, password, and DELETE confirmation required.'});const verified=await aairaAuth.verify(phone,password);if(verified!=='ok')return res.status(401).json({error:verified==='locked'?'Account 15 minutes locked hai.':'Phone number ya password galat hai.'});const result=await aairaAuth.deleteAccount(phone);await cleanupAccountRuntime(phone);await aairaAuth.deleteWhatsAppSession(phone);await aairaAuth.deleteAccountSettings(phone);res.json({success:true,message:result==='deleted'?'Account and stored WhatsApp session data deleted. You can register again.':'Account not found for this number.'});}catch(e){console.error('Delete account error:',e.message);res.status(500).json({error:'Account data delete failed.'});}});
app.get('/api/support/tickets',requireWebLogin,async(req,res)=>{try{const phone=getWebSession(req).phone;const {data,error}=await aairaSupabase.from('aaira_support_tickets').select('id,ticket_ref,title,priority,status,created_at,updated_at').eq('user_phone',phone).order('created_at',{ascending:false});if(error)throw error;res.set('Cache-Control','no-store');res.json({tickets:data||[]});}catch(e){console.error('[SUPPORT] Ticket list failed:',e.message);res.status(500).json({error:'Support tickets load nahi hue.'});}});
app.post('/api/support/tickets',requireWebLogin,async(req,res)=>{try{const phone=getWebSession(req).phone,title=String(req.body.title||'').trim(),description=String(req.body.description||'').trim(),priority=String(req.body.priority||'medium');if(title.length<3||title.length>120||description.length<10||description.length>3000||!['low','medium','high'].includes(priority))return res.status(400).json({error:'Title/detail/priority invalid hai.'});const {data,error}=await aairaSupabase.from('aaira_support_tickets').insert({user_phone:phone,title,description,priority}).select('id,ticket_ref,title,priority,status,created_at').single();if(error)throw error;const {error:me}=await aairaSupabase.from('aaira_support_messages').insert({ticket_id:data.id,sender_role:'user',message:description});if(me)throw me;res.status(201).json({success:true,ticket:data});}catch(e){console.error('[SUPPORT] Ticket create failed:',e.message);res.status(500).json({error:'Ticket submit nahi hua. Dobara try karein.'});}});
app.get('/api/support/messages/:id',requireWebLogin,async(req,res)=>{try{const phone=getWebSession(req).phone,id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Ticket ID invalid'});const {data:ticket,error:t}=await aairaSupabase.from('aaira_support_tickets').select('id').eq('id',id).eq('user_phone',phone).maybeSingle();if(t)throw t;if(!ticket)return res.status(404).json({error:'Ticket not found'});const {data,error}=await aairaSupabase.from('aaira_support_messages').select('id,sender_role,message,created_at').eq('ticket_id',id).order('created_at',{ascending:true});if(error)throw error;res.json({messages:data||[]});}catch(e){console.error('[SUPPORT] Messages load failed:',e.message);res.status(500).json({error:'Ticket chat load nahi hui.'});}});
app.post('/api/support/messages/:id',requireWebLogin,async(req,res)=>{try{const phone=getWebSession(req).phone,id=Number(req.params.id),message=String(req.body.message||'').trim();if(!Number.isSafeInteger(id)||id<1||message.length<1||message.length>3000)return res.status(400).json({error:'Ticket/message invalid'});const {data:ticket,error:t}=await aairaSupabase.from('aaira_support_tickets').select('id,status').eq('id',id).eq('user_phone',phone).maybeSingle();if(t)throw t;if(!ticket)return res.status(404).json({error:'Ticket not found'});if(ticket.status==='closed')return res.status(409).json({error:'Ticket closed hai. Admin se reopen karwane ko bolein.'});const {data,error}=await aairaSupabase.from('aaira_support_messages').insert({ticket_id:id,sender_role:'user',message}).select('id,sender_role,message,created_at').single();if(error)throw error;await aairaSupabase.from('aaira_support_tickets').update({status:'open',updated_at:new Date().toISOString()}).eq('id',id);res.status(201).json({success:true,message:data});}catch(e){console.error('[SUPPORT] User reply failed:',e.message);res.status(500).json({error:'Reply send nahi hua.'});}});
app.get('/api/settings/display-name',requireWebLogin,async(req,res)=>{try{const session=getWebSession(req);const displayName=await aairaAuth.getDisplayName(session.phone);res.json({success:true,displayName});}catch(e){console.error('Get greeting name error:',e.message);res.status(500).json({error:'Greeting name load nahi hua.'});}});
app.post('/api/settings/display-name',requireWebLogin,async(req,res)=>{try{const session=getWebSession(req);const displayName=String(req.body.displayName||'').trim();if(!displayName||displayName.length>40)return res.status(400).json({error:'Naam 1-40 characters ka hona chahiye.'});await aairaAuth.setDisplayName(session.phone,displayName);currentDashboardOwnerPhone=session.phone;res.json({success:true,message:'Greeting name save ho gaya! 💗'});}catch(e){console.error('Save greeting name error:',e.message);res.status(500).json({error:'Greeting name save nahi hua.'});}});
app.get('/', (req, res) => res.type('html').send(dashboardHtml));

app.get('/api/live-chat/stream',(req,res)=>{const session=getWebSession(req);if(!session)return res.status(401).end('Login required');const owner=session.phone;res.setHeader('Content-Type','text/event-stream');res.setHeader('Cache-Control','no-cache, no-transform');res.setHeader('Connection','keep-alive');res.flushHeaders?.();const send=(event,data)=>res.write('event: '+event+'\ndata: '+JSON.stringify(data)+'\n\n');send('snapshot',liveChatBuffers.get(owner)||[]);let listeners=liveChatListeners.get(owner);if(!listeners){listeners=new Set();liveChatListeners.set(owner,listeners)}const listener=item=>send('message',item);listeners.add(listener);const keepAlive=setInterval(()=>res.write(': keep-alive\n\n'),25000);req.on('close',()=>{clearInterval(keepAlive);listeners.delete(listener);if(!listeners.size)liveChatListeners.delete(owner)});});
app.post('/api/live-chat/send',requireWebLogin,async(req,res)=>{const owner=getWebSession(req).phone,jid=String(req.body.jid||''),text=String(req.body.text||'').trim();if(!/^\d{8,20}@(s\.whatsapp\.net|lid)$/.test(jid))return res.status(400).json({error:'Contact address invalid.'});if(!text||text.length>4000)return res.status(400).json({error:'Message 1-4000 characters ka hona chahiye.'});const socket=accountSockets.get(owner);if(!socket||accountStatus.get(owner)!=='Connected')return res.status(503).json({error:'WhatsApp disconnected.'});try{const sent=await socket.sendMessage(jid,{text});publishLiveChat(owner,{id:sent?.key?.id,jid,text,fromMe:true,timestamp:Date.now()});res.json({success:true})}catch(e){console.error('[LIVE CHAT] Send failed:',e.message);res.status(500).json({error:'Message send failed.'})}});
app.get('/api/status', requireWebLogin, async (req,res)=>{res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, private');res.setHeader('Pragma','no-cache');try{const owner=getWebSession(req).phone;const settings=await aairaAuth.getBotSettings(owner);const socket=accountSockets.get(owner);const state=accountStatus.get(owner)||'Disconnected';const connection=socket&&state==='Connected'?'Connected':socket&&state==='Connecting'?'Connecting':'Disconnected';const me=socket?.authState?.creds?.me||{};const waProfileName=String(me.name||me.notify||'').trim();const rawJid=String(me.id||'').split(':')[0];const waPhoneNumber=rawJid.endsWith('@s.whatsapp.net')?'+'+rawJid.replace('@s.whatsapp.net',''):'';const waDeviceName=String(socket?.user?.name||me.name||'').trim();res.json({success:true,connection,botActive:settings.botActive,autoReplyEnabled:settings.autoReplyEnabled,socketReady:!!socket,waProfileName,waPhoneNumber,waDeviceName});}catch(e){res.status(500).json({error:'Status load failed'});}});
app.get('/toggle', requireWebLogin, async(req,res)=>{try{const owner=getWebSession(req).phone;const action=String(req.query.action||'').toLowerCase();if(!['on','off'].includes(action))return res.status(400).json({error:'Invalid action'});const value=action==='on';await aairaAuth.setBotSetting(owner,'botActive',value);res.json({success:true,message:value?'Bot is now ON ✅':'Bot is now OFF ❌',botStatus:value?'ON':'OFF'});}catch(e){console.error('Bot setting error:',e.message);res.status(500).json({error:'Bot setting save failed'});}});
app.get('/auto-reply', requireWebLogin, async(req,res)=>{try{const owner=getWebSession(req).phone;const action=String(req.query.action||'').toLowerCase();if(!['on','off'].includes(action))return res.status(400).json({error:'Invalid action'});const value=action==='on';await aairaAuth.setBotSetting(owner,'autoReplyEnabled',value);res.json({success:true,message:value?'Auto-reply is now ON ✅':'Auto-reply is now OFF ❌',autoReply:value?'ON':'OFF'});}catch(e){console.error('Auto-reply setting error:',e.message);res.status(500).json({error:'Auto-reply setting save failed'});}});
app.get('/pair', requireWebLogin, async(req,res)=>{const owner=getWebSession(req).phone;const phoneNumber=String(req.query.phone||'').replace(/[^0-9]/g,'');if(!/^\d{8,15}$/.test(phoneNumber))return res.status(400).json({error:'Phone number required with country code, e.g. 919876543210'});if(phoneNumber!==owner)return res.status(403).json({error:'AAIRA account aur WhatsApp number same hone chahiye. Apne registered mobile number ka WhatsApp connect karein.'});try{let socket=accountSockets.get(owner);if(!socket){await startAccountBot(owner);socket=accountSockets.get(owner);}if(!socket?.authState?.creds)return res.status(503).json({error:'WhatsApp socket initialize nahi hua. Refresh karke dobara try karein.'});if(socket.authState.creds.registered)return res.json({success:true,message:'WhatsApp session already registered.'});res.setHeader('Cache-Control','no-store');await new Promise(resolve=>setTimeout(resolve,1800));socket=accountSockets.get(owner);if(!socket||accountStatus.get(owner)==='Disconnected')return res.status(503).json({error:'WhatsApp connection band hai. Thodi der baad dobara try karein.'});let code=await socket.requestPairingCode(phoneNumber);code=code?.match(/.{1,4}/g)?.join('-')||code;if(!code)throw new Error('Empty pairing code');res.json({success:true,pairingCode:code});}catch(err){console.error('[PAIR] Pairing error:',err.message);res.status(500).json({error:'Pairing code generate nahi hua: '+String(err?.message||'Connection error').slice(0,100)});}});
const { getChatReply } = require('./chatBank');
const { getGroqReply } = require('./groqAI');
const crypto = require('crypto');
const aairaAuth = require('./aairaAuth');
const greetedSenders = new Set();
// Globally prevent AAIRA-linked WhatsApp accounts from auto-chatting with one another.
let aairaBotPhoneCache = new Set();
let aairaBotPhoneCacheUpdatedAt = 0;
async function isAnotherAairaBot(phone) {
  phone=String(phone||'').replace(/\\D/g,'');
  if(!phone)return false;
  if(Date.now()-aairaBotPhoneCacheUpdatedAt>60000){
    try{aairaBotPhoneCache=new Set((await aairaAuth.listRegisteredPhones()).map(p=>String(p).replace(/\\D/g,'')).filter(Boolean));aairaBotPhoneCacheUpdatedAt=Date.now();}
    catch(e){console.error('[AAIRA BOT GUARD] Registry refresh failed:',e.message);}
  }
  return aairaBotPhoneCache.has(phone);
}
const recentChatContexts = new Map(); // transient per-sender context in RAM only
const accountSockets = new Map();
const accountStatus = new Map();
const accountStarting = new Map();
const accountReconnectTimers = new Map();
const accountReconnectAttempts = new Map();
const accountLockTimers = new Map();
const instanceToken = crypto.randomBytes(24).toString('hex');
async function cleanupAccountRuntime(phone){phone=String(phone||'').replace(/\D/g,'');const socket=accountSockets.get(phone);if(socket){try{socket.end(undefined);}catch(e){}}accountSockets.delete(phone);accountStatus.set(phone,'Disconnected');const reconnect=accountReconnectTimers.get(phone);if(reconnect){clearTimeout(reconnect);accountReconnectTimers.delete(phone);}const lockTimer=accountLockTimers.get(phone);if(lockTimer){clearInterval(lockTimer);accountLockTimers.delete(phone);}accountStarting.delete(phone);try{await aairaAuth.releaseWhatsAppSessionLock(phone,instanceToken);}catch(e){console.warn('[ACCOUNT DELETE] Lock release failed:',e.message);}liveChatBuffers.delete(phone);liveContactNames.delete(phone);liveWhatsAppNames.delete(phone);liveContactNumbers.delete(phone);liveChatListeners.delete(phone);for(const key of greetedSenders){if(key.startsWith(phone+':'))greetedSenders.delete(key);}for(const key of recentChatContexts.keys()){if(key.startsWith(phone+':'))recentChatContexts.delete(key);}for(const [token,session] of webSessions){if(session.phone===phone)webSessions.delete(token);}await adminRouter.setWhatsAppStatus(phone,'Disconnected');}
adminRouter.cleanupAccountRuntime=cleanupAccountRuntime;
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
    try{const savedChats=await aairaAuth.loadLiveChatBuffer(ownerPhone);liveChatBuffers.set(ownerPhone,savedChats.slice(-1000));}catch(e){console.error('[LIVE CHAT] Restore failed:',e.message);}
    const {state,saveCreds,clearAuthState}=await useSupabaseAuthState('account_'+ownerPhone);
    let waVersion;try{const live=await fetchLatestWaWebVersion();if(Array.isArray(live?.version)&&live.version.length===3)waVersion=live.version;}catch(e){console.warn('[WA] Version lookup:',e.message);}
    const socket=makeWASocket({... (waVersion?{version:waVersion}:{}),auth:state,printQRInTerminal:false,connectTimeoutMs:60000,keepAliveIntervalMs:25000,syncFullHistory:false,browser:['Ubuntu','Chrome','20.0.04']});
    const oldLockTimer=accountLockTimers.get(ownerPhone);if(oldLockTimer)clearInterval(oldLockTimer);
    const lockTimer=setInterval(()=>{aairaAuth.claimWhatsAppSessionLock(ownerPhone,instanceToken,120).then(ok=>{if(!ok){console.error('[WA] Session lock lost for account',ownerPhone);const active=accountSockets.get(ownerPhone);if(active===socket){accountSockets.delete(ownerPhone);accountStatus.set(ownerPhone,'Disconnected');adminRouter.setWhatsAppStatus(ownerPhone,'Disconnected');try{socket.end(undefined);}catch(e){}}}}).catch(e=>console.error('[WA] Session lock renewal failed:',e.message));},45000);accountLockTimers.set(ownerPhone,lockTimer);
    accountSockets.set(ownerPhone,socket);accountStatus.set(ownerPhone,'Connecting');adminRouter.setWhatsAppStatus(ownerPhone,'Connecting');
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
      if(connection==='open'){accountReconnectAttempts.delete(ownerPhone);const pendingReconnect=accountReconnectTimers.get(ownerPhone);if(pendingReconnect){clearTimeout(pendingReconnect);accountReconnectTimers.delete(ownerPhone);}accountStatus.set(ownerPhone,'Connected');adminRouter.setWhatsAppStatus(ownerPhone,'Connected');console.log('[WA] Connected account',ownerPhone);}
      if(connection==='connecting'){accountStatus.set(ownerPhone,'Connecting');adminRouter.setWhatsAppStatus(ownerPhone,'Connecting');}
      if(connection==='close'){
        liveChatBuffers.delete(ownerPhone);
        if(accountSockets.get(ownerPhone)!==socket)return;
        accountSockets.delete(ownerPhone);accountStatus.set(ownerPhone,'Disconnected');adminRouter.setWhatsAppStatus(ownerPhone,'Disconnected');const lockTimer=accountLockTimers.get(ownerPhone);if(lockTimer){clearInterval(lockTimer);accountLockTimers.delete(ownerPhone);}
        const statusCode=lastDisconnect?.error?.output?.statusCode;console.log('[WA] Closed account',ownerPhone,statusCode);
        if(statusCode===DisconnectReason.loggedOut){
          try{await clearAuthState();}catch(e){console.error('[WA] Clear auth failed:',e.message);}
          try{await aairaAuth.releaseWhatsAppSessionLock(ownerPhone,instanceToken);}catch(e){}
          console.log('[WA] Account logged out; user can pair again.');
        }else if(!accountReconnectTimers.has(ownerPhone)){
          const attempt=(accountReconnectAttempts.get(ownerPhone)||0)+1;accountReconnectAttempts.set(ownerPhone,attempt);
          const delay=Math.min(4000*Math.pow(2,Math.min(attempt-1,7)),300000);
          console.log('[WA] Reconnect scheduled for account',ownerPhone,'attempt',attempt,'in',Math.round(delay/1000),'seconds');
          const timer=setTimeout(()=>{accountReconnectTimers.delete(ownerPhone);startAccountBot(ownerPhone).catch(e=>console.error('[WA] Reconnect failed:',e.message));},delay);
          accountReconnectTimers.set(ownerPhone,timer);
        }
      }
    });
    socket.ev.on('contacts.upsert',contacts=>{for(const contact of contacts||[]){const jid=contact.id||contact.jid;if(jid&&jid!=='status@broadcast'&&!jid.endsWith('@g.us'))publishLiveChat(ownerPhone,{jid,contactName:contact.name||'',whatsappName:contact.notify||contact.pushName||contact.verifiedName||'',phoneNumber:contact.phoneNumber||(jid.endsWith('@s.whatsapp.net')?jid.split('@')[0]:'')});}});
    socket.ev.on('chats.upsert',chats=>{for(const chat of chats||[]){const jid=chat.id||chat.jid;if(jid&&jid!=='status@broadcast'&&!jid.endsWith('@g.us'))publishLiveChat(ownerPhone,{jid,contactName:chat.name||chat.subject||chat.pushName||'',phoneNumber:chat.phoneNumber||(jid.endsWith('@s.whatsapp.net')?jid.split('@')[0]:'')});}});
    socket.ev.on('messaging-history.set',({contacts,chats,messages})=>{for(const contact of contacts||[]){const jid=contact.id||contact.jid;if(jid&&jid!=='status@broadcast'&&!jid.endsWith('@g.us'))publishLiveChat(ownerPhone,{jid,contactName:contact.name||'',whatsappName:contact.notify||contact.pushName||contact.verifiedName||'',phoneNumber:contact.phoneNumber||(jid.endsWith('@s.whatsapp.net')?jid.split('@')[0]:'')});}for(const chat of chats||[]){const jid=chat.id||chat.jid;if(jid&&jid!=='status@broadcast'&&!jid.endsWith('@g.us'))publishLiveChat(ownerPhone,{jid,contactName:chat.name||chat.subject||'',whatsappName:chat.pushName||'',phoneNumber:chat.phoneNumber||(jid.endsWith('@s.whatsapp.net')?jid.split('@')[0]:'')});}for(const msg of messages||[]){const jid=preferredContactJid(msg.key?.remoteJid,msg.key?.remoteJidAlt);if(!jid||jid==='status@broadcast'||jid.endsWith('@g.us'))continue;const text=liveMessageText(msg.message);publishLiveChat(ownerPhone,{id:msg.key?.id,jid,text,whatsappName:msg.pushName||msg.verifiedBizName||'',fromMe:!!msg.key?.fromMe,timestamp:msg.messageTimestamp?Number(msg.messageTimestamp)*1000:Date.now()});}});
    socket.ev.on('messages.upsert',async({messages,type})=>{
      if(type!=='notify')return;
      for(const msg of messages){try{
        if(!msg.message)continue;
        // Ignore WhatsApp Status broadcasts and direct replies/reactions quoted from a Status.
        if(msg.key?.remoteJid==='status@broadcast'||msg.key?.remoteJidAlt==='status@broadcast')continue;
        let statusCheckMessage=msg.message;
        for(let depth=0;depth<5;depth++){
          if(statusCheckMessage?.ephemeralMessage?.message)statusCheckMessage=statusCheckMessage.ephemeralMessage.message;
          else if(statusCheckMessage?.viewOnceMessage?.message)statusCheckMessage=statusCheckMessage.viewOnceMessage.message;
          else if(statusCheckMessage?.viewOnceMessageV2?.message)statusCheckMessage=statusCheckMessage.viewOnceMessageV2.message;
          else if(statusCheckMessage?.documentWithCaptionMessage?.message)statusCheckMessage=statusCheckMessage.documentWithCaptionMessage.message;
          else break;
        }
        const statusContext=statusCheckMessage?.extendedTextMessage?.contextInfo||statusCheckMessage?.imageMessage?.contextInfo||statusCheckMessage?.videoMessage?.contextInfo||statusCheckMessage?.buttonsResponseMessage?.contextInfo||statusCheckMessage?.listResponseMessage?.contextInfo;
        if(statusContext?.remoteJid==='status@broadcast'||statusContext?.quotedMessage?.statusMentionMessage)continue;
        const liveJid=preferredContactJid(msg.key.remoteJid,msg.key.remoteJidAlt);
        if(liveJid&&liveJid!=='status@broadcast'&&!liveJid.endsWith('@g.us')){const liveText=liveMessageText(msg.message).trim();if(liveText)publishLiveChat(ownerPhone,{id:msg.key.id,jid:liveJid,text:liveText,whatsappName:msg.pushName||msg.verifiedBizName||'',phoneNumber:liveJid?.endsWith('@s.whatsapp.net')?liveJid.split('@')[0]:'',fromMe:!!msg.key.fromMe,timestamp:msg.messageTimestamp?Number(msg.messageTimestamp)*1000:Date.now()})}
        if(msg.key.fromMe)continue;
        const sender=liveJid;if(!sender||sender==='status@broadcast'||sender.endsWith('@g.us'))continue;
        // If the sender is any other paired AAIRA account, ignore it to stop AI-to-AI loops.
        const senderPhone=sender.endsWith('@s.whatsapp.net')?sender.split('@')[0]:'';
        if(senderPhone&&await isAnotherAairaBot(senderPhone))continue;
        let visionMessage=msg.message;
        for(let depth=0;depth<5;depth++){
          if(visionMessage?.ephemeralMessage?.message)visionMessage=visionMessage.ephemeralMessage.message;
          else if(visionMessage?.viewOnceMessage?.message)visionMessage=visionMessage.viewOnceMessage.message;
          else if(visionMessage?.viewOnceMessageV2?.message)visionMessage=visionMessage.viewOnceMessageV2.message;
          else if(visionMessage?.documentWithCaptionMessage?.message)visionMessage=visionMessage.documentWithCaptionMessage.message;
          else break;
        }
        const incomingImage=visionMessage?.imageMessage||null;
        const textMessage=liveMessageText(msg.message).trim()||(incomingImage?'Is image ko dekho aur jo dikh raha hai uske baare mein batao.':'');
        if(!textMessage)continue;
        const settings=await aairaAuth.getBotSettings(ownerPhone);
        if(!settings.botActive)continue;
        const greetingName=String(await aairaAuth.getDisplayName(ownerPhone)||'VIHUHUHU').trim().toUpperCase().replace(/[^A-Z0-9 _-]/g,'').slice(0,40).trim()||'VIHUHUHU';
        const send=(text)=>socket.sendMessage(sender,{text});
        const greetingKey=ownerPhone+':'+sender;
        // Send the saved greeting name in the welcome message, even when global Auto Reply is OFF.
        if(!greetedSenders.has(greetingKey)){
          await send('*Heyy! 💗 Mai '+greetingName+' ♥️ KA OFFLINE ASSISTANT 😴✨ AI HU MERA NAME AAIRA HAI*');
          greetedSenders.add(greetingKey);
        }
        if(!settings.autoReplyEnabled)continue;
        const aiSettings=await aairaAuth.getAISettings(ownerPhone);
        const contextKey=ownerPhone+':'+sender;
        const chatHistory=recentChatContexts.get(contextKey)||[];
        let replyText=null;
        let generatedByAI=false;
        let generatedBySavedModel=false;
        // Groq is independent: it can run while Saved Model is OFF.
        if(aiSettings.groqAIEnabled&&(process.env.GROQ_API_KEY||process.env.GROQ_API_KEY_2)){
          try{
            let imageDataUrl=null;
            if(incomingImage){
              try{
                const imageBuffer=await downloadMediaMessage({...msg,message:visionMessage},'buffer',{});
                if(imageBuffer&&imageBuffer.length){
                  const mimeType=String(incomingImage.mimetype||'image/jpeg').split(';')[0];
                  imageDataUrl='data:'+mimeType+';base64,'+imageBuffer.toString('base64');
                }
              }catch(imageError){console.error('[GROQ] WhatsApp image download failed:',imageError.message);}
            }
            replyText=await getGroqReply(textMessage,{history:chatHistory.slice(),displayName:greetingName,imageDataUrl});
            generatedByAI=!!replyText;
          }catch(e){console.error('[GROQ] AI reply failed:',e.message);}
        }
        // Fixed/chat-bank replies are permitted only while Saved Model is ON.
        if(!replyText&&aiSettings.savedModelEnabled){
          try{replyText=getChatReply(textMessage,{history:chatHistory.slice()});generatedBySavedModel=!!replyText;}
          catch(e){console.error('[WA] Saved model reply error:',e.message);}
        }
        // Re-check all switches immediately before sending; never fall back to a disabled engine.
        const latestBotSettings=await aairaAuth.getBotSettings(ownerPhone);
        const latestAISettings=await aairaAuth.getAISettings(ownerPhone);
        if(!latestBotSettings.botActive||!latestBotSettings.autoReplyEnabled)continue;
        if(generatedByAI&&!latestAISettings.groqAIEnabled){
          if(latestAISettings.savedModelEnabled){
            try{replyText=getChatReply(textMessage,{history:chatHistory.slice()});generatedBySavedModel=!!replyText;generatedByAI=false;}
            catch(e){replyText=null;generatedByAI=false;generatedBySavedModel=false;}
          }else continue;
        }
        if(generatedBySavedModel&&!latestAISettings.savedModelEnabled)continue;
        chatHistory.push({role:'user',text:textMessage});
        if(replyText)chatHistory.push({role:'assistant',text:replyText});
        if(chatHistory.length>12)chatHistory.splice(0,chatHistory.length-12);
        recentChatContexts.delete(contextKey);recentChatContexts.set(contextKey,chatHistory);
        if(recentChatContexts.size>3000){const oldest=recentChatContexts.keys().next().value;recentChatContexts.delete(oldest);}
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