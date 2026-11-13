const { createClient } = require('@supabase/supabase-js');
const { initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');

const supabaseUrl = 'https://rthezmmpatudgjfahsrv.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY for private WhatsApp session storage.');

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (...args) => fetch(...args) }
});

// Supabase transient network errors must not be mistaken for missing WhatsApp credentials.
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

async function runLimited(tasks, concurrency = 8) {
    let next = 0;
    const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
        while (next < tasks.length) {
            const index = next++;
            await tasks[index]();
        }
    });
    await Promise.all(workers);
}

const useSupabaseAuthState = async (sessionId) => {
    const writeData = async (data, key) => retry(async () => {
        const jsonString = JSON.stringify(data, BufferJSON.replacer);
        const { error } = await supabase.from('sessions').upsert({
            session_id: sessionId,
            key,
            data: jsonString
        }, { onConflict: 'session_id,key' });
        if (error) throw error;
    }, 'write ' + key);

    const readData = async (key) => retry(async () => {
        const { data, error } = await supabase.from('sessions')
            .select('data').eq('session_id', sessionId).eq('key', key).maybeSingle();
        if (error) throw error;
        if (!data) return null;
        return JSON.parse(data.data, BufferJSON.reviver);
    }, 'read ' + key);

    const removeData = async (key) => retry(async () => {
        const { error } = await supabase.from('sessions').delete()
            .eq('session_id', sessionId).eq('key', key);
        if (error) throw error;
    }, 'delete ' + key);

    const creds = (await readData('creds')) || initAuthCreds();
    const state = {
        creds,
        keys: {
            get: async (type, ids) => {
                const data = {};
                await runLimited(ids.map(id => async () => {
                    data[id] = await readData(type + '-' + id);
                }));
                return data;
            },
            set: async (data) => {
                const tasks = [];
                for (const category of Object.keys(data)) {
                    for (const id of Object.keys(data[category])) {
                        const value = data[category][id];
                        const key = category + '-' + id;
                        tasks.push(async () => value ? writeData(value, key) : removeData(key));
                    }
                }
                await runLimited(tasks);
            }
        }
    };

    return {
        state,
        saveCreds: async () => writeData(state.creds, 'creds'),
        clearAuthState: async () => retry(async () => {
            const { error } = await supabase.from('sessions').delete().eq('session_id', sessionId);
            if (error) throw error;
        }, 'clear auth state')
    };
};

module.exports = { useSupabaseAuthState };
