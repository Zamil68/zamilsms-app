const fs = require('fs');
const CAP = 37, GAP = 1000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function take(ep) {
  const f = '/tmp/lamix_rate_' + String(ep).replace(/[^a-z0-9]/gi, '_') + '.log';
  while (true) {
    const now = Date.now();
    let ts = [];
    try { ts = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(Number); } catch (e) {}
    const recent = ts.filter(t => now - t < 60000);
    const last = ts.length ? Math.max.apply(null, ts) : 0;
    if (recent.length < CAP && now - last >= GAP) {
      try { fs.appendFileSync(f, String(now) + '\n'); if (ts.length > 300) fs.writeFileSync(f, recent.join('\n') + '\n'); } catch (e) {}
      return;
    }
    await sleep(120);
  }
}
module.exports = { take };
