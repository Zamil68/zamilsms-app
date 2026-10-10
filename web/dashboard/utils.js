// utils.js — caches, country code stripping, flags, toasts

// ── CACHE KEYS ──
var CACHE_KEY_RANGES = "cache_ranges";
var CACHE_TTL        = 30 * 60 * 1000;       // 30 min for ranges
var NUM_CACHE_TTL    = 3  * 60 * 60 * 1000;  // 3 hours for per-range numbers

// ── CACHE FUNCTIONS ──
function cacheGet(key, ttlOverride){
  try {
    var raw = localStorage.getItem(key);
    if(!raw) return null;
    var data = JSON.parse(raw);
    var ttl  = ttlOverride || CACHE_TTL;
    if(data.ts && (Date.now() - data.ts) > ttl) {
      data.stale = true;
    }
    return data;
  } catch(e) { return null; }
}
function cacheSet(key, data){
  try {
    localStorage.setItem(key, JSON.stringify({data: data, ts: Date.now()}));
  } catch(e) {}
}
function numCacheKey(rangeId){
  return "cache_nums_" + rangeId;
}
function numCacheGet(rangeId){ return cacheGet(numCacheKey(rangeId), NUM_CACHE_TTL); }


function sessionExtend(){
  try { localStorage.setItem("app_session_ts", Date.now().toString()); } catch(e) {}
}

// ── NEW TAG FUNCTIONS ──
function newTagLoad(rangeId){
  try {
    var raw = localStorage.getItem("new_nums_" + rangeId);
    if(!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch(e) { return new Set(); }
}
function newTagSave(rangeId, set){
  try { localStorage.setItem("new_nums_" + rangeId, JSON.stringify(Array.from(set))); } catch(e) {}
}
function newTagRemove(rangeId, num){
  var set = newTagLoad(rangeId);
  set.delete(num);
  newTagSave(rangeId, set);
}

// ── COUNTRY CODE PREFIX TABLE (ITU E.164, common subset) ──
// Use Set lookup, longest prefix wins (3 -> 2 -> 1 digit).
var CC_SET = new Set([
  "1","7",
  "20","27","30","31","32","33","34","36","39","40","41","43","44","45","46","47","48","49",
  "51","52","53","54","55","56","57","58","60","61","62","63","64","65","66",
  "81","82","84","86","90","91","92","93","94","95","98",
  "211","212","213","216","218","220","221","222","223","224","225","226","227","228","229",
  "230","231","232","233","234","235","236","237","238","239",
  "240","241","242","243","244","245","246","248","249",
  "250","251","252","253","254","255","256","257","258",
  "260","261","262","263","264","265","266","267","268","269",
  "290","291","297","298","299",
  "350","351","352","353","354","355","356","357","358","359",
  "370","371","372","373","374","375","376","377","378","379",
  "380","381","382","383","385","386","387","389",
  "420","421","423",
  "500","501","502","503","504","505","506","507","508","509",
  "590","591","592","593","594","595","596","597","598","599",
  "670","672","673","674","675","676","677","678","679",
  "680","681","682","683","685","686","687","688","689","690","691","692",
  "850","852","853","855","856","880","886",
  "960","961","962","963","964","965","966","967","968","970","971","972","973","974","975","976","977",
  "992","993","994","995","996","998"
]);

function stripPlus(num){ return String(num||"").replace(/^\+/, "").replace(/^00/, ""); }

// Per-number country-code strip. Returns local subscriber portion.
function stripCC(num){
  var s = stripPlus(num);
  if (!s) return num;
  // Try 3-digit, then 2-digit, then 1-digit
  if (s.length > 3 && CC_SET.has(s.slice(0,3))) return s.slice(3);
  if (s.length > 2 && CC_SET.has(s.slice(0,2))) return s.slice(2);
  if (s.length > 1 && CC_SET.has(s.slice(0,1))) return s.slice(1);
  return s;
}

// Detect dominant CC length across a list (used for one-shot bulk strip / hint)
function detectCCLen(nums){
  if(!nums || !nums.length) return 0;
  var counts = {};
  for (var i = 0; i < Math.min(nums.length, 30); i++){
    var s = stripPlus(nums[i]);
    var len = 0;
    if (s.length > 3 && CC_SET.has(s.slice(0,3))) len = 3;
    else if (s.length > 2 && CC_SET.has(s.slice(0,2))) len = 2;
    else if (s.length > 1 && CC_SET.has(s.slice(0,1))) len = 1;
    counts[len] = (counts[len]||0) + 1;
  }
  var best = 0, bc = 0;
  for (var k in counts){ if (counts[k] > bc) { bc = counts[k]; best = parseInt(k); } }
  return best;
}

// ── FLAG EMOJI (expanded; reduces 🌐 fallback) ──
var FLAGS = {
  // North America
  "usa":"🇺🇸","us":"🇺🇸","united states":"🇺🇸","america":"🇺🇸",
  "canada":"🇨🇦","ca":"🇨🇦","mexico":"🇲🇽","mx":"🇲🇽",
  // Latin America / Caribbean
  "brazil":"🇧🇷","br":"🇧🇷","argentina":"🇦🇷","ar":"🇦🇷","chile":"🇨🇱","cl":"🇨🇱",
  "colombia":"🇨🇴","co":"🇨🇴","peru":"🇵🇪","pe":"🇵🇪","venezuela":"🇻🇪","ve":"🇻🇪",
  "ecuador":"🇪🇨","ec":"🇪🇨","bolivia":"🇧🇴","bo":"🇧🇴","paraguay":"🇵🇾","py":"🇵🇾",
  "uruguay":"🇺🇾","uy":"🇺🇾","cuba":"🇨🇺","cu":"🇨🇺","jamaica":"🇯🇲","jm":"🇯🇲",
  "haiti":"🇭🇹","ht":"🇭🇹","dominican":"🇩🇴","do":"🇩🇴","panama":"🇵🇦","pa":"🇵🇦",
  "guatemala":"🇬🇹","gt":"🇬🇹","honduras":"🇭🇳","hn":"🇭🇳","el salvador":"🇸🇻","sv":"🇸🇻",
  "nicaragua":"🇳🇮","ni":"🇳🇮","costa rica":"🇨🇷","cr":"🇨🇷","puerto rico":"🇵🇷","pr":"🇵🇷",
  "trinidad":"🇹🇹","tt":"🇹🇹","barbados":"🇧🇧","bb":"🇧🇧","bahamas":"🇧🇸","bs":"🇧🇸",
  // Europe
  "uk":"🇬🇧","united kingdom":"🇬🇧","britain":"🇬🇧","england":"🇬🇧","gb":"🇬🇧",
  "ireland":"🇮🇪","ie":"🇮🇪","france":"🇫🇷","fr":"🇫🇷","germany":"🇩🇪","de":"🇩🇪",
  "spain":"🇪🇸","es":"🇪🇸","portugal":"🇵🇹","pt":"🇵🇹","italy":"🇮🇹","it":"🇮🇹",
  "netherlands":"🇳🇱","nl":"🇳🇱","belgium":"🇧🇪","be":"🇧🇪","luxembourg":"🇱🇺","lu":"🇱🇺",
  "switzerland":"🇨🇭","ch":"🇨🇭","austria":"🇦🇹","at":"🇦🇹","sweden":"🇸🇪","se":"🇸🇪",
  "norway":"🇳🇴","no":"🇳🇴","denmark":"🇩🇰","dk":"🇩🇰","finland":"🇫🇮","fi":"🇫🇮",
  "iceland":"🇮🇸","is":"🇮🇸","poland":"🇵🇱","pl":"🇵🇱","czech":"🇨🇿","cz":"🇨🇿",
  "slovakia":"🇸🇰","sk":"🇸🇰","hungary":"🇭🇺","hu":"🇭🇺","romania":"🇷🇴","ro":"🇷🇴",
  "bulgaria":"🇧🇬","bg":"🇧🇬","greece":"🇬🇷","gr":"🇬🇷","croatia":"🇭🇷","hr":"🇭🇷",
  "serbia":"🇷🇸","rs":"🇷🇸","slovenia":"🇸🇮","si":"🇸🇮","bosnia":"🇧🇦","ba":"🇧🇦",
  "macedonia":"🇲🇰","mk":"🇲🇰","montenegro":"🇲🇪","me":"🇲🇪","albania":"🇦🇱","al":"🇦🇱",
  "kosovo":"🇽🇰","xk":"🇽🇰","ukraine":"🇺🇦","ua":"🇺🇦","belarus":"🇧🇾","by":"🇧🇾",
  "moldova":"🇲🇩","md":"🇲🇩","russia":"🇷🇺","ru":"🇷🇺","estonia":"🇪🇪","ee":"🇪🇪",
  "latvia":"🇱🇻","lv":"🇱🇻","lithuania":"🇱🇹","lt":"🇱🇹","malta":"🇲🇹","mt":"🇲🇹",
  "cyprus":"🇨🇾","cy":"🇨🇾","turkey":"🇹🇷","tr":"🇹🇷",
  // Africa
  "egypt":"🇪🇬","eg":"🇪🇬","morocco":"🇲🇦","ma":"🇲🇦","algeria":"🇩🇿","dz":"🇩🇿",
  "tunisia":"🇹🇳","tn":"🇹🇳","libya":"🇱🇾","ly":"🇱🇾","sudan":"🇸🇩","sd":"🇸🇩",
  "south africa":"🇿🇦","za":"🇿🇦","nigeria":"🇳🇬","ng":"🇳🇬","kenya":"🇰🇪","ke":"🇰🇪",
  "tanzania":"🇹🇿","tz":"🇹🇿","uganda":"🇺🇬","ug":"🇺🇬","ethiopia":"🇪🇹","et":"🇪🇹",
  "ghana":"🇬🇭","gh":"🇬🇭","senegal":"🇸🇳","sn":"🇸🇳","ivory coast":"🇨🇮","ci":"🇨🇮",
  "cameroon":"🇨🇲","cm":"🇨🇲","angola":"🇦🇴","ao":"🇦🇴","mozambique":"🇲🇿","mz":"🇲🇿",
  "zambia":"🇿🇲","zm":"🇿🇲","zimbabwe":"🇿🇼","zw":"🇿🇼","namibia":"🇳🇦","na":"🇳🇦",
  "botswana":"🇧🇼","bw":"🇧🇼","rwanda":"🇷🇼","rw":"🇷🇼","burundi":"🇧🇮","bi":"🇧🇮",
  "madagascar":"🇲🇬","mg":"🇲🇬","mauritius":"🇲🇺","mu":"🇲🇺","mali":"🇲🇱","ml":"🇲🇱",
  "burkina faso":"🇧🇫","bf":"🇧🇫","niger":"🇳🇪","ne":"🇳🇪","chad":"🇹🇩","td":"🇹🇩",
  "somalia":"🇸🇴","so":"🇸🇴","gabon":"🇬🇦","ga":"🇬🇦","congo":"🇨🇬","cg":"🇨🇬",
  "drc":"🇨🇩","cd":"🇨🇩","liberia":"🇱🇷","lr":"🇱🇷","sierra leone":"🇸🇱","sl":"🇸🇱",
  "guinea":"🇬🇳","gn":"🇬🇳","gambia":"🇬🇲","gm":"🇬🇲","benin":"🇧🇯","bj":"🇧🇯",
  "togo":"🇹🇬","tg":"🇹🇬","mauritania":"🇲🇷","mr":"🇲🇷","eritrea":"🇪🇷","er":"🇪🇷",
  "djibouti":"🇩🇯","dj":"🇩🇯","malawi":"🇲🇼","mw":"🇲🇼","lesotho":"🇱🇸","ls":"🇱🇸",
  "swaziland":"🇸🇿","sz":"🇸🇿","comoros":"🇰🇲","km":"🇰🇲","seychelles":"🇸🇨","sc":"🇸🇨",
  // Middle East
  "saudi arabia":"🇸🇦","sa":"🇸🇦","saudi":"🇸🇦",
  "uae":"🇦🇪","united arab emirates":"🇦🇪","ae":"🇦🇪","emirates":"🇦🇪",
  "qatar":"🇶🇦","qa":"🇶🇦","bahrain":"🇧🇭","bh":"🇧🇭","kuwait":"🇰🇼","kw":"🇰🇼",
  "oman":"🇴🇲","om":"🇴🇲","yemen":"🇾🇪","ye":"🇾🇪","jordan":"🇯🇴","jo":"🇯🇴",
  "lebanon":"🇱🇧","lb":"🇱🇧","syria":"🇸🇾","sy":"🇸🇾","iraq":"🇮🇶","iq":"🇮🇶",
  "iran":"🇮🇷","ir":"🇮🇷","israel":"🇮🇱","il":"🇮🇱","palestine":"🇵🇸","ps":"🇵🇸",
  "afghanistan":"🇦🇫","af":"🇦🇫",
  // Asia
  "china":"🇨🇳","cn":"🇨🇳","japan":"🇯🇵","jp":"🇯🇵","korea":"🇰🇷","kr":"🇰🇷",
  "south korea":"🇰🇷","north korea":"🇰🇵","kp":"🇰🇵","mongolia":"🇲🇳","mn":"🇲🇳",
  "india":"🇮🇳","in":"🇮🇳","pakistan":"🇵🇰","pk":"🇵🇰","bangladesh":"🇧🇩","bd":"🇧🇩",
  "sri lanka":"🇱🇰","lk":"🇱🇰","nepal":"🇳🇵","np":"🇳🇵","bhutan":"🇧🇹","bt":"🇧🇹",
  "maldives":"🇲🇻","mv":"🇲🇻","myanmar":"🇲🇲","mm":"🇲🇲","burma":"🇲🇲",
  "thailand":"🇹🇭","th":"🇹🇭","vietnam":"🇻🇳","vn":"🇻🇳","laos":"🇱🇦","la":"🇱🇦",
  "cambodia":"🇰🇭","kh":"🇰🇭","malaysia":"🇲🇾","my":"🇲🇾","singapore":"🇸🇬","sg":"🇸🇬",
  "indonesia":"🇮🇩","id":"🇮🇩","philippines":"🇵🇭","phillipines":"🇵🇭","ph":"🇵🇭","brunei":"🇧🇳","bn":"🇧🇳",
  "timor":"🇹🇱","tl":"🇹🇱","taiwan":"🇹🇼","tw":"🇹🇼","hong kong":"🇭🇰","hk":"🇭🇰",
  "macau":"🇲🇴","mo":"🇲🇴",
  "kazakhstan":"🇰🇿","kz":"🇰🇿","uzbekistan":"🇺🇿","uz":"🇺🇿","kyrgyzstan":"🇰🇬","kg":"🇰🇬",
  "tajikistan":"🇹🇯","tj":"🇹🇯","turkmenistan":"🇹🇲","tm":"🇹🇲",
  "armenia":"🇦🇲","am":"🇦🇲","azerbaijan":"🇦🇿","az":"🇦🇿","georgia":"🇬🇪","ge":"🇬🇪",
  // Oceania
  "australia":"🇦🇺","au":"🇦🇺","new zealand":"🇳🇿","nz":"🇳🇿","fiji":"🇫🇯","fj":"🇫🇯",
  "papua":"🇵🇬","pg":"🇵🇬","samoa":"🇼🇸","ws":"🇼🇸","tonga":"🇹🇴","to":"🇹🇴",
  "vanuatu":"🇻🇺","vu":"🇻🇺","solomon":"🇸🇧","sb":"🇸🇧"
};

function getFlag(country){
  if (!country) return "🌐";
  // Lowercase + strip punctuation/parentheses → keep letters & spaces
  var key = String(country).toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g," ").trim();
  if (!key) return "🌐";
  if (FLAGS[key]) return FLAGS[key];
  var parts = key.split(/\s+/);
  // Multi-word combinations from longest → shortest
  for (var len = parts.length; len >= 1; len--){
    for (var i = 0; i + len <= parts.length; i++){
      var sub = parts.slice(i, i+len).join(" ");
      if (FLAGS[sub]) return FLAGS[sub];
    }
  }
  return "🌐";
}

// ═══════════════════════════════════════════════════════════
//  ── TOASTS / OVERLAY & UTILITIES ──
// ═══════════════════════════════════════════════════════════

function showMini(msg, type) { 
  showToast(msg, type === "error" ? "error" : "info"); 
}

function showLoad(txt) {
  var o = document.getElementById("loadingOverlay");
  if (o) {
    o.classList.add("show");
    var t = document.getElementById("loadingText");
    if (t) t.textContent = txt || "Loading...";
  }
}

function hideLoad() {
  var o = document.getElementById("loadingOverlay");
  if (o) o.classList.remove("show");
}

// ── OVERLAY SAFETY NET ──
// If any unexpected JS error or unhandled promise rejection fires while
// the loading overlay is up, force it closed. Without this, a stray
// error mid-request left the spinner stuck forever.
window.addEventListener("error", function() { hideLoad(); });
window.addEventListener("unhandledrejection", function() { hideLoad(); });

// ═══════════════════════════════════════════════════════════
//  SMART TOAST SYSTEM (Modern SVG Icons + Anti-Spam)
// ═══════════════════════════════════════════════════════════

// 1. Modern SVG Icons (Clean, crisp, and scalable)
var SVG_INFO    = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';
var SVG_SUCCESS = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" opacity="0.2"/><path d="m9 12 2 2 4-4"/></svg>';
var SVG_ERROR   = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" opacity="0.2"/><path d="M15 9l-6 6M9 9l6 6"/></svg>';
var SVG_CACHE   = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>';
var SVG_LIVE    = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4"/><path d="m16.2 7.8 2.9-2.9"/><path d="M18 12h4"/><path d="m16.2 16.2 2.9 2.9"/><path d="M12 18v4"/><path d="m4.9 19.1 2.9-2.9"/><path d="M2 12h4"/><path d="m4.9 4.9 2.9 2.9"/></svg>';
var SVG_SHIP    = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 .6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.9 5.8 2.8 8"/><path d="M12 10V4"/><path d="m8 8 4-4 4 4"/></svg>';

var _lastToastMsg = "";
var _lastToastTime = 0;

function showToast(message, type) {
  var msgStr = typeof message === 'object' ? (message.message || message.title || '') : String(message || '');
  
  // 🛑 1. SPAM BLOCKER: Ignore if exact same message shown in last 3 seconds
  var now = Date.now();
  if (msgStr === _lastToastMsg && (now - _lastToastTime) < 3000) {
    return; 
  }
  
  // 🤫 2. SILENT MODE: Stop the "teasing" cache spam on auto-refresh
  if (msgStr.toLowerCase().includes('live list empty') || msgStr.toLowerCase().includes('showing cached')) {
    return; // Silently ignore background cache messages
  }

  _lastToastMsg = msgStr;
  _lastToastTime = now;

  var c = document.getElementById("toast");
  if (!c) {
    c = document.createElement("div");
    c.id = "toast";
    c.className = "toast smart-pill";
    document.body.appendChild(c);
  }
  
  var icon = SVG_INFO; // Default
  var title = '';
  var msg = '';
  
  if (typeof message === 'object' && message !== null) {
    icon = message.icon || icon;
    title = message.title || '';
    msg = message.message || '';
  } else {
    msg = String(message || '');
  }

  // 🧠 3. SMART ICON DETECTION (Overrides default with beautiful SVGs)
  if (type === "success") icon = SVG_SUCCESS;
  else if (type === "error" || type === "err" || type === true) icon = SVG_ERROR;
  else if (type === "info") icon = SVG_INFO;
  else if (msg.toLowerCase().includes('cache')) icon = SVG_CACHE;
  else if (msg.toLowerCase().includes('live') || msg.toLowerCase().includes('sync')) icon = SVG_LIVE;
  else if (msg.toLowerCase().includes('allocat') || msg.toLowerCase().includes('ship')) icon = SVG_SHIP;

  c.innerHTML = 
    '<div class="toast-icon">' + icon + '</div>' +
    '<div class="toast-content">' +
      (title ? '<div class="toast-title">' + escHtml(title) + '</div>' : '') +
      '<div class="toast-message">' + escHtml(msg) + '</div>' +
    '</div>';
  
  var cls = "toast smart-pill show";
  if (type === "error" || type === "err" || type === true) cls += " error";
  else if (type === "success") cls += " success";
  else if (type === "info") cls += " info";
  else if (msg.toLowerCase().includes('cache') || msg.toLowerCase().includes('live') || msg.toLowerCase().includes('ship')) cls += " info"; // fallback styling
  
  c.className = cls;
  clearTimeout(c._t);
  c._t = setTimeout(function() {
    c.classList.remove("show");
  }, 3500); // Slightly faster dismissal
}

// ── HELPER UTILITIES (Required by showToast and other parts of the app) ──
function escHtml(s) {
  if (!s) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function timeAgo(dateInput) {
  if (!dateInput) return "Never";
  var d = new Date(dateInput);
  if (isNaN(d.getTime())) return "Never";
  var secs = Math.floor((new Date() - d) / 1000);
  if (secs < 60) return secs + "s ago";
  if (secs < 3600) return Math.floor(secs / 60) + "m ago";
  if (secs < 86400) return Math.floor(secs / 3600) + "h ago";
  return Math.floor(secs / 86400) + "d ago";
}

// Tiny debounce helper for search inputs
function debounce(fn, ms) {
  var t = 0;
  return function() { 
    var ctx = this, args = arguments;
    clearTimeout(t); 
    t = setTimeout(function() { fn.apply(ctx, args); }, ms || 150); 
  };
}
