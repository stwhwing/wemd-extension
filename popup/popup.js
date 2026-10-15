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
    batch_converting: function (n, t, ti) { return "Converting " + n + "/" + t + " — " + ti; },
    batch_none: "No convertible tabs found",
    batch_done: function (n, tok) { return "✅ Exported " + n + " tabs (~" + tok.toLocaleString() + " tok)"; },
    pro_activate: "Activate Pro",
    pro_active_text: function (p, e) { return "Pro activated · " + p.toUpperCase() + " · " + e; },
    pro_inactive: "Pro not activated — batch conversion requires Pro",
    pro_key_ph: "License key (WEMD-XXXXX-…)", pro_email_ph: "Purchase email",
    pro_activate_btn: "Activate", cancel: "Cancel",
    pro_verifying: "Verifying…", pro_activated_ok: "✅ Pro activated!", pro_failed: "❌ Activation failed",
    network_error: "❌ Network error",
    ai_label_cn: "CN AI (direct):", ai_label_gl: "Global AI (proxy):",
    toast_copied: function (t) { return "Copied (" + t.toLocaleString() + " tok) → paste with Ctrl+V in the new tab"; },
    toast_clip_fail: "Clipboard write failed — copy from the preview box",
    toast_opened: function (n) { return n + " opened (content prefilled; login may be required)"; },
    err_no_result: "No result", err_convert_failed: "Conversion failed",
    err_browser_internal: "Cannot convert browser-internal pages",
    err_inject: "Cannot inject into this page (e.g. Web Store)",
    gh_link: "GitHub", site_link: "Website"
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
    batch_converting: function (n, t, ti) { return "转换中 " + n + "/" + t + " — " + ti; },
    batch_none: "没有可转换的标签页",
    batch_done: function (n, tok) { return "✅ 已合并导出 " + n + " 个标签页（约 " + tok.toLocaleString() + " tok）"; },
    pro_activate: "激活 Pro",
    pro_active_text: function (p, e) { return "Pro 已激活 · " + p.toUpperCase() + " · " + e; },
    pro_inactive: "Pro 未激活 — 批量转换等功能需激活",
    pro_key_ph: "许可证密钥（WEMD-XXXXX-…）", pro_email_ph: "购买邮箱",
    pro_activate_btn: "激活", cancel: "取消",
    pro_verifying: "验证中…", pro_activated_ok: "✅ Pro 已激活！", pro_failed: "❌ 激活失败",
    network_error: "❌ 网络错误",
    ai_label_cn: "国内（直连）:", ai_label_gl: "国际（需代理）:",
    toast_copied: function (t) { return "已复制全文（" + t.toLocaleString() + " tok）→ 在新标签页 Ctrl+V 粘贴"; },
    toast_clip_fail: "剪贴板写入失败，请手动从预览框复制",
    toast_opened: function (n) { return n + " 已打开（内容已预填，如未登录会先要求登录）"; },
    err_no_result: "无结果", err_convert_failed: "转换失败",
    err_browser_internal: "此页面无法转换（浏览器内部页）",
    err_inject: "此页面无法注入脚本（如 Web Store 页）",
    gh_link: "GitHub", site_link: "网站"
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
  $("ailabel-cn").textContent = t("ai_label_cn");
  $("ailabel-gl").textContent = t("ai_label_gl");
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

// --- Pro license ------------------------------------------------------------
var LICENSE_API = "https://zyx.pink/wemd-api";

async function getPro() {
  const s = await chrome.storage.local.get("proLicense");
  return s.proLicense || null;
}

async function renderProBar() {
  const pro = await getPro();
  const badge = $("probadge"), text = $("protext"), btn = $("probtn");
  $("probar").classList.remove("hidden");
  if (pro) {
    badge.classList.remove("hidden");
    text.textContent = t("pro_active_text")(pro.plan, pro.email);
    btn.classList.add("hidden");
    $("proform").classList.add("hidden");
    $("batch").classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
    text.textContent = t("pro_inactive");
    btn.classList.remove("hidden");
    $("batch").classList.add("hidden");
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
      body: JSON.stringify({ license_key: $("prokey").value.trim(), email: $("proemail").value.trim() }),
    });
    const j = await r.json();
    if (j.ok) {
      await chrome.storage.local.set({ proLicense: { key: j.license_key, email: $("proemail").value.trim(), plan: j.plan, activatedAt: Date.now() } });
      msg.textContent = t("pro_activated_ok");
      setTimeout(async function () { $("proform").classList.add("hidden"); await renderProBar(); }, 800);
    } else {
      msg.classList.add("err");
      msg.textContent = "❌ " + (j.error || t("pro_failed"));
    }
  } catch (e) {
    msg.classList.add("err");
    msg.textContent = t("network_error");
  }
});

// --- Batch convert (Pro) ----------------------------------------------------
function setBatchStatus(text) {
  const el = $("batchstatus");
  el.textContent = text;
  el.classList.remove("hidden");
}

$("batch").addEventListener("click", async function () {
  const pro = await getPro();
  if (!pro) return;
  $("batch").disabled = true;
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true, url: ["http://*/*", "https://*/*"] });
    let done = 0;
    const parts = [];
    for (const tab of tabs) {
      setBatchStatus(t("batch_converting")(++done, tabs.length, (tab.title || "").slice(0, 30)));
      try {
        const resp = await chrome.tabs.sendMessage(tab.id, { type: "extract" });
        if (resp && resp.ok && resp.md) parts.push("# " + (resp.title || tab.title || "Untitled") + "\n\nSource: " + tab.url + "\n\n" + resp.md);
      } catch (e) { /* content script not injected - skip */ }
    }
    if (!parts.length) { setBatchStatus(t("batch_none")); return; }
    const merged = parts.join("\n\n---\n\n");
    const stamp = new Date().toISOString().slice(0, 10);
    await chrome.downloads.download({
      url: "data:text/markdown;charset=utf-8," + encodeURIComponent(merged),
      filename: "wemd-batch-" + stamp + ".md", saveAs: true,
    });
    setBatchStatus(t("batch_done")(parts.length, Math.round(merged.length / 4)));
  } finally {
    $("batch").disabled = false;
  }
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
  return "Use the webpage context below as source material. Answer my questions using only this context unless I ask otherwise.\n\n# " + (res.title || "Webpage") + "\n" + res.md;
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
    chrome.scripting.executeScript(
      { target: { tabId: tab.id }, files: ["content/libs/readability.js", "content/libs/turndown.js", "content/extractor.js"] },
      function () {
        if (chrome.runtime.lastError) { showError(chrome.runtime.lastError.message); return; }
        chrome.scripting.executeScript(
          {
            target: { tabId: tab.id },
            func: function (selOnly) { return window.__wemdExtract({ selectionOnly: selOnly }); },
            args: [!!selectionOnly],
          },
          function (results) {
            if (chrome.runtime.lastError) { showError(chrome.runtime.lastError.message); return; }
            var res = results && results[0] ? results[0].result : null;
            if (!res) { showError(t("err_no_result")); return; }
            if (!res.ok) { showError(res.error); return; }
            render(res);
          }
        );
      }
    );
  });
}

$("copy").addEventListener("click", function () {
  if (!LAST || !LAST.md) return;
  navigator.clipboard.writeText(LAST.md).then(function () {
    $("copy").textContent = t("copied");
    setTimeout(function () { $("copy").textContent = t("copy_btn"); }, 1500);
  });
});

$("download").addEventListener("click", function () {
  if (!LAST || !LAST.md) return;
  var safe = (LAST.title || "page").replace(/[\\/:*?"<>|\r\n]+/g, "_").slice(0, 80);
  var blob = new Blob([LAST.md], { type: "text/markdown;charset=utf-8" });
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

chrome.storage.local.get("lang", function (s) {
  LANG = s.lang || "en";
  applyLang();
  $("ver").textContent = chrome.runtime.getManifest().version;
  extract(false);
});
