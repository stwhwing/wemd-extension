// WeMD popup logic: auto-extract current tab, show preview + token stats,
// copy/download/batch/send-to-AI. Extraction happens in the page (local).
var LAST = null;
var LANG = "en"; // primary audience is English; persisted in storage.lang

var I18N = {
  en: {
    converting: "Converting…",
    feed_hint: "⚠️ Feed/app page with no article body — open a specific article instead.",
    basis_prefix: "basis: ",
    selection_only: "Convert selection only",
    raw_label: "Original", saved_label: "Saved",
    basis_note: "chars/4 heuristic, CJK-biased",
    copy_btn: "Copy Markdown", copied: "Copied ✓",
    download_btn: "Download .md", reconvert_btn: "Re-convert",
    batch_btn: "Batch convert all tabs (Pro)",
    pro_activate: "Activate Pro",
    pro_active_text: function (p, e) { return "Pro activated · " + p.toUpperCase() + " · " + e; },
    pro_inactive: "Pro not activated — batch conversion requires Pro",
    pro_key_ph: "License key (WEMD-XXXXX-…)", pro_email_ph: "Purchase email",
    pro_activate_btn: "Activate", cancel: "Cancel",
    pro_verifying: "Verifying…", pro_activated_ok: "✅ Pro activated!", pro_failed: "❌ Activation failed",
    network_error: "❌ Network error",
    ai_label_cn: "", ai_label_gl: "AI:",
    toast_copied: function (t) { return "Copied (" + t.toLocaleString() + " tok) → paste with Ctrl+V in the new tab"; },
    toast_clip_fail: "Clipboard write failed — copy from the preview box",
    toast_opened: function (n) { return n + " opened (content prefilled; login may be required)"; },
    err_no_result: "No result", err_convert_failed: "Conversion failed",
    err_browser_internal: "Cannot convert browser-internal pages",
    err_inject: "Cannot inject into this page (e.g. Web Store)",
    gh_link: "GitHub", site_link: "Website", fb_link: "Feedback",
    fm_label: "Front-matter template (Pro)",
    fm_ph: "---\ntitle: {{title}}\nurl: {{url}}\nsite: {{site}}\nauthor: {{author}}\ndate: {{date}}\n---",
    fm_save: "Save", fm_clear: "Clear", fm_saved: "✅ Saved", fm_cleared: "Cleared",
    fm_hint: "Vars: {{title}} {{url}} {{site}} {{author}} {{account}} {{date}} — applied on Copy/Download"
  },
  zh: {
    converting: "转换中…",
    feed_hint: "⚠️ 此页面为信息流/应用页，未检测到正文——建议打开具体文章/文档后再转换。",
    basis_prefix: "口径 / basis: ",
    selection_only: "仅转换选中内容",
    raw_label: "原文", saved_label: "节省",
    basis_note: "估算口径 chars/4，CJK 偏差较大",
    copy_btn: "复制 Markdown", copied: "已复制 ✓",
    download_btn: "下载 .md", reconvert_btn: "重新转换",
    batch_btn: "批量转换所有标签页 (Pro)",
    pro_activate: "激活 Pro",
    pro_active_text: function (p, e) { return "Pro 已激活 · " + p.toUpperCase() + " · " + e; },
    pro_inactive: "Pro 未激活 — 批量转换等功能需激活",
    pro_key_ph: "许可证密钥（WEMD-XXXXX-…）", pro_email_ph: "购买邮箱",
    pro_activate_btn: "激活", cancel: "取消",
    pro_verifying: "验证中…", pro_activated_ok: "✅ Pro 已激活！", pro_failed: "❌ 激活失败",
    network_error: "❌ 网络错误",
    ai_label_cn: "国内（直连）:", ai_label_gl: "国际（🌐 需代理）:",
    toast_copied: function (t) { return "已复制全文（" + t.toLocaleString() + " tok）→ 在新标签页 Ctrl+V 粘贴"; },
    toast_clip_fail: "剪贴板写入失败，请手动从预览框复制",
    toast_opened: function (n) { return n + " 已打开（内容已预填，如未登录会先要求登录）"; },
    err_no_result: "无结果", err_convert_failed: "转换失败",
    err_browser_internal: "此页面无法转换（浏览器内部页）",
    err_inject: "此页面无法注入脚本（如 Web Store 页）",
    gh_link: "GitHub", site_link: "网站", fb_link: "反馈",
    fm_label: "Front-matter 模板（Pro）",
    fm_ph: "---\ntitle: {{title}}\nurl: {{url}}\nsite: {{site}}\nauthor: {{author}}\ndate: {{date}}\n---",
    fm_save: "保存", fm_clear: "清空", fm_saved: "✅ 已保存", fm_cleared: "已清空",
    fm_hint: "变量：{{title}} {{url}} {{site}} {{author}} {{account}} {{date}} —— 复制/下载时应用"
  }
};

function t(key) { return (I18N[LANG] && I18N[LANG][key]) || I18N.en[key] || key; }

function applyLang() {
  document.documentElement.lang = LANG === "zh" ? "zh" : "en";
  document.querySelectorAll("[data-i18n]").forEach(function (el) {
    var v = I18N[LANG][el.getAttribute("data-i18n")];
    if (v != null) el.textContent = v;
  });
  document.querySelectorAll("[data-i18n-ph]").forEach(function (el) {
    var v = I18N[LANG][el.getAttribute("data-i18n-ph")];
    if (v != null) el.placeholder = v;
  });
  // AI row labels (2026-10-26 user request): the EN audience gets no
  // proxy/direct hints at all — one neutral "AI:" label on the first visible
  // row, second row unlabeled. The ZH hint lives ONCE in the row label: the
  // per-button 🌐 moved into the （需代理）bracket.
  var lcn = $("ailabel-cn"), lgl = $("ailabel-gl");
  lcn.textContent = t("ai_label_cn");
  lgl.textContent = t("ai_label_gl");
  lcn.style.display = t("ai_label_cn") ? "" : "none";
  lgl.style.display = t("ai_label_gl") ? "" : "none";
  var GL = { "ai-chatgpt": "ChatGPT", "ai-claude": "Claude", "ai-gemini": "Gemini", "ai-perplexity": "Perplexity" };
  Object.keys(GL).forEach(function (id) {
    $(id).textContent = GL[id];
  });
  // Group order follows language habit: EN users see global AI first.
  var cnRow = $("airow"), glRow = $("airow2"), parent = glRow.parentNode;
  if (LANG === "en") { parent.insertBefore(glRow, cnRow); }
  else { parent.insertBefore(cnRow, glRow); }
  $("lang-en").classList.toggle("active", LANG === "en");
  $("lang-zh").classList.toggle("active", LANG === "zh");
  renderProBar();
}

function $(id) { return document.getElementById(id); }

function showStatus(msg, isErr) {
  var el = $("status");
  el.textContent = msg;
  el.className = "status" + (isErr ? " err" : "");
  el.classList.remove("hidden");
}

function render(res) {
  LAST = res;
  $("status").classList.add("hidden");
  $("title").textContent = res.title || "(untitled)";
  $("url").textContent = res.url || "";
  $("ver").textContent = chrome.runtime.getManifest().version;
  $("raw-tok").textContent = res.stats.rawTok.toLocaleString();
  $("md-tok").textContent = res.stats.mdTok.toLocaleString();
  $("saved-tok").textContent = res.stats.savedTok.toLocaleString();
  $("saved-pct").textContent = res.stats.savedPct;
  $("basis").textContent = t("basis_prefix") + res.basis;
  $("preview").textContent = res.md;
  ["stats", "preview", "copy", "download", "reconvert", "airow", "airow2"].forEach(function (id) {
    $(id).classList.remove("hidden");
  });
  if (res.feedLike) showStatus(t("feed_hint"), false);
}

// --- Pro license --------------------------------------------------------------
// The Pro gate (signed entitlement + obfuscated storage + verify helpers) lives
// in ../shared/pro.js — single source of truth shared with batch/batch.html.
// getDeviceId stays here (used only by the popup activation flow).

async function getDeviceId() {
  const s = await chrome.storage.local.get("deviceId");
  if (s.deviceId) return s.deviceId;
  const id = (crypto.randomUUID ? crypto.randomUUID() : "dev-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10));
  await chrome.storage.local.set({ deviceId: id });
  return id;
}

async function renderProBar() {
  const pro = await getProEntitlement();
  const badge = $("probadge"), text = $("protext"), btn = $("probtn");
  $("probar").classList.remove("hidden");
  if (pro) {
    badge.classList.remove("hidden");
    text.textContent = t("pro_active_text")(pro.plan, pro.email);
    btn.classList.add("hidden");
    $("proform").classList.add("hidden");
    $("batch").classList.remove("hidden");
    $("fmarea").classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
    text.textContent = t("pro_inactive");
    btn.classList.remove("hidden");
    $("batch").classList.add("hidden");
    $("fmarea").classList.add("hidden");
  }
}

$("probtn").addEventListener("click", function () {
  $("proform").classList.toggle("hidden");
  $("promsg").classList.add("hidden");
});
$("procancel").addEventListener("click", function () { $("proform").classList.add("hidden"); });

$("prosubmit").addEventListener("click", async function () {
  const msg = $("promsg");
  msg.classList.remove("hidden", "err");
  msg.textContent = t("pro_verifying");
  try {
    const r = await fetch(LICENSE_API + "/license/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ license_key: $("prokey").value.trim(), email: $("proemail").value.trim(), device_id: await getDeviceId() }),
    });
    const j = await r.json();
    if (j.ok && j.token) {
      // The license service signs the entitlement; we only accept a verified signature.
      const ent = await saveProEntitlement(j.token);
      if (ent) {
        msg.textContent = t("pro_activated_ok");
        setTimeout(async function () { $("proform").classList.add("hidden"); await renderProBar(); }, 800);
      } else {
        msg.classList.add("err");
        msg.textContent = "❌ 凭证签名校验失败 / invalid license signature";
      }
    } else if (j.ok && !j.token) {
      // Server has not been upgraded to issue signed credentials yet.
      msg.classList.add("err");
      msg.textContent = "❌ license 服务未签发签名凭证（请联系客服）/ server issued no signed credential";
    } else {
      msg.classList.add("err");
      msg.textContent = "❌ " + (j.error || t("pro_failed"));
    }
  } catch (e) {
    msg.classList.add("err");
    msg.textContent = t("network_error");
  }
});

// --- Batch convert (Pro) — runs in a dedicated extension TAB -----------------
// Firefox real-device evidence (2026-10-26, #7): a permissions.request() made
// from the popup dies when the doorhanger takes focus and the popup closes —
// the one-time grant never reaches us ("仅在点击允许后" did nothing). A regular
// extension TAB does not close on focus loss, so batch/batch.html owns the
// grant + orchestration; this button just opens it.

// --- Extraction channel v5 (per-file lib injection + func runner) -----------
// Firefox real-device retest findings (2026-10-21, rounds 1-4):
//  a) executeScript({func}) return values -> undefined on Firefox;
//  b) tabs.sendMessage to a dynamically injected listener -> "Receiving end
//     does not exist";
//  c) content -> extension chrome.runtime.sendMessage -> never reached the
//     popup (10s timeout);
//  d) v4 round: a func-injected bootstrap RAN and reported via storage that
//     window.__wemdExtract was missing — i.e. func injection + storage
//     round-trip both work, but the executeScript({files}) batch never
//     delivered extractor.js. Per MDN, on Firefox a script that fails to
//     parse/throw still fulfills the promise with the error in
//     InjectionResult.error — NOT in chrome.runtime.lastError — so the old
//     callback silently swallowed the failure.
// v5 therefore: inject the 3 lib files ONE BY ONE, collecting per-file errors
// from results[].error; then run the runner as a FUNC (proven to execute),
// which writes probe + result into chrome.storage.local; popup polls storage.
// runtime messaging stays as a Chrome fast-path bonus.
var PENDING = {};
chrome.runtime.onMessage.addListener(function (msg) {
  if (!msg || msg.type !== "wemd-result" || !msg.id) return;
  var cb = PENDING[msg.id];
  if (!cb) return;
  delete PENDING[msg.id];
  cb(msg.res || null);
});

// Leading "/" is REQUIRED: Firefox resolves executeScript({files}) paths
// against the CALLING page URL (popup/popup.html), not the extension root —
// round-5 retest showed "Unable to load script: moz-extension://<uuid>/popup/
// content/libs/readability.js". Absolute paths ("/content/...") resolve from
// the extension root on Firefox AND Chrome alike.
var RUNNER_LIBS = ["/content/libs/readability.js", "/content/libs/turndown.js", "/content/extractor.js"];

// Inject one file; resolve with null on success or a short error string.
// Checks BOTH the promise rejection / lastError AND results[].error (the
// Firefox-only per-script error channel documented on MDN).
function injectOneFile(tabId, file) {
  return new Promise(function (resolve) {
    function readResults(results) {
      var r = results && results[0];
      resolve(r && r.error != null ? file + ": " + String(r.error).slice(0, 140) : null);
    }
    var p = chrome.scripting.executeScript({ target: { tabId: tabId }, files: [file] });
    if (p && typeof p.then === "function") {
      p.then(readResults).catch(function (e) {
        resolve(file + ": inject rejected — " + String((e && e.message) || e).slice(0, 120));
      });
    } else {
      chrome.scripting.executeScript({ target: { tabId: tabId }, files: [file] }, function (results) {
        if (chrome.runtime.lastError) resolve(file + ": " + chrome.runtime.lastError.message);
        else readResults(results);
      });
    }
  });
}

// The runner, injected as a func (Firefox-proven to execute and to reach
// storage). Mirrors content/runner.js logic; idempotent per request id.
var RUNNER_FUNC = function (selOnly, libErrs) {
  try {
    chrome.storage.local.get("wemdReq", function (s) {
      var req = s && s.wemdReq;
      if (!req || !req.id) return;
      if (window.__wemdLastReqId === req.id) return; // already handled
      window.__wemdLastReqId = req.id;
      try { chrome.storage.local.set({ wemdProbe: { id: req.id, ts: Date.now() } }); } catch (e) {}
      var res;
      if (libErrs && libErrs.length) {
        res = { ok: false, error: "lib 注入失败 / lib inject errors — " + libErrs.join(" | ") };
      } else if (typeof window.__wemdExtract !== "function") {
        res = { ok: false, error: "runner: extractor missing (libs ran but export not visible)" };
      } else {
        try { res = window.__wemdExtract({ selectionOnly: !!selOnly }); }
        catch (e) { res = { ok: false, error: String((e && e.message) || e).slice(0, 200) }; }
      }
      if (!res || !res.ok) console.error("[WeMD runner] extract failed:", res && res.error);
      try { chrome.storage.local.set({ wemdRes: { id: req.id, ts: Date.now(), res: res } }); } catch (e) {}
      try {
        chrome.runtime.sendMessage({ type: "wemd-result", id: req.id, res: res }, function () {
          void chrome.runtime.lastError;
        });
      } catch (e) { /* secondary only */ }
    });
  } catch (e) { /* master timeout diagnostics will report */ }
};

function runExtract(tabId, selectionOnly, cb) {
  var reqId = "req-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  var settled = false;
  var poll = null;
  function finish(res, err) {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (poll) clearInterval(poll);
    delete PENDING[reqId];
    cb(res, err);
  }
  // Timeout: classify what actually happened using storage evidence.
  var timer = setTimeout(function () {
    chrome.storage.local.get(["wemdRes", "wemdProbe"], function (s) {
      var r = s && s.wemdRes, p = s && s.wemdProbe;
      if (r && r.id === reqId && r.res) {
        finish(r.res, r.res.ok ? null : (r.res.error || "extract failed"));
        return;
      }
      if (p && p.id === reqId) {
        finish(null, "runner 已启动但未完成（页面脚本可能卡住）/ runner started but did not finish (script hang?)");
        return;
      }
      finish(null, "runner 从未执行（注入未生效，或被浏览器/其他扩展拦截）/ runner never ran (injection had no effect)");
    });
  }, 10000);
  // Primary reply channel: poll storage for wemdRes.id === reqId.
  poll = setInterval(function () {
    chrome.storage.local.get("wemdRes", function (s) {
      var r = s && s.wemdRes;
      if (r && r.id === reqId && r.res) {
        finish(r.res, r.res.ok ? null : (r.res.error || "extract failed"));
      }
    });
  }, 250);
  // Secondary fast path: runtime message (Chrome/Edge).
  PENDING[reqId] = function (res) { finish(res, res ? null : "empty result"); };
  // v5 pipeline: write request -> per-file lib injection (each checked) -> func runner.
  chrome.storage.local.set({ wemdReq: { id: reqId, selectionOnly: !!selectionOnly, tabId: tabId } }, function () {
    (async function () {
      var libErrs = [];
      for (var i = 0; i < RUNNER_LIBS.length; i++) {
        var err = await injectOneFile(tabId, RUNNER_LIBS[i]);
        if (err) libErrs.push(err);
        if (settled) return;
      }
      var p = chrome.scripting.executeScript(
        { target: { tabId: tabId }, func: RUNNER_FUNC, args: [!!selectionOnly, libErrs] },
        function (results) {
          var r = results && results[0];
          if (chrome.runtime.lastError) console.warn("[WeMD] runner injection failed:", chrome.runtime.lastError.message);
          else if (r && r.error != null) console.warn("[WeMD] runner threw:", String(r.error).slice(0, 140));
        }
      );
      if (p && typeof p.then === "function") {
        p.catch(function (e) { console.warn("[WeMD] runner injection rejected:", String((e && e.message) || e).slice(0, 140)); });
      }
    })();
  });
}

$("batch").addEventListener("click", async function () {
  const pro = await getProEntitlement();
  if (!pro) return;
  chrome.tabs.create({ url: chrome.runtime.getURL("batch/batch.html") });
  window.close();
});

// --- Send to AI -------------------------------------------------------------
var AI_TARGETS = {
  "ai-deepseek":   { name: "DeepSeek",   base: "https://chat.deepseek.com/" },
  "ai-kimi":       { name: "Kimi",       base: "https://kimi.moonshot.cn/" },
  "ai-doubao":     { name: "豆包",        base: "https://www.doubao.com/chat/" },
  "ai-yuanbao":    { name: "元宝",        base: "https://yuanbao.tencent.com/chat/" },
  "ai-chatgpt":    { name: "ChatGPT",    base: "https://chatgpt.com/", prefill: "https://chatgpt.com/?q=" },
  "ai-claude":     { name: "Claude",     base: "https://claude.ai/new", prefill: "https://claude.ai/new?q=" },
  "ai-perplexity": { name: "Perplexity", base: "https://www.perplexity.ai/", prefill: "https://www.perplexity.ai/search?q=" },
  "ai-gemini":     { name: "Gemini",     base: "https://gemini.google.com/app", prefill: null }
};
var PREFILL_LIMIT = 6000;

function buildPrompt(res) {
  var head = "Use the webpage context below as source material. Answer my questions using only this context unless I ask otherwise.\n\n";
  var md = res.md || "";
  var title = res.title || "Webpage";
  // Site adapters already emit "# <title>" as the md's first line — don't
  // duplicate the title (real-device retest 2026-10-26, item #8).
  var firstLine = md.split("\n", 1)[0] || "";
  if (firstLine === "# " + title) return head + md;
  return head + "# " + title + "\n" + md;
}

function showToast(msg) {
  var el = $("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(function () { el.classList.add("hidden"); }, 6000);
}

function sendToAI(id) {
  if (!LAST || !LAST.md) return;
  var target = AI_TARGETS[id];
  if (!target) return;
  var prompt = buildPrompt(LAST);
  var url = (target.prefill && prompt.length <= PREFILL_LIMIT) ? target.prefill + encodeURIComponent(prompt) : target.base;
  var copyThen = function () {
    return navigator.clipboard.writeText(prompt).then(function () {
      showToast(t("toast_copied")(LAST.stats.mdTok));
    }).catch(function () {
      showToast(t("toast_clip_fail"));
    });
  };
  if (target.prefill && prompt.length <= PREFILL_LIMIT) {
    chrome.tabs.create({ url: url });
    showToast(t("toast_opened")(target.name));
  } else {
    copyThen().then(function () { chrome.tabs.create({ url: url }); });
  }
}

["ai-deepseek", "ai-kimi", "ai-doubao", "ai-yuanbao",
 "ai-chatgpt", "ai-claude", "ai-gemini", "ai-perplexity"].forEach(function (id) {
  $(id).addEventListener("click", function () { sendToAI(id); });
});

function showError(msg) {
  showStatus(friendlyError(msg) || t("err_convert_failed"), true);
}

function friendlyError(msg) {
  if (!msg) return msg;
  if (/Cannot access a chrome:\/\//i.test(msg) || /^chrome|^edge|^about:|^devtools:/i.test(msg)) return t("err_browser_internal");
  if (/Cannot access contents of the page/i.test(msg) || /extension's file/i.test(msg)) return t("err_inject");
  return msg;
}

function extract(selectionOnly) {
  ["stats", "preview", "copy", "download", "reconvert"].forEach(function (id) {
    $(id).classList.add("hidden");
  });
  showStatus(t("converting"));
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    var tab = tabs && tabs[0];
    if (!tab || !tab.id || tab.id < 0 || /^chrome|^edge|^about:/.test(tab.url || "")) {
      showError(t("err_browser_internal"));
      return;
    }
    runExtract(tab.id, selectionOnly, function (res, err) {
      // Failure states keep the Re-convert button visible (v0.4.7): transient
      // injection/extract failures are retryable without reopening the popup.
      // Browser-internal pages stay retry-less — re-running cannot succeed.
      if (err) { showError(friendlyError(err) || t("err_convert_failed")); $("reconvert").classList.remove("hidden"); return; }
      if (!res) { showError(t("err_no_result")); $("reconvert").classList.remove("hidden"); return; }
      if (!res.ok) { showError(res.error); $("reconvert").classList.remove("hidden"); return; }
      render(res);
    });
  });
}

// --- export helpers (Pro front-matter, v0.4.7) --------------------------------
// The template lives in shared/export-utils.js (render) and storage key
// "wemd.fm.v1"; it applies ONLY to Copy/Download output, never to the AI
// prompt (that already carries its own context header).
function fmMeta(res) {
  return {
    title: res.title || "",
    url: res.url || "",
    site: String(res.url || "").replace(/^https?:\/\/([^\/?#]+).*$/i, "$1"),
    author: (res.meta && res.meta.author) || "",
    account: (res.meta && res.meta.account) || "",
    date: (res.meta && res.meta.time) || new Date().toISOString().slice(0, 10),
  };
}

async function exportMd() {
  if (!LAST || !LAST.md) return "";
  try {
    var pro = await getProEntitlement();
    if (!pro) return LAST.md;
    var s = await chrome.storage.local.get("wemd.fm.v1");
    var fm = wemdRenderFrontMatter((s && s["wemd.fm.v1"]) || "", fmMeta(LAST));
    if (fm) return fm + LAST.md;
  } catch (e) { /* front-matter must never break the export */ }
  return LAST.md;
}

$("fmsave").addEventListener("click", function () {
  var v = $("fmtext").value;
  chrome.storage.local.set({ "wemd.fm.v1": v }, function () {
    var m = $("fmmsg");
    m.classList.remove("hidden", "err");
    m.textContent = v.replace(/\s+/g, "") ? t("fm_saved") : t("fm_cleared");
    setTimeout(function () { m.classList.add("hidden"); }, 1500);
  });
});

$("fmclear").addEventListener("click", function () {
  $("fmtext").value = "";
  chrome.storage.local.set({ "wemd.fm.v1": "" }, function () {
    var m = $("fmmsg");
    m.classList.remove("hidden", "err");
    m.textContent = t("fm_cleared");
    setTimeout(function () { m.classList.add("hidden"); }, 1500);
  });
});

$("copy").addEventListener("click", async function () {
  var md = await exportMd();
  if (!md) return;
  navigator.clipboard.writeText(md).then(function () {
    $("copy").textContent = t("copied");
    setTimeout(function () { $("copy").textContent = t("copy_btn"); }, 1500);
  });
});

$("download").addEventListener("click", async function () {
  var md = await exportMd();
  if (!md) return;
  var safe = (LAST.title || "page").replace(/[\\/:*?"<>|\r\n]+/g, "_").slice(0, 80);
  var blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = safe + ".md";
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
});

$("reconvert").addEventListener("click", function () { extract($("sel-only").checked); });
$("sel-only").addEventListener("change", function () { extract($("sel-only").checked); });

// --- language switch + init -------------------------------------------------
$("lang-en").addEventListener("click", function () {
  LANG = "en";
  chrome.storage.local.set({ lang: "en" });
  applyLang();
});
$("lang-zh").addEventListener("click", function () {
  LANG = "zh";
  chrome.storage.local.set({ lang: "zh" });
  applyLang();
});

chrome.storage.local.get(["lang", "wemd.fm.v1"], function (s) {
  LANG = s.lang || "en";
  applyLang();
  $("ver").textContent = chrome.runtime.getManifest().version;
  if (s && s["wemd.fm.v1"]) $("fmtext").value = s["wemd.fm.v1"];
  extract(false);
});
