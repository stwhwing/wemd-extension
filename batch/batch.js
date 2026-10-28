// WeMD batch conversion — runs in a dedicated extension TAB (batch/batch.html).
// Why a tab and not the popup (Firefox real-device evidence, 2026-10-26 #7):
// a permissions.request() from the popup dies when the doorhanger takes focus
// and the popup closes — the one-time grant never resolves. A regular tab
// survives focus loss, so the grant, the orchestration and the progress UI all
// live here. Extraction itself is delegated to the background service
// (message "wemd-bg-extract" -> injectAndExtract), keeping the Firefox-proven
// v5/v6 injection channel single-sourced in background.js.
(function () {
  "use strict";

  var ALL_URLS = "<all_urls>";

  // Minimal bilingual UI (follows the popup's stored language preference).
  var STR = {
    en: {
      h: "WeMD Batch Convert",
      sub: "Converts every open http(s) tab in this window into one merged Markdown file. Everything runs locally.",
      needPro: "Batch conversion is a Pro feature. Activate Pro in the WeMD popup first, then reopen this page.",
      grantBtn: "Allow access to all tabs & start",
      startBtn: "Start batch conversion",
      withimg: "Bundle images into an export folder (md + images/)",
      imgDl: function (d, n) { return "Downloading images " + d + "/" + n + "…"; },
      folderDone: function (n, folder) { return "✅ Exported " + n + " tabs + images into Downloads/" + folder + "/"; },
      denied: "Access was not granted. Click the button again to retry.",
      scanning: "Scanning tabs…",
      converting: function (d, n, ti) { return "Converting " + d + "/" + n + " — " + ti; },
      ok: "✓ converted",
      bad: "✕ skipped",
      none: "No convertible tabs found.",
      downloading: "Merging & exporting…",
      done: function (n, tok) { return "✅ Exported " + n + " tabs (~" + tok + " tok) — check your downloads."; },
      srcFail: function (u, e) { return String(u).slice(0, 60) + " — " + String(e || "").slice(0, 80); },
    },
    zh: {
      h: "WeMD 批量转换",
      sub: "把当前窗口所有打开的 http(s) 标签页合并转换为一个 Markdown 文件。全程本地处理，零外发。",
      needPro: "批量转换是 Pro 功能。请先在 WeMD 弹窗中激活 Pro，再重新打开本页。",
      grantBtn: "允许访问所有标签页并开始",
      startBtn: "开始批量转换",
      withimg: "把图片一并打包进导出文件夹（md + images/）",
      imgDl: function (d, n) { return "正在下载图片 " + d + "/" + n + "…"; },
      folderDone: function (n, folder) { return "✅ 已导出 " + n + " 个标签页及图片到 Downloads/" + folder + "/"; },
      denied: "未获得授权。请再次点击按钮重试。",
      scanning: "正在扫描标签页…",
      converting: function (d, n, ti) { return "转换中 " + d + "/" + n + " — " + ti; },
      ok: "✓ 已转换",
      bad: "✕ 已跳过",
      none: "没有可转换的标签页。",
      downloading: "合并导出中…",
      done: function (n, tok) { return "✅ 已合并导出 " + n + " 个标签页（约 " + tok + " tok），请查看下载。"; },
      srcFail: function (u, e) { return String(u).slice(0, 60) + " — " + String(e || "").slice(0, 80); },
    },
  };
  var S = STR.en;

  function $(id) { return document.getElementById(id); }
  function show(id) { $(id).classList.remove("hidden"); }

  function bgExtract(tabId) {
    return new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage({ type: "wemd-bg-extract", tabId: tabId, selectionOnly: false }, function (res) {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(res || { ok: false, error: "empty response" });
        });
      } catch (e) {
        resolve({ ok: false, error: String((e && e.message) || e) });
      }
    });
  }

  async function runBatch() {
    var line = $("p-line");
    line.textContent = S.scanning;
    // Per-article front-matter template (Pro, v0.4.7) — read once, empty = off.
    var fmTpl = "";
    try {
      var fmStore = await chrome.storage.local.get("wemd.fm.v1");
      fmTpl = (fmStore && fmStore["wemd.fm.v1"]) || "";
    } catch (e) {}
    var tabs = await chrome.tabs.query({ currentWindow: true });
    var targets = tabs.filter(function (t) {
      return t.id && t.id > 0 && /^https?:/i.test(t.url || "");
    });
    if (!targets.length) {
      line.textContent = S.none;
      return;
    }
    var rows = $("p-rows");
    var parts = [];
    var done = 0;
    for (var i = 0; i < targets.length; i++) {
      var tab = targets[i];
      var row = document.createElement("div");
      row.className = "row";
      var tt = document.createElement("span");
      tt.className = "t";
      tt.textContent = (tab.title || tab.url || "Untitled").slice(0, 70);
      var st = document.createElement("span");
      st.className = "s";
      row.appendChild(tt);
      row.appendChild(st);
      rows.appendChild(row);
      line.textContent = S.converting(done + 1, targets.length, (tab.title || "").slice(0, 40));

      var res = await bgExtract(tab.id);
      done++;
      if (res && res.ok && res.md) {
        st.textContent = S.ok;
        var body = "# " + (res.title || tab.title || "Untitled") + "\n\nSource: " + (res.url || tab.url || "") + "\n\n" + res.md;
        var fm = wemdRenderFrontMatter(fmTpl, {
          title: res.title || tab.title || "",
          url: res.url || tab.url || "",
          site: String(res.url || tab.url || "").replace(/^https?:\/\/([^\/?#]+).*$/i, "$1"),
          author: (res.meta && res.meta.author) || "",
          account: (res.meta && res.meta.account) || "",
          date: (res.meta && res.meta.time) || new Date().toISOString().slice(0, 10),
        });
        parts.push(fm + body);
      } else {
        st.textContent = S.bad;
        st.className = "s bad";
        var why = document.createElement("div");
        why.className = "row";
        why.style.color = "#c0392b";
        why.textContent = S.srcFail(tab.url, res && res.error);
        rows.appendChild(why);
      }
    }
    if (!parts.length) {
      line.textContent = S.none;
      return;
    }
    var merged = parts.join("\n\n---\n\n");
    var withImg = false;
    try { withImg = !!$("withimg").checked; } catch (e) {}
    if (withImg) {
      // Folder export (v0.4.7 Pro): md + images/ land inside Downloads/<folder>/
      // silently (saveAs:false) so the rewritten relative image links resolve
      // as-is. chrome.downloads fetches the images itself — no CORS involved.
      line.textContent = S.downloading;
      var plan = wemdPlanImageExports(merged);
      var folder = "wemd-export-" + new Date().toISOString().slice(0, 10);
      for (var im = 0; im < plan.images.length; im++) {
        line.textContent = S.imgDl(im + 1, plan.images.length);
        try {
          await chrome.downloads.download({
            url: plan.images[im].url,
            filename: folder + "/" + plan.images[im].filename,
            saveAs: false,
            conflictAction: "uniquify",
          });
        } catch (e) { /* one failed image must not kill the export */ }
      }
      await chrome.downloads.download({
        url: "data:text/markdown;charset=utf-8," + encodeURIComponent(plan.md),
        filename: folder + "/wemd-batch.md",
        saveAs: false,
        conflictAction: "uniquify",
      });
      line.textContent = S.folderDone(targets.length, folder);
      $("preview").textContent = plan.md.slice(0, 4000) + (plan.md.length > 4000 ? "\n\n…" : "");
      show("result");
      return;
    }
    line.textContent = S.downloading;
    var stamp = new Date().toISOString().slice(0, 10);
    await chrome.downloads.download({
      url: "data:text/markdown;charset=utf-8," + encodeURIComponent(merged),
      filename: "wemd-batch-" + stamp + ".md",
      saveAs: true,
    });
    line.textContent = S.done(parts.length, Math.round(merged.length / 4).toLocaleString());
    $("preview").textContent = merged.slice(0, 4000) + (merged.length > 4000 ? "\n\n…" : "");
    show("result");
  }

  async function init() {
    try {
      var s = await chrome.storage.local.get("lang");
      if (s && s.lang && STR[s.lang]) S = STR[s.lang];
    } catch (e) { /* default EN */ }
    $("h").textContent = S.h;
    $("sub").textContent = S.sub;

    var pro = null;
    try { pro = await getProEntitlement(); } catch (e) { pro = null; }
    if (!pro) {
      $("gate-msg").textContent = S.needPro;
      return;
    }

    // Export options are chosen BEFORE anything runs (v0.4.7): the checkbox
    // switches between the classic single-file save dialog and the silent
    // folder export (md + images/). Auto-run gives way to an explicit Start
    // so the option can never be missed.
    $("imglabel").textContent = S.withimg;
    $("imgrow").classList.remove("hidden");
    var begin = async function () {
      $("imgrow").classList.add("hidden");
      $("start").classList.add("hidden");
      $("grant").classList.add("hidden");
      $("gate-msg").textContent = "";
      show("progress");
      await runBatch();
    };
    var granted = false;
    try { granted = await chrome.permissions.contains({ origins: [ALL_URLS] }); } catch (e) {}
    if (granted) {
      var sb = $("start");
      sb.textContent = S.startBtn;
      sb.classList.remove("hidden");
      sb.addEventListener("click", begin);
      return;
    }
    // Not granted yet: the button click is the user gesture that powers
    // permissions.request — from a real tab this survives the doorhanger.
    var btn = $("grant");
    btn.textContent = S.grantBtn;
    btn.classList.remove("hidden");
    btn.addEventListener("click", async function () {
      var ok = false;
      try { ok = await chrome.permissions.request({ origins: [ALL_URLS] }); } catch (e) { ok = false; }
      if (!ok) {
        $("gate-msg").textContent = S.denied;
        return;
      }
      await begin();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
