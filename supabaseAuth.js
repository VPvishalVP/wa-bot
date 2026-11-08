const { createClient } = require('@supabase/supabase-js');
const { initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const useSupabaseAuthState = async (sessionId) => {
    const writeData = async (data, key) => {
        const jsonString = JSON.stringify(data, BufferJSON.replacer);
        await supabase.from('sessions').upsert({
            session_id: sessionId,
            key: key,
            data: jsonString
        }, { onConflict: 'session_id,key' });
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
        await supabase.from('sessions').delete().eq('session_id', sessionId).eq('key', key);
    };

    const creds = (await readData('creds')) || initAuthCreds();

    return {
        state: {
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
        },
        saveCreds: async () => {
            await writeData(state.creds, 'creds');
        }
    };
};

module.exports = { useSupabaseAuthState };
