const { db, getUserDb, initUserDb, deleteUserDb, canonicalPhone } = require('./db');
const bcrypt = require('bcryptjs');

async function register(phone, password) {
  const cPhone = canonicalPhone(phone);
  const p10 = (cPhone.length === 12 && cPhone.startsWith('91')) ? cPhone.slice(2) : cPhone;
  const existing = await db.execute({
    sql: 'SELECT phone FROM aaira_user_credentials WHERE phone = ? OR phone = ?',
    args: [cPhone, p10]
  });
  if (existing.rows.length > 0) {
    return 'exists';
  }
  const hash = bcrypt.hashSync(password, 10);
  await db.execute({
    sql: `INSERT INTO aaira_user_credentials (phone, password_hash, password_plain, approved, created_at, updated_at)
          VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))`,
    args: [cPhone, hash, password]
  });
  await db.execute({
    sql: `INSERT OR IGNORE INTO aaira_account_settings (phone, bot_active, auto_reply_enabled, whatsapp_status, groq_ai_enabled, saved_model_enabled, display_name)
          VALUES (?, 1, 1, 'Disconnected', 1, 1, 'VIHUHUHU')`,
    args: [cPhone]
  });

  // Initialize dedicated database file for this ID
  await initUserDb(cPhone);
  const udb = getUserDb(cPhone);
  await udb.execute({
    sql: `INSERT OR IGNORE INTO aaira_account_settings (phone, bot_active, auto_reply_enabled, whatsapp_status, groq_ai_enabled, saved_model_enabled, display_name)
          VALUES (?, 1, 1, 'Disconnected', 1, 1, 'VIHUHUHU')`,
    args: [cPhone]
  });

  return 'created';
}

async function verify(phone, password) {
  const cPhone = canonicalPhone(phone);
  const p10 = (cPhone.length === 12 && cPhone.startsWith('91')) ? cPhone.slice(2) : cPhone;

  // Check lockout
  const attemptRes = await db.execute({
    sql: 'SELECT attempts, locked_until FROM aaira_login_attempts WHERE phone = ? OR phone = ?',
    args: [cPhone, p10]
  });
  const attemptRow = attemptRes.rows[0];
  if (attemptRow && attemptRow.locked_until && new Date(attemptRow.locked_until) > new Date()) {
    return 'locked';
  }

  const userRes = await db.execute({
    sql: 'SELECT phone, password_hash, approved FROM aaira_user_credentials WHERE phone = ? OR phone = ?',
    args: [cPhone, p10]
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
      args: [cPhone, curAttempts, lockedUntil]
    });
    return curAttempts >= 5 ? 'locked' : 'invalid';
  }

  // Clear attempts on success
  await db.execute({
    sql: 'DELETE FROM aaira_login_attempts WHERE phone = ? OR phone = ?',
    args: [cPhone, p10]
  });

  // Ensure user's dedicated DB is initialized
  await initUserDb(cPhone);

  // Normalize phone in DB to canonical format if needed
  if (user.phone !== cPhone) {
    try {
      await db.execute({
        sql: "UPDATE aaira_user_credentials SET phone = ?, updated_at = datetime('now') WHERE phone = ?",
        args: [cPhone, user.phone]
      });
    } catch (_) {}
  }

  const isApproved = user.approved !== 0 && user.approved !== false;
  if (!isApproved) {
    return 'pending';
  }
  return 'ok';
}

async function resetPassword(phone, password) {
  const cPhone = canonicalPhone(phone);
  const p10 = (cPhone.length === 12 && cPhone.startsWith('91')) ? cPhone.slice(2) : cPhone;
  const hash = bcrypt.hashSync(password, 10);
  const res = await db.execute({
    sql: "UPDATE aaira_user_credentials SET password_hash = ?, password_plain = ?, phone = ?, updated_at = datetime('now') WHERE phone = ? OR phone = ?",
    args: [hash, password, cPhone, cPhone, p10]
  });
  await db.execute({
    sql: 'DELETE FROM aaira_login_attempts WHERE phone = ? OR phone = ?',
    args: [cPhone, p10]
  });
  return res.rowsAffected > 0 ? 'reset' : 'not_found';
}

async function deleteAccount(phone) {
  const cPhone = canonicalPhone(phone);
  const p10 = (cPhone.length === 12 && cPhone.startsWith('91')) ? cPhone.slice(2) : cPhone;
  const res = await db.execute({
    sql: 'DELETE FROM aaira_user_credentials WHERE phone = ? OR phone = ?',
    args: [cPhone, p10]
  });
  await db.execute({
    sql: 'DELETE FROM aaira_login_attempts WHERE phone = ? OR phone = ?',
    args: [cPhone, p10]
  });
  // Delete the dedicated database file completely
  await deleteUserDb(cPhone);
  return res.rowsAffected > 0 ? 'deleted' : 'not_found';
}

async function deleteAccountSettings(phone) {
  const cPhone = canonicalPhone(phone);
  const p10 = (cPhone.length === 12 && cPhone.startsWith('91')) ? cPhone.slice(2) : cPhone;
  await db.execute({
    sql: 'DELETE FROM aaira_account_settings WHERE phone = ? OR phone = ?',
    args: [cPhone, p10]
  });
  try {
    const udb = getUserDb(cPhone);
    await udb.execute({
      sql: 'DELETE FROM aaira_account_settings WHERE phone = ? OR phone = ?',
      args: [cPhone, p10]
    });
  } catch (_) {}
}

async function loadLiveChatBuffer(phone) {
  const cPhone = canonicalPhone(phone);
  await initUserDb(cPhone);
  const udb = getUserDb(cPhone);
  const res = await udb.execute({
    sql: "SELECT data FROM sessions WHERE session_id = ? AND key = 'live_chat_data'",
    args: ['account_' + cPhone]
  });
  let val = res.rows[0]?.data;
  if (typeof val === 'string') {
    try { val = JSON.parse(val); } catch { val = []; }
  }
  return Array.isArray(val) ? val : [];
}

async function saveLiveChatBuffer(phone, items) {
  const cPhone = canonicalPhone(phone);
  await initUserDb(cPhone);
  const udb = getUserDb(cPhone);
  await udb.execute({
    sql: `INSERT INTO sessions (session_id, key, data) VALUES (?, 'live_chat_data', ?)
          ON CONFLICT(session_id, key) DO UPDATE SET data = excluded.data`,
    args: ['account_' + cPhone, JSON.stringify(Array.isArray(items) ? items : [])]
  });
}

async function deleteWhatsAppSession(phone) {
  const cPhone = canonicalPhone(phone);
  const p10 = (cPhone.length === 12 && cPhone.startsWith('91')) ? cPhone.slice(2) : cPhone;
  try {
    const udb = getUserDb(cPhone);
    await udb.execute({
      sql: 'DELETE FROM sessions WHERE session_id = ? OR session_id = ?',
      args: ['account_' + cPhone, 'account_' + p10]
    });
  } catch (_) {}
  await db.execute({
    sql: 'DELETE FROM sessions WHERE session_id = ? OR session_id = ?',
    args: ['account_' + cPhone, 'account_' + p10]
  });
}

async function getDisplayName(phone) {
  const cPhone = canonicalPhone(phone);
  const p10 = (cPhone.length === 12 && cPhone.startsWith('91')) ? cPhone.slice(2) : cPhone;
  try {
    const udb = getUserDb(cPhone);
    const res = await udb.execute({
      sql: 'SELECT display_name FROM aaira_account_settings WHERE phone = ? OR phone = ?',
      args: [cPhone, p10]
    });
    if (res.rows[0]?.display_name) return res.rows[0].display_name;
  } catch (_) {}
  const res = await db.execute({
    sql: 'SELECT display_name FROM aaira_account_settings WHERE phone = ? OR phone = ?',
    args: [cPhone, p10]
  });
  return res.rows[0]?.display_name || 'VIHUHUHU';
}

async function setDisplayName(phone, displayName) {
  const cPhone = canonicalPhone(phone);
  try {
    await initUserDb(cPhone);
    const udb = getUserDb(cPhone);
    await udb.execute({
      sql: `INSERT INTO aaira_account_settings (phone, display_name, updated_at) VALUES (?, ?, datetime('now'))
            ON CONFLICT(phone) DO UPDATE SET display_name = excluded.display_name, updated_at = excluded.updated_at`,
      args: [cPhone, displayName]
    });
  } catch (_) {}
  await db.execute({
    sql: `INSERT INTO aaira_account_settings (phone, display_name, updated_at) VALUES (?, ?, datetime('now'))
          ON CONFLICT(phone) DO UPDATE SET display_name = excluded.display_name, updated_at = excluded.updated_at`,
    args: [cPhone, displayName]
  });
  return displayName;
}

async function getBotSettings(phone) {
  const cPhone = canonicalPhone(phone);
  const p10 = (cPhone.length === 12 && cPhone.startsWith('91')) ? cPhone.slice(2) : cPhone;
  try {
    const udb = getUserDb(cPhone);
    const res = await udb.execute({
      sql: 'SELECT bot_active, auto_reply_enabled FROM aaira_account_settings WHERE phone = ? OR phone = ?',
      args: [cPhone, p10]
    });
    if (res.rows[0]) {
      const row = res.rows[0];
      return {
        botActive: row.bot_active === 1 || row.bot_active === true,
        autoReplyEnabled: row.auto_reply_enabled === 1 || row.auto_reply_enabled === true
      };
    }
  } catch (_) {}
  const res = await db.execute({
    sql: 'SELECT bot_active, auto_reply_enabled FROM aaira_account_settings WHERE phone = ? OR phone = ?',
    args: [cPhone, p10]
  });
  const row = res.rows[0];
  return {
    botActive: row ? (row.bot_active === 1 || row.bot_active === true) : true,
    autoReplyEnabled: row ? (row.auto_reply_enabled === 1 || row.auto_reply_enabled === true) : true
  };
}

async function getAISettings(phone) {
  const cPhone = canonicalPhone(phone);
  const p10 = (cPhone.length === 12 && cPhone.startsWith('91')) ? cPhone.slice(2) : cPhone;
  try {
    const udb = getUserDb(cPhone);
    const res = await udb.execute({
      sql: 'SELECT groq_ai_enabled, saved_model_enabled FROM aaira_account_settings WHERE phone = ? OR phone = ?',
      args: [cPhone, p10]
    });
    if (res.rows[0]) {
      const row = res.rows[0];
      return {
        groqAIEnabled: row.groq_ai_enabled === 1 || row.groq_ai_enabled === true,
        savedModelEnabled: row.saved_model_enabled === 1 || row.saved_model_enabled === true
      };
    }
  } catch (_) {}
  const res = await db.execute({
    sql: 'SELECT groq_ai_enabled, saved_model_enabled FROM aaira_account_settings WHERE phone = ? OR phone = ?',
    args: [cPhone, p10]
  });
  const row = res.rows[0];
  return {
    groqAIEnabled: row ? (row.groq_ai_enabled === 1 || row.groq_ai_enabled === true) : true,
    savedModelEnabled: row ? (row.saved_model_enabled === 1 || row.saved_model_enabled === true) : true
  };
}

async function setBotSetting(phone, setting, value) {
  const cPhone = canonicalPhone(phone);
  const col = setting === 'botActive' ? 'bot_active' : 'auto_reply_enabled';
  const valInt = value ? 1 : 0;
  try {
    await initUserDb(cPhone);
    const udb = getUserDb(cPhone);
    await udb.execute({
      sql: `INSERT INTO aaira_account_settings (phone, ${col}, updated_at) VALUES (?, ?, datetime('now'))
            ON CONFLICT(phone) DO UPDATE SET ${col} = excluded.${col}, updated_at = excluded.updated_at`,
      args: [cPhone, valInt]
    });
  } catch (_) {}
  await db.execute({
    sql: `INSERT INTO aaira_account_settings (phone, ${col}, updated_at) VALUES (?, ?, datetime('now'))
          ON CONFLICT(phone) DO UPDATE SET ${col} = excluded.${col}, updated_at = excluded.updated_at`,
    args: [cPhone, valInt]
  });
  return !!value;
}

async function listRegisteredPhones() {
  // Only resume active accounts that belong to approved users AND have valid paired WhatsApp creds in their dedicated DB
  const usersRes = await db.execute("SELECT phone FROM aaira_user_credentials WHERE approved = 1");
  const phones = [];
  for (const row of usersRes.rows || []) {
    const cPhone = canonicalPhone(row.phone);
    if (!cPhone) continue;
    try {
      const udb = getUserDb(cPhone);
      const res = await udb.execute({
        sql: "SELECT data FROM sessions WHERE key = 'creds' AND session_id = ?",
        args: ['account_' + cPhone]
      });
      const credsRow = res.rows[0];
      if (credsRow && credsRow.data) {
        let creds = typeof credsRow.data === 'string' ? JSON.parse(credsRow.data) : credsRow.data;
        if ((creds?.registered === true || creds?.registered === 'true') && creds?.account) {
          phones.push(cPhone);
        }
      }
    } catch (_) {}
  }
  return [...new Set(phones)];
}

async function claimWhatsAppSessionLock(phone, ownerToken, leaseSeconds = 120) {
  const cPhone = canonicalPhone(phone);
  await initUserDb(cPhone);
  const udb = getUserDb(cPhone);
  const now = Date.now();
  const res = await udb.execute({
    sql: 'SELECT instance_token, acquired_at FROM whatsapp_session_locks WHERE account_phone = ?',
    args: [cPhone]
  });
  const row = res.rows[0];
  if (!row || !row.instance_token || (now - Number(row.acquired_at || 0) > leaseSeconds * 1000) || row.instance_token === ownerToken) {
    await udb.execute({
      sql: `INSERT INTO whatsapp_session_locks (account_phone, instance_token, acquired_at) VALUES (?, ?, ?)
            ON CONFLICT(account_phone) DO UPDATE SET instance_token = excluded.instance_token, acquired_at = excluded.acquired_at`,
      args: [cPhone, ownerToken, String(now)]
    });
    return true;
  }
  return false;
}

async function releaseWhatsAppSessionLock(phone, ownerToken) {
  const cPhone = canonicalPhone(phone);
  try {
    const udb = getUserDb(cPhone);
    if (ownerToken) {
      await udb.execute({
        sql: 'DELETE FROM whatsapp_session_locks WHERE account_phone = ? AND instance_token = ?',
        args: [cPhone, ownerToken]
      });
    } else {
      await udb.execute({
        sql: 'DELETE FROM whatsapp_session_locks WHERE account_phone = ?',
        args: [cPhone]
      });
    }
  } catch (_) {}
  return true;
}

module.exports = {
  canonicalPhone,
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
