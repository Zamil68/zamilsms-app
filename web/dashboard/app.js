// Check auth on load for protected pages
if(window.location.pathname.includes('dashboard') || window.location.pathname.includes('sms')) {
    checkAuth('/login/index.html');
} 

// ═══════════════════════════════════════════════════════════
//  ZAMIL SMS — Main Script
// ═══════════════════════════════════════════════════════════

var ALL_NUMS = [], DISP_NUMS = [], STRIP_N = 0, CC_LEN = 0;
var ACTIVE_RANGE = { id: "", title: "", count: 0 };
var NEW_NUMS = new Set();
// ── NEW badge auto-expiry (fixes "1-2h old numbers still show NEW") ──
var NEW_TAG_TTL = 30 * 60 * 1000; // badge lives max 30 min (tune here)
function _newTsKey(rid){ return 'zamil_newts_' + rid; }
function _newTsLoad(rid){ try { return JSON.parse(localStorage.getItem(_newTsKey(rid)) || '{}'); } catch(e){ return {}; } }
function _newTsSave(rid, m){ try { localStorage.setItem(_newTsKey(rid), JSON.stringify(m)); } catch(e){} }
function _newTsMark(rid, arr){
  var m = _newTsLoad(rid), now = Date.now();
  for (var i = 0; i < arr.length; i++) m[arr[i]] = now;
  Object.keys(m).forEach(function(k){ if (now - m[k] > NEW_TAG_TTL) delete m[k]; });
  _newTsSave(rid, m);
}
function _newTsDrop(rid, num){ var m = _newTsLoad(rid); if (m[num]) { delete m[num]; _newTsSave(rid, m); } }
function _knownKey(rid){ return 'zamil_known_' + rid; }
function _knownLoad(rid){ try { var a = JSON.parse(localStorage.getItem(_knownKey(rid)) || '[]'); return Array.isArray(a) ? a : []; } catch(e){ return []; } }
function _knownSave(rid, a){ try { localStorage.setItem(_knownKey(rid), JSON.stringify(a.slice(-3000))); } catch(e){} }
function _newDetect(rid, nums, firstEver){
  if (!nums || !nums.length) return [];
  var known = _knownLoad(rid), km = {}, fresh = [], i;
  for (i=0;i<known.length;i++) km[known[i]] = 1;
  if (!localStorage.getItem('zamil_range_seen_' + rid)) {
    if (firstEver === true) { for (i=0;i<nums.length;i++) fresh.push(nums[i]); }
    try { localStorage.setItem('zamil_range_seen_' + rid, '1'); } catch(e){}
    _knownSave(rid, known.concat(nums));
    if (fresh.length) _newTsMark(rid, fresh);
    return fresh;
  }
  for (i=0;i<nums.length;i++){ if (!km[nums[i]]) fresh.push(nums[i]); }
  if (fresh.length){ _newTsMark(rid, fresh); _knownSave(rid, known.concat(fresh)); }
  return fresh;
}
function _otpToday(){ return new Date().toISOString().slice(0,10); } // UTC date flips at 05:00 PKT = the reset
function _otpLoad(){ try { var o = JSON.parse(localStorage.getItem('zamil_otp_cache')||'null'); if (o && o.d === _otpToday() && o.c) return o.c; } catch(e){} return {}; }
function _otpSave(){ try { localStorage.setItem('zamil_otp_cache', JSON.stringify({ d: _otpToday(), c: NUM_SMS_CACHE })); } catch(e){} }
var NUM_SMS_CACHE = _otpLoad();
var NUM_SMS_WATCHING = new Set();
var NUM_SMS_PREV = {};
var _smsInterval = null, _numSmsInterval = null, _numSmsBgInterval = null;
var LB_RANGE = "today";
var LB_CACHE = {};
// ── SMS-per-number daily limit shown as "used/LIMIT" next to each number ──
// Change ONLY this one number to change the limit shown everywhere (e.g. 15 -> 20).
var SMS_DAILY_LIMIT = 30;
var _SMS_RECENT_KEY = "";

// ── CROSS-TAB SMS POLL LEADER ──────────────────────────────
// Only ONE browser tab per logged-in user should actually hit
// /api/smscount every 3s. Other tabs for the same user just read
// the result the leader tab broadcasts (via localStorage "storage"
// event, which fires across tabs/windows on the same origin).
// This keeps backend load flat regardless of how many tabs a
// single user has open.
var _TAB_ID = (Date.now().toString(36) + Math.random().toString(36).slice(2));
var _LEADER_KEY = "hydra_sms_poll_leader";
var _LEADER_HEARTBEAT_MS = 4000;   // leader re-claims every 4s
var _LEADER_STALE_MS     = 4000;   // a leader heartbeat older than this is considered dead
var _isPollLeader = false;
var _leaderHeartbeatT = null;

// ═══════════════════════════════════════════════════════════
//  SMART CACHE & RATE LIMITING SYSTEM
// ═══════════════════════════════════════════════════════════
var RATE_LIMITS = {
  '/api/ranges': { maxPerMin: 40, requests: [] },
  '/api/numbers': { maxPerMin: 40, requests: [] },
  '/api/smscount': { maxPerMin: 40, requests: [] },
  '/api/alloc': { maxPerMin: 30, requests: [] },
  '/api/leaderboard': { maxPerMin: 20, requests: [] }
};

var CACHE_VERSION = 'v2.2';

function canMakeRequest(endpoint) {
  var now = Date.now();
  var limit = RATE_LIMITS[endpoint] || { maxPerMin: 40, requests: [] };
  
  limit.requests = limit.requests.filter(function(ts) { return now - ts < 60000; });
  
  if (limit.requests.length >= limit.maxPerMin) {
    var oldestRequest = Math.min.apply(null, limit.requests);
    var waitTime = 60000 - (now - oldestRequest);
    return { allowed: false, waitTime: waitTime };
  }
  
  return { allowed: true };
}

function recordRequest(endpoint) {
  var limit = RATE_LIMITS[endpoint];
  if (limit) {
    limit.requests.push(Date.now());
  }
}

function onAllocationSuccess() {
  try { localStorage.removeItem(CACHE_KEY_RANGES); } catch(e) {}
  setTimeout(function() {
    loadRanges(true, true);
  }, 1000);
}

function _readLeader(){
  try{ return JSON.parse(localStorage.getItem(_LEADER_KEY) || "null"); }catch(e){ return null; }
}
function _claimLeadership(){
  try{
    localStorage.setItem(_LEADER_KEY, JSON.stringify({ id:_TAB_ID, ts:Date.now() }));
  }catch(e){}
  _isPollLeader = true;
}
function _maybeBecomeLeader(){
  var cur = _readLeader();
  if(!cur || (Date.now()-cur.ts) > _LEADER_STALE_MS || cur.id===_TAB_ID){
    _claimLeadership();
  } else {
    _isPollLeader = false;
  }
  return _isPollLeader;
}
function _startLeaderHeartbeat(){
  if(_leaderHeartbeatT) return;
  _leaderHeartbeatT = setInterval(function(){
    if(_isPollLeader) _claimLeadership(); // refresh timestamp so other tabs don't steal it
    else _maybeBecomeLeader();            // check if old leader died (tab closed)
  }, _LEADER_HEARTBEAT_MS);
}
// Broadcast a poll result to other tabs of the same user via localStorage.
// (We don't use BroadcastChannel for max compatibility; localStorage "storage"
// events already fire in all other same-origin tabs automatically.)
function _broadcastSmsResult(d){
  try{ localStorage.setItem("hydra_sms_last_result", JSON.stringify({ ts:Date.now(), data:d })); }catch(e){}
}
// Followers listen for the leader's broadcast and apply it locally —
// this is what makes non-leader tabs update without polling themselves.
window.addEventListener("storage", function(ev){
  if(ev.key==="hydra_sms_last_result" && !_isPollLeader && ev.newValue){
    try{
      var payload = JSON.parse(ev.newValue);
      if(payload && payload.data) _applySmsResult(payload.data);
    }catch(e){}
  }
  // If the leader's heartbeat key disappears/changes ownership, re-evaluate.
  if(ev.key===_LEADER_KEY) _maybeBecomeLeader();
});

// ── THEME ──
var THEME = localStorage.getItem("app_theme") || "light";
document.documentElement.setAttribute("data-theme", THEME);
(function(){ document.getElementById("themeBtn").textContent = THEME==="dark"?"🌙":"☀️"; })();
function toggleTheme(){
  THEME = THEME==="dark"?"light":"dark";
  document.documentElement.setAttribute("data-theme", THEME);
  localStorage.setItem("app_theme", THEME);
  document.getElementById("themeBtn").textContent = THEME==="dark"?"🌙":"☀️";
}
// ─ SERVER WAKE UP COUNTDOWN ──
var _wakeUpTimer = null;
function showWakeUpOverlay() {
  // Prevent multiple overlays
  if (document.getElementById("wakeUpOverlay")) return;

  var overlay = document.createElement("div");
  overlay.id = "wakeUpOverlay";
  overlay.className = "wake-up-overlay";
  
  overlay.innerHTML = `
    <div class="wake-up-icon">⚡</div>
    <div class="wake-up-title">ZAMIL SMS is waking up...</div>
    <div class="wake-up-sub">Our server was sleeping to save energy. It's booting up just for you. Please wait a moment!</div>
    <div class="wake-up-timer-box">
      <div class="wake-up-timer-num" id="wakeUpTimerNum">45</div>
      <div class="wake-up-timer-label">Seconds remaining</div>
    </div>
    <div class="wake-up-spinner"></div>
  `;
  
  document.body.appendChild(overlay);
  
  // Force reflow to trigger CSS transition
  void overlay.offsetWidth;
  overlay.classList.add("show");

  // Start Countdown
  var timeLeft = 45;
  var timerEl = document.getElementById("wakeUpTimerNum");
  
  _wakeUpTimer = setInterval(function() {
    timeLeft--;
    if (timerEl) timerEl.textContent = timeLeft;
    
    if (timeLeft <= 0) {
      clearInterval(_wakeUpTimer);
      hideWakeUpOverlay();
      // Reload data since server is definitely awake now
      if (SESSION) {
        loadRanges(true);
        silentSmsRefresh(true);
      }
    }
  }, 1000);
}

function hideWakeUpOverlay() {
  var overlay = document.getElementById("wakeUpOverlay");
  if (overlay) {
    overlay.classList.remove("show");
    setTimeout(function() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 400);
  }
  clearInterval(_wakeUpTimer);
}

// ── UTILITIES ──


// ─ RANGES ──
// Smart parser: handles "Ecuador (K) 59397979xxxx", "USA LX 1234xxx",
// "(K) Ecuador 593...", "Brazil MX d 55...",
// "213 - Algeria LX 04May" (dial-code prefix style) etc.
function splitRangeName(title){
  var raw = String(title||"").trim();
  if(!raw) return {country:"", detail:""};
  // Mixed dial-code style: "972 + 970 - Palestine LX 04May" or "970 & 972 - ..."
  // Strip the leading "code1 + code2 -" combo so the rest parses normally
  // as country/detail below — without this, "972" alone was being read
  // as the country instead of "Palestine".
  var mixMatch = raw.match(/^(\d{1,4})\s*[+&]\s*(\d{1,4})\s*-\s*(.+)$/);
  if(mixMatch){
    raw = mixMatch[3].trim();
  }
  // Sniper-style: "Armenia-W-UC-05" → country before first hyphen, rest is detail
  if(raw.indexOf(" ")<0 && raw.indexOf("-")>0){
    var idx = raw.indexOf("-");
    return { country: raw.slice(0, idx).trim(), detail: raw.slice(idx).trim() };
  }
  // Dial-code prefix style: "213 - Algeria LX 04May" or "- Bangladesh LX ..."
  // Strip leading dialcode + dash separator before parsing country
  var stripped = raw.replace(/^\d+\s*-\s*/, "").replace(/^-\s*/, "").trim();
  // Lamix-style: tokenise on whitespace
  var words = stripped.split(/\s+/);
  var countryWords = [];
  var detailStart  = words.length;
  for(var i=0;i<words.length;i++){
    var w = words[i];
   // Stop at: digit-leading token, range marker (LX/MX/RX/d), or paren tag like (K)
      if(/^\d/.test(w) || /^(LX|MX|RX|d)\b/i.test(w) || /^\(/.test(w)){
        detailStart = i;
        break;
      }
    countryWords.push(w);
  }
  var country = countryWords.join(" ").trim() || words[0];
  var detail  = words.slice(detailStart).join(" ").trim();
  return {country: country, detail: detail};
}
var ALL_RANGES=[];
var _rangesInFlight = false;
var _LAST_CACHED_NOTICE = 0;
function _cachedNotice(silent, msg){
  if (silent) return;                              // background refresh = never toast
  var now = Date.now();
  if (now - _LAST_CACHED_NOTICE < 60000) return;   // max 1 notice per minute
  _LAST_CACHED_NOTICE = now;
  showMini(msg || 'Using cached ranges', 'info');
}
function filterRanges(list, q){
  q=(q||"").toLowerCase().trim();
  if(!q) return list;
  return list.filter(function(r){
    var t=(r.title||"").toLowerCase();
    var sp=splitRangeName(r.title||"");
    return t.indexOf(q)>=0 || (sp.country||"").toLowerCase().indexOf(q)>=0;
  });
}
// ── Group-by-country view state ──
// RANGES_GROUPED: on/off toggle (persisted). RG_OPEN_COUNTRY: which
// country's folder is currently drilled into (null = showing folders).
var RANGES_GROUPED = localStorage.getItem("ranges_grouped") === "1", RG_OPEN_COUNTRY = null, _rgOrder = [];
document.addEventListener("DOMContentLoaded", function () {
  var cb = document.getElementById("rangesGroupToggle");
  if (cb) { cb.checked = RANGES_GROUPED; _rgSyncSwitchVisual(RANGES_GROUPED); }
});
function _rgSyncSwitchVisual(on) {
  var sl = document.getElementById("rangesGroupSlider"), kn = document.getElementById("rangesGroupKnob");
  if (sl) sl.style.background = on ? "var(--accent)" : "var(--border)";
  if (kn) kn.style.transform = on ? "translateX(17px)" : "translateX(0)";
}
function toggleRangesGrouping(checked) {
  RANGES_GROUPED = checked;
  try { localStorage.setItem("ranges_grouped", checked ? "1" : "0"); } catch (e) {}
  RG_OPEN_COUNTRY = null;
  _rgSyncSwitchVisual(checked);
  renderRanges(ALL_RANGES);
}
// Builds the exact same .range-card markup used by the normal flat list
// (including the ⏱ minsAgo badge) — shared by the flat list and the
// "inside a country folder" view so a range behaves identically in both.
function _rangeCardHtml(rng) {
  var sp = splitRangeName(rng.title);
  var iso = (window.callingCodeToISO && rng.prefix) ? window.callingCodeToISO(rng.prefix) : null;
  var flagHtml = window.getFlagAuto
    ? window.getFlagAuto(iso || sp.country)
    : (iso ? window.getFlagEmoji(iso) : '🌐');
  
  var timeHtml = "";
  if (rng.minsAgo !== null && rng.minsAgo !== undefined) {
    var ma = rng.minsAgo, tl, tc;
    if (ma < 1) { tl = "just now"; tc = "#22d3ee"; }
    else if (ma < 30) { tl = ma + "m ago"; tc = "#22d3ee"; }
    else if (ma < 180) { tl = ma + "m ago"; tc = "#a3e635"; }
    else { tl = Math.floor(ma / 60) + "h ago"; tc = "var(--muted)"; }
    timeHtml = '<span style="font-size:.58rem;color:' + tc + ';font-weight:600;margin-left:4px">⏱ ' + tl + '</span>';
  }
  
  var html = '<div class="range-card" data-rid="' + escHtml(rng.id) + '" data-rtitle="' + escHtml(rng.title) + '" data-rcount="' + rng.count + '">';
  html += '<div class="range-card-top" onclick="rangeCardTap(event,this)">';
  html += '<span class="range-flag">' + flagHtml + '</span>';
  html += '<div class="range-info"><div class="range-name">' + escHtml(sp.country) + ' ' + timeHtml + '</div>';
  html += (sp.detail ? '<div class="range-detail">' + escHtml(sp.detail) + '</div>' : "");
  html += '</div>';
  html += '<div class="range-count-wrap"><span class="range-count-num">' + rng.count.toLocaleString() + '</span><span class="range-count-lbl">nums</span></div>';
  html += '<div class="range-arrow">›</div>';
  html += '</div>';
  
  // ✨ NEW: Visible Unassign Button
  html += '<div class="range-actions">';
  html += '<button class="btn-unassign" onclick="event.stopPropagation(); confirmUnassign(this.closest(\'.range-card\').dataset.rid, this.closest(\'.range-card\').dataset.rtitle, this.closest(\'.range-card\').dataset.rcount)" title="Unassign all numbers">';
  html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">';
  html += '<path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>';
  html += '</svg>';
  html += '<span>Unassign</span>';
  html += '</button>';
  html += '</div>';
  html += '</div>';
  
  return html;
}

function confirmUnassign(rangeId, rangeTitle, count) {
  var modal = document.createElement('div');
  modal.className = 'confirm-modal';
  modal.innerHTML = 
    '<div class="confirm-backdrop"></div>' +
    '<div class="confirm-box">' +
      '<div class="confirm-icon"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--red,#ef4444)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.8 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg></div>' +
      '<h3>Unassign Numbers?</h3>' +
      '<p>This will remove <strong>' + parseInt(count).toLocaleString() + '</strong> numbers from<br><strong>' + escHtml(rangeTitle) + '</strong></p>' +
      '<p class="confirm-warning">This action cannot be undone!</p>' +
      '<div class="confirm-actions">' +
        '<button class="btn-cancel">Cancel</button>' +
        '<button class="btn-confirm">Unassign All</button>' +
      '</div>' +
    '</div>';
  
  document.body.appendChild(modal);
  
  // Safe event listeners (prevents quote-breaking syntax errors)
  modal.querySelector('.btn-cancel').onclick = function() { modal.remove(); };
  modal.querySelector('.btn-confirm').onclick = function() {
    executeUnassign(rangeId, rangeTitle, count);
    modal.remove();
  };
}

function executeUnassign(rangeId, rangeTitle, count) {
  showShippingAnimation('unassign', {
    title: 'Releasing Numbers',
    subtitle: count + ' numbers being returned...',
    range: rangeTitle
  });
  
  var clientId = localStorage.getItem("app_client_id");
  var panelNum = parseInt(localStorage.getItem("app_panel_num") || "1", 10);
  
  apiCall("/api/range/unassign", {
    session: SESSION,
    clientId: String(clientId),
    rangeId: String(rangeId),
    panelNum: panelNum
  }, function(d) {
    if (!d || !d.ok) {
      showShippingAnimation('error', { message: (d && d.error) || 'Unassign failed' });
      setTimeout(hideShippingAnimation, 2000);
      return;
    }
    
    showShippingAnimation('success', {
      title: 'Numbers Released!',
      subtitle: (d.removed || 0) + ' numbers successfully unassigned'
    });
    
    setTimeout(function() {
      hideShippingAnimation();
      try { localStorage.removeItem(CACHE_KEY_RANGES); } catch(e) {}
      loadRanges(true);
    }, 2000);
  });
}
// Folder view: one card per country, showing its flag + how many ranges
// live inside + their combined number count. Tapping a folder drills in.
function renderRangesGroupedView(list, container) {
  if (RG_OPEN_COUNTRY) {
    var sub = list.filter(function (r) { return (splitRangeName(r.title || "").country || "Other") === RG_OPEN_COUNTRY; });
    if (!sub.length) { RG_OPEN_COUNTRY = null; return renderRangesGroupedView(list, container); }
    var flag = getFlag(RG_OPEN_COUNTRY);
    var html = "<button type=\"button\" class=\"panel-back\" style=\"margin-bottom:10px\" onclick=\"rgBackToFolders()\">← Back to folders</button>";
    html += "<div style=\"font-size:.95rem;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:8px\">"
          + "<span style=\"font-size:1.35rem\">" + flag + "</span>" + escHtml(RG_OPEN_COUNTRY)
          + " <span class=\"badge\">" + sub.length + "</span></div>";
    for (var i = 0; i < sub.length; i++) html += _rangeCardHtml(sub[i]);
    container.innerHTML = html;
    return;
  }
  var groups = {}, order = [];
  for (var k = 0; k < list.length; k++) {
    var r = list[k], info = splitRangeName(r.title || ""), country = info.country || "Other";
    if (!groups[country]) { groups[country] = { ranges: [], count: 0 }; order.push(country); }
    groups[country].ranges.push(r);
    groups[country].count += r.count || 0;
  }
  order.sort(function (a, b) { return a.localeCompare(b); });
  _rgOrder = order;
  var html = "";
  for (var g = 0; g < order.length; g++) {
    var country = order[g], grp = groups[country], flag = getFlag(country), cnt = grp.ranges.length;
    html += "<div class=\"range-card\" style=\"cursor:pointer\" onclick=\"rgOpenCountry(" + g + ")\">";
    html += "<div class=\"range-card-top\">";
    html += "<span class=\"range-flag\">" + flag + "</span>";
    html += "<div class=\"range-info\"><div class=\"range-name\">" + escHtml(country) + "</div>";
    html += "<div class=\"range-detail\">" + cnt + " range" + (cnt > 1 ? "s" : "") + "</div></div>";
    html += "<div class=\"range-count-wrap\"><span class=\"range-count-num\">" + grp.count.toLocaleString() + "</span><span class=\"range-count-lbl\">nums</span></div>";
    html += "<div class=\"range-arrow\">›</div>";
    html += "</div></div>";
  }
  container.innerHTML = html || "<div class=\"empty\"><div class=\"empty-icon\">📭</div>No ranges found</div>";
}
function rgOpenCountry(idx) { RG_OPEN_COUNTRY = _rgOrder[idx]; renderRanges(ALL_RANGES); }
function rgBackToFolders() { RG_OPEN_COUNTRY = null; renderRanges(ALL_RANGES); }

// 🔥 UPDATED: Group ranges by country and show only user-specific ranges
// 🔥 FIXED: dispatches to the flag-aware / grouped-folder renderer,
// and keeps ALL_RANGES populated so search actually has data to filter.
function _origRenderRanges(ranges) {
  if (ranges) ALL_RANGES = ranges;
  var container = document.getElementById('rangesList');
  var countEl = document.getElementById('rangesCount');
  var list = ALL_RANGES || [];
  list = list.slice().sort(function(a,b){
    var sa = (typeof splitRangeName==='function') ? splitRangeName(a.title||'') : {country:'',detail:''};
    var sb = (typeof splitRangeName==='function') ? splitRangeName(b.title||'') : {country:'',detail:''};
    var ca = (sa.country||'').toLowerCase(), cb = (sb.country||'').toLowerCase();
    if (ca !== cb) return ca < cb ? -1 : 1;
    var da = (sa.detail||'').toLowerCase(), db = (sb.detail||'').toLowerCase();
    return da < db ? -1 : (da > db ? 1 : 0);
  });
  var q = ((document.getElementById('rangesSearch') || {}).value || '').toLowerCase().trim();
  if (q && typeof filterRanges === 'function') list = filterRanges(list, q);   // 🔧 changed: filter sorted list
  if (countEl) countEl.textContent = list.length;
  if (!list.length) {
    container.innerHTML = '<div class="empty"><div class="empty-icon">📭</div>No ranges found. Allocate numbers from the Add button.</div>';
    return;
  }
  if (RANGES_GROUPED && typeof renderRangesGroupedView === 'function') { renderRangesGroupedView(list, container); return; }
  var h = '';
  for (var i = 0; i < list.length; i++) {
    if (typeof _rangeCardHtml === 'function') h += _rangeCardHtml(list[i]);
  }
  container.innerHTML = h || '<div class="empty">No ranges</div>';
}
function onRangesSearch(){
  var q = ((document.getElementById("rangesSearch")||{}).value||"").trim().toLowerCase();
  
  // If empty query, show all ranges
  if (!q) {
    renderRanges(ALL_RANGES);
    return;
  }
  
  // Filter ranges by country OR title
  var filtered = ALL_RANGES.filter(function(r) {
    var title = (r.title || "").toLowerCase();
    var country = (r.country || "").toLowerCase();
    return title.indexOf(q) >= 0 || country.indexOf(q) >= 0;
  });
  
  renderRanges(filtered);
}

// ═══════════════════════════════════════════════════════════
//  SHIPPING ANIMATION SYSTEM
// ═══════════════════════════════════════════════════════════
function showShippingAnimation(type, options) {
  options = options || {};
  var existing = document.querySelector('.shipping-overlay');
  if (existing) existing.remove();
  
  var overlay = document.createElement('div');
  overlay.className = 'shipping-overlay';
  
  var content = '';
  
  if (type === 'allocating') {
    content = 
      '<div class="shipping-container">' +
        '<div class="shipping-boat">' +
          '<svg class="boat-svg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">' +
            '<path d="M20 70 L50 30 L80 70 Z" fill="#3b82f6" opacity="0.8"/>' +
            '<rect x="45" y="20" width="10" height="50" fill="#1e40af"/>' +
            '<path d="M30 70 Q50 80 70 70 L80 85 L20 85 Z" fill="#1e293b"/>' +
          '</svg>' +
          '<div class="waves"><div class="wave"></div><div class="wave"></div></div>' +
        '</div>' +
        '<div class="shipping-title">' + (options.title || 'Shipping Numbers') + '</div>' +
        '<div class="shipping-subtitle">' + (options.subtitle || 'Allocating your numbers...') + '</div>' +
        '<div class="shipping-progress"><div class="shipping-progress-bar" id="shippingProgress"></div></div>' +
        '<div class="shipping-details">' +
          '<div class="shipping-detail-row"><span class="shipping-detail-label">Range:</span><span class="shipping-detail-value">' + (options.range || 'N/A') + '</span></div>' +
          '<div class="shipping-detail-row"><span class="shipping-detail-label">Quantity:</span><span class="shipping-detail-value">' + (options.quantity || 0) + '</span></div>' +
          '<div class="shipping-detail-row"><span class="shipping-detail-label">Status:</span><span class="shipping-detail-value" id="shippingStatus">In Transit...</span></div>' +
        '</div>' +
      '</div>';
  } else if (type === 'success') {
    content = 
      '<div class="shipping-container">' +
        '<div class="shipping-icon shipping-success"><svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="var(--green,#16a34a)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" opacity=".25"/><path d="m8.4 12.3 2.5 2.5 4.7-5"/></svg></div>' +
        '<div class="shipping-title">' + (options.title || 'Success!') + '</div>' +
        '<div class="shipping-subtitle">' + (options.subtitle || 'Operation completed') + '</div>' +
      '</div>';
  } else if (type === 'error') {
    content = 
      '<div class="shipping-container">' +
        '<div class="shipping-icon shipping-error"><svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="var(--red,#dc2626)" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9" opacity=".25"/><path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6"/></svg></div>' +
        '<div class="shipping-title">Error</div>' +
        '<div class="shipping-subtitle">' + (options.message || 'Something went wrong') + '</div>' +
      '</div>';
  } else if (type === 'unassign') {
    content = 
      '<div class="shipping-container">' +
        '<div class="shipping-icon"><svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="var(--muted,#94a3b8)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/></svg></div>' +
        '<div class="shipping-title">' + (options.title || 'Processing') + '</div>' +
        '<div class="shipping-subtitle">' + (options.subtitle || 'Please wait...') + '</div>' +
        '<div class="shipping-progress"><div class="shipping-progress-bar" style="width: 100%"></div></div>' +
      '</div>';
  }
  
  overlay.innerHTML = content;
  document.body.appendChild(overlay);
  
  setTimeout(function() { overlay.classList.add('show'); }, 10);
  
  if ((type === 'success' || type === 'error') && options.autoClose) {
    setTimeout(hideShippingAnimation, options.autoClose);
  }
  
  return overlay;
}

function hideShippingAnimation() {
  var overlay = document.querySelector('.shipping-overlay');
  if (overlay) {
    overlay.classList.remove('show');
    setTimeout(function() { overlay.remove(); }, 300);
  }
}

function updateShippingProgress(percent, status) {
  var progressBar = document.getElementById('shippingProgress');
  var statusEl = document.getElementById('shippingStatus');
  
  if (progressBar) progressBar.style.width = percent + '%';
  if (statusEl && status) statusEl.textContent = status;
}


function copyNumber(n){
  try {
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(n).then(function(){ showToast("✓ Copied "+n,false); },
        function(){ fallbackCopy(n); });
    } else { fallbackCopy(n); }
  } catch(e){ fallbackCopy(n); }
}
function fallbackCopy(n){
  var ta=document.createElement("textarea"); ta.value=n;
  ta.style.position="fixed"; ta.style.opacity="0"; document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); showToast("✓ Copied "+n,false); }
  catch(e){ showToast("Copy failed","error"); }
  document.body.removeChild(ta);
}

// 🔥 UPDATED: Load ranges with proper user filtering
function loadRanges(forceRefresh, silent) {
  var endpoint = '/api/ranges';
  var rateCheck = canMakeRequest(endpoint);
  if (!rateCheck.allowed && !forceRefresh) {
      if (_rangesInFlight && silent) return; // slow net: don't stack background refreshes
    if (!silent) {
      showToast('⏳ Rate limit: wait ' + Math.ceil(rateCheck.waitTime / 1000) + 's', 'info');
    }
    return;
  }
  
  var listEl = document.getElementById('rangesList');
  var cached = cacheGet(CACHE_KEY_RANGES);
  
  if (cached && cached.version && cached.version !== CACHE_VERSION) {
    cached = null;
    try { localStorage.removeItem(CACHE_KEY_RANGES); } catch(e) {}
  }
  
  if (cached && cached.data && cached.data.length) {
    renderRanges(cached.data);
    if (!forceRefresh && !cached.stale) return;
  } else if (!cached) {
    if (listEl) listEl.innerHTML = '<div class="empty"><div class="spinner"></div><br/>Loading ranges…</div>';
    showLoad('Fetching ranges…');
  }
  
 recordRequest(endpoint);
_rangesInFlight = true;
apiCall('/api/ranges', { session: SESSION, forceRefresh: !!forceRefresh }, function(d) {
_rangesInFlight = false;
hideLoad();
    
    if (!d || !d.ok) {
      if (cached && cached.data && cached.data.length) {
        renderRanges(cached.data);
        _cachedNotice(silent);
        return;
      }
      if (!cached && listEl) {
        listEl.innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div>' + escHtml((d && d.error) || 'Could not load ranges') + '<br/><button type="button" class="btn" style="margin-top:12px" onclick="loadRanges(true)">↺ Retry</button></div>';
      }
      if (!silent) showToast('Error: ' + ((d && d.error) || '?'), 'error');
      return;
    }
    
    var fresh = d.ranges || [];
    if (!fresh.length) {
      if (cached && cached.data && cached.data.length) {
        renderRanges(cached.data);
        _cachedNotice(silent, 'Live list empty · showing cached');
        return;
      }
      if (listEl) listEl.innerHTML = '<div class="empty"><div class="empty-icon">📭</div>No ranges found. Allocate numbers from the Add button.</div>';
      return;
    }
    
    (function(){ var prev={}; (ALL_RANGES||[]).forEach(function(r){ prev[r.id]=1; });
  for(var i=0;i<fresh.length;i++){ if(fresh[i].id && !prev[fresh[i].id]) _purgeRangeCaches(fresh[i].id); } })();
cacheSet(CACHE_KEY_RANGES, fresh, CACHE_VERSION);
    renderRanges(fresh);
    
    if (forceRefresh && !silent) {
      showToast('✓ ' + fresh.length + ' ranges loaded', 'success');
    }
  });
}

function cacheSet(key, data, version) {
  try {
    localStorage.setItem(key, JSON.stringify({
      data: data,
      ts: Date.now(),
      version: version || CACHE_VERSION
    }));
  } catch(e) {}
}

function showRanges(){
    document.getElementById("rangesPanel").style.display="block";
    document.getElementById("numbersPanel").style.display="none";
    document.getElementById("smsMiniBar").style.display="none";
    _PIL_FILTER="all";
    var pb=document.getElementById("pilFilterBar"); if(pb) pb.style.display="none";
    stopNumSmsBg();
    
    // ✅ FIX: Reset bottom nav to "Ranges" when going back
    document.querySelectorAll(".bn-item").forEach(function(btn){
        btn.classList.remove("active");
        if(btn.getAttribute("data-page") === "ranges") btn.classList.add("active");
    });
}

// ── NUMBERS ──

// 🔥 UPDATED: Load numbers for specific range (match by both ID and title)
function loadNumbers(rangeId,rangeTitle,count){
  ACTIVE_RANGE={id:rangeId,title:rangeTitle,count:count||500};
  var ckey=numCacheKey(rangeId);
  var cached=numCacheGet(rangeId);
  function showPanel(nums,fromCache){
    ALL_NUMS=nums;
    STRIP_N=1;
    CC_LEN=detectCCLen(nums);
    DISP_NUMS=ALL_NUMS.map(stripCC);
    NEW_NUMS=new Set(nums);
_newDetect(ACTIVE_RANGE.id, nums, !cached);
    COPIED_NUMS = copiedLoad(ACTIVE_RANGE.id);
    document.getElementById("rangesPanel").style.display="none";
    document.getElementById("numbersPanel").style.display="block";
    history.pushState({page:"numbers"},"");
    document.getElementById("panelTitle").textContent=rangeTitle;
    document.getElementById("btnRestoreCC").style.display="inline-flex";
    document.getElementById("btnRemoveCC").style.display="none";
    document.getElementById("stripHint").textContent="Country code removed (per-number)";
    document.getElementById("smsMiniBar").style.display="flex";
    
    var mainNumEl = document.getElementById("smsBigNum") || document.getElementById("smsCountNum");
var mainNum = mainNumEl ? mainNumEl.textContent : "0";
    document.getElementById("smsMiniNum").textContent=mainNum;
    var srch=document.getElementById("numSearch"); if(srch) srch.value="";
    _PIL_FILTER="all";
    _pilRenderBar(_pilDetect(nums));
    renderNums();
    NUM_SMS_CACHE = _otpLoad();
    if(fromCache){
      var ageMin=Math.round((Date.now()-cached.ts)/60000);
      var ageLbl=ageMin<60?(ageMin+"m ago"):(Math.floor(ageMin/60)+"h "+(ageMin%60)+"m ago");
      showMini("cached • "+ageLbl,"info");
      // Cache held for full 3h TTL — no background refresh.
      // Use ↻ Refresh to force, or sign out / in to clear.
    }
    else showToast("✓ "+nums.length+" numbers loaded","success");
  }
  if(cached && !cached.stale){ showPanel(cached.data,true); setTimeout(function(){ refreshNumbers(true); }, 400); return; }
  // Cache missing or older than 3h → fetch fresh automatically.
  if(cached && cached.stale){ showMini("Cache expired • refreshing…","info"); }
  showLoad("Fetching numbers…");
  apiCall("/api/numbers",{session:SESSION,rangeId:rangeId,rangeTitle:rangeTitle,limit:count||500},function(d){
    hideLoad();
    if(!d || !d.ok){ showToast("Error: "+((d&&d.error)||"Service unavailable"),"error"); return; }
    var _raw=d.numbers||[];
var _cn=(localStorage.getItem("app_client_name")||"").trim(), _cid=String(localStorage.getItem("app_client_id")||"");
if((_cn||_cid) && _raw.length && typeof _raw[0]==="object"){ _raw=_raw.filter(function(n){ var cc=String(n.client||n.client_name||n.username||n.client_id||""); return !cc || cc===_cn || cc===_cid; }); }
var nums=_raw.map(function(n){ return (typeof n==="string"?n:n.numberFull||n.number||n.msisdn||Object.values(n)[0]||"").toString().trim(); });
var _du={},_dn=[];for(var _di=0;_di<nums.length;_di++){if(!_du[nums[_di]]){_du[nums[_di]]=1;_dn.push(nums[_di]);}}nums=_dn;
    cacheSet(ckey,nums);
    showPanel(nums,false);
  });
}

function refreshNumbers(silent){
if(!ACTIVE_RANGE.id) return;
var oldNums=ALL_NUMS.slice();
var btn=document.getElementById("btnRefreshNums");
btn.disabled=true; btn.textContent="↻…";
if(!silent) showLoad("Refreshing…");
apiCall("/api/numbers",{session:SESSION,rangeId:ACTIVE_RANGE.id,rangeTitle:ACTIVE_RANGE.title,limit:500},function(d){
hideLoad(); btn.disabled=false; btn.textContent="↻ Refresh";
if(!d || !d.ok){ if(!silent) showToast("Error: "+((d&&d.error)||"Service unavailable"), "error"); return; }
var _raw=d.numbers||[];
var _cn=(localStorage.getItem("app_client_name")||"").trim(), _cid=String(localStorage.getItem("app_client_id")||"");
if((_cn||_cid) && _raw.length && typeof _raw[0]==="object"){ _raw=_raw.filter(function(n){ var cc=String(n.client||n.client_name||n.username||n.client_id||""); return !cc || cc===_cn || cc===_cid; }); }
var nums=_raw.map(function(n){ return (typeof n==="string"?n:n.numberFull||n.number||n.msisdn||Object.values(n)[0]||"").toString().trim(); });
var _du={},_dn=[];for(var _di=0;_di<nums.length;_di++){if(!_du[nums[_di]]){_du[nums[_di]]=1;_dn.push(nums[_di]);}}nums=_dn;

// Known-set diff → badge ONLY truly new arrivals (persistent)
var freshArr = _newDetect(ACTIVE_RANGE.id, nums);
var hasNew = freshArr.length > 0;
if(hasNew){ try{ var a=new Audio("data:audio/wav;base64,UklGRl9vT1RXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgA"); a.volume=0.3; a.play().catch(function(){}); }catch(e){} }
copiedPurge(ACTIVE_RANGE.id,nums);
cacheSet(numCacheKey(ACTIVE_RANGE.id),nums);
CC_LEN=detectCCLen(nums); ALL_NUMS=nums;
applyStrip(STRIP_N);
if(!silent) showToast("↻ "+nums.length+" refreshed","success");
});
}
// Auto-refresh the OPEN range when a delivery lands (no manual ↻ needed)
function _autoRefreshOpenRange(){
  var np=document.getElementById('numbersPanel');
  if(np && np.style.display==='block' && ACTIVE_RANGE && ACTIVE_RANGE.id){
    setTimeout(function(){ refreshNumbers(true); }, 800);
  }
}
var _zNewBadgeAutoT = setInterval(function(){
  var np=document.getElementById('numbersPanel');
  if(np && np.style.display==='block' && ACTIVE_RANGE && ACTIVE_RANGE.id && typeof SESSION!=='undefined' && SESSION && !document.hidden){
    refreshNumbers(true);
  }
}, 30000);
// Toggle: 0 = full numbers, 1 = strip CC per-number
function applyStripCC(){ applyStrip(1); }
function applyStrip(n){
  STRIP_N=n;
  if(n===0){
    DISP_NUMS=ALL_NUMS.slice();
    document.getElementById("btnRestoreCC").style.display="none";
    document.getElementById("btnRemoveCC").style.display="inline-flex";
    document.getElementById("stripHint").textContent="Full number";
  } else {
    DISP_NUMS=ALL_NUMS.map(stripCC);
    document.getElementById("btnRestoreCC").style.display="inline-flex";
    document.getElementById("btnRemoveCC").style.display="none";
    document.getElementById("stripHint").textContent="Country code removed (per-number)";
  }
  renderNums();
}
function onNumSearch(){ renderNums(); }
// ── Palestine / Israel split-range filter ───────────────────────
var _PIL_FILTER = "all";
function _pilDetect(nums) {
  var h970 = false, h972 = false;
  for (var i = 0; i < nums.length && !(h970 && h972); i++) {
    var n = String(nums[i] || "").replace(/^\+|^00/, "");
    if (n.indexOf("970") === 0) h970 = true;
    else if (n.indexOf("972") === 0) h972 = true;
  }
  return h970 && h972;
}
function _pilSetFilter(f) {
  _PIL_FILTER = (_PIL_FILTER === f) ? "all" : f;
  ["_pilBtn_970", "_pilBtn_972"].forEach(function(id) {
    var b = document.getElementById(id);
    if (b) b.className = "pil-btn" + (id === "_pilBtn_" + _PIL_FILTER ? " pil-active" : "") + (id === "_pilBtn_970" ? " pil-btn-pal" : " pil-btn-isr");
  });
  renderNums();
}
function _pilRenderBar(show) {
  var bar = document.getElementById("pilFilterBar");
  if (!bar) return;
  if (!show) { bar.style.display = "none"; _PIL_FILTER = "all"; return; }
  bar.style.display = "flex";
  bar.innerHTML = '<button id="_pilBtn_970" onclick="_pilSetFilter(\'970\')" class="pil-btn pil-btn-pal">🇵🇸 Palestine</button>'
                 + '<button id="_pilBtn_972" onclick="_pilSetFilter(\'972\')" class="pil-btn pil-btn-isr">🇮🇱 Israel</button>';
  ["_pilBtn_970", "_pilBtn_972"].forEach(function(id) {
    var b = document.getElementById(id);
    if (b) b.className = "pil-btn" + (id === "_pilBtn_" + _PIL_FILTER ? " pil-active" : "") + (id === "_pilBtn_970" ? " pil-btn-pal" : " pil-btn-isr");
  });
}
// ═══ COPIED-NUMBER MEMORY (red = PERMANENT until unassigned) ═══
var COPIED_NUMS = new Set();
function _copiedStore(){ try { return JSON.parse(localStorage.getItem('zamil_copied_nums') || '{}'); } catch(e){ return {}; } }
function _copiedSaveStore(st){ try { localStorage.setItem('zamil_copied_nums', JSON.stringify(st)); } catch(e){} }
function _copiedNorm(it){ if (it && typeof it === 'object') return String(it.n || it.num || it.number || '').trim(); return String(it == null ? '' : it).trim(); }
function copiedLoad(rangeId){
  var s = new Set(), store = _copiedStore(), arr = store[rangeId] || [];
  if (Array.isArray(arr)) { for (var i=0;i<arr.length;i++){ var q=_copiedNorm(arr[i]); if (q) s.add(q); } }
  return s;
}
function copiedAddMany(rangeId, list){
  var store = _copiedStore();
  if (!Array.isArray(store[rangeId])) store[rangeId] = [];
  var have = {}; for (var h=0;h<store[rangeId].length;h++) have[_copiedNorm(store[rangeId][h])] = 1;
  for (var i=0;i<list.length;i++){
    var q = String(list[i] || '').trim(); if (!q) continue;
    COPIED_NUMS.add(q);
    if (!have[q]){ have[q] = 1; store[rangeId].push(q); }
  }
  store[rangeId] = store[rangeId].slice(-3000);
  _copiedSaveStore(store);
}
function copiedAdd(rangeId, q){ copiedAddMany(rangeId, [q]); }
// Purge red marks ONLY for numbers no longer present in the range (unassigned).
function copiedPurge(rangeId, currentNums){
  if (!currentNums || !currentNums.length) return;
  var store = _copiedStore(), arr = store[rangeId];
  if (!Array.isArray(arr) || !arr.length) return;
  var cur = {}; for (var i=0;i<currentNums.length;i++) cur[String(currentNums[i]).trim()] = 1;
  var kept = arr.filter(function(e){ return cur[_copiedNorm(e)]; });
  if (kept.length !== arr.length){ store[rangeId] = kept; _copiedSaveStore(store); COPIED_NUMS = copiedLoad(rangeId); }
}
// 🛡️ Survive logout: shield copied-memory from localStorage.clear/removeItem
(function(){
  try {
    var _oc = Storage.prototype.clear, _or = Storage.prototype.removeItem;
    Storage.prototype.clear = function(){
      if (this !== localStorage) return _oc.call(this);
      var keep = null; try { keep = this.getItem('zamil_copied_nums'); } catch(e){}
      _oc.call(this);
      if (keep) { try { this.setItem('zamil_copied_nums', keep); } catch(e){} }
    };
    Storage.prototype.removeItem = function(k){
      if (this === localStorage && k === 'zamil_copied_nums') return;
      return _or.call(this, k);
    };
  } catch(e){}
})();
// ═══ END COPIED-NUMBER MEMORY ═══

// ── end filter ───────────────────────────────────────────────────
function _purgeRangeCaches(rid){
  try{ localStorage.removeItem(numCacheKey(rid)); }catch(e){}
  try{ localStorage.removeItem('zamil_range_seen_' + rid); }catch(e){}
  try{ localStorage.removeItem('zamil_known_' + rid); }catch(e){}
  try{ localStorage.removeItem('zamil_newts_' + rid); }catch(e){}
}
function renderNums(){
  var list=document.getElementById("numList");
  var srch=(document.getElementById("numSearch")||{}).value||"";
  srch=srch.toLowerCase().trim();
  var pilActive = _PIL_FILTER !== "all";
  var idx=[];
  for(var k=0;k<DISP_NUMS.length;k++){
    if (pilActive) {
      var rawN = String(ALL_NUMS[k] || "").replace(/^\+|^00/, "");
      if (_PIL_FILTER === "970" && rawN.indexOf("970") !== 0) continue;
      if (_PIL_FILTER === "972" && rawN.indexOf("972") !== 0) continue;
    }
    if(!srch || DISP_NUMS[k].toLowerCase().indexOf(srch)>=0 || ALL_NUMS[k].toLowerCase().indexOf(srch)>=0) idx.push(k);
  }
  var total=idx.length;
  var numCountEl = document.getElementById("numCount");
if(numCountEl) numCountEl.textContent = total;
  document.getElementById("totalNums").textContent=total+" numbers";
  if(!total){ list.innerHTML="<div class=\"empty\"><div class=\"empty-icon\">📭</div>No numbers</div>"; return; }
  var html = "";
var _nts = _newTsLoad(ACTIVE_RANGE.id), _nowTs = Date.now();
for (var p = 0; p < total; p++) {
var i = idx[p];
    var num=DISP_NUMS[i]; var origNum=ALL_NUMS[i];
    var isNew = !!_nts[origNum] && ((_nowTs - _nts[origNum]) <= NEW_TAG_TTL);
    var isCopied = COPIED_NUMS.has(origNum);
    var cachedSms=NUM_SMS_CACHE[origNum];
    var smsBadge=(cachedSms!==undefined?String(cachedSms):"X")+"/"+SMS_DAILY_LIMIT;
    var badgeCls="num-sms-badge"+(cachedSms!==undefined&&cachedSms>0?" has-sms":"");
   html+= '<div class="num-item' + (isCopied ? ' num-copied' : '') + '" id="ni' + escHtml(origNum) + '" onclick="copySingle(this,\'' + escHtml(num) + '\',\'' + escHtml(origNum) + '\')">';
    html+="<span class=\"num-index\">"+(i+1)+"</span>";
    html+="<span class=\"num-val\">"+escHtml(num)+"</span>";
    if(isNew){ html+="<span class=\"num-new-tag\">NEW</span>"; }
    html+="<span class=\""+badgeCls+"\" id=\"sms_"+escHtml(origNum)+"\" onclick=\"event.stopPropagation();requestNotifPermission();openNumSmsModal('"+escHtml(origNum)+"')\" title=\"SMS today — tap for details\">"+smsBadge+"</span>";
    html+="</div>";
  }
  list.innerHTML=html;
}
function copySingle(elem,num,origNum){
  navigator.clipboard.writeText(num).then(function(){
    document.querySelectorAll(".num-item").forEach(function(x){ x.classList.remove("last-copied"); });
    elem.classList.add("last-copied");
    showMini("✓ Copied","success");
    if(origNum&&NEW_NUMS.has(origNum)){
      NEW_NUMS.delete(origNum); if (typeof newTagRemove === 'function') newTagRemove(ACTIVE_RANGE.id,origNum);
    _newTsDrop(ACTIVE_RANGE.id, origNum);
      var tag=elem.querySelector(".num-new-tag");
      if(tag){ tag.classList.add("num-new-tag-gone"); setTimeout(function(){ if(tag.parentNode) tag.parentNode.removeChild(tag); },300); }
    }
    // On-demand only: fetch this number's SMS count now that the user
    // has actually interacted with it (tapped/copied), instead of
    // pre-fetching every visible number in the background.
      if (origNum) {
  copiedAdd(ACTIVE_RANGE.id, origNum);   // remember in cache
  elem.classList.add('num-copied');      // paint instantly, no re-render needed
}
    if(origNum) fetchSingleNumSmsCount(origNum);
  });
}
function copyAll(){
  if(!DISP_NUMS.length) return;
  navigator.clipboard.writeText(DISP_NUMS.join("\n")).then(function(){
    var btn=document.getElementById("btnCopyAll");
    copiedAddMany(ACTIVE_RANGE.id, ALL_NUMS);
document.querySelectorAll('.num-item').forEach(function(x){ x.classList.add('num-copied'); });
    btn.textContent="✓ Copied!"; btn.classList.add("copied");
    showToast("✓ Copied "+DISP_NUMS.length+" numbers","success");
    setTimeout(function(){ btn.textContent="⎘ Copy All"; btn.classList.remove("copied"); },2000);
  });
}

// ─ SMS COUNT & REFRESH ──
var _SMS_LAST_CALL=0;
var _SMS_PREV_COUNT=null;
var _SMS_SEEN=null;
function _initSeenSet(){
  if(_SMS_SEEN) return;
  _SMS_SEEN=new Set();
  try {
    var raw=sessionStorage.getItem("sms_seen_keys");
    if(raw){ JSON.parse(raw).forEach(function(k){ _SMS_SEEN.add(k); }); }
  } catch(e){}
}
function _saveSeen(){
  try {
    var arr=Array.from(_SMS_SEEN).slice(-200);
    sessionStorage.setItem("sms_seen_keys",JSON.stringify(arr));
  } catch(e){}
}
function requestNotifPermission(){
  if(!("Notification" in window)) return;
  if(Notification.permission==="default"){
    try { Notification.requestPermission(function(p){ updateNotifBanner(); }); } catch(e){
      try { Notification.requestPermission().then(function(){ updateNotifBanner(); }); } catch(_){}
    }
  }
}
function updateNotifBanner(){
  var b=document.getElementById("notifBanner"); if(!b) return;
  if(!("Notification" in window)){ b.style.display="none"; return; }
  if(localStorage.getItem("notif_banner_dismissed")==="1"){ b.style.display="none"; return; }
  if(Notification.permission==="granted" || Notification.permission==="denied"){
    b.style.display="none";
    if(Notification.permission==="denied"){
      // Show a softer permanent hint when blocked
      b.style.display="flex";
      var t=b.querySelector(".notif-banner-text");
      if(t) t.innerHTML="<b>Notifications blocked.</b> Click the lock icon in your browser address bar → Site settings → allow Notifications, then refresh.";
      var btn=b.querySelector(".notif-banner-btn"); if(btn) btn.style.display="none";
    }
    return;
  }
  b.style.display="flex";
}
function enableNotifications(){
  if(!("Notification" in window)){ showToast("This browser doesn't support notifications","error"); return; }
  if(Notification.permission==="granted"){ updateNotifBanner(); return; }
  try{
    var p=Notification.requestPermission(function(){ updateNotifBanner(); });
    if(p && p.then){ p.then(function(res){
      updateNotifBanner();
      if(res==="granted"){
        try{ new Notification("Notifications enabled",{body:"You'll get instant SMS alerts.",icon:"/branding/favicon.ico"}); }catch(e){}
      }
    }); }
  }catch(e){ updateNotifBanner(); }
}
function dismissNotifBanner(){
  try{ localStorage.setItem("notif_banner_dismissed","1"); }catch(e){}
  var b=document.getElementById("notifBanner"); if(b) b.style.display="none";
}
// Auto-prompt on first user interaction (Chrome requires user gesture)
(function(){
  function once(){
    document.removeEventListener("click",once,true);
    document.removeEventListener("touchstart",once,true);
    requestNotifPermission();
    setTimeout(updateNotifBanner,300);
  }
  document.addEventListener("click",once,true);
  document.addEventListener("touchstart",once,true);
  // Also reflect current state on load
  if(document.readyState!=="loading") setTimeout(updateNotifBanner,200);
  else document.addEventListener("DOMContentLoaded",function(){ setTimeout(updateNotifBanner,200); });
})();
/* fireBrowserNotif defined below as window.fireBrowserNotif */
function _playSmsBeep(){
  try{
    var Ctx = window.AudioContext || window.webkitAudioContext; if(!Ctx) return;
    var ctx = new Ctx(); if(ctx.state === 'suspended') ctx.resume();
    var t = ctx.currentTime;
    var master = ctx.createGain(); master.gain.value = 1.4; master.connect(ctx.destination); // louder overall
    // tiny percussive tick (the "span" click)
    var k = ctx.createOscillator(), kg = ctx.createGain();
    k.type = 'square'; k.frequency.setValueAtTime(3200, t);
    kg.gain.setValueAtTime(0.0001, t); kg.gain.exponentialRampToValueAtTime(0.18, t+0.004); kg.gain.exponentialRampToValueAtTime(0.0001, t+0.05);
    k.connect(kg); kg.connect(master); k.start(t); k.stop(t+0.06);
    // two bright notes (D6 → G6) with a metallic 2nd harmonic
    [[1174.66, 0.02], [1567.98, 0.17]].forEach(function(p){
      var st = t + p[1];
      var o = ctx.createOscillator(), g = ctx.createGain();      // body (triangle = bell-ish)
      o.type = 'triangle'; o.frequency.setValueAtTime(p[0], st);
      g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(0.5, st+0.012); g.gain.exponentialRampToValueAtTime(0.0001, st+0.34);
      o.connect(g); g.connect(master); o.start(st); o.stop(st+0.36);
      var h = ctx.createOscillator(), hg = ctx.createGain();     // shimmer (2nd harmonic = the "span" edge)
      h.type = 'sine'; h.frequency.setValueAtTime(p[0]*2.0, st);
      hg.gain.setValueAtTime(0.0001, st); hg.gain.exponentialRampToValueAtTime(0.22, st+0.012); hg.gain.exponentialRampToValueAtTime(0.0001, st+0.22);
      h.connect(hg); hg.connect(master); h.start(st); h.stop(st+0.24);
    });
    setTimeout(function(){ try{ ctx.close(); }catch(e){} }, 800);
  }catch(e){}
}
function showSmsAlert(text, recent){
  var t=document.getElementById("smsAlertToast");
  if(!t){
    t=document.createElement("div");
    t.id="smsAlertToast";
    t.className="sms-alert-toast";
    document.body.appendChild(t);
  }
  var sub="";
  var preview="";
  if(recent && recent.length){
    var r=recent[0];
    sub="<div class=\"sat-from\">From <b>"+escHtml(r.cli||"Unknown")+"</b> → "+escHtml(r.number||"")+"</div>";
    if(r.message){ preview="<div class=\"sat-preview\">"+escHtml(String(r.message).slice(0,90))+"</div>"; }
  }
  t.innerHTML=
    "<div class=\"sat-icon\">📩</div>"+
    "<div class=\"sat-body\">"+
      "<div class=\"sat-title\">"+escHtml(text)+"</div>"+
      sub+preview+
    "</div>"+
    "<button class=\"sat-close\" onclick=\"this.parentNode.classList.remove('show')\">×</button>";
  t.classList.remove("show"); void t.offsetWidth;
  t.classList.add("show");
  clearTimeout(t._hideT);
  t._hideT=setTimeout(function(){ t.classList.remove("show"); }, 6000);
  if(navigator.vibrate){ try{ navigator.vibrate([120,50,120]); }catch(e){} }
  _playSmsBeep();
}
// Applies an /api/smscount result to the DOM. Called by:
//  - the leader tab, right after its own fetch
//  - follower tabs, when they receive the leader's broadcast
// NOTE: each tab keeps its own _SMS_PREV_COUNT/_SMS_SEEN so "new SMS"
// alerts/notifications still fire correctly in every open tab, even
// though only the leader tab actually made the network request.
function _applySmsResult(d) {
  if (!d || !d.ok) return;
  if (typeof sessionExtend === 'function') sessionExtend();
  
  var count = d.count !== undefined ? d.count : 0;
  var cs = count.toLocaleString();
  
  ["smsCountNum", "smsMiniNum", "smsBigNum", "bnSmsCount"].forEach(function(id) {
    var el = document.getElementById(id); 
    if (el) el.textContent = cs;
  });
  
  var ts = new Date(); 
  var t = ts.getHours().toString().padStart(2, "0") + ":" + 
          ts.getMinutes().toString().padStart(2, "0") + ":" + 
          ts.getSeconds().toString().padStart(2, "0");
          
  var bigSub = document.getElementById("smsBigSub"); 
  if (bigSub) bigSub.innerHTML = '<span class="live-dot"></span>Updated ' + t;
  
  var recent = (d.recent || []).slice().sort(function(a, b) {
    return String(b.datetime || b.time || "").localeCompare(String(a.datetime || a.time || ""));
  });
  
  if (_SMS_PREV_COUNT !== null && count !== _SMS_PREV_COUNT) { _SMS_RECENT_KEY = ""; }
  if (recent.length) { renderSmsRecent(recent); renderSmsReport(recent); }
  
  _initSeenSet();
  var freshItems = [];
  for (var i = 0; i < recent.length; i++) {
    var r = recent[i];
    var key = (r.time || "") + "|" + (r.number || "") + "|" + (r.cli || "") + "|" + (String(r.message || "").slice(0, 40));
    if (!_SMS_SEEN.has(key)) {
      _SMS_SEEN.add(key);
      if (_SMS_PREV_COUNT !== null) freshItems.push(r);
    }
  }
  _saveSeen();
  
  var delta = (_SMS_PREV_COUNT !== null) ? (count - _SMS_PREV_COUNT) : 0;
  if (_SMS_PREV_COUNT !== null && (delta > 0 || freshItems.length > 0)) {
    var n = Math.max(delta, freshItems.length);
    var msg = n + " new SMS";
    showSmsAlert(msg, freshItems);
    
    // ✅ TRIGGER FLOATING POPUP (Max 3 to avoid spam)
    var popupItems = freshItems.slice(0, 3);
    popupItems.forEach(function(item, idx) {
      setTimeout(function() {
        showOtpPopup(item.number, item.cli, item.message, item.range);
      }, idx * 200);
    });
    
    // Fire phone-style notifications
    var notifList = freshItems.slice(0, 5);
    if (notifList.length === 0 && delta > 0) {
      if (typeof fireBrowserNotif === 'function') fireBrowserNotif(n + " new SMS", "Total today: " + cs, "hyder-sms-bulk");
    } else {
      notifList.forEach(function(it) {
        var sender = it.cli || "Unknown";
        var title = sender + " → " + (it.number || "");
        var body = (it.message || "(no content)");
        if (typeof fireBrowserNotif === 'function') fireBrowserNotif(title, body, "hyder-sms-" + (it.number || "") + "-" + (it.time || ""));
      });
    }
  }
  _SMS_PREV_COUNT = count;
  var mini = document.getElementById("smsMiniBar");
  if (mini) { mini.classList.add("spinning"); setTimeout(function() { mini.classList.remove("spinning"); }, 400); }
}

function showOtpPopup(number, cli, message, range) {
var old = document.getElementById('otpFloatPopup');
if (old) old.remove();
var now = Date.now();
if (!window._otpBurst || now - window._otpBurst.t0 > 3000) window._otpBurst = { t0: now, n: 0 };
window._otpBurst.n++;
var burst = window._otpBurst.n;
var m = String(message || '').match(/\b(\d{4,8})\b/);
var code = m ? m[1] : '';
var t = new Date();
var hh = ('0' + t.getHours()).slice(-2), mm = ('0' + t.getMinutes()).slice(-2);
var popup = document.createElement('div');
popup.id = 'otpFloatPopup';
popup.innerHTML =
'<div class="ofp-head">' +
'<span class="ofp-cli"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/></svg>' + escHtml(cli || 'OTP') + '</span>' +
(burst > 1 ? '<span class="ofp-burst">' + burst + '+</span>' : '') +
'<span class="ofp-time">' + hh + ':' + mm + '</span>' +
'<button class="ofp-x" aria-label="close"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
'</div>' +
(code ? '<div class="ofp-code">' + code + '</div>' : '') +
(number ? '<div class="ofp-num"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="2" width="10" height="20" rx="2"/></svg>' + escHtml(number) + '</div>' : '') +
(message ? '<div class="ofp-msg">' + escHtml(String(message).slice(0, 90)) + '</div>' : '') +
(code ? '<div class="ofp-hint">tap card to copy code</div>' : '');
document.body.appendChild(popup);
popup.querySelector('.ofp-x').onclick = function (ev) { ev.stopPropagation(); window._otpBurst = null; popup.remove(); };
popup.onclick = function () {
if (!code) { popup.remove(); return; }
var done = function () {
var h = popup.querySelector('.ofp-hint');
if (h) { h.textContent = 'copied!'; h.style.color = 'var(--green,#16a34a)'; }
if (navigator.vibrate) navigator.vibrate(30);
setTimeout(function () { if (popup.parentNode) popup.remove(); }, 900);
};
if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, function () { fallbackCopy(code); done(); });
else { fallbackCopy(code); done(); }
};
clearTimeout(window._otpHideT);
window._otpHideT = setTimeout(function () { if (popup.parentNode) popup.remove(); window._otpBurst = null; }, 8000);
if (navigator.vibrate) { try { navigator.vibrate([100, 50, 100]); } catch (e) {} }
if (typeof _playSmsBeep === 'function') _playSmsBeep();
}
(function(){
var st = document.createElement('style');
st.textContent =
'#otpFloatPopup{position:fixed;bottom:84px;right:12px;left:12px;max-width:290px;margin-left:auto;z-index:10000;background:var(--surface,#fff);border:1px solid var(--border,#e2e8f0);border-left:3px solid var(--accent,#0891b2);border-radius:12px;padding:9px 11px;box-shadow:0 10px 30px rgba(0,0,0,.22);animation:otpSlideIn .3s cubic-bezier(.2,.9,.3,1.2);cursor:pointer}' +
'#otpFloatPopup .ofp-head{display:flex;align-items:center;gap:6px;margin-bottom:5px}' +
'#otpFloatPopup .ofp-cli{display:inline-flex;align-items:center;gap:5px;font-weight:800;font-size:.74rem;color:var(--text)}' +
'#otpFloatPopup .ofp-cli svg{color:var(--muted)}' +
'#otpFloatPopup .ofp-burst{font-size:.56rem;font-weight:800;color:#fff;background:linear-gradient(135deg,#f59e0b,#ef4444);border-radius:20px;padding:1px 7px}' +
'#otpFloatPopup .ofp-time{margin-left:auto;font-size:.62rem;font-weight:700;color:var(--muted)}' +
'#otpFloatPopup .ofp-x{margin-left:4px;border:none;background:transparent;color:var(--muted);cursor:pointer;padding:3px;border-radius:7px;line-height:0}' +
'#otpFloatPopup .ofp-x:hover{background:rgba(148,163,184,.15);color:var(--text)}' +
'#otpFloatPopup .ofp-code{display:inline-block;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;font-family:ui-monospace,monospace;font-weight:800;font-size:1.15rem;letter-spacing:3px;border-radius:9px;padding:6px 14px;margin:0 0 5px;box-shadow:0 4px 14px rgba(37,99,235,.3)}' +
'#otpFloatPopup .ofp-num{display:flex;align-items:center;gap:5px;font-family:ui-monospace,monospace;font-size:.7rem;font-weight:700;color:var(--text);margin-bottom:3px}' +
'#otpFloatPopup .ofp-num svg{color:var(--muted)}' +
'#otpFloatPopup .ofp-msg{font-size:.7rem;color:var(--muted);line-height:1.35;word-break:break-word;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
'#otpFloatPopup .ofp-hint{text-align:right;font-size:.58rem;font-weight:700;color:var(--accent,#0891b2);margin-top:4px}';
document.head.appendChild(st);
})();
// Inject Animation Keyframes
(function(){ 
  var st = document.createElement('style'); 
  st.textContent = '@keyframes otpSlideIn{from{opacity:0;transform:translateY(30px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}'; 
  document.head.appendChild(st); 
})();
(function(){ var st = document.createElement('style'); st.textContent = '@keyframes otpSlideIn{from{opacity:0;transform:translateY(30px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}'; document.head.appendChild(st); })();

function silentSmsRefresh(showSpinner){
  if(!SESSION) return;
  // Cross-tab dedupe: if another tab for this same user is already the
  // poll leader and is alive (recent heartbeat), skip the network call —
  // we'll receive its result via the "storage" broadcast instead.
  // showSpinner=true (manual/explicit refresh) always goes through so a
  // user-initiated refresh never silently does nothing.
  if(!showSpinner && !_maybeBecomeLeader()) return;

  var now=Date.now();
  if(now-_SMS_LAST_CALL<1000&&!showSpinner) return;
  _SMS_LAST_CALL=now;
  if(showSpinner){ var card=document.getElementById("smsCounterCard"); if(card) card.classList.add("spinning"); }
  apiCall("/api/smscount",{session:SESSION},function(d){
    var card=document.getElementById("smsCounterCard"); if(card) card.classList.remove("spinning");
    _applySmsResult(d);
    _broadcastSmsResult(d);
  });
}
// Legacy compat
function refreshSmsCount(){ silentSmsRefresh(true); }
function startSmsAutoRefresh(){
  if(_smsInterval) return;
  _maybeBecomeLeader();
  _startLeaderHeartbeat();

  _smsInterval = setInterval(function(){
    if(!SESSION) return;
    var onNumbers = document.getElementById('numbersPanel') && document.getElementById('numbersPanel').style.display === 'block';
    var onInbox = document.getElementById('inboxPage') && document.getElementById('inboxPage').style.display === 'block';

    if(onNumbers || onInbox) {
      apiCall('/api/boats/cdr/nudge', { session: SESSION }, function(){});
    }
    silentSmsRefresh(false);
  }, 2000);

  loadSmsRangeCounts();
  if(!window._smsRangeInterval){
    window._smsRangeInterval = setInterval(function(){
      if(!document.hidden) loadSmsRangeCounts();
    }, 30000);
  }
}

function loadSmsRangeCounts(){
if(!SESSION) return;
apiCall( "/api/smscount-range ",{session:SESSION,range: "week "},function(d){
if(d && d.ok){ var el=document.getElementById( "smsWeekNum "); if(el) el.textContent=(d.count||0).toLocaleString(); }
});
apiCall( "/api/smscount-range ",{session:SESSION,range: "month "},function(d){
if(d && d.ok){ var el=document.getElementById( "smsMonthNum "); if(el) el.textContent=(d.count||0).toLocaleString(); }
});
}

function stopSmsAutoRefresh(){ if(_smsInterval){clearInterval(_smsInterval);_smsInterval=null;} }
window.addEventListener("beforeunload", function(){
  // If this tab currently owns SMS-poll leadership, clear it so another
  // open tab (if any) claims leadership on its very next 3s tick instead
  // of waiting out the full stale-leader timeout.
  if(_isPollLeader){
    try{ localStorage.removeItem(_LEADER_KEY); }catch(e){}
  }
});

// ── SMS PAGE RENDER ──
var _RSMS_EXPANDED=false;

// ── Avatar color cycle ──
var _RSMS_AV_COLORS=[
  {bg:"rgba(124,92,255,.18)",color:"#c4b5ff",bgL:"#eeebff",colorL:"#4a38b0"},
  {bg:"rgba(0,212,245,.15)",color:"#7ae8f7",bgL:"#dff7fb",colorL:"#0077a0"},
  {bg:"rgba(255,140,40,.16)",color:"#ffb87a",bgL:"#fff0e0",colorL:"#a04a00"},
  {bg:"rgba(0,230,118,.14)",color:"#6ff5b0",bgL:"#dffff0",colorL:"#0a6e40"}
];
var _rsmsAvIdx=0;
function _rsmsNextColor(){ var c=_RSMS_AV_COLORS[_rsmsAvIdx%_RSMS_AV_COLORS.length]; _rsmsAvIdx++; return c; }

// Convert server time (HH:MM, treated as UTC) into the viewer's local time.
// Pakistan users naturally see +5h, India users +5:30h, etc.
function _rsmsLocalTime(rawTime){
  if(!rawTime||rawTime.length<4){ rawTime = new Date().toISOString().slice(11,16); }
  var parts=rawTime.split(':'); var hh=parseInt(parts[0],10)||0; var mm=parseInt(parts[1],10)||0;
  var pk=(hh+5)%24;                                   // server UTC → Pakistan = +5
  var ampm = pk>=12?'PM':'AM'; var h12 = pk%12||12;
  return h12+':'+(mm<10?'0':'')+mm+' '+ampm;          // Islamabad / Karachi time
}

function _rsmsItemHtml(r,isFirst,isNew){
  var cli=r.cli||"Unknown";
  var timeStr=_rsmsLocalTime(r.time);
  var firstCls=isFirst?" rsms-first":"";
  var newCls=isNew?" rsms-new-flash":"";
  var h="<div class=\"recent-item open rsms"+firstCls+newCls+"\">";
  h+="<div class=\"rsms-inner\">";
  // Row 1: Service name chip + time
  h+="<div class=\"rsms-head-row\">";
  h+="<div class=\"rsms-cli-wrap\">";
  h+="<div class=\"rsms-cli-icon\" aria-hidden=\"true\">&#128274;</div>";
  h+="<span class=\"rsms-name\">"+escHtml(cli)+"</span>";
  h+="</div>";
  h+="<span class=\"rsms-dev-time\">&#128336; "+escHtml(timeStr)+"</span>";
  h+="</div>";
  // Range row (location)
  if(r.range){
    h+="<div class=\"rsms-range\">&#128205; "+escHtml(r.range)+"</div>";
  }
  // Message bubble
  h+="<div class=\"rsms-msg-box\">";
  h+="<div class=\"rsms-shield\" aria-hidden=\"true\">&#128274;</div>";
  h+="<div class=\"rsms-body\">"+escHtml(r.message||"")+"</div>";
  h+="</div>";
  // Phone number — visible
  if(r.number){ h+="<div class=\"rsms-num-line\">"+escHtml(r.number)+"</div>"; }
  h+="</div>";
  h+="</div>";
  return h;
}
function toggleRsmsMore(){
  _RSMS_EXPANDED=!_RSMS_EXPANDED;
  _SMS_RECENT_KEY=""; // force re-render
  var items=window._RSMS_LAST||[];
  if(items.length) renderSmsRecent(items);
}
function renderSmsRecent(items){
  var el=document.getElementById("smsRecentList"); if(!el) return;
  if(!items||!items.length){
    if(_SMS_RECENT_KEY!=="empty"){
      el.innerHTML="<div style=\"padding:24px;text-align:center;color:var(--muted)\">📭 No messages yet</div>";
      _SMS_RECENT_KEY="empty";
    }
    return;
  }
  items=items.slice().sort(function(a,b){ return String(b.datetime||b.time||"").localeCompare(String(a.datetime||a.time||"")); });
  window._RSMS_LAST=items;
  var SHOW=_RSMS_EXPANDED?Math.min(items.length,50):Math.min(items.length,8);
  var nextKey=String(_RSMS_EXPANDED)+"::"+items.slice(0,SHOW).map(function(r){
    return [r.time||"",r.number||"",r.cli||"",r.range||"",String(r.message||"").slice(0,80)].join("|");
  }).join("||");
  if(nextKey===_SMS_RECENT_KEY) return;
  _SMS_RECENT_KEY=nextKey;
  _rsmsAvIdx=0;
  // Track the newest key to flash the top item if it changed
  var prevTopKey = _SMS_RECENT_KEY ? _SMS_RECENT_KEY.split("::")[1] : "";
  var curTopKey  = items[0] ? [items[0].time||"",items[0].number||"",items[0].cli||""].join("|") : "";
  var topIsNew   = !!prevTopKey && prevTopKey.split("||")[0] !== curTopKey;
  var h="";
  for(var i=0;i<SHOW;i++){ h+=_rsmsItemHtml(items[i],i===0, i===0 && topIsNew); }
  if(items.length>8){
    var rem=Math.min(items.length,20)-8;
    if(_RSMS_EXPANDED){
      h+="<button type=\"button\" class=\"rsms-more-btn\" onclick=\"toggleRsmsMore()\">▲ Show less</button>";
    } else if(rem>0){
      h+="<button type=\"button\" class=\"rsms-more-btn\" onclick=\"toggleRsmsMore()\">▼ Show "+rem+" more</button>";
    }
  }
  el.innerHTML=h;
}
window.toggleRsmsMore=toggleRsmsMore;
function expandMsg(el){ /* no-op: messages are open by default now */ }

function renderSmsReport(items){
  var el=document.getElementById("smsReportList"); if(!el) return;
  if(!items||!items.length){
    el.innerHTML="<div style=\"padding:24px;text-align:center;color:var(--muted)\">📭 No messages yet</div>";
    return;
  }
  // Sort newest first using full HH:MM:SS for accuracy
  var sorted=items.slice().sort(function(a,b){ return String(b.datetime||b.time||"").localeCompare(String(a.datetime||a.time||"")); });
  var h="";
  for(var i=0;i<sorted.length;i++){
    var r=sorted[i];
    var timeDisp=_rsmsLocalTime(r.time);
    h+="<div class=\"sms-report-item\" onclick=\"this.querySelector(\'.sms-report-msg\').style.display=this.querySelector(\'.sms-report-msg\').style.display===\'none\'?\'block\':\'none\'\">";
    h+="<div class=\"sms-report-row\">";
    h+="<span class=\"sms-report-num\">"+escHtml(r.number||r.cli||"")+"</span>";
    h+="<span class=\"sms-report-time\">"+escHtml(timeDisp)+"</span>";
    h+="</div>";
    if(r.range) h+="<span class=\"sms-report-range\">"+escHtml(r.range)+"</span>";
    h+="<div class=\"sms-report-msg\" style=\"display:none\">"+escHtml(r.message||"")+"</div>";
    h+="</div>";
  }
  el.innerHTML=h;
}
window.renderSmsReport=renderSmsReport;

// Patch loadNumbers for range auto-refresh
var _origLoadNumbers=window.loadNumbers;
// Already defined above, patch inline:
(function(){
  var _orig=loadNumbers;
  window._loadNumbersOrig=_orig;
})();

// ── PER-NUMBER SMS ──
// Fetches the SMS count for ONE number, on demand — called when the
// user taps/copies that specific number. No more bulk pre-loading or
// background polling of every number's count; that was hitting the
// upstream provider for numbers nobody was even looking at.
function fetchSingleNumSmsCount(n){
  if(!SESSION||!n) return;
  if(NUM_SMS_CACHE[n]!==undefined) return; // already have it, don't re-fetch
  var el=document.getElementById("sms_"+n);
  if(el){ el.classList.add("loading"); }
  apiCall("/api/number-smscount",{session:SESSION,number:n},function(d){
    if(d&&d.ok){
      NUM_SMS_CACHE[n]=d.count; _otpSave();
      var el2=document.getElementById("sms_"+n);
      if(el2){ el2.textContent=d.count+"/"+SMS_DAILY_LIMIT; el2.className="num-sms-badge"+(d.count>0?" has-sms":""); }
    } else if(el){
      el.classList.remove("loading");
    }
  });
}

function stopNumSmsBg(){ if(_numSmsBgInterval){clearInterval(_numSmsBgInterval);_numSmsBgInterval=null;} }
function openNumSmsModal(number){
  var modal=document.getElementById("numSmsModal");
  var title=document.getElementById("numSmsTitle");
  var body=document.getElementById("numSmsBody");
  if(!modal) return;
  title.textContent="📲 "+number;
  body.innerHTML="<div class=\"spinner\" style=\"margin:20px auto;display:block;width:22px;height:22px\"></div>";
  modal.style.display="flex";
  document.body.style.overflow="hidden";
  apiCall("/api/number-smscount",{session:SESSION,number:number},function(d){
    if(!d||!d.ok){ body.innerHTML="<div style=\"color:var(--red);padding:16px\">Failed: "+(d&&d.error?d.error:"error")+"</div>"; return; }
    renderNumSmsModal(d);
    NUM_SMS_WATCHING.add(number); NUM_SMS_PREV[number]=d.count;
    startNumSmsWatch();
  });
}
function closeNumSmsModal(){ var m=document.getElementById("numSmsModal"); if(m)m.style.display="none"; document.body.style.overflow=""; }
function renderNumSmsModal(d){
  var body=document.getElementById("numSmsBody"); if(!body) return;
  var watching=NUM_SMS_WATCHING.has(d.number);
  var h="<div style=\"padding:16px 20px\">";
  h+="<div style=\"display:flex;align-items:center;gap:12px;margin-bottom:16px\">";
  h+="<div style=\"background:linear-gradient(135deg,var(--accent),var(--accent2));border-radius:12px;padding:10px 16px;font-family:ui-monospace,'SF Mono','Cascadia Code',monospace;font-size:1.4rem;font-weight:700;color:#000\">"+d.count.toLocaleString()+"</div>";
  h+="<div><div style=\"font-size:.7rem;color:var(--muted);text-transform:uppercase;font-weight:600\">SMS Today</div><div style=\"font-size:.75rem;color:var(--muted);margin-top:2px\">"+escHtml(d.number)+"</div></div>";
  h+="<div style=\"margin-left:auto\"><button onclick=\"toggleNumWatch('"+escHtml(d.number)+"')\" style=\"padding:7px 13px;border-radius:18px;border:1.5px solid "+(watching?"var(--accent)":"var(--border)")+";background:"+(watching?"rgba(0,212,245,.14)":"var(--surface)")+";color:"+(watching?"var(--accent)":"var(--muted)")+";font-size:.75rem;font-weight:700;cursor:pointer;font-family:inherit\">"+(watching?"🔔 Watching":"🔕 Watch")+"</button></div>";
  h+="</div>";
  if(d.recent&&d.recent.length){
    h+="<div style=\"font-size:.72rem;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px\">Recent Messages</div>";
    for(var i=0;i<d.recent.length;i++){
      var r=d.recent[i];
      h+="<div style=\"background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:10px 13px;margin-bottom:7px\">";
      h+="<div style=\"display:flex;align-items:center;gap:8px;margin-bottom:4px\">";
      h+="<span style=\"font-family:ui-monospace,'SF Mono','Cascadia Code',monospace;font-size:.68rem;color:var(--accent)\">"+escHtml(r.time)+"</span>";
      h+="<span style=\"font-size:.68rem;color:var(--accent2);background:rgba(124,92,255,.12);border:1px solid rgba(124,92,255,.22);padding:1px 7px;border-radius:6px;font-weight:600\">"+escHtml(r.cli||"—")+"</span>";
      h+="</div>";
      h+="<div style=\"font-size:.8rem;line-height:1.4\">"+escHtml(r.message||"—")+"</div>";
      if(r.range)h+="<div style=\"font-size:.65rem;color:var(--accent);margin-top:4px\">"+escHtml(r.range)+"</div>";
      h+="</div>";
    }
  } else { h+="<div style=\"text-align:center;padding:20px;color:var(--muted);font-size:.82rem\">No messages today</div>"; }
  h+="</div>";
  body.innerHTML=h;
}
function toggleNumWatch(number){
  if(NUM_SMS_WATCHING.has(number)){ NUM_SMS_WATCHING.delete(number); delete NUM_SMS_PREV[number]; showToast("Stopped watching "+number,"info"); }
  else { NUM_SMS_WATCHING.add(number); showToast("Watching "+number,"success"); startNumSmsWatch(); }
  var t=document.getElementById("numSmsTitle");
  if(t&&t.textContent==="📲 "+number){ apiCall("/api/number-smscount",{session:SESSION,number:number},function(d){ if(d&&d.ok) renderNumSmsModal(d); }); }
}
function startNumSmsWatch(){
  if(_numSmsInterval) return;
  _numSmsInterval=setInterval(function(){
    if(!SESSION||NUM_SMS_WATCHING.size===0){stopNumSmsWatch();return;}
    NUM_SMS_WATCHING.forEach(function(number){
      apiCall("/api/number-smscount",{session:SESSION,number:number},function(d){
        if(!d||!d.ok) return;
        var prev=NUM_SMS_PREV[number];
        if(prev!==undefined&&d.count>prev){
          var diff=d.count-prev;
          showToast(" "+number+": +"+diff+" new SMS!","success");
          if(window.Notification&&Notification.permission==="granted"){
            new Notification("New SMS on "+number,{body:"+"+diff+" message"+(diff>1?"s":"")+(d.recent&&d.recent[0]?" — "+d.recent[0].message.substring(0,60):""),icon:""});
          }
        }
       NUM_SMS_PREV[number]=d.count; NUM_SMS_CACHE[number]=d.count; _otpSave();
        var t=document.getElementById("numSmsTitle");
        if(t&&t.textContent===" "+number) renderNumSmsModal(d);
      });
    });
  },30000);
}
function stopNumSmsWatch(){ if(_numSmsInterval){clearInterval(_numSmsInterval);_numSmsInterval=null;} }
// (requestNotifPermission defined above)

// ── LEADERBOARD ──
// ── LEADERBOARD ──
var _LB_ICONS = [
  "M13 2L3 14h7l-1 8 10-12h-7z",
  "M12 2l2.9 6.3 6.9.7-5.1 4.6 1.4 6.8L12 17.8 5.9 20.4l1.4-6.8L2.2 9l6.9-.7z",
  "M12 2c.6 2.4-1.6 3.6-1.6 6 0 1 .8 1.8 1.8 1.8s1.8-.8 1.8-1.8c0-.6-.1-1 .3-1.7 1.3 1.3 2.2 2.9 2.2 4.7a4.5 4.5 0 1 1-9 0c0-2.6 1.8-4.4 2.7-6.2.6-1.1.9-1.8 1.8-2.8z",
  "M12 2a10 10 0 100 20 10 10 0 000-20zm0 4a6 6 0 110 12 6 6 0 010-12zm0 3a3 3 0 100 6 3 3 0 000-6z",
  "M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5z",
  "M6 3h12l3 5-9 13L3 8z",
  "M12 2c3 2 5 6 5 10l-3 3h-4l-3-3c0-4 2-8 5-10zm0 8a2 2 0 100 4 2 2 0 000-4zM9 18l-2 4 3-1 2-3zm6 0l2 4-3-1-2-3z",
  "M3 7l4 4 5-7 5 7 4-4-2 12H5z"
];
function _lbHash(s){ s=String(s||''); var h=2166136261; for(var i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return Math.abs(h); }
function _lbHue(name){ return _lbHash(name) % 360; }
function _lbStreak(name, range){ var b=1+(_lbHash(name)%6); if(range==='week')b+=3; if(range==='month')b+=8; return b; }
function _lbIconSvg(name){ var d=_LB_ICONS[_lbHash(name)%_LB_ICONS.length]; return '<svg class="lb-icon" viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd" aria-hidden="true"><path d="'+d+'"/></svg>'; }
function _lbFlameSvg(){ return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2c.6 2.4-1.6 3.6-1.6 6 0 1 .8 1.8 1.8 1.8s1.8-.8 1.8-1.8c0-.6-.1-1 .3-1.7 1.3 1.3 2.2 2.9 2.2 4.7a4.5 4.5 0 1 1-9 0c0-2.6 1.8-4.4 2.7-6.2.6-1.1.9-1.8 1.8-2.8z"/></svg>'; }
function _lbCrownSvg(){ return '<svg class="lb-crown-svg" viewBox="0 0 64 48" aria-hidden="true"><defs><linearGradient id="lbCrownGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fde68a"/><stop offset="1" stop-color="#f59e0b"/></linearGradient></defs><path d="M6 14l12 10L32 8l14 16 12-10-5 26H11z" fill="url(#lbCrownGrad)" stroke="#b45309" stroke-width="1.5" stroke-linejoin="round"/><circle cx="6" cy="13" r="3.2" fill="#fbbf24"/><circle cx="58" cy="13" r="3.2" fill="#fbbf24"/><circle cx="32" cy="6" r="3.4" fill="#fcd34d"/></svg>'; }
function _lbRaysSvg(){ var s='<svg viewBox="0 0 84 84" aria-hidden="true">'; for(var i=0;i<12;i++){ var a=(i/12)*Math.PI*2; s+='<line class="ray" x1="'+(42+Math.cos(a)*30).toFixed(1)+'" y1="'+(42+Math.sin(a)*30).toFixed(1)+'" x2="'+(42+Math.cos(a)*40).toFixed(1)+'" y2="'+(42+Math.sin(a)*40).toFixed(1)+'"/>'; } return s+'</svg>'; }
function renderLeaderboard(users, me, total){
  var lbList=document.getElementById('lbList'), lbComing=document.getElementById('lbComing');
  var lbSub=document.querySelector('.lb-sub');
  if(lbSub){ var t=new Date(); lbSub.textContent='Top SMS Senders · updated '+((t.getHours()%12||12)+':'+(t.getMinutes()<10?'0':'')+t.getMinutes()+' '+(t.getHours()>=12?'PM':'AM')); }
  if(!users||!users.length){ if(lbComing){ lbComing.style.display='block'; var s=lbComing.querySelector('.lb-coming-sub'); if(s) s.textContent='No SMS yet for this period.'; } if(lbList){ lbList.style.display='none'; lbList.innerHTML=''; } return; }
  if(lbComing) lbComing.style.display='none'; if(lbList) lbList.style.display='block';
  var top3=users.slice(0,3), order=[1,0,2];
  var ph='<div class="lb-podium-wrap"><div class="lb-podium">';
  for(var pi=0;pi<order.length;pi++){ var idx=order[pi], u=top3[idx]; if(!u){ ph+='<div class="lb-podium-col"></div>'; continue; } var rank=idx+1, hue=_lbHue(u.username);
    ph+='<div class="lb-podium-col p'+rank+'" style="--lb-hue:'+hue+'">';
    if(rank===1) ph+='<div class="lb-rays">'+_lbRaysSvg()+'</div>'+_lbCrownSvg();
    ph+='<div class="lb-hex">'+rank+'</div><div class="lb-podium-top">'
      +'<div class="lb-podium-avatar">'+_lbIconSvg(u.username)+'<span class="lb-active-dot"></span></div>'
      +'<div class="lb-podium-name" title="'+escHtml(u.username)+'">'+escHtml(u.username)+'</div>'
      +'<div class="lb-podium-score">'+(u.count||0).toLocaleString()+'</div>'
      +'<div class="lb-podium-score-lbl">SMS</div></div><div class="lb-podium-block"></div></div>';
  }
  ph+='</div></div>';
  var rest=users.slice(3,10);   // show 10 total (3 podium + 7)
  var lh='<div class="lb-table"><div class="lb-thead"><div class="lb-th lb-th-rank">RANK</div><div class="lb-th lb-th-user">SENDER</div><div class="lb-th lb-th-streak">'+_lbFlameSvg()+'</div><div class="lb-th lb-th-vol">SMS</div></div>';
  for(var i=0;i<rest.length;i++){ var ru=rest[i], rhue=_lbHue(ru.username);
    lh+='<div class="lb-row" style="--lb-hue:'+rhue+'"><div class="lb-rank">'+(i+4)+'</div>'
      +'<div class="lb-user-cell"><div class="lb-avatar">'+_lbIconSvg(ru.username)+'<span class="lb-active-dot"></span></div><div class="lb-name" title="'+escHtml(ru.username)+'">'+escHtml(ru.username)+'</div></div>'
      +'<div class="lb-streak-cell"><span class="lb-streak-chip">'+_lbFlameSvg()+_lbStreak(ru.username, LB_RANGE)+'</span></div>'
      +'<div class="lb-vol"><span class="lb-vol-num">'+(ru.count||0).toLocaleString()+'</span></div></div>';
  }
  if(me){ var inTop=users.slice(0,10).some(function(x){return x.username===me.username;});
    if(!inTop){ var mhue=_lbHue(me.username);
      lh+='<div class="lb-row lb-row-me" style="--lb-hue:'+mhue+'"><div class="lb-rank lb-rank-me">#'+me.rank+'</div>'
        +'<div class="lb-user-cell"><div class="lb-avatar lb-avatar-me">'+_lbIconSvg(me.username)+'<span class="lb-active-dot"></span></div><div class="lb-name">'+escHtml(me.username)+' <span class="lb-you-tag">you</span></div></div>'
        +'<div class="lb-streak-cell"><span class="lb-streak-chip">'+_lbFlameSvg()+_lbStreak(me.username, LB_RANGE)+'</span></div>'
        +'<div class="lb-vol"><span class="lb-vol-num">'+(me.count||0).toLocaleString()+'</span></div></div>'; } }
  lh+='</div>';
  if(lbList) {
      var _newLbHtml = ph + lh;
      if (_newLbHtml !== window._lbLastHtml) {
        window._lbLastHtml = _newLbHtml;
        if (!document.getElementById('lbSilentCSS')) {
          var st = document.createElement('style'); st.id = 'lbSilentCSS';
          st.textContent = '#lbSparkle{position:absolute;top:0;left:0;right:0;height:0;overflow:visible;text-align:center;font-size:10px;line-height:14px;letter-spacing:6px;color:#f5c542;opacity:0;transition:opacity .5s ease;pointer-events:none;z-index:5;}#lbSparkle.active{opacity:.55;}';
          document.head.appendChild(st);
        }
        var _sp = document.getElementById('lbSparkle');
        if (!_sp && lbList.parentElement) { _sp = document.createElement('div'); _sp.id = 'lbSparkle'; _sp.textContent = '✨ ⭐ '; lbList.parentElement.style.position='relative'; lbList.parentElement.insertBefore(_sp, lbList); }
        if (_sp) { _sp.classList.add('active'); setTimeout(function(){ _sp.classList.remove('active'); }, 900); }
        lbList.innerHTML = _newLbHtml;
      }
    }
}
function loadLeaderboard(range){
  if(!SESSION) return;
  if(range) LB_RANGE=range;
  var lbComing=document.getElementById('lbComing'), lbList0=document.getElementById('lbList'), lbSpin0=document.getElementById('lbSpin');
  if(lbSpin0){ lbSpin0.style.display='inline-flex'; lbSpin0.onclick=function(){ LB_CACHE[LB_RANGE]=null; loadLeaderboard(); }; }   // stays visible + works
  document.querySelectorAll('.lb-range-btn').forEach(function(b){ b.classList.toggle('selected', b.dataset.range===LB_RANGE); });
  var cached=LB_CACHE[LB_RANGE];
  if(cached && cached.users) renderLeaderboard(cached.users, cached.me, cached.total);   // instant from cache
  var lbPanel = parseInt(localStorage.getItem('app_panel_num')||'1',10)||1;
  apiCall('/api/leaderboard',{session:SESSION,range:LB_RANGE,panelNum:lbPanel},function(d){
    if(lbSpin0) lbSpin0.style.display='inline-flex';
    if(!d||!d.ok||!d.users||!d.users.length){ if(!cached) renderLeaderboard([]); return; }
    LB_CACHE[LB_RANGE]={ts:Date.now(),users:d.users||[],me:d.me||null,total:d.total||0};
    renderLeaderboard(d.users||[], d.me||null, d.total||0);
  });
}

if (!window._lbAutoT) {
  window._lbAutoT = setInterval(function(){
    var p = document.getElementById('top10Page');
    if (p && p.style.display === 'block' && SESSION) loadLeaderboard();
  }, 10000);
}

// ─ ALLOC MODAL ──
var ASTATE={clientId:null,clientName:null,panelNum:1,selectedRangeId:null,selectedRangeTitle:null,payterm:null,payout:null,ranges:[],availCache:{}};
var PAYTERM_OPTS={"1":"Daily","2":"Weekly","3":"Weekly7","4":"BiWeekly","5":"BiWeekly30","6":"Monthly15","7":"Monthly30","8":"Monthly45","9":"Monthly60"};
var PAYOUT_PRESETS=[0,0.01,0.025,0.05,0.1];
var ADD_PAGE_INITED=false;

// 🔥 UPDATED: Reset allocation state properly
function initAddPage(force){
  // Reset only if not yet verified or forced
  if(!force && ASTATE.clientId) return;
  
  // 🔥 DYNAMIC: Get real client info from localStorage (set during login)
  ASTATE.clientId = localStorage.getItem("app_client_id") || "0";
  ASTATE.clientName = localStorage.getItem("app_client_name") || USERNAME;
  ASTATE.panelNum = parseInt(localStorage.getItem("app_panel_num") || "1");
  ASTATE.selectedRangeId = null;
  ASTATE.selectedRangeTitle = null;
  ASTATE.payterm = "2";
  ASTATE.payout = "0.01";
  ASTATE.ranges = [];
  ASTATE.availCache = {};
  
  var sc = document.getElementById("aSearchCard"); if(sc) sc.style.display="none";
  var ac = document.getElementById("aAllocCard"); if(ac) ac.style.display="none";
  var rl = document.getElementById("aRangeList"); if(rl) rl.innerHTML="<div class=\"empty\" style=\"font-size:.78rem;color:var(--muted);padding:14px 8px;text-align:center\">Type a country or keyword above to find available ranges.</div>";
  var ar = document.getElementById("aAllocResult"); if(ar){ ar.style.display="none"; ar.innerHTML=""; }
  var lb = document.getElementById("aLimitBar"); if(lb) lb.innerHTML="";
  var ci = document.getElementById("aCountryInput"); if(ci) ci.value="";
  
  autoVerifyClient();
  ADD_PAGE_INITED = true;
}

function autoVerifyClient(){
  var info=document.getElementById("aClientInfo");
  if(!info) return;
  // Use cached panel info from login — no extra API call needed.
  var cId  = localStorage.getItem("app_client_id");
  var cNm  = localStorage.getItem("app_client_name") || USERNAME;
  var pNum = parseInt(localStorage.getItem("app_panel_num")||"1") || 1;
  if(cId){
    ASTATE.clientId=cId; ASTATE.clientName=cNm; ASTATE.panelNum=pNum;
    info.innerHTML="<div class=\"alloc-verified-dot\"></div><span style=\"font-weight:600;color:var(--green)\">✓ "+escHtml(cNm)+"</span><span style=\"margin-left:8px;font-size:.75rem;color:var(--muted)\">ID: "+escHtml(cId)+" • Panel "+pNum+"</span>";
    document.getElementById("aSearchCard").style.display="";
    var ci=document.getElementById("aCountryInput"); if(ci) ci.focus();
    return;
  }
  // Fallback for older sessions (no cached client) — verify once and cache.
  info.innerHTML="<div class=\"spinner\" style=\"width:14px;height:14px\"></div><span>Verifying \""+escHtml(USERNAME)+"\"…</span>";
  apiCall("/api/alloc/verify-client",{clientId:USERNAME},function(d){
    if(d.ok){
      ASTATE.clientId=d.id; ASTATE.clientName=d.name; ASTATE.panelNum=d.panelNum||1;
      try{
        localStorage.setItem("app_client_id",String(d.id));
        localStorage.setItem("app_client_name",String(d.name));
        localStorage.setItem("app_panel_num",String(d.panelNum||1));
      }catch(e){}
      info.innerHTML="<div class=\"alloc-verified-dot\"></div><span style=\"font-weight:600;color:var(--green)\">✓ "+escHtml(d.name)+"</span><span style=\"margin-left:8px;font-size:.75rem;color:var(--muted)\">ID: "+escHtml(d.id)+"</span>";
      document.getElementById("aSearchCard").style.display="";
      var ci=document.getElementById("aCountryInput"); if(ci) ci.focus();
    } else {
      info.innerHTML="<span style=\"color:var(--red)\">❌ "+(d.error?"Error: "+escHtml(d.error):"Your ID was not found in the agent panel. Contact admin.")+"</span> <button class=\"btn btn-sm btn-ghost\" style=\"margin-left:8px\" onclick=\"initAddPage(true)\">Retry</button>";
    }
  });
}

// 🔥 UPDATED: Search ranges with proper filtering
function allocSearch(){
  var q = document.getElementById("aCountryInput").value.trim();
  if (!q) { showToast("Type a country or range name", "error"); return; }
  var btn = document.getElementById("aSearchBtn"); var list = document.getElementById("aRangeList");
  btn.disabled = true; btn.textContent = "…";
  list.innerHTML = "<div class=\"empty\"><div class=\"spinner\"></div></div>";
  ASTATE.availCache = {};
  apiCall("/api/alloc/search-ranges", { query: q, session: SESSION }, function(d){
    btn.disabled = false; btn.textContent = "🔍 Search";
    var ranges = (d && d.ranges) || [];
    ASTATE.ranges = ranges;
    // 🔥 Use the available counts the server ALREADY computed (no extra requests, no wrong overwrite)
    ranges.forEach(function(r){ ASTATE.availCache[r.id] = { available: r.available || 0, total: r.total || 0 }; });
    if (!ranges.length) { list.innerHTML = "<div class=\"empty\" style=\"color:var(--red)\">No available ranges for \"" + escHtml(q) + "\"</div>"; return; }
    renderAllocRanges();
  });
}
document.addEventListener("keydown",function(e){ if(e.key==="Enter"&&document.activeElement===document.getElementById("aCountryInput")) allocSearch(); });

function renderAllocRanges(){
  var html = ""; var stillChecking = false;
  for (var j = 0; j < ASTATE.ranges.length; j++){ if (ASTATE.availCache[ASTATE.ranges[j].id] === null){ stillChecking = true; break; } }
  for (var i = 0; i < ASTATE.ranges.length; i++){
    var r = ASTATE.ranges[i]; var avail = ASTATE.availCache[r.id]; var badge = "";
    if (avail === null) badge = "<span class=\"avail-wait\"><span class=\"spinner\" style=\"width:10px;height:10px;border-width:1.5px\"></span></span>";
    else if (avail !== undefined) {
      if (avail.available > 0) badge = "<span class=\"avail-ok\">✓ " + avail.available + " available</span>";
      else badge = "<span class=\"avail-no\">✕ Not available</span>";
    }
    var isNone = avail !== undefined && avail !== null && avail.available === 0;
    var disabled = stillChecking || isNone;
    var onclick = disabled ? "" : "onclick=\"selectAllocRange(this)\"";
    var extraStyle = disabled ? "cursor:not-allowed;opacity:.45;" : "";
    html += "<div class=\"alloc-range-item\" data-id=\"" + escHtml(r.id) + "\" data-title=\"" + escHtml(r.title) + "\" " + onclick + " style=\"" + extraStyle + "\">";
    html += "<div><div class=\"alloc-range-name\">" + escHtml(r.title) + "</div><div class=\"alloc-range-id\">" + escHtml(r.country || "") + "</div></div>";
    html += "<div>" + badge + "</div></div>";
  }
  document.getElementById("aRangeList").innerHTML = html;
}

function selectAllocRange(el){
var id=el.dataset.id; var title=el.dataset.title;
ASTATE.selectedRangeId=id; ASTATE.selectedRangeTitle=title;
document.querySelectorAll(".alloc-range-item").forEach(function(x){x.classList.remove("ar-selected");});
el.classList.add("ar-selected");
document.getElementById("aSelRangeInfo").textContent="📡 "+title+" (ID: "+id+")";
document.getElementById("aAllocResult").style.display="none";
ASTATE.payterm="2"; ASTATE.payout="0.01";

// ✅ NEW: cap quantity to real available numbers
var avail = ASTATE.availCache[id];
var maxAvail = (avail && typeof avail.available === 'number') ? avail.available : 0;
var qtyInput = document.getElementById("aQtyInput");
if (qtyInput) {
  qtyInput.max = Math.max(1, Math.min(50, maxAvail));
  var cur = parseInt(qtyInput.value, 10) || 0;
  if (cur > maxAvail || cur < 1) qtyInput.value = Math.max(1, Math.min(50, maxAvail));
}
var lblEl = document.getElementById("aQtyLabel");
if (lblEl) lblEl.textContent = "QUANTITY (1–" + Math.max(1, Math.min(50, maxAvail)) + ")";
if (window.syncAllocBtnState) window.syncAllocBtnState();

document.getElementById("aLimitBar").innerHTML="📅 Checking today's limits…";
apiCall("/api/alloc/daily-used",{session:SESSION,rangeTitle:title,rangeId:id},function(dd){
var _cty=(dd&&dd.country)?dd.country:'';
var _ru=(dd&&dd.rangeUsed!=null)?dd.rangeUsed:0, _rl=(dd&&dd.rangeLimit)||2;
var _cu=(dd&&dd.countryUsed!=null)?dd.countryUsed:0, _cl=(dd&&dd.countryLimit)||3;
document.getElementById("aLimitBar").innerHTML="📅 "+(_cty?escHtml(_cty)+" — ":"")+"Range <strong>"+_ru+"/"+_rl+"</strong> · Country <strong>"+_cu+"/"+_cl+"</strong>";
if (window.syncAllocBtnState) window.syncAllocBtnState();
});
document.getElementById("aAllocCard").style.display="";
document.getElementById("aAllocCard").scrollIntoView({behavior:"smooth",block:"nearest"});
}

function aBackToSearch(){
  document.getElementById("aAllocCard").style.display="none";
  document.querySelectorAll(".alloc-range-item").forEach(function(x){x.classList.remove("ar-selected");});
  ASTATE.selectedRangeId=null; ASTATE.selectedRangeTitle=null;
  var ci=document.getElementById("aCountryInput"); if(ci) ci.focus();
}

// ✅ doAllocate lives in PATCH v2 at the bottom (single source of truth).
function startQueuePolling() {
    const pollInterval = setInterval(() => {
        apiCall("/api/alloc/queue-status", { session: SESSION }, function(q) {
            if (q && q.ok) {
                const stats = document.querySelector('.queue-stats');
                if (stats) stats.style.display = 'block';
                
                const posEl = document.getElementById('queuePos');
                const etaEl = document.getElementById('queueEta');
                
                if (q.myPosition > 0) {
                    if (posEl) posEl.textContent = `#${q.myPosition}`;
                    if (etaEl) etaEl.textContent = q.myEtaMins <= 1 ? 'Less than 1 min' : `~${q.myEtaMins} mins`;
                } else {
                    // 🎉 SUCCESS! User's batch is cleared
                    clearInterval(pollInterval);
                    const res = document.getElementById("aAllocResult");
                    res.className = "alloc-result ok";
                    res.innerHTML = `
                        <div style="text-align:center; padding:20px;">
                            <div style="margin-bottom:10px;"><svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="var(--green,#16a34a)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" opacity=".25"/><path d="m8.4 12.3 2.5 2.5 4.7-5"/></svg></div>
                            <h3 style="margin:0; color:var(--green);">Docked Successfully!</h3>
                            <p style="color:var(--muted); font-size:0.9rem; margin-top:5px;">Numbers are now live in your Ranges.</p>
                        </div>
                    `;
                    try { localStorage.removeItem(CACHE_KEY_RANGES); } catch(e){}
                    loadRanges(true);
                    _autoRefreshOpenRange();
                }
            }
        });
    }, 3000); // Poll every 3 seconds
    
    // Safety timeout: stop polling after 15 minutes
    setTimeout(() => clearInterval(pollInterval), 15 * 60 * 1000);
}

// ── DROPDOWN & PROFILE ──
function toggleDropdown(){
  var dd=document.getElementById("profileDropdown");
  if(dd) dd.classList.toggle("open");
}
document.addEventListener("click",function(e){
  var dd=document.getElementById("profileDropdown");
  var btn=document.querySelector(".profile-btn");
  if(dd && btn && !dd.contains(e.target) && !btn.contains(e.target)){
    dd.classList.remove("open");
  }
});

// ── BOTTOM NAV SWITCH ── (SPA style - no page reload)
var _LAST_MAIN_SUB = "ranges"; // remember "ranges" or "numbers" before leaving main
var _NUMBERS_SCROLL = 0;       // remember scroll inside numbers list when leaving

// 🔥 UPDATED: Bottom nav switch with proper state management
function bnSwitch(page){
  // Remember sub-state + scroll before leaving main screen
  var ms = document.getElementById("mainScreen");
  if(ms && ms.style.display!=="none"){
    var np = document.getElementById("numbersPanel");
    var onNumbers = (np && np.style.display==="block");
    _LAST_MAIN_SUB = onNumbers ? "numbers" : "ranges";
    if(onNumbers){
      _NUMBERS_SCROLL = window.pageYOffset || document.documentElement.scrollTop || 0;
    }
  }
  
  var pages=["mainScreen","addNumPage","top10Page","inboxPage"];
  pages.forEach(function(p){ var el=document.getElementById(p); if(el) el.style.display="none"; });
  
  var rangesPanel=document.getElementById("rangesPanel");
  var numbersPanel=document.getElementById("numbersPanel");
  
  document.querySelectorAll(".bn-item").forEach(function(btn){
    btn.classList.remove("active");
    if(btn.getAttribute("data-page") === page) btn.classList.add("active");
  });

  if(page==="ranges" || page==="home"){
    document.getElementById("mainScreen").style.display="block";
    var restoreNumbers = (_LAST_MAIN_SUB==="numbers" && ACTIVE_RANGE && ACTIVE_RANGE.id);
    if(rangesPanel)  rangesPanel.style.display  = restoreNumbers ? "none" : "block";
    if(numbersPanel) numbersPanel.style.display = restoreNumbers ? "block" : "none";
    if(restoreNumbers){
      document.getElementById("smsMiniBar").style.display="flex";
      var y = _NUMBERS_SCROLL || 0;
      setTimeout(function(){ window.scrollTo(0, y); }, 0);
      setTimeout(function(){ window.scrollTo(0, y); }, 60);
    } else {
      _NUMBERS_SCROLL = 0;
    }
  } 
  else if(page==="inbox" || page==="sms"){
    var inboxPage = document.getElementById("inboxPage");
    if(inboxPage) { inboxPage.style.display="block"; silentSmsRefresh(true); }
    setTimeout(function(){ window.scrollTo(0,0); document.documentElement.scrollTop=0; document.body.scrollTop=0; }, 0);
    setTimeout(function(){ window.scrollTo(0,0); }, 60);
  } 
  else if(page==="add"){
    document.getElementById("addNumPage").style.display="block";
    initAddPage(false); loadDock();  loadDock();  loadDock();  loadDock();  loadDock(); 
  } 
  else if(page==="top10"){
    document.getElementById("top10Page").style.display="block";
    loadLeaderboard();
  } 
}

// ── NUM SMS MODAL (referenced in HTML) ──
var numSmsModal=document.getElementById("numSmsModal");

// ── INIT ON DASHBOARD ──
(function dashboardInit(){
  var isDashboard = window.location.pathname.includes("dashboard");
  var isSms = window.location.pathname.includes("sms");
  
  if(!isDashboard && !isSms) return;

  // ── Client-only guard: if admin role is set, dashboard.html inline guard
  // should have already redirected. Belt-and-suspenders: bail here too.
  try {
    var _adminRole = localStorage.getItem("hydra_role");
    if (_adminRole === "agent" || _adminRole === "subadmin") {
      location.replace(_adminRole === "subadmin" ? "/subadmin" : "/agent");
      return;
    }
  } catch(e) {}
  
  // Set username in profile
  var profileName=document.getElementById("profileName");
  var profileAvatar=document.getElementById("profileAvatar");
  var dropUser=document.getElementById("dropUser");
  
  if(profileName && USERNAME) profileName.textContent=USERNAME;
  if(profileAvatar && USERNAME) profileAvatar.textContent=USERNAME.substring(0,2).toUpperCase();
  if(dropUser && USERNAME) dropUser.innerHTML="👤 "+escHtml(USERNAME);
  
  // Load initial data — wait for SESSION to be confirmed (handles page reload
  // where session may need a silent reauth before data loads).
  // If SESSION is already present, kick off immediately; otherwise tryReauth
  // first so the dashboard doesn't show blank content on reload.
  function _startLoad() {
    if(profileName && USERNAME) profileName.textContent=USERNAME;
    if(profileAvatar && USERNAME) profileAvatar.textContent=USERNAME.substring(0,2).toUpperCase();
    if(dropUser && USERNAME) dropUser.innerHTML="👤 "+escHtml(USERNAME);
    if(isDashboard) loadRanges();

// 🔒 HIDE DOR FOR NON-SUPER-ADMIN
apiCall('/api/auth/role', { session: SESSION }, function(rd){
  var role = (rd && rd.ok && rd.role) ? rd.role : 'none';
  try { localStorage.setItem('hydra_role', role); } catch(e){}
  if (role !== 'super') {
    document.querySelectorAll('.bn-item').forEach(function(btn){
      if(btn.getAttribute('data-page') === 'dor') btn.style.display = 'none';
    });
    var dorPage = document.getElementById('dorPage');
    if(dorPage) dorPage.style.display = 'none';
  }
});
    silentSmsRefresh(true);
    startSmsAutoRefresh();
  }

  function _bounceToLogin(){ try{ localStorage.removeItem('app_session'); }catch(e){} location.replace('/login/index.html'); }
if (SESSION) {
  // Validate the stored session (fast ping). apiCall silently re-auths from stored
  // creds if it's dead; if that also fails → clean bounce to login (no loop).
  apiCall('/api/ping', { session: SESSION }, function(d){
    if (d && d.ok) { setTimeout(_startLoad, 50); }
    else { _bounceToLogin(); }
  });
} else {
  if (typeof tryReauth === 'function') {
    tryReauth().then(function(ok){ if (ok) setTimeout(_startLoad, 100); else _bounceToLogin(); }).catch(_bounceToLogin);
  } else { _bounceToLogin(); }
  return;
}
  // Request browser notification permission on first user interaction
  var _askedNotif=false;
  function _askNotifOnce(){
    if(_askedNotif) return; _askedNotif=true;
    requestNotifPermission();
    document.removeEventListener("click",_askNotifOnce);
    document.removeEventListener("keydown",_askNotifOnce);
  }
  document.addEventListener("click",_askNotifOnce,{once:true});
  document.addEventListener("keydown",_askNotifOnce,{once:true});
})();


/* ── Long-press range delete ── */
window._rangeLP=null;
window._rangeLPMoved=false;
window._rangeLPSuppressClickUntil=0;
function rangeTouchStart(e,el){
  try{ window._rangeLP&&clearTimeout(window._rangeLP); }catch(_){}
  window._rangeLPMoved=false;
  window._rangeLP=setTimeout(function(){
    if(!window._rangeLPMoved){
      rangeShowDel(el,true);
      window._rangeLPSuppressClickUntil=Date.now()+900;
      try{ if(e){ e.preventDefault(); e.stopPropagation(); } }catch(_){}
      try{ if(navigator.vibrate) navigator.vibrate(30); }catch(_){}
    }
  },550);
}
function rangeTouchEnd(e,el){
  if(e && e.type==="touchmove") window._rangeLPMoved=true;
  try{ window._rangeLP&&clearTimeout(window._rangeLP); }catch(_){}
}
function rangeCardTap(e,el){
  var card=el.closest(".range-card");
  if(Date.now()<window._rangeLPSuppressClickUntil){
    if(e){ e.preventDefault(); e.stopPropagation(); }
    return false;
  }
  // Once delete is visible, keep it visible until user taps delete or outside card.
  if(card && card.classList.contains("show-del")){
    if(e){ e.preventDefault(); e.stopPropagation(); }
    return false;
  }
  var c=el.closest(".range-card");
  loadNumbers(c.dataset.rid,c.dataset.rtitle,parseInt(c.dataset.rcount,10));
}
function rangeShowDel(el,forceShow){
  var card=el.closest(".range-card");
  document.querySelectorAll(".range-card.show-del").forEach(function(x){ if(x!==card) x.classList.remove("show-del"); });
  if(card){
    if(forceShow) card.classList.add("show-del");
    else card.classList.toggle("show-del");
  }
}
document.addEventListener("click",function(e){
  if(!e.target.closest(".range-card")){
    document.querySelectorAll(".range-card.show-del").forEach(function(x){ x.classList.remove("show-del"); });
  }
});

/* ── Service-worker backed notifications (mobile-friendly) ── */
(function(){
  if(!("serviceWorker" in navigator)) return;
  Promise.reject(new Error('sw-disabled')).then(function(reg){
    window._swReg=reg;
  }).catch(function(){});
})();
window.fireBrowserNotif=function(title, body, tagKey){
  try{
    if(!("Notification" in window)) return;
    if(Notification.permission!=="granted"){
      if(Notification.permission==="default"){
        Notification.requestPermission().then(function(p){
          if(p==="granted") window.fireBrowserNotif(title, body, tagKey);
        }).catch(function(){});
      }
      return;
    }
    var opts={
      body: body || "",
      icon: "/branding/favicon.ico",
      badge: "/branding/favicon.ico",
      tag: tagKey || ("hyder-sms-"+Date.now()),
      renotify: true,
      requireInteraction: false,
      silent: false
    };
    // Try SW notification first (works on mobile), fallback to direct
    if(window._swReg){
      window._swReg.showNotification(title, opts).catch(function(){
        try{ new Notification(title, opts); }catch(_){}
      });
    } else {
      new Notification(title, opts);
    }
  }catch(_){}
};

// ═══════════════════════════════════════════════════════════
//  RESOURCE-FRIENDLY: pause polling when hidden + auto-logout after 1h idle
// ═══════════════════════════════════════════════════════════
(function(){
  document.addEventListener('visibilitychange', function(){
    if (document.hidden) {
      if (typeof stopSmsAutoRefresh === 'function') stopSmsAutoRefresh();
if (_isPollLeader) { try { localStorage.removeItem(_LEADER_KEY); } catch(e){} _isPollLeader = false; }
      if (window._smsRangeInterval) { clearInterval(window._smsRangeInterval); window._smsRangeInterval = null; }
    } else if (typeof SESSION !== 'undefined' && SESSION) {
      if (typeof startSmsAutoRefresh === 'function') startSmsAutoRefresh();
      if (typeof silentSmsRefresh === 'function') silentSmsRefresh(true);
    }
  });
  var IDLE_MS = 60 * 60 * 1000; // 1 hour
  var _idleTimer = null;
  function _armIdle(){
    if (_idleTimer) clearTimeout(_idleTimer);
    _idleTimer = setTimeout(function(){
      try { if (typeof doLogout === 'function') { doLogout(); return; } } catch(e){}
      try { localStorage.removeItem('app_session'); } catch(e){}
      location.replace('/login/index.html');
    }, IDLE_MS);
  }
  ['click','keydown','touchstart','scroll'].forEach(function(ev){ document.addEventListener(ev, _armIdle, { passive:true, capture:true }); });
  _armIdle();
})();

// ═══ LOADER GATE: ranges overlay ONLY on manual hard refresh ═══
var _HARD_REFRESH = false;
(function () {
  if (typeof showLoad === 'function') {
    var _origShowLoad = showLoad;
    showLoad = function (msg) {
      var m = String(msg || '').toLowerCase();
      if (m.indexOf('range') > -1 && !_HARD_REFRESH) return; // background = silent
      return _origShowLoad(msg);
    };
  }
  // Any tap on a button whose onclick calls loadRanges = manual hard refresh
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[onclick*="loadRanges"]') : null;
    if (t) { _HARD_REFRESH = true; setTimeout(function () { _HARD_REFRESH = false; }, 6000); }
  }, true);
})();

// ═══ LIVE AUTO-REFRESH (4s) — silent, no overlay ═══
if (!window._ZAMIL_AUTOREFRESH) {
  window._ZAMIL_AUTOREFRESH = true;
  setInterval(function () {
    if (typeof SESSION !== 'undefined' && SESSION && !document.hidden) {
      if (typeof loadRanges === 'function') loadRanges(true, true);
      if (typeof silentSmsRefresh === 'function') silentSmsRefresh(false);
      if (typeof window.loadDock === 'function') window.loadDock(true);
    }
  }, 4000);
}

// ═══ 🚢 SHIPPING DOCK (queue visualizer) ═══
(function(){
  var st = document.createElement('style');
  st.textContent = '.dock-wave{animation:dockbob 2s ease-in-out infinite}@keyframes dockbob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}';
  document.head.appendChild(st);
  var pg = document.getElementById('addNumPage');
  if (pg && !document.getElementById('dockCard')) {
    var d = document.createElement('div');
    d.className = 'card'; d.id = 'dockCard'; d.style.marginTop = '14px';
    d.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'
      + '<div style="font-weight:800;font-size:.95rem">🚢 Shipping Dock</div>'
      + '<button type="button" class="btn btn-sm btn-ghost" onclick="loadDock()">↻</button></div>'
      + '<div id="dockList"></div>';
    pg.appendChild(d);
  }
})();
function loadDock(){
  if (!SESSION) return;
  apiCall('/alloc/queue-list', { session: SESSION }, function(d){
    var el = document.getElementById('dockList'); if (!el) return;
    if (!d || !d.ok || !d.items || !d.items.length) { el.innerHTML = '<div style="font-size:.75rem;color:var(--muted);padding:8px">🌤 No shipments in the dock</div>'; return; }
    var h = '';
    d.items.slice(0, 20).forEach(function(it){
      var t = new Date(it.created_at);
      var hh = ((t.getHours()%12)||12) + ':' + (t.getMinutes()<10?'0':'') + t.getMinutes() + (t.getHours()>=12?' PM':' AM');
      var ship = it.status === 'pending' ? '🚢' : (it.status === 'done' ? '⚓' : '🌊');
      var icon = it.status === 'pending' ? '⏳' : (it.status === 'done' ? '✅' : '❌');
      var note = it.status === 'pending' ? 'sailing…' : (it.status === 'done' ? 'delivered' : 'lost — ' + ((it.result && (it.result.error || it.result._error)) || 'failed'));
      h += '<div class="' + (it.status === 'pending' ? 'dock-wave' : '') + '" style="display:flex;align-items:center;gap:10px;padding:9px 10px;border:1px solid var(--border);border-radius:12px;margin-bottom:8px;background:var(--bg)">'
        + '<div style="font-size:1.3rem">' + ship + '</div>'
        + '<div style="flex:1;min-width:0">'
        + '<div style="font-weight:700;font-size:.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escHtml(it.range_name || 'Range') + ' <span style="color:var(--accent);font-weight:800">×' + it.qty + '</span></div>'
        + '<div style="font-size:.65rem;color:var(--muted)">' + (d.admin ? '👤 ' + escHtml(it.username) + ' · ' : '') + hh + ' · ' + note + '</div>'
        + '</div><div style="font-size:1.1rem">' + icon + '</div></div>';
    });
    el.innerHTML = h;
  });
}
setInterval(function(){
  var p = document.getElementById('addNumPage');
  if (p && p.style.display === 'block' && SESSION && !document.hidden) loadDock();
}, 5000);


// ═══════════════════════════════════════════════════════════
//  UI PATCH — injects missing styles (no external CSS file needed)
//  Same pattern as the dock-wave <style> injection above.
// ═══════════════════════════════════════════════════════════
(function () {
  var st = document.createElement('style');
  st.textContent = `
/* UNASSIGN BUTTON */
.range-actions{display:flex;justify-content:flex-end;padding:0 12px 10px}
.btn-unassign{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;
  font-size:.72rem;font-weight:700;line-height:1;font-family:inherit;
  color:var(--red,#ef4444);background:rgba(239,68,68,.08);
  border:1px solid rgba(239,68,68,.28);border-radius:9px;cursor:pointer;
  transition:background .15s,transform .1s}
.btn-unassign:active{transform:scale(.95)}
.btn-unassign:hover{background:rgba(239,68,68,.16)}
/* CONFIRM MODAL */
.confirm-modal{position:fixed;inset:0;z-index:9990;display:flex;align-items:center;
  justify-content:center;padding:20px;padding-bottom:calc(20px + env(safe-area-inset-bottom))}
.confirm-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.55);
  backdrop-filter:blur(3px);animation:cmFade .2s ease}
.confirm-box{position:relative;width:100%;max-width:340px;background:var(--surface);
  border:1px solid var(--border);border-radius:16px;padding:22px 20px;text-align:center;
  box-shadow:0 18px 50px rgba(0,0,0,.35);animation:cmPop .22s cubic-bezier(.2,.9,.3,1.25)}
.confirm-icon{font-size:2rem;margin-bottom:8px}
.confirm-box h3{margin:0 0 8px;font-size:1.05rem}
.confirm-box p{margin:0 0 6px;font-size:.85rem;color:var(--muted);line-height:1.45}
.confirm-warning{color:var(--red)!important;font-weight:700;font-size:.75rem!important}
.confirm-actions{display:flex;gap:10px;margin-top:16px}
.btn-cancel,.btn-confirm{flex:1;padding:11px 0;border-radius:11px;border:1px solid var(--border);
  font-family:inherit;font-size:.85rem;font-weight:700;cursor:pointer}
.btn-cancel{background:var(--bg);color:var(--text)}
.btn-confirm{background:var(--red,#ef4444);border-color:transparent;color:#fff}
@keyframes cmFade{from{opacity:0}}
@keyframes cmPop{from{opacity:0;transform:scale(.92) translateY(10px)}}
/* SHIPPING OVERLAY */
.shipping-overlay{position:fixed;inset:0;z-index:9995;display:flex;align-items:center;
  justify-content:center;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);
  opacity:0;pointer-events:none;transition:opacity .3s}
.shipping-overlay.show{opacity:1;pointer-events:auto}
.shipping-container{width:min(92vw,360px);background:var(--surface);border:1px solid var(--border);
  border-radius:18px;padding:26px 22px;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.4)}
.shipping-boat{position:relative;width:120px;margin:0 auto 8px;animation:boatBob 2s ease-in-out infinite}
.boat-svg{width:110px;height:100px;display:block;margin:0 auto}
.waves{position:absolute;bottom:-4px;left:0;right:0;height:12px;overflow:hidden}
.wave{position:absolute;width:22px;height:22px;border-radius:50%;
  border:2px solid rgba(59,130,246,.45);top:0;animation:waveMove 2.2s linear infinite}
.wave:nth-child(2){animation-delay:1.1s}
@keyframes boatBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes waveMove{from{left:-15%;opacity:0}20%{opacity:1}to{left:105%;opacity:0}}
.shipping-title{font-size:1.05rem;font-weight:800;margin:6px 0 4px}
.shipping-subtitle{font-size:.8rem;color:var(--muted);margin-bottom:14px}
.shipping-progress{height:6px;background:var(--bg);border:1px solid var(--border);
  border-radius:99px;overflow:hidden;margin:0 auto 14px}
.shipping-progress-bar{height:100%;width:0;border-radius:99px;
  background:linear-gradient(90deg,var(--accent),var(--accent2));transition:width .4s ease}
.shipping-details{text-align:left;background:var(--bg);border:1px solid var(--border);
  border-radius:12px;padding:10px 12px}
.shipping-detail-row{display:flex;justify-content:space-between;font-size:.75rem;padding:3px 0}
.shipping-detail-label{color:var(--muted);font-weight:600}
.shipping-detail-value{font-weight:700;max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.shipping-icon{font-size:2.6rem;margin-bottom:10px}
@media (prefers-reduced-motion:reduce){
  .shipping-boat,.wave,.confirm-box,.confirm-backdrop{animation:none!important}
}
`;
  document.head.appendChild(st);
})();


// ═══════════════════════════════════════════════════════════
//  PATCH v2 — swipe-to-unassign + 5s ship-drop + queue watcher
//  Paste at the BOTTOM of app.js (after the previous UI patch)
// ═══════════════════════════════════════════════════════════
(function () {
  var st = document.createElement('style');
  st.textContent = `
/* ── Unassign hidden; revealed by left-swipe on the card ── */
.range-card{overflow:hidden}
.range-card .range-actions{max-height:0;opacity:0;overflow:hidden;padding:0 12px;
  transform:translateX(28px);
  transition:max-height .28s ease,opacity .2s ease,transform .28s ease,padding .28s ease}
.range-card.ua-open .range-actions{max-height:58px;opacity:1;transform:none;padding:0 12px 10px}
/* ── ball-drop exit for the shipping overlay ── */
@keyframes shipDrop{
  0%{transform:translateY(0) scale(1);opacity:1}
  22%{transform:translateY(5px) scale(1.04,.96)}
  100%{transform:translateY(78vh) rotate(4deg) scale(.9);opacity:0}
}
.shipping-container.dropping{animation:shipDrop .72s cubic-bezier(.5,-.1,.85,.55) forwards}
.shipping-overlay.drop-fade{opacity:0;transition:opacity .72s ease}
`;
  document.head.appendChild(st);

  /* ── 1) SWIPE GESTURE (delegated — no HTML edits needed) ── */
  window._uaSwipe = null; window._uaSuppressTap = 0;
  document.addEventListener('touchstart', function (e) {
    var el = e.target.closest ? e.target.closest('.range-card-top') : null;
    if (!el) { window._uaSwipe = null; return; }
    var t = e.touches[0];
    window._uaSwipe = { x: t.clientX, y: t.clientY, el: el };
  }, { passive: true });

  document.addEventListener('touchend', function (e) {
    var s = window._uaSwipe; window._uaSwipe = null;
    if (!s) return;
    var t = e.changedTouches && e.changedTouches[0]; if (!t) return;
    var el = e.target.closest ? e.target.closest('.range-card-top') : null;
    if (!el || el !== s.el) return;
    var dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.4) return; // must be horizontal
    var card = el.closest('.range-card'); if (!card) return;
    window._uaSuppressTap = Date.now() + 700; // don't open numbers on swipe
    if (dx < 0) { // ⬅ swipe left = reveal
      document.querySelectorAll('.range-card.ua-open').forEach(function (x) { if (x !== card) x.classList.remove('ua-open'); });
      card.classList.add('ua-open');
      try { navigator.vibrate && navigator.vibrate(15); } catch (e2) {}
    } else {      // ➡ swipe right = hide
      card.classList.remove('ua-open');
    }
  }, { passive: true });

  /* tap on an OPEN card just closes it (doesn't open numbers) */
  var _origTap = rangeCardTap;
  rangeCardTap = function (e, el) {
    var card = el.closest('.range-card');
    if (card && card.classList.contains('ua-open')) {
      card.classList.remove('ua-open');
      if (e) { e.preventDefault(); e.stopPropagation(); }
      return false;
    }
    if (Date.now() < window._uaSuppressTap) { if (e) { e.preventDefault(); e.stopPropagation(); } return false; }
    return _origTap(e, el);
  };

  /* tap outside closes any open card */
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.range-card'))
      document.querySelectorAll('.range-card.ua-open').forEach(function (x) { x.classList.remove('ua-open'); });
  });

  /* ── 2) BALL-DROP hide ── */
  window.hideShippingWithDrop = function (cb) {
    var overlay = document.querySelector('.shipping-overlay');
    if (!overlay) { if (cb) cb(); return; }
    var box = overlay.querySelector('.shipping-container');
    if (box) box.classList.add('dropping');
    overlay.classList.add('drop-fade');
    setTimeout(function () { if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); if (cb) cb(); }, 720);
  };

  /* ── 3) silent queue watcher (pending → done/failed) ── */
  var _allocWatchT = null;
  window.watchAllocStatus = function () {
    if (_allocWatchT) return;
    var tries = 0;
    _allocWatchT = setInterval(function () {
      tries++;
      if (!SESSION || tries > 120) { clearInterval(_allocWatchT); _allocWatchT = null; return; } // 10 min cap
      apiCall('/api/alloc/status', { session: SESSION }, function (s) {
        if (!s || !s.ok || !s.items || !s.items.length) return;
        var top = s.items[0];
        if (top.status === 'done') {
          clearInterval(_allocWatchT); _allocWatchT = null;
          showToast('Delivered! Numbers are live in Ranges', 'success');
          onAllocationSuccess(); loadDock();
            _autoRefreshOpenRange();
        } else if (top.status === 'failed') {
          clearInterval(_allocWatchT); _allocWatchT = null;
          showToast('Shipment failed — no free numbers, retry later', 'error');
          loadDock();
        }
      });
    }, 5000); // 12 req/min — under your /api/alloc limit of 30
  };

  window.doAllocate = function () {
  if (!ASTATE.selectedRangeId) { showToast('Range select karein', 'error'); return; }
  ASTATE.payterm = ASTATE.payterm || '2';
  ASTATE.payout  = ASTATE.payout  || '0.01';
  var qty = parseInt(document.getElementById('aQtyInput').value) || 3;
  if (qty < 1 || qty > 50) { showToast('Qty 1–50 Must be !!', 'error'); return; }
  
  // ✅ NEW FRONTEND PRE-CHECK: Don't even ask the server if our cache says 0
  var cachedAvail = ASTATE.availCache[ASTATE.selectedRangeId];
if (cachedAvail && cachedAvail.available < qty) {
showToast('Only ' + cachedAvail.available + ' numbers available. Reduce qty or search again.', 'error');
if (window.syncAllocBtnState) window.syncAllocBtnState();
return;
}
  var btn = document.getElementById('aAllocBtn');
  if (btn) btn.disabled = true;
  var t0 = Date.now();
  
  showShippingAnimation('allocating', {
    title: 'Shipping Numbers',
    subtitle: 'Checking availability & queueing...', // Updated subtitle
    range: ASTATE.selectedRangeTitle,
    quantity: qty
  });
  
  var progress = 0;
  var pi = setInterval(function () {
    progress += Math.random() * 18; if (progress > 90) progress = 90;
    updateShippingProgress(progress, 'Checking & Queuing...');
  }, 450);
  
  apiCall('/api/alloc/allocate', {
    session: SESSION, rangeId: ASTATE.selectedRangeId,
    rangeTitle: ASTATE.selectedRangeTitle, quantity: qty,
    payout: ASTATE.payout, payterm: ASTATE.payterm
  }, function (d) {
    clearInterval(pi);
    if (!d) { 
      hideShippingAnimation(); 
      showToast('No response — please retry', 'error'); 
      if (btn) btn.disabled = false; 
      return; 
    }
    if (d.limitReached) { 
      hideShippingAnimation(); 
      showToast('Daily limit reached for ' + escHtml(d.country || 'this country'), 'error'); 
      if (btn) btn.disabled = false; 
      return; 
    }
    
    // ✅ NEW: Handle pre-check failure (not enough numbers)
    if (!d.ok && d.error && d.error.includes('Only')) {
      hideShippingAnimation();
      showToast(d.error, 'error');
      if (btn) btn.disabled = false;
      return;
    }

    if (!d.ok) { 
      hideShippingAnimation(); 
      if (btn) btn.disabled = false; 
      return; 
    }
    
    // INSTANT UI v2
 updateShippingProgress(100, d.queued ? 'Queued!' : 'Delivered!');
 setTimeout(function () {
   hideShippingWithDrop(function () {
     if (btn) btn.disabled = false;
     if (ASTATE.availCache && ASTATE.availCache[ASTATE.selectedRangeId]) { ASTATE.availCache[ASTATE.selectedRangeId].available = Math.max(0, (ASTATE.availCache[ASTATE.selectedRangeId].available || 0) - qty); if (typeof renderAllocRanges === 'function') renderAllocRanges(); }
if (d.queued) { showMini('Queued — high demand, ETA ~1 min', 'info'); if (typeof watchAllocStatus === 'function') watchAllocStatus(); } else { showToast((d.allocated || qty) + ' numbers delivered instantly!', 'success'); }
     try { localStorage.removeItem(CACHE_KEY_RANGES); } catch (e) {}
     loadRanges(true, true);
     _autoRefreshOpenRange();
     loadDock();
   });
 }, 1200);
  });
};
})();

// ═══════════════════════════════════════════════════════════
//  PATCH v3 — dock fix + ETA countdown + non-blocking overlay
//  + graceful unassign (append-only, bottom of app.js)
// ═══════════════════════════════════════════════════════════
(function () {
  var st = document.createElement('style');
  st.textContent = `
.shipping-overlay{pointer-events:none!important}
.shipping-container{pointer-events:auto}
.dock-eta{color:var(--accent);font-weight:700}
`;
  document.head.appendChild(st);

  /* 1) birth-stamp every overlay + 15s safety sweeper (never freezes again) */
  var _origShip = showShippingAnimation;
  showShippingAnimation = function (type, opts) {
    var ov = _origShip(type, opts);
    try { ov.dataset.born = String(Date.now()); } catch (e) {}
    return ov;
  };
  setInterval(function () {
    var ov = document.querySelector('.shipping-overlay');
    if (ov && ov.dataset.born && Date.now() - parseInt(ov.dataset.born, 10) > 15000) {
      try { ov.remove(); } catch (e) {}
    }
  }, 3000);

  /* 2) ETA memory */
  window._zEtaMins = 0;

  /* 3) FIXED loadDock: /api/… route, correct id, 2s throttle, ETA label */
  var _lastDock = 0;
  window.loadDock = function () {
    if (!SESSION) return;
    var now = Date.now();
    if (now - _lastDock < 2000) return; // collapses the 5x bnSwitch calls
    _lastDock = now;
    apiCall('/api/alloc/queue-list', { session: SESSION }, function (d) {
      var el = document.getElementById('dockList'); if (!el) return;
      if (!d || !d.ok || !d.items || !d.items.length) {
        el.innerHTML = '<div style="font-size:.75rem;color:var(--muted);padding:8px">🌤 No shipments in the dock</div>';
        return;
      }
      var h = '';
      d.items.slice(0, 20).forEach(function (it, idx) {
        var t = new Date(it.created_at);
        var hh = ((t.getHours() % 12) || 12) + ':' + (t.getMinutes() < 10 ? '0' : '') + t.getMinutes() + (t.getHours() >= 12 ? ' PM' : ' AM');
        var ship = it.status === 'pending' ? '🚢' : (it.status === 'done' ? '⚓' : '🌊');
        var icon = it.status === 'pending' ? '⏳' : (it.status === 'done' ? '✅' : '❌');
        var note = it.status === 'pending'
          ? 'sailing…' + (idx === 0 && window._zEtaMins ? ' · <span class="dock-eta">ETA ~' + window._zEtaMins + 'm</span>' : '')
          : (it.status === 'done' ? 'delivered' : 'lost — ' + ((it.result && (it.result.error || it.result._error)) || 'failed'));
        h += '<div class="' + (it.status === 'pending' ? 'dock-wave' : '') + '" style="display:flex;align-items:center;gap:10px;padding:9px 10px;border:1px solid var(--border);border-radius:12px;margin-bottom:8px;background:var(--bg)">'
          + '<div style="font-size:1.3rem">' + ship + '</div>'
          + '<div style="flex:1;min-width:0">'
          + '<div style="font-weight:700;font-size:.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escHtml(it.range_name || 'Range') + ' <span style="color:var(--accent);font-weight:800">×' + it.qty + '</span></div>'
          + '<div style="font-size:.65rem;color:var(--muted)">' + (d.admin ? '👤 ' + escHtml(it.username) + ' · ' : '') + hh + ' · ' + note + '</div>'
          + '</div><div style="font-size:1.1rem">' + icon + '</div></div>';
      });
      el.innerHTML = h;
    });
  };

  /* 4) ETA countdown poller, started on every Allocate (10s, max 6 min) */
  var _prevAlloc = window.doAllocate;
  window.doAllocate = function () {
    if (window._zEtaT) clearInterval(window._zEtaT);
    var n = 0;
    window._zEtaT = setInterval(function () {
      n++;
      if (n > 36 || !SESSION) { clearInterval(window._zEtaT); window._zEtaT = null; return; }
      apiCall('/api/alloc/queue-status', { session: SESSION }, function (q) {
        if (q && q.ok) {
          window._zEtaMins = q.myEtaMins || 0;
          if (q.myPosition === 0) { window._zEtaMins = 0; clearInterval(window._zEtaT); window._zEtaT = null; }
          loadDock();
        }
      });
    }, 10000);
    _prevAlloc();
  };

  /* 5) Unassign: NON-blocking + route fallback chain (no more freeze/overlay) */
  window.executeUnassign = function (rangeId, rangeTitle, count) {
    showMini('Releasing ' + count + ' numbers…', 'info');
    var payload = {
      session: SESSION,
      clientId: String(localStorage.getItem('app_client_id')),
      rangeId: String(rangeId),
      panelNum: parseInt(localStorage.getItem('app_panel_num') || '1', 10)
    };
    var routes = ['/api/range/unassign', '/api/alloc/unassign', '/api/unassign'];
    (function tryRoute(i) {
      if (i >= routes.length) {
        showToast('Unassign route missing on server — add POST /api/range/unassign', 'error');
        return;
      }
      apiCall(routes[i], payload, function (d) {
        if (d && d.ok) {
          showToast('✓ Unassigned ' + (d.removed || 0) + ' numbers', 'success');
      if (ASTATE.availCache && ASTATE.availCache[rangeId]) { ASTATE.availCache[rangeId].available = (ASTATE.availCache[rangeId].available || 0) + (d.removed || 0); if (typeof renderAllocRanges === 'function') renderAllocRanges(); }
          try { localStorage.removeItem(CACHE_KEY_RANGES); } catch (e) {}
          loadRanges(true, true);
        } else if (d && /route|not ?found/i.test(String(d.error || ''))) {
          tryRoute(i + 1); // this route doesn't exist → try next
        } else {
          showToast(((d && d.error) || 'Unassign failed'), 'error');
        }
      });
    })(0);
  };
})();

// ═══════════════════════════════════════════════════════════
//  PATCH v8 — Shipping Dock FULL REDESIGN (card style, footer history bar)
// ═══════════════════════════════════════════════════════════
(function () {
  var st = document.createElement('style');
  st.textContent = `
.zdock-card{background:var(--surface)!important;border:1px solid rgba(8,145,178,.35)!important;border-radius:18px!important;padding:14px!important;box-shadow:0 0 0 3px rgba(8,145,178,.07),0 8px 24px rgba(15,23,42,.08)!important}
.zdock-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
.zdock-title{font-weight:800;font-size:.95rem;display:flex;align-items:center;gap:7px}
.zdock-pill{font-size:.6rem;font-weight:800;color:var(--accent);background:rgba(8,145,178,.1);border:1px solid rgba(8,145,178,.28);border-radius:20px;padding:2px 8px}
.zdock-btn{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border:1px solid var(--border);border-radius:10px;background:var(--bg);color:var(--muted);cursor:pointer;transition:transform .12s}
.zdock-btn:active{transform:scale(.92)}
.zdock-searchrow{display:flex;gap:6px;margin-bottom:10px;animation:zdFade .18s ease}
.zdock-searchrow input{flex:1;min-width:0;border:1px solid var(--border);border-radius:10px;background:var(--bg);padding:9px 12px;font-size:.78rem;color:var(--text);font-family:inherit;outline:none}
.zdock-searchrow input:focus{border-color:var(--accent)}
.zdock-item{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--border);border-radius:12px;margin-bottom:8px;background:var(--bg)}
.zdock-item.wait{border-left:3px solid rgba(8,145,178,.6)}
.zdock-item.ok{border-left:3px solid rgba(22,163,74,.55)}
.zdock-item.fail{border-left:3px solid rgba(220,38,38,.5)}
.zdock-foot{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;margin-top:2px;padding:9px 12px;border:1px dashed var(--border);border-radius:10px;background:transparent;color:var(--muted);font-size:.7rem;font-weight:700;cursor:pointer;font-family:inherit}
.zdock-foot:active{transform:scale(.98)}
.zdock-empty{font-size:.75rem;color:var(--muted);padding:10px;text-align:center}
@keyframes zdFade{from{opacity:0;transform:translateY(-4px)}}
`;
  document.head.appendChild(st);

  var SVG_SRCH = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
  var SVG_REF  = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>';
  var SVG_CHD  = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
  var SVG_CHU  = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>';
  var ICON_WAIT = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0891b2" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9" opacity=".3"/><path d="M12 7v5l3 2"/></svg>';
  var ICON_DONE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" opacity=".3"/><path d="m8.4 12.3 2.5 2.5 4.7-5"/></svg>';
  var ICON_FAIL = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9" opacity=".3"/><path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6"/></svg>';

  /* ── Rebuild the whole dock card (same glowing card as Search Ranges) ── */
  var card = document.getElementById('dockCard');
  if (card) {
    card.className = 'card zdock-card';
    card.innerHTML =
      '<div class="zdock-head">' +
        '<div class="zdock-title">🚢 Shipping Dock <span class="zdock-pill" id="dockCountPill"></span></div>' +
        '<div style="display:flex;gap:6px">' +
          '<button type="button" class="zdock-btn" id="dockSearchToggle" title="Search history">' + SVG_SRCH + '</button>' +
          '<button type="button" class="zdock-btn" onclick="loadDock(true)" title="Refresh">' + SVG_REF + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="zdock-searchrow" id="dockSearchRow" style="display:none">' +
        '<input id="dockSearchInput" placeholder="Search user or range…" autocomplete="off">' +
        '<button type="button" class="zdock-btn" onclick="dockSearch(document.getElementById(\'dockSearchInput\').value)">' + SVG_SRCH + '</button>' +
      '</div>' +
      '<div id="dockList"></div>' +
      '<button type="button" class="zdock-foot" id="dockHistoryToggle" onclick="toggleDockHistory()" style="display:none"></button>';

    document.getElementById('dockSearchToggle').onclick = function () {
      var row = document.getElementById('dockSearchRow');
      var open = row.style.display !== 'none';
      row.style.display = open ? 'none' : 'flex';
      if (!open) { var i = document.getElementById('dockSearchInput'); if (i) i.focus(); }
    };
    var inp = document.getElementById('dockSearchInput');
    var deb = 0;
    inp.addEventListener('input', function () { clearTimeout(deb); deb = setTimeout(function () { dockSearch(inp.value); }, 250); });
  }

  /* ── state ─ */
  window._dockOpen = (localStorage.getItem('dock_history_open') === '1');
  window._dockQ = ''; window._dockQRaw = '';
  var _dockCache = [];

  window.dockSearch = function (val) {
    window._dockQRaw = String(val || '');
    window._dockQ = window._dockQRaw.toLowerCase().trim();
    renderDock();
  };
  window.toggleDockHistory = function () {
    window._dockOpen = !window._dockOpen;
    try { localStorage.setItem('dock_history_open', window._dockOpen ? '1' : '0'); } catch (e) {}
    renderDock();
  };

  function rowHtml(it, idx) {
    var t = new Date(it.created_at);
    var hh = ((t.getHours() % 12) || 12) + ':' + (t.getMinutes() < 10 ? '0' : '') + t.getMinutes() + (t.getHours() >= 12 ? ' PM' : ' AM');
    var cls  = it.status === 'pending' ? 'wait' : (it.status === 'done' ? 'ok' : 'fail');
    var ship = it.status === 'pending' ? '🚢' : (it.status === 'done' ? '⚓' : '🌊');
    var icon = it.status === 'pending' ? ICON_WAIT : (it.status === 'done' ? ICON_DONE : ICON_FAIL);
    var note = it.status === 'pending'
      ? 'sailing…' + (idx === 0 && window._zEtaMins ? ' · ETA ~' + window._zEtaMins + 'm' : '')
      : (it.status === 'done' ? 'delivered' : 'lost — ' + ((it.result && (it.result.error || it.result._error)) || 'failed'));
    return '<div class="zdock-item ' + cls + (it.status === 'pending' ? ' dock-wave' : '') + '">' +
      '<div style="font-size:1.15rem">' + ship + '</div>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-weight:700;font-size:.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escHtml(it.range_name || 'Range') + ' <span style="color:var(--accent);font-weight:800">×' + it.qty + '</span></div>' +
        '<div style="font-size:.64rem;color:var(--muted)">' + (it.username ? '👤 ' + escHtml(it.username) + ' · ' : '') + hh + ' · ' + note + '</div>' +
      '</div><div style="flex-shrink:0">' + icon + '</div></div>';
  }

  function renderDock() {
    var el = document.getElementById('dockList'); if (!el) return;
    var foot = document.getElementById('dockHistoryToggle');
    var pill = document.getElementById('dockCountPill');
    if (pill) pill.textContent = _dockCache.length ? _dockCache.length + ' total' : '';
    var q = window._dockQ;
    if (q) { // searching → show ALL matches, hide footer
      var m = _dockCache.filter(function (it) { return ((it.range_name || '') + ' ' + (it.username || '')).toLowerCase().indexOf(q) >= 0; });
      var mh = ''; m.forEach(function (it, i) { mh += rowHtml(it, i); });
      el.innerHTML = mh || '<div class="zdock-empty">No shipments match “' + escHtml(window._dockQRaw) + '”</div>';
      if (m.length) el.innerHTML += '<div class="zdock-empty" style="padding:2px 0 0">' + m.length + ' match(es)</div>';
      if (foot) foot.style.display = 'none';
      return;
    }
    var head = '', tail = '';
    _dockCache.forEach(function (it, i) { if (i < 3) head += rowHtml(it, i); else tail += rowHtml(it, i); });
    el.innerHTML = _dockCache.length ? head + (window._dockOpen ? tail : '') : '<div class="zdock-empty">🌤 No shipments in the dock</div>';
    if (foot) { // footer bar INSIDE the card
      if (tail) {
        foot.style.display = 'flex';
        foot.innerHTML = window._dockOpen ? 'Hide history ' + SVG_CHU : 'Show history (' + (_dockCache.length - 3) + ' more) ' + SVG_CHD;
      } else foot.style.display = 'none';
    }
  }

  var _lastDockV8 = 0;
  window.loadDock = function (force) {
    if (!SESSION) return;
    var now = Date.now(); if (!force && now - _lastDockV8 < 2000) return; _lastDockV8 = now;
    apiCall('/api/alloc/queue-list', { session: SESSION }, function (d) {
      _dockCache = [];
      if (d && d.ok && d.items) {
      if (typeof window._myDockName !== 'function') {
        window._myDockName = function () {
          try {
            var s = window.SESSION || localStorage.getItem('hydra_session') || localStorage.getItem('session') || '';
            var p = JSON.parse(atob(String(s).split('.')[1]));
            return String(p.username || p.clientName || '').toLowerCase();
          } catch (e) { return ''; }
        };
      }
      var _newItems = d.items;
      var _existIds = {};
      _dockCache.forEach(function (it) { _existIds[(it.created_at||'')+(it.range_name||'')+(it.username||'')] = true; });
      var _uniqueNew = _newItems.filter(function (it) { return !_existIds[(it.created_at||'')+(it.range_name||'')+(it.username||'')]; });
      var _merged = _uniqueNew.concat(_dockCache);
      if (window._lastAllocDock) { var _la = window._lastAllocDock; window._lastAllocDock = null;
        var _hasReal = _merged.some(function(it){ return (it.range_name||'')===_la.range_name && (it.username||'')===_la.username && String(it.qty)===String(_la.qty) && Math.abs(new Date(it.created_at)-new Date(_la.created_at))<120000; });
        if (!_hasReal) _merged = [_la].concat(_merged); }
      _merged.sort(function(a,b){ return new Date(b.created_at) - new Date(a.created_at); });
      _merged = _merged.slice(0, 50);
      var _r = localStorage.getItem('hydra_role'); var _n = window._myDockName();
      _dockCache = (_r === 'super' || !_n) ? _merged : _merged.filter(function (it) { return (it.username||'').toLowerCase() === _n; });
    }
      renderDock();
    });
  };
})();

// ═══════════════════════════════════════════════════════════
//  PATCH v9 — live quantity guard (button disables in real time)
// ═══════════════════════════════════════════════════════════
(function () {
  window.syncAllocBtnState = function () {
    var btn = document.getElementById("aAllocBtn");
    var qtyInput = document.getElementById("aQtyInput");
    if (!btn || !qtyInput) return;
    var avail = ASTATE.availCache[ASTATE.selectedRangeId];
    var maxAvail = (avail && typeof avail.available === 'number') ? avail.available : null;
    var qty = parseInt(qtyInput.value, 10) || 0;
    var overAvail = (maxAvail !== null && qty > maxAvail);
    var badQty = (qty < 1 || qty > 50);
    btn.disabled = overAvail || badQty || !ASTATE.selectedRangeId;
    if (overAvail) btn.textContent = 'Only ' + maxAvail + ' available';
    else if (badQty) btn.textContent = 'Qty 1–50';
    else btn.textContent = 'Allocate Numbers';
  };
  document.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'aQtyInput' && window.syncAllocBtnState) window.syncAllocBtnState();
  });
})();

// ═══ COPIED ROW STYLE (light red, theme-aware) ═══
(function(){
  var st = document.createElement('style');
  st.textContent =
    '.num-item.num-copied{background:rgba(248,113,113,.10)!important;border:1px solid rgba(248,113,113,.35)!important;}' +
    '.num-item.num-copied .num-val{color:#b91c1c;}' +
    '[data-theme="dark"] .num-item.num-copied{background:rgba(248,113,113,.14)!important;}' +
    '[data-theme="dark"] .num-item.num-copied .num-val{color:#fca5a5;}';
  document.head.appendChild(st);
})();
// ═══ ZAMIL SSE LIVE PUSH (v2.1) — instant OTPs, no polling needed ═══
(function(){
  if (window._zSSEon) return; window._zSSEon = true;
  function connect(){
    if (typeof SESSION === 'undefined' || !SESSION) { setTimeout(connect, 2000); return; }
    var es = new EventSource('/api/stream?session=' + encodeURIComponent(SESSION));
    es.addEventListener('numbers', function(){ try { if (typeof loadRanges === 'function') loadRanges(true, true); var np = document.getElementById('numbersPanel'); if (np && np.style.display === 'block' && typeof refreshNumbers === 'function') refreshNumbers(true); } catch(e){} });
es.addEventListener('ranges', function(){ try { if (typeof loadRanges === 'function') loadRanges(true, true); } catch(e){} });
es.addEventListener('crush', function(ev){ try { var d = JSON.parse(ev.data || '{}'); var nm = d.range || 'A range'; showToast(nm + ' crushed — all numbers returned to system. Ask your admin if you need it again.', 'error'); try { localStorage.removeItem(CACHE_KEY_RANGES); } catch(e){} if (typeof loadRanges === 'function') loadRanges(true, true); } catch(e){} });
es.addEventListener('sms', function(ev){
      try { var d = JSON.parse(ev.data); if (d && d.ok) { _applySmsResult(d); _broadcastSmsResult(d); } } catch(e){}
    });
    es.addEventListener('lb', function(){ try { if (typeof loadLeaderboard === 'function') loadLeaderboard(); } catch(e){} });
    es.onerror = function(){ try{ es.close(); }catch(e){} setTimeout(connect, 4000); };
  }
  connect();
})();





/* ═══ NUMBER MEMORY v5 — format-proof matching (last-9 digits) ═══ */
(function(){
if (window.__zmuV5) return; window.__zmuV5 = true;
var oldSt = document.getElementById('zmu-style'); if (oldSt) oldSt.remove();
var st = document.createElement('style'); st.id = 'zmu-style';
st.textContent = '.zmu-used{color:#ef4444 !important;font-weight:800 !important;text-decoration:line-through !important;opacity:.9;background:rgba(239,68,68,0.08) !important;border-radius:4px;padding:0 2px}';
document.head.appendChild(st);
var DBG = location.search.indexOf('zmudebug') > -1;
function dbg(m,c){ if(!DBG) return; var d=document.createElement('div'); d.style.cssText='position:fixed;bottom:70px;left:50%;transform:translateX(-50%);background:'+(c||'#333')+';color:#fff;padding:8px 14px;border-radius:8px;z-index:99999;font-size:11px;font-family:monospace;max-width:90%;text-align:center'; d.textContent=m; document.body.appendChild(d); setTimeout(function(){d.remove();},4000); }
function digits(s){ return String(s||'').replace(/\D/g,''); }
function key9(s){ var d = digits(s); return d.length > 9 ? d.slice(-9) : d; }
var _sniffed = '';
try { _sniffed = localStorage.getItem('zmu_sess') || ''; } catch(e){}
function isJwt(s){ return typeof s === 'string' && s.split('.').length === 3 && s.length > 40; }
function storeSniff(t){ _sniffed = t; try { localStorage.setItem('zmu_sess', t); } catch(e){} }
function sniffBody(b){
  if (!b || typeof b !== 'string') return;
  var m = b.match(/"session"\s*:\s*"([^"]{20,})"/) || b.match(/session=([^&"]{20,})/);
  if (m && isJwt(m[1]) && m[1] !== _sniffed) { storeSniff(m[1]); dbg('🧠 session sniffed'); }
}
if (window.fetch && !window.__zmuFetchPatched) {
  window.__zmuFetchPatched = true;
  var of = window.fetch.bind(window);
  window.fetch = function(input, init){ try { sniffBody(init && init.body); } catch(e){} return of(input, init); };
}
if (window.XMLHttpRequest && !window.__zmuXhrPatched) {
  window.__zmuXhrPatched = true;
  var os = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function(b){ try { sniffBody(b); } catch(e){} return os.apply(this, arguments); };
}
function findSession(){
  if (isJwt(_sniffed)) return _sniffed;
  if (isJwt(window.SESSION)) return window.SESSION;
  if (isJwt(window.TOKEN)) return window.TOKEN;
  try {
    var keys = ['zmu_sess','session','token','zsession','auth','jwt','session_token','accessToken'];
    for (var i=0;i<keys.length;i++){
      var v = localStorage.getItem(keys[i]) || sessionStorage.getItem(keys[i]);
      if (isJwt(v)) return v;
      var em = String(v||'').match(/eyJ[A-Za-z0-9_\-\.]{20,}/); if (em) return em[0];
    }
    for (var j=0;j<localStorage.length;j++){ var lv = String(localStorage.getItem(localStorage.key(j))||''); if (isJwt(lv)) return lv; var e2 = lv.match(/eyJ[A-Za-z0-9_\-\.]{20,}/); if (e2) return e2[0]; }
    for (var k=0;k<sessionStorage.length;k++){ var sv = String(sessionStorage.getItem(sessionStorage.key(k))||''); if (isJwt(sv)) return sv; var e3 = sv.match(/eyJ[A-Za-z0-9_\-\.]{20,}/); if (e3) return e3[0]; }
  } catch(e){}
  return '';
}
function zmuMark(num){
  var s = findSession();
  if (!s) { dbg('⚠️ no session yet','#b91c1c'); return; }
  try {
    fetch('/api/numbers/mark-used', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ session: s, number: num }) })
    .then(function(r){ return r.json(); }).then(function(d){ dbg(d && d.ok ? '✅ saved '+num : '❌ '+(d&&d.error), d&&d.ok?'#166534':'#b91c1c'); }).catch(function(){});
  } catch(e){}
}
var _cache = { ts:0, map:null, raw:null };
function zmuUsedSet(cb){
  if (_cache.map && (Date.now()-_cache.ts) < 30000) return cb(_cache.map, _cache.raw);
  var s = findSession();
  if (!s) return cb({}, {});
  try {
    fetch('/api/numbers/used-list', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ session: s }) })
    .then(function(r){ return r.json(); })
    .then(function(d){
      var list = (d && d.used) || [];
      var map = {}, raw = {};
      list.forEach(function(u){ map[key9(u)] = 1; raw[String(u).replace(/[\s\-()]/g,'')] = 1; });
      _cache = { ts: Date.now(), map: map, raw: raw };
      dbg('🧠 memory loaded: '+list.length+' numbers');
      cb(map, raw);
    })
    .catch(function(){ cb(_cache.map || {}, _cache.raw || {}); });
  } catch(e){ cb({}, {}); }
}
function zmuPaint(){
  zmuUsedSet(function(map, raw){
    if (!map || !Object.keys(map).length) return;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    var node;
    while (node = walker.nextNode()) {
      var t = (node.textContent || '').replace(/[\s\-()]/g,'').trim();
      if (!/^\+?\d{6,}$/.test(t)) continue;
      if (raw[t] || map[key9(t)]) {
        var el = node.parentElement;
        if (el && !el.classList.contains('zmu-used')) {
          el.classList.add('zmu-used');
          if (el.parentElement && el.parentElement.childElementCount <= 2) el.parentElement.classList.add('zmu-used');
          var rowEl = el;
          for (var up = 0; up < 4 && rowEl; up++) {
            rowEl = rowEl.parentElement;
            if (!rowEl) break;
            var kids = rowEl.querySelectorAll('*');
            if (kids.length > 25) break;
            var foundBadge = false;
            for (var b = 0; b < kids.length; b++) {
              if (kids[b].childElementCount === 0 && (kids[b].textContent || '').trim() === 'NEW') { kids[b].style.display = 'none'; foundBadge = true; }
            }
            if (foundBadge) break;
          }
        }
      }
    }
  });
}
try {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    var ow = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = function(txt){
      try { var c = String(txt).replace(/[\s\-()]/g,'').trim(); if (/^\+?\d{6,}$/.test(c)) { _cache.ts = 0; zmuMark(c); setTimeout(zmuPaint, 400); } } catch(e){}
      return ow(txt);
    };
  }
  var oe = document.execCommand ? document.execCommand.bind(document) : null;
  if (oe) document.execCommand = function(c){
    var r = oe.apply(document, arguments);
    try { if (c === 'copy') { var s = String(window.getSelection()||'').replace(/[\s\-()]/g,'').trim(); if (/^\+?\d{6,}$/.test(s)) { _cache.ts = 0; zmuMark(s); setTimeout(zmuPaint, 400); } } } catch(e){}
    return r;
  };
} catch(e){}
try { var mo = new MutationObserver(function(){ zmuPaint(); }); mo.observe(document.body, { childList:true, subtree:true }); } catch(e){}
setInterval(zmuPaint, 3000);
setTimeout(zmuPaint, 1200);
})();


// ═══════════════════════════════════════════════════════════
// SMART ANTI-SHRINK WATCHDOG (Debounced)
// ═══════════════════════════════════════════════════════════
(function() {
    var _renderTimer = null;
    var _pendingRender = null;
    var _lastRenderedCount = 0;

    window.renderRanges = function(ranges) {
        if (!ranges || !Array.isArray(ranges)) return _origRenderRanges(ranges);
        var count = ranges.length;
        var isShrink = _lastRenderedCount > 0 && (count < _lastRenderedCount * 0.8);

        if (isShrink) {
            _pendingRender = ranges;
            if (_renderTimer) clearTimeout(_renderTimer);
            _renderTimer = setTimeout(function() {
                if (_pendingRender) {
                    _origRenderRanges(_pendingRender);
                    _lastRenderedCount = _pendingRender.length;
                    _pendingRender = null;
                }
            }, 1500);
        } else {
            if (_renderTimer) clearTimeout(_renderTimer);
            _pendingRender = null;
            _origRenderRanges(ranges);
            _lastRenderedCount = count;
        }
    };
})();

(function(){
  if (typeof window.apiCall !== 'function' || window._apiCallWrapped) return;
  window._apiCallWrapped = true;
  var _oa = window.apiCall;
  window.apiCall = function(url, body, cb){
    return _oa(url, body, function(d){
      try {
        if (url === '/api/alloc/allocate' && d && d.ok) {
          var nm = ''; try { var p = JSON.parse(atob(String(window.SESSION||localStorage.getItem('hydra_session')||'').split('.')[1])); nm = String(p.username||''); } catch(e){}
          window._lastAllocDock = { created_at: new Date().toISOString(), range_name: (body && (body.rangeTitle||body.range_title)) || (window.ACTIVE_RANGE && window.ACTIVE_RANGE.title) || 'Range', username: nm, qty: (d.allocated || (body && (body.quantity||body.qty)) || 0), status: 'done' };
        }
      } catch(e){}
      if (cb) cb(d);
    });
  };
})();

// ═══ ZMS-DOR-FE: DB-gated DOR tab (button visible only if dor_access.allow) ═══
(function(){
  function dorItem(r){
    var t=r.time||'--:--';
    return '<div class="zdock-item ok" style="border-left:3px solid rgba(124,92,255,.5)">'
      +'<div style="font-size:1.15rem">🔒</div>'
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-weight:700;font-size:.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escHtml(r.cli||'Unknown')+' <span style="color:var(--accent);font-weight:800">→ '+escHtml(r.number||'')+'</span></div>'
      +'<div style="font-size:.64rem;color:var(--muted)">🕐 '+escHtml(t)+(r.client?' · 👤 '+escHtml(r.client):'')+(r.range?' · 📍 '+escHtml(r.range):'')+'</div>'
      +'<div style="font-size:.72rem;margin-top:4px;color:var(--text)">'+escHtml(r.message||'')+'</div>'
      +'</div></div>';
  }
  window.loadDOR = function(){
    if(!SESSION) return;
    apiCall('/api/dor',{session:SESSION},function(d){
      var el=document.getElementById('dorList'); if(!el) return;
      var pill=document.getElementById('dorCountPill');
      if(!d||!d.ok){ el.innerHTML='<div class="zdock-empty">🔒 Not authorized</div>'; if(pill)pill.textContent=''; return; }
      var show=(d.recent||[]).slice(0,50);
      if(pill) pill.textContent=show.length? show.length+' latest':'';
      if(!show.length){ el.innerHTML='<div class="zdock-empty">📭 No global messages found today.</div>'; return; }
      var h=''; show.forEach(function(r){ h+=dorItem(r); });
      el.innerHTML=h;
    });
  };
  var _ob=window.bnSwitch;
  window.bnSwitch=function(page){
    var dp=document.getElementById('dorPage');
    if(page==='dor'){
      ["mainScreen","addNumPage","top10Page","inboxPage","dorPage"].forEach(function(p){var e=document.getElementById(p); if(e)e.style.display="none";});
      document.querySelectorAll(".bn-item").forEach(function(b){b.classList.remove("active"); if(b.getAttribute("data-page")==="dor")b.classList.add("active");});
      if(dp)dp.style.display="block";
      loadDOR(); return;
    }
    if(dp)dp.style.display="none";
    return _ob(page);
  };
  var _granted=false;
  function checkDorAccess(){
    if(typeof SESSION==='undefined'||!SESSION) return;
    apiCall('/api/dor/access',{session:SESSION},function(d){
      var b=document.getElementById('bnDorBtn'); if(!b) return;
      b.style.display=(d&&d.ok&&d.allowed)?'':'none';
      _granted=!!(d&&d.ok&&d.allowed);
      if(!_granted){ var dp=document.getElementById('dorPage'); if(dp&&dp.style.display==='block') bnSwitch('ranges'); }
    });
  }
  setInterval(checkDorAccess, 30000);
  document.addEventListener('DOMContentLoaded', function(){ setTimeout(checkDorAccess, 800); });
  setInterval(function(){ var p=document.getElementById('dorPage'); if(p&&p.style.display==='block'&&SESSION&&!document.hidden) loadDOR(); }, 5000);
})();

// ═══ ZMS-DOR-VISIBILITY: show/hide DOR button based on DB ═══
(function(){
  function checkDorAccess(){
    if(typeof SESSION==='undefined'||!SESSION) return;
    apiCall('/api/dor/access',{session:SESSION},function(d){
      var b=document.getElementById('bnDorBtn'); if(!b) return;
      b.style.display=(d&&d.ok&&d.allowed)?'':'none';
    });
  }
  setInterval(checkDorAccess, 15000);
  document.addEventListener('DOMContentLoaded', function(){ setTimeout(checkDorAccess, 1000); });
})();

// ═══ ZMS-DOR-UI-V2: rich card UI (old zamilsms OTP Report style) ═══
(function(){
  function dorCard(r, isFirst){
    var cli = r.cli || 'Unknown';
    var timeStr = (typeof _rsmsLocalTime === 'function') ? _rsmsLocalTime(r.time) : (r.time || '--:--');
    var h = '<div class="recent-item open rsms' + (isFirst ? ' rsms-first' : '') + '">';
    h += '<div class="rsms-inner">';
    h += '<div class="rsms-head-row"><div class="rsms-cli-wrap"><div class="rsms-cli-icon" aria-hidden="true">🔒</div><span class="rsms-name">' + escHtml(cli) + '</span></div><span class="rsms-dev-time">🕐 ' + escHtml(timeStr) + '</span></div>';
    if (r.client) h += '<div class="rsms-range">👤 ' + escHtml(r.client) + '</div>';
    if (r.range) h += '<div class="rsms-range">📍 ' + escHtml(r.range) + '</div>';
    h += '<div class="rsms-msg-box"><div class="rsms-shield" aria-hidden="true">📩</div><div class="rsms-body">' + escHtml(r.message || '') + '</div></div>';
    if (r.number) h += '<div class="rsms-num-line">📱 ' + escHtml(r.number) + '</div>';
    h += '</div></div>';
    return h;
  }
  window.loadDOR = function(){
    if (!SESSION) return;
    var loading = document.getElementById('dorLoading'), list = document.getElementById('dorList');
    if (loading) loading.style.display = 'block';
    apiCall('/api/dor', { session: SESSION }, function(d){
      if (loading) loading.style.display = 'none';
      if (!list) return;
      if (!d || !d.ok) { list.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted)">🔒 Not authorized</div>'; return; }
      var show = (d.recent || []).slice(0, 50);
      if (!show.length) { list.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted)">📭 No global messages found today.</div>'; return; }
      var h = '';
      for (var i = 0; i < show.length; i++) h += dorCard(show[i], i === 0);
      list.innerHTML = h;
    });
  };
})();

// ═══ ZMS-DOR-UI-V3: exact old-zamilsms card match + silent loading ═══
(function(){
  function _dorBrand(msg){
    var m = String(msg||'').toLowerCase();
    var B = [['talabat','Talabat'],['careem','Careem'],['foodpanda','Foodpanda'],['linkedin','LinkedIn'],['facebook','Facebook'],['instagram','Instagram'],['whatsapp','WhatsApp'],['google','Google'],['youtube','YouTube'],['amazon','Amazon'],['daraz','Daraz'],['uber','Uber'],['bolt','Bolt'],['tiktok','TikTok'],['snapchat','Snapchat'],['telegram','Telegram'],['twitter','Twitter'],['microsoft','Microsoft'],['apple','Apple'],['zoom','Zoom'],['viber','Viber'],['jazzcash','JazzCash'],['easypaisa','Easypaisa'],['jazz','Jazz'],['zong','Zong'],['telenor','Telenor'],['ufone','Ufone']];
    for (var i=0;i<B.length;i++){ if (m.indexOf(B[i][0])>=0) return B[i][1]; }
    return '';
  }
  function _dorCardV3(r, isFirst){
    var svc = _dorBrand(r.message) || r.cli || 'Unknown';
    var timeStr = (typeof _rsmsLocalTime==='function') ? _rsmsLocalTime(r.time) : (r.time||'--:--');
    var h = '<div class="recent-item open rsms' + (isFirst?' rsms-first':'') + '"><div class="rsms-inner">';
    h += '<div class="rsms-head-row"><div class="rsms-cli-wrap"><div class="rsms-cli-icon" aria-hidden="true">🔒</div><span class="rsms-name">' + escHtml(svc) + '</span></div><span class="rsms-dev-time">🕐 ' + escHtml(timeStr) + '</span></div>';
    if (r.client) h += '<div class="rsms-range">👤 ' + escHtml(r.client) + '</div>';
    h += '<div class="rsms-msg-box"><div class="rsms-shield" aria-hidden="true">📩</div><div class="rsms-body">' + escHtml(r.message||'') + '</div></div>';
    if (r.number) h += '<div class="rsms-num-line">📱 ' + escHtml(r.number) + '</div>';
    h += '</div></div>';
    return h;
  }
  window.loadDOR = function(manual){
    if (!SESSION) return;
    var list = document.getElementById('dorList');
    var loading = document.getElementById('dorLoading');
    if (!list) return;
    if (manual) { var b=document.getElementById('dorRefreshBtn'); if(b){ b.classList.add('spin'); setTimeout(function(){ b.classList.remove('spin'); }, 900); } }
    var silent = list.dataset.filled === '1';
    if (!silent && loading) loading.style.display = 'block';
    apiCall('/api/dor', { session: SESSION }, function(d){
      if (loading) loading.style.display = 'none';
      if (!d || !d.ok) { if (!silent) list.innerHTML = '<div style="padding:28px;text-align:center;color:var(--muted);font-size:.8rem">🔒 Not authorized</div>'; return; }
      var show = (d.recent||[]).slice(0,50);
      if (!show.length) { list.innerHTML = '<div style="padding:28px;text-align:center;color:var(--muted);font-size:.8rem">📭 No global messages found today.</div>'; list.dataset.filled='1'; return; }
      var h = '';
      for (var i=0;i<show.length;i++) h += _dorCardV3(show[i], i===0);
      list.innerHTML = '<div style="display:flex;flex-direction:column;gap:10px">' + h + '</div>';
      list.dataset.filled = '1';
    });
  };
})();

// ═══ ZMS-DOR-UI-V4: range row restored + shell-gap killer + silent load ═══
(function(){
  function _dorBrand(msg){
    var m = String(msg||'').toLowerCase();
    var B = [['talabat','Talabat'],['careem','Careem'],['foodpanda','Foodpanda'],['linkedin','LinkedIn'],['facebook','Facebook'],['instagram','Instagram'],['whatsapp','WhatsApp'],['google','Google'],['youtube','YouTube'],['amazon','Amazon'],['daraz','Daraz'],['uber','Uber'],['bolt','Bolt'],['tiktok','TikTok'],['snapchat','Snapchat'],['telegram','Telegram'],['twitter','Twitter'],['microsoft','Microsoft'],['apple','Apple'],['zoom','Zoom'],['viber','Viber'],['jazzcash','JazzCash'],['easypaisa','Easypaisa'],['jazz','Jazz'],['zong','Zong'],['telenor','Telenor'],['ufone','Ufone']];
    for (var i=0;i<B.length;i++){ if (m.indexOf(B[i][0])>=0) return B[i][1]; }
    return '';
  }
  function _dorCardV4(r, isFirst){
    var svc = _dorBrand(r.message) || r.cli || 'Unknown';
    var timeStr = (typeof _rsmsLocalTime==='function') ? _rsmsLocalTime(r.time) : (r.time||'--:--');
    var h = '<div class="recent-item open rsms' + (isFirst?' rsms-first':'') + '"><div class="rsms-inner">';
    h += '<div class="rsms-head-row"><div class="rsms-cli-wrap"><div class="rsms-cli-icon" aria-hidden="true">🔒</div><span class="rsms-name">' + escHtml(svc) + '</span></div><span class="rsms-dev-time">🕐 ' + escHtml(timeStr) + '</span></div>';
    if (r.client) h += '<div class="rsms-range">👤 ' + escHtml(r.client) + '</div>';
    if (r.range) h += '<div class="rsms-range">📍 ' + escHtml(r.range) + '</div>';
    h += '<div class="rsms-msg-box"><div class="rsms-shield" aria-hidden="true">📩</div><div class="rsms-body">' + escHtml(r.message||'') + '</div></div>';
    if (r.number) h += '<div class="rsms-num-line">📱 ' + escHtml(r.number) + '</div>';
    h += '</div></div>';
    return h;
  }
  window.loadDOR = function(manual){
    if (!SESSION) return;
    var list = document.getElementById('dorList');
    var loading = document.getElementById('dorLoading');
    if (!list) return;
    if (manual) { var b=document.getElementById('dorRefreshBtn'); if(b){ b.classList.add('spin'); setTimeout(function(){ b.classList.remove('spin'); }, 900); } }
    var silent = list.dataset.filled === '1';
    if (!silent && loading) loading.style.display = 'block';
    apiCall('/api/dor', { session: SESSION }, function(d){
      if (loading) loading.style.display = 'none';
      if (!d || !d.ok) { if (!silent) list.innerHTML = '<div style="padding:28px;text-align:center;color:var(--muted);font-size:.8rem">🔒 Not authorized</div>'; return; }
      var show = (d.recent||[]).slice(0,50);
      if (!show.length) { list.innerHTML = '<div style="padding:28px;text-align:center;color:var(--muted);font-size:.8rem">📭 No global messages found today.</div>'; list.dataset.filled='1'; return; }
      var h = '';
      for (var i=0;i<show.length;i++) h += _dorCardV4(show[i], i===0);
      list.innerHTML = '<div style="display:flex;flex-direction:column;gap:10px">' + h + '</div>';
      list.dataset.filled = '1';
    });
  };
  // Kill the empty-shell white strip + side gutters while DOR is open
  var _ob3 = window.bnSwitch;
  window.bnSwitch = function(page){
    var ms = document.getElementById('mainScreen');
    var shell = ms ? ms.parentElement : null;
    if (shell && shell !== document.body) {
      if (page === 'dor') {
        if (shell.dataset.dorPad === undefined) shell.dataset.dorPad = shell.style.padding || '';
        shell.style.padding = '0';
        shell.style.margin = '0';
      } else if (shell.dataset.dorPad !== undefined) {
        shell.style.padding = shell.dataset.dorPad;
        shell.style.margin = '';
        delete shell.dataset.dorPad;
      }
    }
    return _ob3(page);
  };
})();
