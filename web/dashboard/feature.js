window.showLoading=function(m){var e=document.getElementById('loadingToast');if(!e){e=document.createElement('div');e.id='loadingToast';e.style.cssText='position:fixed;top:18px;left:50%;transform:translateX(-50%);background:var(--card);border:1px solid var(--accent);border-radius:14px;padding:12px 20px;box-shadow:0 10px 30px rgba(0,0,0,.18);z-index:9999;display:flex;align-items:center;gap:10px;font-size:.82rem;font-weight:800;color:var(--text)';document.body.appendChild(e);}e.innerHTML='<span style="width:18px;height:18px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;display:inline-block;animation:ltSpin .8s linear infinite"></span>'+(m||'Processing...');e.style.display='flex';};window.hideLoading=function(){var e=document.getElementById('loadingToast');if(e)e.style.display='none';};if(!document.getElementById('ltStyles')){var _st=document.createElement('style');_st.id='ltStyles';_st.textContent='@keyframes ltSpin{to{transform:rotate(360deg)}}';document.head.appendChild(_st);}

window.showLoading = function(msg) {
  var el = document.getElementById('loadingToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loadingToast';
    el.style.cssText = 'position:fixed;top:20px;right:20px;background:var(--card);border:1px solid var(--accent);border-radius:12px;padding:14px 20px;box-shadow:0 8px 24px rgba(0,0,0,.15);z-index:9999;display:flex;align-items:center;gap:12px;font-size:.84rem;font-weight:700;color:var(--text);animation:slideIn .3s ease';
    document.body.appendChild(el);
  }
  el.innerHTML = '<div class="spinner" style="width:18px;height:18px;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin 1s linear infinite"></div>' + (msg || 'Processing...');
  el.style.display = 'flex';
  clearTimeout(el._t);
};
window.hideLoading = function() {
  var el = document.getElementById('loadingToast');
  if (el) el.style.display = 'none';
};
if (!document.getElementById('loadingStyles')) {
  var st = document.createElement('style');
  st.id = 'loadingStyles';
  st.textContent = '@keyframes spin{to{transform:rotate(360deg)}}@keyframes slideIn{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}}';
  document.head.appendChild(st);
}
/* ═══ feature.js — ALL ADMIN FEATURES (Zamil SMS) ═══
   Dev: Muhammad Muzammil Aziz */
(function(){
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function escH(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;').replace(/"/g,'&quot;'); }
  function sess(){ return localStorage.getItem('app_session'); }
  var INP='flex:1;min-width:88px;background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:9px 11px;color:var(--text);font:inherit;font-size:.82rem;outline:none';

  /* ══ injected styles (self-contained — no CSS file edits) ══ */
  (function(){ var st=document.createElement('style'); st.textContent=`
.zic{display:block}
.zicw{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.h-b{color:#0e7490;background:rgba(8,145,178,.12)}.h-m{color:#6d28d9;background:rgba(124,92,255,.14)}
.h-g{color:#047857;background:rgba(16,185,129,.14)}.h-y{color:#b45309;background:rgba(251,191,36,.16)}
.h-r{color:#be123c;background:rgba(244,63,94,.12)}
[data-theme="dark"] .h-b{color:#67e8f9}[data-theme="dark"] .h-m{color:#c4b5fd}
[data-theme="dark"] .h-g{color:#6ee7b7}[data-theme="dark"] .h-y{color:#fde68a}
[data-theme="dark"] .h-r{color:#fda4af}
#statsCards{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px}
@media(min-width:900px){#statsCards{grid-template-columns:repeat(4,1fr)}}
.ff-stat{display:flex;align-items:center;gap:10px;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px 13px}
.ff-stat-v{font-size:1.3rem;font-weight:700;color:var(--text);line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.ff-stat-k{font-size:.56rem;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);margin-top:3px}
#statsMostActive{display:flex;align-items:center;gap:8px;font-size:.8rem;font-weight:600;padding:12px 14px;margin-bottom:12px}
.ff-ccard{background:var(--card);border:1px solid var(--border);border-radius:12px;margin-bottom:8px;overflow:hidden}
.ff-chead{display:flex;align-items:center;gap:10px;padding:12px 14px;cursor:pointer}
.ff-flag{font-size:1.45rem;line-height:1}
.ff-cinfo{flex:1;min-width:0}
.ff-cname{font-size:.9rem;font-weight:700;color:var(--text)}
.ff-csub{font-size:.66rem;color:var(--muted)}
.ff-csub b{color:var(--accent)}
.ff-chev{color:var(--muted);transition:transform .2s}
.ff-rrow{display:flex;align-items:center;gap:9px;padding:8px 2px;border-bottom:1px solid var(--border)}
.ff-rrow:last-child{border-bottom:0}
.ff-rmain{flex:1;min-width:0}
.ff-rname{font-size:.78rem;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ff-bar{height:4px;background:var(--border);border-radius:2px;margin-top:5px;overflow:hidden}
.ff-bar i{display:block;height:4px;border-radius:2px;background:linear-gradient(90deg,var(--accent),var(--accent2))}
.ff-rfig{text-align:right;flex-shrink:0}
.ff-rfig b{display:block;font-size:.86rem;font-weight:700;color:var(--muted)}
.ff-rfig b.on{color:var(--accent)}
.ff-rfig span{font-size:.55rem;color:var(--muted)}
.ff-empty2{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;color:var(--muted);padding:24px 14px;font-size:.8rem}
.ff-ibtn{display:inline-flex;align-items:center;gap:5px;flex-shrink:0;font:inherit;font-size:.66rem;font-weight:800;color:var(--accent);background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.25);border-radius:7px;padding:5px 9px;cursor:pointer;transition:transform .12s}
.ff-ibtn:active{transform:scale(.94)}
.ff-ibtn.on{color:#06080f;background:var(--accent);border-color:transparent}
.ff-ibtn.danger{color:#f87171;background:rgba(248,113,113,.1);border-color:rgba(248,113,113,.25)}
.ff-pin{display:inline-flex;align-items:center;gap:4px;font-size:.55rem;font-weight:800;color:var(--accent);background:rgba(34,211,238,.12);border:1px solid rgba(34,211,238,.25);border-radius:20px;padding:2px 7px;white-space:nowrap}
.ff-meta{display:inline-flex;align-items:center;gap:5px}
.ff-hot{display:flex;align-items:center;gap:8px;background:linear-gradient(135deg,rgba(245,158,11,.14),rgba(239,68,68,.12));border:1px solid rgba(245,158,11,.3);border-radius:12px;padding:12px 14px;font-size:.82rem;font-weight:700;color:var(--text)}
.zconfirm-ic svg{width:34px;height:34px;color:var(--red);margin:0 auto}
.ff-head-badge svg{width:19px;height:19px}
`; document.head.appendChild(st); })();

  /* ── Z-UI SVG icon kit — Dev: Muhammad Muzammil Aziz ── */
  var ZI={
  globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z"/>',
  layers:'<path d="M12 2l10 6-10 6L2 8z"/><path d="M2 14l10 6 10-6"/>',
  hash:'<path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18"/>',
  check:'<circle cx="12" cy="12" r="9"/><path d="M8.5 12.2l2.4 2.4 4.6-4.8"/>',
  unlock:'<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.7-1.5"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  cal:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  flame:'<path d="M12 3c1 3-3 4.5-3 8a3 3 0 0 0 6 0c0-1 .5-2 1-2.5 1.5 1.5 2.2 3.5 2.2 5a6.2 6.2 0 1 1-12.4 0c0-4 4.2-6.5 6.2-10.5z"/>',
  copy:'<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  refresh:'<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>',
  pen:'<path d="M17 3l4 4L8 20l-5 1 1-5z"/>',
  trash:'<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  pin:'<path d="M12 17v5M7 4h10l-1.5 6.5 3 3.5H5.5l3-3.5z"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="3"/><path d="M15.5 14.6a5.5 5.5 0 0 1 6 5.4"/>',
  chart:'<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
  shield:'<path d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5z"/>',
  gift:'<rect x="3" y="8" width="18" height="4"/><path d="M5 12v8h14v-8M12 8v12M12 8s-4 0-4-3a2 2 0 0 1 4 0zM12 8s4 0 4-3a2 2 0 0 0-4 0z"/>',
  x:'<path d="M6 6l12 12M18 6L6 18"/>',
  chev:'<path d="m6 9 6 6 6-6"/>'};
  function zic(n,s){return '<svg class="zic" width="'+(s||15)+'" height="'+(s||15)+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+ZI[n]+'</svg>';}
   window.zic = zic;  // Make zic globally available

  function injectMarkup(){ fetch('/dashboard/feature.html').then(function(r){return r.text();}).then(function(h){ var root=document.getElementById('featureRoot'); if(root){ root.innerHTML=h; svgBadges(); } }).catch(function(){}); }

  /* swap HTML emojis in feature.html for SVGs after injection */
  function svgBadges(){
    var map={statsPage:'chart',adminPage:'shield',limitPage:'gift',teamPage:'users',teamReportPage:'chart'};
    for(var id in map){ var b=document.querySelector('#'+id+' .ff-head-badge'); if(b) b.innerHTML=zic(map[id],19); }
    var btns=document.querySelectorAll('.ff-iconbtn');
    for(var i=0;i<btns.length;i++){ var t=(btns[i].textContent||'').trim();
      if(t.indexOf('Copy')>-1) btns[i].innerHTML=zic('copy',13)+' Copy';
      else if(t==='↻') btns[i].innerHTML=zic('refresh',13);
    }
    var ss=document.getElementById('statsSearch'); if(ss) ss.placeholder='Filter country or range…';
     var sp=document.getElementById('statsPage');
if(sp){ var els=sp.querySelectorAll('*'); for(var i2=0;i2<els.length;i2++){ var el2=els[i2]; if(!el2.children.length && (el2.textContent||'').trim()==='Statistics'){ el2.textContent='Ranges'; } } }
var dsb=document.getElementById('drawerStatsBtn');
if(dsb){ dsb.innerHTML=dsb.innerHTML.replace(/Statistics/g,'Ranges'); }
  }

  /* ── confirm dialog (SVG icon) ── */
  window.zconfirm=function(msg,onYes,opts){ opts=opts||{}; var ov=document.getElementById('zconfirmOverlay'); if(!ov)return; document.getElementById('zconfirmMsg').innerHTML=msg; var ic=document.getElementById('zconfirmIc'); if(ic) ic.innerHTML=opts.icon||zic('shield',34); var yes=document.getElementById('zconfirmYes'),no=document.getElementById('zconfirmNo'); yes.textContent=opts.yesText||'Confirm'; no.textContent=opts.noText||'Cancel'; ov.style.display='flex'; function close(){ ov.style.display='none'; yes.onclick=null; no.onclick=null; } yes.onclick=function(){ close(); if(onYes)onYes(); }; no.onclick=close; };

  /* ── role + drawer gating ── */
  function pill(role,big){ var label=role==='super'?'SUPER ADMIN':(role==='admin'?'ADMIN':''); if(!label)return''; var grad=role==='super'?'linear-gradient(135deg,#f59e0b,#ef4444)':'linear-gradient(135deg,var(--accent),var(--accent2))'; return '<span class="role-pill" style="display:inline-block;font-size:'+(big?'.62rem':'.56rem')+';font-weight:900;letter-spacing:.06em;color:#fff;background:'+grad+';padding:2px 8px;border-radius:20px;white-space:nowrap">'+label+'</span>'; }
  window._userRole = 'none'; // Track role globally for stats gating
  function applyRole(role){
    window._userRole = role || 'none';
    var pn=document.getElementById('profileName'); if(pn){ var old=pn.parentElement.querySelector('.role-pill'); if(old)old.remove(); if(role==='super'||role==='admin') pn.insertAdjacentHTML('afterend',pill(role,false)); }
    var du=document.getElementById('drawerUsername'); if(du&&typeof USERNAME!=='undefined'&&USERNAME) du.textContent=USERNAME;
    var drp=document.getElementById('drawerRolePill'); if(drp) drp.innerHTML=pill(role,true);
    var isAdm=(role==='super'||role==='admin');
    var map={drawerStatsBtn:true ,drawerAdminBtn:(role==='super'),drawerLimitBtn:isAdm,drawerTeamBtn:isAdm,drawerReportBtn:isAdm};
    for(var id in map){ var b=document.getElementById(id); if(b) b.style.display=map[id]?'flex':'none'; }
  }
  function gateRole(){ var tries=0; var t=setInterval(function(){ tries++; try{ var s=sess(); if(!s){clearInterval(t);return;} fetch('/api/auth/role',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:s})}).then(function(r){return r.json();}).then(function(d){ if(d&&d.ok&&d.role){applyRole(d.role);clearInterval(t);} else if(tries>=4){applyRole('none');clearInterval(t);} }).catch(function(){ if(tries>=4){applyRole('none');clearInterval(t);} }); }catch(e){ if(tries>=4)clearInterval(t); } },700); }

  /* ── STATISTICS ── */
  var _statsData=null;
  window.openStatsPage=function(){ var p=document.getElementById('statsPage'); if(p){p.style.display='block';window.scrollTo(0,0);loadStats();} };
  window.closeStatsPage=function(){ var p=document.getElementById('statsPage'); if(p)p.style.display='none'; };
  window.loadStats=function(){ var box=document.getElementById('statsCards'); if(box)box.innerHTML='<div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:18px"><div class="spinner" style="width:22px;height:22px;margin:0 auto 8px"></div>Crunching…</div>'; fetch('/api/stats',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess()})}).then(function(r){return r.json();}).then(function(d){ if(!d||!d.ok){ if(box)box.innerHTML='<div style="grid-column:1/-1;text-align:center;color:var(--red);padding:18px">'+((d&&d.error)||'Failed')+'</div>'; return; } _statsData=d; renderStats(d); }).catch(function(){ if(box)box.innerHTML='<div style="grid-column:1/-1;text-align:center;color:var(--red);padding:18px">Connection error</div>'; }); };
  function scard(ic,hue,v,l){ return '<div class="ff-stat"><span class="zicw h-'+hue+'">'+zic(ic,16)+'</span><div><div class="ff-stat-v">'+v+'</div><div class="ff-stat-k">'+l+'</div></div></div>'; }
  function renderStats(d){
    var c='';
    c+=scard('globe','b',d.totalCountries||0,'Countries'); 
    c+=scard('layers','m',d.totalRanges||0,'Ranges');
    c+=scard('hash','g',d.totalNumbers||0,'Numbers'); 
    c+=scard('check','g',d.allocated||0,'Allocated');
    c+=scard('unlock','b',d.available||0,'Available'); 
    
    // 🔒 OTP data restricted to SUPER ADMIN only
    var isSuper = (window._userRole === 'super');
    if (isSuper) {
        c+=scard('mail','y',d.otpToday!=null?d.otpToday:0,'OTPs Today');
        c+=scard('cal','m',d.otpWeek!=null?d.otpWeek:0,'OTPs · 7 days'); 
        c+=scard('cal','r',d.otpMonth!=null?d.otpMonth:0,'OTPs · 30 days');
    }
    
    document.getElementById('statsCards').innerHTML=c;
    
    var ma=document.getElementById('statsMostActive');
    if (ma) {
        if (isSuper) {
            ma.style.display = 'flex';
            ma.innerHTML='<span class="zicw h-r" style="width:26px;height:26px">'+zic('flame',14)+'</span><span>Most active today: <b>'+escH(d.mostActiveRange||'—')+'</b>'+(d.mostActiveCount?(' · '+d.mostActiveCount+' OTPs'):'')+'</span>';
        } else {
            ma.style.display = 'none'; // Hide "Most active" hot card for non-super admins
        }
    }
    var up=document.getElementById('statsUpdated'); if(up)up.textContent='Updated '+new Date().toLocaleTimeString();
    renderCountries(d.countries||[],'');
  }
  function renderCountries(list,q){
    var box=document.getElementById('statsCountries'); if(!box)return;
    q=(q||'').toLowerCase(); var html='';
    list.forEach(function(co,ci){
      var ranges=co.ranges.filter(function(r){return !q||co.country.toLowerCase().includes(q)||r.range.toLowerCase().includes(q);});
      if(q&&!co.country.toLowerCase().includes(q)&&ranges.length===0)return;
      var coAvail=co.ranges.reduce(function(s,r){return s+r.available;},0);
      html+='<div class="ff-ccard"><div class="ff-chead" onclick="toggleCountry('+ci+')"><span class="ff-flag">'+co.flag+'</span>'
        +'<div class="ff-cinfo"><div class="ff-cname">'+escH(co.country)+'</div><div class="ff-csub">'+co.ranges.length+' ranges · <b>'+coAvail+'</b> available</div></div>'
        +'<span class="ff-chev" id="chev'+ci+'">'+zic('chev',14)+'</span></div><div id="coBody'+ci+'" style="display:none">';
      ranges.forEach(function(r){
        var pct=r.total?Math.round(r.available/r.total*100):0;
        html+='<div class="ff-rrow"><div class="ff-rmain"><div class="ff-rname">'+escH(r.range)+'</div><div class="ff-bar"><i style="width:'+pct+'%"></i></div></div>'
          +'<div class="ff-rfig"><b class="'+(r.available>0?'on':'')+'">'+r.available+'</b><span>of '+r.total+'</span></div></div>';
      });
      html+='</div></div>';
    });
    box.innerHTML=html||'<div class="ff-empty2">No matches</div>';
  }
  window.toggleCountry=function(ci){ var b=document.getElementById('coBody'+ci),ch=document.getElementById('chev'+ci); if(!b)return; var open=b.style.display==='block'; b.style.display=open?'none':'block'; if(ch)ch.style.transform=open?'':'rotate(180deg)'; };
  window.filterStats=function(){ var q=(document.getElementById('statsSearch').value||''); if(_statsData)renderCountries(_statsData.countries||[],q); };
  window.copyAvailList=function(){ if(!_statsData||!_statsData.countries){ if(typeof showToast==='function')showToast('Load stats first','error'); return; } var lines=['Available Ranges — Zamil SMS','']; _statsData.countries.forEach(function(co){ var av=co.ranges.filter(function(r){return r.available>0;}); if(!av.length)return; lines.push(co.flag+' '+co.country); av.forEach(function(r){lines.push('   • '+r.range+' — '+r.available+' available');}); }); try{ navigator.clipboard&&navigator.clipboard.writeText(lines.join('\n')); if(typeof showToast==='function')showToast('Available list copied','success'); }catch(e){} };

  /* ── ADMIN CONTROL + PREFIXES ── */
  window.openAdminPage=function(){ var p=document.getElementById('adminPage'); if(p){p.style.display='block';window.scrollTo(0,0);loadAdmins();loadPrefixes();renderTargetCard();} };
  window.closeAdminPage=function(){ var p=document.getElementById('adminPage'); if(p)p.style.display='none'; };
  function showMsg(t,good){ var m=document.getElementById('adminMsg'); if(!m)return; m.style.display='block'; m.textContent=t; m.style.color=good?'var(--green)':'var(--red)'; }
  window.loadAdmins=function(){ var box=document.getElementById('adminList'); if(!box)return; box.innerHTML='<div style="text-align:center;color:var(--muted);padding:16px">Loading…</div>'; fetch('/api/admin/admins',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess()})}).then(function(r){return r.json();}).then(function(d){ if(!d||!d.ok){ box.innerHTML='<div style="color:var(--red);padding:12px;text-align:center">'+((d&&d.error)||'Failed')+'</div>'; return; } var admins=d.admins||[]; if(!admins.length){ box.innerHTML='<div style="color:var(--muted);padding:14px;text-align:center">No admins yet.</div>'; return; } box.innerHTML=admins.map(function(a){ return '<div style="display:flex;align-items:center;gap:10px;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:11px 13px;margin-bottom:7px"><div style="flex:1;min-width:0"><div style="font-size:.86rem;font-weight:800;color:var(--text)">'+escH(a.username)+'</div><div style="font-size:.62rem;color:var(--muted)">'+escH(a.role)+(a.added_by?(' · by '+escH(a.added_by)):'')+'</div></div><button class="ff-ibtn danger" onclick="demoteAdmin(\''+escH(a.username)+'\')">'+zic('trash',12)+' Remove</button></div>'; }).join(''); }).catch(function(){ box.innerHTML='<div style="color:var(--red);padding:12px;text-align:center">Connection error</div>'; }); };
  window.promoteAdmin=function(){ var inp=document.getElementById('adminUserInput'); var u=(inp.value||'').trim(); if(!u){showMsg('Enter a username',false);return;} fetch('/api/admin/promote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess(),username:u})}).then(function(r){return r.json();}).then(function(d){ if(d&&d.ok){showMsg(u+' is now an admin',true);inp.value='';loadAdmins();} else showMsg((d&&d.error)||'Failed',false); }).catch(function(){showMsg('Connection error',false);}); };
  window.demoteAdmin=function(u){ zconfirm('Remove admin rights from <b>'+escH(u)+'</b>?',function(){ fetch('/api/admin/demote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess(),username:u})}).then(function(r){return r.json();}).then(function(d){ if(d&&d.ok){showMsg('Removed '+u,true);if(typeof showToast==='function')showToast('Removed admin '+u,'success');loadAdmins();} else showMsg((d&&d.error)||'Failed',false); }).catch(function(){showMsg('Connection error',false);}); },{icon:zic('shield',34),yesText:'Remove'}); };
  function pfMsg(t,good){ var m=document.getElementById('pfMsg'); if(!m)return; m.style.display='block'; m.textContent=t; m.style.color=good?'var(--green)':'var(--red)'; }
  var _pfList=[],_editingPrefix=null;
  window.loadPrefixes=function(){ var box=document.getElementById('pfList'); if(!box)return; fetch('/api/admin/team-prefixes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess()})}).then(function(r){return r.json();}).then(function(d){ if(!d||!d.ok){box.innerHTML='';return;} _pfList=d.prefixes||[]; if(!_pfList.length){box.innerHTML='<div style="color:var(--muted);font-size:.74rem">No prefixes assigned yet.</div>';return;} box.innerHTML=_pfList.map(function(p,i){ var editing=(_editingPrefix===p.prefix); var labelLine; if(editing){ labelLine='<div style="display:flex;gap:6px;align-items:center;margin-top:5px"><input id="pfEditInput" type="text" value="'+escH(p.label||'')+'" placeholder="Display name" onkeydown="pfEditKey(event,'+i+')" style="flex:1;min-width:0;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:6px 9px;color:var(--text);font:inherit;font-size:.76rem;outline:none"><button class="ff-ibtn on" onclick="savePrefixLabel('+i+')">'+zic('check',12)+' Save</button><button class="ff-ibtn" onclick="cancelPrefixLabel()">'+zic('x',12)+'</button></div>'; } else { var ln=p.label?'<span style="color:var(--text);font-weight:700">'+escH(p.label)+'</span>':'<span style="color:var(--muted);font-style:italic">no display name</span>'; labelLine='<div style="display:flex;align-items:center;gap:8px;margin-top:4px;font-size:.72rem">'+ln+'<button class="ff-ibtn" onclick="editPrefixLabel('+i+')">'+zic('pen',12)+' Name</button></div>'; } return '<div style="display:flex;align-items:flex-start;gap:10px;background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:9px 12px;margin-bottom:6px"><div style="flex:1;min-width:0"><div style="font-size:.82rem;font-weight:800;color:var(--text)">'+escH(p.prefix)+' <span style="color:var(--muted);font-weight:600;font-size:.66rem">'+escH(p.admin_username)+'</span></div>'+labelLine+'</div><button class="ff-ibtn danger" onclick="delPrefix(\''+escH(p.prefix)+'\')">'+zic('trash',12)+' Remove</button></div>'; }).join(''); if(_editingPrefix){var ei=document.getElementById('pfEditInput');if(ei)ei.focus();} }).catch(function(){if(box)box.innerHTML='';}); };
  window.editPrefixLabel=function(i){ _editingPrefix=(_pfList[i]&&_pfList[i].prefix)||null; loadPrefixes(); };
  window.cancelPrefixLabel=function(){ _editingPrefix=null; loadPrefixes(); };
  window.pfEditKey=function(e,i){ if(e.key==='Enter'){e.preventDefault();savePrefixLabel(i);} else if(e.key==='Escape'){cancelPrefixLabel();} };
  window.savePrefixLabel=function(i){ var p=_pfList[i]; if(!p)return; var inp=document.getElementById('pfEditInput'); var lbl=inp?(inp.value||'').trim():''; fetch('/api/admin/set-prefix',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess(),prefix:p.prefix,admin:p.admin_username,label:lbl})}).then(function(r){return r.json();}).then(function(d){ if(d&&d.ok){_editingPrefix=null;pfMsg('Name saved for '+p.prefix,true);loadPrefixes();} else pfMsg((d&&d.error)||'Failed',false); }).catch(function(){pfMsg('Connection error',false);}); };
  window.setPrefix=function(){ var pf=(document.getElementById('pfPrefix').value||'').trim(),ad=(document.getElementById('pfAdmin').value||'').trim(); var lbEl=document.getElementById('pfLabel'); var lb=lbEl?(lbEl.value||'').trim():''; if(!pf||!ad){pfMsg('Enter prefix and admin username',false);return;} fetch('/api/admin/set-prefix',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess(),prefix:pf,admin:ad,label:lb})}).then(function(r){return r.json();}).then(function(d){ if(d&&d.ok){pfMsg('Assigned '+pf+' → '+ad+(lb?' ('+lb+')':''),true);document.getElementById('pfPrefix').value='';document.getElementById('pfAdmin').value='';if(lbEl)lbEl.value='';loadPrefixes();} else pfMsg((d&&d.error)||'Failed',false); }).catch(function(){pfMsg('Connection error',false);}); };
  window.delPrefix=function(pf){ zconfirm('Remove prefix <b>'+escH(pf)+'</b>?',function(){ fetch('/api/admin/del-prefix',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess(),prefix:pf})}).then(function(r){return r.json();}).then(function(d){ if(d&&d.ok){pfMsg('Removed '+pf,true);loadPrefixes();} else pfMsg((d&&d.error)||'Failed',false); }).catch(function(){pfMsg('Connection error',false);}); },{icon:zic('trash',34),yesText:'Remove'}); };

  /* ── LIMIT INCREASE ── */
  var _limitUser='';
  window.openLimitPage=function(){ var p=document.getElementById('limitPage'); if(p){p.style.display='block';window.scrollTo(0,0);ensureBulkCards();loadBulkData();crushLoad();} };
  window.closeLimitPage=function(){ var p=document.getElementById('limitPage'); if(p)p.style.display='none'; };
  function limMsg(t,good){ var m=document.getElementById('limitMsg'); if(!m)return; m.style.display='block'; m.textContent=t; m.style.color=good?'var(--green)':'var(--red)'; }
  window.loadLimitStatus=function(){ var u=(document.getElementById('limitUserInput').value||'').trim(); if(!u){limMsg('Enter a username',false);return;} _limitUser=u; var box=document.getElementById('limitResults'); if(box)box.innerHTML='<div style="text-align:center;color:var(--muted);padding:16px">Loading…</div>'; fetch('/api/admin/limit-status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess(),username:u})}).then(function(r){return r.json();}).then(function(d){ if(!d||!d.ok){if(box)box.innerHTML='<div style="color:var(--red);padding:12px;text-align:center">'+((d&&d.error)||'Failed')+'</div>';return;} renderLimit(d); }).catch(function(){if(box)box.innerHTML='<div style="color:var(--red);padding:12px;text-align:center">Connection error</div>';}); };
  function freeBtn(rowId){ return '<button class="lim-freebtn" onclick="freeTry('+JSON.stringify(rowId)+')">'+zic('gift',13)+' +1 try</button>'; }
  function renderLimit(d){ var box=document.getElementById('limitResults'); if(!box)return;
    var ranges=d.ranges||[],countries=d.countries||[];
    if(!ranges.length&&!countries.length){box.innerHTML='<div class="ff-empty2">'+zic('check',22)+'<div><b>'+escH(d.username)+'</b> has nothing at limit right now.</div></div>';return;}
    var h='';
    if(ranges.length){ h+='<div class="lim-sectitle">Ranges at limit · '+ranges.length+'</div>';
      ranges.forEach(function(r){h+='<div class="lim-row"><div class="lim-row-main"><div class="lim-row-title">'+escH(r.rangeTitle)+'</div><div class="lim-row-sub">'+escH(r.country)+' · <span class="lim-used">'+r.used+'/'+r.limit+'</span> used</div></div>'+freeBtn(r.ids[r.ids.length-1])+'</div>';}); }
    if(countries.length){ h+='<div class="lim-sectitle" style="margin-top:14px">Countries at limit · '+countries.length+'</div>';
      countries.forEach(function(c){h+='<div class="lim-row"><div class="lim-row-main"><div class="lim-row-title">'+escH(c.country)+'</div><div class="lim-row-sub"><span class="lim-used">'+c.used+'/'+c.limit+'</span> used today</div></div>'+freeBtn(c.ids[c.ids.length-1])+'</div>';}); }
    box.innerHTML=h; }
  window.freeTry=function(rowId){ zconfirm('Free <b>1 try</b> for '+escH(_limitUser)+'?',function(){ fetch('/api/admin/free-try',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess(),username:_limitUser,rowId:rowId})}).then(function(r){return r.json();}).then(function(d){ if(d&&d.ok){limMsg('Freed 1 try for '+_limitUser,true);if(typeof showToast==='function')showToast('Freed 1 try','success');loadLimitStatus();} else limMsg((d&&d.error)||'Failed',false); }).catch(function(){limMsg('Connection error',false);}); },{icon:zic('gift',34),yesText:'Free try'}); };

  /* ── TEAMS: list + create + edit + delete + pin ── */
  var _editId='';
  window.openTeamPage=function(){ var p=document.getElementById('teamPage'); if(p){p.style.display='block';window.scrollTo(0,0);ensureCreateCard();ensurePinCard();loadMyClients(false);} };
  window.closeTeamPage=function(){ var p=document.getElementById('teamPage'); if(p)p.style.display='none'; };
  window.loadMyClients=function(force){ var box=document.getElementById('teamList'); if(!box)return; box.innerHTML='<div style="text-align:center;color:var(--muted);padding:18px"><div class="spinner" style="width:22px;height:22px;margin:0 auto 8px"></div>Loading team…</div>'; fetch('/api/admin/my-clients',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess(),force:!!force})}).then(function(r){return r.json();}).then(function(d){ if(!d||!d.ok){box.innerHTML='<div style="color:var(--red);padding:14px;text-align:center">'+((d&&d.error)||'Failed')+'</div>';return;} var sub=document.getElementById('teamSub'); if(sub)sub.textContent=(d.total||0)+' clients · '+(d.cached?'from cache':'fresh')+' · '+(d.teams||[]).length+' teams'; renderTeams(d.teams||[]); }).catch(function(){box.innerHTML='<div style="color:var(--red);padding:14px;text-align:center">Connection error</div>';}); };
  function renderTeams(teams){ var box=document.getElementById('teamList'); if(!box)return; if(!teams.length){box.innerHTML='<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:18px;text-align:center;color:var(--muted)">No team prefixes yet.</div>';return;} var h=''; teams.forEach(function(t,ti){ var head=t.prefix?(escH(t.prefix)+'  '+(t.label?'<span style="color:var(--muted);font-weight:600">'+escH(t.label)+'</span> · ':'')+'<span style="color:var(--muted);font-weight:600">'+escH(t.admin)+'</span>'):'<span style="color:var(--muted)">'+escH(t.label||'System Generated')+'</span>'; h+='<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;margin-bottom:8px;overflow:hidden"><div onclick="toggleTeam('+ti+')" style="display:flex;align-items:center;gap:10px;padding:12px 14px;cursor:pointer"><div style="flex:1;min-width:0;font-size:.86rem;font-weight:800;color:var(--text)">'+head+'</div><span style="font-size:.72rem;font-weight:800;color:var(--accent)">'+t.count+'</span><span id="tchev'+ti+'" style="color:var(--muted);transition:transform .2s">'+zic('chev',14)+'</span></div><div id="tbody'+ti+'" style="display:none;border-top:1px solid var(--border);padding:4px 12px 8px">'; if(!t.clients.length){h+='<div style="padding:10px 2px;color:var(--muted);font-size:.76rem">No clients in this team yet.</div>';} else t.clients.forEach(function(c){ var pinned=!!c.pinned; var inSys=!t.prefix; h+='<div style="display:flex;align-items:center;gap:7px;padding:8px 2px;border-bottom:1px solid var(--border)"><div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span style="font-size:.82rem;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escH(c.username)+'</span>'+(pinned?'<span class="ff-pin">'+zic('pin',10)+' pinned</span>':'')+'</div><div style="font-size:.62rem;color:var(--muted)">ID '+escH(c.id)+(c.name?(' · '+escH(c.name)):'')+'</div></div>'+(pinned?'<button class="ff-ibtn" onclick="unpinClient(\''+escH(c.username)+'\')">'+zic('x',12)+' Unpin</button>':'')+(inSys?'<button class="ff-ibtn" onclick="prefillPin(\''+escH(c.username)+'\')">'+zic('pin',12)+' Pin</button>':'')+'<button class="ff-ibtn" onclick="resetCredentials(\''+escH(c.id)+'\',\''+escH(c.username)+'\')">'+zic('unlock',12)+' Reset</button><button class="ff-ibtn danger" onclick="delClient(\''+escH(c.id)+'\',\''+escH(c.username)+'\')">'+zic('trash',12)+'</button></div>'; }); h+='</div></div>'; }); box.innerHTML=h; }
  window.toggleTeam=function(ti){ var b=document.getElementById('tbody'+ti),ch=document.getElementById('tchev'+ti); if(!b)return; var open=b.style.display==='block'; b.style.display=open?'none':'block'; if(ch)ch.style.transform=open?'':'rotate(180deg)'; };
  ;
  ;
  function ensureCreateCard(){ if(document.getElementById('teamCreateCard')){loadCreatePrefixOptions();return;} var list=document.getElementById('teamList'); if(!list)return; list.insertAdjacentHTML('beforebegin','<div id="teamCreateCard" style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:12px"><div style="font-size:.8rem;font-weight:800;margin-bottom:10px;display:flex;align-items:center;gap:6px">'+zic('plus',14)+' Create a new ID</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px"><select id="tcPrefix" style="flex:1;min-width:120px;background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:9px 11px;color:var(--text);font:inherit;font-size:.82rem;outline:none"><option value="">Loading prefixes…</option></select><input id="tcSuffix" type="text" placeholder="Suffix e.g. Ahsan" style="flex:1;min-width:120px;background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:9px 11px;color:var(--text);font:inherit;font-size:.82rem;outline:none"></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px"><input id="tcPass" type="text" placeholder="Password (blank = same as ID)" style="flex:1;min-width:120px;background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:9px 11px;color:var(--text);font:inherit;font-size:.82rem;outline:none"><input id="tcName" type="text" placeholder="Display name (optional)" style="flex:1;min-width:120px;background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:9px 11px;color:var(--text);font:inherit;font-size:.82rem;outline:none"></div><div style="font-size:.6rem;color:var(--muted);margin-bottom:8px;line-height:1.4">Full ID = prefix + suffix · 6–15 chars · country auto = Pakistan.</div><button id="tcBtn" onclick="createClient()" style="font-size:.78rem;font-weight:800;color:#fff;background:linear-gradient(135deg,var(--accent),var(--accent2));border:0;border-radius:9px;padding:9px 16px;cursor:pointer">Create ID</button><div id="tcMsg" style="font-size:.72rem;font-weight:700;margin-top:8px;display:none"></div></div>'); loadCreatePrefixOptions(); }
  function loadCreatePrefixOptions(){ var sel=document.getElementById('tcPrefix'); if(!sel)return; fetch('/api/admin/team-prefixes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess()})}).then(function(r){return r.json();}).then(function(d){ var list=(d&&d.prefixes)||[]; if(!list.length){sel.innerHTML='<option value="">No prefixes — assign one first</option>';return;} sel.innerHTML=list.map(function(p){return '<option value="'+escH(p.prefix)+'">'+escH(p.prefix)+' ('+escH(p.admin_username)+')</option>';}).join(''); if(list.length===1)sel.value=list[0].prefix; }).catch(function(){sel.innerHTML='<option value="">Failed to load</option>';}); }
  window.createClient=function(){ var pfEl=document.getElementById('tcPrefix'); var prefix=pfEl?pfEl.value:''; var suffix=(document.getElementById('tcSuffix').value||'').trim(); var pass=(document.getElementById('tcPass').value||'').trim(); var name=(document.getElementById('tcName').value||'').trim(); var msgEl=document.getElementById('tcMsg'); function m(t,good){if(msgEl){msgEl.style.display='block';msgEl.textContent=t;msgEl.color=good?'var(--green)':'var(--red)';msgEl.style.color=good?'var(--green)':'var(--red)';}} if(!prefix){m('Select a team prefix',false);return;} if(!suffix){m('Enter a suffix',false);return;} var btn=document.getElementById('tcBtn'); if(btn){btn.disabled=true;btn.textContent='Creating…';} if(typeof showLoading==='function')showLoading('Creating client ID...'); fetch('/api/admin/create-client',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess(),prefix:prefix,suffix:suffix,password:pass,name:name})}).then(function(r){return r.json();}).then(function(d){ if(btn){btn.disabled=false;btn.textContent='Create ID';} if(typeof hideLoading==='function')hideLoading(); if(d&&d.ok){m('Created '+(d.username||prefix+suffix)+(d.clientId?' (ID '+d.clientId+')':''),true);document.getElementById('tcSuffix').value='';document.getElementById('tcPass').value='';document.getElementById('tcName').value='';if(typeof showToast==='function')showToast('Created '+(d.username||prefix+suffix),'success');loadMyClients(true);} else m((d&&d.error)||'Failed',false); }).catch(function(){if(btn){btn.disabled=false;btn.textContent='Create ID';} if(typeof hideLoading==='function')hideLoading();m('Connection error',false);}); };
  
window.resetCredentials=function(username){
  zconfirm('Reset credentials for <b>'+escH(username)+'</b>?<div style="font-size:.72rem;color:var(--muted);margin-top:8px;line-height:1.5">This removes their password. They will be forced to set a new password on next login.</div>', function(){
    if(typeof showLoading==='function')showLoading('Resetting credentials...');
    fetch('/api/admin/reset-credentials',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess(),username:username})}).then(function(r){return r.json();}).then(function(d){
      if(typeof hideLoading==='function')hideLoading();
      if(d&&d.ok){
        if(typeof showToast==='function')showToast('Credentials reset for '+username+' — they must activate on next login','success');
        loadMyClients(true);
      } else {
        if(typeof showToast==='function')showToast((d&&d.error)||'Reset failed','error');
      }
    }).catch(function(){
      if(typeof hideLoading==='function')hideLoading();
      if(typeof showToast==='function')showToast('Connection error','error');
    });
  },{icon:zic('unlock',34),yesText:'Reset Credentials'});
};
window.delClient=function(id,username){ zconfirm('Delete <b>'+escH(username)+'</b>? This cannot be undone.',function(){ fetch('/api/admin/delete-client',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess(),clientId:id,username:username})}).then(function(r){return r.json();}).then(function(d){ if(d&&d.ok){if(typeof showToast==='function')showToast('Deleted '+username,'success');loadMyClients(true);} else if(typeof showToast==='function')showToast((d&&d.error)||'Delete failed','error'); }).catch(function(){if(typeof showToast==='function')showToast('Connection error','error');}); },{icon:zic('trash',34),yesText:'Delete'}); };
  function ensurePinCard(){ if(document.getElementById('teamPinCard')){loadPinOptions();return;} var list=document.getElementById('teamList'); if(!list)return; list.insertAdjacentHTML('beforebegin','<div id="teamPinCard" style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:12px"><div style="font-size:.8rem;font-weight:700;margin-bottom:4px;display:flex;align-items:center;gap:6px">'+zic('pin',14)+' Pin an existing user to a team</div><div style="font-size:.66rem;color:var(--muted);margin-bottom:10px;line-height:1.5">For users whose name does NOT start with a team prefix (e.g. <b>Muzammil_Aziz</b>).</div><div style="display:flex;gap:8px;flex-wrap:wrap"><select id="pinPrefix" style="flex:1;min-width:120px;background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:9px 11px;color:var(--text);font:inherit;font-size:.82rem;outline:none"><option value="">Loading teams…</option></select><input id="pinUser" type="text" placeholder="Exact username" style="flex:1.4;min-width:150px;background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:9px 11px;color:var(--text);font:inherit;font-size:.82rem;outline:none"><button onclick="pinClient()" style="font-size:.78rem;font-weight:700;color:#fff;background:linear-gradient(135deg,var(--accent),var(--accent2));border:0;border-radius:9px;padding:9px 16px;cursor:pointer;white-space:nowrap">Pin</button></div><div id="pinMsg" style="font-size:.72rem;font-weight:600;margin-top:8px;display:none"></div></div>'); loadPinOptions(); }
  function loadPinOptions(){ var sel=document.getElementById('pinPrefix'); if(!sel)return; fetch('/api/admin/team-prefixes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess()})}).then(function(r){return r.json();}).then(function(d){ var list=(d&&d.prefixes)||[]; if(!list.length){sel.innerHTML='<option value="">No teams</option>';return;} sel.innerHTML=list.map(function(p){return '<option value="'+escH(p.prefix)+'">'+escH(p.prefix)+(p.label?' ('+escH(p.label)+')':'')+' · '+escH(p.admin_username)+'</option>';}).join(''); }).catch(function(){sel.innerHTML='<option value="">Failed to load</option>';}); }
  window.pinClient=function(){ var sel=document.getElementById('pinPrefix'); var inp=document.getElementById('pinUser'); var msg=document.getElementById('pinMsg'); function m(t,good){if(msg){msg.style.display='block';msg.textContent=t;msg.style.color=good?'var(--green)':'var(--red)';}} var prefix=sel?sel.value:''; var username=inp?inp.value.trim():''; if(!prefix){m('Select a team',false);return;} if(!username){m('Enter the exact username',false);return;} fetch('/api/admin/pin-client',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess(),username:username,prefix:prefix})}).then(function(r){return r.json();}).then(function(d){ if(d&&d.ok){m(username+' pinned to '+prefix,true);if(inp)inp.value='';if(typeof showToast==='function')showToast('Pinned '+username,'success');loadMyClients(true);} else m((d&&d.error)||'Failed',false); }).catch(function(){m('Connection error',false);}); };
  window.unpinClient=function(username){ zconfirm('Unpin <b>'+escH(username)+'</b> from this team?',function(){ fetch('/api/admin/unpin-client',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess(),username:username})}).then(function(r){return r.json();}).then(function(d){ if(d&&d.ok){if(typeof showToast==='function')showToast('Unpinned '+username,'success');loadMyClients(true);} else if(typeof showToast==='function')showToast((d&&d.error)||'Unpin failed','error'); }).catch(function(){if(typeof showToast==='function')showToast('Connection error','error');}); },{icon:zic('pin',34),yesText:'Unpin'}); };
  window.prefillPin=function(u){ var i=document.getElementById('pinUser'); if(i){i.value=u;i.focus();var c=document.getElementById('teamPinCard');if(c)c.scrollIntoView({behavior:'smooth',block:'center'});} };

  /* ── BULK ALLOCATION + RANGE CRUSHER (admin) ── */
var BULK={ranges:[],users:[],perRange:1000,jobId:null,pollT:null,t0:0,d0:0,allRanges:[],allUsers:[]};
function ppPost(p,b){ return fetch('/api'+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({session:sess()},b))}).then(function(r){return r.json();}); }
function ensureBulkCards(){ if(document.getElementById('bulkCard'))return; var p=document.getElementById('limitPage'); if(!p)return; var wrap=p.querySelector('.fx-wrap'); if(!wrap)return; var d=document.createElement('div');
d.innerHTML='<div class="fx-card" id="bulkCard" style="margin-top:14px"><div class="fx-card-t">'+zic('layers',15)+'Bulk SMS Allocation</div><div class="fx-hint">Pick ranges + users + numbers per range. Equal auto-distribution; each LaMix call auto-split to max 1000. Live progress below.</div><div class="fx-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="bulkRangeSearch" placeholder="Filter ranges..." oninput="renderBulkRanges()"></div><div id="bulkRangeList" style="max-height:170px;overflow-y:auto;margin-bottom:10px"></div><div class="fx-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="bulkUserSearch" placeholder="Filter users..." oninput="renderBulkUsers()"></div><div id="bulkUserList" style="max-height:150px;overflow-y:auto;margin-bottom:10px"></div><div class="fx-row"><input id="bulkQty" type="number" min="1" max="100000" value="1000" class="ff-input" style="min-width:130px"><button class="fx-btn" onclick="bulkStart()">'+zic('zap',14)+' Start Bulk</button></div><div id="bulkSelInfo" style="font-size:.68rem;color:var(--muted);margin-top:8px"></div><div id="bulkProgress" style="display:none;margin-top:12px"></div></div><div class="fx-card" id="crushCard"><div class="fx-card-t">'+zic('trash',15)+'Range Crusher</div><div class="fx-hint">Release or delete EVERY row of a range name (e.g. "Sri Lanka LX 24 Apr") from our DB instantly. Ranges vanished from LaMix are auto-suggested.</div><div id="crushSuggest"></div><div class="fx-row"><select id="crushSelect" class="ff-input"></select><button class="fx-btn" onclick="crushRun(false)">'+zic('trash',14)+' Crush</button></div><label style="display:flex;align-items:center;gap:7px;font-size:.68rem;font-weight:700;color:var(--muted);margin-top:9px"><input type="checkbox" id="crushHard"> Hard delete rows (skip release)</label><div style="margin-top:9px"><button class="fx-btn" style="background:linear-gradient(135deg,#ef4444,#b91c1c)" onclick="crushOrphansAll()">🧹 Crush All Orphans</button> <span style="font-size:.64rem;color:var(--muted);font-weight:700">deletes ONLY rows absent from LaMix mirror</span></div><div id="crushMsg" class="ff-msg"></div></div>';
wrap.appendChild(d); }
function chipRow(id,label,sub,checked,kind){ return '<label style="display:flex;align-items:center;gap:8px;padding:7px 9px;border:1px solid var(--border);border-radius:10px;margin-bottom:6px;background:var(--surface);cursor:pointer"><input type="checkbox" '+(checked?'checked':'')+' onchange="bulkToggle(\''+kind+'\',\''+escH(id)+'\',this.checked)" style="accent-color:var(--accent)"><span style="flex:1;min-width:0;font-size:.76rem;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escH(label)+'</span><span style="font-size:.62rem;font-weight:800;color:var(--accent)">'+escH(sub)+'</span></label>'; }
window.bulkToggle=function(kind,id,on){ var arr=kind==='r'?BULK.ranges:BULK.users; var i=arr.indexOf(id); if(on&&i<0)arr.push(id); if(!on&&i>-1)arr.splice(i,1); bulkSelInfo(); };
function bulkSelInfo(){ var el=document.getElementById('bulkSelInfo'); if(el) el.textContent=BULK.ranges.length+' range(s) · '+BULK.users.length+' user(s) · '+BULK.perRange+' per range'; }
window.renderBulkRanges=function(){ var q=(document.getElementById('bulkRangeSearch').value||'').toLowerCase(); var box=document.getElementById('bulkRangeList'); if(!box)return; box.innerHTML=BULK.allRanges.filter(function(r){return !q||r.name.toLowerCase().indexOf(q)>-1;}).map(function(r){ return chipRow(r.range_id,r.name,(r.unassigned||0)+' free',BULK.ranges.indexOf(String(r.range_id))>-1,'r'); }).join('')||'<div style="font-size:.72rem;color:var(--muted)">No ranges with free numbers</div>'; };
window.renderBulkUsers=function(){ var q=(document.getElementById('bulkUserSearch').value||'').toLowerCase(); var box=document.getElementById('bulkUserList'); if(!box)return; box.innerHTML=BULK.allUsers.filter(function(u){return !q||u.username.toLowerCase().indexOf(q)>-1;}).map(function(u){ return chipRow(u.username,u.username,u.team||'',BULK.users.indexOf(u.username)>-1,'u'); }).join('')||'<div style="font-size:.72rem;color:var(--muted)">No users</div>'; };
function loadBulkData(){ ppPost('/admin/bulk-ranges',{}).then(function(d){ BULK.allRanges=(d&&d.ranges)||[]; renderBulkRanges(); bulkSelInfo(); }); ppPost('/admin/my-clients',{}).then(function(d){ var u=[]; ((d&&d.teams)||[]).forEach(function(t){ (t.clients||[]).forEach(function(c){ u.push({username:c.username,team:t.prefix||''}); }); }); BULK.allUsers=u; renderBulkUsers(); }); }
window.bulkStart=function(){
var qEl=document.getElementById('bulkQty');
BULK.perRange=Math.max(1,Math.min(1000,parseInt((qEl&&qEl.value)||'0',10)||0));
if(!BULK.perRange){ limMsg('Enter numbers per user (1-1000)',false); return; }
if(!BULK.ranges.length||!BULK.users.length){ limMsg('Select at least 1 range and 1 user',false); return; }
zconfirm('TARGETS: '+BULK.users.join(', ')+'\n\nEach target receives '+BULK.perRange+' numbers from EACH of the '+BULK.ranges.length+' selected range(s).\n\nCheck the list above carefully before confirming.', function(){
ppPost('/admin/bulk-queue',{rangeIds:BULK.ranges,users:BULK.users,perRange:BULK.perRange}).then(function(d){
if(!d||!d.ok){ limMsg((d&&d.error)||'Queue failed',false); return; }
limMsg((d.queued||0)+' batches → '+String(d.plan||'').slice(0,140),true);
if(typeof showToast==='function') showToast('Queued into Shipping Dock','success');
BULK.ranges.length=0; BULK.users.length=0;
if(typeof renderBulkRanges==='function') renderBulkRanges();
if(typeof renderBulkUsers==='function') renderBulkUsers();
if(typeof bulkSelInfo==='function') bulkSelInfo();
if(qEl) qEl.value='';
if(typeof loadDock==='function') loadDock(true);
});
},{icon:zic('zap',34),yesText:'Queue Bulk'});
};
/* ── CRUSHER v2 (robust reload) + per-user info line ── */
function bulkSelInfo(){ var el=document.getElementById('bulkSelInfo'); var qv=parseInt((document.getElementById('bulkQty')||{}).value,10)||0; if(el) el.textContent=BULK.ranges.length+' range(s) · '+BULK.users.length+' user(s) · '+qv+' each per range'; }
window.crushLoad=function(){
var box=document.getElementById('crushSuggest'); var sel=document.getElementById('crushSelect');
if(!sel) return;
sel.innerHTML='<option value="">Loading…</option>';
ppPost('/admin/crush-options',{}).then(function(d){
var opts=(d&&d.options)||[];
sel.innerHTML=opts.length? opts.map(function(o){ return '<option value="'+escH(o.range_name)+'" data-id="'+escH(o.range_id||'')+'">'+escH(o.range_name)+' — '+o.count+' rows'+(o.gone?' · GONE FROM LAMIX':'')+'</option>'; }).join('') : '<option value="">No allocated ranges in DB</option>';
if(box){ var s=(d&&d.suggestions)||[]; box.innerHTML=s.length? '<div style="background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.35);border-radius:10px;padding:9px 11px;margin-bottom:10px;font-size:.7rem;font-weight:700;color:var(--text)">'+zic('alert',13)+' Vanished from LaMix:'+s.map(function(x){ return '<div style="display:flex;align-items:center;gap:7px;margin-top:6px"><span style="flex:1">'+escH(x.range_name)+' · '+x.rows_alive+' rows</span><button class="ff-ibtn on" onclick="crushRun(false,\''+escH(x.range_name)+'\')">'+zic('trash',11)+' Crush</button><button class="ff-ibtn" onclick="crushDismiss('+x.id+')">'+zic('x',11)+'</button></div>'; }).join('')+'</div>':''; }
}).catch(function(){ sel.innerHTML='<option value="">Load failed — reopen page</option>'; });
};
window.crushRun=function(hardForce,name){
var sel=document.getElementById('crushSelect');
var nm=name||(sel&&sel.value)||'';
var rid=''; if(!name&&sel&&sel.selectedOptions&&sel.selectedOptions[0]) rid=sel.selectedOptions[0].getAttribute('data-id')||'';
var hard=!!hardForce||((document.getElementById('crushHard')||{}).checked);
if(!nm||nm.indexOf('Loading')===0||nm.indexOf('No allocated')===0){ limMsg('Pick a range first',false); return; }
zconfirm('Are you sure you want to CRUSH <b>'+escH(nm)+'</b>?<br>All its rows will be removed from our DB and every user will be notified.', function(){
ppPost('/admin/range-crush',{rangeName:nm,rangeId:rid,hard:hard}).then(function(d){
if(d&&d.ok){ limMsg((d.crushed||0)+' rows crushed for '+nm,true); if(typeof showToast==='function') showToast('Crushed '+nm,'success'); crushLoad(); }
else limMsg((d&&d.error)||'Crush failed',false);
});
},{icon:zic('trash',34),yesText:'Yes, Crush',noText:'Cancel'});
};
window.crushOrphansAll=function(){ zconfirm('Delete ALL orphan rows (in DB but NOT in LaMix)?', function(){ ppPost('/admin/crush-orphans',{}).then(function(d){ if(d&&d.ok){ limMsg('Orphans deleted: '+(d.deleted||0),true); crushLoad(); } else limMsg((d&&d.error)||'Failed',false); }); },{icon:zic('trash',34),yesText:'Crush Orphans'}); };
window.crushDismiss=function(id){ ppPost('/admin/crush-dismiss',{id:id}).then(function(){ crushLoad(); }); };
(function(){ var _ol=window.openLimitPage; window.openLimitPage=function(){ if(_ol)_ol(); setTimeout(function(){ try{ crushLoad(); }catch(e){} }, 300); }; })();


/* ── RECONCILIATION CARD ── */
function ensureReconCard(){ if(document.getElementById('reconCard'))return; var p=document.getElementById('limitPage'); if(!p)return; var wrap=p.querySelector('.fx-wrap'); if(!wrap)return; var d=document.createElement('div'); d.id='reconCard'; d.className='fx-card'; d.style.marginTop='14px';
d.innerHTML='<div class="fx-card-t">'+zic('chart',15)+'LaMix ↔ DB Reconciliation</div><div class="fx-hint">Live mirror vs user_numbers. Orphans = in DB not in LaMix · Missing = in LaMix not in DB.</div><div id="reconGrid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px"></div><div id="reconMeta" style="font-size:.66rem;color:var(--muted);margin-top:8px;font-weight:700"></div><div class="fx-row" style="margin-top:10px"><button class="fx-btn" onclick="reconSyncNow()">'+zic('refresh',14)+' Run Full Sync</button><button class="fx-btn" style="background:var(--surface);color:var(--text)" onclick="loadRecon()">'+zic('refresh',14)+' Refresh</button></div><div id="reconMsg" class="ff-msg"></div>';
wrap.appendChild(d); }
window.loadRecon=function(){ var g=document.getElementById('reconGrid'); if(!g)return; g.innerHTML='<div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:10px">Loading…</div>'; ppPost('/admin/reconcile-status',{}).then(function(d){ if(!d||!d.ok){g.innerHTML='<div style="grid-column:1/-1;color:var(--red)">'+((d&&d.error)||'Failed')+'</div>';return;}
function cell(k,v){return '<div class="ff-stat"><div><div class="ff-stat-v">'+v+'</div><div class="ff-stat-k">'+k+'</div></div></div>';}
g.innerHTML=cell('LaMix assigned',d.mirror_assigned)+cell('DB active',d.db_assigned)+cell('Orphans',d.orphans)+cell('Missing',d.missing);
var m=document.getElementById('reconMeta'); if(m)m.textContent='Last sync: '+(d.last_sync||'never')+' · '+(d.orphans===0&&d.missing===0?'✅ in sync':'⚠️ drift');
}); };
window.reconSyncNow=function(){ zconfirm('Run FULL LaMix numbers sync now (~3 min, pauses boats)?',function(){ ppPost('/admin/numsync-run',{}).then(function(d){ var msg=document.getElementById('reconMsg'); if(msg){msg.style.display='block';msg.textContent=d&&d.ok?'Sync started — refresh in ~3 min.':((d&&d.error)||'Failed');msg.style.color=d&&d.ok?'var(--green)':'var(--red)';} }); },{icon:zic('refresh',34),yesText:'Run Sync'}); };
(function(){ var _ol2=window.openLimitPage; window.openLimitPage=function(){ if(_ol2)_ol2(); setTimeout(function(){ try{ ensureReconCard(); loadRecon(); }catch(e){} },350); }; })();
/* ── TEAM REPORT ── */
  var _trData=null;
  window.openTeamReport=function(){ var p=document.getElementById('teamReportPage'); if(p){p.style.display='block';window.scrollTo(0,0);loadTeamReport(false);loadTeamBonus();} };
  window.closeTeamReport=function(){ var p=document.getElementById('teamReportPage'); if(p)p.style.display='none'; };
  window.loadTeamReport=function(force){ var box=document.getElementById('trList'); if(box)box.innerHTML='<div style="text-align:center;color:var(--muted);padding:18px"><div class="spinner" style="width:22px;height:22px;margin:0 auto 8px"></div>Crunching team OTPs…</div>'; fetch('/api/admin/team-report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess(),force:!!force})}).then(function(r){return r.json();}).then(function(d){ if(!d||!d.ok){if(box)box.innerHTML='<div style="color:var(--red);padding:14px;text-align:center">'+((d&&d.error)||'Failed')+'</div>';return;} _trData=d; renderReport(d); }).catch(function(){if(box)box.innerHTML='<div style="color:var(--red);padding:14px;text-align:center">Connection error</div>';}); };
  function renderReport(d){ var sub=document.getElementById('trSub'); if(sub)sub.textContent=(d.date||'')+' · '+(d.cached?'cached':'fresh'); var hot=document.getElementById('trHot'); if(hot){ if(d.hottest){hot.style.display='block';hot.innerHTML='<div class="ff-hot"><span class="zicw h-y" style="width:26px;height:26px">'+zic('flame',14)+'</span><span>Hottest team today: <b>'+escH(d.hottest.prefix||d.hottest.label||'System Generated')+'</b> · '+d.hottest.otpToday+' OTPs</span></div>';} else hot.style.display='none'; } var box=document.getElementById('trList'); if(!box)return; var teams=d.teams||[]; if(!teams.length){box.innerHTML='<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:18px;text-align:center;color:var(--muted)">No teams yet.</div>';return;} var max=Math.max(1,teams.reduce(function(m,t){return Math.max(m,t.otpToday||0);},0)); var h=''; teams.forEach(function(t){ var pct=Math.round(((t.otpToday||0)/max)*100); var title=t.prefix?escH(t.prefix):'<span style="color:var(--muted)">'+escH(t.label||'System Generated')+'</span>'; h+='<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin-bottom:8px"><div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><div style="flex:1;min-width:0;font-size:.86rem;font-weight:800;color:var(--text)">'+title+(t.admin&&t.admin!=='—'?' <span style="color:var(--muted);font-weight:600;font-size:.66rem">'+escH(t.admin)+'</span>':'')+'</div><div style="text-align:right"><div style="font-size:1.2rem;font-weight:700;color:var(--accent);line-height:1">'+(t.otpToday||0)+'</div><div style="font-size:.55rem;color:var(--muted)">today</div></div></div><div style="height:5px;background:var(--border);border-radius:3px;overflow:hidden;margin-bottom:8px"><div style="height:5px;width:'+pct+'%;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:3px"></div></div><div style="display:flex;gap:14px;font-size:.66rem;color:var(--muted);font-weight:700"><span class="ff-meta">'+zic('cal',11)+' week: <b style="color:var(--text)">'+(t.otpWeek||0)+'</b></span><span class="ff-meta">'+zic('users',11)+' clients: <b style="color:var(--text)">'+(t.clients||0)+'</b></span></div></div>'; }); box.innerHTML=h; }
  window.copyTeamReport=function(){ if(!_trData||!_trData.teams){if(typeof showToast==='function')showToast('Load the report first','error');return;} var lines=['Zamil SMS — Team OTP Report ('+(_trData.date||'')+')','']; _trData.teams.forEach(function(t){lines.push((t.prefix||t.label||'System Generated')+' ('+t.admin+'):  today '+(t.otpToday||0)+' · week '+(t.otpWeek||0)+' · clients '+(t.clients||0));}); if(_trData.hottest)lines.push('','Hottest today: '+(_trData.hottest.prefix||_trData.hottest.label||'System Generated')+' ('+_trData.hottest.otpToday+' OTPs)'); try{navigator.clipboard&&navigator.clipboard.writeText(lines.join('\n'));if(typeof showToast==='function')showToast('Team report copied','success');}catch(e){} };

  /* ── BONUS TARGET ── */
  function ensureBonusCard(){ if(document.getElementById('bonusTargetCard'))return; var inner=document.querySelector('#adminPage > div'); if(!inner)return; inner.insertAdjacentHTML('beforeend','<div id="bonusTargetCard" style="margin-top:18px;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px"><div style="font-size:.8rem;font-weight:800;margin-bottom:4px;display:flex;align-items:center;gap:6px">'+zic('target',14)+' Bonus Target</div><div id="btBody" style="font-size:.74rem;color:var(--muted)">Loading…</div></div>'); }
  function renderTargetCard(){ ensureBonusCard(); var body=document.getElementById('btBody'); if(!body)return; body.innerHTML='Loading…'; var roleP=fetch('/api/auth/role',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess()})}).then(function(r){return r.json();}); var cfgP=fetch('/api/admin/target-get',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess()})}).then(function(r){return r.json();}); Promise.all([roleP,cfgP]).then(function(rs){ var role=(rs[0]&&rs[0].ok)?rs[0].role:'none'; var cfg=(rs[1]&&rs[1].ok)?rs[1].config:null; if(role==='super'){ var p=cfg||{}; body.innerHTML='<div style="font-size:.62rem;color:var(--muted);margin-bottom:10px">Reward the top teams that hit the OTP target.</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px"><select id="btPeriod" style="'+INP+'"><option value="daily"'+(p.period!=='weekly'?' selected':'')+'>Daily</option><option value="weekly"'+(p.period==='weekly'?' selected':'')+'>Weekly</option></select><input id="btTarget" type="number" min="1" placeholder="Target OTPs" value="'+(p.target_otps||'')+'" style="'+INP+'"><input id="btReward" type="number" step="0.01" min="0" placeholder="Reward $" value="'+(p.reward_usd!=null?p.reward_usd:'')+'" style="'+INP+'"><input id="btTopN" type="number" min="1" placeholder="Top N" value="'+(p.top_n||'')+'" style="'+INP+'"></div><input id="btNote" type="text" placeholder="Note (optional)" value="'+escH(p.note||'')+'" style="'+INP+';width:100%;margin-bottom:8px"><button onclick="saveTarget()" style="font-size:.78rem;font-weight:800;color:#fff;background:linear-gradient(135deg,var(--accent),var(--accent2));border:0;border-radius:9px;padding:9px 16px;cursor:pointer">Save Target</button><div id="btMsg" style="font-size:.72rem;font-weight:700;margin-top:8px;display:none"></div>'; } else { if(!cfg){body.innerHTML='<div style="color:var(--muted)">No bonus target set yet.</div>';return;} body.innerHTML='<div style="font-size:.82rem;font-weight:700;color:var(--text);display:flex;align-items:center;gap:6px;flex-wrap:wrap">'+zic('target',15)+' '+escH(String(cfg.target_otps))+' OTPs → <span style="color:var(--accent)">$'+Number(cfg.reward_usd).toFixed(2)+'</span> <span style="color:var(--muted);font-weight:600">(top '+escH(String(cfg.top_n))+' · '+escH(cfg.period)+')</span></div>'+(cfg.note?'<div style="font-size:.7rem;color:var(--muted);margin-top:4px">'+escH(cfg.note)+'</div>':''); } }).catch(function(){body.innerHTML='<div style="color:var(--red)">Failed to load.</div>';}); }
  window.saveTarget=function(){ var msg=document.getElementById('btMsg'); function show(t,good){if(msg){msg.style.display='block';msg.textContent=t;msg.style.color=good?'var(--green)':'var(--red)';}} fetch('/api/admin/target-set',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess(),period:document.getElementById('btPeriod').value,target_otps:document.getElementById('btTarget').value,reward_usd:document.getElementById('btReward').value,top_n:document.getElementById('btTopN').value,note:document.getElementById('btNote').value})}).then(function(r){return r.json();}).then(function(d){ if(d&&d.ok){show('Target saved',true);if(typeof showToast==='function')showToast('Bonus target saved','success');} else show((d&&d.error)||'Failed',false); }).catch(function(){show('Connection error',false);}); };
  window.loadTeamBonus=function(){ var list=document.getElementById('trList'); if(!list)return; var slot=document.getElementById('trBonusSlot'); if(!slot){slot=document.createElement('div');slot.id='trBonusSlot';slot.style.marginBottom='12px';list.parentNode.insertBefore(slot,list);} slot.innerHTML=''; fetch('/api/admin/team-bonus',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sess()})}).then(function(r){return r.json();}).then(function(d){ if(!d||!d.ok||!d.config){slot.innerHTML='';return;} var c=d.config,isSuper=(d.role==='super'); var h='<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px 14px"><div style="font-size:.78rem;font-weight:800;color:var(--text);margin-bottom:8px;display:flex;align-items:center;gap:6px">'+zic('target',14)+' Target: '+escH(String(c.target_otps))+' OTPs → <span style="color:var(--accent)">$'+Number(c.reward_usd).toFixed(2)+'</span> <span style="color:var(--muted);font-weight:600">(top '+escH(String(c.top_n))+' · '+escH(c.period)+')</span></div>'; if(!isSuper){ (d.myTeams||[]).forEach(function(t){ if(t.congrats){h+='<div style="background:linear-gradient(135deg,rgba(52,211,153,.16),rgba(34,211,238,.12));border:1px solid rgba(52,211,153,.35);border-radius:10px;padding:10px 12px;margin-bottom:6px;font-size:.8rem;font-weight:700;color:var(--text);display:flex;align-items:center;gap:7px">'+zic('check',15)+' Congratulations! <b>'+escH(t.prefix||'Your team')+'</b> hit the target — Bonus: <span style="color:var(--accent)">$'+Number(t.reward).toFixed(2)+'</span>!</div>';} else if(t.qualified){h+='<div style="background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.25);border-radius:10px;padding:10px 12px;margin-bottom:6px;font-size:.78rem;font-weight:700;color:var(--text);display:flex;align-items:center;gap:7px">'+zic('check',15)+' <b>'+escH(t.prefix||'Your team')+'</b> is on the bonus board — $'+Number(t.reward).toFixed(2)+' earned.</div>';} else {var pct=Math.min(100,Math.round((t.otps/(c.target_otps||1))*100));h+='<div style="margin-bottom:6px"><div style="font-size:.72rem;font-weight:700;color:var(--muted);margin-bottom:4px;display:flex;align-items:center;gap:5px">'+zic('flame',12)+' '+escH(t.prefix||'Your team')+': '+t.otps+' / '+c.target_otps+' OTPs to the $'+Number(c.reward_usd).toFixed(2)+' bonus</div><div style="height:5px;background:var(--border);border-radius:3px;overflow:hidden"><div style="height:5px;width:'+pct+'%;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:3px"></div></div></div>';} }); } var leaders=(d.leaders||[]).filter(function(t){return t.qualified;}).slice(0,c.top_n||5); if(leaders.length){ h+='<div style="font-size:.62rem;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin:8px 0 6px">Bonus qualifiers</div>'; leaders.forEach(function(t){h+='<div style="display:flex;align-items:center;gap:8px;padding:5px 2px;border-bottom:1px solid var(--border);font-size:.76rem"><span style="font-weight:800;color:var(--accent);width:24px">#'+t.rank+'</span><span style="flex:1;font-weight:700;color:var(--text)">'+escH(t.prefix)+(t.label?' <span style="color:var(--muted);font-weight:600">'+escH(t.label)+'</span>':'')+'</span><span style="font-weight:800;color:var(--text)">'+t.otps+'</span></div>';}); } else if(isSuper){h+='<div style="font-size:.72rem;color:var(--muted)">No team has hit the target yet.</div>';} h+='</div>'; slot.innerHTML=h; }).catch(function(){slot.innerHTML='';}); };

  /* ── MOTIVATIONAL NUDGE ── */
  function startNudge(){ var FIRST=120000,EVERY=900000; var MSGS=['Great work — keep it up!','You are on a roll!','Mashallah, excellent progress!','Barakallahu feek — keep going!','Small steps, big results','Your effort is paying off!','Stay focused, stay winning','Well done — the team counts on you!']; var idx=0; function show(){ try{ if(document.hidden)return; var ae=document.activeElement; if(ae&&(ae.tagName==='INPUT'||ae.tagName==='TEXTAREA'||ae.isContentEditable))return; if(typeof SESSION==='undefined'||!SESSION)return; var el=document.getElementById('motivNudge'); if(!el){el=document.createElement('div');el.id='motivNudge';document.body.appendChild(el);} el.textContent=MSGS[idx%MSGS.length];idx++; el.classList.remove('show');void el.offsetWidth;el.classList.add('show'); clearTimeout(el._t);el._t=setTimeout(function(){el.classList.remove('show');},4000); }catch(e){} } setTimeout(show,FIRST); setInterval(show,EVERY); }

  /* ── INIT ─ */
  ready(function(){ injectMarkup(); gateRole(); startNudge(); });
})();


/* ═══ ZAMIL SMS — SYSTEM COMMAND CENTER v6 (native UI, real-time graphs) ═══ */
(function () {
function sess() { return localStorage.getItem('app_session'); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>'); }
function post(p, b, cb) { fetch('/api' + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ session: sess() }, b)) }).then(r => r.json()).then(cb).catch(() => cb(null)); }

/* local icon kit (self-contained — never missing) */

   var st2 = document.createElement('style');
st2.textContent = `
.sc-cardpad{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px}
.sc-boats{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
@media(min-width:760px){.sc-boats{grid-template-columns:repeat(4,1fr)}}
.sc-boat{display:flex;align-items:center;gap:8px;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:9px 11px;transition:all .15s}
.sc-boat:active{transform:scale(.97)}
.sc-boat i{width:8px;height:8px;border-radius:50%;background:#10b981;box-shadow:0 0 8px rgba(16,185,129,.55);flex-shrink:0}
.sc-boat b{font-size:.72rem;font-weight:800;color:var(--text);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sc-boat span{font-size:.6rem;font-weight:700;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}
.sc-boat.bad{border-color:rgba(239,68,68,.35);background:rgba(239,68,68,.06)}
.sc-boat.bad i{background:#ef4444;box-shadow:0 0 8px rgba(239,68,68,.55)}
.sc-feedcard{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px}
.sc-feedcard .ff-empty2{border:1px dashed var(--border);border-radius:10px}
`;
document.head.appendChild(st2);
var SI = {
  box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  act: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="3"/><path d="M15.5 14.6a5.5 5.5 0 0 1 6 5.4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  ref: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.2l2.4 2.4 4.6-4.8"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  flame: '<path d="M12 3c1 3-3 4.5-3 8a3 3 0 0 0 6 0c0-1 .5-2 1-2.5 1.5 1.5 2.2 3.5 2.2 5a6.2 6.2 0 1 1-12.4 0c0-4 4.2-6.5 6.2-10.5z"/>',
  hash: '<path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18"/>'
};
function sic(n, s) { return '<svg class="zic" width="' + (s || 15) + '" height="' + (s || 15) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + SI[n] + '</svg>'; }

/* CSS — reuses app vars so light/dark matches Statistics page */
var st = document.createElement('style');
st.textContent = `
#sccOverlay{position:fixed;inset:0;z-index:9980;background:var(--bg,#eef2f7);display:none;overflow-y:auto}
#sccOverlay.show{display:block;animation:sccIn .2s ease}
@keyframes sccIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.scc-wrap{max-width:860px;margin:0 auto;padding:12px 12px 70px}
.scc-head{display:flex;align-items:center;gap:10px;padding:6px 2px 12px;border-bottom:1px solid var(--border);margin-bottom:12px}
.scc-dot{width:10px;height:10px;border-radius:50%;background:var(--green,#10b981);box-shadow:0 0 10px var(--green,#10b981);animation:sccP 2s infinite;flex-shrink:0}
.scc-dot.warn{background:#f59e0b;box-shadow:0 0 10px #f59e0b}.scc-dot.crit{background:#ef4444;box-shadow:0 0 10px #ef4444}
@keyframes sccP{0%,100%{opacity:1}50%{opacity:.5}}
.scc-tt{flex:1;min-width:0}.scc-tt b{font-size:1rem;font-weight:800;color:var(--text);display:block}
.scc-tt span{font-size:.62rem;color:var(--muted)}
.scc-banner{display:flex;align-items:center;gap:10px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.35);border-radius:12px;padding:10px 12px;margin-bottom:12px;font-size:.74rem;font-weight:700;color:var(--text)}
.scc-banner>div{flex:1;line-height:1.45}
#sccGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}
@media(min-width:760px){#sccGrid{grid-template-columns:repeat(3,1fr)}}
.sc-card{display:flex;align-items:center;gap:10px;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:11px 12px}
.sc-sub{font-size:.58rem;color:var(--muted);margin-top:3px;display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.sc-badge{display:inline-flex;font-size:.52rem;font-weight:800;padding:2px 7px;border-radius:10px}
.sc-badge.ok{background:rgba(16,185,129,.14);color:#047857}.sc-badge.warn{background:rgba(245,158,11,.16);color:#b45309}.sc-badge.crit{background:rgba(239,68,68,.14);color:#be123c}
[data-theme="dark"] .sc-badge.ok{color:#6ee7b7}[data-theme="dark"] .sc-badge.warn{color:#fde68a}[data-theme="dark"] .sc-badge.crit{color:#fda4af}
.sc-2col{display:grid;grid-template-columns:1fr;gap:8px;margin-bottom:8px}
@media(min-width:760px){.sc-2col{grid-template-columns:1fr 1fr}}
.sc-chart{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:10px 12px}
.sc-chart-t{display:flex;align-items:center;gap:6px;font-size:.6rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
.sc-chart-t b{margin-left:auto;color:var(--text);font-size:.72rem}
.sc-secl{display:flex;align-items:center;gap:6px;font-size:.6rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:14px 2px 8px}
.sc-chips{display:flex;gap:6px;flex-wrap:wrap}
.sc-chip{display:inline-flex;align-items:center;gap:5px;font-size:.6rem;font-weight:800;color:var(--text);background:var(--card);border:1px solid var(--border);border-radius:20px;padding:4px 10px}
.sc-chip i{width:7px;height:7px;border-radius:50%;background:var(--green,#10b981)}
.sc-chip.bad i{background:#ef4444}
.sc-grow{margin-bottom:9px}
.sc-grow-t{display:flex;justify-content:space-between;font-size:.66rem;font-weight:700;color:var(--text);margin-bottom:4px}
.sc-grow-t span{color:var(--muted)}
.sc-inc{display:flex;align-items:center;gap:8px;background:var(--card);border:1px solid var(--border);border-left:3px solid #f59e0b;border-radius:10px;padding:9px 11px;margin-bottom:7px}
.sc-inc.critical{border-left-color:#ef4444}
.sc-inc>div{flex:1;min-width:0}
.sc-inc b{font-size:.74rem;font-weight:800;color:var(--text);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sc-inc span{font-size:.6rem;color:var(--muted)}
.scc-badge-btn{min-width:16px;height:16px;border-radius:8px;background:#ef4444;color:#fff;font-size:.55rem;font-weight:800;display:none;align-items:center;justify-content:center;padding:0 4px;margin-left:auto}
`;
document.head.appendChild(st);

var isOpen = false, pollT = null, lastData = null, loading = false;

function closeDrawerSafe() {
  try {
    if (typeof window.closeDrawer === 'function') { window.closeDrawer(); return; }
    var ids = ['drawerClose', 'drawerCloseBtn', 'closeDrawerBtn', 'drawerX'];
    for (var i = 0; i < ids.length; i++) { var b = document.getElementById(ids[i]); if (b) { b.click(); return; } }
    var ov = document.getElementById('drawerOverlay') || document.getElementById('drawerBackdrop');
    if (ov) ov.click();
  } catch (e) {}
}

/* ── SVG chart builders (real axes, proportional X/Y) ── */
function lineChart(vals, color) {
  var W = 300, H = 92, L = 26, R = 8, T = 8, B = 16;
  var max = Math.max.apply(null, vals.concat([1]));
  var iw = W - L - R, ih = H - T - B, n = vals.length;
  var X = function (i) { return L + i * (iw / (n - 1)); };
  var Y = function (v) { return T + ih - (v / max) * ih; };
  var d = '', grid = '';
  vals.forEach(function (v, i) { d += (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(v).toFixed(1) + ' '; });
  [0, 0.5, 1].forEach(function (f) {
    var y = (T + ih - f * ih).toFixed(1);
    grid += '<line x1="' + L + '" y1="' + y + '" x2="' + (W - R) + '" y2="' + y + '" style="stroke:var(--border)" stroke-width="1"/>' +
            '<text x="' + (L - 4) + '" y="' + (+y + 2.5) + '" text-anchor="end" font-size="7" style="fill:var(--muted)">' + Math.round(f * max) + '</text>';
  });
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;display:block">' + grid +
    '<path d="' + d + 'L' + X(n - 1).toFixed(1) + ',' + (T + ih) + ' L' + X(0).toFixed(1) + ',' + (T + ih) + ' Z" style="fill:' + color + ';opacity:.12"/>' +
    '<path d="' + d + '" fill="none" style="stroke:' + color + '" stroke-width="2" stroke-linecap="round"/>' +
    '<text x="' + L + '" y="' + (H - 3) + '" font-size="7" style="fill:var(--muted)">-60m</text>' +
    '<text x="' + (W - R) + '" y="' + (H - 3) + '" text-anchor="end" font-size="7" style="fill:var(--muted)">now</text></svg>';
}
function barChart(a, b) {
  var W = 300, H = 110, max = Math.max(a, b, 1), ih = 64, y0 = 90;
  var hA = Math.max(4, Math.round((b / max) * ih)), hB = Math.max(4, Math.round((a / max) * ih));
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;display:block">' +
    '<line x1="10" y1="' + y0 + '" x2="' + (W - 10) + '" y2="' + y0 + '" style="stroke:var(--border)"/>' +
    '<rect x="70" y="' + (y0 - hA) + '" width="52" height="' + hA + '" rx="6" style="fill:var(--muted);opacity:.45"/>' +
    '<rect x="180" y="' + (y0 - hB) + '" width="52" height="' + hB + '" rx="6" style="fill:var(--accent)"/>' +
    '<text x="96" y="' + (y0 - hA - 6) + '" text-anchor="middle" font-size="9" font-weight="800" style="fill:var(--text)">' + b + '</text>' +
    '<text x="206" y="' + (y0 - hB - 6) + '" text-anchor="middle" font-size="9" font-weight="800" style="fill:var(--accent)">' + a + '</text>' +
    '<text x="96" y="' + (H - 4) + '" text-anchor="middle" font-size="7.5" style="fill:var(--muted)">Yesterday</text>' +
    '<text x="206" y="' + (H - 4) + '" text-anchor="middle" font-size="7.5" style="fill:var(--muted)">Today</text></svg>';
}

function dualChart(a, b) {
  var W = 300, H = 92, L = 26, R = 8, T = 8, B = 16;
  var max = Math.max.apply(null, a.concat(b, [1]));
  var iw = W - L - R, ih = H - T - B, n = Math.max(a.length, 2);
  var X = function (i) { return L + i * (iw / (n - 1)); };
  var Y = function (v) { return T + ih - (v / max) * ih; };
  var grid = '';
  [0, 0.5, 1].forEach(function (f) { var y = (T + ih - f * ih).toFixed(1); grid += '<line x1="' + L + '" y1="' + y + '" x2="' + (W - R) + '" y2="' + y + '" style="stroke:var(--border)" stroke-width="1"/><text x="' + (L - 4) + '" y="' + (+y + 2.5) + '" text-anchor="end" font-size="7" style="fill:var(--muted)">' + Math.round(f * max) + '</text>'; });
  var path = function (vals) { var d = ''; vals.forEach(function (v, i) { d += (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(v).toFixed(1) + ' '; }); return d; };
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;display:block">' + grid +
    '<path d="' + path(a) + '" fill="none" style="stroke:#22d3ee" stroke-width="2" stroke-linecap="round"/>' +
    '<path d="' + path(b) + '" fill="none" style="stroke:#8b5cf6" stroke-width="2" stroke-linecap="round" stroke-dasharray="4 3"/>' +
    '<text x="' + L + '" y="' + (H - 3) + '" font-size="7" style="fill:var(--muted)">-60m</text><text x="' + (W - R) + '" y="' + (H - 3) + '" text-anchor="end" font-size="7" style="fill:var(--muted)">now</text></svg>';
}
   
function gbar(label, valText, pct, color) {
  return '<div class="sc-grow"><div class="sc-grow-t"><span>' + label + '</span><b>' + valText + '</b></div>' +
    '<div class="ff-bar"><i style="width:' + Math.min(100, Math.max(2, pct)) + '%;background:' + color + '"></i></div></div>';
}

function ensureOverlay() {
  if (document.getElementById('sccOverlay')) return;
  var d = document.createElement('div');
  d.id = 'sccOverlay';
  d.innerHTML =
    '<div class="scc-wrap">' +
    '<div class="scc-head"><span class="scc-dot" id="sccDot"></span>' +
    '<div class="scc-tt"><b>System Command Center <span class="sc-badge ok" id="sccScore" style="margin-left:4px"></span></b><span id="sccUpd">Real-time backend monitor</span></div>' + 
    '<button class="ff-ibtn" id="sccRefresh">' + sic('ref', 12) + ' Refresh</button>' +
    '<button class="ff-ibtn" id="sccClose">' + sic('x', 12) + ' Close</button></div>' +
    '<div id="sccBannerSlot"></div>' +
    '<div id="sccGrid">' +
    '<div class="sc-card"><span class="zicw h-b">' + sic('box', 16) + '</span><div><div class="ff-stat-v" id="sQ">—</div><div class="ff-stat-k">Alloc Queue</div><div class="sc-sub" id="sQs">—</div></div></div>' +
    '<div class="sc-card"><span class="zicw h-r">' + sic('zap', 16) + '</span><div><div class="ff-stat-v" id="sC">—</div><div class="ff-stat-k">CDR Stream</div><div class="sc-sub" id="sCs">—</div></div></div>' +
    '<div class="sc-card"><span class="zicw h-g">' + sic('act', 16) + '</span><div><div class="ff-stat-v" id="sB">—</div><div class="ff-stat-k">Daemons</div><div class="sc-sub" id="sBs">—</div></div></div>' +
    '<div class="sc-card"><span class="zicw h-m">' + sic('cpu', 16) + '</span><div><div class="ff-stat-v" id="sL">—</div><div class="ff-stat-k">API Load / min</div><div class="sc-sub" id="sLs">—</div></div></div>' +
    '<div class="sc-card"><span class="zicw h-b">' + sic('users', 16) + '</span><div><div class="ff-stat-v" id="sU">—</div><div class="ff-stat-k">Users Online</div><div class="sc-sub" id="sUs">—</div></div></div>' +
    '<div class="sc-card"><span class="zicw h-y">' + sic('clock', 16) + '</span><div><div class="ff-stat-v" id="sT">—</div><div class="ff-stat-k">Avg Queue Clear</div><div class="sc-sub" id="sTs">—</div></div></div>' +
    '</div>' +
    '<div class="sc-2col">' +
    '<div class="sc-chart"><div class="sc-chart-t">' + sic('chart', 12) + ' API Traffic (5-min) <b id="cLb"></b></div><div id="cLoad"></div></div>' +
    '<div class="sc-chart"><div class="sc-chart-t">' + sic('zap', 12) + ' OTP Intake (5-min) <b id="cCb"></b></div><div id="cCdr"></div></div>' +
    '</div>' +
    '<div class="sc-2col">' +
    '<div class="sc-chart"><div class="sc-chart-t">' + sic('cal', 12) + ' Daily OTP Comparison <b id="cDb"></b></div><div id="cDaily"></div></div>' +
    '<div class="sc-chart"><div class="sc-chart-t">' + sic('flame', 12) + ' Growth Metrics</div><div id="cGrow"></div></div>' +
    '</div>' +
    '<div class="sc-chart" style="margin-bottom:8px"><div class="sc-chart-t">' + sic('chart', 12) + ' System Load · API vs Users <b id="cSLb"></b></div><div id="cSys"></div>' +
    '<div style="display:flex;gap:14px;font-size:.6rem;color:var(--muted);font-weight:700;margin-top:6px"><span style="display:inline-flex;align-items:center;gap:5px"><i style="width:12px;height:3px;background:#22d3ee;border-radius:2px"></i>API activity</span><span style="display:inline-flex;align-items:center;gap:5px"><i style="width:12px;height:3px;background:#8b5cf6;border-radius:2px"></i>Active users</span></div></div>' +
    '<div class="sc-secl">' + sic('act', 12) + ' Cron / Boat Health</div><div class="sc-cardpad"><div class="sc-boats" id="sccBoats"></div></div>' +
    '<div class="sc-secl">' + sic('alert', 12) + ' Live Incidents</div><div class="sc-feedcard"><div id="sccFeed"></div></div>' +
    '</div>';
  document.body.appendChild(d);
  document.getElementById('sccClose').onclick = function () { closeDrawerSafe(); closeSCC(); };
  document.getElementById('sccRefresh').onclick = function () { load(true); };
}

function render(d) {
  if (!d || !d.ok) return;
  lastData = d;
  var dot = document.getElementById('sccDot');
  dot.className = 'scc-dot' + (d.system.status === 'critical' ? ' crit' : d.system.status === 'warning' ? ' warn' : '');
  var scEl = document.getElementById('sccScore');
if (scEl && d.system) { var sv = d.system.score != null ? d.system.score : 100; scEl.textContent = 'Health ' + sv + '/100'; scEl.className = 'sc-badge ' + (sv >= 80 ? 'ok' : sv >= 50 ? 'warn' : 'crit'); }
  document.getElementById('sccUpd').textContent = 'Live · updated ' + new Date().toLocaleTimeString();

  // Banner: auto failure message + one-click send to all
  var bs = document.getElementById('sccBannerSlot');
  if (d.alerts && d.alerts.length) {
    bs.innerHTML = '<div class="scc-banner"><div>⚠️ ' + d.alerts.map(function (a) { return esc(a.message); }).join(' · ') + '</div>' +
      '<button class="ff-ibtn danger" onclick="sccBroadcastAll()">' + sic('bell', 12) + ' Send to All</button></div>';
  } else bs.innerHTML = '';

  // Stats
  var q = d.queue;
  document.getElementById('sQ').textContent = q.size;
  document.getElementById('sQs').innerHTML = q.size > 0
    ? 'oldest ' + q.oldestMin + 'm · ETA ~' + q.etaMins + 'm <span class="sc-badge ' + (q.size >= 100 ? 'crit' : q.size >= 50 ? 'warn' : 'ok') + '">' + (q.size >= 100 ? 'Critical' : q.size >= 50 ? 'Busy' : 'Active') + '</span>'
    : '<span class="sc-badge ok">Clear</span>';var c = d.cdr; var cst = c.status || (c.alive ? 'live' : 'dead');
document.getElementById('sC').innerHTML = cst === 'live' ? '<span style="color:#10b981">LIVE</span>' : cst === 'sleep' ? '<span style="color:#f59e0b">SLEEP</span>' : '<span style="color:#ef4444">DEAD</span>';
document.getElementById('sCs').innerHTML = c.perMin + ' OTP/min · ' + (cst === 'live' ? 'sync ' + c.lagMin + 'm ago <span class="sc-badge ok">Online</span>' : cst === 'sleep' ? 'boat polling · no OTPs yet <span class="sc-badge warn">Sleep</span>' : '<span class="sc-badge crit">Offline</span>');
  var b = d.boats;
  document.getElementById('sB').textContent = b.active + ' / ' + b.total;
  document.getElementById('sBs').innerHTML = b.active === b.total ? '<span class="sc-badge ok">All nominal</span>' : '<span class="sc-badge ' + (b.active >= 5 ? 'warn' : 'crit') + '">' + (b.total - b.active) + ' stale</span>';
  document.getElementById('sL').textContent = d.load.perMin;
  document.getElementById('sLs').textContent = d.load.lastHour + ' calls last hour';
  document.getElementById('sU').textContent = d.users.online;
  var ul = (d.users.list || []).map(function (x) { return x.u; }); document.getElementById('sUs').innerHTML = (ul.length ? '<b style="color:var(--text)">' + esc(ul.slice(0, 2).join(', ')) + (ul.length > 2 ? ' +' + (ul.length - 2) : '') + '</b> · ' : '') + 'expected ' + d.users.expected;
  document.getElementById('sT').textContent = q.avgDoneMin + 'm';
  document.getElementById('sTs').textContent = q.size ? '⚙️ processing ' + q.size + ' batches now' : 'dock idle';

  // Charts (real series)
  document.getElementById('cLoad').innerHTML = lineChart(d.load.buckets, '#22d3ee');
  document.getElementById('cLb').textContent = d.load.perMin + '/min';
  document.getElementById('cCdr').innerHTML = lineChart(d.cdr.buckets, '#10b981');
  document.getElementById('cCb').textContent = d.cdr.perMin + '/min';
  document.getElementById('cSys').innerHTML = dualChart(d.load.buckets, d.load.users || []);
document.getElementById('cSLb').textContent = d.load.perMin + '/min · ' + d.users.online + ' online';
  document.getElementById('cDaily').innerHTML = barChart(d.daily.today, d.daily.yesterday);
  document.getElementById('cDb').textContent = (d.daily.growthPct >= 0 ? '+' : '') + d.daily.growthPct + '%';

  // 3 growth bars (all real)
  var g = d.daily, n = d.numbers;
  var trafficPct = Math.max(g.today, g.yesterday) ? Math.round((g.today / Math.max(g.today, g.yesterday)) * 100) : 0;
  document.getElementById('cGrow').innerHTML =
    gbar('OTP traffic vs yesterday', (g.growthPct >= 0 ? '+' : '') + g.growthPct + '%', trafficPct, 'linear-gradient(90deg,var(--accent),var(--accent2))') +
    gbar('Number pool utilization', n.utilPct + '% (' + n.assigned + '/' + n.total + ')', n.utilPct, 'linear-gradient(90deg,#10b981,#34d399)') +
    gbar('Fleet health', b.active + '/' + b.total + ' daemons', Math.round((b.active / b.total) * 100), 'linear-gradient(90deg,#f59e0b,#fbbf24)');

  // Boat chips
  document.getElementById('sccBoats').innerHTML = b.list.map(function (x) {
    return '<div class="sc-boat' + (x.ok ? '' : ' bad') + '"><i></i><b>' + x.name + '</b><span>' + (x.agoMin == null ? 'no hb' : x.agoMin + 'm') + '</span></div>'; + (x.ok ? '' : ' bad') + '"><i></i>' + x.name + ' · ' + (x.agoMin == null ? '—' : x.agoMin + 'm') + '</span>';
  }).join('');

  // Incidents
  var feed = document.getElementById('sccFeed');
  var list = d.incidents || [];
  var badge = document.getElementById('sccBadge');
  if (badge) { badge.style.display = list.length ? 'inline-flex' : 'none'; badge.textContent = list.length; }
  if (!list.length) {
    feed.innerHTML = '<div class="ff-empty2">' + sic('check', 22) + '<div>System nominal — no pending incidents</div></div>';
  } else {
    feed.innerHTML = list.map(function (inc) {
      var mins = Math.max(1, Math.round((Date.now() - new Date(inc.created_at).getTime()) / 60000));
      return '<div class="sc-inc' + (inc.severity === 'critical' ? ' critical' : '') + '"><div><b>' + (inc.severity === 'critical' ? '🚨 ' : '⚠️ ') + esc(inc.title) + '</b><span>' + esc(inc.message) + ' · ' + mins + 'm ago</span></div>' +
        '<button class="ff-ibtn" onclick="sccBroadcast(\'' + inc.id + '\')">' + sic('bell', 11) + ' All</button>' +
        '<button class="ff-ibtn danger" onclick="sccDismissType(\'' + esc(inc.type) + '\')">' + sic('x', 11) + '</button></div>';
    }).join('');
  }
}

function load(force) {
  if (loading && !force) return;
  loading = true;
  post('/scc/status', {}, function (d) { loading = false; if (d && d.ok) render(d); });
}

window.openSCC = function () {
  closeDrawerSafe();
  ensureOverlay();
  document.getElementById('sccOverlay').classList.add('show');
  window.scrollTo(0, 0);
  isOpen = true;
  load(true);
  if (pollT) clearInterval(pollT);
  pollT = setInterval(function(){ load(false); }, 15000);
};
window.closeSCC = function () {
  var o = document.getElementById('sccOverlay');
  if (o) o.classList.remove('show');
  isOpen = false;
  if (pollT) { clearInterval(pollT); pollT = null; }
};
window.sccBroadcastAll = function () {
  if (!lastData || !lastData.alerts || !lastData.alerts.length) return;
  var msg = lastData.alerts.map(function (a) { return a.message; }).join('. ');
  zconfirm('Send system alert to <b>ALL users</b>?<div style="font-size:.72rem;color:var(--muted);margin-top:6px">' + esc(msg) + '</div>', function () {
    post('/scc/broadcast', { id: '', title: 'System Alert', message: msg }, function (d) { if (d && d.ok && typeof showToast === 'function') showToast('Alert sent to all users', 'success'); });
  }, { icon: sic('bell', 34), yesText: 'Send to All' });
};
window.sccBroadcast = function (id) {
  if (!lastData) return;
  var inc = (lastData.incidents || []).find(function (i) { return i.id == id; });
  if (!inc) return;
  zconfirm('Broadcast <b>' + esc(inc.title) + '</b> to ALL users?', function () {
    post('/scc/broadcast', { id: id, title: inc.title, message: inc.message }, function (d) { if (d && d.ok) load(true); });
  }, { icon: sic('bell', 34), yesText: 'Broadcast' });
};
window.sccDismissType = function (tp) { post('/scc/dismiss-all', { type: tp }, function () { load(true); }); };

/* drawer button */
function ensureBtn() {
  if (document.getElementById('drawerSystemBtn')) return;
  var ref = document.getElementById('drawerReportBtn');
  if (!ref) return;
  var b = document.createElement('button');
  b.id = 'drawerSystemBtn';
  b.className = ref.className;
  b.style.display = 'none';
  b.innerHTML = '<span>🛰️</span> System Center <span class="scc-badge-btn" id="sccBadge"></span>';
  b.onclick = function () { closeDrawerSafe(); openSCC(); };
  ref.parentNode.insertBefore(b, ref.nextSibling);
}
var tries = 0;
var roleT = setInterval(function () {
  tries++;
  post('/auth/role', {}, function (d) {
    if (d && d.ok && (d.role === 'admin' || d.role === 'super')) {
      ensureBtn();
      var b = document.getElementById('drawerSystemBtn');
      if (b) b.style.display = 'flex';
      clearInterval(roleT);
    } else if (tries >= 5) clearInterval(roleT);
  });
}, 800);
})();
(function(){/* recon.js loader */var s=document.createElement('script');s.src='/dashboard/recon.js?v='+Date.now();document.head.appendChild(s);})();


/* === INJECTED BY PATCH: Sync + DB Explorer Cards for Limit Increase === */
(function(){
  var _origOpenLimit = window.openLimitPage;
  window.openLimitPage = function(){
    if(_origOpenLimit) _origOpenLimit();
    setTimeout(function(){
      var p = document.getElementById('limitPage');
      if(!p || document.getElementById('dbxCard')) return;
      var w = p.querySelector('.fx-wrap');
      if(!w) return;
      var d = document.createElement('div');
      d.innerHTML = '<div class="fx-card" id="syncMiniCard" style="margin-top:14px"><div class="fx-card-t">Number Sync · Live</div><div id="syncMiniBody" style="font-size:.72rem;font-weight:700;color:var(--muted)">loading…</div><div class="ff-bar" style="margin-top:7px"><i id="syncMiniBar" style="width:0%"></i></div></div>'
      + '<div class="fx-card" id="dbxCard"><div class="fx-card-t">DB Explorer · user_numbers</div><div class="fx-hint">Pure DB view — zero LaMix calls. Compare users/ranges vs panel.</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px"><select id="dbxClient" style="flex:1;min-width:120px" class="ff-input"><option value="">All users</option></select><select id="dbxRange" style="flex:1;min-width:120px" class="ff-input"><option value="">All ranges</option></select></div><button type="button" class="fx-btn" onclick="dbxLoad()">Load from DB</button><div id="dbxOut" style="margin-top:10px;max-height:220px;overflow:auto"></div></div>';
      var cr = document.getElementById('crushCard');
      if(cr) cr.parentNode.insertBefore(d,cr); else w.appendChild(d);
      fetch('/api/admin/db-explorer', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({session:localStorage.getItem('app_session'), meta:true})}).then(function(r){return r.json();}).then(function(dd){
        if(!dd||!dd.ok)return; var c=document.getElementById('dbxClient'),r=document.getElementById('dbxRange');
        if(c)(dd.clients||[]).forEach(function(x){var o=document.createElement('option');o.value=x;o.textContent=x;c.appendChild(o);});
        if(r)(dd.ranges||[]).forEach(function(x){var o=document.createElement('option');o.value=x;o.textContent=x;r.appendChild(o);});
      });
    }, 500);
  };
  window.dbxLoad = function(){
    var out = document.getElementById('dbxOut'); if(!out) return; out.textContent='Reading DB…';
    fetch('/api/admin/db-explorer', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({session:localStorage.getItem('app_session'), client:(document.getElementById('dbxClient')||{}).value||'', range:(document.getElementById('dbxRange')||{}).value||''})}).then(function(r){return r.json();}).then(function(d){
      if(!d||!d.ok){out.textContent='failed';return;}
      var rows=d.rows||[];
      out.innerHTML = rows.length ? rows.map(function(r){return '<div style="display:flex;gap:8px;padding:6px 2px;border-bottom:1px solid var(--border);font-size:.7rem;font-weight:700"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+r.range_name+'</span><span>'+r.users+'u</span><span style="color:#16a34a">'+r.active+' act</span><span style="color:#ef4444">'+r.junk+' junk</span><span>'+r.total+' tot</span></div>';}).join('') : '<div style="color:var(--muted);font-size:.72rem;padding:8px">No rows</div>';
    });
  };
  setInterval(function(){
    var p = document.getElementById('limitPage');
    if(p && p.style.display==='block'){
      fetch('/api/admin/sync-progress', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({session:localStorage.getItem('app_session')})}).then(function(r){return r.json();}).then(function(d){
        var b=document.getElementById('syncMiniBody'), bar=document.getElementById('syncMiniBar');
        if(!b||!d||!d.prog)return; var g=d.prog, st=String(g.status||'idle').toUpperCase();
        b.innerHTML='<span style="color:'+(st==='RUNNING'?'#f59e0b':st==='DONE'?'#10b981':'var(--muted)')+'">●</span> '+st+' · '+(g.fetched||0).toLocaleString()+' / '+(g.expected||0).toLocaleString()+(g.etaSecs?' · ETA ~'+Math.floor(g.etaSecs/60)+'m '+(g.etaSecs%60)+'s':'');
        if(bar)bar.style.width=(g.expected?Math.min(100,Math.round(g.fetched/g.expected*100)):0)+'%';
      });
    }
  }, 4000);
})();
/* ══ LIMIT PAGE POLISH v2 (append-only) ══ */
(function(){
window.limitRefreshAll=function(){ try{loadBulkData();}catch(e){} try{crushLoad();}catch(e){} try{loadRecon();}catch(e){} try{if(window.dbxLoad)dbxLoad();}catch(e){} if(typeof showToast==='function')showToast('Limit page refreshed','success'); };
function collapseCrush(){ var box=document.getElementById('crushSuggest'); if(!box||box.dataset.wrapped)return; if(!box.innerHTML.trim()){box.dataset.wrapped='1';return;}
 var wrap=document.createElement('div'); wrap.style.display='none'; wrap.id='crushSugWrap'; box.parentNode.insertBefore(wrap,box); wrap.appendChild(box);
 var b=document.createElement('button'); b.type='button'; b.className='fx-btn'; b.style.cssText='background:var(--surface);color:var(--text);margin-bottom:10px'; b.textContent='\u25b8 Junk / vanished ranges \u2014 tap to open';
 b.onclick=function(){ var open=wrap.style.display!=='none'; wrap.style.display=open?'none':'block'; b.textContent=open?'\u25b8 Junk / vanished ranges \u2014 tap to open':'\u25be Hide junk / vanished ranges'; };
 box.parentNode.insertBefore(b,wrap); box.dataset.wrapped='1'; }
var GUIDE={bulkCard:'Pick ranges + users + qty. Each LaMix assign auto-splits to max 1000. Live progress lives in the Shipping Dock.',crushCard:'Crush deletes ONLY junk/vanished rows unless Hard delete is ticked. Dropdown = live active ranges; suggestions = orphans.',reconCard:'Compares pool_numbers (LaMix truth) vs user_numbers (our ledger). Orphans/Missing should stay 0.',syncMiniCard:'Full LaMix pass every ~3 min at 38 req/min. ETA counts down live.',dbxCard:'Pure local DB view \u2014 zero LaMix calls. Filter by user or range to compare counts.'};
document.addEventListener('click',function(e){ var t=e.target&&e.target.closest?e.target.closest('.fx-ibtn[title="Info"]'):null; if(!t)return; var card=t.closest('.fx-card'); if(!card)return; var h=card.querySelector('.fx-guide'); if(h){h.remove();return;} var g=GUIDE[card.id]; if(!g)return; var d=document.createElement('div'); d.className='fx-guide'; d.style.cssText='font-size:.66rem;color:var(--muted);margin:-4px 0 10px;line-height:1.5;font-weight:600'; d.textContent=g; var tt=card.querySelector('.fx-card-t'); if(tt)tt.insertAdjacentElement('afterend',d); });
function addIBtns(){ ['bulkCard','crushCard','reconCard','syncMiniCard','dbxCard'].forEach(function(id){ var c=document.getElementById(id); if(!c)return; var t=c.querySelector('.fx-card-t'); if(t&&!t.querySelector('.fx-ibtn[title="Info"]')) t.insertAdjacentHTML('beforeend','<button type="button" class="fx-ibtn" title="Info" style="margin-left:auto">i</button>'); }); }
var _ol=window.openLimitPage; window.openLimitPage=function(){ if(_ol)_ol(); setTimeout(function(){collapseCrush();addIBtns();},600); setTimeout(function(){collapseCrush();addIBtns();},1800); };
setInterval(function(){ var p=document.getElementById('limitPage'); if(p&&p.style.display==='block'){collapseCrush();addIBtns();} },5000);
})();
/* ══ UNIFORM PAGE HEADERS v2 (append-only, no HTML edits) ══ */
(function(){
var SVG_REF='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>';
var SVG_X='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
window.reloadAdmin=function(){try{loadAdmins();loadPrefixes();}catch(e){}};
window.reloadTeam=function(){try{loadMyClients(true);}catch(e){}};
window.loadTeamReportForce=function(){try{loadTeamReport(true);}catch(e){}};
var MAP={adminPage:['reloadAdmin','closeAdminPage'],limitPage:['limitRefreshAll','closeLimitPage']};
function ensureHead(pid){var p=document.getElementById(pid);if(!p)return;var head=p.querySelector('.fx-head');if(!head||head.querySelector('.fx-actions'))return;var m=MAP[pid];if(!m)return;var act=document.createElement('div');act.className='fx-actions';var b1=document.createElement('button');b1.type='button';b1.className='fx-ibtn';b1.title='Refresh';b1.innerHTML=SVG_REF;b1.onclick=function(){var f=window[m[0]];if(f)f();};var b2=document.createElement('button');b2.type='button';b2.className='fx-ibtn';b2.title='Close';b2.innerHTML=SVG_X;b2.onclick=function(){var f=window[m[1]];if(f)f();};act.appendChild(b1);act.appendChild(b2);head.appendChild(act);}
[['openStatsPage','statsPage'],['openAdminPage','adminPage'],['openLimitPage','limitPage'],['openTeamPage','teamPage'],['openTeamReport','teamReportPage']].forEach(function(pr){var orig=window[pr[0]];window[pr[0]]=function(){if(orig)orig.apply(this,arguments);setTimeout(function(){ensureHead(pr[1]);},300);};});
})();
/* ══ LIMIT PAGE HARDEN + COMPACT v3 (append-only) ══ */
(function(){
var CSS='#adminPage .fx-back,#limitPage .fx-back{display:none!important}'
+'#limitPage .fx-card{padding:12px;margin-bottom:10px}'
+'#limitPage .fx-card-t{font-size:.8rem;margin-bottom:8px}'
+'#limitPage .fx-hint{font-size:.64rem;margin:-2px 0 8px}'
+'#limitPage .fx-btn{padding:8px 12px;font-size:.74rem;border-radius:9px}'
+'#limitPage .fx-btn svg{width:12px;height:12px}'
+'#limitPage .ff-input{padding:9px 11px;font-size:.8rem}'
+'#limitPage .fx-row{gap:6px}'
+'#crushSelect{min-width:0;flex:1;font-size:.78rem;padding:9px}'
+'#limitPage .fx-ibtn{width:32px;height:32px;border-radius:9px}'
+'#limitPage .fx-ibtn svg{width:14px;height:14px}'
+'#bulkSelInfo{font-size:.62rem}';
var st=document.createElement('style');st.textContent=CSS;document.head.appendChild(st);
function jpost(p,b){return fetch('/api'+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({session:localStorage.getItem('app_session')},b))}).then(function(r){if(!r.ok)return{ok:false,error:'HTTP '+r.status};return r.json().catch(function(){return{ok:false,error:'Bad response '+r.status};});}).catch(function(){return{ok:false,error:'Network error'};});}
window.crushLoad=function(){
 var sel=document.getElementById('crushSelect'),box=document.getElementById('crushSuggest');
 if(!sel)return; sel.innerHTML='<option value="">Loading…</option>';
 jpost('/admin/crush-options',{}).then(function(d){
  if(!d||!d.ok){sel.innerHTML='<option value="">Tap ↻ Refresh to retry</option>';if(box)box.innerHTML='';return;}
  var opts=d.options||[];
  sel.innerHTML=opts.length?opts.map(function(o){return '<option value="'+o.range_name+'" data-id="'+(o.range_id||'')+'">'+o.range_name+' — '+o.count+' rows</option>';}).join(''):'<option value="">No allocated ranges</option>';
  if(box){var s=d.suggestions||[];box.innerHTML=s.length?'<div style="background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.35);border-radius:10px;padding:8px 10px;margin-bottom:8px;font-size:.68rem;font-weight:700">Junk ranges (not in LaMix):'+s.map(function(x){return '<div style="display:flex;align-items:center;gap:6px;margin-top:5px"><span style="flex:1">'+x.range_name+' · '+x.rows_alive+' rows</span><button class="ff-ibtn on" onclick="crushRun(false,\''+x.range_name.replace(/'/g,"\\'")+'\')">Crush</button></div>';}).join('')+'</div>':'';}
 });
};
window.loadRecon=function(){
 var g=document.getElementById('reconGrid');if(!g)return;g.innerHTML='<div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:10px">Loading…</div>';
 jpost('/admin/reconcile-status',{}).then(function(d){
  if(!d||!d.ok){g.innerHTML='<div style="grid-column:1/-1;color:var(--red);font-size:.72rem;padding:8px">'+((d&&d.error)||'Failed')+' — tap ↻ Refresh</div>';return;}
  function cell(k,v){return '<div class="ff-stat"><div><div class="ff-stat-v">'+v+'</div><div class="ff-stat-k">'+k+'</div></div></div>';}
  g.innerHTML=cell('LaMix assigned',d.mirror_assigned)+cell('DB active',d.db_assigned)+cell('Orphans',d.orphans)+cell('Missing',d.missing);
  var m=document.getElementById('reconMeta');if(m)m.textContent='Last sync: '+(d.last_sync||'never')+' · '+(d.junk!=null?('junk '+d.junk+' · '):'')+((d.orphans===0&&d.missing===0)?'✅ in sync':'⚠️ drift');
 });
};
window.limitRefreshAll=function(){try{loadBulkData();}catch(e){} try{window.crushLoad();}catch(e){} try{window.loadRecon();}catch(e){} try{if(window.dbxLoad)dbxLoad();}catch(e){} if(typeof showToast==='function')showToast('Refreshed','success');};
function tidy(){var c=document.getElementById('crushCard');if(!c)return;var sp=c.querySelectorAll('span');for(var i=0;i<sp.length;i++){if((sp[i].textContent||'').indexOf('deletes ONLY')>-1)sp[i].remove();}}
var _ol=window.openLimitPage;window.openLimitPage=function(){if(_ol)_ol();setTimeout(function(){tidy();window.crushLoad();window.loadRecon();},700);setTimeout(tidy,1600);};
setInterval(function(){var p=document.getElementById('limitPage');if(p&&p.style.display==='block')tidy();},6000);
})();
/* ══ USER NUMBERS FILTER (DB-only) + SYNC DIALOG FIX (append-only) ══ */
(function(){
function sess(){return localStorage.getItem('app_session');}
function pj(p,b){return fetch('/api'+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({session:sess()},b))}).then(function(r){return r.json();});}
window.reconSyncNow=function(){
  zconfirm('Run a FULL LaMix numbers pass now?<div style="font-size:.72rem;color:var(--muted);margin-top:6px;line-height:1.5">Takes ~2–3 min at 38 req/min. Continuous reconcile keeps running — nothing is paused.</div>',function(){
    pj('/admin/numsync-run',{}).then(function(d){ var m=document.getElementById('reconMsg'); if(m){m.style.display='block';m.textContent=(d&&d.ok)?'Sync queued — refresh in ~2–3 min.':((d&&d.error)||'Failed');m.style.color=(d&&d.ok)?'var(--green)':'var(--red)';} });
  },{yesText:'Run Sync'});
  var y=document.getElementById('zconfirmYes'); if(y){ y.style.background='linear-gradient(135deg,var(--accent),var(--accent2))'; y.style.color='#06080F'; y.style.boxShadow='0 6px 16px -4px rgba(34,211,238,.5)'; }
  var ic=document.getElementById('zconfirmIc'); if(ic&&window.zic){ ic.innerHTML=zic('refresh',34).replace('<svg ','<svg style="color:var(--accent)" '); }
};
function ensureUnfCard(){ if(document.getElementById('unfCard'))return; var p=document.getElementById('limitPage'); if(!p)return; var w=p.querySelector('.fx-wrap'); if(!w)return;
  var d=document.createElement('div'); d.id='unfCard'; d.className='fx-card'; d.style.marginTop='14px';
  d.innerHTML='<div class="fx-card-t">'+(window.zic?zic('users',15):'')+'User Numbers Filter · DB only</div><div class="fx-hint">Pure local DB — zero LaMix calls. Pick a user, tap Filter: every range they hold with exact quantities.</div>'
   +'<div class="fx-row"><select id="unfUser" class="ff-input" style="flex:1;min-width:140px"><option value="">Select user…</option></select><button class="fx-btn" onclick="unfRun()">Filter</button></div>'
   +'<div id="unfOut" style="margin-top:10px"></div>';
  var cr=document.getElementById('crushCard'); if(cr) cr.parentNode.insertBefore(d,cr); else w.appendChild(d);
  pj('/admin/user-ranges',{}).then(function(dd){ var s2=document.getElementById('unfUser'); if(!s2||!dd||!dd.ok)return; (dd.clients||[]).forEach(function(c){var o=document.createElement('option');o.value=c;o.textContent=c;s2.appendChild(o);}); });
}
window.unfRun=function(){ var u=(document.getElementById('unfUser')||{}).value||''; var out=document.getElementById('unfOut'); if(!out)return;
  if(!u){ out.innerHTML='<div style="font-size:.72rem;color:var(--muted);padding:6px 2px">Select a user first.</div>'; return; }
  out.innerHTML='<div style="text-align:center;color:var(--muted);font-size:.72rem;padding:10px">Reading DB…</div>';
  pj('/admin/user-ranges',{client:u}).then(function(d){ if(!d||!d.ok){ out.innerHTML='<div style="color:var(--red);font-size:.72rem">Failed to read DB.</div>'; return; }
    var t=d.total||{total:0,active:0}; var rows=d.ranges||[]; var max=1; rows.forEach(function(r){ if(r.qty>max)max=r.qty; });
    var h='<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;animation:pgFadeIn .25s ease both"><span class="ff-pin">'+u+'</span><span class="ff-pin">total '+t.total+'</span><span class="ff-pin" style="color:#047857">active '+t.active+'</span><span class="ff-pin" style="color:var(--muted)">'+rows.length+' ranges</span></div>';
    h+= rows.length ? rows.map(function(r){ var pct=Math.max(2,Math.round((r.qty/max)*100));
      return '<div style="margin-bottom:9px;animation:pgFadeIn .3s ease both"><div style="display:flex;align-items:center;gap:8px;font-size:.74rem;font-weight:700"><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+r.range_name+'</span><span style="font-family:Space Grotesk,monospace;color:var(--accent)">'+r.qty+'</span></div><div class="ff-bar"><i style="width:'+pct+'%"></i></div><div style="font-size:.58rem;color:var(--muted);margin-top:2px">active '+r.active+' · released '+r.released+' · junk '+r.junk+'</div></div>';
    }).join('') : '<div style="font-size:.72rem;color:var(--muted)">No rows for this user in DB.</div>';
    out.innerHTML=h; });
};
var _ol=window.openLimitPage; window.openLimitPage=function(){ if(_ol)_ol(); setTimeout(ensureUnfCard,650); };
})();
/* ══ SCC DOCK STOP BUTTON (append-only, appears only with red banner) ══ */
(function(){
function injectStop(){
  var slot=document.getElementById('sccBannerSlot'); if(!slot)return;
  var banner=slot.querySelector('.scc-banner'); if(!banner)return;
  if(banner.querySelector('#sccStopDock'))return;
  var send=banner.querySelector('button[onclick="sccBroadcastAll()"]');
  var b=document.createElement('button'); b.id='sccStopDock'; b.type='button'; b.className='ff-ibtn danger';
  b.style.cssText='margin-right:6px'; b.innerHTML=(window.zic?zic('x',12):'✕')+' Stop All Dock';
  b.onclick=function(){ window.sccClearQueue(); };
  if(send) banner.insertBefore(b, send); else banner.appendChild(b);
}
window.sccClearQueue=function(){
  zconfirm('TERMINATE all pending Shipping Dock batches?<div style="font-size:.72rem;color:var(--muted);margin-top:6px;line-height:1.5">Pending batches are cancelled instantly. Done/failed history is kept. Users are not affected.</div>', function(){
    fetch('/api/admin/queue-clear',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:localStorage.getItem('app_session')})}).then(function(r){return r.json();}).then(function(d){
      if(typeof showToast==='function') showToast(d&&d.ok?('Cancelled '+(d.cancelled||0)+' dock batches'):'Failed', d&&d.ok?'success':'error');
    }).catch(function(){ if(typeof showToast==='function') showToast('Connection error','error'); });
  },{icon:zic('alert',34),yesText:'Stop All Dock'});
};
setInterval(injectStop,1500);
})();
/* ══ BULK UX v3 (append-only): pretty confirm + select-all + blue search + live footer ══ */
(function(){
var _zc=window.zconfirm;
window.zconfirm=function(msg,onYes,opts){
  if(typeof msg==='string' && msg.indexOf('TARGETS:')===0){
    var cut=msg.indexOf('\n\nEach target');
    var namesPart=cut>-1?msg.slice(8,cut):msg.slice(8);
    var rest=cut>-1?msg.slice(cut):'';
    var names=namesPart.split(',').map(function(x){return x.trim();}).filter(Boolean);
    var show=names.slice(0,3);
    msg='<div style="font-size:.62rem;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);margin-bottom:8px">Targets · '+names.length+' users</div>'
      +'<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-bottom:9px">'
      +show.map(function(n){return '<span class="ff-pin">'+n+'</span>';}).join('')
      +(names.length>3?'<span class="ff-pin" style="color:var(--muted);background:var(--surface);border-color:var(--border)">+'+(names.length-3)+' more</span>':'')
      +'</div>'
      +'<div style="font-size:.78rem;color:var(--text);line-height:1.55">'+rest.replace(/\n\n/g,'<br>')+'</div>';
  }
  return _zc(msg,onYes,opts);
};
var st=document.createElement('style');
st.textContent='#bulkRangeSearch,#bulkUserSearch{color:var(--accent);font-weight:700}#bulkRangeSearch:focus,#bulkUserSearch:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(34,211,238,.16)}#bulkRangeSearch::placeholder,#bulkUserSearch::placeholder{color:var(--muted);font-weight:600}';
document.head.appendChild(st);
function selAllRow(kind){ return '<label style="display:flex;align-items:center;gap:8px;padding:7px 9px;border:1px dashed var(--border);border-radius:10px;margin-bottom:6px;background:var(--surface);cursor:pointer"><input type="checkbox" data-selall="'+kind+'" style="accent-color:var(--accent)"><span style="flex:1;font-size:.7rem;font-weight:800;color:var(--accent)">Select all visible</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.2l2.4 2.4 4.6-4.8"/></svg></label>'; }
function hookList(boxId){ var box=document.getElementById(boxId); if(!box)return; if(box.querySelector('[data-selall]'))return; if(!box.querySelectorAll('label input[type=checkbox]').length)return;
  box.insertAdjacentHTML('afterbegin', selAllRow(boxId==='bulkRangeList'?'r':'u'));
  var sa=box.querySelector('[data-selall]');
  sa.onchange=function(){ var want=sa.checked; var cbs=box.querySelectorAll('input[type=checkbox]'); for(var i=0;i<cbs.length;i++){ if(cbs[i]===sa)continue; if(cbs[i].checked!==want) cbs[i].click(); } };
}
function hookQty(){ var q=document.getElementById('bulkQty'); if(!q||q.dataset.hook)return; q.dataset.hook='1';
  q.addEventListener('input',function(){ var el=document.getElementById('bulkSelInfo'); if(el) el.textContent=el.textContent.replace(/·\s*\d+\s*each per range/,'· '+(parseInt(q.value,10)||0)+' each per range'); }); }
var _rr=window.renderBulkRanges,_ru=window.renderBulkUsers;
window.renderBulkRanges=function(){ if(_rr)_rr(); setTimeout(function(){hookList('bulkRangeList');},0); };
window.renderBulkUsers=function(){ if(_ru)_ru(); setTimeout(function(){hookList('bulkUserList');},0); };
setInterval(function(){ var p=document.getElementById('limitPage'); if(p&&p.style.display==='block'){ hookQty(); hookList('bulkRangeList'); hookList('bulkUserList'); } },2000);
})();
/* ══ MSG POPUP + BLUE SEARCH v4 (append-only) ══ */
(function(){
var st=document.createElement('style');
st.textContent=''
+'#limPopup{position:fixed;top:14px;left:50%;transform:translateX(-50%) translateY(-16px);z-index:9990;width:min(92vw,420px);background:var(--card);border:1px solid var(--border);border-radius:14px;box-shadow:0 14px 40px -10px rgba(0,0,0,.35);padding:12px 14px;display:none;align-items:flex-start;gap:10px;animation:lpIn .22s ease both}'
+'@keyframes lpIn{from{opacity:0;transform:translateX(-50%) translateY(-16px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}'
+'#limPopup.show{display:flex}'
+'#limPopup .lp-ic{width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0}'
+'#limPopup.ok .lp-ic{color:#047857;background:rgba(16,185,129,.14)}'
+'#limPopup.err .lp-ic{color:#be123c;background:rgba(244,63,94,.12)}'
+'#limPopup .lp-tx{flex:1;font-size:.76rem;font-weight:700;color:var(--text);line-height:1.5;word-break:break-word}'
+'#limPopup .lp-x{width:26px;height:26px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--muted);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0}'
+'.fx-search input{color:var(--accent);font-weight:700}'
+'.fx-search.hasq input{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 7%,var(--surface));box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 13%,transparent)}'
+'.fx-search.hasq>svg{color:var(--accent)}'
+'.fx-search.hasq input::placeholder{color:var(--muted);font-weight:600}';
document.head.appendChild(st);
var pop=document.createElement('div');pop.id='limPopup';
pop.innerHTML='<span class="lp-ic"></span><span class="lp-tx"></span><button class="lp-x" type="button"></button>';
document.body.appendChild(pop);
var lpT=null;
function lpHide(){pop.classList.remove('show');clearTimeout(lpT);}
pop.querySelector('.lp-x').onclick=lpHide;
function lpShow(text,good){
 pop.className='show '+(good?'ok':'err');
 pop.querySelector('.lp-ic').innerHTML=(window.zic?zic(good?'check':'alert',16):'');
 pop.querySelector('.lp-tx').textContent=text;
 pop.querySelector('.lp-x').innerHTML=(window.zic?zic('x',12):'✕');
 clearTimeout(lpT);lpT=setTimeout(lpHide,7000);
}
var WATCH=['limitMsg','crushMsg','reconMsg','adminMsg','pfMsg'];
function watchEl(m){ if(!m||m.dataset.lpwatch)return; m.dataset.lpwatch='1';
 mo.observe(m,{attributes:true,childList:true,characterData:true,subtree:true}); }
var mo=new MutationObserver(function(){
 for(var i=0;i<WATCH.length;i++){
  var m=document.getElementById(WATCH[i]);if(!m)continue;
  var t=(m.textContent||'').trim();
  if(m.style.display==='block'&&t){
   var good=(m.style.color||'').indexOf('green')>-1;
   m.style.display='none';m.textContent='';
   lpShow(t,good);
  }
 }
});
WATCH.forEach(function(id){watchEl(document.getElementById(id));});
new MutationObserver(function(){ WATCH.forEach(function(id){watchEl(document.getElementById(id));}); }).observe(document.body,{childList:true,subtree:true});
document.addEventListener('input',function(e){
 var inp=e.target;if(!inp||inp.tagName!=='INPUT')return;
 var wrap=inp.closest?inp.closest('.fx-search'):null;if(!wrap)return;
 if((inp.value||'').trim())wrap.classList.add('hasq');else wrap.classList.remove('hasq');
});
})();
/* ══ TOAST v5 compact+fast & ALWAYS-BLUE SEARCH (append-only) ══ */
(function(){
var st=document.createElement('style');
st.textContent=''
+'#limPopup{top:10px!important;width:min(92vw,380px)!important;padding:10px 12px!important;border-radius:12px!important;gap:8px!important;animation:lpIn2 .18s ease both!important}'
+'@keyframes lpIn2{from{opacity:0;transform:translateX(-50%) translateY(-12px) scale(.96)}to{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}}'
+'#limPopup .lp-ic{width:26px!important;height:26px!important;border-radius:8px!important;flex-shrink:0}'
+'#limPopup .lp-ic svg{width:14px!important;height:14px!important}'
+'#limPopup .lp-tx{font-size:.72rem!important;line-height:1.45!important}'
+'#limPopup .lp-x{width:24px!important;height:24px!important;border-radius:7px!important}'
+'.fx-search input{border-color:var(--accent)!important}'
+'.fx-search>svg{color:var(--accent)!important}'
+'.fx-search input:focus{box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 18%,transparent)!important}';
document.head.appendChild(st);
var OK='<svg class="zic" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.2l2.4 2.4 4.6-4.8"/></svg>';
var ALERT='<svg class="zic" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>';
var was=false;
function tick(){
 var p=document.getElementById('limPopup'); if(!p)return;
 var show=p.classList.contains('show');
 if(show&&!was){
   var ic=p.querySelector('.lp-ic'); var svg=ic?ic.querySelector('svg'):null;
   if(ic&&(!svg||!svg.childNodes.length||(svg.innerHTML||'').indexOf('undefined')>-1)) ic.innerHTML=p.classList.contains('ok')?OK:ALERT;
   clearTimeout(tick._t); tick._t=setTimeout(function(){ var x=p.querySelector('.lp-x'); if(x)x.click(); },4500);
 }
 was=show;
}
setInterval(tick,300);
})();
/* ══ ALLOC LIMITS ADMIN + DYNAMIC QTY LABEL (append-only) ══ */
(function(){
function sess(){return localStorage.getItem('app_session');}
function pj(p,b){return fetch('/api'+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({session:sess()},b))}).then(function(r){return r.json();}).catch(function(){return null;});}
var LIM=null;
function ensureLimitsCard(){
 if(document.getElementById('limCard'))return;
 var page=document.getElementById('adminPage'); if(!page)return;
 var wrap=page.querySelector('.fx-wrap'); if(!wrap)return;
 var d=document.createElement('div'); d.id='limCard'; d.className='fx-card'; d.style.marginTop='14px';
 d.innerHTML='<div class="fx-card-t">'+(window.zic?zic('shield',15):'')+'Allocation Limits (per user / day)</div>'
  +'<div class="fx-hint">Applies to every non-super user, instantly: max numbers per single allocation, per range per day, per country per day.</div>'
  +'<div class="fx-row"><input id="limQtyMax" type="number" min="1" max="1000" class="ff-input" style="min-width:90px" placeholder="Qty max"><input id="limRangeDay" type="number" min="1" class="ff-input" style="min-width:90px" placeholder="Range/day"><input id="limCountryDay" type="number" min="1" class="ff-input" style="min-width:90px" placeholder="Country/day"><button class="fx-btn" onclick="saveLimits()">Save</button></div>'
  +'<div id="limMsg2" style="font-size:.7rem;font-weight:700;margin-top:8px;display:none"></div>';
 wrap.appendChild(d);
 pj('/admin/limits-get',{}).then(function(d){ if(!d||!d.ok)return; LIM=d.limits; var q=document.getElementById('limQtyMax'),r=document.getElementById('limRangeDay'),c=document.getElementById('limCountryDay'); if(q)q.value=LIM.qtyMax; if(r)r.value=LIM.rangeDaily; if(c)c.value=LIM.countryDaily; });
}
window.saveLimits=function(){
 var L={qtyMin:1, qtyMax:parseInt((document.getElementById('limQtyMax')||{}).value,10)||25, rangeDaily:parseInt((document.getElementById('limRangeDay')||{}).value,10)||50, countryDaily:parseInt((document.getElementById('limCountryDay')||{}).value,10)||100};
 pj('/admin/limits-set',L).then(function(d){ var m=document.getElementById('limMsg2'); if(m){m.style.display='block';m.textContent=d&&d.ok?'Limits saved — live now.':((d&&d.error)||'Failed');m.style.color=d&&d.ok?'var(--green)':'var(--red)';} if(d&&d.ok)LIM=L; });
};
setInterval(function(){
 if(!LIM) pj('/alloc/limits',{}).then(function(d){ if(d&&d.ok)LIM=d.limits; });
 if(!LIM)return;
 var nodes=document.querySelectorAll('div,label,span');
 for(var i=0;i<nodes.length;i++){ var el=nodes[i]; if(el.children.length===0 && /^QUANTITY\s*\(/i.test((el.textContent||'').trim())) el.textContent='QUANTITY (1\u2013'+LIM.qtyMax+')'; }
 var inp=document.getElementById('allocQty')||document.querySelector('#addPage input[type=number]');
 if(inp) inp.max=LIM.qtyMax;
},3000);
var _oa=window.openAdminPage; window.openAdminPage=function(){ if(_oa)_oa(); setTimeout(ensureLimitsCard,400); };
})();
/* ══ ALLOC QTY GUARD v3b (append-only): input can't exceed admin max ══ */
(function(){
var LIM2=null;
function pull(){ fetch('/api/alloc/limits',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:localStorage.getItem('app_session')})}).then(function(r){return r.json();}).then(function(d){ if(d&&d.ok)LIM2=d.limits; }).catch(function(){}); }
pull(); setInterval(function(){ if(!LIM2)pull(); },5000);
function allocQtyInputs(){ var res=[],ns=document.querySelectorAll('input[type=number]');
 for(var i=0;i<ns.length;i++){ var el=ns[i],p=el,txt='',hit=false;
  for(var k=0;k<4&&p;k++){ txt=(p.textContent||''); if(/QUANTITY\s*\(/i.test(txt)){hit=!/Bulk SMS/i.test(txt);break;} p=p.parentElement; }
  if(hit)res.push(el); }
 return res; }
setInterval(function(){ if(!LIM2)return; var ins=allocQtyInputs();
 for(var i=0;i<ins.length;i++){ var el=ins[i]; el.max=LIM2.qtyMax;
  if(!el.dataset.qg){ el.dataset.qg='1';
   el.addEventListener('input',function(){ var v=parseInt(this.value,10)||0; if(LIM2&&v>LIM2.qtyMax){ this.value=LIM2.qtyMax; if(typeof showToast==='function')showToast('Max '+LIM2.qtyMax+' per allocation (admin limit)','error'); } });
  } } },2500);
})();
/* ══ DYNAMIC ALLOC BUTTON TEXT v4 (append-only) ══ */
(function(){
var LIM3=null;
function pull3(){ fetch('/api/alloc/limits',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:localStorage.getItem('app_session')})}).then(function(r){return r.json();}).then(function(d){ if(d&&d.ok)LIM3=d.limits; }).catch(function(){}); }
pull3(); setInterval(function(){ if(!LIM3)pull3(); },6000);
function fixBtn(){ if(!LIM3)return;
 var btns=document.querySelectorAll('button');
 for(var i=0;i<btns.length;i++){ var t=(btns[i].textContent||'').trim();
  if(/^Qty\s+1[\u2013-]50$/.test(t)){ btns[i].textContent='Qty 1\u2013'+LIM3.qtyMax; }
 }
}
setInterval(fixBtn,1200);
})();
/* ══ NUCLEAR CHANGE PASSWORD MODAL (Self-Injecting) ══ */
(function(){
  window.openChangePasswordModal = function() {
    var old = document.getElementById('zamilPwdModal');
    if(old) old.remove();

    var m = document.createElement('div');
    m.id = 'zamilPwdModal';
    m.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.65);z-index:99999;display:flex;align-items:center;justify-content:center;animation:pgFadeIn .2s ease';
    
    m.innerHTML = '<div style="background:var(--card,#1e1e2e);color:var(--text,#fff);padding:24px;border-radius:16px;width:90%;max-width:400px;box-shadow:0 20px 50px rgba(0,0,0,0.5);border:1px solid var(--border,#333);font-family:inherit">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">'
      + '<h3 style="margin:0;font-size:1.1rem;font-weight:700">🔑 Change Password</h3>'
      + '<button id="zamilPwdClose" style="background:none;border:none;color:var(--muted,#888);font-size:1.5rem;cursor:pointer;line-height:1">&times;</button>'
      + '</div>'
      + '<div style="display:flex;flex-direction:column;gap:12px">'
      + '<input type="password" id="zamilPwdOld" placeholder="Current Password" style="padding:12px;border-radius:8px;border:1px solid var(--border,#444);background:var(--surface,#2a2a3e);color:var(--text,#fff);font-size:0.95rem">'
      + '<input type="password" id="zamilPwdNew" placeholder="New Password (min 6 chars)" style="padding:12px;border-radius:8px;border:1px solid var(--border,#444);background:var(--surface,#2a2a3e);color:var(--text,#fff);font-size:0.95rem">'
      + '<input type="password" id="zamilPwdConf" placeholder="Confirm New Password" style="padding:12px;border-radius:8px;border:1px solid var(--border,#444);background:var(--surface,#2a2a3e);color:var(--text,#fff);font-size:0.95rem">'
      + '<button id="zamilPwdSave" style="padding:12px;border-radius:8px;border:none;background:linear-gradient(135deg,var(--accent,#22d3ee),var(--accent2,#a855f7));color:#000;font-weight:700;font-size:1rem;cursor:pointer;margin-top:8px">Update Password</button>'
      + '</div></div>';
      
    document.body.appendChild(m);
    setTimeout(function(){ document.getElementById('zamilPwdOld').focus(); }, 100);

    document.getElementById('zamilPwdClose').onclick = function(){ m.remove(); };
    m.onclick = function(e){ if(e.target === m) m.remove(); };

    document.getElementById('zamilPwdSave').onclick = async function() {
      var oldP = document.getElementById('zamilPwdOld').value;
      var newP = document.getElementById('zamilPwdNew').value;
      var confP = document.getElementById('zamilPwdConf').value;

      if(!oldP || !newP || !confP) { if(typeof showToast==='function') showToast('Please fill all fields', 'error'); return; }
      if(newP.length < 6) { if(typeof showToast==='function') showToast('New password must be at least 6 characters', 'error'); return; }
      if(newP !== confP) { if(typeof showToast==='function') showToast('New passwords do not match', 'error'); return; }

      var btn = document.getElementById('zamilPwdSave');
      btn.disabled = true; btn.textContent = 'Updating...';

      try {
        var res = await fetch('/api/auth/change-password', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            session: localStorage.getItem('app_session'),
            oldPassword: oldP,
            newPassword: newP
          })
        });
        var d = await res.json();
        if(d && (d.ok || d.message || d.success)) {
          if(typeof showToast==='function') showToast('Password updated successfully!', 'success');
          m.remove();
        } else {
          if(typeof showToast==='function') showToast((d && d.error) ? d.error : 'Failed to update', 'error');
          btn.disabled = false; btn.textContent = 'Update Password';
        }
      } catch(e) {
        if(typeof showToast==='function') showToast('Network error', 'error');
        btn.disabled = false; btn.textContent = 'Update Password';
      }
    };
  };
})();
/* ══ EYE TOGGLES for New/Confirm password (append-only) ══ */
(function(){
var EYE='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
var EYE_OFF='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
function addEyes(){
  ['zamilPwdNew','zamilPwdConf'].forEach(function(id){
    var inp=document.getElementById(id); if(!inp||inp.dataset.eye)return; inp.dataset.eye='1';
    var wrap=document.createElement('div'); wrap.style.cssText='position:relative';
    inp.parentNode.insertBefore(wrap,inp); wrap.appendChild(inp);
    inp.style.paddingRight='42px';
    var b=document.createElement('button'); b.type='button'; b.title='Show/hide';
    b.style.cssText='position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--muted,#888);padding:4px;display:flex;align-items:center';
    b.innerHTML=EYE;
    b.onclick=function(){ var show=inp.type==='password'; inp.type=show?'text':'password'; b.innerHTML=show?EYE_OFF:EYE; inp.focus(); };
    wrap.appendChild(b);
  });
}
var _opcm=window.openChangePasswordModal;
window.openChangePasswordModal=function(){ if(_opcm)_opcm(); setTimeout(addEyes,60); setTimeout(addEyes,300); };
})();
