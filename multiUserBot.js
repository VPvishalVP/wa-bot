const { default: makeWASocket, DisconnectReason } = require('@whiskeysockets/baileys');
const { useSupabaseAuthState } = require('./supabaseAuth');
const { getChatReply } = require('./chatBank');

// Each account owns one socket and one independent Supabase session namespace.
// Existing legacy bot_session is deliberately not read, modified, or migrated.
const users = new Map();

function getUser(phone) {
  if (!users.has(phone)) users.set(phone, { sock: null, status: 'Disconnected', botActive: true, autoReply: true, greeted: new Set(), starting: null });
  return users.get(phone);
}

async function startUser(phone) {
  const user = getUser(phone);
  if (user.sock && (user.status === 'Connected' || user.status === 'Connecting')) return user;
  if (user.starting) return user.starting;
  user.starting = (async () => {
    const { state, saveCreds } = await useSupabaseAuthState('aaira_user_' + phone);
    const sock = makeWASocket({
      auth: state, printQRInTerminal: false, connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000, browser: ['Ubuntu', 'Chrome', '20.0.04']
    });
    user.sock = sock;
    user.status = 'Connecting';
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
      if (connection === 'open') user.status = 'Connected';
      if (connection === 'connecting') user.status = 'Connecting';
      if (connection === 'close') {
        user.status = 'Disconnected';
        user.sock = null;
        const code = lastDisconnect?.error?.output?.statusCode;
        if (code !== DisconnectReason.loggedOut) {
          setTimeout(() => startUser(phone).catch(err => console.error('Account reconnect error:', err.message)), 3000);
        }
      }
    });
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify' || !user.botActive || !user.autoReply) return;
      for (const msg of messages) {
        try {
          if (!msg.message || msg.key.fromMe) continue;
          const jid = msg.key.remoteJid;
          if (!jid || jid === 'status@broadcast' || jid.endsWith('@g.us')) continue;
          const textMessage = (msg.message.conversation || msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || '').trim();
          if (!textMessage) continue;
          const send = text => sock.sendMessage(jid, { text });
          if (!user.greeted.has(jid)) {
            await send('*Heyy! 💗 Mai VIHUHUHU KA OFFLINE ASSISTANT 😴✨ AI HU MERA NAME AAIRA HAI*');
            user.greeted.add(jid);
          }
          let reply;
          try { reply = getChatReply(textMessage); } catch (err) { console.error('Reply engine error:', err.message); continue; }
          if (reply) await send(reply);
        } catch (err) { console.error('Account message processing error:', err.message); }
      }
    });
    return user;
  })();
  try { await user.starting; } finally { user.starting = null; }
  return user;
}

async function pairingCode(phone) {
  const user = await startUser(phone);
  if (!user.sock) throw new Error('WhatsApp socket not ready. Retry shortly.');
  if (user.sock.authState?.creds?.registered) return { alreadyRegistered: true };
  const code = await user.sock.requestPairingCode(phone);
  return { pairingCode: code?.match(/.{1,4}/g)?.join('-') || code };
}

function status(phone) {
  const u = getUser(phone);
  return { connection: u.status, botActive: u.botActive, autoReplyEnabled: u.autoReply, socketReady: !!u.sock };
}
function toggleBot(phone, value) { getUser(phone).botActive = value; return status(phone); }
function toggleAutoReply(phone, value) { getUser(phone).autoReply = value; return status(phone); }

module.exports = { startUser, pairingCode, status, toggleBot, toggleAutoReply };
