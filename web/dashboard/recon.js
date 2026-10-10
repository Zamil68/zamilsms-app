/* recon v6 part1 */
(function(){
function post(p,b,cb){fetch('/api'+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({session:localStorage.getItem('app_session')},b))}).then(function(r){return r.json();}).then(cb).catch(function(){cb(null);});}
window.__rcPost=post;
function collapse(){var box=document.getElementById('crushSuggest');if(!box||box.dataset.wrapped)return;if(!box.innerHTML.trim()){box.dataset.wrapped='1';return;}
var wrap=document.createElement('div');wrap.style.display='none';wrap.id='crushSugWrap';box.parentNode.insertBefore(wrap,box);wrap.appendChild(box);
var b=document.createElement('button');b.type='button';b.className='fx-btn';b.style.cssText='background:var(--surface);color:var(--text);margin-bottom:10px';b.textContent='▸ Junk ranges — tap to open';
b.onclick=function(){var open=wrap.style.display!=='none';wrap.style.display=open?'none':'block';b.textContent=open?'▸ Junk ranges — tap to open':'▾ Hide junk ranges';};
box.parentNode.insertBefore(b,wrap);box.dataset.wrapped='1';}
window.__rcCollapse=collapse;
var _ol=window.openLimitPage;window.openLimitPage=function(){if(_ol)_ol();setTimeout(collapse,500);setTimeout(collapse,1600);};
})();
/* RC1_OK */
/* recon v6 part2 */
(function(){
var post=window.__rcPost;
function cards(){if(document.getElementById('dbxCard'))return;var p=document.getElementById('limitPage');if(!p)return;var w=p.querySelector('.fx-wrap');if(!w)return;
var d=document.createElement('div');
d.innerHTML='<div class="fx-card" id="syncMiniCard" style="margin-top:14px"><div class="fx-card-t">Number Sync · Live</div><div id="syncMiniBody" style="font-size:.72rem;font-weight:700;color:var(--muted)">loading…</div><div class="ff-bar" style="margin-top:7px"><i id="syncMiniBar" style="width:0%"></i></div><div class="fx-hint" id="syncMiniEta"></div></div>'
+'<div class="fx-card" id="dbxCard"><div class="fx-card-t">DB Explorer · user_numbers (local only)</div><div class="fx-hint">Pure DB — zero LaMix calls. Compare users/ranges vs panel.</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px"><select id="dbxClient" style="flex:1;min-width:120px;background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:9px;color:var(--text);font:inherit;font-size:.78rem"><option value="">All users</option></select><select id="dbxRange" style="flex:1;min-width:120px;background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:9px;color:var(--text);font:inherit;font-size:.78rem"><option value="">All ranges</option></select></div><button type="button" class="fx-btn" onclick="dbxLoad()">Load from DB</button><div id="dbxOut" style="margin-top:10px;max-height:220px;overflow:auto"></div></div>';
var cr=document.getElementById('crushCard');if(cr)cr.parentNode.insertBefore(d,cr);else w.appendChild(d);
post('/admin/db-explorer',{meta:true},function(dd){if(!dd||!dd.ok)return;var c=document.getElementById('dbxClient'),r=document.getElementById('dbxRange');if(c)(dd.clients||[]).forEach(function(x){var o=document.createElement('option');o.value=x;o.textContent=x;c.appendChild(o);});if(r)(dd.ranges||[]).forEach(function(x){var o=document.createElement('option');o.value=x;o.textContent=x;r.appendChild(o);});});}
window.dbxLoad=function(){var out=document.getElementById('dbxOut');if(!out)return;out.textContent='Reading DB…';post('/admin/db-explorer',{client:(document.getElementById('dbxClient')||{}).value||'',range:(document.getElementById('dbxRange')||{}).value||''},function(d){if(!d||!d.ok){out.textContent='failed';return;}var rows=d.rows||[];out.innerHTML=rows.length?rows.map(function(r){return '<div style="display:flex;gap:8px;padding:6px 2px;border-bottom:1px solid var(--border);font-size:.7rem;font-weight:700"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+r.range_name+'</span><span>'+r.users+'u</span><span style="color:#16a34a">'+r.active+' act</span><span style="color:var(--muted)">'+r.released+' rel</span><span style="color:#ef4444">'+r.junk+' junk</span><span>'+r.total+' tot</span></div>';}).join(''):'<div style="color:var(--muted);font-size:.72rem;padding:8px">No rows</div>';});};
function poll(){post('/admin/sync-progress',{},function(d){var b=document.getElementById('syncMiniBody'),bar=document.getElementById('syncMiniBar'),e=document.getElementById('syncMiniEta');if(!b||!d||!d.prog)return;var g=d.prog,st=String(g.status||'idle').toUpperCase();b.innerHTML='<span style="color:'+(st==='RUNNING'?'#f59e0b':st==='DONE'?'#10b981':'var(--muted)')+'">●</span> '+st+' · '+(g.fetched||0).toLocaleString()+' / '+(g.expected||0).toLocaleString()+' · remaining '+(g.remaining||0).toLocaleString();if(bar)bar.style.width=(g.expected?Math.min(100,Math.round(g.fetched/g.expected*100)):0)+'%';if(e)e.textContent=(st==='RUNNING'&&g.etaSecs)?('ETA ~'+Math.floor(g.etaSecs/60)+'m '+(g.etaSecs%60)+'s · 38 req/min'):(st==='DONE'?'last pass complete · pool matches LaMix':'idle · next pass automatic');});}
var _ol2=window.openLimitPage;window.openLimitPage=function(){if(_ol2)_ol2();setTimeout(function(){cards();poll();},450);};
setInterval(function(){var p=document.getElementById('limitPage');if(p&&p.style.display==='block'){poll();window.__rcCollapse&&window.__rcCollapse();}},4000);
})();
/* RC2_OK */
/* ══ UNF WATCHDOG (delivered via cache-busted recon.js) ══ */
(function(){
function sess(){return localStorage.getItem('app_session');}
function pj(p,b){return fetch('/api'+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({session:sess()},b))}).then(function(r){return r.json();}).catch(function(){return null;});}
if(typeof window.unfRun!=='function'){
window.unfRun=function(){var u=(document.getElementById('unfUser')||{}).value||'';var out=document.getElementById('unfOut');if(!out)return;
 if(!u){out.innerHTML='<div style="font-size:.72rem;color:var(--muted);padding:6px 2px">Select a user first.</div>';return;}
 out.innerHTML='<div style="text-align:center;color:var(--muted);font-size:.72rem;padding:10px">Reading DB…</div>';
 pj('/admin/user-ranges',{client:u}).then(function(d){if(!d||!d.ok){out.innerHTML='<div style="color:var(--red);font-size:.72rem">Failed to read DB.</div>';return;}
  var t=d.total||{total:0,active:0};var rows=d.ranges||[];var max=1;rows.forEach(function(r){if(r.qty>max)max=r.qty;});
  var h='<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px"><span class="ff-pin">'+u+'</span><span class="ff-pin">total '+t.total+'</span><span class="ff-pin" style="color:#047857">active '+t.active+'</span><span class="ff-pin" style="color:var(--muted)">'+rows.length+' ranges</span></div>';
  h+=rows.length?rows.map(function(r){var pct=Math.max(2,Math.round((r.qty/max)*100));return '<div style="margin-bottom:9px"><div style="display:flex;align-items:center;gap:8px;font-size:.74rem;font-weight:700"><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+r.range_name+'</span><span style="color:var(--accent)">'+r.qty+'</span></div><div class="ff-bar"><i style="width:'+pct+'%"></i></div><div style="font-size:.58rem;color:var(--muted);margin-top:2px">active '+r.active+' · released '+r.released+' · junk '+r.junk+'</div></div>';}).join(''):'<div style="font-size:.72rem;color:var(--muted)">No rows for this user in DB.</div>';
  out.innerHTML=h;});
};}
function build(){
 if(document.getElementById('unfCard'))return;
 var p=document.getElementById('limitPage');if(!p)return;var w=p.querySelector('.fx-wrap');if(!w)return;
 var d=document.createElement('div');d.id='unfCard';d.className='fx-card';d.style.marginTop='14px';
 d.innerHTML='<div class="fx-card-t">User Numbers Filter · DB only</div><div class="fx-hint">Pure local DB — zero LaMix calls. Pick a user, tap Filter: every range they hold with exact quantities.</div><div class="fx-row"><select id="unfUser" class="ff-input" style="flex:1;min-width:140px"><option value="">Select user…</option></select><button class="fx-btn" onclick="unfRun()">Filter</button></div><div id="unfOut" style="margin-top:10px"></div>';
 var cr=document.getElementById('crushCard');if(cr)cr.parentNode.insertBefore(d,cr);else w.appendChild(d);
 pj('/admin/user-ranges',{}).then(function(dd){var s2=document.getElementById('unfUser');if(!s2||!dd||!dd.ok)return;s2.innerHTML='<option value="">Select user…</option>';(dd.clients||[]).forEach(function(c){var o=document.createElement('option');o.value=c;o.textContent=c;s2.appendChild(o);});});
}
setInterval(function(){var p=document.getElementById('limitPage');if(p&&p.style.display==='block')build();},1200);
setTimeout(build,800);
})();
