const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://rthezmmpatudgjfahsrv.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY. Add the bot-only service role key to Render environment variables.');
}

// Service-role key is server-only. Never put it in dashboard/client-side code or commit it.
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function callAuthRpc(name, params) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data;
}
async function register(phone, password) {
  return callAuthRpc('aaira_register_user', { p_phone: phone, p_password: password });
}
async function verify(phone, password) {
  return callAuthRpc('aaira_verify_user', { p_phone: phone, p_password: password });
}
async function resetPassword(phone, password) {
  return callAuthRpc('aaira_reset_password', { p_phone: phone, p_password: password });
}
async function deleteAccount(phone) {
  return callAuthRpc('aaira_delete_account', { p_phone: phone });
}

module.exports = { register, verify, resetPassword, deleteAccount };
