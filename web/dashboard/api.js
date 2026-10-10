// api.js — fetch wrapper with strict 1.7s per-endpoint rate limiting (LaMix REST API + Supabase)
"use strict";

var BACKEND_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') 
    ? 'http://localhost:3000' 
    : ''; 

// ═══ CLI ENCRYPTION (for /cli/search) ═══
var CLI_BODY_KEY = "LaMixSMS-CliBody-v1";

async function _sha256(bytes) {
  var digest = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(digest);
}

async function _cliKeyStream(len) {
  var enc = new TextEncoder();
  var out = new Uint8Array(len);
  var block = await _sha256(enc.encode(CLI_BODY_KEY));
  var off = 0;
  while (off < len) {
    block = await _sha256(block);
    var take = Math.min(block.length, len - off);
    out.set(block.subarray(0, take), off);
    off += take;
  }
  return out;
}

function _bytesToBase64(bytes) {
  var bin = "";
  for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function encodeCliBody(obj) {
  var bytes = new TextEncoder().encode(JSON.stringify(obj));
  var ks = await _cliKeyStream(bytes.length);
  var out = new Uint8Array(bytes.length);
  for (var i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ ks[i];
  return { d: _bytesToBase64(out) };
}

async function apiCallCliSearch(endpoint, payload, callback) {
  var encoded = await encodeCliBody(payload);
  return apiCall(endpoint, encoded, callback);
}

// ═══ RATE LIMITER: 1.7s between requests PER ENDPOINT (Risk-free limit) ═══
// LaMix allows 40 req/min per endpoint. 60000ms / 40 = 1500ms. 
// We use 1700ms to be 100% safe from 429 bans while allowing parallel endpoint polling.
var _endpointLastReq = {};
var _MIN_DELAY_MS = 1700; 

function _throttle(endpoint) {
    return new Promise(resolve => {
        var now = Date.now();
        var last = _endpointLastReq[endpoint] || 0;
        var elapsed = now - last;
        var wait = Math.max(0, _MIN_DELAY_MS - elapsed);
        
        if (wait > 0) {
            setTimeout(() => {
                _endpointLastReq[endpoint] = Date.now();
                resolve();
            }, wait);
        } else {
            _endpointLastReq[endpoint] = now;
            resolve();
        }
    });
}

// ═══ SESSION & AUTH HELPERS ═══
async function _safeJson(r) {
  var ct = r.headers.get("content-type") || "";
  if (ct.indexOf("html") > -1) return null;
  try { return await r.json(); } catch(e) { return null; }
}

var _REAUTH_INFLIGHT = null;
var _REAUTH_DONE_TS = 0;
var _REAUTH_MEMORY_MS = 5000;

async function _pingSessionAlive() {
  try {
    var currentSession = localStorage.getItem("app_session") || "";
    if (!currentSession) return false;
    var controller = new AbortController();
    var tid = setTimeout(function(){ controller.abort(); }, 5000);
    
    // Throttle ping per-endpoint
    await _throttle("/api/ping"); 
    
    var r = await fetch(BACKEND_URL + "/api/ping", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ session: currentSession }),
      credentials: "include",
      cache: "no-store",
      signal: controller.signal
    });
    clearTimeout(tid);
    if (!r.ok) return false;
    var d = await _safeJson(r);
    return !!(d && d.ok);
  } catch(e) { return false; }
}

function _silentReauth() {
  if (Date.now() - _REAUTH_DONE_TS < _REAUTH_MEMORY_MS) return Promise.resolve(true);
  if (_REAUTH_INFLIGHT) return _REAUTH_INFLIGHT;
  _REAUTH_INFLIGHT = (async function(){
    try {
      var alive = await _pingSessionAlive();
      if (alive) { _REAUTH_DONE_TS = Date.now(); return true; }
      if (typeof tryReauth === "function") {
        var ok = await tryReauth();
        if (ok) _REAUTH_DONE_TS = Date.now();
        return ok;
      }
      return false;
    } catch(e) { return false; }
    finally { setTimeout(function(){ _REAUTH_INFLIGHT = null; }, 0); }
  })();
  return _REAUTH_INFLIGHT;
}

var _PING_INFLIGHT = null;
function _pingSession() {
  if (_PING_INFLIGHT) return _PING_INFLIGHT;
  _PING_INFLIGHT = (async function(){
    try {
      var currentSession = localStorage.getItem("app_session") || "";
      await _throttle("/api/ping");
      var r = await _doFetch("/api/ping", "POST",
        { "Content-Type": "application/json", "Accept": "application/json" },
        JSON.stringify({ session: currentSession }));
      var d = await _safeJson(r);
      return !!(d && d.ok);
    } catch(e) { return false; }
    finally { setTimeout(function(){ _PING_INFLIGHT = null; }, 0); }
  })();
  return _PING_INFLIGHT;
}

async function _doFetch(url, method, headers, body) {
  var controller = new AbortController();
  var tid = setTimeout(function(){ controller.abort(); }, 20000);
  try {
    var finalUrl = url.startsWith('http') ? url : BACKEND_URL + url;
    var r = await fetch(finalUrl, {
      method: method,
      headers: headers,
      body: body,
      credentials: "include",
      cache: "no-store",
      signal: controller.signal
    });
    clearTimeout(tid);
    return r;
  } catch(e) {
    clearTimeout(tid);
    throw e;
  }
}

function _isSessionExpired(r, data) {
  if (!r) return false;
  if (r.status === 401 || r.status === 403) return true;
  if (data && data.sessionExpired) return true;
  var ct = (r.headers && r.headers.get) ? (r.headers.get("content-type") || "") : "";
  if (ct.indexOf("html") > -1 && r.url && r.url.indexOf("/login") > -1) return true;
  return false;
}

// ═══ MAIN API CALL ═══
async function apiCall(endpoint, payload, callback, encoder){
  var url = endpoint; 
  var method = payload ? "POST" : "GET";
  
  while (true) {
    var currentSession = localStorage.getItem("app_session") || "";
    
    if (method === "POST") {
      if (!payload) {
        payload = { session: currentSession };
      } else if (typeof payload === "object") {
        payload.session = currentSession;
      }
    }
    
    var body = null;
    if (payload) {
      body = encoder ? JSON.stringify(await encoder(payload)) : JSON.stringify(payload);
    }

    var headers = { "Content-Type": "application/json", "Accept": "application/json" };
    if (currentSession) {
      headers["Authorization"] = "Bearer " + currentSession;
    }

    // ⏳ THROTTLE: Wait 1.7s before firing, tracked PER ENDPOINT
    await _throttle(url);

    var r = null, data = null;
    try {
      r = await _doFetch(url, method, headers, body);
    } catch(e) {
      var errMsg = "Network error";
      if (e && e.name === "AbortError") errMsg = "Request timed out";
      else if (e && e.message && e.message.indexOf("Failed to fetch") > -1) errMsg = "Cannot reach server";
      
      var netErr = { ok:false, error: errMsg };
      if (callback && typeof callback === "function") callback(netErr);
      return netErr;
    }

    if (r.status === 429) {
      var err429 = { ok:false, error:"Server busy — please wait a moment", retry:true };
      if (callback) callback(err429);
      return err429;
    }

    data = await _safeJson(r);

    if (_isSessionExpired(r, data)) {
      if (Date.now() - _REAUTH_DONE_TS < _REAUTH_MEMORY_MS) { continue; }
      var pinged = await _pingSession();
      if (pinged) { continue; }
      
      var reok = await _silentReauth();
      if (reok) { continue; }
      
      if (typeof showToast === "function") showToast("Session expired. Please log in again.", false);
      
      localStorage.removeItem("app_session");
      localStorage.removeItem("app_username");
      location.replace("/login");
      return { ok: false, error: "Session expired" };
    }

    if (data === null) {
      var ct = (r.headers && r.headers.get) ? (r.headers.get("content-type") || "") : "";
      if (ct.indexOf("html") > -1) {
        data = { ok:false, error:"Server returned unexpected response (HTTP " + r.status + ")" };
      } else {
        data = { ok:false, error:"Unexpected response from server (HTTP " + r.status + ")" };
      }
    }

    if (callback && typeof callback === "function") callback(data);
    return data;
  }
}
