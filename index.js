require('dotenv').config();
const express = require('express');
const { default: makeWASocket, DisconnectReason, fetchLatestWaWebVersion, downloadMediaMessage, Browsers } = require('@whiskeysockets/baileys');
const { useSupabaseAuthState } = require('./supabaseAuth');
const { canonicalPhone } = require('./aairaAuth');
const pino = require('pino');
const http = require('http');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
const { db, initDb } = require('./db');
const adminRouter = require('./adminRouter');
app.use(adminRouter);
async function rejectBlockedAccount(req,res,next){try{const phone=canonicalPhone(req.body.phone);if(phone&&await adminRouter.isBlocked(phone))return res.status(403).json({error:'This AAIRA account has been blocked by admin.'});next();}catch(e){console.error('[ADMIN] Block check failed:',e.message);res.status(503).json({error:'Account access check unavailable.'});}}
app.use('/api/auth/register',rejectBlockedAccount);
app.use('/api/auth/login',rejectBlockedAccount);
// Serve dashboard background assets explicitly (the dashboard HTML is inline).
app.get('/background.jpg',(req,res)=>res.sendFile(require('path').join(__dirname,'background.jpg')));
app.get('/anime-bg.jpg',(req,res)=>res.sendFile(require('path').join(__dirname,'anime-bg.jpg')));
app.get('/background.svg',(req,res)=>res.type('image/svg+xml').sendFile(require('path').join(__dirname,'background.svg')));

let currentDashboardOwnerPhone = null;
const liveChatBuffers=new Map(),liveChatListeners=new Map(),liveContactNames=new Map(),liveWhatsAppNames=new Map(),liveContactNumbers=new Map(),lidToPhoneJid=new Map();
function registerJidPair(primary,alternate){const p=String(primary||''),a=String(alternate||'');if(p.endsWith('@lid')&&a.endsWith('@s.whatsapp.net'))lidToPhoneJid.set(p,a);else if(a.endsWith('@lid')&&p.endsWith('@s.whatsapp.net'))lidToPhoneJid.set(a,p);}
function preferredContactJid(primary,alternate){registerJidPair(primary,alternate);const pn=/^\d{8,15}@s\.whatsapp\.net$/;if(pn.test(String(primary||'')))return primary;if(pn.test(String(alternate||'')))return alternate;if(primary&&lidToPhoneJid.has(primary))return lidToPhoneJid.get(primary);if(alternate&&lidToPhoneJid.has(alternate))return lidToPhoneJid.get(alternate);return primary||alternate||'';}
function liveMessageText(message){let m=message||{};for(let i=0;i<5;i++){if(m.ephemeralMessage?.message)m=m.ephemeralMessage.message;else if(m.viewOnceMessage?.message)m=m.viewOnceMessage.message;else if(m.viewOnceMessageV2?.message)m=m.viewOnceMessageV2.message;else if(m.documentWithCaptionMessage?.message)m=m.documentWithCaptionMessage.message;else break;}const t=m.conversation||m.extendedTextMessage?.text||m.imageMessage?.caption||m.videoMessage?.caption||m.documentMessage?.caption||m.buttonsResponseMessage?.selectedDisplayText||m.listResponseMessage?.title||m.templateButtonReplyMessage?.selectedDisplayText||m.pollCreationMessage?.name||m.pollCreationMessageV3?.name||m.locationMessage?.name||m.locationMessage?.address||m.contactMessage?.displayName||m.contactsArrayMessage?.displayName;if(t)return String(t);if(m.imageMessage)return '🖼️ Image'+(m.imageMessage.caption?' — '+m.imageMessage.caption:'');if(m.videoMessage)return '🎥 Video'+(m.videoMessage.caption?' — '+m.videoMessage.caption:'');if(m.audioMessage)return m.audioMessage.ptt?'🎤 Voice message':'🔊 Audio message';if(m.stickerMessage)return '🎭 Sticker';if(m.documentMessage)return '📎 Document: '+(m.documentMessage.fileName||'file');if(m.locationMessage)return '📍 Location';if(m.liveLocationMessage)return '📍 Live location';if(m.contactMessage||m.contactsArrayMessage)return '👤 Contact card';if(m.reactionMessage)return '😊 Reaction: '+(m.reactionMessage.text||'');if(m.pollUpdateMessage)return '📊 Poll vote';if(m.protocolMessage)return '';return '';}
function publishLiveChat(owner,item){if(!owner||!item?.jid)return;if(item.jid.endsWith('@lid')&&lidToPhoneJid.has(item.jid)){item.jid=lidToPhoneJid.get(item.jid);}let b=liveChatBuffers.get(owner);if(!b){b=[];liveChatBuffers.set(owner,b)}const names=liveContactNames.get(owner)||new Map();liveContactNames.set(owner,names);const numbers=liveContactNumbers.get(owner)||new Map();liveContactNumbers.set(owner,numbers);const pnJid=/^(\d{8,15})@s\.whatsapp\.net$/.exec(item.jid);const suppliedNumber=String(item.phoneNumber||'').replace(/\D/g,'');const incomingNumber=pnJid?.[1]||(/^\d{8,15}$/.test(suppliedNumber)?suppliedNumber:'');if(incomingNumber)numbers.set(item.jid,incomingNumber);const incomingName=String(item.contactName||'').trim().slice(0,100),incomingWhatsAppName=String(item.whatsappName||'').trim().slice(0,100);if(incomingName)names.set(item.jid,incomingName);const waNames=liveWhatsAppNames.get(owner)||new Map();liveWhatsAppNames.set(owner,waNames);if(incomingWhatsAppName)waNames.set(item.jid,incomingWhatsAppName);const prior=[...b].reverse().find(x=>x.jid===item.jid&&x.contactName)?.contactName||'',resolvedName=names.get(item.jid)||incomingName||prior||waNames.get(item.jid)||incomingWhatsAppName||'';let cleanText=String(item.text||'').replace(/\u200B/g,'').trim();if(!cleanText)return;const entry={id:item.id||require('crypto').randomUUID(),jid:item.jid,text:cleanText.slice(0,4000),contactName:resolvedName,phoneNumber:incomingNumber||numbers.get(item.jid)||'',fromMe:!!item.fromMe,timestamp:item.timestamp||Date.now()};if(item.id&&b.some(x=>x.id===item.id))return;const existing=b.findIndex(x=>x.jid===entry.jid&&!x.text);if(existing>=0)b.splice(existing,1);b.push(entry);const perJid=b.filter(x=>x.jid===entry.jid);if(perJid.length>100){const remove=new Set(perJid.slice(0,perJid.length-100).map(x=>x.id));b=b.filter(x=>!remove.has(x.id));}const latestByJid=new Map();for(const x of b){const prev=latestByJid.get(x.jid);if(!prev||x.timestamp>prev.timestamp)latestByJid.set(x.jid,x);}const newestJids=[...latestByJid.values()].sort((a,c)=>c.timestamp-a.timestamp).slice(0,100).map(x=>x.jid);const keep=new Set(newestJids);b=b.filter(x=>keep.has(x.jid));if(b.length>1000)b.splice(0,b.length-1000);liveChatBuffers.set(owner,b);aairaAuth.saveLiveChatBuffer(owner,b.slice()).catch(e=>console.error('[LIVE CHAT] Persistent save failed:',e.message));for(const fn of liveChatListeners.get(owner)||[]){try{fn(entry)}catch{}}}

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
.green{color:#6ee7b7;border-color:#10b981;background:rgba(16,185,129,0.1)}.red{color:#999;border-color:#555}
input{width:100%;background:rgba(5,5,5,.58);color:white;border:1px solid #666;border-radius:10px;
padding:13px;margin:8px 0 12px;font-size:15px;outline:none}
input:focus{border-color:#eee;box-shadow:0 0 8px #777}
button{background:rgba(8,8,8,.58);color:#fff;border:1px solid #aaa;border-radius:10px;
padding:12px 16px;margin:4px;cursor:pointer;font-weight:bold;transition:.2s}
button:hover{background:#eee;color:#000;box-shadow:0 0 14px #aaa}
button:disabled{opacity:.45;cursor:not-allowed}
.row{display:flex;gap:10px;flex-wrap:wrap}.row button{flex:1}
.code{font-size:30px;letter-spacing:6px;text-align:center;padding:16px;color:#6ee7b7;
border:2px dashed #10b981;border-radius:14px;margin-top:14px;min-height:60px;background:#052e16}
.note{font-size:12px;color:#aaa;line-height:1.6}
.chat-layout{display:grid;grid-template-columns:minmax(110px,32%) 1fr;gap:10px;min-height:300px}.chat-contacts,.chat-messages{border:1px solid #555;border-radius:10px;padding:8px;min-width:0}.chat-contacts{max-height:360px;overflow:auto}.contact{display:block;width:100%;text-align:left;margin:3px 0;overflow-wrap:anywhere}.chat-messages{display:flex;flex-direction:column;gap:8px;max-height:360px;overflow:auto;background:rgba(5,5,5,.65);padding:10px}.chat-contacts{background:rgba(5,5,5,.28)}.bubble{max-width:85%;padding:8px 12px;border-radius:12px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;line-height:1.4}.bubble.in{align-self:flex-start;background:#202c33;color:#e9edef;border:1px solid #2a3942}.bubble.out{align-self:flex-end;background:#005c4b;color:#e9edef;border:1px solid #005c4b}.bot-tag{font-size:10px;font-weight:bold;color:#34d399;margin-bottom:3px}.message-time{font-size:10px;color:#94a3b8;text-align:right;margin-top:4px;white-space:nowrap}.chat-compose{display:flex;gap:6px;margin-top:10px}.chat-compose input{margin:0;flex:1;min-width:0}
pre{white-space:pre-wrap;color:#ddd;font-size:13px}
footer{text-align:center;color:#777;padding:20px;font-size:12px}
</style>
</head>
<body>
<section id="welcomeGate" style="position:fixed;inset:0;z-index:100;background:linear-gradient(rgba(0,0,0,.48),rgba(0,0,0,.68)),url('/anime-bg.jpg') center center / cover no-repeat;display:flex;align-items:center;justify-content:center;padding:18px"><div class="panel" style="width:min(440px,100%);margin:0;text-align:center"><div class="logo" style="font-size:30px;letter-spacing:3px">VIHUHUHU KA</div><h2 style="font-size:25px;margin:12px 0;text-shadow:0 0 14px #ddd">✦ AAIRA BOT ✦</h2><p class="note" style="font-size:14px">WELCOME TO AAIRA WHATSAPP BOT</p><a id="welcomeStartButton" href="#authGate" role="button" style="display:block;background:rgba(8,8,8,.58);color:#fff;border:1px solid #aaa;border-radius:10px;padding:12px 16px;margin:18px 4px 4px;cursor:pointer;font-weight:bold;text-decoration:none;font-size:16px;width:100%">✨ START / REGISTER</a></div></section>
<section id="authGate" style="position:fixed;inset:0;z-index:99;background:linear-gradient(rgba(0,0,0,.48),rgba(0,0,0,.62)),url('/anime-bg.jpg') center center / cover no-repeat;display:none;align-items:center;justify-content:center;padding:18px"><div class="panel" style="width:min(440px,100%);margin:0"><h2>🔐 AAIRA ACCOUNT</h2><p class="note">Mobile number aur password se login karein ya account banayein.</p><label>Mobile number (10 digit ya country code ke saath)</label><input id="authPhone" inputmode="numeric" placeholder="8115743185 ya 918115743185"><label>Password (minimum 6 characters)</label><input id="authPassword" type="password" minlength="6" maxlength="64" placeholder="Password"><div class="row"><button type="button" id="loginButton">LOGIN</button><button type="button" id="registerButton">REGISTER</button></div><button onclick="forgotAccount()" style="width:100%">FORGOT PASSWORD? DELETE ACCOUNT DATA</button><p id="authMessage" class="note"></p></div></section>
<div class="wrap">
<header id="mainHeader">
  <div class="logo">AAIRA ✦</div>
  <div class="subtitle">VIHUHUHU KA OFFLINE ASSISTANT</div>
  <div class="row" style="max-width:440px;margin:14px auto 6px">
    <button id="openLiveDashboard" onclick="openLiveDashboard()" style="flex:1;font-size:15px">💬 LIVE WHATSAPP</button>
    <button type="button" onclick="openAairaSupport()" style="flex:1;font-size:15px">✨ AAIRA SUPPORT</button>
  </div>
  <button type="button" onclick="userLogout()" style="max-width:140px;margin:6px auto;font-size:12px;background:rgba(40,10,10,0.6);border-color:#7f1d1d;color:#fca5a5">🚪 LOGOUT</button>
</header>
<section class="panel">
  <div class="status"><h2>WHATSAPP CONNECTION</h2><span id="connection" class="pill red">Disconnected ❌</span></div>
  <div id="waIdentity" class="note" style="margin-top:12px;display:none;background:#111;padding:12px;border-radius:10px;border-left:3px solid #10b981"><b id="waProfileName" style="color:#6ee7b7"></b><div id="waProfileNumber" style="margin-top:4px"></div><div id="waDeviceName" style="margin-top:4px;color:#aaa"></div></div>
  <div class="status" style="margin-top:10px"><span>Bot Status</span><span id="bot" class="pill">Checking...</span></div>
  <div class="status" style="margin-top:10px"><span>Auto Reply</span><span id="auto" class="pill">Checking...</span></div>
  <div class="row" style="margin-top:15px"><button onclick="toggleBot('on')">BOT ON</button><button onclick="toggleBot('off')">BOT OFF</button></div>
  <div class="row"><button onclick="toggleAuto('on')">AUTO-REPLY ON</button><button onclick="toggleAuto('off')">AUTO-REPLY OFF</button></div>
  <div class="row" style="margin-top:10px">
    <button onclick="refreshStatus()" style="flex:1">↻ REFRESH STATUS</button>
    <button onclick="disconnectWhatsApp()" style="flex:1;background:rgba(50,15,15,0.7);border-color:#b91c1c;color:#fca5a5">🔌 DISCONNECT / UNLINK</button>
  </div>
</section>

<section class="panel" id="connectWhatsAppPanel">
  <div style="border:1px solid #555;border-radius:14px;padding:18px;background:rgba(10,10,10,0.5)">
    <h2 style="margin-bottom:8px">📱 CONNECT / LINK WHATSAPP</h2>
    <p class="note" id="connectIntroNote" style="margin-bottom:12px">Apna WhatsApp number enter karein aur direct pairing code se WhatsApp connect karein.</p>
    <label for="waPhone">WhatsApp number (10-digit mobile number)</label>
    <input id="waPhone" inputmode="numeric" placeholder="8115743185 ya 918115743185">
    <div class="row">
      <button onclick="connectWhatsApp(false)" id="pairBtn" style="flex:1">🔗 GET PAIRING CODE</button>
      <button onclick="connectWhatsApp(true)" id="forcePairBtn" style="flex:1;background:rgba(45,15,15,0.7);border-color:#dc2626">🔄 RESET & RE-LINK</button>
    </div>
    <p id="pairMessage" class="note" style="margin-top:14px;font-size:13px;color:#f0f0f0"></p>
    <div id="pairCode" class="code" style="display:none"></div>
    <div id="pairInstructions" style="display:none;margin-top:14px;font-size:13px;color:#e2e8f0;line-height:1.8;background:#0f172a;padding:16px;border-radius:12px;border:1px solid #10b981">
      <b style="color:#6ee7b7;font-size:15px">👉 Apne Phone Me WhatsApp Kaise Link Karein:</b><br>
      1. Apne mobile me <b>WhatsApp</b> app open karein<br>
      2. Upar teen bindu (<b>⋮</b>) ya <b>Settings</b> → <b>Linked Devices</b> par tap karein<br>
      3. <b>Link a device</b> par click karein<br>
      4. Niche <b>"Link with phone number instead"</b> par click karein<br>
      5. Upar dikha hua 8-digit code (jaise <b>ABCD-1234</b>) daalein!<br>
      <i style="color:#94a3b8">Code daalte hi ye page automatically Green "Connected ✅" ho jayega.</i>
    </div>
  </div>
</section>

<section class="panel">
  <h2>💗 GREETING NAME SETTINGS</h2>
  <label for="displayName">Greeting mein naam (VIHUHUHU ko badlein)</label>
  <input id="displayName" maxlength="40" placeholder="VIHUHUHU">
  <button onclick="saveDisplayName()" style="width:100%">SAVE GREETING NAME</button>
  <p id="nameMessage" class="note">Default: VIHUHUHU</p>
</section>

<section id="aairaSupportModal" class="panel" style="display:none;position:fixed;z-index:2147483000;inset:0;margin:auto;width:min(460px,94%);height:max-content;max-height:90vh;overflow:auto;background:rgba(8,8,8,.96);box-shadow:0 0 30px #000">
  <h2>✨ AAIRA SUPPORT</h2>
  <p class="note">Apni problem ka message bhejein. Admin aapka message dekh sakega.</p>
  <label for="aairaSupportMessage">Problem message</label>
  <textarea id="aairaSupportMessage" maxlength="2000" rows="5" style="width:100%;background:#080808;color:white;border:1px solid #666;border-radius:10px;padding:12px" placeholder="Yahan apni problem likhein..."></textarea>
  <p id="aairaSupportStatus" class="note" aria-live="polite"></p>
  <div class="row">
    <button type="button" onclick="sendAairaSupportMessage()">SEND MESSAGE</button>
    <button type="button" onclick="loadMySupportTickets()">↻ MY TICKETS / REPLIES</button>
    <button type="button" onclick="closeAairaSupport()">CLOSE</button>
  </div>
  <div id="myAairaSupportTickets" style="margin-top:12px;white-space:normal"></div>
</section>

<section class="panel" id="liveChatPanel" style="display:none">
  <button onclick="backToMainDashboard()" style="width:100%;margin:0 0 12px">← BACK</button>
  <h2>💬 LIVE WHATSAPP CHAT</h2>
  <p id="liveChatStatus" class="note">Live messages + synced history • text, media captions dikhte hain.</p>
  <div class="chat-layout">
    <div id="liveChatContacts" class="chat-contacts"><p class="note">Live contacts yahan aayenge</p></div>
    <div id="liveChatMessages" class="chat-messages"><p class="note">Koi live message nahi hai.</p></div>
  </div>
  <div class="chat-compose">
    <input id="liveChatReply" placeholder="Reply likhein..." maxlength="4000">
    <button onclick="sendLiveChatReply()">SEND</button>
  </div>
</section>

<section class="panel">
  <h2>📋 AAIRA MENU / STATUS</h2>
  <pre>!ping  — Check bot reply
!menu  — Show commands
Welcome message — First message from each sender
AAIRA AI assistant replies — Groq AI & Smart Model</pre>
  <p class="note">Dashboard theme: Gothic Dark • Black & White • Silver glow</p>
</section>
<footer>AAIRA • Gothic Dark Theme</footer>
</div>
<script>
function openRegister(){const welcome=document.getElementById("welcomeGate");const gate=document.getElementById("authGate");if(welcome){welcome.style.setProperty("display","none","important");welcome.setAttribute("aria-hidden","true");}if(gate){gate.style.setProperty("display","flex","important");gate.style.setProperty("visibility","visible","important");gate.style.setProperty("opacity","1","important");gate.setAttribute("aria-hidden","false");gate.style.zIndex="2147483647";}const phone=document.getElementById("authPhone");if(phone){phone.focus();}return false;}
window.openRegister=openRegister;
const welcomeStart=document.getElementById("welcomeStartButton");
if(welcomeStart){welcomeStart.addEventListener("click",openRegister);welcomeStart.onclick=openRegister;}

window.authAction=async function authAction(action){
  const phone=document.getElementById('authPhone').value.replace(/\\D/g,'');
  const password=document.getElementById('authPassword').value;
  const msg=document.getElementById('authMessage');
  const loginBtn=document.getElementById('loginButton'),registerBtn=document.getElementById('registerButton');
  msg.style.cssText='display:block!important;visibility:visible!important;color:#fff!important;background:#222!important;padding:12px!important;border-radius:8px!important';
  if(!/^\\d{10,15}$/.test(phone)){msg.textContent='Valid phone number enter karein.';return}
  if(!/^\\S{6,64}$/.test(password)){msg.textContent='Password 6-64 characters ka hona chahiye (spaces allowed nahi).';return}
  msg.textContent='⏳ '+(action==='login'?'Login request bhej rahe hain...':'Registration request bhej rahe hain...');
  if(loginBtn)loginBtn.disabled=true;if(registerBtn)registerBtn.disabled=true;
  try{
    const r=await fetch('/api/auth/'+action,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({phone,password})});
    let d={};try{d=await r.json()}catch(e){d={error:'Server response read nahi hua (HTTP '+r.status+').'}}
    if(!r.ok){msg.textContent=d.error||d.message||'Login request fail hua (HTTP '+r.status+').';return}
    msg.textContent=d.message||'Request successful.';
    if(action==='login'){
      history.replaceState(null,'',location.pathname+location.search);
      const gate=document.getElementById('authGate'),welcome=document.getElementById('welcomeGate'),dashboard=document.querySelector('.wrap');
      if(gate){gate.setAttribute('aria-hidden','true');gate.style.setProperty('display','none','important');gate.style.setProperty('visibility','hidden','important')}
      if(welcome){welcome.setAttribute('aria-hidden','true');welcome.style.setProperty('display','none','important')}
      if(dashboard){dashboard.style.setProperty('display','block','important');dashboard.style.setProperty('visibility','visible','important')}
      if(typeof refreshStatus==='function')refreshStatus();
      if(typeof loadDisplayName==='function')loadDisplayName();
    }
  }catch(e){msg.textContent='Network/server error: '+(e?.message||'request failed')+'. Internet check karke retry karein.'}
  finally{if(loginBtn)loginBtn.disabled=false;if(registerBtn)registerBtn.disabled=false}
};
const loginButton=document.getElementById('loginButton'),registerButton=document.getElementById('registerButton');
if(loginButton)loginButton.addEventListener('click',()=>window.authAction('login'));
if(registerButton)registerButton.addEventListener('click',()=>window.authAction('register'));

async function forgotAccount(){const phone=document.getElementById('authPhone').value.replace(/\\D/g,'');const password=document.getElementById('authPassword').value;if(!/^\\d{10,15}$/.test(phone)){alert('Phone number enter karein.');return}if(!/^\\S{6,64}$/.test(password)){alert('Account delete karne ke liye apna password enter karein.');return}if(prompt('Account data permanently delete karne ke liye DELETE type karein:')!=='DELETE')return;try{const r=await fetch('/api/auth/forgot',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone,password,confirm:'DELETE'})});const d=await r.json();document.getElementById('authMessage').textContent=d.message||d.error||'Done';}catch(e){document.getElementById('authMessage').textContent='Server connection failed.'}}

function openAairaSupport(){const m=document.getElementById("aairaSupportModal");if(m)m.style.display="block";loadMySupportTickets();document.getElementById("aairaSupportMessage").focus()}
async function loadMySupportTickets(){const box=document.getElementById("myAairaSupportTickets");box.textContent="Tickets/replies load ho rahe hain...";try{const r=await fetch("/api/support/my-tickets",{credentials:"same-origin",cache:"no-store"}),d=await r.json();if(!r.ok)throw Error(d.error||"Tickets load nahi hue");box.innerHTML=(d.tickets||[]).map(t=>'<div style="border:1px solid #555;border-radius:10px;padding:10px;margin:8px 0;background:#111"><b>'+escSupport(t.ticket_ref)+' — '+escSupport(t.status.toUpperCase())+'</b><p>'+escSupport(t.description)+'</p>'+(t.messages||[]).map(m=>'<div style="border-left:3px solid '+(m.sender_role==="admin"?"#7dd3fc":"#777")+';padding:8px;margin:6px 0;background:#080808"><b>'+(m.sender_role==="admin"?"✨ ADMIN REPLY":"YOU")+': </b><p>'+escSupport(m.message)+'</p><small>'+new Date(m.created_at).toLocaleString()+'</small></div>').join("")+'</div>').join("")||'<p class="note">Abhi koi support ticket nahi hai.</p>'}catch(e){box.textContent=e.message||"Tickets load error"}}
function escSupport(v){return String(v||"").replace(/[&<>"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]))}
function closeAairaSupport(){const m=document.getElementById("aairaSupportModal");if(m)m.style.display="none"}
async function sendAairaSupportMessage(){const field=document.getElementById("aairaSupportMessage"),status=document.getElementById("aairaSupportStatus"),message=field.value.trim();if(message.length<10){status.textContent="Problem ko kam se kam 10 characters mein likhein.";return}if(message.length>2000){status.textContent="Message 2000 characters se chhota rakhein.";return}status.textContent="Message bheja ja raha hai...";try{const r=await fetch("/api/support/message",{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({message})});let d={};try{d=await r.json()}catch(e){}if(!r.ok)throw Error(d.error||"Message send nahi hua (HTTP "+r.status+")");status.textContent="✅ Aapka message admin ko bhej diya gaya.";field.value="";}catch(e){status.textContent=e.message||"Network/server error. Dobara try karein."}}

async function loadDisplayName(){try{const r=await fetch('/api/settings/display-name');const d=await r.json();if(r.ok){document.getElementById('displayName').value=d.displayName||'VIHUHUHU';document.getElementById('nameMessage').textContent='Current greeting name: '+(d.displayName||'VIHUHUHU');}}catch(e){document.getElementById('nameMessage').textContent='Settings load nahi hui.'}}
async function saveDisplayName(){const displayName=document.getElementById('displayName').value.trim();if(!displayName||displayName.length>40){document.getElementById('nameMessage').textContent='Naam 1-40 characters ka hona chahiye.';return}try{const r=await fetch('/api/settings/display-name',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({displayName})});const d=await r.json();document.getElementById('nameMessage').textContent=d.message||d.error||'Saved';if(r.ok)loadDisplayName();}catch(e){document.getElementById('nameMessage').textContent='Save failed.'}}

let pairPollTimer = null;
async function refreshStatus(){
  try{
    const r=await fetch('/api/status?refresh='+Date.now(),{cache:'no-store'});
    const d=await r.json();
    if(r.ok && d.success){
      const gate=document.getElementById('authGate'),welcome=document.getElementById('welcomeGate'),dashboard=document.querySelector('.wrap');
      if(gate){gate.style.setProperty('display','none','important');gate.setAttribute('aria-hidden','true');}
      if(welcome){welcome.style.setProperty('display','none','important');welcome.setAttribute('aria-hidden','true');}
      if(dashboard){dashboard.style.setProperty('display','block','important');dashboard.style.setProperty('visibility','visible','important');}
      const waInput=document.getElementById('waPhone');
      if(waInput && !waInput.value && d.ownerPhone) waInput.value=d.ownerPhone;
    }
    const c=document.getElementById('connection');
    const isConn = (d.connection === 'Connected');
    c.textContent = isConn ? 'Connected ✅' : (d.connection === 'Connecting' ? 'Connecting ⏳' : 'Disconnected ❌');
    c.className = 'pill ' + (isConn ? 'green' : 'red');

    const connectPanel=document.getElementById('connectWhatsAppPanel');
    if(connectPanel) connectPanel.style.display = isConn ? 'none' : 'block';

    document.getElementById('bot').textContent=d.botActive?'ON ✅':'OFF ❌';
    document.getElementById('auto').textContent=d.autoReplyEnabled?'ON ✅':'OFF ❌';
    const identity=document.getElementById('waIdentity');
    if(isConn && (d.waProfileName || d.waPhoneNumber)){
      identity.style.display='block';
      document.getElementById('waProfileName').textContent='Linked Account: ' + (d.waProfileName || 'WhatsApp User');
      document.getElementById('waProfileNumber').textContent='Number: ' + (d.waPhoneNumber || d.ownerPhone || '');
      document.getElementById('waDeviceName').textContent=d.waDeviceName ? 'Device: ' + d.waDeviceName : 'Linked Companion Device';
    }else{
      identity.style.display='none';
    }
  }catch(e){
    document.getElementById('connection').textContent='Status unavailable';
  }
}

async function disconnectWhatsApp(){
  if(!confirm('Kya aap WhatsApp session disconnect aur unlink karna chahte hain?')) return;
  const msg=document.getElementById('pairMessage');
  const code=document.getElementById('pairCode');
  const inst=document.getElementById('pairInstructions');
  if(msg) msg.textContent='⏳ WhatsApp disconnect ho raha hai…';
  if(code) code.style.display='none';
  if(inst) inst.style.display='none';
  try{
    const r=await fetch('/api/whatsapp/disconnect',{method:'POST'});
    const d=await r.json();
    alert(d.message || 'WhatsApp session disconnected.');
    refreshStatus();
  }catch(e){
    alert('Disconnect failed: '+(e?.message||'error'));
  }
}

async function connectWhatsApp(force = false){
  let phone=document.getElementById("waPhone").value.trim().replace(/\\D/g,"");
  const msg=document.getElementById("pairMessage");
  const code=document.getElementById("pairCode");
  const inst=document.getElementById("pairInstructions");
  const btn1=document.getElementById("pairBtn");
  const btn2=document.getElementById("forcePairBtn");

  code.style.display="none";
  code.textContent="";
  if(inst) inst.style.display="none";

  if(phone.startsWith("00")) phone=phone.slice(2);
  if(phone.length===10) phone="91"+phone;
  if(phone.length===11 && phone.startsWith("0")) phone="91"+phone.slice(1);
  document.getElementById("waPhone").value=phone;

  if(!/^\\d{10,15}$/.test(phone)){
    msg.textContent="10 digit Indian mobile number ya country code ke saath number enter karein (example: 8115743185 ya 918115743185).";
    return;
  }

  msg.textContent=force ? "🔄 Session reset aur naya pairing code generate ho raha hai, kripya 3-5 second wait karein…" : "⏳ Pairing code generate ho raha hai, kripya 3-5 second wait karein…";
  if(btn1) btn1.disabled=true;
  if(btn2) btn2.disabled=true;

  try{
    const r=await fetch("/pair?phone="+encodeURIComponent(phone)+(force?"&force=true":""), {cache:"no-store"});
    const d=await r.json();
    if(!r.ok){
      msg.textContent="❌ "+(d.error||"WhatsApp connect nahi hua.");
      return;
    }
    if(d.pairingCode){
      code.textContent=d.pairingCode;
      code.style.display="block";
      if(inst) inst.style.display="block";
      msg.textContent="✅ Pairing code mil gaya! Apne phone WhatsApp me enter karein:";

      if(pairPollTimer) clearInterval(pairPollTimer);
      pairPollTimer=setInterval(async()=>{
        try{
          const st=await fetch('/api/status?refresh='+Date.now(),{cache:'no-store'});
          const std=await st.json();
          if(std.connection==='Connected'){
            clearInterval(pairPollTimer);
            pairPollTimer=null;
            code.style.display="none";
            if(inst) inst.style.display="none";
            msg.textContent="🎉 WhatsApp Successfully Connected!";
            refreshStatus();
          }
        }catch(_){}
      },3000);
    }else{
      msg.textContent=d.message||"WhatsApp session registered hai.";
      refreshStatus();
    }
  }catch(e){
    msg.textContent="❌ Server connection error: "+(e?.message||"Dobara try karein.");
  }finally{
    if(btn1) btn1.disabled=false;
    if(btn2) btn2.disabled=false;
  }
}

async function userLogout(){
  if(!confirm('Logout from AAIRA dashboard?')) return;
  try{
    await fetch('/api/auth/logout', { method: 'POST' });
  }catch(_){}
  location.reload();
}

async function toggleBot(action){const r=await fetch('/toggle?action='+action);const d=await r.json();alert(d.message||d.botStatus);refreshStatus()}
async function toggleAuto(action){const r=await fetch('/auto-reply?action='+action);const d=await r.json();alert(d.message||d.autoReply);refreshStatus()}

refreshStatus();loadDisplayName();

async function openLiveDashboard(){
  const wrap=document.querySelector('.wrap');
  for(const el of wrap.children){
    if(el.id==='liveChatPanel'){
      el.style.display='block';
    }else{
      el.style.display='none';
    }
  }
  document.getElementById('liveChatPanel').scrollIntoView({behavior:'smooth',block:'start'});
  try{
    const r=await fetch('/api/live-chat/history?t='+Date.now());
    const d=await r.json();
    if(d.success&&Array.isArray(d.items)){
      liveChatItems=d.items;
    }
  }catch(_){}
  renderLiveChats();
  connectLiveChat();
}
function backToMainDashboard(){const wrap=document.querySelector('.wrap');for(const el of wrap.children){el.style.display='';}document.getElementById('liveChatPanel').style.display='none';window.scrollTo({top:0,behavior:'smooth'})}

let liveChatSource=null,liveChatItems=[],selectedLiveJid=null;
function connectLiveChat(){
  if(liveChatSource)liveChatSource.close();
  liveChatSource=new EventSource('/api/live-chat/stream');
  liveChatSource.onopen=()=>document.getElementById('liveChatStatus').textContent='Live chat connected • Real-time synced';
  liveChatSource.onerror=()=>document.getElementById('liveChatStatus').textContent='Live chat connected • Auto-updating';
  liveChatSource.addEventListener('snapshot',e=>{
    liveChatItems=JSON.parse(e.data);
    renderLiveChats();
  });
  liveChatSource.addEventListener('message',e=>{
    const item=JSON.parse(e.data);
    liveChatItems.push(item);
    if(liveChatItems.length>1000)liveChatItems=liveChatItems.slice(-1000);
    renderLiveChats();
  });
}
function renderLiveChats(){
  const contacts=document.getElementById('liveChatContacts'),messages=document.getElementById('liveChatMessages');
  const validItems=liveChatItems.filter(x=>x&&x.text&&x.text!=='ℹ️ Message update');
  const jids=[...new Set(validItems.map(x=>x.jid))];

  if((!selectedLiveJid||!jids.includes(selectedLiveJid))&&jids.length>0){
    selectedLiveJid=jids[jids.length-1];
  }

  contacts.replaceChildren();
  if(!jids.length){
    const p=document.createElement('p');
    p.className='note';
    p.textContent='WhatsApp chats sync hone ka intezar hai';
    contacts.appendChild(p);
  }

  jids.forEach(jid=>{
    const item=[...validItems].reverse().find(x=>x.jid===jid);
    const b=document.createElement('button');
    const isSelected=(jid===selectedLiveJid);
    b.className='contact'+(isSelected?' active':'');
    b.style.cssText=isSelected?'background:#1f2937;border-color:#10b981':'';
    const phone=/^\\d{8,15}@s\\.whatsapp\\.net$/.test(jid)?jid.split('@')[0]:(/^\\d{8,15}$/.test(item?.phoneNumber||'')?item.phoneNumber:'');
    const label=(item?.contactName&&item.contactName!=='WhatsApp Contact')?item.contactName:(phone?'+'+phone:'WhatsApp Contact');
    b.textContent=phone?label+' ('+phone+')':label;
    b.onclick=()=>{selectedLiveJid=jid;renderLiveChats();};
    contacts.appendChild(b);
  });

  messages.replaceChildren();
  const selectedItem=[...validItems].reverse().find(x=>x.jid===selectedLiveJid);
  const selectedPhone=selectedItem?.phoneNumber||(selectedLiveJid?.endsWith('@s.whatsapp.net')?selectedLiveJid.split('@')[0]:'');
  const shown=validItems.filter(x=>{
    if(!x||!x.text)return false;
    if(x.jid===selectedLiveJid)return true;
    if(selectedPhone&&x.phoneNumber&&x.phoneNumber===selectedPhone)return true;
    return false;
  }).sort((a,b)=>a.timestamp-b.timestamp).slice(-100);

  if(!shown.length){
    const p=document.createElement('p');
    p.className='note';
    p.textContent=selectedLiveJid?'Is contact ka abhi koi message nahi hai':'Pehle kisi contact par click karein';
    messages.appendChild(p);
  }
  shown.forEach(x=>{
    const d=document.createElement('div');
    d.className='bubble '+(x.fromMe?'out':'in');
    if(x.fromMe){
      const tag=document.createElement('div');
      tag.className='bot-tag';
      tag.textContent='🤖 AAIRA (Bot)';
      d.appendChild(tag);
    }
    const body=document.createElement('div');
    body.textContent=x.text;
    d.appendChild(body);
    const time=document.createElement('div');
    time.className='message-time';
    const stamp=new Date(Number(x.timestamp)||Date.now());
    const timeStr=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:true}).format(stamp);
    time.textContent=timeStr+(x.fromMe?' ✓✓':'');
    d.appendChild(time);
    messages.appendChild(d);
  });
  messages.scrollTop=messages.scrollHeight;
}
async function sendLiveChatReply(){
  if(!selectedLiveJid){alert('Pehle contact select karein');return}
  const input=document.getElementById('liveChatReply'),text=input.value.trim();
  if(!text)return;
  try{
    const r=await fetch('/api/live-chat/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jid:selectedLiveJid,text})}),d=await r.json();
    if(!r.ok){alert(d.error||'Message send nahi hua');return}
    const currentItem=[...liveChatItems].reverse().find(x=>x.jid===selectedLiveJid);
    const currentPhone=currentItem?.phoneNumber||(selectedLiveJid?.endsWith('@s.whatsapp.net')?selectedLiveJid.split('@')[0]:'');
    liveChatItems.push({
      id:String(Date.now()),
      jid:selectedLiveJid,
      phoneNumber:currentPhone,
      text,
      fromMe:true,
      timestamp:Date.now()
    });
    input.value='';
    renderLiveChats();
  }catch(e){alert('Server connection failed')}
}
connectLiveChat();
</script>
</body></html>`;

const webSessions=new Map();
function getWebSession(req){
  const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('aaira_session='))?.slice(14);
  const session=token&&webSessions.get(token);
  if(session&&session.expiresAt>Date.now()) {
    session.phone = canonicalPhone(session.phone);
    return session;
  }
  if(token)webSessions.delete(token);
  return null;
}
function requireWebLogin(req,res,next){if(!getWebSession(req))return res.status(401).json({error:'Please login first.'});next();}
function createWebSession(phone,res){
  phone = canonicalPhone(phone);
  const token=require('crypto').randomBytes(32).toString('hex');
  webSessions.set(token,{phone,expiresAt:Date.now()+86400000});
  res.setHeader('Set-Cookie','aaira_session='+token+'; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400');
}

app.post('/api/auth/register',async(req,res)=>{
  try{
    const rawPhone=String(req.body.phone||'').replace(/\D/g,'');
    const password=String(req.body.password||'');
    if(!/^\d{10,15}$/.test(rawPhone)||!/\S{6,64}$/.test(password))return res.status(400).json({error:'Phone valid karein aur password 6 se 64 characters ka rakhein (spaces nahi).'});
    const phone=canonicalPhone(rawPhone);
    const result=await aairaAuth.register(phone,password);
    if(result!=='created')return res.status(409).json({error:'Account already exists. Login karein.'});
    res.json({success:true,message:'Registration successful! Ab aap turant login kar sakte hain.'});
  }catch(e){
    console.error('Register error:',e.message);
    res.status(500).json({error:'Account create nahi hua. Try again.'});
  }
});

app.post('/api/auth/login',async(req,res)=>{
  try{
    const rawPhone=String(req.body.phone||'').replace(/\D/g,'');
    const password=String(req.body.password||'');
    if(!/^\d{10,15}$/.test(rawPhone)||!/\S{6,64}$/.test(password))return res.status(400).json({error:'Phone/password format invalid. Password 6-64 characters ka hona chahiye (spaces nahi).'});
    const phone=canonicalPhone(rawPhone);
    const result=await aairaAuth.verify(phone,password);
    if(result!=='ok')return res.status(result==='pending'?403:result==='locked'?429:401).json({error:result==='pending'?'Account Pending Authorization hai. Admin approval ka wait karein.':result==='locked'?'5 galat password attempts ke baad account 15 minutes ke liye locked hai.':'Phone number ya password galat hai.'});
    createWebSession(phone,res);
    currentDashboardOwnerPhone=phone;
    res.json({success:true,phone,message:'Login successful.'});
  }catch(e){
    console.error('Login error:',e.message);
    res.status(500).json({error:'Login failed. Try again.'});
  }
});

app.post('/api/auth/logout',(req,res)=>{
  const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('aaira_session='))?.slice(14);
  if(token)webSessions.delete(token);
  res.setHeader('Set-Cookie','aaira_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  res.json({success:true,message:'Logged out successfully.'});
});

app.post('/api/auth/forgot',async(req,res)=>{
  try{
    const rawPhone=String(req.body.phone||'').replace(/\D/g,'');
    const password=String(req.body.password||'');
    if(!/^\d{10,15}$/.test(rawPhone)||!/\S{6,64}$/.test(password)||req.body.confirm!=='DELETE')return res.status(400).json({error:'Phone, password, and DELETE confirmation required.'});
    const phone=canonicalPhone(rawPhone);
    const verified=await aairaAuth.verify(phone,password);
    if(verified!=='ok')return res.status(401).json({error:verified==='locked'?'Account 15 minutes locked hai.':'Phone number ya password galat hai.'});
    const result=await aairaAuth.deleteAccount(phone);
    await cleanupAccountRuntime(phone);
    await aairaAuth.deleteWhatsAppSession(phone);
    await aairaAuth.deleteAccountSettings(phone);
    res.json({success:true,message:result==='deleted'?'Account and stored WhatsApp session data deleted. You can register again.':'Account not found for this number.'});
  }catch(e){
    console.error('Delete account error:',e.message);
    res.status(500).json({error:'Account data delete failed.'});
  }
});

app.get('/api/settings/display-name',requireWebLogin,async(req,res)=>{
  try{
    const session=getWebSession(req);
    const displayName=await aairaAuth.getDisplayName(session.phone);
    res.json({success:true,displayName});
  }catch(e){
    console.error('Get greeting name error:',e.message);
    res.status(500).json({error:'Greeting name load nahi hua.'});
  }
});

app.post('/api/settings/display-name',requireWebLogin,async(req,res)=>{
  try{
    const session=getWebSession(req);
    const displayName=String(req.body.displayName||'').trim();
    if(!displayName||displayName.length>40)return res.status(400).json({error:'Naam 1-40 characters ka hona chahiye.'});
    await aairaAuth.setDisplayName(session.phone,displayName);
    currentDashboardOwnerPhone=session.phone;
    res.json({success:true,message:'Greeting name save ho gaya! 💗'});
  }catch(e){
    console.error('Save greeting name error:',e.message);
    res.status(500).json({error:'Greeting name save nahi hua.'});
  }
});

app.get('/', (req, res) => res.type('html').send(dashboardHtml));

app.get('/api/live-chat/history',requireWebLogin,async(req,res)=>{
  try{
    const owner=canonicalPhone(getWebSession(req).phone);
    let b=liveChatBuffers.get(owner);
    if(!b||!b.length){
      b=await aairaAuth.loadLiveChatBuffer(owner);
      liveChatBuffers.set(owner,b||[]);
    }
    const cleaned=(b||[]).filter(x=>x&&x.text&&x.text!=='ℹ️ Message update');
    res.json({success:true,items:cleaned});
  }catch(e){
    console.error('[LIVE CHAT] History load failed:',e.message);
    res.status(500).json({error:'Live chat load failed'});
  }
});

app.get('/api/live-chat/stream',(req,res)=>{
  const session=getWebSession(req);
  if(!session)return res.status(401).end('Login required');
  const owner=session.phone;
  res.setHeader('Content-Type','text/event-stream');
  res.setHeader('Cache-Control','no-cache, no-transform');
  res.setHeader('Connection','keep-alive');
  res.flushHeaders?.();
  const send=(event,data)=>res.write('event: '+event+'\ndata: '+JSON.stringify(data)+'\n\n');
  send('snapshot',liveChatBuffers.get(owner)||[]);
  let listeners=liveChatListeners.get(owner);
  if(!listeners){listeners=new Set();liveChatListeners.set(owner,listeners)}
  const listener=item=>send('message',item);
  listeners.add(listener);
  const keepAlive=setInterval(()=>res.write(': keep-alive\n\n'),25000);
  req.on('close',()=>{clearInterval(keepAlive);listeners.delete(listener);if(!listeners.size)liveChatListeners.delete(owner)});
});

app.post('/api/live-chat/send',requireWebLogin,async(req,res)=>{
  const owner=getWebSession(req).phone,jid=String(req.body.jid||''),text=String(req.body.text||'').trim();
  if(!/^\d{8,20}@(s\.whatsapp\.net|lid)$/.test(jid))return res.status(400).json({error:'Contact address invalid.'});
  if(!text||text.length>4000)return res.status(400).json({error:'Message 1-4000 characters ka hona chahiye.'});
  const socket=accountSockets.get(owner);
  if(!socket||accountStatus.get(owner)!=='Connected')return res.status(503).json({error:'WhatsApp disconnected.'});
  try{
    const sent=await socket.sendMessage(jid,{text});
    publishLiveChat(owner,{id:sent?.key?.id,jid,text,fromMe:true,timestamp:Date.now()});
    res.json({success:true});
  }catch(e){
    console.error('[LIVE CHAT] Send failed:',e.message);
    res.status(500).json({error:'Message send failed.'});
  }
});

app.get('/api/support/my-tickets',requireWebLogin,async(req,res)=>{
  try{
    const owner=getWebSession(req).phone;
    const ticketsRes=await db.execute({sql:'SELECT id,ticket_ref,title,description,status,created_at,updated_at FROM aaira_support_tickets WHERE user_phone = ? ORDER BY created_at DESC',args:[owner]});
    const tickets=ticketsRes.rows;
    const result=[];
    for(const t of tickets||[]){
      const messagesRes=await db.execute({sql:'SELECT id,sender_role,message,created_at FROM aaira_support_messages WHERE ticket_id = ? ORDER BY created_at ASC',args:[t.id]});
      result.push({...t,messages:messagesRes.rows||[]});
    }
    res.set('Cache-Control','no-store');
    res.json({tickets:result});
  }catch(e){
    console.error('[AAIRA SUPPORT] User tickets load failed:',e.message);
    res.status(500).json({error:'Support replies load nahi hue.'});
  }
});

app.post('/api/support/message',requireWebLogin,async(req,res)=>{
  try{
    const owner=getWebSession(req).phone,message=String(req.body.message||'').trim();
    if(message.length<10||message.length>2000)return res.status(400).json({error:'Problem message kam se kam 10 aur adhiktam 2000 characters ka hona chahiye.'});
    const ticketRef='TCK-'+Date.now().toString(36).toUpperCase();
    const ticketInsert=await db.execute({sql:`INSERT INTO aaira_support_tickets (ticket_ref,user_phone,title,description,priority,status,created_at,updated_at) VALUES (?,?,'AAIRA Support Message',?,'medium','open',datetime('now'),datetime('now')) RETURNING id,ticket_ref`,args:[ticketRef,owner,message]});
    const ticket=ticketInsert.rows[0];
    await db.execute({sql:`INSERT INTO aaira_support_messages (ticket_id,sender_role,message,created_at) VALUES (?,'user',?,datetime('now'))`,args:[ticket.id,message]});
    res.status(201).json({success:true,message:'Support message sent.',ticket});
  }catch(e){
    console.error('[AAIRA SUPPORT] Message submit failed:',e.message);
    res.status(500).json({error:'Support message send nahi hua. Thodi der baad try karein.'});
  }
});

app.get('/api/status', requireWebLogin, async (req,res)=>{
  res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma','no-cache');
  try{
    const owner=canonicalPhone(getWebSession(req).phone);
    const settings=await aairaAuth.getBotSettings(owner);
    const socket=accountSockets.get(owner);
    const isReallyConnected = !!(socket && accountStatus.get(owner)==='Connected' && socket.authState?.creds?.registered && socket.authState?.creds?.account);
    const state=accountStatus.get(owner)||'Disconnected';
    const connection=isReallyConnected ? 'Connected' : (state==='Pairing'||state==='Connecting') ? 'Connecting' : 'Disconnected';
    const me=socket?.authState?.creds?.me||{};
    const waProfileName=String(me.name||me.notify||'').trim();
    const rawJid=String(me.id||'').split(':')[0];
    const waPhoneNumber=rawJid ? '+'+rawJid.replace('@s.whatsapp.net','') : '';
    const waDeviceName=String(socket?.user?.name||me.name||'').trim();
    res.json({
      success:true,
      connection,
      botActive:settings.botActive,
      autoReplyEnabled:settings.autoReplyEnabled,
      socketReady:!!socket,
      waProfileName: isReallyConnected ? waProfileName : '',
      waPhoneNumber: isReallyConnected ? waPhoneNumber : '',
      waDeviceName: isReallyConnected ? waDeviceName : '',
      ownerPhone:owner
    });
  }catch(e){
    res.status(500).json({error:'Status load failed'});
  }
});

app.post('/api/whatsapp/disconnect', requireWebLogin, async(req,res)=>{
  try{
    const owner=canonicalPhone(getWebSession(req).phone);
    console.log('[WA DISCONNECT] User requested full disconnect & reset for', owner);
    await cleanupAccountRuntime(owner);
    await aairaAuth.deleteWhatsAppSession(owner);
    await aairaAuth.releaseWhatsAppSessionLock(owner);
    await adminRouter.setWhatsAppStatus(owner, 'Disconnected');
    res.json({success:true, message:'WhatsApp session disconnected successfully. Ab aap fresh pairing code le sakte hain.'});
  }catch(e){
    console.error('[WA DISCONNECT] Failed:', e.message);
    res.status(500).json({error:'Disconnect failed: '+e.message});
  }
});

app.get('/toggle', requireWebLogin, async(req,res)=>{
  try{
    const owner=canonicalPhone(getWebSession(req).phone);
    const action=String(req.query.action||'').toLowerCase();
    if(!['on','off'].includes(action))return res.status(400).json({error:'Invalid action'});
    const value=action==='on';
    await aairaAuth.setBotSetting(owner,'botActive',value);
    res.json({success:true,message:value?'Bot is now ON ✅':'Bot is now OFF ❌',botStatus:value?'ON':'OFF'});
  }catch(e){
    console.error('Bot setting error:',e.message);
    res.status(500).json({error:'Bot setting save failed'});
  }
});

app.get('/auto-reply', requireWebLogin, async(req,res)=>{
  try{
    const owner=canonicalPhone(getWebSession(req).phone);
    const action=String(req.query.action||'').toLowerCase();
    if(!['on','off'].includes(action))return res.status(400).json({error:'Invalid action'});
    const value=action==='on';
    await aairaAuth.setBotSetting(owner,'autoReplyEnabled',value);
    res.json({success:true,message:value?'Auto-reply is now ON ✅':'Auto-reply is now OFF ❌',autoReply:value?'ON':'OFF'});
  }catch(e){
    console.error('Auto-reply setting error:',e.message);
    res.status(500).json({error:'Auto-reply setting save failed'});
  }
});

app.get('/pair', requireWebLogin, async(req,res)=>{
  const owner=canonicalPhone(getWebSession(req).phone);
  const phoneNumber=canonicalPhone(req.query.phone);
  const force = req.query.force === 'true' || req.query.force === '1';

  if(!/^\d{8,15}$/.test(phoneNumber))return res.status(400).json({error:'Valid phone number enter karein (e.g. 918115743185 ya 8115743185)'});
  if(phoneNumber!==owner)return res.status(403).json({error:`AAIRA account (${owner}) aur WhatsApp number (${phoneNumber}) same hone chahiye. Apne registered number ka WhatsApp connect karein.`});

  try{
    let socket=accountSockets.get(owner);
    const status=accountStatus.get(owner);

    if(!force && status==='Connected' && socket?.authState?.creds?.registered){
      return res.json({success:true,message:'WhatsApp session already connected and active ✅'});
    }

    console.log(`[PAIR] Generating fresh pairing code for ${owner} (force=${force}, prevStatus=${status})`);

    // Clean existing broken socket, locks, and session creds
    await cleanupAccountRuntime(owner);
    await aairaAuth.deleteWhatsAppSession(owner);
    await aairaAuth.releaseWhatsAppSessionLock(owner);

    // Launch clean socket for owner
    socket = await startAccountBot(owner);
    if(!socket){
      return res.status(503).json({error:'WhatsApp socket initialize nahi hua. Kripya refresh karke dobara try karein.'});
    }

    // Wait 2.5 - 3 seconds for WebSocket handshake with WhatsApp gateway
    res.setHeader('Cache-Control','no-store');
    await new Promise(resolve=>setTimeout(resolve,3000));

    socket=accountSockets.get(owner)||socket;
    let code=await socket.requestPairingCode(owner);
    code=code?.match(/.{1,4}/g)?.join('-')||code;
    if(!code)throw new Error('Empty pairing code received from WhatsApp');

    console.log(`[PAIR] Generated pairing code for ${owner}: ${code}`);
    res.json({success:true,pairingCode:code});
  }catch(err){
    console.error('[PAIR] Pairing error for',owner,err.message);
    res.status(500).json({error:'Pairing code generate nahi hua: '+String(err?.message||'Connection error').slice(0,120)});
  }
});

const { getChatReply } = require('./chatBank');
const { getGroqReply } = require('./groqAI');
const crypto = require('crypto');
const aairaAuth = require('./aairaAuth');
const greetedSenders = new Set();

// Multi-layer Bot Guard: prevents any two AAIRA bots from ever messaging or auto-replying to each other.
const BOT_WATERMARK = '\u200B'; // Zero-width space embedded in every bot message
const recentMessagesStore = new Map();
function storeMessage(id, message) {
  if (!id || !message) return;
  recentMessagesStore.set(id, message);
  if (recentMessagesStore.size > 2000) {
    const oldest = recentMessagesStore.keys().next().value;
    recentMessagesStore.delete(oldest);
  }
}

function isBotMessageContent(text) {
  if (!text || typeof text !== 'string') return false;
  if (text.includes(BOT_WATERMARK)) return true;
  const lower = text.toLowerCase().trim();
  if (lower.includes('offline assistant') && lower.includes('aaira')) return true;
  if (lower.includes('mera name aaira hai') || lower.includes('mera naam aaira hai')) return true;
  if (lower.includes('heyy! 💗 mai') || lower.includes('heyy! mai') || lower.includes('heyy! 💗')) return true;
  if (lower.startsWith('!ping') || lower.startsWith('!menu') || lower.startsWith('!help')) return true;
  return false;
}

const senderMessageTimestamps = new Map();
function isSenderLooping(senderKey) {
  const now = Date.now();
  let history = senderMessageTimestamps.get(senderKey) || [];
  history = history.filter(ts => now - ts < 30000); // 30 second sliding window
  if (history.length >= 4) {
    return true; // 4 or more messages in 30 seconds -> loop breaker!
  }
  history.push(now);
  senderMessageTimestamps.set(senderKey, history);
  return false;
}

const recentChatContexts = new Map(); // transient per-sender context in RAM only
const accountSockets = new Map();
const accountStatus = new Map();
const accountStarting = new Map();
const accountReconnectTimers = new Map();
const accountReconnectAttempts = new Map();
const accountLockTimers = new Map();
const instanceToken = crypto.randomBytes(24).toString('hex');

async function cleanupAccountRuntime(phone){
  phone=canonicalPhone(phone);
  const socket=accountSockets.get(phone);
  if(socket){try{socket.end(undefined);}catch(e){}}
  accountSockets.delete(phone);
  accountStatus.set(phone,'Disconnected');
  const reconnect=accountReconnectTimers.get(phone);
  if(reconnect){clearTimeout(reconnect);accountReconnectTimers.delete(phone);}
  const lockTimer=accountLockTimers.get(phone);
  if(lockTimer){clearInterval(lockTimer);accountLockTimers.delete(phone);}
  accountStarting.delete(phone);
  try{await aairaAuth.releaseWhatsAppSessionLock(phone);}catch(e){console.warn('[ACCOUNT DELETE] Lock release failed:',e.message);}
  liveChatBuffers.delete(phone);
  liveContactNames.delete(phone);
  liveWhatsAppNames.delete(phone);
  liveContactNumbers.delete(phone);
  liveChatListeners.delete(phone);
  for(const key of greetedSenders){if(key.startsWith(phone+':'))greetedSenders.delete(key);}
  for(const key of recentChatContexts.keys()){if(key.startsWith(phone+':'))recentChatContexts.delete(key);}
  await adminRouter.setWhatsAppStatus(phone,'Disconnected');
}
adminRouter.cleanupAccountRuntime=cleanupAccountRuntime;

async function startAccountBot(ownerPhone){
  ownerPhone=canonicalPhone(ownerPhone);
  if(!/^\d{10,20}$/.test(ownerPhone))throw new Error('Invalid account owner phone');
  if(accountStarting.has(ownerPhone))return accountStarting.get(ownerPhone);
  if(accountSockets.has(ownerPhone))return accountSockets.get(ownerPhone);
  const promise=(async()=>{
    let lock=false;
    for(let lockAttempt=0;lockAttempt<3;lockAttempt++){
      lock=await aairaAuth.claimWhatsAppSessionLock(ownerPhone,instanceToken,120);
      if(lock===true || lock==='claimed' || lock?.claimed===true)break;
      if(lockAttempt<2)await new Promise(resolve=>setTimeout(resolve,1000));
    }
    if(!lock){
      await aairaAuth.releaseWhatsAppSessionLock(ownerPhone);
      lock = await aairaAuth.claimWhatsAppSessionLock(ownerPhone, instanceToken, 120);
    }
    if(lock!==true && lock!=='claimed' && lock?.claimed!==true)throw new Error('WhatsApp account session lock could not be acquired');
    try{const savedChats=await aairaAuth.loadLiveChatBuffer(ownerPhone);liveChatBuffers.set(ownerPhone,savedChats.slice(-1000));}catch(e){console.error('[LIVE CHAT] Restore failed:',e.message);}
    const {state,saveCreds,clearAuthState}=await useSupabaseAuthState('account_'+ownerPhone);
    let waVersion;try{const live=await fetchLatestWaWebVersion();if(Array.isArray(live?.version)&&live.version.length===3)waVersion=live.version;}catch(e){console.warn('[WA] Version lookup:',e.message);}
    const socket=makeWASocket({
      ...(waVersion?{version:waVersion}:{}),
      auth:state,
      printQRInTerminal:false,
      logger:pino({level:'warn'}),
      connectTimeoutMs:60000,
      keepAliveIntervalMs:25000,
      syncFullHistory:false,
      browser:Browsers.ubuntu('Chrome'),
      getMessage: async (key) => {
        return recentMessagesStore.get(key.id) || undefined;
      }
    });
    const oldLockTimer=accountLockTimers.get(ownerPhone);if(oldLockTimer)clearInterval(oldLockTimer);
    const lockTimer=setInterval(()=>{aairaAuth.claimWhatsAppSessionLock(ownerPhone,instanceToken,120).then(ok=>{if(!ok){console.error('[WA] Session lock lost for account',ownerPhone);const active=accountSockets.get(ownerPhone);if(active===socket){accountSockets.delete(ownerPhone);accountStatus.set(ownerPhone,'Disconnected');adminRouter.setWhatsAppStatus(ownerPhone,'Disconnected');try{socket.end(undefined);}catch(e){}}}}).catch(e=>console.error('[WA] Session lock renewal failed:',e.message));},45000);
    accountLockTimers.set(ownerPhone,lockTimer);
    accountSockets.set(ownerPhone,socket);
    accountStatus.set(ownerPhone,'Connecting');
    adminRouter.setWhatsAppStatus(ownerPhone,'Connecting');

    // Persist WhatsApp credentials whenever Baileys updates them.
    socket.ev.on('creds.update',async()=>{
      try{
        await saveCreds();
        const isVerifiedLinked = !!(socket.authState?.creds?.registered && socket.authState?.creds?.account);
        if(isVerifiedLinked && accountStatus.get(ownerPhone) !== 'Connected'){
          accountStatus.set(ownerPhone,'Connected');
          adminRouter.setWhatsAppStatus(ownerPhone,'Connected');
          console.log('[WA] 🎉 Mobile pairing confirmed! Account now fully Connected:',ownerPhone);
        }
        console.log('[WA] Session credentials saved for account',ownerPhone);
      }catch(err){
        console.error('[WA] Session credentials save failed for account',ownerPhone,err.message);
      }
    });

    socket.ev.on('connection.update',async(update)=>{
      const {connection,lastDisconnect}=update;
      if(connection==='open'){
        accountReconnectAttempts.delete(ownerPhone);
        const pendingReconnect=accountReconnectTimers.get(ownerPhone);
        if(pendingReconnect){clearTimeout(pendingReconnect);accountReconnectTimers.delete(ownerPhone);}

        const isVerifiedLinked = !!(socket.authState?.creds?.registered && socket.authState?.creds?.account);
        if(isVerifiedLinked){
          accountStatus.set(ownerPhone,'Connected');
          adminRouter.setWhatsAppStatus(ownerPhone,'Connected');

          const myJid = socket.user?.id || '';
          const myLid = socket.authState?.creds?.me?.lid;
          console.log('[WA] Connected and verified account',ownerPhone,'LID:',myLid||'none');
        } else {
          accountStatus.set(ownerPhone,'Pairing');
          adminRouter.setWhatsAppStatus(ownerPhone,'Disconnected');
          console.log('[WA] Gateway open for pairing (awaiting user to enter code in phone):',ownerPhone);
        }
      }
      if(connection==='connecting'){
        accountStatus.set(ownerPhone,'Connecting');
        adminRouter.setWhatsAppStatus(ownerPhone,'Connecting');
      }
      if(connection==='close'){
        if(accountSockets.get(ownerPhone)!==socket)return;
        accountSockets.delete(ownerPhone);
        accountStatus.set(ownerPhone,'Disconnected');
        adminRouter.setWhatsAppStatus(ownerPhone,'Disconnected');
        const lockTimer=accountLockTimers.get(ownerPhone);
        if(lockTimer){clearInterval(lockTimer);accountLockTimers.delete(ownerPhone);}
        const statusCode=lastDisconnect?.error?.output?.statusCode;
        console.log('[WA] Closed account',ownerPhone,'statusCode:',statusCode);
        const isAuthInvalid=statusCode===DisconnectReason.loggedOut||statusCode===401||statusCode===403||statusCode===500||statusCode===411;
        if(isAuthInvalid){
          try{await clearAuthState();}catch(e){console.error('[WA] Clear auth failed:',e.message);}
          try{await aairaAuth.releaseWhatsAppSessionLock(ownerPhone);}catch(e){}
          console.log('[WA] Account logged out or auth invalid ('+statusCode+'); session cleared so user can pair again.');
        }else if(!accountReconnectTimers.has(ownerPhone)){
          const attempt=(accountReconnectAttempts.get(ownerPhone)||0)+1;
          accountReconnectAttempts.set(ownerPhone,attempt);
          const delay=Math.min(4000*Math.pow(2,Math.min(attempt-1,7)),300000);
          console.log('[WA] Reconnect scheduled for account',ownerPhone,'attempt',attempt,'in',Math.round(delay/1000),'seconds');
          const timer=setTimeout(()=>{
            accountReconnectTimers.delete(ownerPhone);
            startAccountBot(ownerPhone).catch(e=>console.error('[WA] Reconnect failed:',e.message));
          },delay);
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
        if(msg.key?.id)storeMessage(msg.key.id, msg.message);
        // Ignore WhatsApp Status broadcasts, newsletters/channels, and direct replies/reactions quoted from a Status.
        if(msg.key?.remoteJid==='status@broadcast'||msg.key?.remoteJidAlt==='status@broadcast'||msg.key?.remoteJid?.endsWith('@newsletter'))continue;
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
        if(liveJid&&liveJid!=='status@broadcast'&&!liveJid.endsWith('@g.us')&&!liveJid.endsWith('@newsletter')){const liveText=liveMessageText(msg.message).trim();if(liveText)publishLiveChat(ownerPhone,{id:msg.key.id,jid:liveJid,text:liveText,whatsappName:msg.pushName||msg.verifiedBizName||'',phoneNumber:liveJid?.endsWith('@s.whatsapp.net')?liveJid.split('@')[0]:'',fromMe:!!msg.key.fromMe,timestamp:msg.messageTimestamp?Number(msg.messageTimestamp)*1000:Date.now()})}
        if(msg.key.fromMe)continue;
        const sender=liveJid;if(!sender||sender==='status@broadcast'||sender.endsWith('@g.us')||sender.endsWith('@newsletter'))continue;

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

        console.log(`[WA MSG] [${ownerPhone}] From: ${sender} (remoteJid: ${msg.key.remoteJid}) | Text: "${textMessage.slice(0, 50)}"`);

        // Anti-Bot Layer 1: Drop any message containing AAIRA bot signatures or watermark
        if(isBotMessageContent(textMessage)){
          console.log(`[BOT-TO-BOT GUARD] Dropped automated bot message from ${sender} to account ${ownerPhone}`);
          continue;
        }

        // Anti-Bot Layer 2: Self message check
        const rawSenderPhone=canonicalPhone(sender.includes('@')?sender.split('@')[0]:sender);
        if(rawSenderPhone===ownerPhone){
          console.log(`[WA] Ignoring message from self account ${ownerPhone}`);
          continue;
        }

        // Anti-Bot Layer 3: Loop breaker - max 4 incoming messages in 30s per sender
        const loopKey=ownerPhone+':'+sender;
        if(isSenderLooping(loopKey)){
          console.warn(`[LOOP GUARD] Rate limit loop breaker active for ${sender} on account ${ownerPhone}. Skipping reply.`);
          continue;
        }
        const settings=await aairaAuth.getBotSettings(ownerPhone);
        if(!settings.botActive){
          console.log(`[WA] Bot is turned OFF for account ${ownerPhone}. Skipping reply.`);
          continue;
        }
        const rawDisplayName=await aairaAuth.getDisplayName(ownerPhone);
        const greetingName=String(rawDisplayName||'VIHUHUHU').trim().slice(0,50)||'VIHUHUHU';
        const targetSendJid=msg.key.remoteJid||sender;
        const phoneNum=sender?.endsWith('@s.whatsapp.net')?sender.split('@')[0]:(liveContactNumbers.get(ownerPhone)?.get(sender)||'');
        const send=async(text)=>{
          const taggedText=String(text||'').trim()+BOT_WATERMARK;
          const cleanText=String(text||'').trim();
          try{
            const sentMsg=await socket.sendMessage(targetSendJid,{text:taggedText});
            if(sentMsg?.key?.id)storeMessage(sentMsg.key.id,sentMsg.message);
            publishLiveChat(ownerPhone,{
              id:sentMsg?.key?.id||require('crypto').randomUUID(),
              jid:sender,
              phoneNumber:phoneNum,
              contactName:liveContactNames.get(ownerPhone)?.get(sender)||'',
              text:cleanText,
              fromMe:true,
              timestamp:Date.now()
            });
            return sentMsg;
          }catch(err){
            if(msg.key?.remoteJidAlt&&msg.key.remoteJidAlt!==targetSendJid){
              console.warn(`[WA SEND] Retrying to remoteJidAlt ${msg.key.remoteJidAlt}:`,err.message);
              const sentMsg=await socket.sendMessage(msg.key.remoteJidAlt,{text:taggedText});
              if(sentMsg?.key?.id)storeMessage(sentMsg.key.id,sentMsg.message);
              publishLiveChat(ownerPhone,{
                id:sentMsg?.key?.id||require('crypto').randomUUID(),
                jid:sender,
                phoneNumber:phoneNum,
                contactName:liveContactNames.get(ownerPhone)?.get(sender)||'',
                text:cleanText,
                fromMe:true,
                timestamp:Date.now()
              });
              return sentMsg;
            }
            throw err;
          }
        };

        const greetingKey=ownerPhone+':'+sender;
        const isFirstMessage=!greetedSenders.has(greetingKey);
        if(isFirstMessage){
          greetedSenders.add(greetingKey);
          await send('*Heyy! 💗 Mai '+greetingName+' ♥️ KA OFFLINE ASSISTANT 😴✨ AI HU MERA NAME AAIRA HAI*');
          console.log(`[WA] Sent welcome greeting to ${sender} on account ${ownerPhone}`);
        }

        if(!settings.autoReplyEnabled){
          console.log(`[WA] Auto-reply is turned OFF for account ${ownerPhone}. Skipping AI reply.`);
          continue;
        }
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
          try{replyText=getChatReply(textMessage,{history:chatHistory.slice(),displayName:greetingName});generatedBySavedModel=!!replyText;}
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
        if(replyText){
          console.log(`[WA] Sending AI reply to ${sender} on account ${ownerPhone}: "${replyText.slice(0, 40)}..."`);
          await send(replyText);
        }
      }catch(err){console.error('[WA] Message processing error:',err.message);}}
    });
    return socket;
  })();
  accountStarting.set(ownerPhone,promise);
  try{return await promise;}finally{accountStarting.delete(ownerPhone);}
}

async function resumeRegisteredAccounts(){
  try{
    const phones=await aairaAuth.listRegisteredPhones();
    console.log('[WA] Registered account sessions found:',phones.length);
    for(const phone of phones){
      startAccountBot(phone).catch(e=>console.error('[WA] Resume account failed:',phone,e.message));
    }
  }catch(e){
    console.error('[WA] Resume registered accounts failed:',e.message);
  }
}

server.listen(PORT,async ()=>{
  console.log(`Server is running on port ${PORT}`);
  try { await initDb(); } catch(e) { console.error('[DB] initDb failed:', e.message); }
  resumeRegisteredAccounts();
});
