const { createClient } = require('@supabase/supabase-js');

// Reuses the bot's existing Supabase project. Keep the publishable key limited
// to RPC calls whose database functions are explicitly granted.
const supabase = createClient(
  'https://rthezmmpatudgjfahsrv.supabase.co',
  'sb_publishable_dSjC-9dbKcEQYrqkAOcEUw_K9CSpiOt'
);

async function register(phone, password) {
  const { data, error } = await supabase.rpc('aaira_register_user', {
    p_phone: phone,
    p_password: password
  });
  if (error) throw error;
  return data;
}

async function verify(phone, password) {
  const { data, error } = await supabase.rpc('aaira_verify_user', {
    p_phone: phone,
    p_password: password
  });
  if (error) throw error;
  return data;
}

async function resetPassword(phone, password) {
  const { data, error } = await supabase.rpc('aaira_reset_password', {
    p_phone: phone,
    p_password: password
  });
  if (error) throw error;
  return data;
}

module.exports = { register, verify, resetPassword };
