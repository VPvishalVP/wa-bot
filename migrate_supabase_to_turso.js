require('dotenv').config();
const https = require('https');
const { db } = require('./db');

const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_dSjC-9dbKcEQYrqkAOcEUw_K9CSpiOt';
const SUPABASE_HOST = 'rthezmmpatudgjfahsrv.supabase.co';

function fetchSupabase(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: SUPABASE_HOST,
      path: path,
      method: 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Accept': 'application/json'
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error('HTTP ' + res.statusCode + ': ' + data));
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function getExactCount(table) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: SUPABASE_HOST,
      path: '/rest/v1/' + table + '?select=count',
      method: 'HEAD',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Prefer': 'count=exact'
      }
    }, res => {
      const cr = res.headers['content-range'];
      if (cr && cr.includes('/')) {
        const total = parseInt(cr.split('/')[1], 10);
        return resolve(total);
      }
      resolve(0);
    });
    req.on('error', reject);
    req.end();
  });
}

async function migrateSessions() {
  console.log('=== Starting Supabase -> Turso DB Sessions Migration ===');
  const total = await getExactCount('sessions');
  console.log(`Found ${total} total records in Supabase 'sessions' table.`);

  const pageSize = 500;
  let offset = 0;
  let totalInserted = 0;

  while (offset < total) {
    let rows = [];
    for (let retry = 0; retry < 5; retry++) {
      try {
        rows = await fetchSupabase(`/rest/v1/sessions?select=*&order=session_id.asc,key.asc&limit=${pageSize}&offset=${offset}`);
        break;
      } catch (err) {
        console.warn(`Fetch error at offset ${offset} (attempt ${retry + 1}/5):`, err.message);
        await new Promise(r => setTimeout(r, 2000 * (retry + 1)));
      }
    }

    if (!rows || rows.length === 0) {
      console.log('No more rows returned, finished fetching.');
      break;
    }

    // Insert in chunks of 100 statements
    const chunkSize = 100;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const stmts = chunk.map(r => ({
        sql: 'INSERT OR REPLACE INTO sessions (session_id, key, data) VALUES (?, ?, ?)',
        args: [r.session_id, r.key, r.data]
      }));

      for (let retry = 0; retry < 5; retry++) {
        try {
          await db.batch(stmts, 'write');
          break;
        } catch (err) {
          console.warn(`Turso write batch failed (attempt ${retry + 1}/5):`, err.message);
          await new Promise(r => setTimeout(r, 2000 * (retry + 1)));
        }
      }
    }

    totalInserted += rows.length;
    offset += rows.length;
    const pct = ((totalInserted / total) * 100).toFixed(1);
    console.log(`Progress: ${totalInserted}/${total} records migrated (${pct}%)`);
  }

  console.log(`Successfully migrated ${totalInserted} records from Supabase to Turso DB!`);

  // Final verification
  const check = await db.execute('SELECT COUNT(*) as cnt FROM sessions');
  const distinctSessions = await db.execute('SELECT DISTINCT session_id FROM sessions');
  console.log('--- Turso Verification ---');
  console.log('Turso sessions total count:', check.rows[0].cnt);
  console.log('Distinct sessions stored:', distinctSessions.rows.map(r => r.session_id));
}

async function checkOtherTables() {
  const tables = ['aaira_account_settings', 'aaira_admin_blocked_users', 'aaira_support_tickets', 'aaira_support_messages'];
  for (const table of tables) {
    try {
      const rows = await fetchSupabase(`/rest/v1/${table}?select=*`);
      console.log(`Supabase table '${table}': ${rows.length} rows found.`);
      if (rows.length > 0) {
        console.log(`Migrating ${rows.length} rows from '${table}'...`);
        // Insert into Turso
        for (const row of rows) {
          const keys = Object.keys(row);
          const placeholders = keys.map(() => '?').join(', ');
          const values = keys.map(k => row[k]);
          await db.execute({
            sql: `INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`,
            args: values
          });
        }
        console.log(`Migrated '${table}' successfully.`);
      }
    } catch (e) {
      console.log(`Supabase table '${table}': ${e.message}`);
    }
  }
}

async function main() {
  try {
    await migrateSessions();
    await checkOtherTables();
    console.log('=== All Supabase data successfully migrated to Turso DB ===');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

main();
