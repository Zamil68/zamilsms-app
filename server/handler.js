// === BOAT RATE BUDGET (37/min design) ===
const _boatBudget = { windowStart: Date.now(), used: 0, cooldownUntil: 0 };
function boatBudgetTake(n){ const now=Date.now(); if(now<_boatBudget.cooldownUntil) return false; if(now-_boatBudget.windowStart>60000){_boatBudget.windowStart=now;_boatBudget.used=0;} if(_boatBudget.used+(n||1)>36) return false; _boatBudget.used+=(n||1); return true; }
function boatBudgetCool(ms){ _boatBudget.cooldownUntil=Date.now()+(ms||30000); }
// =======================================
// === WAVE ENGINE (docs-smart bulk mode) ===
const _waveSleep = ms => new Promise(r => setTimeout(r, ms));
async function waveProcess(rows) {
  const S = { wave: true, batches: rows.length, fetched: 0, assigned: 0, done: 0, partial: 0, calls: 0 };
  const rangeIds = [...new Set(rows.map(r => r.range_id))];
  const pools = {};
  for (const rid of rangeIds) {
    if (!boatBudgetTake(1)) break;
    await _waveSleep(1100);
    const f = await lamixGet('/numbers', { rangeId: rid, assigned: false, limit: 500 });
    S.calls++;
    if (f && f._rateLimited) { boatBudgetCool(30000); break; }
    const recs = (f && (f.records || f.numbers)) || (Array.isArray(f) ? f : []);
    pools[rid] = recs.map(x => (x && x.number) ? x.number : x).filter(Boolean);
    S.fetched += pools[rid].length;
  }
  const bundles = {};
  for (const r of rows) {
    const pool = pools[r.range_id] || [];
    r._got = pool.splice(0, r.qty || 1);
    if (!r._got.length) continue;
    const key = r.client + '|' + (r.payout_rate || 0);
    const b = bundles[key] = bundles[key] || { client: r.client, payout: r.payout_rate || 0, numbers: [], rows: [] };
    b.numbers.push(...r._got); b.rows.push(r);
  }
  for (const key of Object.keys(bundles)) {
    const b = bundles[key];
    if (!boatBudgetTake(1)) break;
    await _waveSleep(1100);
    const res2 = await lamixPost('/numbers/assign', { client: b.client, numbers: b.numbers, clientPayoutRate: String(b.payout || 0) });
    S.calls++;
    if (res2 && res2._rateLimited) { boatBudgetCool(30000); break; }
    if (res2 && res2._error) continue;
    const sent = b.numbers.length;
    let updated = (res2 && typeof res2.updated === 'number') ? res2.updated : sent;
    if (updated > sent) updated = sent;
    S.assigned += updated;
    let remaining = updated;
    for (const r of b.rows) {
      const got = Math.min(r._got.length, remaining); remaining -= got;
      if (got <= 0) continue;
      const nums = r._got.slice(0, got);
      try { await supaFetch('user_numbers', '', 'POST', nums.map(n => ({ number: n, client: r.client, range_id: r.range_id, range_name: r.range_name || undefined, status: 'active', updated_at: new Date().toISOString() })), { 'Prefer': 'return=minimal' }); } catch (e) {}
      if (got >= (r.qty || 1)) { await supaFetch('alloc_queue', 'id=eq.' + r.id, 'PATCH', { status: 'done', result: { wave: true, updated: got, requested: r.qty } }); S.done++; }
      else { await supaFetch('alloc_queue', 'id=eq.' + r.id, 'PATCH', { qty: (r.qty || 1) - got, status: 'pending', result: { wave: true, partial: got } }); S.partial++; }
    }
  }
  console.log('[wave]', JSON.stringify(S));
  return S;
}
// ======================================
// === PUSHEV SAFE DEF ===
function pushEv(type,data){try{if(typeof clients!=='undefined'&&Array.isArray(clients))clients.forEach(c=>{try{c.write('data: '+JSON.stringify({type:type,data:data})+'\n\n');}catch(e){}});}catch(e){}}
// =========================
// ═══════════════════════════════════════════════════════════
//  ZAMIL SMS — index.js  (LaMix REST API + Supabase, zero scraping)
// ═══════════════════════════════════════════════════════════
const axios  = require('axios');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');

// ✅ VERCEL CHAINING FIX: Keeps function alive for setTimeout
let waitUntil;
try { waitUntil = require('@vercel/functions').waitUntil; } catch(e) { waitUntil = (p) => p; }

// ── Config ──────────────────────────────────────────────────
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || '*';
const JWT_SECRET     = process.env.JWT_SECRET;      
const LAMIX_API_KEY  = process.env.LAMIX_API_KEY || '';
const LAMIX_REST     = process.env.LAMIX_REST || 'https://panel.lamix.org/api/v1';
const SUPABASE_URL   = process.env.SUPABASE_URL || '';
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_KEY || '';
const SUPER_ADMIN    = (process.env.SUPER_ADMIN || '').toLowerCase();
const BOAT_SECRET    = process.env.BOAT_SECRET;

// 🛡️ SECURITY: Fail loudly if critical secrets are missing in Vercel
if (!JWT_SECRET) throw new Error('FATAL: JWT_SECRET environment variable is missing in Vercel.');
if (!BOAT_SECRET) throw new Error('FATAL: BOAT_SECRET environment variable is missing in Vercel.');
if (!SUPER_ADMIN) console.warn('⚠️ WARNING: SUPER_ADMIN is not set in Vercel environment variables.');

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
};

// ── Tiny helpers ────────────────────────────────────────────
const ok    = (res, data = {}) => res.status(200).json({ ok: true, ...data, ...corsHeaders });
const error = (res, code, msg)  => res.status(code).json({ ok: false, error: msg, ...corsHeaders });
const norm  = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
// 🕒 Canonical LaMix time format (strips T, ms, Z, +00:00 to match LaMix space format)
const normT = s => String(s == null ? '' : s).replace('T', ' ').replace(/\.\d+/, '').replace(/(Z|[+-]\d{2}:?\d{2})$/, '').trim();

function getUserFromSession(token) {
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}
function supaEnabled() { return !!(SUPABASE_URL && SUPABASE_KEY); }
function _todayPKT()     { return new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10); }
function _todayStartUTC(){ return new Date().toISOString().slice(0, 10) + 'T00:00:00Z'; }

function businessDayPKT() {
  const pkt  = new Date(Date.now() + 5 * 3600000);
  const hh   = pkt.getUTCHours();
  const base = new Date(pkt.getTime() - (hh < 5 ? 1 : 0) * 86400000);
  const label = base.toISOString().slice(0, 10);
  return { from: label + ' 00:00:00', to: label + ' 23:59:59', label };
}

function isMine(client, user) {
  const c  = (client || '').toLowerCase().trim();
  const t1 = (user.clientName || '').toLowerCase().trim();
  const t2 = (user.username || '').toLowerCase().trim();
  return c && (c === t1 || c === t2 || c.includes(t1) || c.includes(t2));
}
function lbName(x) {
  const c = String(x || '').trim();
  if (!c || c === 'null' || c === 'none' || c === '-' || c === '--' || c === 'n/a') return 'System Generated';
  return c;
}
function weekKey(dateStr) {
  const d   = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1 - day);
  return new Date(d.getTime() + diff * 86400000).toISOString().slice(0, 10);
}

// ── Country helpers ─────────────────────────────────────────
const COUNTRY_ISO = { 'pakistan':'PK','sri lanka':'LK','malaysia':'MY','myanmar':'MM','afghanistan':'AF','tajikistan':'TJ','tanzania':'TZ','kyrgyzstan':'KG','uzbekistan':'UZ','sudan':'SD','angola':'AO','algeria':'DZ','zimbabwe':'ZW','bolivia':'BO','india':'IN','bangladesh':'BD','nepal':'NP','indonesia':'ID','philippines':'PH','vietnam':'VN','thailand':'TH','cambodia':'KH','egypt':'EG','nigeria':'NG','kenya':'KE','uganda':'UG','ghana':'GH','south africa':'ZA','brazil':'BR','mexico':'MX','united states':'US','usa':'US','united kingdom':'GB','germany':'DE','france':'FR','spain':'ES','italy':'IT','russia':'RU','turkey':'TR','iran':'IR','iraq':'IQ','saudi arabia':'SA','united arab emirates':'AE','qatar':'QA','kuwait':'KW','jordan':'JO','lebanon':'LB','morocco':'MA','tunisia':'TN','libya':'LY','ethiopia':'ET','somalia':'SO','rwanda':'RW','zambia':'ZM','mozambique':'MZ','botswana':'BW','namibia':'NA','senegal':'SN','mali':'ML','niger':'NE','benin':'BJ','togo':'TG','burkina faso':'BF','guinea':'GN','ivory coast':'CI','cameroon':'CM','congo':'CG','gabon':'GA','madagascar':'MG','malawi':'MW','kazakhstan':'KZ','azerbaijan':'AZ','armenia':'AM','georgia':'GE','ukraine':'UA','poland':'PL','romania':'RO','greece':'GR','netherlands':'NL','belgium':'BE','switzerland':'CH','sweden':'SE','norway':'NO','denmark':'DK','finland':'FI','ireland':'IE','canada':'CA','australia':'AU','new zealand':'NZ','japan':'JP','south korea':'KR','china':'CN','singapore':'SG','argentina':'AR','chile':'CL','colombia':'CO','peru':'PE','venezuela':'VE','ecuador':'EC','paraguay':'PY','uruguay':'UY','panama':'PA','costa rica':'CR','guatemala':'GT','honduras':'HN','cuba':'CU','dominican republic':'DO','haiti':'HT','jamaica':'JM','portugal':'PT','austria':'AT','belarus':'BY','hungary':'HU','czechia':'CZ','slovakia':'SK','bulgaria':'BG','serbia':'RS','croatia':'HR','yemen':'YE','oman':'OM','bahrain':'BH','syria':'SY','mongolia':'MN','laos':'LA','bhutan':'BT','maldives':'MV','fiji':'FJ','palestine':'PS','israel':'IL' };
function isoToFlag(iso) { return String(iso || '').toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0))); }
function countryFlag(name) {
  const s = ' ' + String(name || '').toLowerCase();
  let best = '', bestLen = 0;
  for (const k in COUNTRY_ISO) {
    const re = new RegExp(' ' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![a-z])');
    if (re.test(s) && k.length > bestLen) { best = k; bestLen = k.length; }
  }
  return best ? isoToFlag(COUNTRY_ISO[best]) : '🏳️';
}
function _countryOfRange(rangeText) {
  const t = String(rangeText || '').trim();
  const m = t.match(/^(.+?)[\s-](?:LX|MX|RX|DC|LX2|MX2)\b/i) || t.match(/^(.+?)[\s-]+\d{3,}/);
  return (m && m[1] ? m[1] : t).trim();
}

// ═══ LIVE RANGES FALLBACK (5-min in-memory cache) ═══
let _liveRangesCache = { ts: 0, map: null };
async function getLiveRangesMap() {
  if (_liveRangesCache.map && (Date.now() - _liveRangesCache.ts) < 300000) return _liveRangesCache.map;
  const data = await lamixGet('/ranges');
const recs = (data && (data.ranges || data.records)) || [];
  const map = new Map();
  recs.forEach(r => map.set(String(r.id), { name: r.name || '', prefix: r.prefix || '' }));
  if (recs.length) _liveRangesCache = { ts: Date.now(), map };
  return map;
}

// ═══════════════════════════════════════════════════════════
//  LaMix REST API wrapper (auto-retry on 429 Rate Limits)
// ═══════════════════════════════════════════════════════════
async function lamixGet(endpoint, params = {}) {
    try {
        const res = await axios.get(`${LAMIX_REST}${endpoint}`, {
            headers: { 'Authorization': `Bearer ${LAMIX_API_KEY}` },
            params, timeout: 15000, validateStatus: () => true,
        });
        
        // Handle Rate Limits (429) with auto-retry
        if (res.status === 429) {
            const ra = parseInt(res.headers['retry-after'] || res.data?.retryAfterSeconds || 5);
            console.log(`[LaMix] 429 Rate Limited on GET ${endpoint}. Waiting ${ra}s...`);
            await new Promise(r => setTimeout(r, ra * 1000));
            
            const retry = await axios.get(`${LAMIX_REST}${endpoint}`, {
                headers: { 'Authorization': `Bearer ${LAMIX_API_KEY}` },
                params, timeout: 15000, validateStatus: () => true,
            });
            if (retry.status === 200) return retry.data;
            
            // ⚠️ Keep _rateLimited: true so the Boats (CDR, Numbers, Alloc) know to break/stop!
            return { _rateLimited: true, _error: 'rate_limited', _status: 429 };
        }
        
        if (res.status !== 200) return { _error: res.data?.error || 'api_error', _status: res.status };
        return res.data;
    } catch (e) {
        console.error(`[LaMix GET] ${endpoint}:`, e.message);
        return { _error: e.message };
    }
}

async function lamixPost(endpoint, body) {
    try {
        const res = await axios.post(`${LAMIX_REST}${endpoint}`, body, {
            headers: { 'Authorization': `Bearer ${LAMIX_API_KEY}`, 'Content-Type': 'application/json' },
            timeout: 20000, validateStatus: () => true,
        });
        
        // Handle Rate Limits (429) with auto-retry
        if (res.status === 429) {
            const ra = parseInt(res.headers['retry-after'] || res.data?.retryAfterSeconds || 5);
            console.log(`[LaMix] 429 Rate Limited on POST ${endpoint}. Waiting ${ra}s...`);
            await new Promise(r => setTimeout(r, ra * 1000));
            
            const retry = await axios.post(`${LAMIX_REST}${endpoint}`, body, {
                headers: { 'Authorization': `Bearer ${LAMIX_API_KEY}`, 'Content-Type': 'application/json' },
                timeout: 20000, validateStatus: () => true,
            });
            if (retry.status >= 200 && retry.status < 300) return retry.data;
            
            // ⚠️ Keep _rateLimited: true so the Alloc Boat knows to stop!
            return { _rateLimited: true, _error: 'rate_limited', _status: 429 };
        }
        
        if (res.status >= 400) return { _error: res.data?.error || 'api_error', _status: res.status, _detail: res.data };
        return res.data;
    } catch (e) {
        console.error(`[LaMix POST] ${endpoint}:`, e.message);
        return { _error: e.message };
    }
}
// ═══════════════════════════════════════════════════════════
//  Supabase fetch helper
// ═══════════════════════════════════════════════════════════
async function supaFetch(table, query = '', method = 'GET', body = null, extraHeaders = {}) {
  if (!supaEnabled()) return null;
  const url = `${SUPABASE_URL}/${table}${query ? '?' + query : ''}`;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  };
  if (body !== null) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(url, opts);
    if (method === 'DELETE') return res.ok;
    const t = await res.text(); return t ? JSON.parse(t) : (res.ok ? [] : null);
  } catch (e) {
    console.error(`[supa:${table}]`, e.message);
    return null;
  }
}

// ═══ COUNTER RAIL helpers (P1) ═══
const dayBackN = (label, n) => new Date(new Date(label + 'T00:00:00Z').getTime() - n * 86400000).toISOString().slice(0, 10);
async function rpcTotals(fromDay, toDay) {
  const r = await supaFetch('rpc/get_sms_totals', '', 'POST', { p_from: fromDay, p_to: toDay });
  return Array.isArray(r) ? r : [];
}
function sumMine(totals, user) {
  let n = 0;
  totals.forEach(r => { if (isMine(r.username, user)) n += Number(r.sms_count || 0); });
  return n;
}
async function supaCount(table, query) {
  if (!supaEnabled()) return 0;
  try {
    const res = await fetch(`${SUPABASE_URL}/${table}?${query}&select=time&limit=1`, {
      headers: { Prefer: 'count=exact' },
    });
const m = (res.headers.get('content-range') || '').match(/\/(\d+)$/);
    return m ? parseInt(m[1], 10) : 0;
  } catch (e) { return 0; }
}
// ═══════════════════════════════════════════════════════════
//  Passwords (scrypt)
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
//  Passwords (scrypt)
// ═══════════════════════════════════════════════════════════
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
async function supaGetCreds(username) {
  const rows = await supaFetch('user_creds', `username=${encodeURIComponent('eq.' + username)}&select=*`);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}
async function supaUpsertCreds(username, passHash, clientId, clientName, recoveryHash) {
  if (!supaEnabled()) return false;
  const body = { username, pass_hash: passHash, client_id: clientId || null, client_name: clientName || null, updated_at: new Date().toISOString() };
  if (recoveryHash !== undefined) body.recovery_hash = recoveryHash;
  await supaFetch('user_creds', '', 'POST', body, { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
  return true;
}

// ── LaMix client lookup via REST API ────────────────────────
async function lookupLaMixClient(username) {
  const data = await lamixGet('/clients', { limit: 500 });
  if (data._error || data._rateLimited) return null;
  const want = String(username).toLowerCase();
  const found = (data.records || data.clients || []).find(c =>
    String(c.username || '').toLowerCase() === want || String(c.name || '').toLowerCase() === want
  );
  return found ? { clientId: found.username, clientName: found.name || found.username } : null;
}

// ═══════════════════════════════════════════════════════════
//  Roles
// ═══════════════════════════════════════════════════════════
const _roleCache = new Map();
async function getRole(username) {
  const u = String(username || '').toLowerCase().trim();
  if (!u) return 'none';
  if (u === SUPER_ADMIN) return 'super';
  const c = _roleCache.get(u);
  if (c && (Date.now() - c.ts) < 30000) return c.role;
  let role = 'none';
  const rows = await supaFetch('user_roles', `username=eq.${encodeURIComponent(u)}&select=role`);
  if (Array.isArray(rows) && rows[0] && rows[0].role) role = rows[0].role;
  _roleCache.set(u, { ts: Date.now(), role });
  return role;
}
function isAdminish(role) { return role === 'super' || role === 'admin'; }

// ═══════════════════════════════════════════════════════════
//  Teams / Prefixes / Pins
// ═══════════════════════════════════════════════════════════
async function supaGetPrefixes() {
  const rows = await supaFetch('team_prefixes', 'select=prefix,admin_username,label&order=prefix.asc');
  return Array.isArray(rows) ? rows : [];
}
function prefixesFor(role, username, all) {
  if (role === 'super') return all;
  const u = String(username).toLowerCase();
  return all.filter(p => String(p.admin_username).toLowerCase() === u);
}
function prefixTeam(username, allPrefixes) {
  const un = String(username || '').toLowerCase();
  const sorted = allPrefixes.slice().sort((a, b) => (b.prefix || '').length - (a.prefix || '').length);
  for (const p of sorted) {
    const pf = String(p.prefix || '').toLowerCase();
    if (pf && un.indexOf(pf) === 0) return p.prefix;
  }
  return '';
}

// ═══ CACHED NUMBER→CLIENT MAP (60s TTL) — Instant Attribution ═══
let _ncMapCache = { ts: 0, map: null };
async function getNumberClientMap() {
  if (_ncMapCache.map && (Date.now() - _ncMapCache.ts) < 5000) return _ncMapCache.map;
  const numRows = await supaFetch('user_numbers', 'select=number,client&limit=100000');
  const ncMap = new Map();
  if (Array.isArray(numRows)) numRows.forEach(n => ncMap.set(n.number, n.client || ''));
  _ncMapCache = { ts: Date.now(), map: ncMap };
  return ncMap;
}
let _rangesCache = new Map();
function _rangesCacheGet(u){ const e=_rangesCache.get(u); if(e && Date.now()-e.ts<3000) return e.ranges; return null; }
function _rangesCacheSet(u,r){ _rangesCache.set(u,{ts:Date.now(),ranges:r}); if(_rangesCache.size>2000) _rangesCache.clear(); }
function invalidateNcMap() { _ncMapCache = { ts: 0, map: null }; try{_rangesCache.clear();}catch(e){} }

let _pinsCache = { ts: 0, map: null };
async function getPinsMap() {
  if (_pinsCache.map && (Date.now() - _pinsCache.ts) < 30000) return _pinsCache.map;
  const map = {};
  const rows = await supaFetch('client_team_pins', 'select=username,prefix');
  if (Array.isArray(rows)) rows.forEach(x => { map[String(x.username).toLowerCase()] = x.prefix; });
  _pinsCache = { ts: Date.now(), map };
  return map;
}
function invalidatePins() { _pinsCache = { ts: 0, map: null }; }
function resolveTeam(username, allPrefixes, pinsMap) {
  const un = String(username || '').toLowerCase();
  const pin = pinsMap ? pinsMap[un] : null;
  if (pin) {
    const m = allPrefixes.find(p => String(p.prefix || '').toLowerCase() === String(pin).toLowerCase());
    if (m) return m.prefix;
  }
  return prefixTeam(username, allPrefixes);
}

// ═══════════════════════════════════════════════════════════
//  Allocation caps
// ═══════════════════════════════════════════════════════════
const COUNTRY_CAP = 6;
const RANGE_CAP   = 3;

async function supaInsertEvent(ev) {
  if (!supaEnabled()) return;
  try { await supaFetch('alloc_events', '', 'POST', ev, { 'Prefer': 'return=minimal' }); } catch(e) { console.error('[alloc_events]', e.message); }
}
async function countDailyAllocByCountry(username) {
  if (!supaEnabled()) return { byCountry: {}, byRange: {}, total: 0 };
  const start = encodeURIComponent('gte.' + _todayStartUTC());
  const rows = await supaFetch('alloc_queue',
    `username=${encodeURIComponent('eq.' + username)}&status=neq.failed&created_at=${start}&select=range_id,range_name`);
  const byCountry = {}, byRange = {};
  (Array.isArray(rows) ? rows : []).forEach(x => {
    const c = _countryOfRange(x.range_name || '') || 'Unknown';
    byCountry[c] = (byCountry[c] || 0) + 1;
    if (x.range_id) byRange[x.range_id] = (byRange[x.range_id] || 0) + 1;
  });
  return { byCountry, byRange, total: (Array.isArray(rows) ? rows.length : 0) };
}

// ═══════════════════════════════════════════════════════════
//  🛰️ SCC — System Command Center helper (deduped incident reporter)
// ═══════════════════════════════════════════════════════════

// ═══ SCC v6 helpers: server-side cache + boat heartbeats ═══
let _sccCache = { ts: 0, payload: null };
function boatHb(id) {
  supaFetch('boat_state', '', 'POST', { id: id, hb: new Date().toISOString() }, { 'Prefer': 'resolution=merge-duplicates,return=minimal' }).catch(() => {});
}

// ═══ ACTIVITY TELEMETRY (throttled: 1 write/user/min) ═══
const _pingThrottle = new Map();
function logActivity(username, endpoint) {
  try {
    const u = String(username || '').toLowerCase(); if (!u) return;
    const now = Date.now(); const last = _pingThrottle.get(u) || 0;
    if (now - last < 60000) return;
    _pingThrottle.set(u, now);
    if (_pingThrottle.size > 3000) _pingThrottle.clear();
    supaFetch('api_ping_log', '', 'POST', { username: u, endpoint: endpoint || 'api', created_at: new Date().toISOString() }, { 'Prefer': 'return=minimal' }).catch(() => {});
  } catch (e) {}
}

async function sccReport(type, severity, title, message, metrics) {
  try {
    const since = new Date(Date.now() - 10 * 60000).toISOString(); // max 1 alert per type per 10 min
    const dup = await supaFetch('system_incidents', 'type=eq.' + encodeURIComponent(type) + '&status=eq.pending&created_at=gte.' + encodeURIComponent(since) + '&select=id&limit=1');
    if (Array.isArray(dup) && dup.length) return null;
    await supaFetch('system_incidents', '', 'POST', { type, severity, title, message, metrics: metrics || {}, status: 'pending' }, { 'Prefer': 'return=minimal' });
    return true;
  } catch (e) { console.error('[SCC]', e.message); return null; }
}

// ═══════════════════════════════════════════════════════════
//  Notifications helper
// ═══════════════════════════════════════════════════════════
async function sendNotif(target, type, title, body, createdBy) {
  if (!supaEnabled()) return;
  await supaFetch('app_notifs', '', 'POST', {
    target: String(target || '*').toLowerCase(), type: type || 'info',
    title: String(title || '').slice(0, 120), body: String(body || '').slice(0, 1000),
    created_by: createdBy || 'system',
  }, { 'Prefer': 'return=minimal' }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════
//  Supabase CDR read helpers (replace all old getCachedCDR)
// ═══════════════════════════════════════════════════════════
async function readCDR(from, to, clientFilter, limit) {
  let q = `time=gte.${encodeURIComponent(from)}&time=lte.${encodeURIComponent(to)}&order=time.desc&limit=${limit || 500}`;
  if (clientFilter) q += `&client=eq.${encodeURIComponent(clientFilter)}`;
  const rows = await supaFetch('sms_cdr', q + '&select=*');
  return Array.isArray(rows) ? rows : [];
}
async function readCDRForUser(user, from, to, limit) {
  // 🚨 FIX 1: Fetch 10,000 records instead of 500. 
  // This ensures your OTPs aren't pushed out by other users' traffic.
  const all = (await readCDR(from, to, null, 10000)).filter(r => r.client && String(r.client).trim().toLowerCase() !== 'system generated');
  
  // 🚨 FIX 2: Fallback to number ownership if LaMix didn't send the client name
  const ncMap = await getNumberClientMap(); 
  
  return all.filter(r => {
    if (isMine(r.client, user)) return true;
    const mappedClient = ncMap.get(r.number);
    if (mappedClient && isMine(mappedClient, user)) return true;
    return false;
  });
}

// ═══════════════════════════════════════════════════════════
//  MAIN HANDLER
// ═══════════════════════════════════════════════════════════
module.exports = async (req, res) => {

    if (req.method === 'OPTIONS') return res.status(200).json({ ...corsHeaders });
  




// === HEAL-NOTIFY (self-contained, for Medic) ===

if(req.url==='/api/missions/crush' && req.method==='POST'){
  try{ require('child_process').spawn('bash',['/opt/zamil/numsync.sh'],{detached:true,stdio:'ignore'}); return ok(res,{ok:true,started:true}); }
  catch(e){ return error(res,500,e.message); }
}

if(req.url==='/api/admin/crush-orphans' && req.method==='POST'){
  try{
    const u=getUserFromSession((req.body&&req.body.session)||'');
    if(!u) return error(res,401,'Unauthorized');
    const rn=String((req.body&&req.body.rangeName)||'').replace(/'/g,"''");
    const sql=rn? ("DELETE FROM user_numbers u WHERE u.range_name='"+rn+"' AND NOT EXISTS (SELECT 1 FROM lamix_numbers_mirror m WHERE m.number=u.number)")
                : ("DELETE FROM user_numbers u WHERE NOT EXISTS (SELECT 1 FROM lamix_numbers_mirror m WHERE m.number=u.number)");
    const before=await supaFetch('user_numbers','select=id,number&limit=1','GET');
    const fsx=require('fs'); const cpx=require('child_process');
    fsx.writeFileSync('/tmp/orph.sql', sql+';');
    const out=cpx.execSync("sudo -u postgres psql -P pager=off -d zamil_p1 -Atc \""+sql.replace(/"/g,'\"')+"\"").toString().trim();
    return ok(res,{ok:true, deleted: out});
  }catch(e){ return error(res,500,e.message); }
}

if(req.url==='/api/admin/reconcile-status' && req.method==='POST'){
  try{
    const u=getUserFromSession((req.body&&req.body.session)||'');
    if(!u) return error(res,401,'Unauthorized');
    const cpx=require('child_process');
    const q=s=>cpx.execSync("sudo -u postgres psql -P pager=off -d zamil_p1 -Atc \""+s.replace(/"/g,'\\"')+"\"").toString().trim();
    return ok(res,{ok:true,
      mirror_total:+(q("SELECT count(*) FROM lamix_numbers_mirror")||0),
      mirror_assigned:+(q("SELECT count(*) FROM lamix_numbers_mirror WHERE client<>''")||0),
      db_total:+(q("SELECT count(*) FROM user_numbers")||0),
      db_assigned:+(q("SELECT count(*) FROM user_numbers WHERE client IS NOT NULL AND client<>''")||0),
      orphans:+(q("SELECT count(*) FROM user_numbers u WHERE NOT EXISTS (SELECT 1 FROM lamix_numbers_mirror m WHERE m.number=u.number)")||0),
      missing:+(q("SELECT count(*) FROM lamix_numbers_mirror m WHERE NOT EXISTS (SELECT 1 FROM user_numbers u WHERE u.number=m.number)")||0),
      last_sync:q("SELECT coalesce(max(synced_at)::text,'never') FROM lamix_numbers_mirror")});
  }catch(e){ return error(res,500,e.message); }
}
if(req.url==='/api/admin/numsync-run' && req.method==='POST'){
  try{
    const u=getUserFromSession((req.body&&req.body.session)||'');
    if(!u) return error(res,401,'Unauthorized');
    require('child_process').spawn('bash',['/opt/zamil/numsync.sh'],{detached:true,stdio:'ignore'});
    return ok(res,{ok:true,started:true});
  }catch(e){ return error(res,500,e.message); }
}

if(req.url==='/api/admin/number-filter' && req.method==='POST'){
  try{
    const u=getUserFromSession((req.body&&req.body.session)||''); if(!u) return error(res,401,'Unauthorized');
    const cpx=require('child_process');
    const q=s=>cpx.execSync("sudo -u postgres psql -P pager=off -d zamil_p1 -Atc \""+s.replace(/"/g,'\\"')+"\"").toString().trim();
    if(req.body.meta){ return ok(res,{ok:true, total:+(q("SELECT count(*) FROM user_numbers")||0),
      clients:q("SELECT DISTINCT client FROM user_numbers WHERE client IS NOT NULL AND client<>'' ORDER BY 1").split('\n').filter(Boolean),
      ranges:q("SELECT DISTINCT range_name FROM user_numbers WHERE range_name IS NOT NULL AND range_name<>'' ORDER BY 1").split('\n').filter(Boolean)}); }
    let w=' WHERE 1=1';
    if(req.body.client) w+=" AND client='"+String(req.body.client).replace(/'/g,"''")+"'";
    if(req.body.range) w+=" AND range_name='"+String(req.body.range).replace(/'/g,"''")+"'";
    return ok(res,{ok:true, count:+(q("SELECT count(*) FROM user_numbers"+w)||0),
      rows:q("SELECT number||' | '||coalesce(range_name,'-')||' | '||coalesce(client,'-')||' | '||coalesce(status,'-') FROM user_numbers"+w+" ORDER BY number LIMIT 300").split('\n').filter(Boolean)});
  }catch(e){ return error(res,500,e.message); }
}
if(req.url==='/api/admin/sync-progress' && req.method==='POST'){
  try{
    const u=getUserFromSession((req.body&&req.body.session)||''); if(!u) return error(res,401,'Unauthorized');
    const fsx=require('fs');
    let prog=null,curve=[];
    try{ prog=JSON.parse(fsx.readFileSync('/var/run/numsync-progress.json','utf8')); }catch(e){}
    try{ curve=JSON.parse(fsx.readFileSync('/var/run/numsync-curve.json','utf8')); }catch(e){}
    return ok(res,{ok:true,prog:prog,curve:(curve||[]).slice(-120)});
  }catch(e){ return error(res,500,e.message); }
}
if(req.url==='/api/admin/boat-speed' && req.method==='POST'){
  try{
    const u=getUserFromSession((req.body&&req.body.session)||''); if(!u) return error(res,401,'Unauthorized');
    const cpx=require('child_process');
    const q=s=>cpx.execSync("sudo -u postgres psql -P pager=off -d zamil_p1 -Atc \""+s.replace(/"/g,'\\"')+"\"").toString().trim();
    const cols=(q("SELECT string_agg(column_name,',') FROM information_schema.columns WHERE table_name='boat_beats'")||'').split(',');
    const ts=cols.find(c=>/time|_at|created/.test(c))||''; const nm=cols.find(c=>/name|boat|job/.test(c))||'';
    if(!ts||!nm) return ok(res,{ok:true,series:[]});
    const rows=q("SELECT to_char("+ts+",'HH24:MI')||' '||count(*) FROM boat_beats WHERE "+ts+" >= now()-interval '30 minutes' AND "+nm+" ILIKE '%number%' GROUP BY 1 ORDER BY 1").split('\n').filter(Boolean);
    return ok(res,{ok:true,series:rows.map(r=>{const i=r.indexOf(' ');return {m:r.slice(0,i),v:+r.slice(i+1)};})});
  }catch(e){ return ok(res,{ok:true,series:[]}); }
}

if(req.url==='/api/admin/dock-stats' && req.method==='POST'){
  try{
    const u=getUserFromSession((req.body&&req.body.session)||''); if(!u) return error(res,401,'Unauthorized');
    const cpx=require('child_process');
    const q=s=>cpx.execSync("sudo -u postgres psql -P pager=off -d zamil_p1 -Atc \""+s.replace(/"/g,'\\"')+"\"").toString().trim();
    const buckets=(col)=> (q("SELECT coalesce(string_agg(c::text,',' ORDER BY i DESC),'') FROM generate_series(1,12) i LEFT JOIN (SELECT width_bucket(floor(extract(epoch FROM now()-"+col+")/60)::int,0,60,12) b, count(*) c FROM alloc_queue WHERE "+col+" > now()-interval '60 minutes' GROUP BY 1) t ON t.b=i")||'').split(',').filter(Boolean).map(Number);
    return ok(res,{ok:true,
      arrivals: buckets('created_at'),
      completions: buckets('processed_at'),
      doneLastHour: +(q("SELECT count(*) FROM alloc_queue WHERE status='done' AND processed_at > now()-interval '60 minutes'")||0),
      failedLastHour: +(q("SELECT count(*) FROM alloc_queue WHERE status='failed' AND processed_at > now()-interval '60 minutes'")||0),
      avgProcessMin: +(q("SELECT coalesce(round(avg(extract(epoch FROM processed_at-created_at)/60),1)::text,'0') FROM alloc_queue WHERE status='done' AND processed_at > now()-interval '60 minutes'")||0),
      pendingNow: +(q("SELECT count(*) FROM alloc_queue WHERE status='pending'")||0)});
  }catch(e){ return error(res,500,e.message); }
}

if(req.url==='/api/admin/delta-status' && req.method==='POST'){
  try{ const u=getUserFromSession((req.body&&req.body.session)||''); if(!u) return error(res,401,'Unauthorized');
    const fs=require('fs'); let d={}; try{ d=JSON.parse(fs.readFileSync('/var/run/deltasync-progress.json','utf8')); }catch(e){}
    return ok(res,{ok:true,at:d.at||d.startedAt||null,status:d.status||'idle',changed:d.changed!=null?d.changed:null,vanished:d.vanished!=null?d.vanished:null});
  }catch(e){ return error(res,500,e.message); }
}

if(req.url==='/api/admin/pool-history' && req.method==='POST'){
  try{ const u=getUserFromSession((req.body&&req.body.session)||''); if(!u) return error(res,401,'Unauthorized');
    const fs=require('fs'); let hist=[]; for(const __pp of [process.env.POOL_HIST, require('path').join(__dirname,'pool-history.json'), '/opt/zamil/pool-history.json', '/var/run/pool-history.json']){ if(!__pp) continue; try{ hist=JSON.parse(fs.readFileSync(__pp,'utf8')); break; }catch(e){} }
    return ok(res,{ok:true,hist:(hist||[]).slice(-120)});
  }catch(e){ return error(res,500,e.message); }
}

// === MISSIONS: CSV import + rewind + status (delimiter-aware) ===
function missionsReadBody(req){
  return new Promise((resolve,reject)=>{
    let d='';
    req.on('data',c=>{ d+=c; if(d.length>30*1024*1024){ req.destroy(); reject(new Error('too large')); } });
    req.on('end',()=>resolve(d));
    req.on('error',reject);
  });
}
function missionsParseCSV(text){
  const lines=String(text).split(/\r?\n/).filter(l=>l.trim());
  if(!lines.length) return {rows:[],err:'empty file',hdr:[],delim:'?'};
  const first=lines[0];
  const cnt={'\t':(first.match(/\t/g)||[]).length,',':(first.match(/,/g)||[]).length,';':(first.match(/;/g)||[]).length,'|':(first.match(/\|/g)||[]).length};
  let delim=',',best=0;
  for(const k in cnt){ if(cnt[k]>best){ best=cnt[k]; delim=k; } }
  function splitLine(line){
    if(delim==='\t'||delim==='|') return line.split(delim).map(s=>s.trim());
    const out=[]; let cur=''; let q=false;
    for(let i=0;i<line.length;i++){
      const ch=line[i];
      if(ch=='"'){ if(q&&line[i+1]=='"'){cur+='"';i++;} else q=!q; }
      else if(ch===delim&&!q){ out.push(cur); cur=''; }
      else cur+=ch;
    }
    out.push(cur);
    return out.map(s=>s.trim());
  }
  const hdr=splitLine(first).map(s=>s.trim().toLowerCase());
  const alias={date:['date','time','timestamp'],range:['range','range_name'],number:['number','phone','msisdn','destination'],cli:['cli','sender','source'],sms:['sms','message','content','text'],client:['client','user']};
  function findCol(names){ for(const n of names){ const i=hdr.indexOf(n); if(i>=0) return i; } return -1; }
  let iD=findCol(alias.date),iR=findCol(alias.range),iN=findCol(alias.number),iC=findCol(alias.cli),iS=findCol(alias.sms);
  if(iD<0||iN<0){ iD=0;iR=1;iN=2;iC=3;iS=4; }
  const rows=[];
  for(let i=1;i<lines.length;i++){
    const c=splitLine(lines[i]);
    const t=c[iD],n=c[iN];
    if(!t||!n) continue;
    const sms=(iS>=0?c[iS]:'')||'';
    let ts=(function(v){let s=String(v).trim().replace(' ','T');s=s.replace(/([+-]\d{2}):?(\d{2})$/,(mm,hh,mi)=>((hh==='00'&&mi==='00')?'Z':hh+':'+mi));if(!/Z$/i.test(s)&&!/[+-]\d{2}:\d{2}$/.test(s)) s+='Z';const d=new Date(s);return isNaN(d.getTime())?null:d.toISOString();})(t); if(!ts) continue;
    rows.push({time:ts,range:(iR>=0?c[iR]:'')||'',number:String(n),cli:(iC>=0?c[iC]:'')||'',content:sms,content_hash:require('crypto').createHash('md5').update(sms).digest('hex')});
  }
  return {rows, delim:(delim==='\t'?'TAB':delim), hdr};
}
if(req.url==='/api/missions/import-csv' && req.method==='POST'){
  try{
    const body=await missionsReadBody(req);
    if(!body||!body.trim()) return error(res,400,'empty CSV body');
    const p=missionsParseCSV(body);
    if(p.err) return error(res,400,p.err);
    if(!p.rows.length) return ok(res,{ok:true,inserted:0,skipped:0,total:0,diag:{delim:p.delim,header:p.hdr.slice(0,8)}});
    const SUPABASE_URL=process.env.SUPABASE_URL;
    const KEY=process.env.SUPABASE_SERVICE_KEY||'';
    if(!SUPABASE_URL) return error(res,500,'SUPABASE_URL missing');
    let inserted=0;
    for(let i=0;i<p.rows.length;i+=200){
      const chunk=p.rows.slice(i,i+200);
      const r=await fetch(SUPABASE_URL+'/sms_cdr?on_conflict=time,number,cli,content_hash',{
        method:'POST',
        headers:{'Content-Type':'application/json','Prefer':'resolution=ignore-duplicates,return=representation'},
        body:JSON.stringify(chunk)
      });
      if(!r.ok){ const t=await r.text(); return ok(res,{ok:false,insert_error:{status:r.status,body:t.slice(0,300)},batch_start:i,total:p.rows.length,delim:p.delim}); }
      const arr=await r.json().catch(()=>[]);
      inserted+=Array.isArray(arr)?arr.length:0;
    }
    return ok(res,{ok:true,inserted:inserted,skipped:p.rows.length-inserted,total:p.rows.length,delim:p.delim});
  }catch(err){ return error(res,500,err.message); }
}
if(req.url==='/api/missions/rewind' && req.method==='POST'){
  try{
    const pkt=new Date(Date.now()+5*3600000);
    const dayStart=Date.UTC(pkt.getUTCFullYear(),pkt.getUTCMonth(),pkt.getUTCDate());
    const iso=new Date(dayStart).toISOString();
    await supaFetch('cdr_state','id=eq.1','PATCH',{last_time:iso});
    return ok(res,{ok:true,rewound_to:iso});
  }catch(e){ return error(res,500,e.message); }
}
if(req.url==='/api/missions/status' && req.method==='GET'){
  try{
    const st=await supaFetch('cdr_state','id=eq.1&select=last_time');
    const pkt=new Date(Date.now()+5*3600000);
    const dayStart=Date.UTC(pkt.getUTCFullYear(),pkt.getUTCMonth(),pkt.getUTCDate());
    const todayISO=new Date(dayStart).toISOString();
    const cnt=await supaFetch('sms_cdr','select=id&time=gte.'+todayISO);
    const stored=Array.isArray(cnt)?cnt.length:0;
    const age_s=(st&&st[0]&&st[0].last_time)?Math.round((Date.now()-new Date(st[0].last_time).getTime())/1000):0;
    return ok(res,{ok:true,last_time:(st&&st[0]&&st[0].last_time)||null,cursor_age_s:age_s,stored_today:stored});
  }catch(e){ return ok(res,{ok:false,error:e.message}); }
}
// === END MISSIONS ===



const url = req.url.replace(/^\/api/, '').replace(/\/$/, '');

  try {


    // ═══════════════════════════════════════════════════════════
//  ⚡ NUDGE — Frontend triggered CDR poll (near-instant OTPs)
// ═══════════════════════════════════════════════════════════
if (url === '/boats/cdr/nudge' && req.method === 'POST') {
  return ok(res, { nudged: false, reason: 'engine owns cdr on VPS' });
  // Allow either a valid user session OR the boat secret
  const user = getUserFromSession(req.body.session);
  const hasBoatSecret = req.headers.authorization === `Bearer ${BOAT_SECRET}`;
  if (!user && !hasBoatSecret) return error(res, 401, 'Unauthorized');

  try {
    const nowMs = Date.now();
    const st = await supaFetch('boat_state', 'id=eq.9&select=hb,locked_until');
    const row = Array.isArray(st) && st[0] ? st[0] : null;
    
    const lastHb = row && row.hb ? new Date(row.hb).getTime() : 0;
    const lockUntil = row && row.locked_until ? new Date(row.locked_until).getTime() : 0;
    
    // 🛑 RATE LIMIT PROTECTION:
    // If BOAT 1 is currently running (locked), or if ANY poll happened < 1.5s ago, no-op.
    // This guarantees we never hit LaMix faster than ~40 req/min globally.
    if (lockUntil > nowMs + 1000 || (nowMs - lastHb) < 1500) {
      return ok(res, { nudged: false, reason: 'too_soon_or_locked' });
    }

    // 🔒 Lock for 5 seconds to prevent BOAT 1 from overlapping with this nudge
    await supaFetch('boat_state', '', 'POST', { 
      id: 9, 
      locked_until: new Date(nowMs + 5000).toISOString(), 
      hb: new Date().toISOString() 
    }, { 'Prefer': 'resolution=merge-duplicates,return=minimal' });

    const cdrSt = await supaFetch('cdr_state', 'id=eq.1&select=last_time');
 let lastTime = (Array.isArray(cdrSt) && cdrSt[0] && cdrSt[0].last_time) ? normT(cdrSt[0].last_time) : new Date(nowMs).toISOString().slice(0, 19).replace('T', ' '); // 🛡️ wipe-safe + space-format
    // Fetch only the latest 100 records to keep execution time tiny
    const data = await lamixGet('/cdrs', { from: lastTime, limit: 500 });   // 🛡️ bursts ≤500 always fit in ONE page
    if (data._rateLimited || data._error) {
      await supaFetch('boat_state', '', 'POST', { id: 9, locked_until: new Date(nowMs - 1000).toISOString() }, { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
      return ok(res, { nudged: false, reason: 'lamix_error' });
    }

    const records = data.records || data.clients || [];
    let inserted = 0;
    let newest = normT(lastTime);

    if (records.length) {
      // ✅ FIX 3.2 & 3.5: Use 60s cached map + check LaMix JSON directly
      const ncMap = await getNumberClientMap();

      const payload = records.map(r => ({
        time: r.time, number: r.number, cli: r.cli,
        client: r.client || ncMap.get(r.number) || null, // ✅ Instant match
        content: r.content, range: r.range, range_prefix: r.rangePrefix,
        currency: r.currency, payout: r.payout, client_payout: r.clientPayout,
        status: r.status, cleared_at: r.clearedAt
      }));
      
      await supaFetch('sms_cdr', 'on_conflict=time,number,cli', 'POST', payload, { 'Prefer': 'resolution=ignore-duplicates,return=minimal' });
      inserted = records.length;
      
      let nMax = newest, nMin = null;
   records.forEach(r => { const t = normT(r.time); if (t > nMax) nMax = t; if (!nMin || t < nMin) nMin = t; });
   // 🛡️ BURST GUARD: move the watermark ONLY if we received the whole window (batch < limit)
   if (records.length < 500) newest = nMax;
   await supaFetch('cdr_state', '', 'POST', { id: 1, last_time: newest }, { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
    }

    // 🔓 Release lock immediately
    await supaFetch('boat_state', '', 'POST', { id: 9, locked_until: new Date(nowMs - 1000).toISOString(), hb: new Date().toISOString() }, { 'Prefer': 'resolution=merge-duplicates,return=minimal' });

    return ok(res, { nudged: true, inserted, last_time: newest });
  } catch (e) {
    console.error('[Nudge Error]', e);
    // Ensure lock is released on crash
    await supaFetch('boat_state', '', 'POST', { id: 9, locked_until: new Date(Date.now() - 1000).toISOString() }, { 'Prefer': 'resolution=merge-duplicates,return=minimal' }).catch(()=>{});
    return error(res, 500, 'Nudge failed: ' + e.message);
  }
}

// ═══════════════════════════════════════════════════════════
//  🚤 BOAT 1 — CDR Boat v5 (OPTIMIZED for near-real-time)
// ══════════════════════════════════════════════════════════
if (url === '/boats/cdr' && req.method === 'POST') {
if (req.headers.authorization !== `Bearer ${BOAT_SECRET}`) return error(res, 401, 'Unauthorized');
try {
const nowMs = Date.now();
const lockRows = await supaFetch('boat_state', 'id=eq.9&select=locked_until');
const lkUntil = (Array.isArray(lockRows) && lockRows[0] && lockRows[0].locked_until) ? new Date(lockRows[0].locked_until).getTime() : 0;
if (lkUntil > nowMs + 2000) return ok(res, { skipped: true, reason: 'chain already running' });

// ✅ Extend lock to prevent overlap but allow frequent runs
await supaFetch('boat_state', '', 'POST', { id: 9, locked_until: new Date(nowMs + 25000).toISOString(), hb: new Date().toISOString() }, { 'Prefer': 'resolution=merge-duplicates,return=minimal' });

// ✅ Auto-resolve pending false alarms
await supaFetch('system_incidents', 'type=in.(boat_failure,lamix_api_down)&status=eq.pending', 'PATCH', { status: 'dismissed' }); 

const st = await supaFetch('cdr_state', 'id=eq.1&select=last_time');
let lastTime = (Array.isArray(st) && st[0] && st[0].last_time) ? normT(st[0].last_time) : new Date(nowMs).toISOString().slice(0, 19).replace('T', ' '); // 🛡️ wipe-safe + space format

const ncMap = await getNumberClientMap(); // ✅ Uses the 60s cached map

const RUN_START = Date.now();
const MAX_RUN_MS = 9000;   // ✅ Push closer to 10s limit
const CADENCE_MS = 1100;   // ✅ OPTIMIZED: 1.1s (just over LaMix 1s rate limit)
let insertedTotal = 0, newest = normT(lastTime), savedAs = '', calls = 0;
let hasNewData = false;

while (calls < 15 && (Date.now() - RUN_START) < MAX_RUN_MS) {
if ((Date.now() - RUN_START) > 8500) {
console.log('[CDR] Stopping early to avoid Vercel 10s timeout');
break;
}
calls++;

const data = await lamixGet('/cdrs', { from: lastTime, limit: 500 });

if (data._rateLimited) { 
console.log('[CDR] Rate limited, backing off');
await new Promise(r => setTimeout(r, 1500)); 
break; 
}
if (data._error) {
  console.error('[CDR] API Error:', data._error);
  sccReport(
    'lamix_api_down',
    'critical',
    'LaMix API unreachable',
    'CDR boat error: ' + data._error,
    {}
  );
  break;
}

const records = data.records || data.clients || [];

if (records.length) {
hasNewData = true;
const payload = records.map(r => ({
time: r.time, number: r.number, cli: r.cli,
client: r.client || ncMap.get(r.number) || null, // ✅ Checks LaMix JSON first
content: r.content, range: r.range, range_prefix: r.rangePrefix,
currency: r.currency, payout: r.payout, client_payout: r.clientPayout,
status: r.status, cleared_at: r.clearedAt
}));

await supaFetch('sms_cdr', 'on_conflict=time,number,cli', 'POST', payload, { 'Prefer': 'resolution=ignore-duplicates,return=minimal' });
insertedTotal += records.length;

let maxT = newest, minT = null;
const firstT = normT(records[0].time), lastRecT = normT(records[records.length - 1].time);
const ascOrder = firstT <= lastRecT;   // 🕵️ detect LaMix page order BEFORE sorting
records.sort((a, b) => { const x = normT(a.time), y = normT(b.time); return x < y ? -1 : x > y ? 1 : 0; }); // ⬆️ GAP FIX: oldest-first processing
records.forEach(r => { const t = normT(r.time); if (t > maxT) maxT = t; if (!minT || t < minT) minT = t; });
// 🛡️ BURST/BACKLOG GUARD: advance only when the batch is complete OR order is provably ascending
if (records.length < 500 || ascOrder) { newest = maxT; lastTime = maxT; }
else { console.log('[CDR] full batch + desc order: holding watermark (no skip)'); }

if (records.length >= 500 && minT !== maxT) {
if (newest !== savedAs) { 
savedAs = newest; 
await supaFetch('cdr_state', '', 'POST', { id: 1, last_time: newest }, { 'Prefer': 'resolution=merge-duplicates,return=minimal' }); 
}
await new Promise(r => setTimeout(r, CADENCE_MS));
continue;
}
}

// ✅ Heartbeat + lock refresh
await supaFetch('boat_state', '', 'POST', { id: 9, locked_until: new Date(Date.now() + 25000).toISOString(), hb: new Date().toISOString() }, { 'Prefer': 'resolution=merge-duplicates,return=minimal' });

if (newest !== savedAs) { 
savedAs = newest; 
await supaFetch('cdr_state', '', 'POST', { id: 1, last_time: newest }, { 'Prefer': 'resolution=merge-duplicates,return=minimal' }); 
}

// ✅ If no records, exit faster (nothing new)
if (!records.length) {
console.log('[CDR] No new records, exiting early');
break;
}

await new Promise(r => setTimeout(r, CADENCE_MS));
}

// Final save
if (newest !== savedAs) {
await supaFetch('cdr_state', '', 'POST', { id: 1, last_time: newest }, { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
}

// ✅ Release lock immediately
await supaFetch('boat_state', '', 'POST', { id: 9, locked_until: new Date(Date.now() - 1000).toISOString(), hb: new Date().toISOString() }, { 'Prefer': 'resolution=merge-duplicates,return=minimal' });

// ✅ AGGRESSIVE SELF-CHAINING: If we found data, chain immediately
if (hasNewData) {
      const chainTask = new Promise(resolve => {
        setTimeout(() => {
          axios.post(`https://${req.headers.host}/api/boats/cdr`, {}, {
            headers: { 'Authorization': `Bearer ${BOAT_SECRET}`, 'Content-Type': 'application/json' },
            timeout: 2000
          }).catch(() => {}).finally(resolve);
        }, 800);
      });
      try { if (waitUntil) waitUntil(chainTask); } catch (e) {}
    }

return ok(res, { inserted: insertedTotal, last_time: newest, chained: hasNewData, calls: calls });
} catch (e) {
console.error('[CDR Boat Error]', e);
// ✅ Release lock on error
await supaFetch('boat_state', '', 'POST', { id: 9, locked_until: new Date(Date.now() - 1000).toISOString(), hb: new Date().toISOString() }, { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
return error(res, 500, 'CDR Boat: ' + e.message);
}
}

// ═══════════════════════════════════════════════════════════
//  🚤 BOAT 3 — Numbers Boat (sweep & prune assigned numbers)
// ═══════════════════════════════════════════════════════════
if (url === '/boats/numbers' && req.method === 'POST') {
try { const cpz=require('child_process'); for (let wi=0; wi<3; wi++) { const age=parseFloat((cpz.execSync(`sudo -u postgres psql -P pager=off -d zamil_p1 -Atc "SELECT coalesce(extract(epoch from now()-hb),999) FROM boat_state WHERE id=2"`).toString().trim())||'999'); if (age>90) break; await new Promise(r2=>setTimeout(r2,20000)); } } catch(e){}
  if (req.headers.authorization !== `Bearer ${BOAT_SECRET}`) return error(res, 401, 'Unauthorized');

  boatHb(2);
  try {
    const st = await supaFetch('boat_state', 'id=eq.2&select=cursor,updated_at');
    const row = (Array.isArray(st) && st[0]) ? st[0] : null;
    
    let after = (row && row.cursor) ? row.cursor : null;
    let sweepStart = (row && row.updated_at) ? row.updated_at : new Date().toISOString();
    
    const mirror = await supaFetch('ranges_mirror', 'select=range_id,name&limit=1000');
    const nameById = new Map();
    if (Array.isArray(mirror)) mirror.forEach(r => nameById.set(r.range_id, r.name));
    
    let total = 0, pages = 0;
    const START = Date.now();
    
    while (pages < 4 && (Date.now() - START) < 7000) { 
      if (pages > 0) await new Promise(r => setTimeout(r, 1050));
      const params = { limit: 500 };
      if (after) params.after = after;
      
      const data = await lamixGet('/numbers', params);
      if (data._rateLimited || data._error) break;
      
      const assigned = (data.records || data.clients || []).filter(n => n.client);
      if (assigned.length) {
        const payload = assigned.map(n => ({
          number: n.number, 
          range_id: n.rangeId || null,
          range_name: n.range || nameById.get(n.rangeId) || undefined,
          client: n.client, 
          status: 'active', 
          plan: n.plan,
          payout_rate: n.payoutRate, 
          updated_at: new Date().toISOString() // ✅ FIX: Keeps active numbers alive for Boat 6
        }));
        await supaFetch('user_numbers', '', 'POST', payload, { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
try { await supaFetch('lamix_numbers_mirror', '', 'POST', toAssign.map(nn => ({ number: nn, client: g.client, range_id: g.range_id, synced_at: nowIso })), { 'Prefer': 'resolution=merge-duplicates,return=minimal' }); } catch (e) {}
try{ await supaFetch('lamix_numbers_mirror','', 'POST', toAssign.map(nn=>({number:nn, client:g.client, range_id:g.range_id, synced_at:nowIso})), {'Prefer':'resolution=merge-duplicates,return=minimal'}); }catch(e){}
        total += assigned.length;
      }
      pages++;
      after = data.nextCursor || null;
      if (!after) break;
    }
    
    /* CAPTAIN: sweep deletes disabled */
    if (!after) {
      /* CAPTAIN: sweep deletes disabled */
      await supaFetch('boat_state', '', 'POST', { id: 2, cursor: null, updated_at: new Date().toISOString() }, { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
    } else {
      await supaFetch('boat_state', '', 'POST', { id: 2, cursor: after, updated_at: sweepStart }, { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
    }
    
    await supaFetch('rpc/fix_range_names', '', 'POST', {});
    return ok(res, { synced: total, pages: pages, nextCursor: after });
  } catch (e) { 
    console.error('[Numbers Boat Error]', e);
    return error(res, 500, 'Numbers Boat: ' + e.message); 
  }
}

// ═══════════════════════════════════════════════════════════
//  ⛵ BOAT 4 — Allocation Boat (TIME-BUDGETED & RATE-LIMITED)
// ═══════════════════════════════════════════════════════════
if (url === '/boats/alloc' && req.method === 'POST') {
try { const cpz=require('child_process'); for (let wi=0; wi<3; wi++) { const age=parseFloat((cpz.execSync(`sudo -u postgres psql -P pager=off -d zamil_p1 -Atc "SELECT coalesce(extract(epoch from now()-hb),999) FROM boat_state WHERE id=2"`).toString().trim())||'999'); if (age>90) break; await new Promise(r2=>setTimeout(r2,20000)); } } catch(e){}
    if (req.headers.authorization !== `Bearer ${BOAT_SECRET}`) return error(res, 401, 'Unauthorized');
    boatHb(1);
    const RUN_START = Date.now();
    const MAX_RUN_MS = 52000; 
    const DELAY_MS = 1050;    
    const MAX_CALLS = 36;     
    
    try {
        // ── SELF-HEAL: fail hopeless pending batches (>3h, never processed) on EVERY tick ──
        try {
          const cut3h = new Date(Date.now() - 3*3600000).toISOString();
          await supaFetch('alloc_queue', 'status=eq.pending&processed_at=is.null&created_at=lt.' + encodeURIComponent(cut3h), 'PATCH', { status: 'failed', result: { error: 'stuck_reaped' }, processed_at: new Date().toISOString() });
        } catch (e) {}
        const queue = await supaFetch('alloc_queue', 'status=eq.pending&order=created_at.asc&limit=100');
// === WAVE HOOK ===
if (Array.isArray(queue) && queue.length >= 9999) { const w = await waveProcess(queue); try { pushEv('numbers'); } catch (e) {} return ok(res, w); }
// =================

// 🛰️ SCC: overload incident + CDR stream watchdog
        if (queue.length >= 40) sccReport('queue_overload', queue.length >= 99990 ? 'critical' : 'warning', 'Allocation queue overload', 'Queue depth ' + queue.length + ' pending batches.', { queue_size: queue.length });
        try {
  const hbRow = await supaFetch('boat_state', 'id=eq.9&select=hb');
  const lt = (Array.isArray(hbRow) && hbRow[0] && hbRow[0].hb) ? new Date(hbRow[0].hb).getTime() : 0;
  if (lt && (Date.now() - lt) > 15 * 60000) {
    const dup = await supaFetch('system_incidents', 'type=eq.boat_failure&status=eq.pending&select=id&limit=1');
    if (!Array.isArray(dup) || !dup.length) sccReport('boat_failure', 'critical', 'CDR stream dead', 'No CDR boat heartbeat for >15 min. OTP sync stalled.', { stale_ms: Date.now() - lt });
  }
} catch (e) {}
      
        if (!Array.isArray(queue) || !queue.length) return ok(res, { processed: 0, remaining: 0 });

        const groups = {};
        queue.forEach(q => {
            const key = q.client + '|' + q.range_id + '|' + q.payout_rate;
            if (!groups[key]) groups[key] = { client: q.client, range_id: q.range_id, range_name: q.range_name, payout_rate: q.payout_rate, qty: 0, ids: [] };
            groups[key].qty += (q.qty || 0); 
            groups[key].ids.push(q.id);
        });

        let callsMade = 0;
        let processedItems = 0;

        for (const key in groups) {
            const g = groups[key];
            
            // 🛑 CHECK BUDGET BEFORE GET
            if (callsMade >= MAX_CALLS || (Date.now() - RUN_START) > MAX_RUN_MS) break;
            callsMade++; // ✅ FIX: TRACK THE GET CALL
            
            const numData = await lamixGet('/numbers', { rangeId: g.range_id, assigned: false, limit: Math.min(g.qty, 1000) });

            if (numData._rateLimited || numData._error) continue;
            let freeNums = (numData.records || []).map(n => n.number);

            if (!freeNums.length) { 
              // 🛑 CHECK BUDGET BEFORE FALLBACK GET
              if (callsMade >= MAX_CALLS || (Date.now() - RUN_START) > MAX_RUN_MS) break;
              callsMade++; // ✅ FIX: TRACK THE FALLBACK GET CALL
              const all = await lamixGet('/numbers', { rangeId: g.range_id, limit: 1000 });
              if (!all._rateLimited && !all._error) freeNums = (all.records || []).filter(n => !n.client).map(n => n.number);
            }
            
            // === RATE GUARD ===
if (typeof free !== 'undefined' && free && (free._rateLimited || free._error)) { continue; }
// ====================
if (!freeNums.length) {
                await supaFetch('alloc_queue', `id=in.(${g.ids.join(',')})`, 'PATCH', { status: 'failed', result: { error: 'no_free_numbers' }, processed_at: new Date().toISOString() });
                continue;
            }

            const toAssign = freeNums.slice(0, g.qty);
            const chunks = [];
            for (let i = 0; i < toAssign.length; i += 1000) chunks.push(toAssign.slice(i, i + 1000));

            let allSuccess = true;
            let finalResult = {};

            for (const chunk of chunks) {
                if (callsMade >= MAX_CALLS || (Date.now() - RUN_START) > MAX_RUN_MS) break;
                await new Promise(r => setTimeout(r, DELAY_MS)); 
                callsMade++;
                
                const assignRes = await lamixPost('/numbers/assign', { 
                    client: g.client, numbers: chunk, clientPayoutRate: String(g.payout_rate) 
                });
                
                if (assignRes._error || assignRes._rateLimited) {
                  if (assignRes._rateLimited) sccReport('rate_limit', 'warning', 'LaMix 429 on /numbers/assign', 'Assignment hit rate limit; boat backing off.', {});
                    allSuccess = false; finalResult = assignRes; break;
                }
                finalResult = assignRes;
            }

            if (allSuccess) {
                const nowIso = new Date().toISOString();
                const payload = toAssign.map(n => ({ number: n, client: g.client, range_id: g.range_id, range_name: g.range_name || '', status: 'active', updated_at: nowIso }));
                await supaFetch('user_numbers', '', 'POST', payload, { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
                await supaFetch('alloc_queue', `id=in.(${g.ids.join(',')})`, 'PATCH', { status: 'done', result: finalResult, processed_at: nowIso });
                processedItems += toAssign.length;
            } else {
                await supaFetch('alloc_queue', `id=in.(${g.ids.join(',')})`, 'PATCH', { status: 'failed', result: finalResult, processed_at: new Date().toISOString() });
            }
        }
        
        const remainingQueue = await supaFetch('alloc_queue', 'status=eq.pending&select=id');
        const remaining = Array.isArray(remainingQueue) ? remainingQueue.length : 0;
        
        return ok(res, { processed: callsMade, remaining: remaining, etaMins: Math.ceil(remaining / 30) });
    } catch (e) {
        console.error('[Alloc Boat Error]', e);
        return error(res, 500, 'Alloc Boat: ' + e.message);
    }
}

// ═══════════════════════════════════════════════════════════
//  🔧 BOAT 4.5 — Backfill CDR Clients
// ═══════════════════════════════════════════════════════════
if (url === '/boats/backfill' && req.method === 'POST') {
  if (req.headers.authorization !== `Bearer ${BOAT_SECRET}`) return error(res, 401, 'Unauthorized');

  boatHb(3);
  try {
    const r = await supaFetch('rpc/backfill_cdr_clients', '', 'POST', {});
// 🧲 COUNTER RAIL self-heal: move counts from System Generated → real owner
const bd = businessDayPKT();
await supaFetch('rpc/recount_cdr_day', '', 'POST', { p_day: bd.label });
return ok(res, { updated: r, recounted: bd.label });
  } catch (e) {
    return error(res, 500, 'Backfill Boat: ' + e.message);
  }
}

// ═══════════════════════════════════════════════════════════
//  🛥️ BOAT 5 — Client Create Boat (processes client_queue)
// ═══════════════════════════════════════════════════════════
if (url === '/boats/clients' && req.method === 'POST') {
  if (req.headers.authorization !== `Bearer ${BOAT_SECRET}`) return error(res, 401, 'Unauthorized');

  boatHb(4);
  try {
    const queue = await supaFetch('client_queue', 'status=eq.pending&order=created_at.asc&limit=10');
    if (!Array.isArray(queue) || !queue.length) return ok(res, { processed: 0 });
    
    let processed = 0;
    for (const item of queue) {
      await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000)); 
      const body = { 
        username: item.username, 
        canUseApi: !!item.can_use_api, 
        canViewRanges: !!item.can_view_ranges,
        canUseExtendedApi: !!item.can_use_extended_api 
      };
      if (item.name) body.name = item.name;
      if (item.email) body.email = item.email;
      if (item.contact) body.contact = item.contact;
      
      const result = await lamixPost('/clients', body);
      const success = !result._error && !result._rateLimited;
      
      await supaFetch('client_queue', `id=eq.${item.id}`, 'PATCH', {
        status: success ? 'done' : 'failed',
        generated_password: result.password || null,
        result, 
        processed_at: new Date().toISOString(),
      });
      
      if (success) {
        sendNotif(item.admin_username, 'success', 'Client Created', `✅ ${item.username} created${result.password ? ' | Pass: ' + result.password : ''}`, 'system');
      } else {
        sendNotif(item.admin_username, 'warn', 'Client Creation Failed', `❌ ${item.username} failed: ${result._error || 'Unknown error'}`, 'system');
      }
      processed++;
    }
    return ok(res, { processed });
  } catch (e) { 
    console.error('[Clients Boat Error]', e);
    return error(res, 500, 'Clients Boat: ' + e.message); 
  }
}

// ═══════════════════════════════════════════════════════════
//  🧹 BOAT 6 — Cleanup Boat (releases stale numbers + 5AM history purge)
// ═══════════════════════════════════════════════════════════
if (url === '/boats/cleanup' && req.method === 'POST') {
// === GHOST PURGE H ===
try { await supaFetch('ranges_mirror', 'or=(name.is.null,name.eq.)', 'DELETE'); const mir = await supaFetch('ranges_mirror', 'select=range_id&limit=2000'); const ids = (Array.isArray(mir) ? mir : []).map(m => m.range_id).filter(Boolean); /* CAPTAIN: ghost-H row delete disabled */ } catch (e) { console.error('[ghost-purge-h]', e.message); }
// =====================
if (req.headers.authorization !== `Bearer ${BOAT_SECRET}`) return error(res, 401, 'Unauthorized');
boatHb(5);
try {
const truncated = await supaFetch('rpc/truncate_old_cdr', '', 'POST', {});   // 🕔 5AM PKT raw purge
await supaFetch('alloc_queue', `status=neq.pending&created_at=lt.${encodeURIComponent(_todayStartUTC())}`, 'DELETE');

    return ok(res, { released: 0, truncated: truncated || 0 });
} catch (e) {
console.error('[Cleanup Boat Error]', e);
    return error(res, 500, 'Cleanup Boat: ' + e.message); 
  }
}

// ═══════════════════════════════════════════════════════════
//  🧽 BOAT 7 — Sync Boat (refresh mirror + DELETE ghost ranges)
// ═══════════════════════════════════════════════════════════
if ((url === '/boats/sync' || url === '/boats/ranges') && req.method === 'POST') {
  if (req.headers.authorization !== `Bearer ${BOAT_SECRET}`) return error(res, 401, 'Unauthorized');
  boatHb(6);
  try {
    const data = await lamixGet('/ranges');
    if (data._error || data._rateLimited) return error(res, 502, 'LaMix: ' + (data._error || 'rate limited'));
    const recs = (data && (data.ranges || data.records)) || [];
    if (!recs.length) return error(res, 502, 'LaMix returned 0 ranges — refusing to touch mirror');
    const liveIds = recs.map(r => String(r.id));

    await supaFetch('ranges_mirror', '', 'POST', recs.map(r => ({
      range_id: String(r.id), name: r.name, prefix: r.prefix || '', currency: r.currency || 'USD',
      numbers: r.numbers || 0, unassigned: r.unassignedNumbers || 0, rates: r.rates || [],
      is_active: true, updated_at: new Date().toISOString()
    })), { 'Prefer': 'resolution=merge-duplicates,return=minimal' });

    // [CAPTAIN] ghost delete owned by engine (70% guard)
    return ok(res, { live: recs.length, ghostsRemoved: true });
  } catch (e) {
    console.error('[Sync Boat Error]', e);
    return error(res, 500, 'Sync Boat: ' + e.message);
  }
}

    // ═══════════════════════════════════════════════════════
    //  1. LOGIN
    // ════════════════════════════════════════════
    if (url === '/login' && req.method === 'POST') {
      const rawUsername = (req.body.username || '').trim();
      const password = (req.body.password || '').trim();
      if (!rawUsername || !password) return error(res, 400, 'Username and password required');
      
      const want = rawUsername.toLowerCase();
      const fallback = {
        'sameer_khan221': { clientId: '0', clientName: 'Sameer_Khan221', panelNum: 1 },
     'muzammil62': { clientId: '0', clientName: 'Agent', panelNum: 1 },
        'zml_ahsan':  { clientId: '169269', clientName: 'ZML_Ahsan', panelNum: 1 },
        'zml_anns':   { clientId: '169270', clientName: 'ZML_Anns', panelNum: 1 },
      };
      
      if (fallback[want]) {
        if (supaEnabled()) {
          const creds = await supaGetCreds(rawUsername);
          if (creds && creds.pass_hash && !verifyPassword(password, creds.pass_hash)) return error(res, 401, 'Incorrect password.');
        }
        const u = fallback[want];
        const token = jwt.sign({ username: rawUsername, clientId: u.clientId, clientName: u.clientName, panelNum: u.panelNum }, JWT_SECRET, { expiresIn: '7d' });
        return ok(res, { session: token, username: rawUsername, clientId: u.clientId, clientName: u.clientName, redirect: '/dashboard/dashboard.html' });
      }
      
      if (supaEnabled()) {
        const creds = await supaGetCreds(rawUsername);
        if (creds && creds.pass_hash) {
          if (!verifyPassword(password, creds.pass_hash)) return error(res, 401, 'Incorrect password.');
          const token = jwt.sign({ username: rawUsername, clientId: creds.client_id || '0', clientName: creds.client_name || rawUsername, panelNum: 1 }, JWT_SECRET, { expiresIn: '7d' });
          return ok(res, { session: token, username: rawUsername, clientId: creds.client_id || '0', clientName: creds.client_name || rawUsername, redirect: '/dashboard/dashboard.html' });
        }
        
        // ✅ FIX: Generate token for firstLogin INSIDE the supaEnabled block// ✅ FIRST LOGIN: user exists in LaMix → save chosen password → auto-login// ✅ FIRST LOGIN: user exists in LaMix → DO NOT save password → force Activate screen
     const lamix = await lookupLaMixClient(rawUsername);
     if (lamix) {
       const token = jwt.sign({ username: rawUsername, clientId: lamix.clientId, clientName: lamix.clientName, panelNum: 1 }, JWT_SECRET, { expiresIn: '7d' });
       return ok(res, { 
         session: token, 
         username: rawUsername, 
         clientId: lamix.clientId, 
         clientName: lamix.clientName, 
         firstLogin: true, 
         redirect: '/dashboard/dashboard.html' 
       });
     }
     return error(res, 401, 'Client not found in LaMix. Check the username.');
      }
      
      // Fallback if Supabase is completely disabled
      const lamix = await lookupLaMixClient(rawUsername);
      if (lamix) {
        const token = jwt.sign({ username: rawUsername, clientId: lamix.clientId, clientName: lamix.clientName, panelNum: 1 }, JWT_SECRET, { expiresIn: '7d' });
        return ok(res, { session: token, username: rawUsername, clientId: lamix.clientId, clientName: lamix.clientName, redirect: '/dashboard/dashboard.html' });
      }
      return error(res, 401, 'Client not found in LaMix.');
    }
      
    // ── Auth sub-routes ─────────────────────────────────────
    if (url === '/auth/set-password' && req.method === 'POST') {
      const { username, clientId, clientName, password, recovery } = req.body;
      if (!username || !password || String(password).length < 6) return error(res, 400, 'Password must be at least 6 characters.');
      if (!supaEnabled()) return error(res, 400, 'Password storage not configured.');if (!recovery || String(recovery).length < 4) return error(res, 400, 'Recovery code is required — write it down, it is the only way to reset password 🔑.');
const recHash = hashPassword(String(recovery));
      await supaUpsertCreds(username, hashPassword(password), clientId || '0', clientName || username, recHash);
      const token = jwt.sign({ username, clientId: clientId || '0', clientName: clientName || username, panelNum: 1 }, JWT_SECRET, { expiresIn: '7d' });
      return ok(res, { session: token, username, clientId: clientId || '0', clientName: clientName || username, redirect: '/dashboard/dashboard.html' });
    }
    if (url === '/auth/change-password' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const { oldPassword, newPassword } = req.body;
      if (!newPassword || String(newPassword).length < 6) return error(res, 400, 'New password must be at least 6 characters.');
      if (!supaEnabled()) return error(res, 400, 'Password storage not configured.');
      const creds = await supaGetCreds(user.username);
      if (!creds || !creds.pass_hash) return error(res, 404, 'No password set yet.');
      if (!verifyPassword(oldPassword, creds.pass_hash)) return error(res, 401, 'Current password is incorrect.');
      await supaUpsertCreds(user.username, hashPassword(newPassword), creds.client_id, creds.client_name);
      return ok(res, { message: 'Password updated.' });
    }
    if (url === '/auth/forgot-password' && req.method === 'POST') {
      const { username, recovery, newPassword } = req.body;
      if (!username || !recovery || !newPassword || String(newPassword).length < 6) return error(res, 400, 'All fields required.');
      if (!supaEnabled()) return error(res, 400, 'Password storage not configured.');
      const creds = await supaGetCreds(username);
      if (!creds || !creds.recovery_hash) return error(res, 401, 'Reset not available.');
      if (!verifyPassword(recovery, creds.recovery_hash)) return error(res, 401, 'Incorrect recovery code.');
      await supaUpsertCreds(username, hashPassword(newPassword), creds.client_id, creds.client_name, creds.recovery_hash);
      return ok(res, { message: 'Password reset.' });
    }
    if (url === '/auth/role' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      return ok(res, { role: await getRole(user.username), username: user.username });
    }
    if (url === '/ping' && req.method === 'POST') {
      return getUserFromSession(req.body.session) ? ok(res) : error(res, 401, 'Session expired');
    }

    // ═══════════════════════════════════════════════════════
    //  2. RANGES  (user's ranges from user_numbers in Supabase)
    // ═══════════════════════════════════════════════════════
   if (url === '/ranges' && req.method === 'POST') {
  const user = getUserFromSession(req.body.session);
  if (!user) return error(res, 401, 'Unauthorized');
  
  const idents = [user.username, user.clientName].filter(Boolean)
    .map(s => 'client.ilike.' + encodeURIComponent(String(s).trim()));
  const rows = await supaFetch('user_numbers', 'select=number,range_id,range_name,client&limit=1000000&status=eq.active&or=(' + idents.join(',') + ')');
  
  let mirror = await supaFetch('ranges_mirror', 'select=*&limit=1000');
  
  // 🚨 SELF-HEAL: If mirror is empty, pull live from LaMix!
  if (!Array.isArray(mirror) || !mirror.length) {
    const live = await lamixGet('/ranges');
    // ✅ FIX: LaMix returns "ranges" NOT "records"
    const recs = (live && (live.ranges || live.records)) || [];
    if (recs.length) {
      await supaFetch('ranges_mirror', '', 'POST', recs.map(r => ({
        range_id: String(r.id), name: r.name, prefix: r.prefix || '', currency: r.currency || 'USD',
        numbers: r.numbers || 0, unassigned: r.unassignedNumbers || 0, rates: r.rates || [],
        is_active: true, updated_at: new Date().toISOString()
      })), { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
      mirror = await supaFetch('ranges_mirror', 'select=*&limit=1000');
    }
  }

  const nameById = new Map();
  const prefixById = new Map();
  
  if (Array.isArray(mirror)) {
    mirror.forEach(r => {
      nameById.set(r.range_id, r.name);
      prefixById.set(r.range_id, r.prefix || '');
    });
  }
  
  const m = new Map();
  (Array.isArray(rows) ? rows : []).forEach(n => {
    if (!n.range_id && !n.range_name) return;
    const title = n.range_name || nameById.get(n.range_id) || ('Range ' + String(n.range_id || '').slice(0, 8));
    const key = n.range_id || title;
    
    if (!m.has(key)) {
      m.set(key, { 
        id: n.range_id || ('r_' + norm(title)), 
        title: title, 
        prefix: prefixById.get(n.range_id) || '', 
        country: _countryOfRange(title), 
        count: 0 
      });
    }
    m.get(key).count++;
  });
  
  const _rr = Array.from(m.values()); _rangesCacheSet(user.username, _rr); return ok(res, { ranges: _rr });
}

// ═══════════════════════════════════════════════════════════
//  UNASSIGN ROUTE (Returns numbers to LaMix & deletes from Supabase)
// ═══════════════════════════════════════════════════════════
if (url === '/range/unassign' && req.method === 'POST') {
  const user = getUserFromSession(req.body.session);
  if (!user) return error(res, 401, 'Unauthorized');
  
  const rangeId = String(req.body.rangeId || '').trim();
  if (!rangeId) return error(res, 400, 'rangeId required');

  // 1. Find all numbers belonging to this user
  const idents = [user.username, user.clientName].filter(Boolean)
    .map(s => 'client.ilike.' + encodeURIComponent(String(s).trim()));
  
  const rows = await supaFetch('user_numbers', `select=number,range_id,range_name&limit=20000&status=neq.released&or=(${idents.join(',')})`);
  if (!Array.isArray(rows)) return error(res, 500, 'Failed to fetch numbers');
  
  // 2. Filter numbers that belong to the requested rangeId
  const toUnassign = rows.filter(n => {
    const nRangeId = String(n.range_id || '');
    const genId = nRangeId || ('r_' + norm(n.range_name || ''));
    return genId === rangeId || nRangeId === rangeId;
  }).map(n => n.number);

  if (!toUnassign.length) return ok(res, { removed: 0, message: 'No numbers found to unassign' });

  // 3. Unassign from LaMix in chunks of 1000 (API limit)
  let removed = 0;
  for (let i = 0; i < toUnassign.length; i += 1000) {
    if (i > 0) await new Promise(r => setTimeout(r, 1100)); // Rate limit safety
    const chunk = toUnassign.slice(i, i + 1000);
    const r2 = await lamixPost('/numbers/unassign', { numbers: chunk });
    if (r2._error || r2._rateLimited) {
      return error(res, 500, 'LaMix unassign failed: ' + (r2._error || 'Rate limited'));
    }
    removed += (r2.assigned || chunk.length);
  }

  // 4. Delete from Supabase in chunks of 100
  for (let i = 0; i < toUnassign.length; i += 100) {
    const nums = toUnassign.slice(i, i + 100).join(',');
    await supaFetch('user_numbers', `number=in.(${nums})`, 'PATCH', { status: 'released', updated_at: new Date().toISOString() }, { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
  }

  
  // 🚀 INSTANT MIRROR UPDATE: Increment available count so Add tab updates immediately
  try {
    const mir = await supaFetch('ranges_mirror', 'range_id=eq.' + encodeURIComponent(rangeId) + '&select=unassigned&limit=1');
    if (Array.isArray(mir) && mir[0]) {
      await supaFetch('ranges_mirror', 'range_id=eq.' + encodeURIComponent(rangeId), 'PATCH', { unassigned: (mir[0].unassigned || 0) + removed, updated_at: new Date().toISOString() });
    }
    if (typeof invalidateNcMap === 'function') invalidateNcMap();
  supaFetch('num_owner_hist', '', 'POST', freeNums.map(x => ({ number: x, client: user.username, last_seen: nowIso })), { 'Prefer': 'resolution=merge-duplicates,return=minimal' }).catch(() => {});
  } catch(e) {}
  return ok(res, { removed, message: `Successfully unassigned ${removed} numbers` });

}
    
    // ═══════════════════════════════════════════════════════
    //  3. NUMBERS  (user's numbers from user_numbers)
    // ═══════════════════════════════════════════════════════
    if (url === '/numbers' && req.method === 'POST') {
  const user = getUserFromSession(req.body.session);
  if (!user) return error(res, 401, 'Unauthorized');
      logActivity(user.username, 'numbers');
  const idents = [user.username, user.clientName].filter(Boolean)
    .map(s => 'client.ilike.' + encodeURIComponent(String(s).trim()));
  const rangeId = String(req.body.rangeId || '').trim();
  const reqTitle = String(req.body.rangeTitle || '').trim();
  let q = 'select=number&limit=20000&status=eq.active&or=(' + idents.join(',') + ')';
  if (rangeId && rangeId.indexOf('r_') !== 0 && rangeId.indexOf('alloc_') !== 0) q += '&range_id=eq.' + encodeURIComponent(rangeId);
  else if (reqTitle) q += '&range_name=eq.' + encodeURIComponent(reqTitle);
  const rows = await supaFetch('user_numbers', q);
  return ok(res, { numbers: (Array.isArray(rows) ? rows : []).map(r => r.number) });
}

    // ═══════════════════════════════════════════════════════
    //  4. SMS COUNT  (from sms_cdr in Supabase)
    // ═══════════════════════════════════════════════════════
   if (url === '/smscount' && req.method === 'POST') {
   const user = getUserFromSession(req.body.session);
   if (!user) return error(res, 401, 'Unauthorized');
   logActivity(user.username, 'smscount');
   const bd = businessDayPKT();
   const totals = await rpcTotals(bd.label, bd.label);          // ~dozens of rows
   const count = sumMine(totals, user);
   const idents = [user.username, user.clientName].filter(Boolean)
     .map(s => 'client.ilike.' + encodeURIComponent('*' + String(s).trim() + '*'));
   const rr = await supaFetch('sms_cdr',
     `time=gte.${encodeURIComponent(bd.from)}&time=lte.${encodeURIComponent(bd.to)}&or=(${idents.join(',')})&order=time.desc&limit=50&select=time,number,cli,content,range`);
   return ok(res, {
     count,
     recent: (Array.isArray(rr) ? rr : []).filter(r => r.client && String(r.client).trim().toLowerCase() !== 'system generated').map(r => ({
       time: (r.time || '').slice(11, 19), datetime: r.time,
       number: r.number, cli: r.cli, message: r.content, range: r.range,
     })),
   });
 }
    if (url === '/number-smscount' && req.method === 'POST') {
   const user = getUserFromSession(req.body.session);
   if (!user) return error(res, 401, 'Unauthorized');
   const number = String(req.body.number || '').replace(/[^0-9]/g, '');
   if (!number) return ok(res, { number, count: 0, recent: [] });
   const bd = businessDayPKT();
   const q = `time=gte.${encodeURIComponent(bd.from)}&time=lte.${encodeURIComponent(bd.to)}&or=(number.eq.${number},number.like.*${number},number.like.${number}*)`;
   const count = await supaCount('sms_cdr', q);                  // header-only COUNT
   const rr = await supaFetch('sms_cdr', q + '&order=time.desc&limit=8&select=time,cli,content,number');
   return ok(res, { number, count, recent: (Array.isArray(rr) ? rr : []).filter(r => r.client && String(r.client).trim().toLowerCase() !== 'system generated').map(r => ({ time: (r.time || '').slice(11, 19), cli: r.cli, message: r.content, number: r.number })) });
 }
    if (url === '/smscount-range' && req.method === 'POST') {
   const user = getUserFromSession(req.body.session);
   if (!user) return error(res, 401, 'Unauthorized');
   const range = req.body.range || 'today';
   const bd = businessDayPKT();
   const fromDay = range === 'week' ? dayBackN(bd.label, 6) : range === 'month' ? dayBackN(bd.label, 29) : bd.label;
   const totals = await rpcTotals(fromDay, bd.label);
   return ok(res, { count: sumMine(totals, user), byNumber: {}, byRange: {} });
 }
  
    // ═══════════════════════════════════════════════════════
    //  6. LEADERBOARD  (from sms_cdr)
    // ═══════════════════════════════════════════════════════
    if (url === '/leaderboard' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      logActivity(user.username, 'leaderboard');
      const range = req.body.range || 'today';
      const bd = businessDayPKT();
      let from = bd.from, to = bd.to;
      if (range !== 'today') {
        const days = range === 'week' ? 7 : 30;
        const pkt = new Date(Date.now() + 5 * 3600000);
        const end = pkt.toISOString().slice(0, 10);
        const start = new Date(pkt.getTime() - (days - 1) * 86400000).toISOString().slice(0, 10);
        from = start + ' 00:00:00'; to = end + ' 23:59:59';
      }
      const days = range === 'week' ? 7 : range === 'month' ? 30 : 1;
   const start = days === 1 ? bd.label : dayBackN(bd.label, days - 1);
   const totals = await rpcTotals(start, bd.label);               // instant at ANY volume
   const __lbClean = totals.filter(r => r.username && String(r.username).trim().toLowerCase() !== 'system generated');
const sorted = __lbClean.map(r => [r.username, Number(r.sms_count || 0)]);
   const users = sorted.slice(0, 50).map(([username, count]) => ({ username, count }));
   const meKeys = [user.clientName, user.username].map(s => String(s || '').toLowerCase().trim()).filter(Boolean);
   let me = null;
   for (let i = 0; i < sorted.length; i++) {
     const k = sorted[i][0].toLowerCase();
     if (meKeys.some(m => k === m || k.includes(m) || m.includes(k))) { me = { rank: i + 1, username: sorted[i][0], count: sorted[i][1] }; break; }
   }
   return ok(res, { users, range, me, total: sorted.length });
}
    // ═══════════════════════════════════════════════════════
    //  7. ALLOCATION  (queue-based, no scraping)
    // ═══════════════════════════════════════════════════════
   if (url === '/alloc/search-ranges' && req.method === 'POST') {
try{require('fs').writeFileSync('/tmp/zamil-range-clue', String(Date.now()));}catch(e){}
const query = String(req.body.query || '').toLowerCase().trim();
let rows = await supaFetch('ranges_mirror', 'select=*&limit=500');
// 🕒 SELF-HEAL + FRESHNESS: refill if empty, refresh if older than 5 minutes
let stale = !Array.isArray(rows) || !rows.length;
if (!stale && rows[0] && rows[0].updated_at) {
  stale = (Date.now() - new Date(rows[0].updated_at).getTime()) > 2 * 60 * 1000;
}
if (stale) {
  const data = await lamixGet('/ranges');
  const recs = (data && (data.ranges || data.records)) || [];
  if (recs.length) {
    await supaFetch('ranges_mirror', '', 'POST', recs.map(r => ({
      range_id: String(r.id), name: r.name, prefix: r.prefix || '', currency: r.currency || 'USD',
      numbers: r.numbers || 0, unassigned: r.unassignedNumbers || 0, rates: r.rates || [],
      is_active: true, updated_at: new Date().toISOString()
    })), { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
    rows = await supaFetch('ranges_mirror', 'select=*&limit=500');
  }
}
const all = (Array.isArray(rows) ? rows : []).map(r => ({
  id: r.range_id,
  title: r.name || ('Range ' + String(r.range_id || '').slice(0, 8)),
  prefix: r.prefix || '',
  country: _countryOfRange(r.name || ''),
  total: r.numbers || 0,
  available: r.unassigned || 0
}));
const filtered = !query ? all : all.filter(r => ((r.country || '') + ' ' + (r.title || '')).toLowerCase().indexOf(query) >= 0);
const withAvail = filtered.filter(r => r.available > 0);
return ok(res, { ranges: (withAvail.length ? withAvail : filtered) });
}
    if (url === '/alloc/daily-used' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const country = _countryOfRange(req.body.rangeTitle || req.body.country || '');
      const rangeId = String(req.body.rangeId || '').trim();
      const role = await getRole(user.username);
      const r = await countDailyAllocByCountry(user.username);
      const countryUsed = r.byCountry[country] || 0;
      const rangeUsed = (r.byRange && r.byRange[rangeId]) || 0;
      if (isAdminish(role)) return ok(res, { country, rangeUsed, rangeLimit: 999, countryUsed, countryLimit: 999, remaining: 999, exempt: true });
      const remaining = supaEnabled() ? Math.max(0, Math.min(RANGE_CAP - rangeUsed, COUNTRY_CAP - countryUsed)) : COUNTRY_CAP;
      return ok(res, { country, rangeUsed, rangeLimit: RANGE_CAP, countryUsed, countryLimit: COUNTRY_CAP, remaining });
    }
    if (url === '/alloc/allocate' && req.method === 'POST') {
const user = getUserFromSession(req.body.session);
if (!user) return error(res, 401, 'Unauthorized');
const rangeId = String(req.body.rangeId || '').trim();
const quantity = parseInt(req.body.quantity) || parseInt(req.body.qty) || 1;
const payout = parseFloat(req.body.payout) || 0.01;
const _country = _countryOfRange(req.body.rangeTitle || '');
const _cap = await countDailyAllocByCountry(user.username);
const _countryUsed = _cap.byCountry[_country] || 0;
const _rangeUsed = (_cap.byRange && _cap.byRange[rangeId]) || 0;
const _role = await getRole(user.username);
if (!isAdminish(_role) && supaEnabled()) {
  if (_rangeUsed >= RANGE_CAP) return ok(res, { limitReached: true, capType: 'range', country: _country, used: _rangeUsed, limit: RANGE_CAP, remaining: 0, message: 'Max ' + RANGE_CAP + ' per range per day reached.' });
  if (_countryUsed >= COUNTRY_CAP) return ok(res, { limitReached: true, capType: 'country', country: _country, used: _countryUsed, limit: COUNTRY_CAP, remaining: 0, message: 'Max ' + COUNTRY_CAP + ' per country per day reached.' });
}
let mir = await supaFetch('ranges_mirror', 'range_id=eq.' + encodeURIComponent(rangeId) + '&select=unassigned&limit=1');
const avail = (Array.isArray(mir) && mir[0]) ? (mir[0].unassigned || 0) : 9999;
if (avail < quantity) return error(res, 400, 'Only ' + avail + ' numbers available in this range right now. Reduce quantity and retry.');
const nowMs = Date.now();
if (!global.__assignStamps) global.__assignStamps = [];
global.__assignStamps = global.__assignStamps.filter(t => nowMs - t < 60000);
if (global.__assignStamps.length >= 37) {
  await supaFetch('alloc_queue', '', 'POST', { username: user.username, client: user.username, range_id: rangeId, range_name: String(req.body.rangeTitle || ''), qty: quantity, payout_rate: payout, status: 'pending' }, { 'Prefer': 'return=minimal' });
  return ok(res, { queued: true, message: '⛵ Queued — high demand, delivering in ~1 min.', allocated: quantity, country: _country, used: _countryUsed + 1, limit: COUNTRY_CAP, remaining: Math.max(0, COUNTRY_CAP - (_countryUsed + 1)) });
}
const pre = await lamixGet('/numbers', { rangeId: rangeId, assigned: false, limit: Math.min(quantity, 1000) });
if (pre._rateLimited) return error(res, 429, 'System busy — try again in a moment.');
if (pre._error) return error(res, 502, 'Availability check failed: ' + pre._error);
const freeNums = ((pre.records || pre.clients || []).map(n => n.number)).filter(Boolean).slice(0, quantity);
try{require('fs').writeFileSync('/tmp/zamil-range-clue', String(Date.now()));}catch(e){}
if (!freeNums.length) return error(res, 400, 'No free numbers left in this range right now.');
const assignRes = await lamixPost('/numbers/assign', { client: user.username, numbers: freeNums, clientPayoutRate: String(payout) });
if (assignRes._error || assignRes._rateLimited) return error(res, 500, 'LaMix assign failed: ' + (assignRes._error || 'rate limited'));
global.__assignStamps.push(nowMs);
const nowIso = new Date().toISOString();
await supaFetch('user_numbers', '', 'POST', freeNums.map(n => ({ number: n, client: user.username, range_id: rangeId, range_name: String(req.body.rangeTitle || ''), status: 'active', updated_at: nowIso })), { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
try { await supaFetch('lamix_numbers_mirror', '', 'POST', freeNums.map(nn => ({ number: nn, client: user.username, range_id: rangeId, synced_at: nowIso })), { 'Prefer': 'resolution=merge-duplicates,return=minimal' }); } catch (e) {}
invalidateNcMap();
try {
  await supaFetch('alloc_queue', '', 'POST', { username: user.username, client: user.username, range_id: rangeId, range_name: String(req.body.rangeTitle || ''), qty: freeNums.length, payout_rate: payout, status: 'done', result: { instant: true }, processed_at: nowIso }, { 'Prefer': 'return=minimal' });
  const mir2 = await supaFetch('ranges_mirror', 'range_id=eq.' + encodeURIComponent(rangeId) + '&select=unassigned&limit=1');
  if (Array.isArray(mir2) && mir2[0]) await supaFetch('ranges_mirror', 'range_id=eq.' + encodeURIComponent(rangeId), 'PATCH', { unassigned: Math.max(0, (mir2[0].unassigned || 0) - freeNums.length), updated_at: nowIso });
} catch (e) {}
await supaInsertEvent({ username: user.username, country: _country, range_id: rangeId, range_title: String(req.body.rangeTitle || ''), qty: quantity });
try{require('fs').writeFileSync('/tmp/zamil-number-clue', String(Date.now()));}catch(e){}
return ok(res, { ok: true, instant: true, message: 'Delivered instantly.', allocated: freeNums.length, country: _country, used: _countryUsed + 1, limit: COUNTRY_CAP, remaining: Math.max(0, COUNTRY_CAP - (_countryUsed + 1)) });
}
// ═══════════════════════════════════════════════════════
    //  8. STATS  (from Supabase)
    // ═══════════════════════════════════════════════════════
if (url === '/stats' && req.method === 'POST') {
   const user = getUserFromSession(req.body.session);
   if (!user) return error(res, 401, 'Unauthorized');
   // ✅ NOW VISIBLE TO ALL LOGGED-IN USERS (admin check removed)
   const bd = businessDayPKT();
   const today = bd.label;
   const dayBack = n => new Date(new Date(today + 'T00:00:00Z').getTime() - n * 86400000).toISOString().slice(0, 10);
   // ✅ REAL POOL TRUTH from ranges_mirror (LaMix-synced), NOT user_numbers
   const mirror = await supaFetch('ranges_mirror', 'select=name,numbers,unassigned,is_active&limit=1000');
   const mArr = (Array.isArray(mirror) ? mirror : []).filter(r => r.is_active !== false);
   let totalNumbers = 0, available = 0;
   const countryMap = {};
   mArr.forEach(r => {
     const tot = r.numbers || 0, av = r.unassigned || 0;
     totalNumbers += tot; available += av;
     const ctry = _countryOfRange(r.name || '') || 'Other';
     const key = ctry.toLowerCase();
     if (!countryMap[key]) countryMap[key] = { country: ctry, flag: countryFlag(ctry), ranges: {} };
     if (!countryMap[key].ranges[r.name]) countryMap[key].ranges[r.name] = { range: r.name, available: 0, total: 0 };
     countryMap[key].ranges[r.name].total += tot;
     countryMap[key].ranges[r.name].available += av;
   });
   const allocated = totalNumbers - available;
   const countries = Object.values(countryMap).map(c => ({ country: c.country, flag: c.flag, ranges: Object.values(c.ranges).sort((a, b) => b.available - a.available) })).sort((a, b) => a.country.localeCompare(b.country));
   // OTP counts (unchanged — already correct)
   // 🔒 OTP counts (Restricted to SUPER ADMIN for security & performance)
const role = await getRole(user.username);
const isSuper = (role === 'super');

let otpToday = 0, otpWeek = 0, otpMonth = 0, mostActiveRange = '—', mostActiveCount = 0;

if (isSuper) {
  const [tT, tW, tM, rg] = await Promise.all([
    rpcTotals(today, today), rpcTotals(dayBack(6), today), rpcTotals(dayBack(29), today),
    supaFetch('rpc/get_range_totals', '', 'POST', { p_from: bd.from, p_to: bd.to }),
  ]);
  const sum = a => a.reduce((s, r) => s + Number(r.sms_count || 0), 0);
  otpToday = sum(tT); otpWeek = sum(tW); otpMonth = sum(tM);
  (Array.isArray(rg) ? rg : []).forEach(r => { if (Number(r.cnt) > mostActiveCount) { mostActiveCount = Number(r.cnt); mostActiveRange = r.range_name; } });
}

return ok(res, { 
    totalCountries: countries.length, 
    totalRanges: mArr.length, 
    totalNumbers, 
    allocated, 
    available, 
    otpToday, 
    otpWeek, 
    otpMonth, 
    mostActiveRange, 
    mostActiveCount, 
    countries 
});
 }

    // ═══════════════════════════════════════════════════════
    //  9. CLIENTS LIST  (LaMix REST API)
    // ═══════════════════════════════════════════════════════
    if (url === '/clients/list' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const data = await lamixGet('/clients', { limit: 500 });
      if (data._error || data._rateLimited) return ok(res, { clients: [] });
      const clients = (data.records || data.clients || []).map(c => ({
        id: c.username, username: c.username, name: c.name || c.username,
        numbers: c.numbers || 0, disabled: c.disabled || false, panelNum: 1,
      }));
      return ok(res, { clients });
    }

    // ═══════════════════════════════════════════════════════
    //  10. ADMIN ROUTES  (Supabase-based, kept from original)
    // ═══════════════════════════════════════════════════════
    if (url === '/admin/admins' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      if ((await getRole(user.username)) !== 'super') return error(res, 403, 'Super admin only');
      const rows = await supaFetch('user_roles', 'select=username,role,added_by,created_at&order=created_at.asc');
      return ok(res, { admins: Array.isArray(rows) ? rows : [] });
    }
    if (url === '/admin/promote' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      if ((await getRole(user.username)) !== 'super') return error(res, 403, 'Super admin only');
      const target = String(req.body.username || '').trim().toLowerCase();
      if (!target) return error(res, 400, 'Username required');
      if (target === SUPER_ADMIN) return error(res, 400, 'Cannot modify the super admin');
      await supaFetch('user_roles', '', 'POST', { username: target, role: 'admin', added_by: user.username }, { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
      _roleCache.delete(target);
      return ok(res, { message: target + ' is now an admin' });
    }
    if (url === '/admin/demote' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      if ((await getRole(user.username)) !== 'super') return error(res, 403, 'Super admin only');
      const target = String(req.body.username || '').trim().toLowerCase();
      if (!target) return error(res, 400, 'Username required');
      await supaFetch(`user_roles?username=eq.${encodeURIComponent(target)}`, '', 'DELETE');
      _roleCache.delete(target);
      return ok(res, { message: target + ' removed' });
    }
    if (url === '/admin/team-prefixes' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const role = await getRole(user.username);
      if (!isAdminish(role)) return error(res, 403, 'Admins only');
      const all = await supaGetPrefixes();
      return ok(res, { prefixes: prefixesFor(role, user.username, all) });
    }
    if (url === '/admin/set-prefix' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      if ((await getRole(user.username)) !== 'super') return error(res, 403, 'Super admin only');
      const prefix = String(req.body.prefix || '').trim();
      const adminU = String(req.body.admin || '').trim().toLowerCase();
      if (!prefix || !adminU) return error(res, 400, 'prefix and admin username required');
      if (!/^[A-Za-z0-9_]+$/.test(prefix)) return error(res, 400, 'prefix: letters/numbers/underscore only');
      await supaFetch('team_prefixes', '', 'POST', { prefix, admin_username: adminU, label: req.body.label || '' }, { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
      return ok(res, { message: prefix + ' assigned to ' + adminU });
    }
    if (url === '/admin/del-prefix' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      if ((await getRole(user.username)) !== 'super') return error(res, 403, 'Super admin only');
      const prefix = String(req.body.prefix || '').trim();
      if (!prefix) return error(res, 400, 'prefix required');
      await supaFetch(`team_prefixes?prefix=eq.${encodeURIComponent(prefix)}`, '', 'DELETE');
      return ok(res, { message: prefix + ' removed' });
    }
    if (url === '/admin/my-clients' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const role = await getRole(user.username);
      if (!isAdminish(role)) return error(res, 403, 'Admins only');
      const data = await lamixGet('/clients', { limit: 500 });
      const allClients = (data.records || data.clients || []).map(c => ({ id: c.username, username: c.username, name: c.name || '', panelNum: 1 }));
      const allPrefixes = await supaGetPrefixes();
      const pinsMap = await getPinsMap();
      const myPrefixes = prefixesFor(role, user.username, allPrefixes);
      const mySet = new Set(myPrefixes.map(p => p.prefix));
      const scoped = (role === 'super') ? allClients : allClients.filter(c => mySet.has(resolveTeam(c.username, allPrefixes, pinsMap)));
      const groups = {};
      myPrefixes.forEach(p => { groups[p.prefix] = { prefix: p.prefix, admin: p.admin_username, label: p.label || '', clients: [] }; });
      if (role === 'super') groups[''] = { prefix: '', admin: '—', label: 'System Generated', clients: [] };
      scoped.forEach(c => {
        const team = resolveTeam(c.username, allPrefixes, pinsMap);
        const key = (role === 'super') ? (team || '') : team;
        if (groups[key]) groups[key].clients.push(c);
      });
      const teams = Object.values(groups).map(g => ({ prefix: g.prefix, admin: g.admin, label: g.label, count: g.clients.length, clients: g.clients }));
      return ok(res, { teams, total: scoped.length });
    }
    // ── Client create via LaMix REST API (queued) ───────────
    if (url === '/admin/create-client' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const role = await getRole(user.username);
      if (!isAdminish(role)) return error(res, 403, 'Admins only');
      const suffix = String(req.body.suffix || '').trim();
      let prefix = String(req.body.prefix || '').trim();
      const name = String(req.body.name || '').trim();
      const allPrefixes = await supaGetPrefixes();
      const myPrefixes = prefixesFor(role, user.username, allPrefixes);
      if (!prefix) {
        if (myPrefixes.length === 1) prefix = myPrefixes[0].prefix;
        else return error(res, 400, 'Select a team prefix first.');
      }
      if (role !== 'super' && !myPrefixes.some(p => p.prefix === prefix)) return error(res, 403, 'You can only create IDs under your own team prefix.');
      const username = prefix + suffix;
      if (!/^[A-Za-z0-9_]{6,15}$/.test(username)) return error(res, 400, 'Username must be 6–15 chars.');
      await supaFetch('client_queue', '', 'POST', {
        admin_username: user.username, username, name: name || username, status: 'pending',
      }, { 'Prefer': 'return=minimal' });
      return ok(res, { message: '⛵ Client creation queued for ' + username, username: username, queued: true });
    }
    if (url === '/admin/delete-client' && req.method === 'POST') {
      return error(res, 400, 'Client deletion is not available via the LaMix REST API. Please delete from the panel directly.');
    }
    if (url === '/admin/pin-client' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const role = await getRole(user.username);
      if (!isAdminish(role)) return error(res, 403, 'Admins only');
      const username = String(req.body.username || '').trim();
      const prefix = String(req.body.prefix || '').trim();
      if (!username || !prefix) return error(res, 400, 'username and prefix required');
      const allPrefixes = await supaGetPrefixes();
      if (!allPrefixes.some(p => p.prefix === prefix)) return error(res, 400, 'Unknown team prefix.');
      if (role !== 'super' && !prefixesFor(role, user.username, allPrefixes).some(p => p.prefix === prefix)) return error(res, 403, 'You can only pin users into your own team.');
      await supaFetch('client_team_pins', '', 'POST', { username: username.toLowerCase(), prefix, pinned_by: user.username }, { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
      invalidatePins();
      return ok(res, { message: username + ' pinned to ' + prefix });
    }
    if (url === '/admin/unpin-client' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const role = await getRole(user.username);
      if (!isAdminish(role)) return error(res, 403, 'Admins only');
      const username = String(req.body.username || '').trim().toLowerCase();
      if (!username) return error(res, 400, 'username required');
      await supaFetch(`client_team_pins?username=eq.${encodeURIComponent(username)}`, '', 'DELETE');
      invalidatePins();
      return ok(res, { message: username + ' unpinned' });
    }
  if (url === '/admin/reset-credentials' && req.method === 'POST') {
   const user = getUserFromSession(req.body.session);
   if (!user) return error(res, 401, 'Unauthorized');
   const role = await getRole(user.username);
   if (!isAdminish(role)) return error(res, 403, 'Admins only');
   const username = String(req.body.username || '').trim();
   if (!username) return error(res, 400, 'username required');
   if (String(username).toLowerCase() === SUPER_ADMIN) return error(res, 400, 'Cannot reset the super admin');
   const pat = encodeURIComponent(String(username).toLowerCase());
   const rows = await supaFetch('user_creds', 'username=ilike.' + pat + '&select=username');
   if (!Array.isArray(rows) || !rows.length) return error(res, 404, 'No password row found for ' + username + ' — nothing to wipe.');
   const names = rows.map(r => r.username);
   await supaFetch('user_creds', 'username=in.(' + names.map(n => '"' + String(n) + '"').join(',') + ')', 'DELETE');
   const chk = await supaFetch('user_creds', 'username=ilike.' + pat + '&select=username');
   if (Array.isArray(chk) && chk.length) return error(res, 500, 'Delete failed — row still present: ' + chk.map(c => c.username).join(', '));
   names.forEach(n => _roleCache.delete(String(n).toLowerCase()));
   invalidateNcMap();
   sendNotif(names[0], 'warn', '🔑 Password reset by admin', 'Your password was wiped by ' + user.username + '. Set a new password on next login (Activate screen).', user.username);
   return ok(res, { message: '🔑 Credentials wiped for ' + names.join(', ') + ' — they must activate on next login', reset: true, username: names[0] });
 }

    if (url === '/admin/team-report' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const role = await getRole(user.username);
      if (!isAdminish(role)) return error(res, 403, 'Admins only');
      const bd = businessDayPKT(); const today = bd.label;
      const dayBack = n => new Date(new Date(today + 'T00:00:00Z').getTime() - n * 86400000).toISOString().slice(0, 10);
      const todayRows = await readCDR(bd.from, bd.to, null, 10000);
      const weekRows  = await readCDR(dayBack(6) + ' 00:00:00', today + ' 23:59:59', null, 10000);
      const allPrefixes = await supaGetPrefixes();
      const myPrefixes = prefixesFor(role, user.username, allPrefixes);
      const pinsMap = await getPinsMap();
      const teamOfClient = cli => resolveTeam(cli, allPrefixes, pinsMap);
      const tally = rows => { const m = {}; rows.forEach(r => { const k = teamOfClient(r.client) || '__none__'; m[k] = (m[k] || 0) + 1; }); return m; };
      const tToday = tally(todayRows), tWeek = tally(weekRows);
      const data = await lamixGet('/clients', { limit: 500 });
      const clients = (data.records || data.clients || []).map(c => ({ username: c.username }));
      const cCount = {};
      clients.forEach(c => { const k = teamOfClient(c.username) || '__none__'; cCount[k] = (cCount[k] || 0) + 1; });
      const build = p => ({ prefix: p.prefix, admin: p.admin_username, label: p.label || '', otpToday: tToday[p.prefix] || 0, otpWeek: tWeek[p.prefix] || 0, clients: cCount[p.prefix] || 0 });
      let teams = myPrefixes.map(build);
      if (role === 'super') teams.push({ prefix: '', admin: '—', label: 'System Generated', otpToday: tToday['__none__'] || 0, otpWeek: tWeek['__none__'] || 0, clients: cCount['__none__'] || 0 });
      teams.sort((a, b) => b.otpToday - a.otpToday);
      return ok(res, { teams, hottest: teams[0] && teams[0].otpToday > 0 ? teams[0] : null, date: today });
    }
    if (url === '/admin/target-get' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      if (!isAdminish(await getRole(user.username))) return error(res, 403, 'Admins only');
      const rows = await supaFetch('team_targets', 'order=updated_at.desc&limit=1&select=*');
      return ok(res, { config: (Array.isArray(rows) && rows[0]) || null });
    }
    if (url === '/admin/target-set' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      if ((await getRole(user.username)) !== 'super') return error(res, 403, 'Super admin only');
      const period = (req.body.period === 'weekly') ? 'weekly' : 'daily';
      await supaFetch('team_targets', '', 'POST', {
        period, target_otps: Math.max(1, parseInt(req.body.target_otps) || 1000),
        reward_usd: Math.max(0, parseFloat(req.body.reward_usd) || 0),
        top_n: Math.max(1, parseInt(req.body.top_n) || 5),
        note: String(req.body.note || ''), updated_by: user.username,
      }, { 'Prefer': 'return=minimal' });
      return ok(res, { message: 'Target saved' });
    }
    if (url === '/admin/team-bonus' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const role = await getRole(user.username);
      if (!isAdminish(role)) return error(res, 403, 'Admins only');
      let config = null;
      const crows = await supaFetch('team_targets', 'order=updated_at.desc&limit=1&select=*');
      if (Array.isArray(crows) && crows[0]) config = crows[0];
      if (!config) return ok(res, { role, config: null, leaders: [], myTeams: [] });
      const period = config.period || 'daily';
      const bd = businessDayPKT(); const today = bd.label;
      const dayBack = n => new Date(new Date(today + 'T00:00:00Z').getTime() - n * 86400000).toISOString().slice(0, 10);
      const from = (period === 'weekly') ? dayBack(6) + ' 00:00:00' : bd.from;
   const to   = today + ' 23:59:59';
   const rows = await rpcTotals(period === 'weekly' ? dayBack(6) : today, today);
   const allPrefixes = await supaGetPrefixes();
   const pinsMap = await getPinsMap();
   const teamOfClient = cli => resolveTeam(cli, allPrefixes, pinsMap);
   const otps = {};
   rows.forEach(r => { const t = teamOfClient(r.username); if (t) otps[t] = (otps[t] || 0) + Number(r.sms_count || 0); });
      const target = Number(config.target_otps) || 0, topN = Number(config.top_n) || 5, reward = Number(config.reward_usd) || 0;
      const windowKey = (period === 'weekly') ? weekKey(today) : today;
      let leaders = allPrefixes.map(p => ({ prefix: p.prefix, admin: p.admin_username, label: p.label || '', otps: otps[p.prefix] || 0 })).filter(t => t.otps > 0).sort((a, b) => b.otps - a.otps);
      leaders.forEach((t, i) => { t.rank = i + 1; t.qualified = (target > 0 && t.otps >= target); });
      const myPrefixes = prefixesFor(role, user.username, allPrefixes);
      const myTeams = myPrefixes.map(mp => {
        const o = otps[mp.prefix] || 0;
        return { prefix: mp.prefix, admin: mp.admin_username, label: mp.label || '', otps: o, qualified: target > 0 && o >= target, rank: (leaders.find(t => t.prefix === mp.prefix) || {}).rank || null, reward };
      });
      return ok(res, { role, config: { period, target_otps: target, reward_usd: reward, top_n: topN, note: config.note || '' }, windowKey, leaders: leaders.slice(0, Math.max(topN, 10)), myTeams });
    }
    if (url === '/admin/limit-status' && req.method === 'POST') {
      const caller = getUserFromSession(req.body.session);
      if (!caller) return error(res, 401, 'Unauthorized');
      if (!isAdminish(await getRole(caller.username))) return error(res, 403, 'Admins only');
      const target = String(req.body.username || '').trim();
      if (!target) return error(res, 400, 'Username required');
      const start = encodeURIComponent('gte.' + _todayStartUTC());
      const rows = await supaFetch('alloc_events', `username=${encodeURIComponent('eq.' + target)}&created_at=${start}&select=id,country,range_id,range_title,created_at&order=created_at.asc`);
      if (!Array.isArray(rows)) return ok(res, { username: target, ranges: [], countries: [] });
      const byRange = {}, byCountry = {};
      rows.forEach(x => {
        const rk = x.range_id || x.range_title || 'Unknown';
        if (!byRange[rk]) byRange[rk] = { rangeId: x.range_id || '', rangeTitle: x.range_title || rk, country: x.country || '', count: 0, ids: [] };
        byRange[rk].count++; byRange[rk].ids.push(x.id);
        const ck = x.country || 'Unknown';
        if (!byCountry[ck]) byCountry[ck] = { country: ck, count: 0, ids: [] };
        byCountry[ck].count++; byCountry[ck].ids.push(x.id);
      });
      const ranges = Object.values(byRange).filter(o => o.count >= RANGE_CAP).map(o => ({ rangeId: o.rangeId, rangeTitle: o.rangeTitle, country: o.country, used: o.count, limit: RANGE_CAP, ids: o.ids }));
      const countries = Object.values(byCountry).filter(o => o.count >= COUNTRY_CAP).map(o => ({ country: o.country, used: o.count, limit: COUNTRY_CAP, ids: o.ids }));
      return ok(res, { username: target, ranges, countries });
    }
    if (url === '/admin/free-try' && req.method === 'POST') {
      const caller = getUserFromSession(req.body.session);
      if (!caller) return error(res, 401, 'Unauthorized');
      if (!isAdminish(await getRole(caller.username))) return error(res, 403, 'Admins only');
      const target = String(req.body.username || '').trim();
      const rowId = req.body.rowId;
      if (!target || rowId == null) return error(res, 400, 'username and rowId required');
      const dayStart = _todayStartUTC();
      const granted = await supaFetch('alloc_frees', `target=eq.${encodeURIComponent(target)}&created_at=${encodeURIComponent('gte.' + dayStart)}&select=id`);
      if (Array.isArray(granted) && granted.length >= 3) return error(res, 400, 'Max +3 tries per user per day reached.');
      const deleted = await supaFetch(`alloc_events?id=eq.${encodeURIComponent(String(rowId))}&username=eq.${encodeURIComponent(target)}`, '', 'DELETE', null, { 'Prefer': 'return=representation' });
      if (!Array.isArray(deleted) || !deleted.length) return error(res, 404, 'Row not found.');
      await supaFetch('alloc_frees', '', 'POST', { target, granted_by: caller.username }, { 'Prefer': 'return=minimal' });
      return ok(res, { message: 'Freed 1 try for ' + target, deletedId: rowId });
    }

    // ═══════════════════════════════════════════════════════
    //  13. CLI INSIGHTS  (from sms_cdr, no second panel)
    // ═══════════════════════════════════════════════════════
    if (url === '/notifs/list' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const role = await getRole(user.username);
      const un = user.username.toLowerCase();
      let notifs = [];
      const nRows = await supaFetch('app_notifs', `or=${encodeURIComponent('(target.eq.*,target.eq.' + un + ')')}&order=created_at.desc&limit=30&select=*`);
      if (Array.isArray(nRows)) notifs = nRows;
      let reads = [];
      const rRows = await supaFetch('app_notif_reads', 'select=username,notif_id');
      if (Array.isArray(rRows)) reads = rRows;
      const byNotif = {}; const mine = new Set();
      reads.forEach(x => { (byNotif[x.notif_id] = byNotif[x.notif_id] || []).push(x.username); if (x.username === un) mine.add(x.notif_id); });
      const list = notifs.map(n => ({ id: n.id, type: n.type || 'info', title: n.title || '', body: n.body || '', at: n.created_at, by: n.created_by || '', read: mine.has(n.id), readBy: byNotif[n.id] || [] }));
      const lk = await supaFetch('notif_likes','select=notif_id,username&limit=10000');
const likeCount={}, myLike=new Set();
(Array.isArray(lk)?lk:[]).forEach(x=>{ likeCount[x.notif_id]=(likeCount[x.notif_id]||0)+1; if(String(x.username).toLowerCase()===String(user.username).toLowerCase()) myLike.add(x.notif_id); });
list.forEach(nn=>{ nn.likeCount=likeCount[nn.id]||0; nn.myLike=myLike.has(nn.id); });
const cc = await supaFetch('notif_comments','select=notif_id&limit=10000');
const cCount={}; (Array.isArray(cc)?cc:[]).forEach(x=>{ cCount[x.notif_id]=(cCount[x.notif_id]||0)+1; });
list.forEach(nn=>{ nn.commentCount=cCount[nn.id]||0; });
const cfR = await supaFetch('notif_comment_cfg','select=notif_id,comments_on&limit=10000');
const cfgMap={}; (Array.isArray(cfR)?cfR:[]).forEach(x=>{cfgMap[x.notif_id]=!!x.comments_on;});
list.forEach(nn=>{ nn.commentsOn=!!cfgMap[nn.id]; nn.isSystem=(String(nn.created_by||'')==='system'||String(nn.kind||'')==='system'); });
return ok(res, { role, notifs: list, unread: list.filter(n => !n.read).length });
    }
    if (url === '/notifs/mark-read' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      const un = user.username.toLowerCase();
      const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
      for (const id of ids.slice(0, 50)) {
        await supaFetch('app_notif_reads', '', 'POST', { username: un, notif_id: id }, { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
      }
      return ok(res);
    }

if (url === '/scc/status' && req.method === 'POST') {
const user = getUserFromSession(req.body.session);
if (!user) return error(res, 401, 'Unauthorized');
if (!isAdminish(await getRole(user.username))) return error(res, 403, 'Admins only');
try {
if (_sccCache.payload && (Date.now() - _sccCache.ts) < 10000) return ok(res, _sccCache.payload);
const now = Date.now();
const enc = encodeURIComponent;
const bd = businessDayPKT();
const yLbl = new Date(new Date(bd.label + 'T00:00:00Z').getTime() - 86400000).toISOString().slice(0, 10);
const oneHourAgo = new Date(now - 3600000).toISOString();
const fiveMinAgo = new Date(now - 300000).toISOString();

const [incidents, qPend, qDone, hbRows, cdrState, pingHour, cdrHour, todayRows, yestRows, mirror] = await Promise.all([
  supaFetch('system_incidents', 'status=eq.pending&order=created_at.desc&limit=20'),
  supaFetch('alloc_queue', 'status=eq.pending&select=id,created_at,qty,username&limit=500'),
  supaFetch('alloc_queue', 'status=eq.done&processed_at=gte.' + enc(bd.from) + '&select=created_at,processed_at&limit=300'),
  supaFetch('boat_state', 'select=id,hb&limit=12'),
  supaFetch('cdr_state', 'id=eq.1&select=last_time'),
  supaFetch('api_ping_log', 'created_at=gte.' + enc(oneHourAgo) + '&select=created_at,username&limit=3000'),
  supaFetch('sms_cdr', 'time=gte.' + enc(oneHourAgo) + '&select=time&limit=3000'),
  supaFetch('sms_cdr', 'time=gte.' + enc(bd.from) + '&time=lte.' + enc(bd.to) + '&select=time&limit=100000'),
  supaFetch('sms_cdr', 'time=gte.' + enc(yLbl + ' 00:00:00') + '&time=lte.' + enc(yLbl + ' 23:59:59') + '&select=time&limit=100000'),
  supaFetch('ranges_mirror', 'select=numbers,unassigned&limit=1000')
]);

// ── API LOAD (real: api_ping_log) ──
const pingArr = Array.isArray(pingHour) ? pingHour : [];
const apiLastHour = pingArr.length;
const apiPerMin = Math.round(apiLastHour / 60);
function buckets12(rows, get) {
  const out = new Array(12).fill(0), step = 3600000 / 12;
  rows.forEach(r => { const i = 11 - Math.floor((now - new Date(get(r)).getTime()) / step); if (i >= 0 && i < 12) out[i]++; });
  return out;
}
const loadBuckets = buckets12(pingArr, r => r.created_at);
const tenMinAgo = new Date(now - 600000).toISOString();
const activeSet = new Set(pingArr.filter(p => p.created_at >= tenMinAgo).map(p => p.username));
(Array.isArray(qPend) ? qPend : []).forEach(q => { if (q.created_at >= tenMinAgo && q.username) activeSet.add(q.username); });
const onlineUsers = activeSet.size;

// ── CDR RATE (real: sms_cdr last hour) ──
const cdrArr = Array.isArray(cdrHour) ? cdrHour : [];
const cdrPerMin = Math.round((cdrArr.length / 60) * 10) / 10;
const cdrBuckets = buckets12(cdrArr, r => r.time);const hb9 = (Array.isArray(hbRows) ? hbRows.find(b => b.id === 9) : null);
const hb9Fresh = !!(hb9 && hb9.hb && (now - new Date(hb9.hb).getTime()) < 300000);
const cdrLastT = (Array.isArray(cdrState) && cdrState[0] && cdrState[0].last_time) ? new Date(cdrState[0].last_time).getTime() : 0;
const hbT = Math.max(hb9 && hb9.hb ? new Date(hb9.hb).getTime() : 0, cdrLastT);
const dataFresh = !!(cdrLastT && (now - cdrLastT) < 300000);
const cdrStatus = dataFresh ? 'live' : (hb9Fresh ? 'sleep' : 'dead'); // 🌙 SLEEP = boat polling, no OTPs yet
const cdrAlive = cdrStatus !== 'dead';
const cdrLagMin = hbT ? Math.round((now - hbT) / 60000) : null;
if (cdrStatus === 'dead') sccReport('boat_failure', 'critical', 'CDR stream dead', 'No CDR heartbeat for ' + (cdrLagMin || '?') + 'm. OTP sync stalled.', { stale_ms: now - hbT });
// 👥 distinct active users per 5-min bucket (load chart)
const bucketSets = Array.from({ length: 12 }, () => new Set());
pingArr.forEach(p => { const i = 11 - Math.floor((now - new Date(p.created_at).getTime()) / 300000); if (i >= 0 && i < 12) bucketSets[i].add(p.username); });
const userBuckets = bucketSets.map(s => s.size);
// 👤 who is online now (last 10 min, most recent first)
const lastSeen = {};
pingArr.forEach(p => { const t = new Date(p.created_at).getTime(); if (p.created_at >= tenMinAgo && (!lastSeen[p.username] || t > lastSeen[p.username])) lastSeen[p.username] = t; });
const activeList = Object.keys(lastSeen).map(u => ({ u: u, ago: Math.max(0, Math.round((now - lastSeen[u]) / 60000)) })).sort((a, b) => a.ago - b.ago).slice(0, 6);

// ── QUEUE (real) ──
const qArr = Array.isArray(qPend) ? qPend : [];
const queueSize = qArr.length;
const oldestMin = qArr.length ? Math.round((now - Math.min(...qArr.map(q => new Date(q.created_at).getTime()))) / 60000) : 0;
const etaMins = queueSize ? Math.max(1, Math.ceil(queueSize / 30)) : 0;
let dSum = 0, dN = 0;
(Array.isArray(qDone) ? qDone : []).forEach(r => { if (r.created_at && r.processed_at) { const m = (new Date(r.processed_at) - new Date(r.created_at)) / 60000; if (m >= 0 && m < 600) { dSum += m; dN++; } } });
const avgDoneMin = dN ? Math.round((dSum / dN) * 10) / 10 : 0;

// ── BOATS / CRON HEALTH (real heartbeats) ──
const BOATS = [{ id: 9, name: 'CDR' }, { id: 1, name: 'Alloc' }, { id: 2, name: 'Numbers' }, { id: 3, name: 'Backfill' }, { id: 4, name: 'Clients' }, { id: 5, name: 'Cleanup' }, { id: 6, name: 'Sync' }];
const hbById = {}; (Array.isArray(hbRows) ? hbRows : []).forEach(b => { hbById[b.id] = b.hb ? new Date(b.hb).getTime() : 0; });
const boatList = BOATS.map(b => { const t = hbById[b.id] || 0; const ago = t ? Math.round((now - t) / 60000) : null; return { id: b.id, name: b.name, agoMin: ago, ok: ago != null && ago <= 5 }; });
const activeBoats = boatList.filter(b => b.ok).length;

// ── DAILY COMPARISON + NUMBER POOL (real) ──
const todayOtp = Array.isArray(todayRows) ? todayRows.length : 0;
const yestOtp = Array.isArray(yestRows) ? yestRows.length : 0;
const growthPct = yestOtp ? Math.round(((todayOtp - yestOtp) / yestOtp) * 100) : (todayOtp ? 100 : 0);
let mTotal = 0, mFree = 0;
(Array.isArray(mirror) ? mirror : []).forEach(r => { mTotal += (r.numbers || 0); mFree += (r.unassigned || 0); });
const utilPct = mTotal ? Math.round(((mTotal - mFree) / mTotal) * 100) : 0;

// ── ALERTS ──
const alerts = [];
if (queueSize > 100) alerts.push({ severity: 'critical', message: 'Queue overload: ' + queueSize + ' batches' });
if (!cdrAlive) alerts.push({ severity: 'critical', message: 'CDR stream offline (' + cdrLagMin + 'm lag)' });
if (activeBoats < 5) alerts.push({ severity: 'warning', message: activeBoats + '/7 boats alive' });
if (apiPerMin > 100) alerts.push({ severity: 'warning', message: apiPerMin + ' API calls/min' });


  let score = 100;
if (cdrStatus === 'dead') score -= 40; else if (cdrStatus === 'sleep') score -= 5;
score -= (BOATS.length - activeBoats) * 8;
if (queueSize > 100) score -= 20; else if (queueSize > 50) score -= 10; else if (queueSize > 15) score -= 5;
score = Math.max(0, Math.min(100, score));
  
const payload = {
  timestamp: new Date().toISOString(),
  system: { status: alerts.some(a => a.severity === 'critical') ? 'critical' : alerts.length ? 'warning' : 'healthy', score: score, cdr: cdrStatus },
  queue: { size: queueSize, oldestMin: oldestMin, etaMins: etaMins, avgDoneMin: avgDoneMin },
  cdr: { alive: cdrAlive, status: cdrStatus, lagMin: cdrLagMin, perMin: cdrPerMin, buckets: cdrBuckets }, 
  boats: { list: boatList, active: activeBoats, total: BOATS.length },
  users: { online: onlineUsers, expected: Math.max(onlineUsers, Math.floor(onlineUsers * 1.2)), list: activeList },
  load: { perMin: apiPerMin, lastHour: apiLastHour, buckets: loadBuckets, users: userBuckets }, 
  daily: { today: todayOtp, yesterday: yestOtp, growthPct: growthPct },
  numbers: { total: mTotal, free: mFree, assigned: mTotal - mFree, utilPct: utilPct },
  alerts: alerts,
  incidents: Array.isArray(incidents) ? incidents : []
};
_sccCache = { ts: Date.now(), payload: payload };
return ok(res, payload);
} catch (e) {
console.error('[SCC Status Error]', e);
return error(res, 500, 'SCC status failed: ' + e.message);
}
}
    
if (url === '/scc/broadcast' && req.method === 'POST') {
  const user = getUserFromSession(req.body.session);
  if (!user) return error(res, 401, 'Unauthorized');
  if (!isAdminish(await getRole(user.username))) return error(res, 403, 'Admins only');
  const id = String(req.body.id || '');
  await supaFetch('app_notifs', '', 'POST', { target: '*', type: 'system_alert', title: '⚙️ ' + String(req.body.title || 'System notice'), body: String(req.body.message || ''), created_by: user.username }, { 'Prefer': 'return=minimal' });
  if (id) await supaFetch('system_incidents', 'id=eq.' + encodeURIComponent(id), 'PATCH', { status: 'broadcasted' }, { 'Prefer': 'return=minimal' });
  return ok(res, { pushed: true });
}
    
if (url === '/scc/dismiss-all' && req.method === 'POST') {
  const user = getUserFromSession(req.body.session);
  if (!user) return error(res, 401, 'Unauthorized');
  if (!isAdminish(await getRole(user.username))) return error(res, 403, 'Admins only');
  const tp = String(req.body.type || '');
  await supaFetch('system_incidents', 'status=eq.pending' + (tp ? '&type=eq.' + encodeURIComponent(tp) : ''), 'PATCH', { status: 'dismissed' });
  return ok(res, { dismissed: true });
}

// ══════════════════════════════════════════════════════════
//   API PING — Log every API call for processing metrics
// ═══════════════════════════════════════════════════════════
if (url === '/ping' && req.method === 'POST') {
  const user = getUserFromSession(req.body.session);
  if (!user) return ok(res, { ok: true });
  
  // Fire-and-forget log (don't block response)
  supaFetch('api_ping_log', '', 'POST', {
    username: user.username,
    endpoint: req.body.endpoint || 'ping',
    created_at: new Date().toISOString()
  }, { 'Prefer': 'return=minimal' }).catch(() => {});
  
  return ok(res, { ok: true });
}
    

// ═══════════════════════════════════════════════════════════
//   🔔 Notify Send
// ═══════════════════════════════════════════════════════════
    
    if (url === '/notifs/send' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      if ((await getRole(user.username)) !== 'super') return error(res, 403, 'Super admin only');
      const bodyText = String(req.body.body || '').trim();
      if (!bodyText) return error(res, 400, 'Message required');
      await supaFetch('app_notifs', '', 'POST', { type: req.body.type || 'info', title: req.body.title || '', body: bodyText, target: String(req.body.target || '*').toLowerCase(), created_by: user.username }, { 'Prefer': 'return=representation' });
      return ok(res, { pushed: true });
    }
    if (url === '/notifs/delete' && req.method === 'POST') {
      const user = getUserFromSession(req.body.session);
      if (!user) return error(res, 401, 'Unauthorized');
      if ((await getRole(user.username)) !== 'super') return error(res, 403, 'Super admin only');
      const id = parseInt(req.body.id);
      if (!id || isNaN(id)) return error(res, 400, 'Valid id required');
      await supaFetch(`app_notif_reads?notif_id=eq.${id}`, '', 'DELETE');
      await supaFetch(`app_notifs?id=eq.${id}`, '', 'DELETE');
      return ok(res, { deleted: true });
    }

    if (url === '/alloc/queue-list' && req.method === 'POST') {
  const user = getUserFromSession(req.body.session);
  if (!user) return error(res, 401, 'Unauthorized');
  const role = await getRole(user.username);
  let q = 'order=created_at.desc&limit=100&select=id,username,client,range_name,qty,status,result,created_at,processed_at';
  if (!isAdminish(role)) q += '&username=eq.' + encodeURIComponent(user.username);   // users see ONLY own ships
  const rows = await supaFetch('alloc_queue', q);
  const items = Array.isArray(rows) ? rows : [];
items.forEach(r => { if (r.client && r.username && String(r.client).toLowerCase() !== String(r.username).toLowerCase()) r.username = r.client; });
return ok(res, { items, admin: isAdminish(role) });  // admins see ALL
}

    // ═══════════════════════════════════════════════════════════
//  📊 QUEUE STATUS & ETA ENGINE (For Frontend Animation)
// ═══════════════════════════════════════════════════════════
    
if (url === '/alloc/queue-status' && req.method === 'POST') {
  const user = getUserFromSession(req.body.session);
  if (!user) return error(res, 401, 'Unauthorized');
  logActivity(user.username, 'queue');

  // ⚡ FAST PATH: nothing pending → instant answer, zero heavy math
  const quick = await supaFetch('alloc_queue', 'status=eq.pending&select=id&limit=1');
  if (!Array.isArray(quick) || !quick.length) {
    return ok(res, { totalBatches: 0, myPosition: 0, myEtaMins: 0, globalEtaMins: 0 });
  }

  // Fetch the same fields BOAT 4 uses for grouping
  const pending = await supaFetch('alloc_queue', 'status=eq.pending&order=created_at.asc&select=id,username,client,range_id,payout_rate,created_at,qty');
  if (!Array.isArray(pending)) return ok(res, { totalBatches: 0, myPosition: 0, myEtaMins: 0, globalEtaMins: 0 });

  // 🧮 MIRROR BOAT 4: rows merge into groups (client|range|payout).
  // 1 group = 1 boat stop. With the new 1.05s delay, boat clears ~30-36 groups/min.
  const GROUPS_PER_MIN = 30;
  const groups = {};
  pending.forEach(q => {
    const key = (q.client || '') + '|' + (q.range_id || '') + '|' + (q.payout_rate || '');
    if (!groups[key]) groups[key] = { qty: 0, firstAt: q.created_at };
    groups[key].qty += (q.qty || 0);
  });
  const groupList = Object.values(groups);

  const myOldest = pending.find(p => p.username === user.username);
  const myGroups = myOldest
    ? groupList.filter(g => new Date(g.firstAt) <= new Date(myOldest.created_at)).length
    : 0;

  const totalBatches  = groupList.length;
  const myPosition    = myGroups;
  const globalEtaMins = Math.ceil(totalBatches / GROUPS_PER_MIN);
  const myEtaMins     = myOldest ? Math.max(1, Math.ceil(myGroups / GROUPS_PER_MIN)) : 0;
  return ok(res, { totalBatches, myPosition, globalEtaMins, myEtaMins });
}

if (url === '/alloc/status' && req.method === 'POST') {
  const user = getUserFromSession(req.body.session);
  if (!user) return error(res, 401, 'Unauthorized');
  
  const role = await getRole(user.username);
  const isAdmin = isAdminish(role);
  
  let query = `order=id.desc&limit=5&select=id,range_name,qty,status,created_at,processed_at,result,username,client`;
  
  if (!isAdmin) {
    query = `username=eq.${encodeURIComponent(user.username)}&` + query;
  }
  
  const rows = await supaFetch('alloc_queue', query);
  
  const items = (Array.isArray(rows) ? rows : []).map(item => {
    const result = {
      id: item.id,
      range_name: item.range_name,
      qty: item.qty,
      status: item.status,
      created_at: item.created_at,
      processed_at: item.processed_at
    };
    
    if (isAdmin) {
      result.details = item.result;
      result.username = item.username;
      result.client = item.client;
    }
    
    return result;
  });
  
  return ok(res, { items: items, isAdmin: isAdmin, total: items.length });
}

      // ═════════ 🧪 MOCK OTP LAB — TEMPORARY: delete this whole block after testing ═════════
if (url === '/mock/otp' && req.method === 'POST') {
  const user = getUserFromSession(req.body.session);
  const isBoat = req.headers.authorization === `Bearer ${BOAT_SECRET}`;
  if (!isBoat && (!user || (await getRole(user.username)) !== 'super')) return error(res, 403, 'Super admin only');
  const n = Math.min(500, Math.max(1, parseInt(req.body.count) || 1));   // server cap per call
  const clientName = (user && (user.clientName || user.username)) || String(req.body.client || 'Mock_Hunter');
  const ncMap = await getNumberClientMap();
  const myNums = []; ncMap.forEach((cli, num) => { if (String(cli).toLowerCase() === String(clientName).toLowerCase()) myNums.push(num); });
  const CLIS = ['Google', 'WhatsApp', 'Facebook', 'TikTok', 'Uber', 'Bank Alfalah'];
  const now = Date.now(); const payload = [];
  for (let i = 0; i < n; i++) {
    const t = new Date(now - Math.floor(Math.random() * 15000));
    payload.push({
      time: t.toISOString().slice(0, 19).replace('T', ' '),
      number: myNums.length ? myNums[Math.floor(Math.random() * myNums.length)] : ('92300' + String(1000000 + Math.floor(Math.random() * 8999999))),
      cli: CLIS[i % CLIS.length], client: clientName,
      content: 'Your verification code is ' + String(100000 + Math.floor(Math.random() * 899999)),
      range: req.body.range || 'Mock Test Range LX', status: 'cleared',
    });
  }
  await supaFetch('sms_cdr', 'on_conflict=time,number,cli', 'POST', payload, { 'Prefer': 'resolution=ignore-duplicates,return=minimal' });
  fetch('http://127.0.0.1:8787/api/internal/push', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-boat-secret': BOAT_SECRET }, body: '{}' }).catch(() => {});
  return ok(res, { inserted: n, client: clientName });
}
// ═════════ 🧪 END MOCK OTP LAB ═════════

    // ═══════════════════════════════════════════════════════
    //  404
    // ═══════════════════════════════════════════════════════
    // ═══ BULK ALLOCATION + RANGE CRUSHER (admin) ═══
if (url === '/admin/bulk-queue' && req.method === 'POST') {
const user = getUserFromSession(req.body.session);
if (!user) return error(res, 401, 'Unauthorized');
if (!isAdminish(await getRole(user.username))) return error(res, 403, 'Admins only');
const rangeIds = Array.isArray(req.body.rangeIds) ? req.body.rangeIds.map(String) : [];
const users = Array.isArray(req.body.users) ? req.body.users.map(String) : [];
const perUser = Math.max(1, Math.min(1000, parseInt(req.body.perRange, 10) || 1000));
const payout = parseFloat(req.body.payout) || 0.01;
if (!rangeIds.length || !users.length) return error(res, 400, 'Select at least one range and one user');
const mir = await supaFetch('ranges_mirror', 'select=range_id,name,unassigned&limit=1000');
const mm = new Map((Array.isArray(mir) ? mir : []).map(r => [String(r.range_id), r]));
const queuePayload = [];
for (const rid of rangeIds) {
const r = mm.get(rid); if (!r) continue;
let free = r.unassigned || 0;
for (const u of users) {
if (free <= 0) break;
const qty = Math.min(perUser, free, 1000);
queuePayload.push({ username: user.username, client: u, range_id: rid, range_name: r.name || '', qty: qty, payout_rate: payout, status: 'pending', created_at: new Date().toISOString() });
free -= qty;
}
}
if (!queuePayload.length) return error(res, 400, 'No available numbers in selected ranges');
await supaFetch('alloc_queue', '', 'POST', queuePayload, { 'Prefer': 'return=minimal' });
try { pushEv('numbers'); } catch(e){}
return ok(res, { queued: queuePayload.length, plan: queuePayload.map(p => p.client + '×' + p.qty + ' ' + p.range_name).join(', '), message: queuePayload.length + ' batches added to the Shipping Dock' });
}
if (url === '/admin/bulk-ranges' && req.method === 'POST') {
const user = getUserFromSession(req.body.session);
if (!user) return error(res, 401, 'Unauthorized');
if (!isAdminish(await getRole(user.username))) return error(res, 403, 'Admins only');
const mir = await supaFetch('ranges_mirror', 'select=range_id,name,numbers,unassigned&limit=1000');
const ranges = (Array.isArray(mir) ? mir : []).filter(r => (r.unassigned || 0) > 0).map(r => ({ range_id: String(r.range_id), name: r.name || '', unassigned: r.unassigned || 0, numbers: r.numbers || 0 }));
return ok(res, { ranges });
}
if (url === '/admin/crush-options' && req.method === 'POST') {
const user = getUserFromSession(req.body.session);
if (!user) return error(res, 401, 'Unauthorized');
if (!isAdminish(await getRole(user.username))) return error(res, 403, 'Admins only');
const mir = await supaFetch('ranges_mirror', 'select=range_id,name,numbers,unassigned&limit=1000');
const liveArr = Array.isArray(mir) ? mir : [];
const un = await supaFetch('user_numbers', 'select=number,range_id,range_name&limit=1000000');
const cnt = {};
(Array.isArray(un) ? un : []).forEach(r => { const k = String(r.range_id || '') || String(r.range_name || ''); cnt[k] = (cnt[k] || 0) + 1; });
const mnums = await supaFetch('lamix_numbers_mirror', 'select=number&limit=1000000');
const mset = new Set((Array.isArray(mnums) ? mnums : []).map(m => String(m.number)));
const orph = {};
(Array.isArray(un) ? un : []).forEach(r => { if (!mset.has(String(r.number))) { const k = r.range_name || ('Range ' + String(r.range_id || '').slice(0, 8)); orph[k] = (orph[k] || 0) + 1; } });
const options = liveArr.map(r => ({ range_name: r.name || ('Range ' + String(r.range_id).slice(0, 8)), range_id: String(r.range_id), count: cnt[String(r.range_id)] || cnt[r.name] || 0, gone: false, live: true })).sort((a, b) => b.count - a.count);
const suggestions = Object.keys(orph).map((k, i) => ({ id: -(i + 1), range_name: k, rows_alive: orph[k], status: 'suggested', source: 'orphan' }));
return ok(res, { options, suggestions });
}



if (url === '/admin/range-crush' && req.method === 'POST') {
const user = getUserFromSession(req.body.session);
if (!user) return error(res, 401, 'Unauthorized');
if (!isAdminish(await getRole(user.username))) return error(res, 403, 'Admins only');
const name = String(req.body.rangeName || '').trim();
if (!name) return error(res, 400, 'rangeName required');
const hard = !!req.body.hard;
try {
const n = await supaCount('user_numbers', 'range_name=eq.' + encodeURIComponent(name) + '&status=eq.released');
await supaFetch('user_numbers', 'range_name=eq.' + encodeURIComponent(name) + (isLive ? '&status=eq.released' : ''), 'DELETE');

if (req.body.rangeId) await supaFetch('ranges_mirror', 'range_id=eq.' + encodeURIComponent(String(req.body.rangeId)), 'DELETE');
invalidateNcMap();
try { await supaFetch('crush_queue', '', 'POST', { range_id: String(req.body.rangeId || ''), range_name: name, rows_alive: n, status: 'crushed', source: 'manual', crushed_by: user.username, crushed_at: new Date().toISOString() }); } catch (e) {}
try { await sendNotif('*', 'warn', 'Range Crushed: ' + name, 'The range "' + name + '" has been crushed by an admin. All ' + n + ' numbers were returned to the system. If you need numbers from this range again, please ask your admin.', user.username); } catch (e) {}
try { pushEv('crush', { range: name, count: n, by: user.username }); pushEv('numbers'); } catch (e) {}
return ok(res, { crushed: n, mode: hard ? 'deleted' : 'released' });
} catch (e) {
console.error('[crush]', e.message);
return error(res, 500, 'Crush failed: ' + e.message);
}
}
if (url === '/admin/crush-dismiss' && req.method === 'POST') {
const user = getUserFromSession(req.body.session);
if (!user) return error(res, 401, 'Unauthorized');
if (!isAdminish(await getRole(user.username))) return error(res, 403, 'Admins only');
const id = parseInt(req.body.id, 10); if (!id) return error(res, 400, 'id required');
await supaFetch('crush_queue', 'id=eq.' + id, 'PATCH', { status: 'dismissed' });
return ok(res, { dismissed: true });
}
// ═══ BULK QUEUE + RANGE CRUSHER (admin) ═══

if (url === '/admin/bulk-ranges' && req.method === 'POST') {
const user = getUserFromSession(req.body.session);
if (!user) return error(res, 401, 'Unauthorized');
if (!isAdminish(await getRole(user.username))) return error(res, 403, 'Admins only');
const mir = await supaFetch('ranges_mirror', 'select=range_id,name,numbers,unassigned&limit=1000');
const ranges = (Array.isArray(mir) ? mir : []).filter(r => (r.unassigned || 0) > 0).map(r => ({ range_id: String(r.range_id), name: r.name || '', unassigned: r.unassigned || 0, numbers: r.numbers || 0 }));
return ok(res, { ranges });
}
if (url === '/admin/crush-options' && req.method === 'POST') {
const user = getUserFromSession(req.body.session);
if (!user) return error(res, 401, 'Unauthorized');
if (!isAdminish(await getRole(user.username))) return error(res, 403, 'Admins only');
const mir = await supaFetch('ranges_mirror', 'select=range_id,name,numbers,unassigned&limit=1000');
const liveArr = Array.isArray(mir) ? mir : [];
const un = await supaFetch('user_numbers', 'select=number,range_id,range_name&limit=1000000');
const cnt = {};
(Array.isArray(un) ? un : []).forEach(r => { const k = String(r.range_id || '') || String(r.range_name || ''); cnt[k] = (cnt[k] || 0) + 1; });
const mnums = await supaFetch('lamix_numbers_mirror', 'select=number&limit=1000000');
const mset = new Set((Array.isArray(mnums) ? mnums : []).map(m => String(m.number)));
const orph = {};
(Array.isArray(un) ? un : []).forEach(r => { if (!mset.has(String(r.number))) { const k = r.range_name || ('Range ' + String(r.range_id || '').slice(0, 8)); orph[k] = (orph[k] || 0) + 1; } });
const options = liveArr.map(r => ({ range_name: r.name || ('Range ' + String(r.range_id).slice(0, 8)), range_id: String(r.range_id), count: cnt[String(r.range_id)] || cnt[r.name] || 0, gone: false, live: true })).sort((a, b) => b.count - a.count);
const suggestions = Object.keys(orph).map((k, i) => ({ id: -(i + 1), range_name: k, rows_alive: orph[k], status: 'suggested', source: 'orphan' }));
return ok(res, { options, suggestions });
}
if (url === '/admin/range-crush' && req.method === 'POST') {
const user = getUserFromSession(req.body.session);
if (!user) return error(res, 401, 'Unauthorized');
if (!isAdminish(await getRole(user.username))) return error(res, 403, 'Admins only');
const name = String(req.body.rangeName || '').trim();
if (!name) return error(res, 400, 'rangeName required');
try {
const n = await supaCount('user_numbers', 'range_name=eq.' + encodeURIComponent(name) + '&status=eq.released');
await supaFetch('user_numbers', 'range_name=eq.' + encodeURIComponent(name) + (isLive ? '&status=eq.released' : ''), 'DELETE');
if (req.body.rangeId) await supaFetch('ranges_mirror', 'range_id=eq.' + encodeURIComponent(String(req.body.rangeId)), 'DELETE');
invalidateNcMap();
try { await supaFetch('crush_queue', '', 'POST', { range_id: String(req.body.rangeId || ''), range_name: name, rows_alive: n, status: 'crushed', source: 'manual', crushed_by: user.username, crushed_at: new Date().toISOString() }); } catch(e){}
try { await sendNotif('*', 'warn', 'Range Crushed: ' + name, 'The range "' + name + '" has been crushed by an admin. ' + n + ' local DB rows were truncated. If numbers still exist in LaMix, the system sync will re-add them automatically.', user.username); } catch(e){}
try { pushEv('crush', { range: name, count: n, by: user.username }); pushEv('numbers'); } catch(e){}
try { await supaFetch('number_usage', 'range_name=eq.' + encodeURIComponent(name), 'DELETE'); } catch(e) { console.error('[crush-mem]', e.message); }
return ok(res, { crushed: n, mode: 'truncated_db_only' });
} catch (e) { console.error('[crush]', e.message); return error(res, 500, 'Crush failed: ' + e.message); }
}
if (url === '/admin/crush-dismiss' && req.method === 'POST') {
const user = getUserFromSession(req.body.session);
if (!user) return error(res, 401, 'Unauthorized');
if (!isAdminish(await getRole(user.username))) return error(res, 403, 'Admins only');
const id = parseInt(req.body.id, 10); if (!id) return error(res, 400, 'id required');
await supaFetch('crush_queue', 'id=eq.' + id, 'PATCH', { status: 'dismissed' });
return ok(res, { dismissed: true });
}

// ═══ NUMBER MEMORY (Permanent Used/Copied tracking) ═══
if (url === '/numbers/mark-used' && req.method === 'POST') {
const user = getUserFromSession(req.body.session);
if (!user) return error(res, 401, 'Unauthorized');
const number = String(req.body.number || '').replace(/[^0-9+]/g, '');
if (!number) return error(res, 400, 'number required');
const client = String(user.username || '').trim();
let rid = String(req.body.rangeId || ''), rname = String(req.body.rangeTitle || '');
if (!rname) {
const nr = await supaFetch('user_numbers', 'number=eq.' + encodeURIComponent(number) + '&client=eq.' + encodeURIComponent(client) + '&select=range_id,range_name&limit=1');
if (Array.isArray(nr) && nr[0]) { rid = nr[0].range_id || rid; rname = nr[0].range_name || rname; }
}
const ins = await supaFetch('number_usage', '', 'POST', { number, client, range_id: rid, range_name: rname, used_by: user.username, source: 'copy', used_at: new Date().toISOString() }, { 'Prefer': 'resolution=ignore-duplicates,return=minimal' });
if (ins && ins.code) { console.error('[mem-write]', ins.code, ins.message); return error(res, 500, 'memory write failed: ' + ins.code); }
return ok(res, { marked: true });
}
if (url === '/numbers/used-list' && req.method === 'POST') {
const user = getUserFromSession(req.body.session);
if (!user) return error(res, 401, 'Unauthorized');
const client = String(user.username || '').trim();
let q = 'client=eq.' + encodeURIComponent(client) + '&select=number&limit=20000';
const rows = await supaFetch('number_usage', q);
return ok(res, { used: (Array.isArray(rows) ? rows : []).map(r => r.number) });
}
return error(res, 404, 'Route not found');

  } catch (err) {
    console.error('API Error:', err.message);
    return error(res, 500, 'Internal Server Error');
  }
};

module.exports._internals = { rpcTotals, sumMine, isMine, businessDayPKT, supaFetch, getNumberClientMap };

const _hpacers = {};
function _hpace(ep){ const p=_hpacers[ep]||(_hpacers[ep]={last:0,stamps:[]}); return (async()=>{ while(true){ const now=Date.now(); while(p.stamps.length&&now-p.stamps[0]>60000)p.stamps.shift(); if(now-p.last>=1600&&p.stamps.length<37)break; await new Promise(r=>setTimeout(r,80)); } p.last=Date.now(); p.stamps.push(p.last); })(); }
