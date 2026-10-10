require('dotenv').config({ path: '/opt/zamil/server/.env' });
const express = require('express');
const jwt = require('jsonwebtoken');
const handler = require('./handler.js');
const INTERN = handler._internals || null;
const BOAT = process.env.BOAT_SECRET;
const app = express();
app.use(express.json({ limit: '1mb' }));
app.get('/healthz', (q, s) => s.json({ ok: true, ts: Date.now() }));

const sse = new Set();
app.get('/api/stream', (req, res) => {
  let u = null;
  try { u = jwt.verify(String(req.query.session || ''), process.env.JWT_SECRET); } catch (e) { return res.status(401).end(); }
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(': connected\n\n');
  const c = { res, user: u }; sse.add(c);
  const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch (e) {} }, 25000);
  req.on('close', () => { clearInterval(hb); sse.delete(c); });
});

async function broadcast() {
  if (!INTERN || !sse.size) return;
  try {
    const bd = INTERN.businessDayPKT();
    const totals = await INTERN.rpcTotals(bd.label, bd.label);
    for (const c of sse) {
      try {
        const count = INTERN.sumMine(totals, c.user);
        const idents = [c.user.username, c.user.clientName].filter(Boolean).map(s => 'client.ilike.' + encodeURIComponent('%' + String(s).trim() + '%'));
        const rr = await INTERN.supaFetch('sms_cdr', 'time=gte.' + encodeURIComponent(bd.from) + '&time=lte.' + encodeURIComponent(bd.to) + '&or=(' + idents.join(',') + ')&order=time.desc&limit=50&select=time,number,cli,content,range');
        const recent = (Array.isArray(rr) ? rr : []).map(r => ({ time: (r.time || '').slice(11, 19), datetime: r.time, number: r.number, cli: r.cli, message: r.content, range: r.range }));
        c.res.write('event: sms\ndata: ' + JSON.stringify({ ok: true, count, recent }) + '\n\n');
        c.res.write('event: lb\ndata: {}\n\n');
      } catch (e) {}
    }
  } catch (e) {}
}

app.post('/api/internal/push', (req, res) => {
  if (req.headers['x-boat-secret'] !== BOAT) return res.status(401).json({ ok: false });




  if (req.body && req.body.event) { const ev = String(req.body.event); sse.forEach(cn => { try { cn.res.write('event: ' + ev + '\ndata: {}\n\n'); } catch (e) {} }); }
res.json({ ok: true }); broadcast();
});

app.use(express.static('/home/sk-khan/htdocs/sk-khan.online', { maxAge: 0, index: 'index.html' }));
app.get(/^\/dashboard\/?$/i, (q, s) => s.redirect(301, '/dashboard/dashboard.html'));
app.use((q, s, n) => { // sw-disabled-route
  if (q.url.startsWith('/api')) return n();
  if (q.method === 'GET' && String(q.headers.accept || '').includes('text/html') && q.url !== '/') return s.redirect(301, '/dashboard/dashboard.html');
  s.status(404).send('Not found');
});
app.use(handler);
app.listen(8787, '127.0.0.1', () => console.log('zamil-api :8787 (SSE on)'));