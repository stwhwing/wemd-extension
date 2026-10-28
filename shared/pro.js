// WeMD shared Pro-gate module — single source of truth, loaded by BOTH the
// popup (popup.html) and the batch page (batch/batch.html). Extracted from
// popup.js so every Pro consumer verifies the same way (2026-10-26 batch-tab
// refactor).
//
// Pro is granted ONLY by a credential signed with the private key held by the
// vendor's license service; the matching PUBLIC key is embedded below and the
// signature is verified locally on every read. Storage is additionally
// obfuscated. Neither is real DRM — the user owns the extension runtime — but
// together they turn "paste a plain object into storage" into "forge an ECDSA
// P-256 signature", which is not feasible without the private key.
var LICENSE_API = "https://zyx.pink/wemd-api";
var PRO_STORE_KEY = "wemd.ent.v1"; // opaque storage key (was "proLicense")
var OBF_KEY = "wemd-ent-v1-salt"; // storage obfuscation only, NOT a secret
var PRO_PUB_JWK = {
  kty: "EC",
  crv: "P-256",
  x: "7Rq_IWb5bOO6f1wXf78AsztdTBucsMBkVxGT5JFcJk0",
  y: "533YBktazsnM4WBkty3zrKrUV1AMBP-hy4aHVLSdqUo",
};

// --- obfuscation (outer layer; the signature is the real gate) ---------------
function obf(str) {
  var out = "";
  for (var i = 0; i < str.length; i++) {
    out += String.fromCharCode(str.charCodeAt(i) ^ OBF_KEY.charCodeAt(i % OBF_KEY.length));
  }
  return btoa(out);
}
function deobf(b64) {
  var s = atob(b64);
  var out = "";
  for (var i = 0; i < s.length; i++) {
    out += String.fromCharCode(s.charCodeAt(i) ^ OBF_KEY.charCodeAt(i % OBF_KEY.length));
  }
  return out;
}

// --- ES256 signature verification -------------------------------------------
function b64uToBytes(s) {
  var b = atob(String(s).replace(/-/g, "+").replace(/_/g, "/"));
  var a = new Uint8Array(b.length);
  for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
  return a;
}
var _proKey = null;
function importProKey() {
  if (_proKey) return Promise.resolve(_proKey);
  return crypto.subtle
    .importKey("jwk", PRO_PUB_JWK, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"])
    .then(function (k) {
      _proKey = k;
      return k;
    });
}
// Returns {key,email,plan} if the token verifies, else null.
async function verifyProToken(jws) {
  try {
    var parts = String(jws).split(".");
    if (parts.length !== 3) return null;
    var data = new TextEncoder().encode(parts[0] + "." + parts[1]);
    var sig = b64uToBytes(parts[2]);
    if (sig.length !== 64) return null; // P-256 r||s
    var key = await importProKey();
    var ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, sig, data);
    if (!ok) return null;
    var pl = JSON.parse(new TextDecoder().decode(b64uToBytes(parts[1])));
    if (!pl || !pl.plan || !pl.email) return null;
    if (pl.exp && Date.now() / 1000 > pl.exp) return null; // expired
    return { key: pl.key, email: pl.email, plan: pl.plan };
  } catch (e) {
    return null;
  }
}

// Pro entitlement = signature-verified credential (never a plain stored object).
async function getProEntitlement() {
  try {
    var s = await chrome.storage.local.get(PRO_STORE_KEY);
    var raw = s && s[PRO_STORE_KEY];
    if (!raw) return null;
    return await verifyProToken(deobf(raw));
  } catch (e) {
    return null;
  }
}

// Store only if the signature verifies; returns the entitlement or null.
async function saveProEntitlement(jws) {
  var ent = await verifyProToken(jws);
  if (!ent) return null;
  var o = {};
  o[PRO_STORE_KEY] = obf(jws);
  await chrome.storage.local.set(o);
  return ent;
}

// Testing/local activation entry point — still goes through the real verify path,
// so loading a forged token does nothing. Used to load the pre-signed test token.
window.wemdLoadProToken = function (jws) {
  return saveProEntitlement(String(jws).trim());
};
