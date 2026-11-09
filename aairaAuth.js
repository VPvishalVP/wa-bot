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

async function getDisplayName(phone) {
  const { data, error } = await supabase
    .from('aaira_account_settings')
    .select('display_name')
    .eq('phone', phone)
    .maybeSingle();
  if (error) throw error;
  return data?.display_name || 'VIHUHUHU';
}
async function getBotSettings(phone) {
  const { data, error } = await supabase
    .from('aaira_account_settings')
    .select('bot_active, auto_reply_enabled')
    .eq('phone', phone)
    .maybeSingle();
  if (error) throw error;
  return {
    botActive: data?.bot_active ?? true,
    autoReplyEnabled: data?.auto_reply_enabled ?? true
  };
}
async function setBotSetting(phone, setting, value) {
  const column = setting === 'botActive' ? 'bot_active' : 'auto_reply_enabled';
  const { error } = await supabase
    .from('aaira_account_settings')
    .upsert({ phone, [column]: !!value, updated_at: new Date().toISOString() }, { onConflict: 'phone' });
  if (error) throw error;
  return !!value;
}

async function setDisplayName(phone, displayName) {
  const { error } = await supabase
    .from('aaira_account_settings')
    .upsert({ phone, display_name: displayName, updated_at: new Date().toISOString() }, { onConflict: 'phone' });
  if (error) throw error;
  return displayName;
}


async function claimWhatsAppSessionLock(phone, ownerToken, leaseSeconds = 120) {
  return callAuthRpc('claim_whatsapp_session_lock', { p_account_phone: phone, p_owner_token: ownerToken, p_lease_seconds: leaseSeconds });
}
async function releaseWhatsAppSessionLock(phone, ownerToken) {
  return callAuthRpc('release_whatsapp_session_lock', { p_account_phone: phone, p_owner_token: ownerToken });
}

module.exports = { register, verify, resetPassword, deleteAccount, getDisplayName, setDisplayName, getBotSettings, setBotSetting, claimWhatsAppSessionLock, releaseWhatsAppSessionLock };
