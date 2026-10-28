// WeMD shared export utilities — PURE functions only (no chrome.*, no DOM), so
// popup, batch and the Node test harness load this same file verbatim.
// Loaded by popup/popup.html and batch/batch.html BEFORE their page scripts.
(function (global) {
  "use strict";

  // --- front-matter (Pro) ----------------------------------------------------
  // Renders a user template with article metadata. Placeholders:
  //   {{title}} {{url}} {{site}} {{author}} {{account}} {{date}}
  // Design rules:
  //   * unknown/typo placeholders render as "" (they never leak into output)
  //   * an empty/whitespace-only template disables front-matter entirely
  //   * the template owns its "---" delimiters (we stay out of the way)
  function renderFrontMatter(template, meta) {
    var tpl = String(template || "");
    if (!tpl.replace(/\s+/g, "")) return "";
    meta = meta || {};
    var vals = {
      title: meta.title || "",
      url: meta.url || "",
      site: meta.site || "",
      author: meta.author || "",
      account: meta.account || "",
      date: meta.date || "",
    };
    var out = tpl.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, function (m, key) {
      return Object.prototype.hasOwnProperty.call(vals, key) ? vals[key] : "";
    });
    // Dropped placeholders can leave ragged blank lines — collapse them, and
    // bail out entirely if nothing printable survived.
    out = out.replace(/\n{3,}/g, "\n\n");
    if (!out.replace(/\s+/g, "")) return "";
    return out.replace(/\s+$/, "") + "\n\n";
  }

  // --- image bundling (Pro) --------------------------------------------------
  function fileExtFromUrl(url) {
    var u = String(url || "");
    var m = /\.(jpe?g|png|gif|webp|bmp|svg|avif)(?:[?#].*)?$/i.exec(u);
    if (m) return m[1].toLowerCase();
    // WeChat CDN serves extension-less URLs and declares the format as a
    // wx_fmt query parameter (verified on real mmbiz.qpic.cn URLs).
    var w = /[?&]wx_fmt=(jpe?g|png|gif|webp|bmp|svg|avif)\b/i.exec(u);
    if (w) return w[1].toLowerCase();
    return "jpg";
  }

  // Scans a markdown string for inline images (the only form Turndown emits),
  // deduplicates URLs and rewrites every occurrence to a local relative path:
  //   images/img001.jpg
  // Data: URIs are already self-contained and non-http(s) targets are left
  // untouched. Longer URLs are replaced first so that one URL being a prefix
  // of another (e.g. "...jpg" vs "...jpg?x=1") cannot corrupt the rewrite.
  function planImageExports(md) {
    var src = String(md || "");
    var order = [];
    var map = {};
    var re = /!\[[^\]]*\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;
    var m;
    while ((m = re.exec(src))) {
      var url = m[1].replace(/^<|>$/g, "");
      if (!/^https?:\/\//i.test(url)) continue; // data:, relative — leave as-is
      if (!map[url]) {
        var name = "images/img" + String(order.length + 1).padStart(3, "0") + "." + fileExtFromUrl(url);
        map[url] = name;
        order.push({ url: url, filename: name });
      }
    }
    var out = src;
    var keys = Object.keys(map).sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < keys.length; i++) {
      out = out.split(keys[i]).join(map[keys[i]]);
    }
    return { md: out, images: order };
  }

  global.wemdRenderFrontMatter = renderFrontMatter;
  global.wemdPlanImageExports = planImageExports;
  global.wemdFileExtFromUrl = fileExtFromUrl;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
