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
<body><section id="authGate" style="position:fixed;inset:0;z-index:99;background:#050505;display:flex;align-items:center;justify-content:center;padding:18px"><div class="panel" style="width:min(440px,100%);margin:0"><h2>🔐 AAIRA ACCOUNT</h2><p class="note">Mobile number aur 6-64 characters password se login karein ya account banayein.</p><label>Mobile number (country code ke saath)</label><input id="authPhone" inputmode="numeric" placeholder="919876543210"><label>Password (minimum 6 characters)</label><input id="authPassword" type="password" minlength="6" maxlength="64" placeholder="Password"><div class="row"><button onclick="authAction('login')">LOGIN</button><button onclick="authAction('register')">REGISTER</button></div><button onclick="forgotAccount()" style="width:100%">FORGOT PASSWORD? DELETE ACCOUNT DATA</button><p id="authMessage" class="note"></p></div></section><div class="wrap">
<header><div class="logo">AAIRA ✦</div><div class="subtitle">VIHUHUHU KA OFFLINE ASSISTANT</div></header>
<section class="panel">
<div class="status"><h2>WHATSAPP CONNECTION</h2><span id="connection" class="pill red">Disconnected</span></div>
<div class="status"><span>Bot Status</span><span id="bot" class="pill">Checking...</span></div>
<div class="status" style="margin-top:10px"><span>Auto Reply</span><span id="auto" class="pill">Checking...</span></div>
<div class="row" style="margin-top:15px"><button onclick="toggleBot('on')">BOT ON</button><button onclick="toggleBot('off')">BOT OFF</button></div>
<div class="row"><button onclick="toggleAuto('on')">AUTO-REPLY ON</button><button onclick="toggleAuto('off')">AUTO-REPLY OFF</button></div>
<button onclick="refreshStatus()" style="width:100%">↻ REFRESH STATUS</button><button onclick="logoutAccount()" style="width:100%">LOG OUT</button>
</section>
<section class="panel">
<h2>🔑 REFERENCE PAIRING CODE</h2>
<label for="phone">Your registered WhatsApp number (same as account)</label>
<input id="phone" inputmode="numeric" placeholder="Account number after login" readonly>
<button onclick="getPairCode()" style="width:100%">GENERATE PAIRING CODE</button>
<div id="pairCode" class="code">----</div>
<p class="note">Code milne par WhatsApp mein Linked Devices → Link a device → Link with phone number se enter karein. Number digits only, country code ke saath.</p>
</section>
<section class="panel" id="chatPanel">
<h2>💬 YOUR WHATSAPP CHATS</h2><p class="note">Only this logged-in account’s text messages are shown. Media content is not stored.</p><button onclick="loadChats()" style="width:100%">↻ LOAD CHATS</button><div id="chatList" class="note" style="margin-top:12px">Chats load here.</div><div id="chatThread" style="margin-top:12px"></div>
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
async function authAction(action){const phone=document.getElementById('authPhone').value.replace(/\\D/g,'');const password=document.getElementById('authPassword').value;const msg=document.getElementById('authMessage');if(!/^\\d{10,15}$/.test(phone)){msg.textContent='Valid phone number country code ke saath enter karein.';return}if(!/^\\S{6,64}$/.test(password)){msg.textContent='Password 6-64 characters ka hona chahiye (spaces allowed nahi).';return}try{const r=await fetch('/api/auth/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone,password})});const d=await r.json();msg.textContent=d.message||d.error||'Request complete';if(r.ok){document.getElementById('authGate').style.display='none';document.getElementById('phone').value=phone;document.getElementById('phone').readOnly=true;refreshStatus();}}catch(e){msg.textContent='Server connection failed.'}}
async function forgotAccount(){const phone=document.getElementById('authPhone').value.replace(/\\D/g,'');if(!/^\\d{10,15}$/.test(phone)){alert('Phone number country code ke saath enter karein.');return}if(prompt('Account data permanently delete karne ke liye DELETE type karein:')!=='DELETE')return;try{const r=await fetch('/api/auth/forgot',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone,confirm:'DELETE'})});const d=await r.json();document.getElementById('authMessage').textContent=d.message||d.error||'Done';}catch(e){document.getElementById('authMessage').textContent='Server connection failed.'}}
async function logoutAccount(){try{await fetch('/api/auth/logout',{method:'POST'});location.reload();}catch(e){alert('Logout failed')}}
async function loadChats(){const list=document.getElementById("chatList");const thread=document.getElementById("chatThread");list.textContent="Loading chats...";thread.textContent="";try{const r=await fetch("/api/chats");const d=await r.json();if(!r.ok)throw new Error(d.error||"Could not load chats");list.textContent="";if(!d.chats.length){list.textContent="No messages saved yet.";return}d.chats.forEach(chat=>{const btn=document.createElement("button");btn.style.width="100%";btn.textContent=chat.contact+" • "+chat.count+" messages • "+chat.lastMessage;btn.onclick=()=>loadThread(chat.jid);list.appendChild(btn)})}catch(e){list.textContent=e.message}}
async function loadThread(jid){const thread=document.getElementById("chatThread");thread.textContent="Loading conversation...";try{const r=await fetch("/api/chats/"+encodeURIComponent(jid));const d=await r.json();if(!r.ok)throw new Error(d.error||"Could not load conversation");thread.textContent="";const title=document.createElement("h3");title.textContent="Chat: "+d.contact;thread.appendChild(title);d.messages.forEach(m=>{const p=document.createElement("p");p.style.cssText="padding:10px;border:1px solid #555;border-radius:8px;white-space:pre-wrap";p.textContent=(m.direction==="out"?"AAIRA → ":"Contact → ")+m.text+"\n"+new Date(m.timestamp).toLocaleString();thread.appendChild(p)})}catch(e){thread.textContent=e.message}}
async function refreshStatus(){
 try{
  const r=await fetch('/api/status');const d=await r.json();
  const c=document.getElementById('connection');c.textContent=d.connection;
  c.className='pill '+(d.connection==='Connected'?'green':'red');
  document.getElementById('bot').textContent=d.botActive?'ON ✅':'OFF ❌';
  document.getElementById('auto').textContent=d.autoReplyEnabled?'ON ✅':'OFF ❌';document.getElementById('phone').value=d.accountPhone||'';
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
  const r=await fetch('/pair');const d=await r.json();
  box.textContent=d.pairingCode||d.message||d.error||'Could not generate code';
  if(!r.ok)alert(d.error||'Pairing code error');
 }catch(e){box.textContent='Request failed';alert('Server se connection nahi hua')}
}
refreshStatus();setInterval(refreshStatus,10000);
</script></body></html>`;

const webSessions=new Map();
const userSockets=new Map();
const userStatus=new Map();
const userSettings=new Map();
const userGreeted=new Map();
const userChatHistory=new Map();
function saveUserChat(phone,jid,direction,text){if(!text)return;let chats=userChatHistory.get(phone);if(!chats){chats=new Map();userChatHistory.set(phone,chats);}let messages=chats.get(jid);if(!messages){messages=[];chats.set(jid,messages);}messages.push({direction,text:String(text).slice(0,4000),timestamp:Date.now()});if(messages.length>300)messages.splice(0,messages.length-300);}
function settingsFor(phone){if(!userSettings.has(phone))userSettings.set(phone,{botActive:true,autoReplyEnabled:true});return userSettings.get(phone);}
function sessionIdFor(phone){return 'aaira_user_'+phone;}
function getWebSession(req){const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('aaira_session='))?.slice(14);const session=token&&webSessions.get(token);if(session&&session.expiresAt>Date.now())return session;if(token)webSessions.delete(token);return null;}
function requireWebLogin(req,res,next){const session=getWebSession(req);if(!session)return res.status(401).json({error:'Please login first.'});req.webSession=session;next();}
function createWebSession(phone,res){const token=crypto.randomBytes(32).toString('hex');webSessions.set(token,{phone,expiresAt:Date.now()+86400000});res.setHeader('Set-Cookie','aaira_session='+token+'; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400');}
app.post('/api/auth/register',async(req,res)=>{try{const phone=String(req.body.phone||'').replace(/\D/g,'');const password=String(req.body.password||'');if(!/^\d{10,15}$/.test(phone)||!/^\S{6,64}$/.test(password))return res.status(400).json({error:'Phone valid karein aur password 6 se 64 characters ka rakhein (spaces nahi).'});const result=await aairaAuth.register(phone,password);if(result!=='created')return res.status(409).json({error:'Account already exists. Login karein.'});createWebSession(phone,res);startUserBot(phone).catch(e=>console.error('User WhatsApp start failed:',e.message));res.json({success:true,message:'Account created, login successful.'});}catch(e){console.error('Register error:',e.message);res.status(500).json({error:'Account create nahi hua. Try again.'});}});
app.post('/api/auth/login',async(req,res)=>{try{const phone=String(req.body.phone||'').replace(/\D/g,'');const password=String(req.body.password||'');if(!/^\d{10,15}$/.test(phone)||!/^\S{6,64}$/.test(password))return res.status(400).json({error:'Phone/password format invalid. Password 6-64 characters ka hona chahiye (spaces nahi).'});const result=await aairaAuth.verify(phone,password);if(result!=='ok')return res.status(401).json({error:result==='locked'?'Account 15 minutes locked hai.':'Phone number ya password galat hai.'});createWebSession(phone,res);startUserBot(phone).catch(e=>console.error('User WhatsApp start failed:',e.message));res.json({success:true,message:'Login successful.'});}catch(e){console.error('Login error:',e.message);res.status(500).json({error:'Login failed. Try again.'});}});
app.post('/api/auth/logout',requireWebLogin,(req,res)=>{const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('aaira_session='))?.slice(14);if(token)webSessions.delete(token);res.setHeader('Set-Cookie','aaira_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');res.json({success:true,message:'Logged out.'});});
app.post('/api/auth/forgot',async(req,res)=>{try{const phone=String(req.body.phone||'').replace(/\D/g,'');if(!/^\d{10,15}$/.test(phone)||req.body.confirm!=='DELETE')return res.status(400).json({error:'Phone and DELETE confirmation required.'});const result=await aairaAuth.deleteAccount(phone);for(const [token,session] of webSessions){if(session.phone===phone)webSessions.delete(token);}res.json({success:true,message:result==='deleted'?'Stored account data deleted. You can register again.':'Account not found for this number.'});}catch(e){console.error('Delete account error:',e.message);res.status(500).json({error:'Account data delete failed.'});}});
app.get('/', (req, res) => res.type('html').send(dashboardHtml));

app.get('/api/status', requireWebLogin, (req, res) => {
  const phone=req.webSession.phone;const status=userStatus.get(phone)||'Disconnected';const settings=settingsFor(phone);const userSock=userSockets.get(phone);
  res.json({success:true,connection:status,botActive:settings.botActive,autoReplyEnabled:settings.autoReplyEnabled,socketReady:!!userSock,whatsappNumber:status==='Connected'?phone:null,accountPhone:phone,connectionLimit:1});
});

app.get("/api/chats",requireWebLogin,(req,res)=>{const chats=userChatHistory.get(req.webSession.phone)||new Map();const summaries=Array.from(chats.entries()).map(([jid,messages])=>({jid,contact:jid.split("@")[0],count:messages.length,lastMessage:messages[messages.length-1]?.text||"",lastTimestamp:messages[messages.length-1]?.timestamp||0})).sort((a,b)=>b.lastTimestamp-a.lastTimestamp);res.json({success:true,chats:summaries});});
app.get("/api/chats/:jid",requireWebLogin,(req,res)=>{let jid;try{jid=decodeURIComponent(req.params.jid);}catch{return res.status(400).json({error:"Invalid chat id."});}if(!/^\d+@s\.whatsapp\.net$/.test(jid))return res.status(400).json({error:"Invalid chat id."});const chats=userChatHistory.get(req.webSession.phone)||new Map();const messages=chats.get(jid);if(!messages)return res.status(404).json({error:"Chat not found for this account."});res.json({success:true,contact:jid.split("@")[0],messages});});
app.get('/toggle', requireWebLogin, (req, res) => {const settings=settingsFor(req.webSession.phone);const action=String(req.query.action||'').toLowerCase();if(action==='on')settings.botActive=true;else if(action==='off')settings.botActive=false;res.json({success:true,message:'Bot is now '+(settings.botActive?'ON ✅':'OFF ❌'),botStatus:settings.botActive?'ON':'OFF'});});

app.get('/auto-reply', requireWebLogin, (req, res) => {const settings=settingsFor(req.webSession.phone);const action=String(req.query.action||'').toLowerCase();if(action==='on')settings.autoReplyEnabled=true;else if(action==='off')settings.autoReplyEnabled=false;res.json({success:true,message:'Auto-reply is now '+(settings.autoReplyEnabled?'ON ✅':'OFF ❌'),autoReply:settings.autoReplyEnabled?'ON':'OFF'});});

app.get('/pair', requireWebLogin, async (req,res)=>{const phoneNumber=req.webSession.phone;const userSock=userSockets.get(phoneNumber);if(!userSock||!userSock.authState?.creds)return res.status(503).json({error:'Aapka personal WhatsApp socket ready nahi hai. Thodi der baad try karein.'});if(userSock.authState.creds.registered)return res.json({success:true,message:'Aapka registered WhatsApp pehle se connected hai.'});try{let code=await userSock.requestPairingCode(phoneNumber);code=code?.match(/.{1,4}/g)?.join('-')||code;res.json({success:true,pairingCode:code});}catch(err){console.error('User pairing error:',err.message);res.status(500).json({error:'Pairing code generate nahi hua. Number check karein.'});}});

const { getChatReply } = require('./chatBank');
const crypto = require('crypto');
const aairaAuth = require('./aairaAuth');
const greetedSenders = new Set();

async function startUserBot(phone){if(userSockets.has(phone))return userSockets.get(phone);const {state,saveCreds}=await useSupabaseAuthState(sessionIdFor(phone));const userSock=makeWASocket({auth:state,printQRInTerminal:false,connectTimeoutMs:60000,keepAliveIntervalMs:25000,browser:['Ubuntu','Chrome','20.0.04']});userSockets.set(phone,userSock);userStatus.set(phone,'Connecting');userSock.ev.on('creds.update',saveCreds);userSock.ev.on('connection.update',({connection,lastDisconnect})=>{if(connection==='open')userStatus.set(phone,'Connected');if(connection==='connecting')userStatus.set(phone,'Connecting');if(connection==='close'){userStatus.set(phone,'Disconnected');const code=lastDisconnect?.error?.output?.statusCode;if(code!==DisconnectReason.loggedOut)setTimeout(()=>{if(userSockets.get(phone)===userSock){userSockets.delete(phone);startUserBot(phone).catch(console.error);}},3000);else console.log('User session logged out for account ending '+phone.slice(-4));}});userSock.ev.on('messages.upsert',async({messages,type})=>{if(type!=='notify')return;for(const msg of messages){try{if(!msg.message||msg.key.fromMe)continue;const sender=msg.key.remoteJid;if(!sender||sender==='status@broadcast'||sender.endsWith('@g.us'))continue;const textMessage=(msg.message.conversation||msg.message.extendedTextMessage?.text||msg.message.imageMessage?.caption||msg.message.videoMessage?.caption||'').trim();if(textMessage)saveUserChat(phone,sender,"in",textMessage);const settings=settingsFor(phone);if(!textMessage||!settings.botActive||!settings.autoReplyEnabled)continue;const send=async text=>{await userSock.sendMessage(sender,{text});saveUserChat(phone,sender,"out",text)};let greeted=userGreeted.get(phone);if(!greeted){greeted=new Set();userGreeted.set(phone,greeted);}if(!greeted.has(sender)){await send('*Heyy! 💗 Mai VIHUHUHU KA OFFLINE ASSISTANT 😴✨ AI HU MERA NAME AAIRA HAI*');greeted.add(sender);}let replyText;try{replyText=getChatReply(textMessage);}catch(e){console.error('User chat reply failed:',e.message);continue;}if(replyText)await send(replyText);}catch(err){console.error('User message handler error:',err.message);}}});return userSock;}

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
