const { db } = require('./db');
const bcrypt = require('bcryptjs');

async function register(phone, password) {
  const existing = await db.execute({
    sql: 'SELECT phone FROM aaira_user_credentials WHERE phone = ?',
    args: [phone]
  });
  if (existing.rows.length > 0) {
    return 'exists';
  }
  const hash = bcrypt.hashSync(password, 10);
  await db.execute({
    sql: `INSERT INTO aaira_user_credentials (phone, password_hash, password_plain, approved, created_at, updated_at)
          VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))`,
    args: [phone, hash, password]
  });
  await db.execute({
    sql: `INSERT OR IGNORE INTO aaira_account_settings (phone, bot_active, auto_reply_enabled, whatsapp_status, groq_ai_enabled, saved_model_enabled, display_name)
          VALUES (?, 1, 1, 'Disconnected', 1, 1, 'VIHUHUHU')`,
    args: [phone]
  });
  return 'created';
}

async function verify(phone, password) {
  // Check lockout
  const attemptRes = await db.execute({
    sql: 'SELECT attempts, locked_until FROM aaira_login_attempts WHERE phone = ?',
    args: [phone]
  });
  const attemptRow = attemptRes.rows[0];
  if (attemptRow && attemptRow.locked_until && new Date(attemptRow.locked_until) > new Date()) {
    return 'locked';
  }

  const userRes = await db.execute({
    sql: 'SELECT password_hash, approved FROM aaira_user_credentials WHERE phone = ?',
    args: [phone]
  });
  const user = userRes.rows[0];
  if (!user) {
    return 'invalid';
  }

  const match = bcrypt.compareSync(password, user.password_hash);
  if (!match) {
    const curAttempts = (Number(attemptRow?.attempts) || 0) + 1;
    let lockedUntil = null;
    if (curAttempts >= 5) {
      lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    }
    await db.execute({
      sql: `INSERT INTO aaira_login_attempts (phone, attempts, locked_until)
            VALUES (?, ?, ?)
            ON CONFLICT(phone) DO UPDATE SET attempts = excluded.attempts, locked_until = excluded.locked_until`,
      args: [phone, curAttempts, lockedUntil]
    });
    return curAttempts >= 5 ? 'locked' : 'invalid';
  }

  // Clear attempts on success
  await db.execute({
    sql: 'DELETE FROM aaira_login_attempts WHERE phone = ?',
    args: [phone]
  });

  const isApproved = user.approved !== 0 && user.approved !== false;
  if (!isApproved) {
    return 'pending';
  }
  return 'ok';
}

async function resetPassword(phone, password) {
  const hash = bcrypt.hashSync(password, 10);
  const res = await db.execute({
    sql: "UPDATE aaira_user_credentials SET password_hash = ?, password_plain = ?, updated_at = datetime('now') WHERE phone = ?",
    args: [hash, password, phone]
  });
  await db.execute({
    sql: 'DELETE FROM aaira_login_attempts WHERE phone = ?',
    args: [phone]
  });
  return res.rowsAffected > 0 ? 'reset' : 'not_found';
}

async function deleteAccount(phone) {
  const res = await db.execute({
    sql: 'DELETE FROM aaira_user_credentials WHERE phone = ?',
    args: [phone]
  });
  await db.execute({
    sql: 'DELETE FROM aaira_login_attempts WHERE phone = ?',
    args: [phone]
  });
  return res.rowsAffected > 0 ? 'deleted' : 'not_found';
}

async function deleteAccountSettings(phone) {
  await db.execute({
    sql: 'DELETE FROM aaira_account_settings WHERE phone = ?',
    args: [phone]
  });
}

async function loadLiveChatBuffer(phone) {
  const res = await db.execute({
    sql: "SELECT data FROM sessions WHERE session_id = ? AND key = 'live_chat_data'",
    args: ['account_' + phone]
  });
  let val = res.rows[0]?.data;
  if (typeof val === 'string') {
    try { val = JSON.parse(val); } catch { val = []; }
  }
  return Array.isArray(val) ? val : [];
}

async function saveLiveChatBuffer(phone, items) {
  await db.execute({
    sql: `INSERT INTO sessions (session_id, key, data) VALUES (?, 'live_chat_data', ?)
          ON CONFLICT(session_id, key) DO UPDATE SET data = excluded.data`,
    args: ['account_' + phone, JSON.stringify(Array.isArray(items) ? items : [])]
  });
}

async function deleteWhatsAppSession(phone) {
  await db.execute({
    sql: 'DELETE FROM sessions WHERE session_id = ?',
    args: ['account_' + phone]
  });
}

async function getDisplayName(phone) {
  const res = await db.execute({
    sql: 'SELECT display_name FROM aaira_account_settings WHERE phone = ?',
    args: [phone]
  });
  return res.rows[0]?.display_name || 'VIHUHUHU';
}

async function setDisplayName(phone, displayName) {
  await db.execute({
    sql: `INSERT INTO aaira_account_settings (phone, display_name, updated_at) VALUES (?, ?, datetime('now'))
          ON CONFLICT(phone) DO UPDATE SET display_name = excluded.display_name, updated_at = excluded.updated_at`,
    args: [phone, displayName]
  });
  return displayName;
}

async function getBotSettings(phone) {
  const res = await db.execute({
    sql: 'SELECT bot_active, auto_reply_enabled FROM aaira_account_settings WHERE phone = ?',
    args: [phone]
  });
  const row = res.rows[0];
  return {
    botActive: row ? (row.bot_active === 1 || row.bot_active === true) : true,
    autoReplyEnabled: row ? (row.auto_reply_enabled === 1 || row.auto_reply_enabled === true) : true
  };
}

async function getAISettings(phone) {
  const res = await db.execute({
    sql: 'SELECT groq_ai_enabled, saved_model_enabled FROM aaira_account_settings WHERE phone = ?',
    args: [phone]
  });
  const row = res.rows[0];
  return {
    groqAIEnabled: row ? (row.groq_ai_enabled === 1 || row.groq_ai_enabled === true) : true,
    savedModelEnabled: row ? (row.saved_model_enabled === 1 || row.saved_model_enabled === true) : true
  };
}

async function setBotSetting(phone, setting, value) {
  const col = setting === 'botActive' ? 'bot_active' : 'auto_reply_enabled';
  const valInt = value ? 1 : 0;
  await db.execute({
    sql: `INSERT INTO aaira_account_settings (phone, ${col}, updated_at) VALUES (?, ?, datetime('now'))
          ON CONFLICT(phone) DO UPDATE SET ${col} = excluded.${col}, updated_at = excluded.updated_at`,
    args: [phone, valInt]
  });
  return !!value;
}

async function listRegisteredPhones() {
  const res = await db.execute({
    sql: "SELECT session_id, data FROM sessions WHERE key = 'creds' AND session_id LIKE 'account_%'"
  });
  const phones = [];
  for (const row of res.rows || []) {
    const match = /^account_(\d{8,20})$/.exec(row.session_id || '');
    if (!match) continue;
    let creds = row.data;
    if (typeof creds === 'string') {
      try { creds = JSON.parse(creds); } catch { continue; }
    }
    if (creds?.registered === true || creds?.registered === 'true') {
      phones.push(match[1]);
    }
  }
  return [...new Set(phones)];
}

async function claimWhatsAppSessionLock(phone, ownerToken, leaseSeconds = 120) {
  const now = Date.now();
  const res = await db.execute({
    sql: 'SELECT instance_token, acquired_at FROM whatsapp_session_locks WHERE account_phone = ?',
    args: [phone]
  });
  const row = res.rows[0];
  if (!row || !row.instance_token || (now - Number(row.acquired_at || 0) > leaseSeconds * 1000) || row.instance_token === ownerToken) {
    await db.execute({
      sql: `INSERT INTO whatsapp_session_locks (account_phone, instance_token, acquired_at) VALUES (?, ?, ?)
            ON CONFLICT(account_phone) DO UPDATE SET instance_token = excluded.instance_token, acquired_at = excluded.acquired_at`,
      args: [phone, ownerToken, String(now)]
    });
    return true;
  }
  return false;
}

async function releaseWhatsAppSessionLock(phone, ownerToken) {
  await db.execute({
    sql: 'DELETE FROM whatsapp_session_locks WHERE account_phone = ? AND instance_token = ?',
    args: [phone, ownerToken]
  });
  return true;
}

module.exports = {
  register,
  verify,
  resetPassword,
  deleteAccount,
  deleteAccountSettings,
  getDisplayName,
  setDisplayName,
  getBotSettings,
  getAISettings,
  setBotSetting,
  claimWhatsAppSessionLock,
  releaseWhatsAppSessionLock,
  listRegisteredPhones,
  deleteWhatsAppSession,
  loadLiveChatBuffer,
  saveLiveChatBuffer
};
