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
  ["stats", "preview", "copy", "download", "reconvert"].forEach(function (id) {
    $(id).classList.remove("hidden");
  });
}

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
