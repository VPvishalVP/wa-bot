require('dotenv').config();
const { createClient } = require('@libsql/client');

const url = process.env.TURSO_DATABASE_URL || 'file:local.db';
const authToken = process.env.TURSO_AUTH_TOKEN;

const db = createClient({
  url,
  authToken: authToken || undefined
});

async function initDb() {
  const queries = [
    `CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT NOT NULL,
      key TEXT NOT NULL,
      data TEXT,
      PRIMARY KEY (session_id, key)
    );`,
    `CREATE TABLE IF NOT EXISTS aaira_user_credentials (
      phone TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      password_plain TEXT,
      approved INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );`,
    `CREATE TABLE IF NOT EXISTS aaira_account_settings (
      phone TEXT PRIMARY KEY,
      bot_active INTEGER DEFAULT 1,
      auto_reply_enabled INTEGER DEFAULT 1,
      whatsapp_status TEXT DEFAULT 'Disconnected',
      groq_ai_enabled INTEGER DEFAULT 1,
      saved_model_enabled INTEGER DEFAULT 1,
      display_name TEXT DEFAULT 'VIHUHUHU',
      updated_at TEXT DEFAULT (datetime('now'))
    );`,
    `CREATE TABLE IF NOT EXISTS aaira_admin_blocked_users (
      phone TEXT PRIMARY KEY,
      reason TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );`,
    `CREATE TABLE IF NOT EXISTS whatsapp_session_locks (
      account_phone TEXT PRIMARY KEY,
      instance_token TEXT,
      acquired_at TEXT DEFAULT (datetime('now'))
    );`,
    `CREATE TABLE IF NOT EXISTS aaira_support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_ref TEXT,
      user_phone TEXT,
      title TEXT,
      description TEXT,
      priority TEXT DEFAULT 'normal',
      status TEXT DEFAULT 'open',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );`,
    `CREATE TABLE IF NOT EXISTS aaira_support_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER,
      sender_role TEXT,
      message TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );`,
    `CREATE TABLE IF NOT EXISTS aaira_login_attempts (
      phone TEXT PRIMARY KEY,
      attempts INTEGER DEFAULT 0,
      locked_until TEXT
    );`
  ];

  for (const q of queries) {
    await db.execute(q);
  }

  try {
    await db.execute("ALTER TABLE aaira_user_credentials ADD COLUMN password_plain TEXT;");
  } catch (e) {
    // Column already exists
  }
}

module.exports = { db, initDb };
