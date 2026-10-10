
// === GHOST PURGE v2 (4s sweeper) ===
async function zghostPurge(){
  return; // CAPTAIN: ghost user_numbers delete disabled
  try {
    const PGR = process.env.SUPABASE_URL || 'http://127.0.0.1:3001';
    await fetch(PGR + "/ranges_mirror?or=(name.is.null,name.eq.)", { method: 'DELETE' });
    const mir = await fetch(PGR + "/ranges_mirror?select=range_id&limit=2000").then(r => r.json());
    const ids = (Array.isArray(mir) ? mir : []).map(m => m.range_id).filter(Boolean);
    // CAPTAIN: user_numbers delete disabled
    // CAPTAIN: user_numbers delete disabled
  } catch (e2) { console.error('[ghost-purge]', e2.message); }
}
async function zghostLoop(){ while (true) { await zghostPurge(); try { await fetch('http://127.0.0.1:8787/api/boats/cleanup', { method: 'POST', headers: { 'Authorization': 'Bearer ' + (process.env.BOAT_SECRET || ''), 'Content-Type': 'application/json' }, body: '{}' }); } catch (e3) {} await new Promise(r => setTimeout(r, 4000)); } }
// ==================================
const axios = require('axios');
require("dotenv").config({ path: "/opt/zamil/server/.env" });
const fs = require('fs');
const LAMIX = process.env.LAMIX_REST || 'https://panel.lamix.org/api/v1';
const KEY = process.env.LAMIX_API_KEY || '';
const PGR = 'http://127.0.0.1:3001';
const LIVE = process.env.ENGINE_LAMIX_LIVE === '1';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmt = ms => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
const pacers = {};
function pace(ep) {
  const p = pacers[ep] || (pacers[ep] = { last: 0, stamps: [] });
  return (async () => {
    while (true) {
      const now = Date.now();
      while (p.stamps.length && now - p.stamps[0] > 60000) p.stamps.shift();
      if (now - p.last >= 1578 && p.stamps.length < 37) break;
      await sleep(80);
    }
    p.last = Date.now(); p.stamps.push(p.last);
  })();
}

async function lx(ep, params, body) {
  await pace(ep);
  const url = LAMIX + ep + (params ? '?' + new URLSearchParams(params) : '');
  try {
    let res;
    if (body) {
      res = await axios.post(url, body, {
        headers: { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' },
        timeout: 20000, validateStatus: () => true
      });
    } else {
      res = await axios.get(url, {
        headers: { 'Authorization': 'Bearer ' + KEY },
        timeout: 15000, validateStatus: () => true
      });
    }
    if (res.status === 429) {
      const ra = parseInt(res.headers['retry-after'] || '5', 10);
      console.log('[429]', ep, ra + 's');
      await sleep(ra * 1000);
      res = body ? await axios.post(url, body, { headers: { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' }, timeout: 20000, validateStatus: () => true })
                 : await axios.get(url, { headers: { 'Authorization': 'Bearer ' + KEY }, timeout: 15000, validateStatus: () => true });
      if (res.status === 429) return { _rateLimited: true };
    }
    if (res.status >= 400) return { _error: (res.data && res.data.error) || 'api_error', _status: res.status };
    if (typeof res.data === 'string') return { _error: 'html_response' };
    return res.data;
  } catch (err) {
    console.error('[lx]', ep, err.message);
    return { _error: err.message };
  }
}
const pg = (table, query, method, body, pref) => {
  const opt = { method: method || 'GET', headers: { 'Content-Type': 'application/json' } };
  if (pref) opt.headers.Prefer = pref;
  if (body) opt.body = JSON.stringify(body);
  return fetch(PGR + '/' + table + (query ? '?' + query : ''), opt)
    .then(async r => { if (method === 'DELETE') return r.ok; const t = await r.text(); return t ? JSON.parse(t) : []; })
    .catch(e => { console.error('[pg]', e.message); return null; });
};
const normT = s => String(s == null ? '' : s).replace('T', ' ').replace(/\.\d+/, '').replace(/(Z|[+-]\d{2}:?\d{2})$/, '').trim();
let ncMap = new Map(), ncTs = 0;
async function nc() {
  if (ncMap.size && Date.now() - ncTs < 5000) return ncMap;
  const rows = await pg('user_numbers', 'select=number,client&limit=10000');
  if (Array.isArray(rows)) { ncMap = new Map(); rows.forEach(n => ncMap.set(n.number, n.client || '')); ncTs = Date.now(); }
  return ncMap;
}
const hb = id => pg('boat_state', '', 'POST', { id: id, hb: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal');
let released = [];
let _rangeSig = '', _lastChange = Date.now();
const _rangeNames = new Set();
let _numClueTs = 0;
function numClue() { _numClueTs = Date.now(); }
async function numSmartSleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await sleep(2000);
    if (_numClueTs && Date.now() - _numClueTs < 6000) { _numClueTs = 0; return; }
    try { const st = fs.statSync('/tmp/zamil-number-clue'); if (Date.now() - st.mtimeMs < 6000) { fs.unlinkSync('/tmp/zamil-number-clue'); return; } } catch (e) {}
  }
}
function rangeSig(recs) {
  let ids = [], n = 0, u = 0;
  for (const r of recs) { ids.push(String(r.id)); n += (r.numbers || 0); u += (r.unassignedNumbers || 0); }
  ids.sort();
  return ids.join(',') + '|' + n + '|' + u;
}
function pushAll(ev) {
  fetch('http://127.0.0.1:8787/api/internal/push', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-boat-secret': process.env.BOAT_SECRET || '' }, body: JSON.stringify({ event: ev }) }).catch(() => {});
}
async function mirrorBack(rangeId, qty) {
  try {
    const mr = await pg('ranges_mirror', 'range_id=eq.' + encodeURIComponent(rangeId) + '&select=unassigned&limit=1');
    if (Array.isArray(mr) && mr[0]) await pg('ranges_mirror', 'range_id=eq.' + encodeURIComponent(rangeId), 'PATCH', { unassigned: (mr[0].unassigned || 0) + qty, updated_at: new Date().toISOString() });
  } catch (e) {}
}
function cdrPayload(recs, m) {
  return recs.map(r => ({ time: r.time, number: r.number, cli: r.cli, client: r.client || m.get(r.number) || null, content: r.content, range: r.range, range_prefix: r.rangePrefix, currency: r.currency, payout: r.payout, client_payout: r.clientPayout, status: r.status, cleared_at: r.clearedAt }));
}
// === WATERMARK: LaMix day starts 05:00 PKT ===
function dayStartPKT(){ const p=new Date(Date.now()+5*3600000); const d=Date.UTC(p.getUTCFullYear(),p.getUTCMonth(),p.getUTCDate()); return (p.getUTCHours()>=5)? d : d-86400000; }
// ============================================

// === GLOBAL PACE GATE: one call per endpoint per 1.62s (37/min budget) ===
const _paceLast = {};
async function paceGate(ep){
  const now = Date.now();
  const min = 1666;
  const w = _paceLast[ep] || 0;
  const d = now - w;
  if (d < min) await new Promise(r => setTimeout(r, min - d));
  _paceLast[ep] = Date.now();
}
// ===============================================================
async function cdrLoop() {
  while (true) {
    try {
      if (LIVE) {
        const st = await pg('cdr_state', 'id=eq.1&select=last_time');
        let last = (Array.isArray(st) && st[0] && st[0].last_time) ? normT(st[0].last_time) : fmt(Date.now() - 120000);
        // realtime-only: no day-clamp
        const nowMs = Date.now();
        let lastMs = Date.parse(last.replace(' ', 'T') + 'Z');
        if (isNaN(lastMs)) lastMs = nowMs - 3600000;
        if (lastMs > nowMs) lastMs = nowMs;
        if (lastMs < nowMs - 1500) {
          let eMs = Math.min(lastMs + 300000, nowMs);
          let recs = [], d = null;
          d = await lx('/cdrs', { from: last, to: fmt(eMs), limit: 500 });
          if (d && !d._error && !d._rateLimited) recs = d.records || [];
          if (d && !d._error && !d._rateLimited) {
            let adv = fmt(Math.max(lastMs, eMs - 1000));
            if (recs.length >= 500) {
              adv = last;
              recs.forEach(r => { const t = normT(r.time); if (t > adv) adv = t; });
            }
            if (recs.length) {
              const m = await nc();
              if (recs.some(r => r.range && !_rangeNames.has(r.range))) numClue();
              await pg('sms_cdr', 'on_conflict=time,number,cli', 'POST', cdrPayload(recs, m), 'resolution=ignore-duplicates,return=minimal');
              try { pushAll('sms'); } catch (e2) {}
              if (!global.__bfTs || Date.now() - global.__bfTs > 60000) { global.__bfTs = Date.now(); pg('rpc/backfill_cdr_clients', '', 'POST', {}); pg('rpc/recount_cdr_day', '', 'POST', { p_day: fmt(Date.now() + 18000000 - ((new Date(Date.now() + 18000000).getUTCHours() < 5) ? 86400000 : 0)) }); }
            }
            await pg('cdr_state', '', 'POST', { id: 1, last_time: adv }, 'resolution=merge-duplicates,return=minimal');
          }
        }
      }
      hb(9);
    } catch (e) { console.error('[cdr]', e.message); }
    await sleep(1700);
  }
}

async function sweepLoop() {
  while (true) {
    let pages = 0;
    try {
      let after = null; const seen = new Set();
      const mir = await pg('ranges_mirror', 'select=range_id,name&limit=1000');
      const nb = {}; (Array.isArray(mir) ? mir : []).forEach(r => { nb[r.range_id] = r.name; });
      while (pages < 400) {
        const pa = { limit: 500 }; if (after) pa.after = after;
        const d = await lx('/numbers', pa);
        if (!d || d._error || d._rateLimited) break;
        const as = (d.records || []).filter(n => n.client);
        as.forEach(n => seen.add(String(n.number)));
        if (as.length) {
          const up = await pg('user_numbers', '', 'POST', as.map(n => ({ number: n.number, range_id: n.rangeId || null, range_name: n.range || nb[n.rangeId] || undefined, client: n.client, status: 'active', plan: n.plan, payout_rate: n.payoutRate, updated_at: new Date().toISOString() })), 'resolution=merge-duplicates,return=minimal');
          if (up && up.message) console.error('[sweep-upsert]', String(up.message).slice(0, 300));
        }
        pages++; global.__sweepOkTs = Date.now(); after = d.nextCursor || null; if (!after) break;
      }
      if (pages > 0 && !after && seen.size) {
        const dbRows = await pg('user_numbers', 'status=neq.released&select=number&limit=30000');
        const dbArr = Array.isArray(dbRows) ? dbRows : [];
        const missing = dbArr.filter(r => !seen.has(String(r.number))).map(r => r.number);
        if (missing.length) console.log('[sweep] LaMix-missing kept (NO auto-release): '+missing.length); else if (missing.length) console.log('[sweep] reconcile guard held: missing=' + missing.length + ' db=' + dbArr.length);
        await pg('rpc/backfill_cdr_clients', '', 'POST', {});
        const b = new Date(Date.now() + 18000000); const hh = b.getUTCHours();
        const label = new Date(b.getTime() - (hh < 5 ? 1 : 0) * 86400000).toISOString().slice(0, 10);
        await pg('rpc/recount_cdr_day', '', 'POST', { p_day: label });
        for (let i = 0; i < released.length; i += 100) await pg('user_numbers', 'number=in.(' + released.slice(i, i + 100).join(',') + ')&status=neq.released', 'PATCH', { status: 'released', updated_at: new Date().toISOString() });
        released = [];
        await pg('user_numbers', 'status=eq.released&updated_at=lt.' + encodeURIComponent(new Date(Date.now() - 604800000).toISOString()), 'DELETE');
        ncTs = 0;
      }
      hb(2);
    } catch (e) { console.error('[sweep]', e.message); }
    const quiet = Date.now() - (global.__lastReleaseTs || 0);
    await numSmartSleep(quiet < 300000 ? 15000 : (quiet < 1800000 ? 30000 : 60000));
  }
}
async function syncLoop() {
  while (true) {
    let interval = 15000;
    try {
      const quiet = Date.now() - _lastChange;
      interval = quiet < 1200000 ? 5000 : (quiet < 3600000 ? 10000 : (quiet < 21600000 ? 15000 : 20000));
      let force = false;
      try { const st = fs.statSync('/tmp/zamil-range-clue'); if (Date.now() - st.mtimeMs < 8000) { force = true; fs.unlinkSync('/tmp/zamil-range-clue'); } } catch (e) {}
      const d = await lx('/ranges');
      const recs = (d && (d.ranges || d.records)) || [];
      if (!d || d._error || d._rateLimited) interval = 30000;
      else if (recs.length) {
        const sig = rangeSig(recs);
        if (force || sig !== _rangeSig) {
          _rangeSig = sig; _lastChange = Date.now(); global.__lastSweepChange = Date.now();
          _rangeNames.clear(); recs.forEach(r => { _rangeNames.add(String(r.name || '')); _rangeNames.add(String(r.id)); });
          const prev = await pg('ranges_mirror', 'select=range_id,name&limit=1000');
          const pm = new Map((Array.isArray(prev) ? prev : []).map(r => [String(r.range_id), r]));
          const nm = new Map(recs.map(r => [String(r.id), r]));
          const ev = [];
          if (pm.size) { nm.forEach((r, id) => { if (!pm.has(id)) ev.push({ action: 'added', range_id: id, name: r.name || '', numbers: r.numbers || 0 }); }); pm.forEach((r, id) => { if (!nm.has(id)) ev.push({ action: 'removed', range_id: id, name: r.name || '', numbers: r.numbers || 0 }); }); }
          await pg('ranges_mirror', '', 'POST', recs.map(r => ({ range_id: String(r.id), name: r.name, prefix: r.prefix || '', currency: r.currency || 'USD', numbers: r.numbers || 0, unassigned: r.unassignedNumbers || 0, rates: r.rates || [], is_active: true, updated_at: new Date().toISOString() })), 'resolution=merge-duplicates,return=minimal');
          await pg('ranges_mirror', 'range_id=not.in.(' + recs.map(r => '"' + String(r.id) + '"').join(',') + ')', 'DELETE');
          if (ev.length) { pg('range_changelog', '', 'POST', ev.map(e => Object.assign(e, { ts: new Date().toISOString() })), 'return=minimal'); console.log('[sync] ' + (force ? 'clue' : 'change') + ': ' + ev.map(e => e.action + ' ' + e.name).join(', ')); pg('range_changelog', 'ts=lt.' + encodeURIComponent(new Date(Date.now() - 14 * 86400000).toISOString()), 'DELETE');
ev.filter(x => x.action === 'removed').forEach(x => { console.log('[sync] range removed → INSTANT truncate: ' + x.name); pg('user_numbers', 'range_id=eq.' + encodeURIComponent(x.range_id) + '&status=neq.released', 'PATCH', { status: 'released', updated_at: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal'); pg('user_numbers', 'range_id=eq.' + encodeURIComponent(x.range_id) + '&status=neq.released&select=number&limit=50000').then(rr => { const cnt = Array.isArray(rr) ? rr.length : 0; if (!cnt) return; pg('crush_queue', 'range_id=eq.' + encodeURIComponent(x.range_id) + "&status=eq.suggested&select=id&limit=1").then(ex => { if (Array.isArray(ex) && ex.length) return; pg('crush_queue', '', 'POST', { range_id: x.range_id, range_name: x.name, rows_alive: cnt, status: 'suggested', source: 'auto', suggested_at: new Date().toISOString() }); }); }); }); }
          ev.filter(x=>x.action==='removed').forEach(x=>{ pg('user_numbers','range_id=eq.'+encodeURIComponent(x.range_id)+'&status=neq.released','PATCH',{status:'released',updated_at:new Date().toISOString()},'return=minimal'); console.log('[sync] range removed → released all its numbers: '+x.name); });
      ncTs = 0; numClue(); pushAll('ranges'); pushAll('numbers');
        }
      }
      hb(6);
    } catch (e) { console.error('[sync]', e.message); }
    await numSmartSleep(interval);
  }
}
async function repairLoop() {
  while (true) {
    try {
      await pg('rpc/backfill_cdr_clients', '', 'POST', {});
      const b = new Date(Date.now() + 18000000); const hh = b.getUTCHours();
      const label = new Date(b.getTime() - (hh < 5 ? 1 : 0) * 86400000).toISOString().slice(0, 10);
      await pg('rpc/recount_cdr_day', '', 'POST', { p_day: label });
      hb(3);
    } catch (e) {}
    await sleep(300000);
  }
}
async function cleanLoop() {
  return; // ── CAPTAIN LAW: Time-based recycling DISABLED ──
// CLEANLOCK4

  while (true) {
    try {
      await pg('rpc/truncate_old_cdr', '', 'POST', {});
      await pg('alloc_queue', 'status=neq.pending&created_at=lt.' + encodeURIComponent(new Date().toISOString().slice(0, 10) + 'T00:00:00Z'), 'DELETE');
      if (LIVE) {
        const cut = new Date(Date.now() - 604800000).toISOString();
        let list = await pg('rpc/stale_numbers', '', 'POST', { cutoff: cut });
        if (!Array.isArray(list)) list = await pg('user_numbers', 'updated_at=lt.' + encodeURIComponent(cut) + '&select=number&limit=5000');
        list = Array.isArray(list) ? list : [];
      // ── CAPTAIN'S LAW: never recycle client-assigned numbers ──
      if (list.length) {
        const all = list.map(x => x.number).filter(Boolean); const released = [];
        for (let i = 0; i < all.length; i += 800) {
          const rr = await pg('user_numbers', 'number=in.(' + all.slice(i, i + 800).join(',') + ')&select=number,client');
          (Array.isArray(rr) ? rr : []).forEach(r => { if (!r.client) released.push(r.number); });
        }
        console.log('[clean] stale=' + all.length + ' releasedOnly=' + released.length + ' PROTECTED=' + (all.length - released.length));
        list = released.map(n => ({ number: n }));
      }
        for (let i = 0; i < list.length; i += 1000) await lx('/numbers/unassign', { numbers: list.slice(i, i + 1000).map(x => x.number) });
        for (let i = 0; i < list.length; i += 100) await pg('user_numbers', 'number=in.(' + list.slice(i, i + 100).map(x => x.number).join(',') + ')', 'DELETE');
        ncTs = 0;
      }
      hb(5);
    } catch (e) { console.error('[clean]', e.message); }
    await sleep(4000);
  }
}
async function clientsLoop() {
  while (true) {
    try {
      if (LIVE) {
        const q = await pg('client_queue', 'status=eq.pending&order=created_at.asc&limit=10');
        for (const it of (Array.isArray(q) ? q : [])) {
          await sleep(3000);
          const r = await lx('/clients', null, { username: it.username, canUseApi: !!it.can_use_api, canViewRanges: !!it.can_view_ranges, canUseExtendedApi: !!it.can_use_extended_api });
          const okR = r && !r._error && !r._rateLimited;
          await pg('client_queue', 'id=eq.' + it.id, 'PATCH', { status: okR ? 'done' : 'failed', generated_password: (r && r.password) || null, result: r || {}, processed_at: new Date().toISOString() });
        }
      }
      hb(4);
    } catch (e) {}
    await sleep(2000);
  }
}
async function ghostLoop() {
return; // CAPTAIN: no auto-release backstop
  while (true) {
    try {
      if (!global.__sweepOkTs || (Date.now() - global.__sweepOkTs) > 15 * 60000) { await sleep(60000); continue; }
      const pq = q => require('child_process').execSync(`sudo -u postgres psql -P pager=off -d zamil_p1 -Atc "${q.replace(/"/g,'\\"')}"`).toString().trim();
      const list = (pq("SELECT coalesce(string_agg(number,','),'') FROM (SELECT u.number FROM user_numbers u WHERE u.status='active' AND u.updated_at < now()-interval '60 minutes' AND NOT EXISTS (SELECT 1 FROM lamix_numbers_mirror m WHERE m.number=u.number AND m.client IS NOT NULL AND m.client<>'') LIMIT 2000) x") || '').split(',').filter(Boolean);
      const n = list.length;
      if (n) {
        for (let i2 = 0; i2 < n; i2 += 500) { const nums = list.slice(i2, i2 + 500); await pg('user_numbers', 'number=in.(' + nums.join(',') + ')', 'PATCH', { client: '', status: 'released', updated_at: new Date().toISOString() }); }
        ncTs = 0;
        console.log('[ghost] law-released ' + n + ' rows LaMix holds free (>60m proof)');
        pushAll('numbers');
      }
      } catch (e) { console.error('[ghost]', e.message); }
    await sleep(45000);
  }
}


console.log('[cfg] LAMIX=' + LAMIX + ' KEY=' + (KEY || 'EMPTY').slice(0, 6) + '...');

async function triggerHandlerAlloc() {
  while (true) {
    try {
      await fetch('http://127.0.0.1:8787/api/boats/alloc', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + process.env.BOAT_SECRET, 'Content-Type': 'application/json' }
      });
    } catch(e) {}
    await sleep(1500);
  }
}

console.log('⚓ ZAMIL engine v3.0 canonical started | LIVE=' + LIVE);

async function cdrReverifyLoop(){
  while(true){
    try{
      if (LIVE){
        const from=fmt(Date.now()-35*60000), to=fmt(Date.now());
        const d=await lx('/cdrs',{from:from,to:to,limit:500});
        if(d && !d._error && !d._rateLimited){
          const recs=d.records||[];
          if(recs.length){
            const m=await nc();
            await pg('sms_cdr','on_conflict=time,number,cli','POST',cdrPayload(recs,m),'resolution=ignore-duplicates,return=minimal');
            pushAll('sms');
          }
        }
      }
    }catch(e3){ console.error('[cdr-reverify]', e3.message); }
    await sleep(30*60000);
  }
}

async function cdrDaySync(){
while(true){
try{
if(LIVE){
let from=fmt(dayStartPKT()); const nowMs=Date.now(); let guard=0;
while(guard<60){
const d=await lx('/cdrs',{from:from,to:fmt(nowMs),limit:500});
if(!d||d._error||d._rateLimited)break;
const recs=d.records||[]; if(!recs.length)break;
const m=await nc();
await pg('rpc/ingest_cdr','','POST',{rows:cdrPayload(recs,m)});
let mx=from; recs.forEach(r=>{const t=normT(r.time); if(t>mx)mx=t;});
if(recs.length<500)break; from=mx; guard++;
}
}
}catch(e){ console.error('[cdr-day]', e.message); }
await sleep(1800000);
}
}
cdrLoop(); cdrDaySync();
cdrReverifyLoop();
zghostLoop();  ghostLoop(); sweepLoop(); syncLoop(); repairLoop(); cleanLoop(); clientsLoop(); triggerHandlerAlloc(); 