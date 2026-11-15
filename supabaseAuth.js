const { db } = require('./db');
const { initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');

async function retry(operation, label, attempts = 5) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) break;
      const delay = Math.min(500 * (2 ** attempt), 8000);
      console.warn('[WA AUTH] ' + label + ' failed (attempt ' + (attempt + 1) + '/' + attempts + '): ' + (error?.message || error) + '; retrying in ' + delay + 'ms');
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

const useSupabaseAuthState = async (sessionId) => {
  const writeData = async (data, key) => retry(async () => {
    const jsonString = JSON.stringify(data, BufferJSON.replacer);
    await db.execute({
      sql: 'INSERT INTO sessions (session_id, key, data) VALUES (?, ?, ?) ON CONFLICT(session_id, key) DO UPDATE SET data = excluded.data',
      args: [sessionId, key, jsonString]
    });
  }, 'write ' + key);

  const readData = async (key) => retry(async () => {
    const res = await db.execute({
      sql: 'SELECT data FROM sessions WHERE session_id = ? AND key = ?',
      args: [sessionId, key]
    });
    const row = res.rows[0];
    if (!row || !row.data) return null;
    return JSON.parse(row.data, BufferJSON.reviver);
  }, 'read ' + key);

  const removeData = async (key) => retry(async () => {
    await db.execute({
      sql: 'DELETE FROM sessions WHERE session_id = ? AND key = ?',
      args: [sessionId, key]
    });
  }, 'delete ' + key);

  const creds = (await readData('creds')) || initAuthCreds();
  const state = {
    creds,
    keys: {
      get: async (type, ids) => {
        const data = {};
        for (const id of ids) {
          data[id] = await readData(type + '-' + id);
        }
        return data;
      },
      set: async (data) => {
        for (const category of Object.keys(data)) {
          for (const id of Object.keys(data[category])) {
            const value = data[category][id];
            const key = category + '-' + id;
            if (value) {
              await writeData(value, key);
            } else {
              await removeData(key);
            }
          }
        }
      }
    }
  };

  return {
    state,
    saveCreds: async () => writeData(state.creds, 'creds'),
    clearAuthState: async () => retry(async () => {
      await db.execute({
        sql: 'DELETE FROM sessions WHERE session_id = ?',
        args: [sessionId]
      });
    }, 'clear auth state')
  };
};

module.exports = { useSupabaseAuthState };
