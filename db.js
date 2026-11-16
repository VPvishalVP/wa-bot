require('dotenv').config();
const { createClient } = require('@libsql/client');
const path = require('path');
const fs = require('fs');

const url = process.env.TURSO_DATABASE_URL || 'file:local.db';
const authToken = process.env.TURSO_AUTH_TOKEN;

const db = createClient({
  url,
  authToken: authToken || undefined
});

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const accountsDir = path.join(DATA_DIR, 'accounts');
if (!fs.existsSync(accountsDir)) {
  fs.mkdirSync(accountsDir, { recursive: true });
}

function canonicalPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return '91' + digits;
  if (digits.length === 11 && digits.startsWith('0')) return '91' + digits.slice(1);
  return digits;
}

const userClients = new Map();

function getUserDb(phone) {
  const cPhone = canonicalPhone(phone);
  if (!cPhone) return db;
  if (!userClients.has(cPhone)) {
    const dbPath = path.join(accountsDir, `${cPhone}.db`);
    const client = createClient({ url: `file:${dbPath}` });
    userClients.set(cPhone, client);
  }
  return userClients.get(cPhone);
}

async function initUserDb(phone) {
  const cPhone = canonicalPhone(phone);
  if (!cPhone) return null;
  const udb = getUserDb(cPhone);
  const queries = [
    `CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT NOT NULL,
      key TEXT NOT NULL,
      data TEXT,
      PRIMARY KEY (session_id, key)
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
    `CREATE TABLE IF NOT EXISTS whatsapp_session_locks (
      account_phone TEXT PRIMARY KEY,
      instance_token TEXT,
      acquired_at TEXT DEFAULT (datetime('now'))
    );`
  ];
  for (const q of queries) {
    await udb.execute(q);
  }
  return udb;
}

async function deleteUserDb(phone) {
  const cPhone = canonicalPhone(phone);
  if (!cPhone) return;
  userClients.delete(cPhone);
  const dbPath = path.join(accountsDir, `${cPhone}.db`);
  try {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  } catch(e) {
    console.error(`[DB] Failed to delete user DB file for ${cPhone}:`, e.message);
  }
}

function listUserDbPhones() {
  try {
    const files = fs.readdirSync(accountsDir);
    return files
      .filter(f => f.endsWith('.db'))
      .map(f => f.slice(0, -3))
      .filter(f => /^\d{8,15}$/.test(f));
  } catch {
    return [];
  }
}

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

module.exports = {
  db,
  initDb,
  getUserDb,
  initUserDb,
  deleteUserDb,
  listUserDbPhones,
  canonicalPhone
};
