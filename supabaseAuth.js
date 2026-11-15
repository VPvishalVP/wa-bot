const { db } = require('./db');
const { initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');

// In-memory cache for fast read/write of keys (eliminates Baileys pre-key upload timeouts & Bad MAC)
const sessionCaches = new Map();

function getSessionCache(sessionId) {
  if (!sessionCaches.has(sessionId)) {
    sessionCaches.set(sessionId, new Map());
  }
  return sessionCaches.get(sessionId);
}

async function retry(operation, label, attempts = 5) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) break;
      const delay = Math.min(300 * (2 ** attempt), 5000);
      console.warn('[WA AUTH] ' + label + ' failed (attempt ' + (attempt + 1) + '/' + attempts + '): ' + (error?.message || error) + '; retrying in ' + delay + 'ms');
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

const useSupabaseAuthState = async (sessionId) => {
  const cache = getSessionCache(sessionId);

  const writeData = async (data, key) => {
    cache.set(key, data);
    return retry(async () => {
      const jsonString = JSON.stringify(data, BufferJSON.replacer);
      await db.execute({
        sql: 'INSERT INTO sessions (session_id, key, data) VALUES (?, ?, ?) ON CONFLICT(session_id, key) DO UPDATE SET data = excluded.data',
        args: [sessionId, key, jsonString]
      });
    }, 'write ' + key);
  };

  const readData = async (key) => {
    if (cache.has(key)) return cache.get(key);
    return retry(async () => {
      const res = await db.execute({
        sql: 'SELECT data FROM sessions WHERE session_id = ? AND key = ?',
        args: [sessionId, key]
      });
      const row = res.rows[0];
      if (!row || !row.data) return null;
      const val = JSON.parse(row.data, BufferJSON.reviver);
      cache.set(key, val);
      return val;
    }, 'read ' + key);
  };

  const removeData = async (key) => {
    cache.delete(key);
    return retry(async () => {
      await db.execute({
        sql: 'DELETE FROM sessions WHERE session_id = ? AND key = ?',
        args: [sessionId, key]
      });
    }, 'delete ' + key);
  };

  const creds = (await readData('creds')) || initAuthCreds();
  cache.set('creds', creds);

  const state = {
    creds,
    keys: {
      get: async (type, ids) => {
        const data = {};
        const missingIds = [];
        for (const id of ids) {
          const key = type + '-' + id;
          if (cache.has(key)) {
            data[id] = cache.get(key);
          } else {
            missingIds.push(id);
          }
        }
        if (missingIds.length > 0) {
          for (let i = 0; i < missingIds.length; i += 50) {
            const chunk = missingIds.slice(i, i + 50);
            const placeholders = chunk.map(() => '?').join(',');
            const keys = chunk.map(id => type + '-' + id);
            try {
              const res = await retry(async () => {
                return await db.execute({
                  sql: `SELECT key, data FROM sessions WHERE session_id = ? AND key IN (${placeholders})`,
                  args: [sessionId, ...keys]
                });
              }, `batch read ${keys.length} keys`);
              for (const row of res.rows || []) {
                if (row && row.key && row.data) {
                  try {
                    const parsed = JSON.parse(row.data, BufferJSON.reviver);
                    const id = row.key.slice((type + '-').length);
                    data[id] = parsed;
                    cache.set(row.key, parsed);
                  } catch (e) {
                    console.warn(`[WA AUTH] Parse error for key ${row.key}:`, e.message);
                  }
                }
              }
            } catch (e) {
              console.error(`[WA AUTH] Batch read failed:`, e.message);
            }
          }
        }
        return data;
      },
      set: async (data) => {
        const statements = [];
        for (const category of Object.keys(data)) {
          for (const id of Object.keys(data[category])) {
            const value = data[category][id];
            const key = category + '-' + id;
            if (value) {
              cache.set(key, value);
              const jsonString = JSON.stringify(value, BufferJSON.replacer);
              statements.push({
                sql: 'INSERT INTO sessions (session_id, key, data) VALUES (?, ?, ?) ON CONFLICT(session_id, key) DO UPDATE SET data = excluded.data',
                args: [sessionId, key, jsonString]
              });
            } else {
              cache.delete(key);
              statements.push({
                sql: 'DELETE FROM sessions WHERE session_id = ? AND key = ?',
                args: [sessionId, key]
              });
            }
          }
        }
        if (statements.length > 0) {
          for (let i = 0; i < statements.length; i += 50) {
            const chunk = statements.slice(i, i + 50);
            await retry(async () => {
              await db.batch(chunk, 'write');
            }, `batch write ${chunk.length} keys`);
          }
        }
      }
    }
  };

  return {
    state,
    saveCreds: async () => writeData(state.creds, 'creds'),
    clearAuthState: async () => retry(async () => {
      cache.clear();
      await db.execute({
        sql: 'DELETE FROM sessions WHERE session_id = ?',
        args: [sessionId]
      });
    }, 'clear auth state')
  };
};

module.exports = { useSupabaseAuthState };
