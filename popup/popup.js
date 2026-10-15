// WeMD popup logic: auto-extract current tab on open, show preview + token stats,
// copy / download buttons. All extraction happens in the page (local); the popup
// itself makes no network requests either.

var LAST = null;

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
  $("basis").textContent = "口径 / basis: " + res.basis;
  $("preview").textContent = res.md;
  ["stats", "preview", "copy", "download", "reconvert", "airow", "airow2"].forEach(function (id) {
    $(id).classList.remove("hidden");
  });
  // Honest hint for app/feed pages: tiny output from a huge page means
  // there was no article to extract (dashboards, feeds, logged-in shells).
  if (res.feedLike) {
    showStatus("⚠️ 此页面为信息流/应用页，未检测到正文——建议打开具体文章/文档后再转换。 "
      + "This looks like a feed/app page with no article body - open a specific article instead.", false);
    $("status").classList.remove("hidden");
  }
}

// --- Pro license ------------------------------------------------------------
const LICENSE_API = "https://zyx.pink/wemd-api";

async function getPro() {
  const s = await chrome.storage.local.get("proLicense");
  return s.proLicense || null;
}

async function renderProBar() {
  const pro = await getPro();
  const bar = $("probar"), badge = $("probadge"), text = $("protext"), btn = $("probtn"), form = $("proform");
  bar.classList.remove("hidden");
  if (pro) {
    badge.classList.remove("hidden");
    text.textContent = `Pro 已激活 · ${pro.plan.toUpperCase()} · ${pro.email}`;
    btn.classList.add("hidden");
    form.classList.add("hidden");
    $("batch").classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
    text.textContent = "Pro 未激活 — 批量转换等功能需激活";
    btn.classList.remove("hidden");
    $("batch").classList.add("hidden");
  }
}

$("probtn").addEventListener("click", () => {
  $("proform").classList.toggle("hidden");
  $("promsg").classList.add("hidden");
});
$("procancel").addEventListener("click", () => $("proform").classList.add("hidden"));

$("prosubmit").addEventListener("click", async () => {
  const msg = $("promsg");
  msg.classList.remove("hidden", "err");
  msg.textContent = "验证中… / verifying…";
  try {
    const r = await fetch(`${LICENSE_API}/license/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ license_key: $("prokey").value.trim(), email: $("proemail").value.trim() }),
    });
    const j = await r.json();
    if (j.ok) {
      await chrome.storage.local.set({ proLicense: { key: j.license_key, email: $("proemail").value.trim(), plan: j.plan, activatedAt: Date.now() } });
      msg.textContent = "✅ Pro 已激活！/ Pro activated!";
      setTimeout(async () => { $("proform").classList.add("hidden"); await renderProBar(); }, 800);
    } else {
      msg.classList.add("err");
      msg.textContent = `❌ ${j.error || "激活失败 / activation failed"}`;
    }
  } catch (e) {
    msg.classList.add("err");
    msg.textContent = "❌ 网络错误 / network error";
  }
});

// --- Batch convert (Pro) ----------------------------------------------------
function setBatchStatus(text) {
  const el = $("batchstatus");
  el.textContent = text;
  el.classList.remove("hidden");
}

$("batch").addEventListener("click", async () => {
  const pro = await getPro();
  if (!pro) return;
  $("batch").disabled = true;
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true, url: ["http://*/*", "https://*/*"] });
    let done = 0;
    const parts = [];
    for (const tab of tabs) {
      setBatchStatus(`转换中 / converting ${++done}/${tabs.length} — ${tab.title?.slice(0, 30) || ""}`);
      try {
        const resp = await chrome.tabs.sendMessage(tab.id, { type: "extract" });
        if (resp?.ok && resp.md) parts.push(`# ${resp.title || tab.title || "Untitled"}\n\nSource: ${tab.url}\n\n${resp.md}`);
      } catch { /* content script not injected - skip */ }
    }
    if (!parts.length) { setBatchStatus("没有可转换的标签页 / no convertible tabs found"); return; }
    const merged = parts.join("\n\n---\n\n");
    const stamp = new Date().toISOString().slice(0, 10);
    await chrome.downloads.download({
      url: "data:text/markdown;charset=utf-8," + encodeURIComponent(merged),
      filename: `wemd-batch-${stamp}.md`, saveAs: true,
    });
    setBatchStatus(`✅ 已合并导出 ${parts.length} 个标签页（约 ${Math.round(merged.length / 4).toLocaleString()} tok）/ exported ${parts.length} tabs`);
  } finally {
    $("batch").disabled = false;
  }
});

// Pro bar render on load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", renderProBar);
} else {
  renderProBar();
}
// CN set: direct connectivity. Global set: requires proxy in CN (marked 🌐).
// None of the CN tools support ?q= prefill -> always copy + open + toast.
var AI_TARGETS = {
  "ai-deepseek":    { name: "DeepSeek",    base: "https://chat.deepseek.com/" },
  "ai-kimi":        { name: "Kimi",        base: "https://kimi.moonshot.cn/" },
  "ai-doubao":      { name: "豆包",         base: "https://www.doubao.com/chat/" },
  "ai-yuanbao":     { name: "元宝",         base: "https://yuanbao.tencent.com/chat/" },
  "ai-chatgpt":     { name: "ChatGPT",     base: "https://chatgpt.com/",    prefill: "https://chatgpt.com/?q=" },
  "ai-claude":      { name: "Claude",      base: "https://claude.ai/new",   prefill: "https://claude.ai/new?q=" },
  "ai-perplexity":  { name: "Perplexity",  base: "https://www.perplexity.ai/", prefill: "https://www.perplexity.ai/search?q=" },
  "ai-gemini":      { name: "Gemini",      base: "https://gemini.google.com/app", prefill: null }
};
var PREFILL_LIMIT = 6000; // chars; above this, copy + manual paste

function buildPrompt(res) {
  return "Use the webpage context below as source material. Answer my questions using only this context unless I ask otherwise.\n\n"
    + "# " + (res.title || "Webpage") + "\n" + res.md;
}

function showToast(msg) {
  var t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(function () { t.classList.add("hidden"); }, 6000);
}

function sendToAI(id) {
  if (!LAST || !LAST.md) return;
  var target = AI_TARGETS[id];
  if (!target) return;
  var prompt = buildPrompt(LAST);
  var url = (target.prefill && prompt.length <= PREFILL_LIMIT)
    ? target.prefill + encodeURIComponent(prompt)
    : target.base;
  var copyThen = function () {
    return navigator.clipboard.writeText(prompt).then(function () {
      showToast("已复制全文（" + LAST.stats.mdTok.toLocaleString() + " tok）→ 在新标签页 Ctrl+V 粘贴");
    }).catch(function () {
      showToast("剪贴板写入失败，请手动从预览框复制");
    });
  };
  if (target.prefill && prompt.length <= PREFILL_LIMIT) {
    chrome.tabs.create({ url: url });
    showToast(target.name + " 已打开（内容已预填，如未登录会先要求登录）");
  } else {
    copyThen().then(function () { chrome.tabs.create({ url: url }); });
  }
}

["ai-deepseek", "ai-kimi", "ai-doubao", "ai-yuanbao",
 "ai-chatgpt", "ai-claude", "ai-gemini", "ai-perplexity"].forEach(function (id) {
  $(id).addEventListener("click", function () { sendToAI(id); });
});

function showError(msg) {
  showStatus(friendlyError(msg) || "转换失败 / conversion failed", true);
}

// Map raw chrome errors to friendly bilingual hints.
function friendlyError(msg) {
  if (!msg) return msg;
  if (/Cannot access a chrome:\/\//i.test(msg) || /^chrome|^edge|^about:|^devtools:/i.test(msg)) {
    return "此页面无法转换（浏览器内部页）/ cannot convert browser-internal pages";
  }
  if (/Cannot access contents of the page/i.test(msg) || /extension's file/i.test(msg)) {
    return "此页面无法注入脚本（如 Web Store 页）/ cannot inject into this page";
  }
  return msg;
}

function extract(selectionOnly) {
  ["stats", "preview", "copy", "download", "reconvert"].forEach(function (id) {
    $(id).classList.add("hidden");
  });
  showStatus("转换中… / converting…");
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    var tab = tabs && tabs[0];
    if (!tab || !tab.id || tab.id < 0 || /^chrome|^edge|^about:/.test(tab.url || "")) {
      showError("此页面无法转换（浏览器内部页）/ cannot convert browser-internal pages");
      return;
    }
    chrome.scripting.executeScript(
      {
        target: { tabId: tab.id },
        files: [
          "content/libs/readability.js",
          "content/libs/turndown.js",
          "content/extractor.js",
        ],
      },
      function () {
        if (chrome.runtime.lastError) {
          showError(chrome.runtime.lastError.message);
          return;
        }
        chrome.scripting.executeScript(
          {
            target: { tabId: tab.id },
            func: function (selOnly) { return window.__wemdExtract({ selectionOnly: selOnly }); },
            args: [!!selectionOnly],
          },
          function (results) {
            if (chrome.runtime.lastError) {
              showError(chrome.runtime.lastError.message);
              return;
            }
            var res = results && results[0] ? results[0].result : null;
            if (!res) { showError("无结果 / no result"); return; }
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
    $("copy").textContent = "已复制 ✓";
    setTimeout(function () { $("copy").textContent = "复制 Markdown / Copy"; }, 1500);
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

$("reconvert").addEventListener("click", function () {
  extract($("sel-only").checked);
});

$("sel-only").addEventListener("change", function () {
  extract($("sel-only").checked);
});

$("ver").textContent = chrome.runtime.getManifest().version;
extract(false);
