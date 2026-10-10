require('dotenv').config({ path: '/opt/zamil/server/.env' });
const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const app = express();
app.use(express.json({ limit: '2mb' }));
const PORT = process.env.PORT || 8787, HOST = process.env.HOST || '127.0.0.1';
const SUPER_ADMIN = String(process.env.SUPER_ADMIN || '').toLowerCase();
const LAMIX_REST = process.env.LAMIX_REST || 'https://panel.lamix.org/api/v1';
const LAMIX_KEY = process.env.LAMIX_API_KEY;
const pool = new Pool({ user: process.env.PG_USER || 'postgres', host: process.env.PG_HOST || 'localhost', database: process.env.PG_DB || 'zamil_p1', password: process.env.PG_PASSWORD || '', max: 20 });

const limiters = {};
const lastCall = {};
async function pace(ep) { // V2U-PACE — LaMix doc: 40/min + 1 req/sec PER ENDPOINT
  const b = limiters[ep] || (limiters[ep] = []);
  const LIM = (ep === '/numbers' || ep === '/numbers/assign' || ep === '/numbers/unassign') ? 39 : (ep === '/cdrs' ? 35 : 30);
  const GAP = (ep === '/numbers' || ep === '/numbers/assign' || ep === '/numbers/unassign') ? 1550 : 1000;
  while (true) {
    let now = Date.now();
    const gap = now - (lastCall[ep] || 0);
    if (gap < GAP) { await new Promise(r => setTimeout(r, GAP - gap)); now = Date.now(); }
    while (b.length && now - b[0] > 60000) b.shift();
    if (b.length < LIM) { b.push(now); lastCall[ep] = now; return; }
    await new Promise(r => setTimeout(r, b[0] + 60000 - now + 50));
  }
}
async function lxGet(ep, p) {
  await pace(ep);
  try {
    const r = await axios.get(LAMIX_REST + ep, { headers: { Authorization: 'Bearer ' + LAMIX_KEY }, params: p, timeout: 15000, validateStatus: () => true });
    if (r.status === 429) { await new Promise(x => setTimeout(x, (parseInt(r.headers['retry-after'] || '5', 10)) * 1000)); return lxGet(ep, p); }
    return r.data;
  } catch (e) { return { _error: e.message }; }
}
async function lxPost(ep, body) {
  await pace(ep);
  try {
    const r = await axios.post(LAMIX_REST + ep, body, { headers: { Authorization: 'Bearer ' + LAMIX_KEY, 'Content-Type': 'application/json' }, timeout: 20000, validateStatus: () => true });
    if (r.status === 429) { await new Promise(x => setTimeout(x, (parseInt(r.headers['retry-after'] || '5', 10)) * 1000)); return lxPost(ep, body); }
    return r.data;
  } catch (e) { return { _error: e.message }; }
}

const dayKey = () => new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
const WK = "to_char((NOW() AT TIME ZONE 'UTC' - interval '1 day'),'IYYY-\"W\"IW')";
const DK = "to_char(NOW() AT TIME ZONE 'UTC','YYYY-MM-DD')";
const MK = "to_char(NOW() AT TIME ZONE 'UTC','YYYY-MM')";
const PKT_DAY_START = "(date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')";

function countryOf(t) { const m = String(t || '').match(/^(.+?)[\s-](?:LX|MX|RX|DC)\b/i) || String(t || '').match(/^([A-Za-z\s]+?)\d/); return (m && m[1] ? m[1] : String(t || '')).trim(); }
const ISO = { pakistan: 'PK', 'sri lanka': 'LK', nepal: 'NP', tunisia: 'TN', zimbabwe: 'ZW', algeria: 'DZ', angola: 'AO', egypt: 'EG', kenya: 'KE', bangladesh: 'BD', india: 'IN', indonesia: 'ID', philippines: 'PH', vietnam: 'VN', thailand: 'TH', malaysia: 'MY', myanmar: 'MM', afghanistan: 'AF', uzbekistan: 'UZ', kyrgyzstan: 'KG', tajikistan: 'TJ', sudan: 'SD', morocco: 'MA', libya: 'LY', ethiopia: 'ET', rwanda: 'RW', zambia: 'ZM', mozambique: 'MZ', botswana: 'BW', namibia: 'NA', ghana: 'GH', nigeria: 'NG', uganda: 'UG', brazil: 'BR', mexico: 'MX', turkey: 'TR', iran: 'IR', iraq: 'IQ', cambodia: 'KH', laos: 'LA', mongolia: 'MN', palestine: 'PS', israel: 'IL' };
function flagOf(c) { const iso = ISO[String(c || '').toLowerCase()]; if (!iso) return '🌐'; let s = ''; for (const ch of iso) s += String.fromCodePoint(127397 + ch.charCodeAt(0)); return s; }

const sse = new Set();
function broadcast(ev, data) { const p = data ? 'data: ' + JSON.stringify(data) + '\n\n' : 'data: {}\n\n'; sse.forEach(c => { try { c.res.write('event: ' + ev + '\n' + p); } catch (e) {} }); }

const _pingTh = new Map();
function logAct(u, ep) { try { const k = String(u || '').toLowerCase(); if (!k) return; const now = Date.now(); if (now - (_pingTh.get(k) || 0) < 60000) return; _pingTh.set(k, now); if (_pingTh.size > 3000) _pingTh.clear(); pool.query('INSERT INTO api_ping_log (username, endpoint, created_at) VALUES ($1,$2,NOW())', [k, ep]).catch(() => {}); } catch (e) {} }

async function pushSms() { for (const c of sse) { try { const u = c.user, alt = u.clientName || u.username; const cnt = await pool.query("SELECT COALESCE(SUM(otp_count),0)::int t FROM stats_ledger WHERE period_type='daily' AND period_key=" + DK + " AND (LOWER(client_id)=LOWER($1) OR LOWER(client_id)=LOWER($2))", [u.username, alt]); const rec = await pool.query("SELECT to_char(time AT TIME ZONE 'UTC','HH24:MI:SS') AS time, time AS datetime, number, cli, content AS message, range FROM sms_cdr WHERE time >= ($3::date - interval '5 hours') AND (LOWER(client)=LOWER($1) OR LOWER(client)=LOWER($2)) ORDER BY time DESC LIMIT 50", [u.username, alt, dayKey()]); c.res.write('event: sms\ndata: ' + JSON.stringify({ ok: true, count: cnt.rows[0].t, recent: rec.rows }) + '\n\n'); c.res.write('event: lb\ndata: {}\n\n'); } catch (e) {} } }

app.get('/api/stream', (req, res) => { let u = null; try { u = jwt.verify(req.query.session, process.env.JWT_SECRET); } catch (e) { return res.status(401).end(); } res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' }); res.write(': connected\n\n'); const c = { res, user: u }; sse.add(c); const hb = setInterval(() => res.write(': hb\n\n'), 25000); req.on('close', () => { clearInterval(hb); sse.delete(c); }); });

async function cdrLoop() { let last = new Date(Date.now() - 120000).toISOString().slice(0, 19).replace('T', ' '); while (true) { global.__cdrHb = Date.now(); try { const d = await lxGet('/cdrs', { from: last, limit: 500 }); if (d && d.records && d.records.length) { await pool.query('SELECT ingest_cdr($1)', [JSON.stringify(d.records)]); d.records.forEach(r => { const t = String(r.time || '').replace('T', ' ').slice(0, 19); if (t > last) last = t; }); global.__cdrLast = Date.now(); pushSms(); } else { global.__cdrLast = global.__cdrLast || Date.now(); } } catch (e) { console.error('[cdr]', e.message); } await new Promise(r => setTimeout(r, 2000)); } }

let _rangeSig = '';
async function syncLoop() { while (true) { global.__syncHb = Date.now(); try { const d = await lxGet('/ranges'); const recs = (d && (d.ranges || d.records)) || []; if (recs.length) { let n = 0, u = 0; recs.forEach(r => { n += (r.numbers || 0); u += (r.unassignedNumbers || 0); }); const sig = recs.map(r => String(r.id)).sort().join(',') + '|' + n + '|' + u; if (sig !== _rangeSig) { if (_rangeSig) global.__reconDue = Date.now(); _rangeSig = sig; } for (const r of recs) { await pool.query("INSERT INTO ranges (range_id,name,prefix,total_numbers,updated_at) VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT (range_id) DO UPDATE SET name=EXCLUDED.name,prefix=EXCLUDED.prefix,total_numbers=EXCLUDED.total_numbers,updated_at=NOW()", [String(r.id), r.name, r.prefix || '', r.numbers || 0]); } broadcast('ranges'); broadcast('numbers'); } } catch (e) {} await new Promise(r => setTimeout(r, 15000)); } }

async function reconcileLoop() {
  while (true) {
    const idle = Date.now() - (global.__reconLast || 0);
    const due = idle > 15000 || (global.__reconDue && idle > 10000); // V2U continuous // V2R fast cycle // V2G-DUE
    if (due) {
      global.__reconDue = 0; global.__reconLast = Date.now();
      const t0 = new Date().toISOString();
      const t0ms = Date.now();
      let after = null, pages = 0, complete = false, seen = 0;
      let expected = 0;
      const curve = [];
      try {
        expected = (await pool.query("SELECT COUNT(*)::int e FROM pool_numbers WHERE status IN ('free','assigned')")).rows[0].e;
        global.__reconHb = Date.now(); global.__reconState = { status:'running', fetched:0, expected:expected, remaining:expected, etaSecs: 60, etaAt: Date.now() };
        while (pages < 1200) { // V2R allow full pass
          const d = await lxGet('/numbers', after ? { limit: 500, after: after } : { limit: 500 });
          if (!d || d._error || d._rateLimited) break;
          const recs = d.records || [];
          if (recs.length) {
            const rows = recs.map(r => ({ num: String(r.number || ''), rid: r.rangeId ? String(r.rangeId) : '', cli: r.client || '' }));
            await pool.query("INSERT INTO pool_numbers (number,range_id,status,client_id,lamix_synced_at,updated_at) SELECT n.num, NULLIF(n.rid,''), CASE WHEN n.cli='' THEN 'free' ELSE 'assigned' END, NULLIF(n.cli,''), $2, $2 FROM json_to_recordset($1) AS n(num text, rid text, cli text) ON CONFLICT (number) DO UPDATE SET range_id=EXCLUDED.range_id, status=EXCLUDED.status, client_id=EXCLUDED.client_id, lamix_synced_at=$2, updated_at=$2", [JSON.stringify(rows), t0]);
            const numsArr = rows.map(x => x.num); // V2I-HEAL
            await pool.query("INSERT INTO user_numbers (number,client,range_id,range_name,status,updated_at) SELECT p.number,p.client_id,p.range_id,r.name,'active',NOW() FROM pool_numbers p LEFT JOIN ranges r ON r.range_id=p.range_id WHERE p.status='assigned' AND p.client_id IS NOT NULL AND p.number = ANY($1) ON CONFLICT (number) DO UPDATE SET client=EXCLUDED.client, range_name=EXCLUDED.range_name, status='active', updated_at=NOW()", [numsArr]);
            await pool.query("UPDATE user_numbers u SET status='released', updated_at=NOW() WHERE u.status='active' AND u.number = ANY($1) AND EXISTS (SELECT 1 FROM pool_numbers p WHERE p.number=u.number AND p.status='free')", [numsArr]);
            seen += recs.length;
          }
          pages++;
          global.__reconHb = Date.now(); // V2G-HB
curve.push({ t: Date.now(), f: seen });
          if (curve.length > 400) curve.shift();
          global.__reconHb = Date.now(); global.__reconState = { status:'running', fetched: seen, expected: expected, remaining: Math.max(0, expected - seen), startedAt: t0ms, etaSecs: Math.max(5, Math.round((Math.max(0, expected - seen) / 500) * (60 / 38)) + 2), etaAt: Date.now() };
          global.__reconCurve = curve;
          after = d.nextCursor || null;
          if (!after) { complete = true; break; }
        }
        if (complete && seen) {
          await pool.query("UPDATE pool_numbers SET status='gone', client_id=NULL, updated_at=$1 WHERE status IN ('free','assigned') AND lamix_synced_at < $1", [t0]);
          await pool.query("UPDATE user_numbers u SET status='released', updated_at=NOW() WHERE u.status='active' AND EXISTS (SELECT 1 FROM pool_numbers p WHERE p.number=u.number AND p.status IN ('gone','free'))");
          await pool.query("INSERT INTO user_numbers (number,client,range_id,range_name,status,updated_at) SELECT p.number,p.client_id,p.range_id,r.name,'active',NOW() FROM pool_numbers p LEFT JOIN ranges r ON r.range_id=p.range_id WHERE p.status='assigned' AND p.client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM user_numbers u WHERE u.number=p.number AND u.status='active') ON CONFLICT (number) DO UPDATE SET client=EXCLUDED.client, range_name=EXCLUDED.range_name, status='active', updated_at=NOW()");
          await pool.query("UPDATE user_numbers u SET client=p.client_id, updated_at=NOW() FROM pool_numbers p WHERE u.number=p.number AND u.status='active' AND p.status='assigned' AND u.client IS DISTINCT FROM p.client_id");
          await pool.query("UPDATE user_numbers SET status='junk' WHERE status='released' AND NOT EXISTS (SELECT 1 FROM pool_numbers p WHERE p.number=user_numbers.number AND p.status IN ('free','assigned'))"); // V2H-JUNK
          await pool.query("DELETE FROM lamix_numbers_mirror m USING pool_numbers p WHERE m.number=p.number AND p.status='gone'");
          await pool.query("DELETE FROM pool_numbers WHERE status='gone' AND updated_at < NOW() - interval '20 minutes'");
          await pool.query("DELETE FROM user_numbers WHERE status='released' AND updated_at < NOW() - interval '7 days'");
          
          let h = [];
          try { h = JSON.parse(require('fs').readFileSync('/var/run/pool-history.json','utf8')); } catch(e){}
          const pr = await pool.query("SELECT COUNT(*) FILTER (WHERE status='assigned')::int a, COUNT(*) FILTER (WHERE status IN ('free','assigned'))::int t FROM pool_numbers");
          h.push({ t: Date.now(), total: pr.rows[0].t, free: pr.rows[0].t - pr.rows[0].a, assigned: pr.rows[0].a });
          if (h.length > 400) h = h.slice(-400);
          require('fs').writeFileSync('/var/run/pool-history.json', JSON.stringify(h));

          /* V2V-SAFE: pool junking disabled — refill-only model */
          /* V2X-STOP: pass-end user junking DISABLED until pool completeness proven */
          await pool.query("DELETE FROM user_numbers WHERE ctid = ANY(SELECT ctid FROM user_numbers WHERE status='junk' AND updated_at < NOW() - interval '2 minutes' ORDER BY updated_at LIMIT 5000)");
          await pool.query("DELETE FROM pool_numbers WHERE ctid = ANY(SELECT ctid FROM pool_numbers WHERE status='junk' AND updated_at < NOW() - interval '2 minutes' ORDER BY updated_at LIMIT 5000)");
          /* V2X-STOP: pass-end user junking DISABLED until pool completeness proven */ // V2K-JUNK
          await pool.query("UPDATE pool_numbers SET status='junk', client_id=NULL, updated_at=NOW() WHERE status IN ('free','assigned') AND lamix_synced_at < $1", [t0]);
          await pool.query("DELETE FROM user_numbers WHERE ctid = ANY(SELECT ctid FROM user_numbers WHERE status='junk' AND updated_at < NOW() - interval '2 minutes' ORDER BY updated_at LIMIT 5000)");
          await pool.query("DELETE FROM pool_numbers WHERE ctid = ANY(SELECT ctid FROM pool_numbers WHERE status='junk' AND updated_at < NOW() - interval '2 minutes' ORDER BY updated_at LIMIT 5000)");
          pool.query("UPDATE ranges SET last_num_sync=NOW()").catch(()=>{}); console.log('[recon] complete pages=' + pages + ' seen=' + seen);
          global.__reconState = { status:'done', fetched: seen, expected: seen, remaining: 0, startedAt: t0ms, endedAt: Date.now(), etaSecs: 0, etaAt: Date.now(), complete: true };
          global.__reconCurve = curve;
          global.__reconHb = Date.now();
          global.__reconSeen = seen;
          global.__reconComplete = complete;
        } else { console.log('[recon] partial pages=' + pages + ' seen=' + seen); }
      } catch (e) { console.error('[recon]', e.message); }
    }
    await new Promise(r => setTimeout(r, 15000));
  }
}

async function queueWorker(){ // V2Q-WORKER
  while(true){
    try{
      const b = await pool.query("SELECT * FROM alloc_queue WHERE status='pending' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED");
      const row = b.rows[0];
      if(row){
        const un = row.client || row.target_username || row.username || ''; // V2W2-TARGET first
        const rid = row.range_id || row.rangeid || '';
        const rname = row.range_name || row.rangename || '';
        const qty = parseInt(row.qty || row.quantity || row.numbers || 0, 10) || 0;
        await pace('/numbers/assign');
        const lock = await pool.query("SELECT number FROM pool_numbers WHERE range_id=$1 AND status='free' ORDER BY number LIMIT $2 FOR UPDATE SKIP LOCKED", [rid, qty]);
        const nums = lock.rows.map(r => r.number);
        if(!nums.length){
          await pool.query("UPDATE alloc_queue SET status='failed', result=$2, processed_at=NOW() WHERE id=$1", [row.id, JSON.stringify({error:'no free numbers in range'})]);
        } else {
          const lr = await lxPost('/numbers/assign', { client: un, numbers: nums, clientPayoutRate: String(row.payout || row.client_payout || 0.01) });
          if(lr && (lr._error || lr._rateLimited)){
            await pool.query("UPDATE alloc_queue SET result=$2 WHERE id=$1", [row.id, JSON.stringify({error: lr._error || 'rate limited, retrying'})]);
          } else {
            await pool.query("UPDATE pool_numbers SET status='assigned', client_id=$1, assigned_at=NOW(), updated_at=NOW() WHERE number = ANY($2)", [un, nums]);
            await pool.query("INSERT INTO user_numbers (number,client,range_id,range_name,status,updated_at) SELECT n,$1,$2,$3,'active',NOW() FROM UNNEST($4::text[]) n ON CONFLICT (number) DO UPDATE SET client=EXCLUDED.client,status='active',range_name=EXCLUDED.range_name,updated_at=NOW()", [un, rid, rname, nums]);
            await pool.query("UPDATE alloc_queue SET status='done', result=$2, processed_at=NOW() WHERE id=$1", [row.id, JSON.stringify({assigned: nums.length})]);
            broadcast('numbers'); broadcast('ranges');
          }
        }
      }
    }catch(e){ console.error('[queue]', e.message); }
    await new Promise(r => setTimeout(r, 1500));
  }
}
const _rangeRefreshTh = new Map(); // V2S-REFRESH
async function refreshRange(rangeId){
  const t0 = new Date().toISOString();
  let after = null, pages = 0, seen = 0;
  while (pages < 40) {
    const d = await lxGet('/numbers', after ? { rangeId: rangeId, limit: 500, after: after } : { rangeId: rangeId, limit: 500 });
    if (!d || d._error || d._rateLimited) break;
    const recs = d.records || [];
    if (recs.length) {
      const rows = recs.map(r => ({ num: String(r.number || ''), rid: r.rangeId ? String(r.rangeId) : rangeId, cli: r.client || '' }));
      await pool.query("INSERT INTO pool_numbers (number,range_id,status,client_id,lamix_synced_at,updated_at) SELECT n.num, NULLIF(n.rid,''), CASE WHEN n.cli='' THEN 'free' ELSE 'assigned' END, NULLIF(n.cli,''), $2, $2 FROM json_to_recordset($1) AS n(num text, rid text, cli text) ON CONFLICT (number) DO UPDATE SET range_id=EXCLUDED.range_id, status=EXCLUDED.status, client_id=EXCLUDED.client_id, lamix_synced_at=$2, updated_at=$2", [JSON.stringify(rows), t0]);
      seen += recs.length;
    }
    pages++; after = d.nextCursor || null; if (!after) break;
  }
  /* V2V-SAFE: per-range pool junking disabled */
  /* V2V-SAFE: per-range user junking disabled */
  await pool.query("INSERT INTO user_numbers (number,client,range_id,range_name,status,updated_at) SELECT p.number,p.client_id,p.range_id,r.name,'active',NOW() FROM pool_numbers p JOIN ranges r ON r.range_id=p.range_id WHERE p.range_id=$1 AND p.status='assigned' AND p.client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM user_numbers u WHERE u.number=p.number AND u.status='active') ON CONFLICT (number) DO UPDATE SET client=EXCLUDED.client,status='active',updated_at=NOW()", [rangeId]);
  await pool.query("UPDATE user_numbers u SET status='released', updated_at=NOW() WHERE u.status='active' AND range_name IN (SELECT name FROM ranges WHERE range_id=$1) AND EXISTS (SELECT 1 FROM pool_numbers p WHERE p.number=u.number AND p.status='free')", [rangeId]);
  await pool.query("UPDATE ranges SET last_num_sync=NOW() WHERE range_id=$1", [rangeId]);
  global.__reconHb = Date.now();
  broadcast('numbers'); broadcast('ranges');
  return { pages: pages, seen: seen };
}
function maybeRangeRefresh(rid){ if(!rid || rid.indexOf('r_')===0) return; const last=_rangeRefreshTh.get(rid)||0; if(Date.now()-last<60000) return; _rangeRefreshTh.set(rid,Date.now()); global.__reconDue = Date.now(); } // V2X
async function rangeRotLoop(){
  while (true) {
    try { const r = await pool.query("SELECT 1 FROM ranges WHERE total_numbers>0 AND (last_num_sync IS NULL OR last_num_sync < NOW() - interval '6 minutes') LIMIT 1"); if (r.rows[0]) global.__reconDue = Date.now(); } catch (e) {} // V2X scheduler
    await new Promise(rs => setTimeout(rs, 20000));
  }
}
if (process.env.V2_LIVE === '1') { cdrLoop(); syncLoop(); reconcileLoop(); queueWorker(); rangeRotLoop(); console.log('[v2] daemons LIVE (cdr+sync+reconcile)'); pool.query("UPDATE system_incidents SET status='dismissed' WHERE status='pending' AND type IN ('boat_failure','queue_overload')").catch(() => {}); } else console.log('[v2] daemons OFF (test)');

const verify = async (req, res, next) => { const t = req.body && req.body.session ? req.body.session : String(req.headers.authorization || '').replace('Bearer ', ''); if (!t) return res.status(401).json({ ok: false, error: 'No session' }); try { req.user = jwt.verify(t, process.env.JWT_SECRET); if (req.user && req.user.username && req.user.iat) { const __pc = await pwdChangedAt(String(req.user.username)); if (__pc && (req.user.iat * 1000) < __pc) { return res.status(401).json({ ok: false, error: 'Session expired — password changed. Sign in again.' }); } }; logAct(req.user.username, req.url); next(); } catch (e) { res.status(401).json({ ok: false, error: 'Session expired' }); } };

/* V2K-OVR shadow routes */
app.post('/api/stats', verify, async (req, res) => {
  let isSuper = String(req.user.username || '').toLowerCase() === SUPER_ADMIN;
  if (!isSuper) { try { isSuper = (await pool.query("SELECT 1 FROM user_roles WHERE username=$1 AND role IN ('super','admin')", [String(req.user.username || '').toLowerCase()])).rows.length > 0; } catch (e) {} }
  if (!isSuper) { try { isSuper = (await pool.query("SELECT 1 FROM user_roles WHERE username=$1 AND role IN ('super','admin')", [String(req.user.username || '').toLowerCase()])).rows.length > 0; } catch (e) {} }
  const t = await pool.query("SELECT COUNT(*) FILTER (WHERE status='free')::int f, COUNT(*) FILTER (WHERE status='assigned')::int a FROM pool_numbers");
  const rr = (await pool.query("SELECT p.range_id, COALESCE(r.name, p.range_id) AS name, COALESCE(r.prefix,'') AS prefix, COUNT(*) FILTER (WHERE p.status='free')::int free, COUNT(*) FILTER (WHERE p.status='assigned')::int assigned FROM pool_numbers p LEFT JOIN ranges r ON r.range_id=p.range_id GROUP BY 1,2,3")).rows;
  const cm = {}; rr.forEach(r => { const c = countryOf(r.name) || 'Other'; if (!cm[c]) cm[c] = { country: c, flag: flagOf(c), ranges: {} }; if (!cm[c].ranges[r.name]) cm[c].ranges[r.name] = { range: r.name, available: 0, total: 0 }; cm[c].ranges[r.name].total += r.free + r.assigned; cm[c].ranges[r.name].available += r.free; });
  const countries = Object.values(cm).map(c => ({ country: c.country, flag: c.flag, ranges: Object.values(c.ranges).sort((a, b) => b.available - a.available) })).sort((a, b) => a.country.localeCompare(b.country));
  let otpToday = 0, otpWeek = 0, otpMonth = 0, mostActiveRange = '—', mostActiveCount = 0;
  if (isSuper) {
    otpToday = (await pool.query("SELECT COUNT(*)::int c FROM sms_cdr WHERE time >= " + PKT_DAY_START)).rows[0].c;
    otpWeek = (await pool.query("SELECT COUNT(*)::int c FROM sms_cdr WHERE time >= " + PKT_DAY_START + " - interval '6 days'")).rows[0].c;
    otpMonth = (await pool.query("SELECT COUNT(*)::int c FROM sms_cdr WHERE time >= " + PKT_DAY_START + " - interval '29 days'")).rows[0].c;
    const ma = await pool.query("SELECT COALESCE(NULLIF(range,''),'Unknown') rn, COUNT(*)::int c FROM sms_cdr WHERE time >= " + PKT_DAY_START + " GROUP BY 1 ORDER BY 2 DESC LIMIT 1");
    if (ma.rows[0]) { mostActiveRange = ma.rows[0].rn; mostActiveCount = ma.rows[0].c; }
  }
  res.json({ ok: true, totalCountries: countries.length, totalRanges: rr.length, totalNumbers: t.rows[0].f + t.rows[0].a, allocated: t.rows[0].a, available: t.rows[0].f, otpToday: otpToday, otpWeek: otpWeek, otpMonth: otpMonth, mostActiveRange: mostActiveRange, mostActiveCount: mostActiveCount, countries: countries });
});
app.post('/api/smscount', verify, async (req, res) => {
  const u = req.user, alt = u.clientName || u.username;
  const c = await pool.query("SELECT COUNT(*)::int t FROM sms_cdr WHERE time >= " + PKT_DAY_START + " AND (LOWER(client)=LOWER($1) OR LOWER(client)=LOWER($2))", [u.username, alt]);
  const r = await pool.query("SELECT to_char(time AT TIME ZONE 'UTC','HH24:MI:SS') AS time, time AS datetime, number, cli, content AS message, range FROM sms_cdr WHERE time >= " + PKT_DAY_START + " AND (LOWER(client)=LOWER($1) OR LOWER(client)=LOWER($2)) ORDER BY time DESC LIMIT 50", [u.username, alt]);
  res.json({ ok: true, count: c.rows[0].t, recent: r.rows });
});
app.post('/api/smscount-range', verify, async (req, res) => {
  const u = req.user, alt = u.clientName || u.username, rg = req.body.range;
  const span = rg === 'week' ? " - interval '6 days'" : rg === 'month' ? " - interval '29 days'" : '';
  const c = await pool.query("SELECT COUNT(*)::int t FROM sms_cdr WHERE time >= " + PKT_DAY_START + span + " AND (LOWER(client)=LOWER($1) OR LOWER(client)=LOWER($2))", [u.username, alt]);
  res.json({ ok: true, count: c.rows[0].t, byNumber: {}, byRange: {} });
});
app.post('/api/leaderboard', verify, async (req, res) => {
  const rg = req.body.range || 'today';
  const span = rg === 'week' ? " - interval '6 days'" : rg === 'month' ? " - interval '29 days'" : '';
  const q = await pool.query("SELECT client AS username, COUNT(*)::int AS count FROM sms_cdr WHERE time >= " + PKT_DAY_START + span + " AND client IS NOT NULL AND client<>'' AND LOWER(client)<>'system generated' GROUP BY 1 ORDER BY 2 DESC LIMIT 50");
  const users = q.rows; const meKeys = [req.user.clientName, req.user.username].map(x => String(x || '').toLowerCase()).filter(Boolean); let me = null;
  for (let i = 0; i < users.length; i++) { const k = users[i].username.toLowerCase(); if (meKeys.some(m => k === m || k.includes(m) || m.includes(k))) { me = { rank: i + 1, username: users[i].username, count: users[i].count }; break; } }
  res.json({ ok: true, users: users, me: me, range: rg, total: users.length });
});
app.post('/api/number-smscount', verify, async (req, res) => {
  const n = String(req.body.number || '').replace(/[^0-9]/g, ''); if (!n) return res.json({ ok: true, number: n, count: 0, recent: [] });
  const c = await pool.query("SELECT COUNT(*)::int t FROM sms_cdr WHERE time >= " + PKT_DAY_START + " AND (number=$1 OR number LIKE '%'||$1 OR number LIKE $1||'%')", [n]);
  const r = await pool.query("SELECT to_char(time AT TIME ZONE 'UTC','HH24:MI:SS') AS time, cli, content AS message, number FROM sms_cdr WHERE time >= " + PKT_DAY_START + " AND (number=$1 OR number LIKE '%'||$1 OR number LIKE $1||'%') ORDER BY time DESC LIMIT 8", [n]);
  res.json({ ok: true, number: n, count: c.rows[0].t, recent: r.rows });
});
app.post('/api/admin/db-explorer', verify, async (req, res) => {
  if (req.body.meta) { const [c, r] = await Promise.all([pool.query("SELECT DISTINCT client FROM user_numbers WHERE client IS NOT NULL AND client<>'' ORDER BY 1"), pool.query("SELECT DISTINCT range_name FROM user_numbers WHERE range_name IS NOT NULL AND range_name<>'' ORDER BY 1")]); return res.json({ ok: true, clients: c.rows.map(x => x.client), ranges: r.rows.map(x => x.range_name) }); }
  const w = []; const P = []; if (req.body.client) { P.push(req.body.client); w.push("u.client=$" + P.length); } if (req.body.range) { P.push(req.body.range); w.push("u.range_name=$" + P.length); }
  const q = await pool.query("SELECT COALESCE(NULLIF(u.range_name,''),'?') AS range_name, COUNT(DISTINCT u.client)::int users, COUNT(*) FILTER (WHERE u.status='active')::int active, COUNT(*) FILTER (WHERE u.status='released')::int released, COUNT(*) FILTER (WHERE u.status='junk')::int junk, COUNT(*)::int total FROM user_numbers u " + (w.length ? "WHERE " + w.join(" AND ") : "") + " GROUP BY 1 ORDER BY total DESC LIMIT 200", P);
  res.json({ ok: true, rows: q.rows });
});
app.post('/api/admin/sync-progress', verify, async (req, res) => { const st = global.__reconState || { status: 'idle', fetched: 0, expected: 0, remaining: 0, etaSecs: 0 }; let eta = 0; if (st.status === 'running' && st.etaSecs) eta = Math.max(0, st.etaSecs - Math.round((Date.now() - (st.etaAt || Date.now())) / 1000)); res.json({ ok: true, prog: { status: st.status, fetched: st.fetched, expected: st.expected, remaining: st.remaining, unique: st.fetched, etaSecs: eta, startedAt: st.startedAt ? new Date(st.startedAt).toISOString() : null, endedAt: st.endedAt ? new Date(st.endedAt).toISOString() : null }, curve: (global.__reconCurve || []).slice(-120), hb: global.__reconHb || 0 }); });
app.post('/api/admin/reconcile-status', verify, async (req, res) => {
  const [p2, u, o, m, j, ls] = await Promise.all([
    pool.query("SELECT COUNT(*) FILTER (WHERE status IN ('free','assigned'))::int t, COUNT(*) FILTER (WHERE status='assigned')::int a FROM pool_numbers"),
    pool.query("SELECT COUNT(*)::int t, COUNT(*) FILTER (WHERE status='active')::int a FROM user_numbers"),
    pool.query("SELECT COUNT(*)::int c FROM user_numbers u WHERE u.status='active' AND NOT EXISTS (SELECT 1 FROM pool_numbers p WHERE p.number=u.number AND p.status IN ('free','assigned'))"),
    pool.query("SELECT COUNT(*)::int c FROM pool_numbers p WHERE p.status='assigned' AND NOT EXISTS (SELECT 1 FROM user_numbers u WHERE u.number=p.number AND u.status='active')"),
    pool.query("SELECT COUNT(*)::int c FROM user_numbers WHERE status='junk'"),
    pool.query("SELECT MAX(lamix_synced_at)::text t FROM pool_numbers")]);
  res.json({ ok: true, mirror_total: p2.rows[0].t, mirror_assigned: p2.rows[0].a, db_total: u.rows[0].t, db_assigned: u.rows[0].a, orphans: o.rows[0].c, missing: m.rows[0].c, junk: j.rows[0].c, last_sync: ls.rows[0].t });
});
app.post('/api/admin/crush-options', verify, async (req, res) => {
  const act = await pool.query("SELECT COALESCE(NULLIF(range_name,''),'?') AS nm, COUNT(*)::int c, COUNT(DISTINCT client)::int u FROM user_numbers WHERE status='active' GROUP BY 1 ORDER BY c DESC");
  const junk = await pool.query("SELECT COALESCE(NULLIF(range_name,''),'?') AS nm, COUNT(*)::int c FROM user_numbers WHERE status='junk' GROUP BY 1 ORDER BY c DESC");
  res.json({ ok: true, options: act.rows.map(r => ({ range_name: r.nm, range_id: '', count: r.c, users: r.u, gone: false, live: true })), suggestions: junk.rows.map((r, i) => ({ id: -(i + 1), range_name: r.nm, rows_alive: r.c, status: 'suggested', source: 'junk' })) });
});
app.post('/api/admin/range-crush', verify, async (req, res) => {
  const name = String(req.body.rangeName || '').trim(); if (!name) return res.status(400).json({ ok: false, error: 'rangeName required' });
  const hard = !!req.body.hard;
  const del = hard ? await pool.query("DELETE FROM user_numbers WHERE range_name=$1", [name]) : await pool.query("DELETE FROM user_numbers WHERE range_name=$1 AND status='junk'", [name]);
  broadcast('numbers'); broadcast('ranges');
  res.json({ ok: true, crushed: del.rowCount, mode: hard ? 'deleted-all' : 'junk-only' });
});
app.post('/api/admin/crush-orphans', verify, async (req, res) => { const a = await pool.query("DELETE FROM user_numbers WHERE status='junk'"); const b = await pool.query("DELETE FROM pool_numbers WHERE status='junk'"); broadcast('numbers'); broadcast('ranges'); res.json({ ok: true, deleted: a.rowCount, poolDeleted: b.rowCount }); });
app.post('/api/admin/bulk-ranges', verify, async (req, res) => { // V2Z2-BULK pool-truth (same source as ADD page)
  const q = await pool.query("SELECT p.range_id AS range_id, COALESCE(r.name, p.range_id) AS name, COUNT(*)::int AS unassigned FROM pool_numbers p LEFT JOIN ranges r ON r.range_id=p.range_id WHERE p.status='free' GROUP BY 1,2 HAVING COUNT(*)>0 ORDER BY 2 LIMIT 800");
  res.json({ ok: true, ranges: q.rows });
});
app.post('/api/admin/bulk-queue', verify, async (req, res) => { // V2Z3-BULKQ pool-truth math
  const me = String(req.user.username || '');
  const rangeIds = Array.isArray(req.body.rangeIds) ? req.body.rangeIds.map(String) : [];
  const users = Array.isArray(req.body.users) ? req.body.users.map(String) : [];
  const per = Math.max(1, Math.min(1000, parseInt(req.body.perRange, 10) || 0));
  if (!rangeIds.length || !users.length || !per) return res.status(400).json({ ok: false, error: 'Select ranges, users and numbers per range (1-1000).' });
  const rr = await pool.query("SELECT p.range_id, COALESCE(r.name,p.range_id) AS name, COUNT(*) FILTER (WHERE p.status='free')::int free FROM pool_numbers p LEFT JOIN ranges r ON r.range_id=p.range_id WHERE p.range_id = ANY($1) GROUP BY 1,2", [rangeIds]);
  const need = users.length * per;
  const short = rr.rows.filter(x => x.free < need).map(x => ({ range: x.name, free: x.free, needed: need }));
  if (short.length) return res.json({ ok: false, queued: 0, error: 'Not enough free numbers in: ' + short.map(x => x.range + ' (' + x.free + ' free < ' + x.needed + ' needed)').join('; ') + '. Uncheck those ranges or lower numbers per range.', short: short });
  let queued = 0;
  for (const rg of rr.rows) for (const u of users) { await pool.query("INSERT INTO alloc_queue (username, client, range_id, range_name, qty, status) VALUES ($1,$2,$3,$4,$5,'pending')", [me, u, rg.range_id, rg.name, per]); queued++; }
  broadcast('numbers'); broadcast('ranges');
  res.json({ ok: true, queued: queued, batches: queued, perRange: per, users: users.length, plan: rr.rows.map(x => x.name + ' (' + x.free + ' free)').join(', ') });
});
let _limCache=null,_limAt=0; // V3-LIMITS
async function getLimits(){ const now=Date.now(); if(_limCache && now-_limAt<30000) return _limCache; try{ const r=await pool.query("SELECT qty_min,qty_max,range_daily,country_daily FROM alloc_limits WHERE id=1"); if(r.rows[0]){ _limCache={qtyMin:r.rows[0].qty_min,qtyMax:r.rows[0].qty_max,rangeDaily:r.rows[0].range_daily,countryDaily:r.rows[0].country_daily}; _limAt=now; return _limCache; } }catch(e){} _limCache={qtyMin:1,qtyMax:25,rangeDaily:50,countryDaily:100}; _limAt=now; return _limCache; }
app.post('/api/alloc/limits', verify, async (req,res)=>{ res.json({ok:true, limits: await getLimits()}); });
app.post('/api/admin/limits-get', verify, async (req,res)=>{ const un=String(req.user.username||'').toLowerCase(); let isSuper= un===SUPER_ADMIN; if(!isSuper){ try{ isSuper=(await pool.query("SELECT 1 FROM user_roles WHERE username=$1 AND role IN ('super','admin')",[un])).rows.length>0; }catch(e){} } if(!isSuper) return res.status(403).json({ok:false,error:'admin only'}); res.json({ok:true, limits: await getLimits()}); });
app.post('/api/admin/limits-set', verify, async (req,res)=>{ const un=String(req.user.username||'').toLowerCase(); let isSuper= un===SUPER_ADMIN; if(!isSuper){ try{ isSuper=(await pool.query("SELECT 1 FROM user_roles WHERE username=$1 AND role='super'",[un])).rows.length>0; }catch(e){} } if(!isSuper) return res.status(403).json({ok:false,error:'super only'}); const qm=Math.max(1,Math.min(1000,parseInt(req.body.qtyMax,10)||25)); const rd=Math.max(1,Math.min(100000,parseInt(req.body.rangeDaily,10)||50)); const cd=Math.max(1,Math.min(100000,parseInt(req.body.countryDaily,10)||100)); await pool.query("INSERT INTO alloc_limits(id,qty_min,qty_max,range_daily,country_daily) VALUES(1,1,$1,$2,$3) ON CONFLICT(id) DO UPDATE SET qty_max=$1, range_daily=$2, country_daily=$3",[qm,rd,cd]); _limCache=null; _limAt=0; res.json({ok:true, limits: await getLimits()}); });
app.post('/api/alloc/daily-used', verify, async (req,res)=>{ const L=await getLimits(); const u=req.user.username; const rid=String(req.body.rangeId||''); const ctry=String(req.body.country||''); const q=await pool.query("SELECT country, range_id, COALESCE(SUM(qty),0)::int c FROM alloc_events WHERE username=$1 AND created_at >= "+PKT_DAY_START+" GROUP BY 1,2",[u]); let cu=0,ru=0; q.rows.forEach(x=>{ if(ctry&&x.country===ctry)cu+=x.c; if(rid&&x.range_id===rid)ru+=x.c; }); res.json({ok:true,countryUsed:cu,rangeUsed:ru,countryUsedToday:cu,rangeUsedToday:ru,used:cu,countryLimit:L.countryDaily,rangeLimit:L.rangeDaily,limit:L.countryDaily,limits:L}); });
app.post('/api/alloc/allocate', verify, async (req, res) => { // V3B-ALLOC shadow: limits enforced
  const u = req.user.username, rid = String(req.body.rangeId || ''), qtyReq = parseInt(req.body.quantity || req.body.qty, 10) || 0;
  const L0 = await getLimits();
  const rtitle = String(req.body.rangeTitle || ''), ctry = countryOf(rtitle);
  const payout = parseFloat(req.body.payout) || 0.01;
  if (qtyReq < L0.qtyMin || qtyReq > L0.qtyMax) return res.json({ ok: false, error: 'Quantity must be between ' + L0.qtyMin + ' and ' + L0.qtyMax + ' per allocation (admin limit).' });
  const caps = await pool.query("SELECT country, range_id, COALESCE(SUM(qty),0)::int c FROM alloc_events WHERE username=$1 AND created_at >= " + PKT_DAY_START + " GROUP BY 1,2", [u]);
  let cu = 0, ru = 0; caps.rows.forEach(x => { if (x.country === ctry) cu += x.c; if (x.range_id === rid) ru += x.c; });
  if (u.toLowerCase() !== SUPER_ADMIN) {
    if (ru + qtyReq > L0.rangeDaily) return res.json({ ok: true, limitReached: true, capType: 'range', country: ctry, used: ru, limit: L0.rangeDaily, remaining: Math.max(0, L0.rangeDaily - ru), message: 'Range daily limit ' + L0.rangeDaily + ' reached (used ' + ru + ' today).' });
    if (cu + qtyReq > L0.countryDaily) return res.json({ ok: true, limitReached: true, capType: 'country', country: ctry, used: cu, limit: L0.countryDaily, remaining: Math.max(0, L0.countryDaily - cu), message: 'Country daily limit ' + L0.countryDaily + ' reached (used ' + cu + ' today).' });
  }
  const cl = await pool.connect();
  try {
    await cl.query('BEGIN');
    const lock = await cl.query("SELECT number FROM pool_numbers WHERE range_id=$1 AND status='free' ORDER BY number LIMIT $2 FOR UPDATE SKIP LOCKED", [rid, qtyReq]);
    if (!lock.rows.length) { await cl.query('ROLLBACK'); return res.status(400).json({ ok: false, error: 'No free numbers left in this range right now.' }); }
    const nums = lock.rows.map(r => r.number);
    const lr = await lxPost('/numbers/assign', { client: u, numbers: nums, clientPayoutRate: String(payout) });
    if (lr && (lr._error || lr._rateLimited)) { await cl.query('ROLLBACK'); return res.status(502).json({ ok: false, error: 'LaMix assign failed: ' + (lr._error || 'rate limited') }); }
    await cl.query("UPDATE pool_numbers SET status='assigned', client_id=$1, assigned_at=NOW(), updated_at=NOW() WHERE number = ANY($2)", [u, nums]);
    await cl.query("INSERT INTO user_numbers (number, client, range_id, range_name, status, updated_at) SELECT n, $1, $2, $3, 'active', NOW() FROM UNNEST($4::text[]) n ON CONFLICT (number) DO UPDATE SET client=EXCLUDED.client, status='active', range_name=EXCLUDED.range_name, updated_at=NOW()", [u, rid, rtitle, nums]);
    await cl.query("INSERT INTO alloc_events (username, country, range_id, range_title, qty) VALUES ($1,$2,$3,$4,$5)", [u, ctry, rid, rtitle, nums.length]);
    await cl.query('COMMIT');
    broadcast('numbers'); broadcast('ranges');
    res.json({ ok: true, instant: true, allocated: nums.length, country: ctry, used: cu + nums.length, limit: L0.countryDaily, remaining: Math.max(0, L0.countryDaily - (cu + nums.length)), limits: L0, message: 'Delivered instantly.' });
  } catch (e) { await cl.query('ROLLBACK'); res.status(500).json({ ok: false, error: e.message }); } finally { cl.release(); }
});
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return salt + ':' + hash;
}
function verifyPassword(pw, stored) {
  try {
    if (!stored || typeof stored !== 'string' || !stored.includes(':')) return false;
    const [salt, hash] = stored.split(':');
    const test = crypto.scryptSync(String(pw), salt, 64).toString('hex');
    const a = Buffer.from(hash, 'hex'), b = Buffer.from(test, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}
const __pcCache = new Map(); // V4-SESWIPE
async function pwdChangedAt(un) {
  const now = Date.now(); const hit = __pcCache.get(un);
  if (hit && now - hit.at < 10000) return hit.ms;
  try {
    const t = await pool.query("SELECT table_name FROM information_schema.columns WHERE column_name='pwd_changed_at' LIMIT 1");
    if (!t.rows[0]) { __pcCache.set(un, { at: now, ms: 0 }); return 0; }
    const r = await pool.query('SELECT pwd_changed_at FROM "' + t.rows[0].table_name + '" WHERE username=$1', [un]);
    const ms = r.rows[0] && r.rows[0].pwd_changed_at ? new Date(r.rows[0].pwd_changed_at).getTime() : 0;
    __pcCache.set(un, { at: now, ms: ms }); return ms;
  } catch (e) { return 0; }
}
app.post('/api/auth/change-password', verify, async (req, res) => {
  const u = String(req.user.username || '');
  const oldP = String(req.body.oldPassword || req.body.current || '');
  const newP = String(req.body.newPassword || req.body.next || '');
  if (!newP || newP.length < 6) return res.status(400).json({ ok: false, error: 'New password must be at least 6 characters.' });
  const t = await pool.query("SELECT table_name FROM information_schema.columns WHERE column_name='pass_hash' LIMIT 1");
  if (!t.rows[0]) return res.status(400).json({ ok: false, error: 'Password storage not configured.' });
  const T = t.rows[0].table_name;
  const c = await pool.query('SELECT * FROM "' + T + '" WHERE username=$1', [u]);
  const creds = c.rows[0];
  if (!creds || !creds.pass_hash) return res.status(404).json({ ok: false, error: 'No password set yet.' });
  if (!verifyPassword(oldP, creds.pass_hash)) return res.status(401).json({ ok: false, error: 'Current password is incorrect.' });
  await pool.query('UPDATE "' + T + '" SET pass_hash=$2 WHERE username=$1', [u, hashPassword(newP)]);
  await pool.query('UPDATE "' + T + '" SET pwd_changed_at=NOW() WHERE username=$1', [u]).catch(function(){});
  __pcCache.delete(u);
  res.json({ ok: true, message: 'Password updated — all sessions signed out.' });
});
app.post('/api/ping', verify, (req, res) => res.json({ ok: true }));
app.post('/api/auth/role', verify, async (req, res) => { const un = String(req.user.username || '').toLowerCase(); let role = 'none'; if (un === SUPER_ADMIN) role = 'super'; else { const r = await pool.query('SELECT role FROM user_roles WHERE username=$1', [un]); if (r.rows[0] && r.rows[0].role) role = r.rows[0].role; } res.json({ ok: true, role: role, username: req.user.username }); });
app.post('/api/ranges', verify, async (req, res) => { // V2R-POOLREAD (LaMix truth only)
  const u = req.user, alt = u.clientName || u.username;
  const q = await pool.query("SELECT p.range_id AS id, COALESCE(r.name, p.range_id) AS title, COALESCE(r.prefix,'') AS prefix, COUNT(*)::int AS count FROM pool_numbers p LEFT JOIN ranges r ON r.range_id=p.range_id WHERE p.status='assigned' AND (LOWER(p.client_id)=LOWER($1) OR LOWER(p.client_id)=LOWER($2)) GROUP BY 1,2,3 ORDER BY 2", [u.username, alt]);
  res.json({ ok: true, ranges: q.rows.map(r => ({ id: r.id, title: r.title, prefix: r.prefix, country: countryOf(r.title), count: r.count })) });
});
app.post('/api/numbers', verify, async (req, res) => { // V2R-POOLREAD
  const u = req.user, alt = u.clientName || u.username, P = [u.username, alt];
  let sql = "SELECT number FROM pool_numbers WHERE status='assigned' AND (LOWER(client_id)=LOWER($1) OR LOWER(client_id)=LOWER($2))";
  const rid = String(req.body.rangeId || ''), rt = String(req.body.rangeTitle || '');
  if (rid && rid.indexOf('r_') !== 0) { P.push(rid); sql += ' AND range_id=$3'; }
  else if (rt) { P.push(rt); sql += " AND range_id IN (SELECT range_id FROM ranges WHERE name=$3)"; }
  maybeRangeRefresh(rid);
  const q = await pool.query(sql, P);
  res.json({ ok: true, numbers: q.rows.map(r => r.number) });
});
app.post('/api/smscount', verify, async (req, res) => { // V2J-SMSC
  const u = req.user, alt = u.clientName || u.username;
  const c = await pool.query("SELECT COUNT(*)::int t FROM sms_cdr WHERE time >= " + PKT_DAY_START + " AND (LOWER(client)=LOWER($1) OR LOWER(client)=LOWER($2))", [u.username, alt]);
  const r = await pool.query("SELECT to_char(time AT TIME ZONE 'UTC','HH24:MI:SS') AS time, time AS datetime, number, cli, content AS message, range FROM sms_cdr WHERE time >= " + PKT_DAY_START + " AND (LOWER(client)=LOWER($1) OR LOWER(client)=LOWER($2)) ORDER BY time DESC LIMIT 50", [u.username, alt]);
  res.json({ ok: true, count: c.rows[0].t, recent: r.rows });
});
app.post('/api/smscount-range', verify, async (req, res) => { // V2J-RANGE
  const u = req.user, alt = u.clientName || u.username, rg = req.body.range;
  const span = rg === 'week' ? " - interval '6 days'" : rg === 'month' ? " - interval '29 days'" : '';
  const c = await pool.query("SELECT COUNT(*)::int t FROM sms_cdr WHERE time >= " + PKT_DAY_START + span + " AND (LOWER(client)=LOWER($1) OR LOWER(client)=LOWER($2))", [u.username, alt]);
  res.json({ ok: true, count: c.rows[0].t, byNumber: {}, byRange: {} });
});
app.post('/api/number-smscount', verify, async (req, res) => { const n = String(req.body.number || '').replace(/[^0-9]/g, ''); if (!n) return res.json({ ok: true, number: n, count: 0, recent: [] }); const c = await pool.query("SELECT COUNT(*)::int t FROM sms_cdr WHERE time >= " + PKT_DAY_START + " AND (number=$1 OR number LIKE '%'||$1 OR number LIKE $1||'%')", [n]); const r = await pool.query("SELECT to_char(time AT TIME ZONE 'UTC','HH24:MI:SS') AS time, cli, content AS message, number FROM sms_cdr WHERE time >= " + PKT_DAY_START + " AND (number=$1 OR number LIKE '%'||$1 OR number LIKE $1||'%') ORDER BY time DESC LIMIT 8", [n]); res.json({ ok: true, number: n, count: c.rows[0].t, recent: r.rows }); });
app.post('/api/leaderboard', verify, async (req, res) => { // V2J-LB
  const rg = req.body.range || 'today';
  const span = rg === 'week' ? " - interval '6 days'" : rg === 'month' ? " - interval '29 days'" : '';
  const q = await pool.query("SELECT client AS username, COUNT(*)::int AS count FROM sms_cdr WHERE time >= " + PKT_DAY_START + span + " AND client IS NOT NULL AND client<>'' AND LOWER(client)<>'system generated' GROUP BY 1 ORDER BY 2 DESC LIMIT 50");
  const users = q.rows; const meKeys = [req.user.clientName, req.user.username].map(x => String(x || '').toLowerCase()).filter(Boolean); let me = null;
  for (let i = 0; i < users.length; i++) { const k = users[i].username.toLowerCase(); if (meKeys.some(m => k === m || k.includes(m) || m.includes(k))) { me = { rank: i + 1, username: users[i].username, count: users[i].count }; break; } }
  res.json({ ok: true, users: users, me: me, range: rg, total: users.length });
});
app.post('/api/alloc/search-ranges', verify, async (req, res) => { // V2Y-POOLTRUTH
  const q = String(req.body.query || '').toLowerCase().trim();
  const rows = (await pool.query("SELECT p.range_id AS id, COALESCE(r.name, p.range_id) AS title, COALESCE(r.prefix,'') AS prefix, COUNT(*) FILTER (WHERE p.status='free')::int AS available, COUNT(*) FILTER (WHERE p.status='assigned')::int AS assigned FROM pool_numbers p LEFT JOIN ranges r ON r.range_id=p.range_id GROUP BY 1,2,3 HAVING COUNT(*) FILTER (WHERE p.status='free') > 0 ORDER BY 2")).rows;
  const mapped = rows.map(r => ({ id: r.id, title: r.title, prefix: r.prefix, country: countryOf(r.title), total: r.available + r.assigned, available: r.available }));
  const filt = !q ? mapped : mapped.filter(r => ((r.country || '') + ' ' + (r.title || '')).toLowerCase().indexOf(q) >= 0);
  res.json({ ok: true, ranges: filt });
});
app.post('/api/alloc/daily-used', verify, async (req, res) => { const u = req.user.username, ctry = countryOf(req.body.rangeTitle || req.body.country || ''), rid = String(req.body.rangeId || ''); const r = await pool.query("SELECT country, range_id, COALESCE(SUM(qty),0)::int c FROM alloc_events WHERE username=$1 AND created_at >= " + PKT_DAY_START + " GROUP BY 1,2", [u]); let cu = 0, ru = 0; r.rows.forEach(x => { if (x.country === ctry) cu += x.c; if (x.range_id === rid) ru += x.c; }); if (u.toLowerCase() === SUPER_ADMIN) return res.json({ ok: true, country: ctry, rangeUsed: ru, rangeLimit: 999, countryUsed: cu, countryLimit: 999, remaining: 999, exempt: true }); res.json({ ok: true, country: ctry, rangeUsed: ru, rangeLimit: 3, countryUsed: cu, countryLimit: 6, remaining: Math.max(0, Math.min(3 - ru, 6 - cu)) }); });
app.post('/api/alloc/allocate', verify, async (req, res) => { const u = req.user.username, rid = String(req.body.rangeId || ''), L0 = await getLimits(), qty = Math.min(L0.qtyMax, Math.max(L0.qtyMin, parseInt(req.body.quantity || req.body.qty, 10) || 1)), payout = parseFloat(req.body.payout) || 0.01, rtitle = String(req.body.rangeTitle || ''), ctry = countryOf(rtitle); const caps = await pool.query("SELECT country, range_id, COALESCE(SUM(qty),0)::int c FROM alloc_events WHERE username=$1 AND created_at >= " + PKT_DAY_START + " GROUP BY 1,2", [u]); let cu = 0, ru = 0; caps.rows.forEach(x => { if (x.country === ctry) cu += x.c; if (x.range_id === rid) ru += x.c; }); if (u.toLowerCase() !== SUPER_ADMIN) { if (ru >= L0.rangeDaily) return res.json({ ok: true, limitReached: true, capType: 'range', country: ctry, used: ru, limit: L0.rangeDaily, remaining: 0, message: 'Max ' + L0.rangeDaily + ' per range per day reached.' }); if (cu >= L0.countryDaily) return res.json({ ok: true, limitReached: true, capType: 'country', country: ctry, used: cu, limit: L0.countryDaily, remaining: 0, message: 'Max ' + L0.countryDaily + ' per country per day reached.' }); } const cl = await pool.connect(); try { await cl.query('BEGIN'); const lock = await cl.query("SELECT number FROM pool_numbers WHERE range_id=$1 AND status='free' ORDER BY number LIMIT $2 FOR UPDATE SKIP LOCKED", [rid, qty]); if (!lock.rows.length) { await cl.query('ROLLBACK'); return res.status(400).json({ ok: false, error: 'No free numbers left in this range right now.' }); } const nums = lock.rows.map(r => r.number); const lr = await lxPost('/numbers/assign', { client: u, numbers: nums, clientPayoutRate: String(payout) }); if (lr && (lr._error || lr._rateLimited)) { await cl.query('ROLLBACK'); return res.status(502).json({ ok: false, error: 'LaMix assign failed: ' + (lr._error || 'rate limited') }); } await cl.query("UPDATE pool_numbers SET status='assigned', client_id=$1, assigned_at=NOW(), updated_at=NOW() WHERE number = ANY($2)", [u, nums]); await cl.query("INSERT INTO user_numbers (number, client, range_id, range_name, status, updated_at) SELECT n, $1, $2, $3, 'active', NOW() FROM UNNEST($4::text[]) n ON CONFLICT (number) DO UPDATE SET client=EXCLUDED.client, status='active', range_name=EXCLUDED.range_name, updated_at=NOW()", [u, rid, rtitle, nums]); await cl.query("INSERT INTO alloc_events (username, country, range_id, range_title, qty) VALUES ($1,$2,$3,$4,$5)", [u, ctry, rid, rtitle, nums.length]); await cl.query('COMMIT'); broadcast('numbers'); broadcast('ranges'); res.json({ ok: true, instant: true, allocated: nums.length, country: ctry, used: cu + qty, limit: L0.countryDaily, remaining: Math.max(0, L0.countryDaily - (cu + qty)), message: 'Delivered instantly.' }); } catch (e) { await cl.query('ROLLBACK'); res.status(500).json({ ok: false, error: e.message }); } finally { cl.release(); } });
app.post('/api/range/unassign', verify, async (req, res) => { const u = req.user.username, alt = req.user.clientName || u, rid = String(req.body.rangeId || ''); const rows = (await pool.query("SELECT number FROM user_numbers WHERE status='active' AND (LOWER(client)=LOWER($1) OR LOWER(client)=LOWER($2)) AND (range_id=$3 OR range_id IS NULL OR range_id='')", [u, alt, rid])).rows; const nums = rows.map(r => r.number); if (!nums.length) return res.json({ ok: true, removed: 0, message: 'No numbers found to unassign' }); for (let i = 0; i < nums.length; i += 1000) { const lr = await lxPost('/numbers/unassign', { numbers: nums.slice(i, i + 1000) }); if (lr && (lr._error || lr._rateLimited)) return res.status(500).json({ ok: false, error: 'LaMix unassign failed' }); } await pool.query("UPDATE user_numbers SET status='released', updated_at=NOW() WHERE number = ANY($1)", [nums]); await pool.query("UPDATE pool_numbers SET status='free', client_id=NULL, updated_at=NOW() WHERE number = ANY($1)", [nums]); broadcast('numbers'); broadcast('ranges'); res.json({ ok: true, removed: nums.length, message: 'Unassigned ' + nums.length + ' numbers' }); });
app.post('/api/stats', verify, async (req, res) => {
  let isSuper = String(req.user.username || '').toLowerCase() === SUPER_ADMIN;
  if (!isSuper) { try { isSuper = (await pool.query("SELECT 1 FROM user_roles WHERE username=$1 AND role IN ('super','admin')", [String(req.user.username || '').toLowerCase()])).rows.length > 0; } catch (e) {} }
  if (!isSuper) { try { isSuper = (await pool.query("SELECT 1 FROM user_roles WHERE username=$1 AND role IN ('super','admin')", [String(req.user.username || '').toLowerCase()])).rows.length > 0; } catch (e) {} }
  const t = await pool.query("SELECT COUNT(*) FILTER (WHERE status='free')::int f, COUNT(*) FILTER (WHERE status='assigned')::int a FROM pool_numbers");
  const rr = (await pool.query("SELECT range_id, name, prefix, total_numbers FROM ranges WHERE total_numbers > 0")).rows;
  const av = await pool.query("SELECT range_id, COUNT(*)::int c FROM pool_numbers WHERE status='assigned' GROUP BY 1");
  const avm = {}; av.rows.forEach(x => avm[x.range_id] = x.c);
  const cm = {}; rr.forEach(r => { const c = countryOf(r.name) || 'Other'; if (!cm[c]) cm[c] = { country: c, flag: flagOf(c), ranges: {} }; if (!cm[c].ranges[r.name]) cm[c].ranges[r.name] = { range: r.name, available: 0, total: 0 }; cm[c].ranges[r.name].total += r.total_numbers; cm[c].ranges[r.name].available += Math.max(0, r.total_numbers - (avm[r.range_id] || 0)); });
  const countries = Object.values(cm).map(c => ({ country: c.country, flag: c.flag, ranges: Object.values(c.ranges).sort((a, b) => b.available - a.available) })).sort((a, b) => a.country.localeCompare(b.country));
  let otpToday = 0, otpWeek = 0, otpMonth = 0, mostActiveRange = '—', mostActiveCount = 0;
  if (isSuper) {
    otpToday = (await pool.query("SELECT COUNT(*)::int c FROM sms_cdr WHERE time >= " + PKT_DAY_START)).rows[0].c;
    otpWeek = (await pool.query("SELECT COUNT(*)::int c FROM sms_cdr WHERE time >= " + PKT_DAY_START + " - interval '6 days'")).rows[0].c;
    otpMonth = (await pool.query("SELECT COUNT(*)::int c FROM sms_cdr WHERE time >= " + PKT_DAY_START + " - interval '29 days'")).rows[0].c;
    const ma = await pool.query("SELECT COALESCE(NULLIF(range,''),'Unknown') rn, COUNT(*)::int c FROM sms_cdr WHERE time >= " + PKT_DAY_START + " GROUP BY 1 ORDER BY 2 DESC LIMIT 1");
    if (ma.rows[0]) { mostActiveRange = ma.rows[0].rn; mostActiveCount = ma.rows[0].c; }
  }
  res.json({ ok: true, totalCountries: countries.length, totalRanges: rr.length, totalNumbers: t.rows[0].f + t.rows[0].a, allocated: t.rows[0].a, available: t.rows[0].f, otpToday: otpToday, otpWeek: otpWeek, otpMonth: otpMonth, mostActiveRange: mostActiveRange, mostActiveCount: mostActiveCount, countries: countries });
});
app.post('/api/alloc/queue-list', verify, async (req, res) => {
  const un = String(req.user.username || '').toLowerCase();
  let isAdmin = un === SUPER_ADMIN;
  if (!isAdmin) { try { const rr = await pool.query("SELECT 1 FROM user_roles WHERE username=$1 AND role IN ('super','admin')", [un]); isAdmin = rr.rows.length > 0; } catch (e) {} }
  const q = await pool.query("SELECT id, COALESCE(NULLIF(client,''),username) AS username, range_id, range_name, qty, status, created_at, result FROM alloc_queue ORDER BY id DESC LIMIT 50");
  res.json({ ok: true, admin: isAdmin, items: q.rows.map(r => ({ id: r.id, username: r.username, range_id: r.range_id, range_name: r.range_name, qty: r.qty, status: r.status, created_at: r.created_at, result: r.result })) });
});
app.post('/api/alloc/queue-status', verify, async (req, res) => {
  const g = await pool.query("SELECT COUNT(*)::int n FROM alloc_queue WHERE status='pending'");
  const m = await pool.query("SELECT COUNT(*)::int n FROM alloc_queue WHERE status='pending' AND username=$1", [req.user.username]);
  res.json({ ok: true, totalBatches: g.rows[0].n, myPosition: m.rows[0].n, myEtaMins: Math.ceil(m.rows[0].n / 38), globalEtaMins: Math.ceil(g.rows[0].n / 38) });
});
app.post('/api/alloc/status', verify, async (req, res) => {
  const q = await pool.query("SELECT id, status, result, range_name, qty FROM alloc_queue WHERE username=$1 ORDER BY id DESC LIMIT 1", [req.user.username]);
  res.json({ ok: true, items: q.rows, isAdmin: false, total: q.rows.length });
});

app.post('/api/admin/sync-progress', verify, async (req, res) => { const st = global.__reconState || { status:'idle', fetched:0, expected:0, remaining:0, etaSecs:0 }; let eta = 0; if (st.status === 'running' && st.etaSecs) { eta = Math.max(0, st.etaSecs - Math.round((Date.now() - (st.etaAt || Date.now())) / 1000)); } res.json({ ok: true, prog: { status: st.status, fetched: st.fetched, expected: st.expected, remaining: st.remaining, unique: st.fetched, etaSecs: eta, startedAt: st.startedAt ? new Date(st.startedAt).toISOString() : null, endedAt: st.endedAt ? new Date(st.endedAt).toISOString() : null }, curve: (global.__reconCurve || []).slice(-120), hb: global.__reconHb || 0 }); });
app.post('/api/admin/reconcile-status', verify, async (req, res) => { const [p2, u, o, m, ls] = await Promise.all([ pool.query("SELECT COUNT(*) FILTER (WHERE status IN ('free','assigned'))::int t, COUNT(*) FILTER (WHERE status='assigned')::int a FROM pool_numbers"), pool.query("SELECT COUNT(*)::int t, COUNT(*) FILTER (WHERE status='active')::int a FROM user_numbers"), pool.query("SELECT COUNT(*)::int c FROM user_numbers u WHERE u.status='active' AND NOT EXISTS (SELECT 1 FROM pool_numbers p WHERE p.number=u.number AND p.status='assigned')"), pool.query("SELECT COUNT(*)::int c FROM pool_numbers p WHERE p.status='assigned' AND NOT EXISTS (SELECT 1 FROM user_numbers u WHERE u.number=p.number AND u.status='active')"), pool.query("SELECT MAX(lamix_synced_at)::text t FROM pool_numbers") ]); const st = global.__reconState || {}; res.json({ ok: true, mirror_total: p2.rows[0].t, mirror_assigned: p2.rows[0].a, db_total: u.rows[0].t, db_assigned: u.rows[0].a, orphans: o.rows[0].c, missing: m.rows[0].c, junk: (await pool.query("SELECT COUNT(*)::int c FROM user_numbers WHERE status='junk'")).rows[0].c, last_sync: ls.rows[0].t, sync_status: st.status || 'idle', eta_secs: st.etaSecs || 0, fetched: st.fetched || 0, expected: st.expected || 0 }); });
const _zrole = async (un) => { if (String(un||'').toLowerCase() === SUPER_ADMIN) return 'super'; const r = await pool.query('SELECT role FROM user_roles WHERE username=$1', [String(un||'').toLowerCase()]); return (r.rows[0] && r.rows[0].role) ? r.rows[0].role : 'none'; };
const IDLE_COND = "u.status='released' AND NOT EXISTS (SELECT 1 FROM pool_numbers p WHERE p.number=u.number AND p.status IN ('free','assigned'))";
app.post('/api/admin/crush-options', verify, async (req, res) => { // V2I-OVR
  const act = await pool.query("SELECT COALESCE(NULLIF(range_name,''),'?') AS nm, COUNT(*)::int c, COUNT(DISTINCT client)::int u FROM user_numbers WHERE status='active' GROUP BY 1 ORDER BY c DESC");
  const junk = await pool.query("SELECT COALESCE(NULLIF(range_name,''),'?') AS nm, COUNT(*)::int c FROM user_numbers WHERE status='junk' GROUP BY 1 ORDER BY c DESC");
  res.json({ ok: true, options: act.rows.map(r => ({ range_name: r.nm, range_id: '', count: r.c, users: r.u, gone: false, live: true })), suggestions: junk.rows.map((r, i) => ({ id: -(i + 1), range_name: r.nm, rows_alive: r.c, status: 'suggested', source: 'junk' })) });
});
app.post('/api/admin/range-crush', verify, async (req, res) => {
  const name = String(req.body.rangeName || '').trim(); if (!name) return res.status(400).json({ ok: false, error: 'rangeName required' });
  const hard = !!req.body.hard;
  const del = await pool.query("DELETE FROM user_numbers WHERE range_name=$1", [name]);
  if (hard) await pool.query("DELETE FROM pool_numbers WHERE range_id IN (SELECT range_id FROM ranges WHERE name=$1)", [name]);
  broadcast('numbers'); broadcast('ranges');
  res.json({ ok: true, crushed: del.rowCount, mode: hard ? 'deleted-all+pool' : 'deleted-all (auto-heals next sync if still live in LaMix)' });
});
app.post('/api/admin/crush-orphans', verify, async (req, res) => {
  const a = await pool.query("DELETE FROM user_numbers WHERE status='junk'");
  const b = await pool.query("DELETE FROM pool_numbers WHERE status='junk'");
  broadcast('numbers'); broadcast('ranges');
  res.json({ ok: true, deleted: a.rowCount, poolDeleted: b.rowCount });
});
app.post('/api/admin/crush-options', verify, async (req, res) => {
  const act = await pool.query("SELECT COALESCE(NULLIF(range_name,''),'?') AS nm, COUNT(*)::int c, COUNT(DISTINCT client)::int u FROM user_numbers WHERE status='active' GROUP BY 1 ORDER BY c DESC");
  const junk = await pool.query("SELECT COALESCE(NULLIF(range_name,''),'?') AS nm, COUNT(*)::int c FROM user_numbers WHERE status='junk' GROUP BY 1 ORDER BY c DESC");
  res.json({ ok: true, options: act.rows.map(r => ({ range_name: r.nm, range_id: '', count: r.c, users: r.u, gone: false, live: true })), suggestions: junk.rows.map((r, i) => ({ id: -(i + 1), range_name: r.nm, rows_alive: r.c, status: 'suggested', source: 'junk' })) });
});
app.post('/api/admin/range-crush', verify, async (req, res) => {
  const name = String(req.body.rangeName || '').trim(); if (!name) return res.status(400).json({ ok: false, error: 'rangeName required' });
  const hard = !!req.body.hard;
  const del = await pool.query("DELETE FROM user_numbers WHERE range_name=$1 AND status IN ('junk'" + (hard ? ",'released'" : "") + ") AND NOT EXISTS (SELECT 1 FROM pool_numbers p WHERE p.number=user_numbers.number AND p.status IN ('free','assigned'))", [name]);
  broadcast('numbers'); broadcast('ranges');
  res.json({ ok: true, crushed: del.rowCount, mode: hard ? 'junk+released' : 'junk-only' });
});
app.post('/api/admin/crush-orphans', verify, async (req, res) => {
  const del = await pool.query("DELETE FROM user_numbers WHERE status='junk' AND NOT EXISTS (SELECT 1 FROM pool_numbers p WHERE p.number=user_numbers.number AND p.status IN ('free','assigned'))");
  broadcast('numbers'); broadcast('ranges');
  res.json({ ok: true, deleted: del.rowCount });
});
app.post('/api/admin/range-crush', verify, async (req, res) => {
  if (!['super','admin'].includes(await _zrole(req.user.username))) return res.status(403).json({ ok:false, error:'Admins only' });
  const name = String(req.body.rangeName || '').trim(); if (!name) return res.status(400).json({ ok:false, error:'rangeName required' });
  const hard = !!req.body.hard;
  const del = await pool.query("DELETE FROM user_numbers u WHERE u.range_name=$1" + (hard ? "" : " AND " + IDLE_COND), [name]);
  pool.query("INSERT INTO crush_queue (range_id, range_name, rows_alive, status, source, crushed_by, crushed_at) VALUES ('',$1,$2,'crushed','manual',$3,NOW())", [name, del.rowCount, req.user.username]).catch(()=>{});
  broadcast('numbers'); broadcast('ranges');
  res.json({ ok: true, crushed: del.rowCount, mode: hard ? 'deleted-all' : 'idle-only' });
});
app.post('/api/admin/crush-orphans', verify, async (req, res) => {
  if (!['super','admin'].includes(await _zrole(req.user.username))) return res.status(403).json({ ok:false, error:'Admins only' });
  const del = await pool.query("DELETE FROM user_numbers u WHERE " + IDLE_COND);
  broadcast('numbers'); broadcast('ranges');
  res.json({ ok: true, deleted: del.rowCount });
});
app.post('/api/admin/db-explorer', verify, async (req, res) => {
  if (req.body.meta) {
    const [c, r] = await Promise.all([
      pool.query("SELECT DISTINCT client FROM user_numbers WHERE client IS NOT NULL AND client<>'' ORDER BY 1"),
      pool.query("SELECT DISTINCT range_name FROM user_numbers WHERE range_name IS NOT NULL AND range_name<>'' ORDER BY 1")
    ]);
    return res.json({ ok: true, clients: c.rows.map(x=>x.client), ranges: r.rows.map(x=>x.range_name) });
  }
  const w = []; const P = [];
  if (req.body.client) { P.push(req.body.client); w.push("u.client=$" + P.length); }
  if (req.body.range) { P.push(req.body.range); w.push("u.range_name=$" + P.length); }
  const where = w.length ? "WHERE " + w.join(" AND ") : "";
  const q = await pool.query("SELECT COALESCE(NULLIF(u.range_name,''),'?') AS range_name, COUNT(DISTINCT u.client)::int users, COUNT(*) FILTER (WHERE u.status='active')::int active, COUNT(*) FILTER (WHERE u.status='released')::int released, COUNT(*) FILTER (WHERE " + IDLE_COND + ")::int idle, COUNT(*)::int total FROM user_numbers u " + where + " GROUP BY 1 ORDER BY total DESC LIMIT 200", P);
  res.json({ ok: true, rows: q.rows });
});
app.post('/api/admin/number-filter', verify, async (req, res) => { if (req.body.meta) { const [c, r] = await Promise.all([ pool.query("SELECT DISTINCT client FROM user_numbers WHERE client IS NOT NULL AND client<>'' ORDER BY 1"), pool.query("SELECT DISTINCT range_name FROM user_numbers WHERE range_name IS NOT NULL AND range_name<>'' ORDER BY 1") ]); const tot = await pool.query("SELECT COUNT(*)::int t FROM user_numbers"); return res.json({ ok: true, total: tot.rows[0].t, clients: c.rows.map(x => x.client), ranges: r.rows.map(x => x.range_name) }); } const w = []; const P = []; if (req.body.client) { P.push(req.body.client); w.push("u.client=$" + P.length); } if (req.body.range) { P.push(req.body.range); w.push("u.range_name=$" + P.length); } const q = await pool.query("SELECT u.number, COALESCE(u.range_name,'-') AS range_name, COALESCE(u.client,'-') AS client, u.status AS local_status, COALESCE(p.status,'ABSENT') AS lamix_status, COALESCE(p.client_id,'-') AS lamix_client FROM user_numbers u LEFT JOIN pool_numbers p ON p.number=u.number " + (w.length ? "WHERE " + w.join(" AND ") : "") + " ORDER BY u.number DESC LIMIT 300", P); res.json({ ok: true, count: q.rows.length, rows: q.rows.map(x => x.number + ' | ' + x.range_name + ' | ' + x.client + ' | local:' + x.local_status + ' | lamix:' + x.lamix_status + (x.lamix_client !== '-' ? '(' + x.lamix_client + ')' : '') + (x.local_status === 'active' && x.lamix_status === 'assigned' ? ' | MATCH' : ' | CHECK')) }); });

app.post('/api/admin/range-refresh', verify, async (req, res) => {
  let rid = String(req.body.rangeId || '');
  if (!rid && req.body.rangeName) { const r = await pool.query("SELECT range_id FROM ranges WHERE name=$1", [String(req.body.rangeName)]); rid = r.rows[0] ? r.rows[0].range_id : ''; }
  if (!rid) return res.status(400).json({ ok: false, error: 'rangeId or rangeName required' });
  const out = await refreshRange(rid);
  res.json({ ok: true, pages: out.pages, seen: out.seen });
});
app.post('/api/admin/numsync-run', verify, async (req, res) => {
  await pool.query("UPDATE ranges SET last_num_sync=NULL");
  global.__reconDue = Date.now();
  res.json({ ok: true, message: 'Full rotation queued — every range refreshes now' });
});
app.post('/api/admin/user-ranges', verify, async (req, res) => { // V2Z-USERANGES (pure DB, no LaMix)
  const u = String(req.body.client || '').trim();
  if (!u) { const c = await pool.query("SELECT DISTINCT client FROM user_numbers WHERE client IS NOT NULL AND client<>'' ORDER BY 1 LIMIT 800"); return res.json({ ok: true, clients: c.rows.map(x => x.client) }); }
  const r = await pool.query("SELECT COALESCE(NULLIF(range_name,''),'(no range)') AS range_name, COUNT(*)::int qty, COUNT(*) FILTER (WHERE status='active')::int active, COUNT(*) FILTER (WHERE status='released')::int released, COUNT(*) FILTER (WHERE status='junk')::int junk FROM user_numbers WHERE client=$1 GROUP BY 1 ORDER BY qty DESC LIMIT 400", [u]);
  const t = await pool.query("SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE status='active')::int active FROM user_numbers WHERE client=$1", [u]);
  res.json({ ok: true, client: u, ranges: r.rows, total: t.rows[0] });
});
app.post('/api/admin/queue-clear', verify, async (req, res) => { // V2W2 clear dock
  const un = String(req.user.username || '').toLowerCase();
  let isSuper = un === SUPER_ADMIN;
  if (!isSuper) { try { isSuper = (await pool.query("SELECT 1 FROM user_roles WHERE username=$1 AND role IN ('super','admin')", [un])).rows.length > 0; } catch (e) {} }
  if (!isSuper) return res.status(403).json({ ok: false, error: 'admin only' });
  const r = await pool.query("UPDATE alloc_queue SET status='failed', result='{\"error\":\"cancelled by admin\"}', processed_at=NOW() WHERE status='pending'");
  broadcast('numbers'); broadcast('ranges');
  res.json({ ok: true, cancelled: r.rowCount });
});
app.post(new RegExp('^/api/boats/'), (req, res) => res.json({ ok: true, skipped: true, reason: 'v2 monolith owns all loops' }));
app.post('/api/admin/boat-speed', verify, (req, res) => res.json({ ok: true, series: [] }));

app.post('/api/scc/status', verify, async (req, res) => {
  const un = String(req.user.username || '').toLowerCase();
  let role = 'none'; if (un === SUPER_ADMIN) role = 'super'; else { const rr = await pool.query('SELECT role FROM user_roles WHERE username=$1', [un]); if (rr.rows[0] && rr.rows[0].role) role = rr.rows[0].role; }
  if (role !== 'super' && role !== 'admin') return res.status(403).json({ ok: false, error: 'Admins only' });
  const now = Date.now();
  function buck(rows, get, stepMs) { const out = new Array(12).fill(0); const step = stepMs || 300000; rows.forEach(r => { const i = 11 - Math.floor((now - new Date(get(r)).getTime()) / step); if (i >= 0 && i < 12) out[i]++; }); return out; }
  const [pingHour, cdrHour, qRow, doneRow, poolRow, todayRow, yestRow, incRows] = await Promise.all([
    pool.query("SELECT username, created_at FROM api_ping_log WHERE created_at >= NOW() - interval '60 minutes' LIMIT 3000"),
    pool.query("SELECT time FROM sms_cdr WHERE time >= NOW() - interval '60 minutes' LIMIT 3000"),
    pool.query("SELECT COUNT(*)::int n, MIN(created_at) t FROM alloc_queue WHERE status='pending'"),
    pool.query("SELECT COALESCE(round(AVG(EXTRACT(EPOCH FROM (processed_at-created_at))/60),1),0)::float m FROM alloc_queue WHERE status='done' AND processed_at >= NOW() - interval '60 minutes'"),
    pool.query("SELECT COUNT(*) FILTER (WHERE status='free')::int f, COUNT(*) FILTER (WHERE status='assigned')::int a FROM pool_numbers"),
    pool.query("SELECT COUNT(*)::int c FROM sms_cdr WHERE time >= " + PKT_DAY_START),
    pool.query("SELECT COUNT(*)::int c FROM sms_cdr WHERE time >= " + PKT_DAY_START + " - interval '1 day' AND time < " + PKT_DAY_START),
    pool.query("SELECT id, type, severity, title, message, created_at FROM system_incidents WHERE status='pending' ORDER BY created_at DESC LIMIT 20")
  ]);
  const pingArr = pingHour.rows, cdrArr = cdrHour.rows;
  const cdrLast = global.__cdrLast || 0;
  const cdrLagMin = cdrLast ? Math.round((now - cdrLast) / 60000) : null;
  const cdrStatus = (cdrLagMin != null && cdrLagMin < 5) ? 'live' : (cdrLagMin != null && cdrLagMin < 15) ? 'sleep' : 'dead';
  const cdrPerMin = Math.round((cdrArr.filter(r => (now - new Date(r.time).getTime()) < 300000).length / 5) * 10) / 10;
  const daemons = [
    { id: 1, name: 'CDR', agoMin: global.__cdrHb ? Math.round((now - global.__cdrHb) / 60000) : null, ok: !!(global.__cdrHb && (now - global.__cdrHb) < 60000) },
    { id: 2, name: 'Sync', agoMin: global.__syncHb ? Math.round((now - global.__syncHb) / 60000) : null, ok: !!(global.__syncHb && (now - global.__syncHb) < 60000) },
    { id: 3, name: 'Reconcile', agoMin: global.__reconHb ? Math.round((now - global.__reconHb) / 60000) : null, ok: !!(global.__reconHb && (now - global.__reconHb) < 20 * 60000) }
  ];
  const activeD = daemons.filter(d => d.ok).length;
  const tenAgo = now - 600000;
  const onlineSet = new Set(pingArr.filter(p => new Date(p.created_at).getTime() >= tenAgo).map(p => p.username));
  const online = onlineSet.size;
  const lastSeen = {}; pingArr.forEach(p => { const t = new Date(p.created_at).getTime(); if (t >= tenAgo && (!lastSeen[p.username] || t > lastSeen[p.username])) lastSeen[p.username] = t; });
  const activeList = Object.keys(lastSeen).map(u => ({ u: u, ago: Math.max(0, Math.round((now - lastSeen[u]) / 60000)) })).sort((a, b) => a.ago - b.ago).slice(0, 6);
  const userBuckets = Array.from({ length: 12 }, () => new Set()); pingArr.forEach(p => { const i = 11 - Math.floor((now - new Date(p.created_at).getTime()) / 300000); if (i >= 0 && i < 12) userBuckets[i].add(p.username); });
  const qSize = qRow.rows[0].n, oldestMin = qRow.rows[0].t ? Math.round((now - new Date(qRow.rows[0].t).getTime()) / 60000) : 0;
  const pTotal = poolRow.rows[0].f + poolRow.rows[0].a;
  const utilPct = pTotal ? Math.round((poolRow.rows[0].a / pTotal) * 100) : 0;
  const today = todayRow.rows[0].c, yest = yestRow.rows[0].c;
  const growthPct = yest ? Math.round(((today - yest) / yest) * 100) : (today ? 100 : 0);
  const alerts = [];
  if (cdrStatus === 'dead') alerts.push({ severity: 'critical', message: 'CDR stream offline (' + (cdrLagMin || '?') + 'm lag)' });
  if (activeD < 3) alerts.push({ severity: 'warning', message: (3 - activeD) + '/3 daemons stale' });
  if (qSize > 100) alerts.push({ severity: 'critical', message: 'Queue overload: ' + qSize });
  let score = 100;
  if (cdrStatus === 'dead') score -= 40; else if (cdrStatus === 'sleep') score -= 5;
  score -= (3 - activeD) * 10; if (qSize > 100) score -= 20; else if (qSize > 50) score -= 10; else if (qSize > 15) score -= 5;
  score = Math.max(0, Math.min(100, score));
  if (cdrStatus === 'dead') { const dup = await pool.query("SELECT id FROM system_incidents WHERE type='scc_cdr_dead' AND status='pending' AND created_at >= NOW() - interval '10 minutes' LIMIT 1"); if (!dup.rows.length) pool.query("INSERT INTO system_incidents (type, severity, title, message, metrics, status) VALUES ('scc_cdr_dead','critical','CDR stream dead','No CDR inserts for " + (cdrLagMin || '?') + "m.','{}','pending')").catch(() => {}); }
  res.json({ ok: true, timestamp: new Date().toISOString(),
    system: { status: alerts.some(a => a.severity === 'critical') ? 'critical' : alerts.length ? 'warning' : 'healthy', score: score, cdr: cdrStatus },
    queue: { size: qSize, oldestMin: oldestMin, etaMins: qSize ? Math.max(1, Math.ceil(qSize / 38)) : 0, avgDoneMin: doneRow.rows[0].m },
    cdr: { alive: cdrStatus !== 'dead', status: cdrStatus, lagMin: cdrLagMin, perMin: cdrPerMin, buckets: buck(cdrArr, r => r.time) },
    boats: { list: daemons, active: activeD, total: 3 },
    users: { online: online, expected: Math.max(online, Math.floor(online * 1.2)), list: activeList },
    load: { perMin: Math.round(pingArr.length / 60), lastHour: pingArr.length, buckets: buck(pingArr, r => r.created_at), users: userBuckets.map(s => s.size) },
    daily: { today: today, yesterday: yest, growthPct: growthPct },
    numbers: { total: pTotal, free: poolRow.rows[0].f, assigned: poolRow.rows[0].a, utilPct: utilPct, lastReconcile: global.__reconHb ? Math.round((now - global.__reconHb) / 60000) + 'm ago' : 'never', lastReconcileSeen: global.__reconSeen || 0, complete: !!global.__reconComplete },
    alerts: alerts, incidents: incRows.rows });
});

app.use(express.static('/home/sk-khan/htdocs/sk-khan.online', { maxAge: 0, index: 'index.html' }));
app.get(/^\/dashboard\/?$/i, (q, s) => s.redirect(301, '/dashboard/dashboard.html'));
app.use((q, s, n) => { if (q.url.startsWith('/api')) return n(); if (q.method === 'GET' && String(q.headers.accept || '').includes('text/html') && q.url !== '/') return s.redirect(301, '/dashboard/dashboard.html'); s.status(404).send('Not found'); });
try { app.use(require('./handler.js')); console.log('[v2] legacy handler mounted (admin long-tail only)'); } catch (e) { console.error('[v2] handler mount failed:', e.message); }
app.listen(PORT, HOST, () => console.log('🚀 ZAMIL v2 monolith on ' + HOST + ':' + PORT));
