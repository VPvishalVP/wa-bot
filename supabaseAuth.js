const { createClient } = require('@supabase/supabase-js');
const { initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');

// Supabase credentials
const supabaseUrl = 'https://rthezmmpatudgjfahsrv.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY for private WhatsApp session storage.');

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
});

const useSupabaseAuthState = async (sessionId) => {
    const writeData = async (data, key) => {
        const jsonString = JSON.stringify(data, BufferJSON.replacer);
        const { error } = await supabase.from('sessions').upsert({
            session_id: sessionId,
            key: key,
            data: jsonString
        }, { onConflict: 'session_id,key' });
        if (error) throw error;
    };

    const readData = async (key) => {
        try {
            const { data, error } = await supabase
                .from('sessions')
                .select('data')
                .eq('session_id', sessionId)
                .eq('key', key)
                .single();

            if (error || !data) return null;

            return JSON.parse(data.data, BufferJSON.reviver);
        } catch {
            return null;
        }
    };

    const removeData = async (key) => {
        const { error } = await supabase.from('sessions').delete()
            .eq('session_id', sessionId)
            .eq('key', key);
        if (error) throw error;
    };

    const creds = (await readData('creds')) || initAuthCreds();

    const state = {
        creds,
        keys: {
            get: async (type, ids) => {
                const data = {};

                await Promise.all(
                    ids.map(async (id) => {
                        let value = await readData(`${type}-${id}`);
                        data[id] = value;
                    })
                );

                return data;
            },

            set: async (data) => {
                const tasks = [];

                for (const category of Object.keys(data)) {
                    for (const id of Object.keys(data[category])) {
                        const value = data[category][id];
                        const key = `${category}-${id}`;

                        if (value) {
                            tasks.push(writeData(value, key));
                        } else {
                            tasks.push(removeData(key));
                        }
                    }
                }

                await Promise.all(tasks);
            }
        }
    };

    return {
        state,
        saveCreds: async () => {
            await writeData(state.creds, 'creds');
        },
        clearAuthState: async () => {
            const { error } = await supabase.from('sessions').delete().eq('session_id', sessionId);
            if (error) throw error;
        }
    };
};

module.exports = { useSupabaseAuthState };
