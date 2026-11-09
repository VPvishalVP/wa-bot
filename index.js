const express = require('express');
const { default: makeWASocket, DisconnectReason } = require('@whiskeysockets/baileys');
const { useSupabaseAuthState } = require('./supabaseAuth');
const http = require('http');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(express.json());

let sock = null;
let isBotActive = false;
let isAutoReplyEnabled = false;
let connectionStatus = 'Disconnected';

// WhatsApp sockets and bot settings are isolated per authenticated website account.

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
.liveBtn{width:100%;font-size:16px;padding:15px;background:#10251d;border-color:#36a879}.liveWrap{height:min(70vh,620px);min-height:400px;display:flex;border:1px solid #555;border-radius:12px;overflow:hidden;background:#101817}.liveSidebar{width:34%;min-width:110px;border-right:1px solid #444;overflow:auto}.liveMain{flex:1;display:flex;flex-direction:column;min-width:0}.liveTop{padding:10px;background:#18231f;border-bottom:1px solid #444}.liveList button{width:100%;margin:0;border:0;border-bottom:1px solid #333;border-radius:0;text-align:left;padding:12px 8px;overflow-wrap:anywhere}.liveMsgs{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:#0b1512}.liveMsg{max-width:90%;padding:9px 12px;border-radius:10px;background:#26332d;white-space:pre-wrap;overflow-wrap:anywhere}.liveMsg.mine{align-self:flex-end;background:#164d3a}.liveComposer{display:flex;gap:5px;padding:8px;background:#17221d}.liveComposer input{margin:0;min-width:0}.liveComposer button{margin:0}.liveNote{font-size:11px;color:#aaa;padding:7px}
</style>
</head>
<body><section id="authGate" style="position:fixed;inset:0;z-index:99;background:#050505;display:flex;align-items:center;justify-content:center;padding:18px"><div class="panel" style="width:min(440px,100%);margin:0"><h2>🔐 AAIRA ACCOUNT</h2><p class="note">Mobile number aur 6-64 characters password se login karein ya account banayein.</p><label>Mobile number (country code ke saath)</label><input id="authPhone" inputmode="numeric" placeholder="919876543210"><label>Password (minimum 6 characters)</label><input id="authPassword" type="password" minlength="6" maxlength="64" placeholder="Password"><div class="row"><button id="loginBtn" onclick="authAction('login')">LOGIN</button><button id="registerBtn" onclick="authAction('register')">REGISTER</button></div><button onclick="forgotAccount()" style="width:100%">FORGOT PASSWORD? DELETE ACCOUNT DATA</button><p id="authMessage" class="note"></p></div></section><div class="wrap">
<header><div class="logo">AAIRA ✦</div><div class="subtitle">VIHUHUHU KA OFFLINE ASSISTANT</div></header>
<section class="panel">
<div class="status"><h2>WHATSAPP CONNECTION</h2><span id="connection" class="pill red">Disconnected</span></div>
<div class="status"><span>Bot Status</span><span id="bot" class="pill">Checking...</span></div>
<div class="status" style="margin-top:10px"><span>Auto Reply</span><span id="auto" class="pill">Checking...</span></div>
<div class="row" style="margin-top:15px"><button onclick="toggleBot('on')">BOT ON</button><button onclick="toggleBot('off')">BOT OFF</button></div>
<div class="row"><button onclick="toggleAuto('on')">AUTO-REPLY ON</button><button onclick="toggleAuto('off')">AUTO-REPLY OFF</button></div>

</section>
<section class="panel">
<h2>💗 GREETING NAME CUSTOMIZATION</h2>
<label for="assistantName">Greeting mein aapka naam (har account ka alag)</label>
<input id="assistantName" maxlength="30" placeholder="VIHUHUHU">
<button onclick="saveAssistantName()" style="width:100%">SAVE GREETING NAME</button>
<p id="assistantNameMessage" class="note">Default naam: VIHUHUHU</p>
<p class="note">Yeh naam sirf aapke logged-in WhatsApp account ke greeting mein use hoga. AAIRA aur baaki message same rahenge.</p>
</section>
<section class="panel">
<h2>🔑 REFERENCE PAIRING CODE</h2>
<label for="phone">WhatsApp number (country code ke saath)</label>
<input id="phone" inputmode="numeric" placeholder="Example: 919876543210">
<button onclick="getPairCode()" style="width:100%">GENERATE PAIRING CODE</button>
<div id="pairCode" class="code">----</div>
<p class="note">Code milne par WhatsApp mein Linked Devices → Link a device → Link with phone number se enter karein. Number digits only, country code ke saath.</p>
</section>
<section class="panel" id="liveLauncher"><button class="liveBtn" onclick="openLiveWhatsApp()">💬 LIVE WHATSAPP</button><p class="note">Live chat view • Dashboard par history database mein save nahi hoti.</p></section>
<section class="panel" id="livePanel" style="display:none"><div class="status"><h2>💬 LIVE WHATSAPP</h2><button onclick="backFromLive()">← BACK</button></div><div class="liveWrap"><aside class="liveSidebar"><div class="liveTop">Chats (live)</div><div id="liveChatList" class="liveList"><p class="liveNote">Incoming chats yahan dikhenge.</p></div></aside><div class="liveMain"><div class="liveTop" id="liveChatTitle">Chat select karein</div><div class="liveMsgs" id="liveMessages"><div class="liveNote">Kisi chat ko select karein.</div></div><div class="liveComposer"><input id="liveMessageInput" placeholder="Message type karein..." autocomplete="off"><button onclick="sendLiveMessage()">SEND</button></div></div></div><p class="liveNote">⚠️ Ye screen live-only hai. Refresh/back karne par visible transcript clear; Supabase message-history table mein kuch save nahi hota. WhatsApp ke apne storage par messages rehte hain.</p></section>
<section class="panel">
<h2>📋 AAIRA MENU / STATUS</h2>
<pre>!ping  — Check bot reply
!menu  — Show commands
Welcome message — First message from each sender
AAIRA fixed assistant replies — common Hindi/Hinglish/English topics</pre>
<p class="note">Dashboard theme: Gothic Dark • Black & White • Silver glow</p>
</section>
<section class="panel" style="text-align:center"><button onclick="refreshStatus()" style="width:100%;font-size:16px;padding:15px">↻ REFRESH DASHBOARD STATUS</button><p class="note">Button dabane par connection, Bot Status aur Auto Reply status update honge.</p></section>
<footer>AAIRA • Gothic Dark Theme</footer>
</div>
<script>
(function(){
let busy=false;
function message(t,success){var m=document.getElementById('authMessage');if(!m)return;m.textContent=t;m.style.cssText='display:block;padding:12px;margin-top:12px;border:1px solid '+(success?'#55c58b':'#ff7777')+';border-radius:10px;background:'+(success?'#10251d':'#2a1010')+';color:'+(success?'#9fffc5':'#ffb3b3')+';font-size:14px;font-weight:bold;min-height:42px';
}
async function submit(action){
if(busy)return;
var rawPhone=(document.getElementById('authPhone').value||'').trim();
// Convert Unicode decimal digits (including Hindi numerals) to ASCII, then remove separators.
var phone=Array.from(rawPhone).map(function(ch){var cp=ch.codePointAt(0);var starts=[0x0660,0x06F0,0x0966,0x09E6,0x0A66,0x0AE6,0x0B66,0x0BE6,0x0C66,0x0CE6,0x0D66,0x0E50,0x0ED0,0x0F20,0x1040,0x17E0,0x1810,0xFF10];for(var s of starts){if(cp>=s&&cp<=s+9)return String(cp-s);}return ch;}).join('').replace(/[^0-9]/g,'');
var password=document.getElementById('authPassword').value||'';
// Accept a local Indian 10-digit mobile number, optional leading zero, or country code 91.
if(/^0[6-9][0-9]{9}$/.test(phone)){phone=phone.slice(1);}
if(/^[6-9][0-9]{9}$/.test(phone)){phone='91'+phone;}
if(phone.length<10||phone.length>15){message('Number mein '+phone.length+' digits detect hue. 10 digit Indian mobile ya +91 ke saath 12 digits daalein.');return;}
document.getElementById('authPhone').value=phone;
if(!/^[^\\s]{6,64}$/.test(password)){message('Password 6 se 64 characters ka rakhein; spaces allowed nahi hain.');return;}
busy=true;var l=document.getElementById('loginBtn'),rbtn=document.getElementById('registerBtn');l.disabled=true;rbtn.disabled=true;
var prevL=l.textContent,prevR=rbtn.textContent;l.textContent='PLEASE WAIT…';rbtn.textContent='PLEASE WAIT…';
message(action==='login'?'Login request bhej rahe hain…':'Register request bhej rahe hain…',true);
try{
var controller=new AbortController(),timer=setTimeout(function(){controller.abort()},30000);
var response;
try{response=await fetch('/api/auth/'+action,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',body:JSON.stringify({phone:phone,password:password}),signal:controller.signal});}
finally{clearTimeout(timer);}
var data={};try{data=await response.json()}catch(_){}
if(response.ok&&data.success){message(data.message||'Success! Dashboard load ho raha hai.',true);document.getElementById('authGate').style.display='none';if(typeof refreshStatus==='function')refreshStatus();if(typeof loadAssistantName==='function')loadAssistantName();}
else message('❌ '+(data.error||data.message||('Server response HTTP '+response.status)));
}catch(e){message(e.name==='AbortError'?'Server timeout (30 sec). Retry karein.':'Request fail: '+(e.message||'network error'));}
finally{busy=false;l.disabled=false;rbtn.disabled=false;l.textContent=prevL;rbtn.textContent=prevR;}
}
window.authAction=submit;
document.getElementById('loginBtn').removeAttribute('onclick');
document.getElementById('registerBtn').removeAttribute('onclick');
document.getElementById('loginBtn').addEventListener('click',function(e){e.preventDefault();submit('login')});
document.getElementById('registerBtn').addEventListener('click',function(e){e.preventDefault();submit('register')});
document.getElementById('authPhone').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();submit('login')}});
document.getElementById('authPassword').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();submit('login')}});
})();
</script>
<script>

async function forgotAccount(){const phone=document.getElementById('authPhone').value.replace(/\\D/g,'');if(!/^\\d{10,15}$/.test(phone)){alert('Phone number country code ke saath enter karein.');return}if(prompt('Account data permanently delete karne ke liye DELETE type karein:')!=='DELETE')return;try{const r=await fetch('/api/auth/forgot',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone,confirm:'DELETE'})});const d=await r.json();document.getElementById('authMessage').textContent=d.message||d.error||'Done';}catch(e){document.getElementById('authMessage').textContent='Server connection failed.'}}
async function loadAssistantName(){try{const r=await fetch('/api/assistant-name');const d=await r.json();if(r.ok){document.getElementById('assistantName').value=d.displayName||'VIHUHUHU';document.getElementById('assistantNameMessage').textContent='Saved naam: '+(d.displayName||'VIHUHUHU')}}catch(e){document.getElementById('assistantNameMessage').textContent='Naam load nahi hua.'}}
async function saveAssistantName(){const displayName=document.getElementById('assistantName').value.trim();const msg=document.getElementById('assistantNameMessage');if(!displayName||displayName.length>30){msg.textContent='Naam 1 se 30 characters ka rakhein.';return}try{const r=await fetch('/api/assistant-name',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({displayName})});const d=await r.json();msg.textContent=r.ok?'Saved! Greeting mein '+d.displayName+' bolega.':(d.error||'Save nahi hua.')}catch(e){msg.textContent='Server connection failed.'}}
async function refreshStatus(){try{const r=await fetch('/api/status');const d=await r.json();const c=document.getElementById('connection');c.textContent=d.connection;c.className='pill '+(d.connection==='Connected'?'green':'red');document.getElementById('bot').textContent=d.botActive?'ON ✅':'OFF ❌';document.getElementById('auto').textContent=d.autoReplyEnabled?'ON ✅':'OFF ❌';}catch(e){document.getElementById('connection').textContent='Status unavailable'}}
async function toggleBot(action){const r=await fetch('/toggle?action='+action);const d=await r.json();alert(d.message||d.botStatus);refreshStatus()}
async function toggleAuto(action){const r=await fetch('/auto-reply?action='+action);const d=await r.json();alert(d.message||d.autoReply);refreshStatus()}
let liveSelectedJid=null;let livePollTimer=null;let liveSnapshot=[];function openLiveWhatsApp(){document.getElementById('liveLauncher').style.display='none';document.getElementById('livePanel').style.display='block';liveSelectedJid=null;liveSnapshot=[];document.getElementById('liveMessages').innerHTML='<div class="liveNote">Live messages load ho rahe hain…</div>';refreshLiveChats();if(livePollTimer)clearInterval(livePollTimer);livePollTimer=setInterval(refreshLiveChats,2000)}function backFromLive(){if(livePollTimer)clearInterval(livePollTimer);livePollTimer=null;liveSelectedJid=null;liveSnapshot=[];document.getElementById('livePanel').style.display='none';document.getElementById('liveLauncher').style.display='block';document.getElementById('liveChatList').innerHTML='<p class="liveNote">Incoming chats yahan dikhenge.</p>';document.getElementById('liveMessages').innerHTML='<div class="liveNote">Kisi chat ko select karein.</div>';document.getElementById('liveChatTitle').textContent='Chat select karein';document.getElementById('liveMessageInput').value=''}function escLive(v){return String(v||'').replace(/[&<>"\']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}async function refreshLiveChats(){try{const r=await fetch('/api/live-chats');if(!r.ok)return;const d=await r.json();liveSnapshot=d.chats||[];const list=document.getElementById('liveChatList');list.innerHTML=liveSnapshot.length?liveSnapshot.map(c=>'<button onclick="selectLiveChat(\''+escLive(c.jid)+'\')"><b>'+escLive(c.name)+'</b><div class="liveNote">'+escLive((c.messages||[]).slice(-1)[0]?.text||'')+'</div></button>').join(''):'<p class="liveNote">Abhi live incoming chat nahi aayi.</p>';if(liveSelectedJid){const c=liveSnapshot.find(x=>x.jid===liveSelectedJid);if(c)renderLiveMessages(c)}}catch(e){}}function selectLiveChat(jid){liveSelectedJid=jid;const c=liveSnapshot.find(x=>x.jid===jid);if(c)renderLiveMessages(c)}function renderLiveMessages(c){document.getElementById('liveChatTitle').textContent=c.name||c.jid;const box=document.getElementById('liveMessages');box.innerHTML=(c.messages||[]).map(m=>'<div class="liveMsg '+(m.fromMe?'mine':'')+'">'+escLive(m.text)+'</div>').join('');box.scrollTop=box.scrollHeight}async function sendLiveMessage(){const input=document.getElementById('liveMessageInput');const message=input.value.trim();if(!liveSelectedJid){alert('Pehle chat select karein.');return}if(!message)return;input.value='';try{const r=await fetch('/api/live-send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jid:liveSelectedJid,message})});const d=await r.json();if(!r.ok){alert(d.error||'Message send nahi hua');input.value=message;return}await refreshLiveChats()}catch(e){alert('Server connection nahi hua');input.value=message}}document.getElementById('liveMessageInput').addEventListener('keydown',e=>{if(e.key==='Enter')sendLiveMessage()});
async function getPairCode(){const phone=document.getElementById('phone').value.replace(/\\D/g,'');const box=document.getElementById('pairCode');if(!phone){alert('WhatsApp number enter karein');return}box.textContent='Generating...';try{const r=await fetch('/pair?phone='+encodeURIComponent(phone));const d=await r.json();box.textContent=d.pairingCode||d.message||d.error||'Could not generate code';if(!r.ok)alert(d.error||'Pairing code error')}catch(e){box.textContent='Request failed';alert('Server se connection nahi hua')}}
fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'}).then(r=>{if(r.ok){document.getElementById('authGate').style.display='none';refreshStatus();loadAssistantName();}}).catch(()=>{});
</script></body></html>`;

const webSessions=new Map();
function getWebSession(req){const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('aaira_session='))?.slice(14);const session=token&&webSessions.get(token);if(session&&session.expiresAt>Date.now())return session;if(token)webSessions.delete(token);return null;}
function requireWebLogin(req,res,next){if(!getWebSession(req))return res.status(401).json({error:'Please login first.'});next();}
function createWebSession(phone,res){const token=crypto.randomBytes(32).toString('hex');webSessions.set(token,{phone,expiresAt:Date.now()+86400000});res.setHeader('Set-Cookie','aaira_session='+token+'; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400');}
app.post('/api/auth/register',async(req,res)=>{try{const phone=String(req.body.phone||'').replace(/\D/g,'');const password=String(req.body.password||'');if(!/^\d{10,15}$/.test(phone)||!/^[^\s]{6,64}$/.test(password))return res.status(400).json({error:'Phone valid karein aur password 6-64 characters ka (spaces ke bina) rakhein.'});const result=await aairaAuth.register(phone,password);if(result!=='created')return res.status(409).json({error:'Account already exists. Login karein.'});createWebSession(phone,res);startAccountBot(phone).catch(err=>console.error('Account bot start failed:',err));res.json({success:true,message:'Account created, login successful.'});}catch(e){console.error('Register error:',e.message);res.status(500).json({error:'Account create nahi hua. Try again.'});}});
app.post('/api/auth/login',async(req,res)=>{try{const phone=String(req.body.phone||'').replace(/\D/g,'');const password=String(req.body.password||'');if(!/^\d{10,15}$/.test(phone)||!/^[^\s]{6,64}$/.test(password))return res.status(400).json({error:'Phone/password format invalid. Password 6-64 characters ka (spaces ke bina) rakhein.'});const result=await aairaAuth.verify(phone,password);if(result!=='ok')return res.status(401).json({error:result==='locked'?'Account 15 minutes locked hai.':'Phone number ya password galat hai.'});createWebSession(phone,res);startAccountBot(phone).catch(err=>console.error('Account bot start failed:',err));res.json({success:true,message:'Login successful.'});}catch(e){console.error('Login error:',e.message);res.status(500).json({error:'Login failed. Try again.'});}});
app.post('/api/auth/forgot',async(req,res)=>{try{const phone=String(req.body.phone||'').replace(/\D/g,'');if(!/^\d{10,15}$/.test(phone)||req.body.confirm!=='DELETE')return res.status(400).json({error:'Phone and DELETE confirmation required.'});const result=await aairaAuth.deleteAccount(phone);for(const [token,session] of webSessions){if(session.phone===phone)webSessions.delete(token);}res.json({success:true,message:result==='deleted'?'Stored account data deleted. You can register again.':'Account not found for this number.'});}catch(e){console.error('Delete account error:',e.message);res.status(500).json({error:'Account data delete failed.'});}});
app.get('/api/auth/me', (req, res) => { const session = getWebSession(req); if (!session) return res.status(401).json({ success: false }); res.setHeader('Cache-Control', 'no-store'); res.json({ success: true }); });
app.get('/', (req, res) => res.type('html').send(dashboardHtml));

const { getChatReply } = require('./chatBank');
const crypto = require('crypto');
const aairaAuth = require('./aairaAuth');

const accountBots = new Map();
const reconnectTimers = new Map();
const reconnectAttempts = new Map();

function getAccountBot(req) {
  const session = getWebSession(req);
  if (!session) return null;
  return accountBots.get(session.phone) || null;
}

async function startAccountBot(accountPhone, ownerToken = crypto.randomUUID()) {
  if (accountBots.has(accountPhone)) return accountBots.get(accountPhone);
  const bot = {
    ownerToken,
    leaseTimer: null,
    sock: null,
    connectionStatus: 'Connecting',
    botActive: true,
    autoReplyEnabled: true,
    greetedSenders: new Set(),
    liveChats: new Map(),
    displayName: 'VIHUHUHU'
  };
  accountBots.set(accountPhone, bot);

  try {
    const lockClaimed = await aairaAuth.claimWhatsAppSessionLock(accountPhone, bot.ownerToken, 120);
    if (!lockClaimed) {
      bot.connectionStatus = 'Session active elsewhere';
      console.warn('WhatsApp session lock held by another instance for account:', accountPhone);
      const retryTimer = setTimeout(() => {
        reconnectTimers.delete(accountPhone);
        if (accountBots.get(accountPhone) === bot) accountBots.delete(accountPhone);
        startAccountBot(accountPhone, bot.ownerToken).catch(err => console.error('Session lock retry failed:', err.message));
      }, 30000);
      reconnectTimers.set(accountPhone, retryTimer);
      return bot;
    }

    bot.leaseTimer = setInterval(() => {
      aairaAuth.claimWhatsAppSessionLock(accountPhone, bot.ownerToken, 120)
        .then(ok => { if (!ok) console.error('WhatsApp session lease renewal rejected for account:', accountPhone); })
        .catch(err => console.error('WhatsApp session lease renewal failed:', err.message));
    }, 30000);

    const savedSettings = await aairaAuth.getBotSettings(accountPhone);
    bot.botActive = savedSettings.botActive;
    bot.autoReplyEnabled = savedSettings.autoReplyEnabled;
    bot.displayName = await aairaAuth.getDisplayName(accountPhone);
    const { state, saveCreds } = await useSupabaseAuthState('account_' + accountPhone);
    const socket = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
    });
    bot.sock = socket;
    socket.ev.on('creds.update', saveCreds);
    socket.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === 'open') {
        bot.connectionStatus = 'Connected';
        reconnectAttempts.delete(accountPhone);
        console.log('WhatsApp connected for account:', accountPhone);
      } else if (connection === 'connecting') {
        bot.connectionStatus = 'Connecting';
      } else if (connection === 'close') {
        bot.connectionStatus = 'Disconnected';
        if (bot.leaseTimer) { clearInterval(bot.leaseTimer); bot.leaseTimer = null; }
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        console.log('WhatsApp closed for account:', accountPhone, statusCode);

        if (statusCode === DisconnectReason.loggedOut) {
          aairaAuth.releaseWhatsAppSessionLock(accountPhone, bot.ownerToken)
            .catch(err => console.error('Session lock release failed:', err.message));
        }

        // Ignore stale socket close events and prevent reconnect storms.
        if (accountBots.get(accountPhone) === bot &&
            statusCode !== DisconnectReason.loggedOut &&
            !reconnectTimers.has(accountPhone)) {
          const attempt = (reconnectAttempts.get(accountPhone) || 0) + 1;
          reconnectAttempts.set(accountPhone, attempt);
          const isConflict = statusCode === DisconnectReason.connectionReplaced || statusCode === 440;
          const delayMs = isConflict
            ? 60000
            : Math.min(5000 * (2 ** Math.min(attempt - 1, 4)), 60000);
          console.log('WhatsApp reconnect scheduled for account:', accountPhone,
            'in', Math.round(delayMs / 1000), 'seconds (attempt', attempt + ')');

          const timer = setTimeout(() => {
            reconnectTimers.delete(accountPhone);
            if (accountBots.get(accountPhone) === bot) accountBots.delete(accountPhone);
            startAccountBot(accountPhone, bot.ownerToken).catch((err) => {
              console.error('WhatsApp reconnect failed for account:', accountPhone, err);
            });
          }, delayMs);
          reconnectTimers.set(accountPhone, timer);
        }
      }
    });

    socket.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        try {
          if (!msg.message) continue;
          const sender = msg.key.remoteJid;
          if (!sender || sender === 'status@broadcast' || sender.endsWith('@g.us')) continue;
          const textMessage = (msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || '').trim();
          if (textMessage) { let chat=bot.liveChats.get(sender); if(!chat){chat={jid:sender,name:msg.pushName||sender.split('@')[0],messages:[]};bot.liveChats.set(sender,chat)} if(msg.pushName)chat.name=msg.pushName; chat.messages.push({text:textMessage,fromMe:!!msg.key.fromMe,at:Date.now()}); if(chat.messages.length>100)chat.messages.splice(0,chat.messages.length-100); }
          if (msg.key.fromMe || !textMessage || !bot.botActive || !bot.autoReplyEnabled) continue;
          const send = (text) => socket.sendMessage(sender, { text });
          if (!bot.greetedSenders.has(sender)) {
            await send('*Heyy! 💗 Mai ' + bot.displayName + ' KA OFFLINE ASSISTANT 😴✨ AI HU MERA NAME AAIRA HAI*');
            bot.greetedSenders.add(sender);
          }
          const replyText = getChatReply(textMessage);
          if (replyText) await send(replyText);
        } catch (err) {
          console.error('Error processing message for account:', accountPhone, err);
        }
      }
    });
    return bot;
  } catch (err) {
    if (bot.leaseTimer) clearInterval(bot.leaseTimer);
    await aairaAuth.releaseWhatsAppSessionLock(accountPhone, bot.ownerToken).catch(() => {});
    if (accountBots.get(accountPhone) === bot) accountBots.delete(accountPhone);
    throw err;
  }
}

app.get('/api/live-chats', requireWebLogin, (req,res)=>{const bot=getAccountBot(req);if(!bot||!bot.sock||bot.connectionStatus!=='Connected')return res.status(503).json({error:'WhatsApp connected nahi hai.'});res.setHeader('Cache-Control','no-store');res.json({success:true,chats:Array.from(bot.liveChats.values()).map(c=>({jid:c.jid,name:c.name,messages:c.messages}))});});
app.post('/api/live-send', requireWebLogin, async (req,res)=>{const bot=getAccountBot(req);const jid=String(req.body.jid||'');const message=String(req.body.message||'').trim();if(!bot||!bot.sock||bot.connectionStatus!=='Connected')return res.status(503).json({error:'WhatsApp connected nahi hai.'});if(!/^\d{8,20}@s\.whatsapp\.net$/.test(jid))return res.status(400).json({error:'Valid personal chat select karein.'});if(!message||message.length>4000)return res.status(400).json({error:'Message 1-4000 characters ka rakhein.'});try{await bot.sock.sendMessage(jid,{text:message});let chat=bot.liveChats.get(jid);if(!chat){chat={jid,name:jid.split('@')[0],messages:[]};bot.liveChats.set(jid,chat)}chat.messages.push({text:message,fromMe:true,at:Date.now()});if(chat.messages.length>100)chat.messages.splice(0,chat.messages.length-100);res.json({success:true});}catch(e){console.error('Live dashboard send failed:',e.message);res.status(500).json({error:'Message send nahi hua.'});}});

app.get('/api/assistant-name', requireWebLogin, async (req, res) => {
  try {
    const session = getWebSession(req);
    const displayName = await aairaAuth.getDisplayName(session.phone);
    const bot = getAccountBot(req);
    if (bot) bot.displayName = displayName;
    res.json({ success: true, displayName });
  } catch (e) {
    console.error('Load greeting name error:', e.message);
    res.status(500).json({ error: 'Greeting name load nahi hua.' });
  }
});

app.put('/api/assistant-name', requireWebLogin, async (req, res) => {
  try {
    const session = getWebSession(req);
    const displayName = String(req.body.displayName || '').trim().toUpperCase();
    if (!displayName || displayName.length > 30) {
      return res.status(400).json({ error: 'Naam 1 se 30 characters ka rakhein.' });
    }
    await aairaAuth.setDisplayName(session.phone, displayName);
    const bot = getAccountBot(req);
    if (bot) bot.displayName = displayName;
    res.json({ success: true, displayName });
  } catch (e) {
    console.error('Save greeting name error:', e.message);
    res.status(500).json({ error: 'Greeting name save nahi hua.' });
  }
});

app.get('/api/status', requireWebLogin, (req, res) => {
  const bot = getAccountBot(req);
  res.json({
    success: true,
    connection: bot?.connectionStatus || 'Disconnected',
    botActive: !!bot?.botActive,
    autoReplyEnabled: !!bot?.autoReplyEnabled,
    socketReady: !!bot?.sock
  });
});

app.get('/toggle', requireWebLogin, async (req, res) => {
  const bot = getAccountBot(req);
  if (!bot) return res.status(503).json({ error: 'WhatsApp bot session is not initialized yet.' });
  const action = String(req.query.action || '').toLowerCase();
  if (action === 'on' || action === 'off') { try { const value = action === 'on'; await aairaAuth.setBotSetting(getWebSession(req).phone, 'botActive', value); bot.botActive = value; return res.json({ success: true, message: value ? 'Bot is now ON ✅' : 'Bot is now OFF ❌', botStatus: value ? 'ON' : 'OFF' }); } catch (e) { console.error('Save bot status error:', e.message); return res.status(500).json({ error: 'Bot status save nahi hua.' }); } }
  res.json({ success: true, botStatus: bot.botActive ? 'ON' : 'OFF' });
});

app.get('/auto-reply', requireWebLogin, async (req, res) => {
  const bot = getAccountBot(req);
  if (!bot) return res.status(503).json({ error: 'WhatsApp bot session is not initialized yet.' });
  const action = String(req.query.action || '').toLowerCase();
  if (action === 'on' || action === 'off') { try { const value = action === 'on'; await aairaAuth.setBotSetting(getWebSession(req).phone, 'autoReplyEnabled', value); bot.autoReplyEnabled = value; return res.json({ success: true, message: value ? 'Auto-reply is now ON ✅' : 'Auto-reply is now OFF ❌', autoReply: value ? 'ON' : 'OFF' }); } catch (e) { console.error('Save auto-reply status error:', e.message); return res.status(500).json({ error: 'Auto-reply status save nahi hua.' }); } }
  res.json({ success: true, autoReply: bot.autoReplyEnabled ? 'ON' : 'OFF' });
});

app.get('/pair', requireWebLogin, async (req, res) => {
  const session = getWebSession(req);
  const phoneNumber = String(req.query.phone || '').replace(/[^0-9]/g, '');
  if (!phoneNumber) return res.status(400).json({ error: 'Phone number required with country code, e.g. 919876543210' });
  try {
    const bot = await startAccountBot(session.phone);
    if (!bot.sock || !bot.sock.authState?.creds) return res.status(503).json({ error: 'WhatsApp socket is not ready yet. Wait and try again.' });
    if (bot.sock.authState.creds.registered) return res.json({ success: true, message: 'WhatsApp session already registered.' });
    let code = await bot.sock.requestPairingCode(phoneNumber);
    code = code?.match(/.{1,4}/g)?.join('-') || code;
    res.json({ success: true, pairingCode: code });
  } catch (err) {
    console.error('Pairing Error:', err);
    res.status(500).json({ error: 'Failed to generate code. Check number and try again.' });
  }
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  // Resume persisted WhatsApp accounts after Render process restart without requiring dashboard login.
  aairaAuth.listRegisteredPhones()
    .then(phones => {
      console.log('Auto-resume checking registered WhatsApp accounts:', phones.length);
      for (const phone of phones) {
        startAccountBot(phone).catch(err => console.error('WhatsApp auto-resume failed for account:', phone, err.message));
      }
    })
    .catch(err => console.error('WhatsApp auto-resume account list failed:', err.message));
});
