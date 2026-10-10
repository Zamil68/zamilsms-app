const fs=require('fs'),cp=require('child_process'),path=require('path');
const env=Object.fromEntries(fs.readFileSync(path.join(__dirname,'.env'),'utf8').split('\n').map(l=>l.split('=')).filter(x=>x[0]&&x[1]).map(([k,...v])=>[k,v.join('=').trim()]));
const KEY=env.LAMIX_API_KEY, BASE=env.LAMIX_REST||'https://panel.lamix.org/api/v1';
const PG=q=>{try{return cp.execSync(`sudo -u postgres psql -P pager=off -d zamil_p1 -Atc "${q.replace(/"/g,'\\"')}"`).toString().trim();}catch(e){return '';}};
const PGF=f=>cp.execSync(`sudo -u postgres psql -P pager=off -d zamil_p1 -q -v ON_ERROR_STOP=1 -f ${f}`).toString();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const esc=s=>String(s==null?'':s).replace(/'/g,"''");
const PROG='/var/run/numsync-progress.json', CURVE='/var/run/numsync-curve.json';
const wr=(p,o)=>{try{fs.writeFileSync(p,JSON.stringify(o));fs.writeFileSync(path.join(__dirname,'.'+path.basename(p)),JSON.stringify(o));}catch(e){}};
const log=m=>{console.log(m);try{fs.appendFileSync('/var/log/zamil-numsync.log',new Date().toISOString()+' '+m+'\n');}catch(e){}};
const fetchRanges=async()=>{ for(let a=0;a<6;a++){ try{ const r=await fetch(BASE+'/ranges',{headers:{Authorization:'Bearer '+KEY}}); const j=await r.json();
  const arr=Array.isArray(j)?j:((j&&(j.records||j.ranges||j.data||j.items||j.result))||null); if(Array.isArray(arr)&&arr.length) return arr; await sleep(2000); }catch(e){ await sleep(2000); } } return null; };
(async()=>{
  const runStart=new Date().toISOString(); const t0=Date.now();
  const RA=await fetchRanges();
  if(!RA){ log('⛔ ABORT: /ranges unreachable — nothing touched'); wr(PROG,{status:'aborted',startedAt:runStart,endedAt:new Date().toISOString(),reason:'ranges-unreachable'}); process.exit(0); }
  const RMAP={}; RA.forEach(r=>{ const id=r.id||r.rangeId||''; if(id) RMAP[id]={name:String(r.name||r.rangeName||id), total:+(r.numbers!=null?r.numbers:(r.total!=null?r.total:0))}; });
  const all=Object.keys(RMAP);
  const expected=all.reduce((s,id)=>s+(RMAP[id].total||0),0);
  log(`START ranges=${all.length} expected=${expected}`);
  wr(PROG,{status:'running',startedAt:runStart,fetched:0,expected,unique:0,range:'-',pass:1});
  let fetched=0; const seen=new Set(); const complete=[]; const curve=[]; const perRange={};
  let pending=all.slice();
  for(let pass=0; pass<3 && pending.length; pass++){
    if(pass>0) log('RETRY PASS '+(pass+1)+' for '+pending.length+' ranges');
    const queue=pending; pending=[];
    for(const rid of queue){
      let after=null,pages=0,ok=true,cnt=0;
      while(pages<300){
        let d=null;
        for(let a=0;a<3&&!d;a++){ try{ const url=BASE+'/numbers?limit=500&rangeId='+encodeURIComponent(rid)+(after?'&after='+encodeURIComponent(after):'');
          const r=await fetch(url,{headers:{Authorization:'Bearer '+KEY}}); const j=await r.json();
          if(j&&!j.error&&Array.isArray(j.records)) d=j; else await sleep(2000); }catch(e){ await sleep(2000); } }
        if(!d){ ok=false; break; }
        const recs=d.records||[]; if(!recs.length) break;
        const vals=[];
        for(const r of recs){ const n=String(r.number||''); if(!n||seen.has(n)) continue; seen.add(n);
          vals.push(`('${esc(n)}','${esc(r.client||'')}','${esc(r.rangeId||rid)}','${runStart}')`); }
        for(let i=0;i<vals.length;i+=400){ fs.writeFileSync('/tmp/m.sql',`INSERT INTO lamix_numbers_mirror (number,client,range_id,synced_at) VALUES ${vals.slice(i,i+400).join(',')} ON CONFLICT (number) DO UPDATE SET client=EXCLUDED.client, range_id=EXCLUDED.range_id, synced_at=EXCLUDED.synced_at;`);
          cp.execSync('sudo -u postgres psql -P pager=off -d zamil_p1 -q -f /tmp/m.sql'); }
        cnt+=recs.length; fetched+=recs.length; curve.push({t:Date.now(),f:fetched}); wr(CURVE,curve);
        wr(PROG,{status:'running',startedAt:runStart,fetched,expected,unique:seen.size,range:rid,pass:pass+1,rangesDone:complete.length+'/'+all.length});
        const nx=d.nextCursor||null;
        if(!nx) break;
        after=nx; pages++; await sleep(2200);
      }
      perRange[rid]=cnt;
      const tot=RMAP[rid].total||0;
      const proven = ok && (cnt>=tot || Math.abs(cnt-tot)<=Math.max(2,Math.round(tot*0.02)));
      if(proven) complete.push(rid); else pending.push(rid);
    }
  }
  const incomplete=pending.slice();
  const RA2=await fetchRanges();
  if(RA2){ const T2={}; RA2.forEach(r=>{ const id=r.id||r.rangeId||''; if(id) T2[id]=+(r.numbers!=null?r.numbers:(r.total!=null?r.total:0)); });
    for(let i=incomplete.length-1;i>=0;i--){ const id=incomplete[i]; const c=perRange[id]||0; const t2=T2[id];
      if(t2!=null && Math.abs(c-t2)<=Math.max(2,Math.round(t2*0.02))){ incomplete.splice(i,1); complete.push(id); log('RECHECK proven vs fresh /ranges: '+id+' cnt='+c+' freshTotal='+t2); }
      else log('incomplete: '+id+' cnt='+c+' tot1='+(RMAP[id]?RMAP[id].total:'?')+' tot2='+(t2!=null?t2:'?')); } }
  log(`FETCHED fetched=${fetched} complete=${complete.length}/${all.length} incomplete=${incomplete.length}`);
  if(all.length>=1){
    const liveList=all.map(x=>`'${esc(x)}'`).join(',');
    const gb=+PG("SELECT count(*) FROM lamix_numbers_mirror WHERE range_id NOT IN ("+liveList+")")||0;
    if(gb>0 && gb<20000){
      fs.writeFileSync('/tmp/nsg.sql', `CREATE TEMP TABLE zghost AS SELECT number FROM lamix_numbers_mirror WHERE range_id NOT IN (${liveList});
DELETE FROM user_numbers u USING zghost g WHERE u.number=g.number;
DELETE FROM lamix_numbers_mirror m USING zghost g WHERE m.number=g.number;`);
      try{ PGF('/tmp/nsg.sql'); log('✅ ghost-range purge: '+gb+' numbers of ranges LaMix deleted'); }catch(e){ log('⚠️ ghost: '+String(e.stderr||e).slice(0,120)); }
    } else if(gb>=20000){ log('⛔ ghost guard tripped: '+gb+' rows — skipped'); }
  }
  const vals=RA.map(r=>{ const id=r.id||r.rangeId||''; const nm=String(r.name||r.rangeName||'').replace(/'/g,"''"); const n=+(r.numbers!=null?r.numbers:(r.total!=null?r.total:0)); const u=+(r.unassigned!=null?r.unassigned:(r.available!=null?r.available:0)); return id?`('${String(id).replace(/'/g,"''")}','${nm}',${n},${u},now())`:null; }).filter(Boolean);
  fs.writeFileSync('/tmp/rr.sql', `INSERT INTO ranges_mirror (range_id,name,numbers,unassigned,updated_at) VALUES ${vals.join(',')} ON CONFLICT (range_id) DO UPDATE SET name=EXCLUDED.name, numbers=EXCLUDED.numbers, unassigned=EXCLUDED.unassigned, updated_at=now();
CREATE TEMP TABLE zrmap AS SELECT * FROM (VALUES ${vals.map(v=>{const m=v.match(/^\('([^']*)','([^']*)'/);return `('${m[1]}','${m[2]}')`;}).join(',')}) AS t(range_id,name);
UPDATE user_numbers u SET range_name=t.name FROM zrmap t JOIN lamix_numbers_mirror m ON m.range_id=t.range_id WHERE u.number=m.number AND u.range_name IS DISTINCT FROM t.name;`);
  try{ PGF('/tmp/rr.sql'); log('✅ ranges_mirror + names normalized');
      try{ const _pr=(PG("SELECT coalesce(sum(numbers),0)||'|'||coalesce(sum(unassigned),0) FROM ranges_mirror")||'0|0').split('|'); const _ph=require('fs'); let _h=[]; try{_h=JSON.parse(_ph.readFileSync('/var/run/pool-history.json','utf8'));}catch(e){} _h.push({t:Date.now(),total:+_pr[0]||0,free:+_pr[1]||0,assigned:(+_pr[0]||0)-(+_pr[1]||0)}); if(_h.length>400)_h=_h.slice(-400); _ph.writeFileSync('/var/run/pool-history.json',JSON.stringify(_h)); }catch(e){} }catch(e){ log('⚠️ rr: '+String(e.stderr||e).slice(0,120)); }
  fs.writeFileSync('/tmp/nsheal.sql', `INSERT INTO user_numbers (number, client, range_name, status) SELECT m.number, m.client, COALESCE(r.name, m.range_id), (CASE WHEN m.client='' OR m.client IS NULL THEN 'released' ELSE 'active' END) FROM lamix_numbers_mirror m LEFT JOIN ranges_mirror r ON r.range_id=m.range_id WHERE NOT EXISTS (SELECT 1 FROM user_numbers u WHERE u.number=m.number) AND m.synced_at >= '${runStart}' ON CONFLICT (number) DO NOTHING;
UPDATE user_numbers u SET client=m.client, status=(CASE WHEN m.client='' OR m.client IS NULL THEN 'released' ELSE 'active' END) FROM lamix_numbers_mirror m WHERE u.number=m.number AND (u.client IS DISTINCT FROM m.client OR u.status IS DISTINCT FROM (CASE WHEN m.client='' OR m.client IS NULL THEN 'released' ELSE 'active' END));`);
  try{ PGF('/tmp/nsheal.sql'); log('✅ heal applied'); }catch(e){ log('⚠️ heal: '+String(e.stderr||e).slice(0,120)); }
  if(complete.length){
    const list=complete.map(x=>`'${esc(x)}'`).join(',');
    fs.writeFileSync('/tmp/nspurge.sql', `CREATE TEMP TABLE zstale AS SELECT number FROM lamix_numbers_mirror WHERE synced_at < '${runStart}' AND range_id IN (${list});
DELETE FROM user_numbers u USING zstale s WHERE u.number=s.number;
DELETE FROM lamix_numbers_mirror m USING zstale s WHERE m.number=s.number;`);
    try{ PGF('/tmp/nspurge.sql'); log('✅ proven-only purge ('+complete.length+' ranges)'); }catch(e){ log('⚠️ purge: '+String(e.stderr||e).slice(0,120)); }
  }
  const before=+PG("SELECT count(*) FROM user_numbers u WHERE NOT EXISTS (SELECT 1 FROM lamix_numbers_mirror m WHERE m.number=u.number)")||0;
  if(!incomplete.length){
    fs.writeFileSync('/tmp/nssweep.sql', `DELETE FROM user_numbers WHERE number NOT IN (SELECT number FROM lamix_numbers_mirror);`);
    log('SWEEP MODE: global (all 107 ranges proven — mirror IS LaMix)');
  } else {
    const escN=x=>String(x).replace(/'/g,"''");
    const compNames=complete.map(id=>RMAP[id]?escN(RMAP[id].name):null).filter(Boolean);
    const liveNames=Object.keys(RMAP).map(id=>escN(RMAP[id].name));
    fs.writeFileSync('/tmp/nssweep.sql', `DELETE FROM user_numbers WHERE number NOT IN (SELECT number FROM lamix_numbers_mirror) AND (range_name IN ('${compNames.join("','")}') OR range_name NOT IN ('${liveNames.join("','")}'));`);
    log('SWEEP MODE: name-based ('+incomplete.length+' ranges still unproven — their rows spared)');
  }
  try{ PGF('/tmp/nssweep.sql'); const after=+PG("SELECT count(*) FROM user_numbers u WHERE NOT EXISTS (SELECT 1 FROM lamix_numbers_mirror m WHERE m.number=u.number)")||0;
    log('✅ orphan sweep: '+before+' → '+after+' (removed '+(before-after)+' proven-gone rows)'); }catch(e){ log('⚠️ sweep: '+String(e.stderr||e).slice(0,120)); }
  const done=incomplete.length===0;
  const fU=PG('SELECT count(*) FROM user_numbers'), fM=PG('SELECT count(*) FROM lamix_numbers_mirror');
  log(`END status=${done?'done':'partial'} mirror=${fM} user_numbers=${fU} secs=${Math.round((Date.now()-t0)/1000)}`);
  wr(PROG,{status:done?'done':'partial',startedAt:runStart,endedAt:new Date().toISOString(),fetched,expected,unique:seen.size,secs:Math.round((Date.now()-t0)/1000),incomplete:incomplete,finalMirror:+fM,finalUser:+fU});
  cp.execSync('rm -f /tmp/m.sql /tmp/rr.sql /tmp/nsheal.sql /tmp/nspurge.sql /tmp/nssweep.sql');
})();
