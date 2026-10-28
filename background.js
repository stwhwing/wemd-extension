// WeMD background service worker (MV3)
// Responsibilities: context menus, download-based right-click actions, badge feedback.
// No network requests are ever made by this extension.

const MENU_PAGE = "wemd-download-page";
const MENU_SELECTION = "wemd-download-selection";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_PAGE,
      title: "WeMD：下载整页为 Markdown / Download page as Markdown",
      contexts: ["page"],
    });
    chrome.contextMenus.create({
      id: MENU_SELECTION,
      title: "WeMD：下载选中内容为 Markdown / Download selection as Markdown",
      contexts: ["selection"],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || !tab.id || tab.id < 0) return;
  const selectionOnly = info.menuItemId === MENU_SELECTION;
  injectAndExtract(tab.id, selectionOnly)
    .then((res) => {
      if (!res || !res.ok) {
        flashBadge("✕", res && res.error ? res.error : "extract failed");
        return;
      }
      downloadMarkdown(res);
      flashBadge("✓", "downloaded");
    })
    .catch((e) => {
      flashBadge("✕", String(e).slice(0, 60));
    });
});

// Extraction channel v5 (per-file lib injection + func runner — Firefox-proven).
// Firefox retest findings (2026-10-21, rounds 1-4): func injection + storage
// round-trip work, but the executeScript({files}) batch never delivered the
// extractor, and Firefox reports per-script errors in InjectionResult.error
// (NOT chrome.runtime.lastError — MDN), so the old callback swallowed them.
// v5: inject the 3 lib files one by one collecting results[].error, then run
// the runner as a FUNC, which writes probe + result into chrome.storage.local;
// callers poll storage. runtime messaging stays as a Chrome fast-path bonus.
var BG_PENDING = {};
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  // Batch tab (batch/batch.html) delegates per-tab extraction to the single,
  // Firefox-proven channel below. Async response -> keep the channel open.
  if (msg.type === "wemd-bg-extract" && typeof msg.tabId === "number" && msg.tabId > 0) {
    injectAndExtract(msg.tabId, !!msg.selectionOnly).then(sendResponse);
    return true;
  }
  if (msg.type !== "wemd-result" || !msg.id) return;
  const cb = BG_PENDING[msg.id];
  if (cb) {
    delete BG_PENDING[msg.id];
    cb(msg.res || null);
  }
  return; // synchronous; no async response needed
});

// Leading "/" is REQUIRED: Firefox resolves executeScript({files}) paths
// against the CALLING page URL, not the extension root (round-5 retest
// evidence). Absolute paths work on Firefox AND Chrome alike.
const RUNNER_LIBS = [
  "/content/libs/readability.js",
  "/content/libs/turndown.js",
  "/content/extractor.js",
];

function injectOneFileBg(tabId, file) {
  return new Promise((resolve) => {
    const readResults = (results) => {
      const r = results && results[0];
      resolve(r && r.error != null ? `${file}: ${String(r.error).slice(0, 140)}` : null);
    };
    const p = chrome.scripting.executeScript({ target: { tabId }, files: [file] });
    if (p && typeof p.then === "function") {
      p.then(readResults).catch((e) =>
        resolve(`${file}: inject rejected — ${String((e && e.message) || e).slice(0, 120)}`)
      );
    } else {
      chrome.scripting.executeScript({ target: { tabId }, files: [file] }, (results) => {
        if (chrome.runtime.lastError) resolve(`${file}: ${chrome.runtime.lastError.message}`);
        else readResults(results);
      });
    }
  });
}

// The runner, injected as a func (Firefox-proven to execute and reach storage).
// Mirrors content/runner.js logic; idempotent per request id.
const BG_RUNNER_FUNC = (selOnly, libErrs) => {
  try {
    chrome.storage.local.get("wemdReq", (s) => {
      const req = s && s.wemdReq;
      if (!req || !req.id) return;
      if (window.__wemdLastReqId === req.id) return; // already handled
      window.__wemdLastReqId = req.id;
      try { chrome.storage.local.set({ wemdProbe: { id: req.id, ts: Date.now() } }); } catch (e) {}
      let res;
      if (libErrs && libErrs.length) {
        res = { ok: false, error: "lib inject errors — " + libErrs.join(" | ") };
      } else if (typeof window.__wemdExtract !== "function") {
        res = { ok: false, error: "runner: extractor missing (libs ran but export not visible)" };
      } else {
        try { res = window.__wemdExtract({ selectionOnly: !!selOnly }); }
        catch (e) { res = { ok: false, error: String((e && e.message) || e).slice(0, 200) }; }
      }
      try { chrome.storage.local.set({ wemdRes: { id: req.id, ts: Date.now(), res } }); } catch (e) {}
      try {
        chrome.runtime.sendMessage({ type: "wemd-result", id: req.id, res }, () => {
          void chrome.runtime.lastError;
        });
      } catch (e) { /* secondary only */ }
    });
  } catch (e) { /* master timeout diagnostics will report */ }
};

function injectAndExtract(tabId, selectionOnly) {
  return new Promise((resolve) => {
    const reqId = "bg-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    let settled = false;
    let poll = null;
    function finish(res, err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (poll) clearInterval(poll);
      delete BG_PENDING[reqId];
      resolve(err ? { ok: false, error: err } : res || { ok: false, error: "empty result" });
    }
    const timer = setTimeout(() => {
      chrome.storage.local.get(["wemdRes", "wemdProbe"], (s) => {
        const r = s && s.wemdRes;
        const p = s && s.wemdProbe;
        if (r && r.id === reqId && r.res) {
          finish(r.res, r.res.ok ? null : r.res.error || "extract failed");
          return;
        }
        if (p && p.id === reqId) {
          finish(null, "runner started but did not finish (script hang?)");
          return;
        }
        finish(null, "runner never ran (injection had no effect)");
      });
    }, 10000);
    poll = setInterval(() => {
      chrome.storage.local.get("wemdRes", (s) => {
        const r = s && s.wemdRes;
        if (r && r.id === reqId && r.res) {
          finish(r.res, r.res.ok ? null : r.res.error || "extract failed");
        }
      });
    }, 250);
    BG_PENDING[reqId] = (res) => finish(res, null);
    // v5 pipeline: write request -> per-file lib injection (each checked) -> func runner.
    chrome.storage.local.set(
      { wemdReq: { id: reqId, selectionOnly: !!selectionOnly, tabId } },
      async () => {
        const libErrs = [];
        for (const file of RUNNER_LIBS) {
          const err = await injectOneFileBg(tabId, file);
          if (err) libErrs.push(err);
          if (settled) return;
        }
        const p = chrome.scripting.executeScript(
          { target: { tabId }, func: BG_RUNNER_FUNC, args: [!!selectionOnly, libErrs] },
          (results) => {
            const r = results && results[0];
            if (chrome.runtime.lastError) console.warn("[WeMD bg] runner injection failed:", chrome.runtime.lastError.message);
            else if (r && r.error != null) console.warn("[WeMD bg] runner threw:", String(r.error).slice(0, 140));
          }
        );
        if (p && typeof p.then === "function") {
          p.catch((e) => console.warn("[WeMD bg] runner injection rejected:", String((e && e.message) || e).slice(0, 140)));
        }
      }
    );
  });
}

function downloadMarkdown(res) {
  const safe = (res.title || "page").replace(/[\\/:*?"<>|\r\n]+/g, "_").slice(0, 80);
  const blob = new Blob([res.md], { type: "text/markdown;charset=utf-8" });
  const reader = new FileReader();
  reader.onload = () => {
    chrome.downloads.download({
      url: reader.result,
      filename: safe + ".md",
      saveAs: false,
    });
  };
  reader.readAsDataURL(blob);
}

function flashBadge(text, tooltip) {
  chrome.action.setBadgeText({ text: String(text).slice(0, 4) });
  chrome.action.setTitle({ title: "WeMD — " + tooltip });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 3000);
}
