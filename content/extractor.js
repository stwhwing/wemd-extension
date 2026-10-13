// WeMD content-side extractor.
// Injected after readability.js + turndown.js (isolated world, shared globals).
// Exposes window.__wemdExtract({selectionOnly}) -> {ok,title,md,stats,meta,url,error}
// Everything runs locally in the page context; the extension makes ZERO network requests.

(function () {
  if (window.__wemdExtract) return; // idempotent re-injection

  var WX_HOST = /(^|\.)mp\.weixin\.qq\.com$/i;

  function tok(chars) {
    return Math.round((chars || 0) / 4);
  }

  // --- WeChat-specific preprocessing -------------------------------------
  function isWeChat() {
    return WX_HOST.test(location.hostname || "");
  }

  function fixWeChatImages(root) {
    // WeChat lazy-loads images via data-src; move it to src so links survive.
    var imgs = root.querySelectorAll("img[data-src]");
    for (var i = 0; i < imgs.length; i++) {
      var ds = imgs[i].getAttribute("data-src");
      if (ds && !imgs[i].getAttribute("src")) imgs[i].setAttribute("src", ds);
    }
    // drop invisible placeholders / programmatic nodes that pollute markdown
    root.querySelectorAll("script,style,noscript,svg,mp-common-profiecard").forEach(function (n) {
      n.remove();
    });
  }

  function weChatExtract() {
    var body = document.querySelector("#js_content");
    if (!body) return null;
    var clone = body.cloneNode(true);
    fixWeChatImages(clone);

    var title = "";
    var t = document.querySelector("#activity-name");
    if (t) title = (t.textContent || "").trim();
    if (!title) {
      var og = document.querySelector('meta[property="og:title"]');
      if (og) title = (og.getAttribute("content") || "").trim();
    }
    var account = "";
    var a = document.querySelector("#js_name");
    if (a) account = (a.textContent || "").trim();
    var time = "";
    var tm = document.querySelector("#publish_time");
    if (tm) time = (tm.textContent || "").trim();

    var meaningful = (clone.textContent || "").replace(/\s+/g, "").length;
    if (meaningful < 80) return null; // reader shell / challenge page

    var header = "# " + (title || document.title || "WeChat Article") + "\n\n";
    if (account || time) {
      header += "> " + [account ? "公众号 " + account : "", time].filter(Boolean).join(" ｜ ") + "\n\n---\n\n";
    }
    return { header: header, bodyHtml: clone.innerHTML, title: title || document.title };
  }

  // --- Table rule for Turndown (simple pipe table) ------------------------
  function addTableRule(td) {
    td.addRule("pipeTable", {
      filter: ["table"],
      replacement: function (content, node) {
        var rows = Array.prototype.slice.call(node.querySelectorAll("tr"));
        if (!rows.length) return content || "";
        var lines = [];
        rows.forEach(function (tr, idx) {
          var cells = Array.prototype.slice.call(tr.querySelectorAll("th,td"));
          var line = "| " + cells.map(function (c) {
            return (c.textContent || "").trim().replace(/\|/g, "\\|").replace(/\n/g, " ");
          }).join(" | ") + " |";
          lines.push(line);
          if (idx === 0) {
            lines.push("|" + cells.map(function () { return " --- "; }).join("|") + "|");
          }
        });
        return "\n\n" + lines.join("\n") + "\n\n";
      },
    });
  }

  // --- Code block language preservation ----------------------------------
  // Turndown's default fenced rule drops the language tag. Tech readers paste
  // into LLMs where language hints matter (and Mermaid diagrams need the tag).
  function addCodeBlockRule(td) {
    td.addRule("fencedCodeWithLang", {
      filter: function (node) {
        return node.nodeName === "PRE" && node.querySelector("code");
      },
      replacement: function (content, node) {
        var code = node.querySelector("code");
        var lang = "";
        // language-xxx / lang-xxx class, data-lang attr, or mermaid container
        var cls = (code.getAttribute("class") || "") + " " + (node.getAttribute("class") || "");
        var m = cls.match(/(?:language|lang|highlight)-([a-z0-9+#]+)/i);
        if (m) {
          lang = m[1].toLowerCase();
        } else if (code.getAttribute("data-lang") || node.getAttribute("data-lang")) {
          lang = (code.getAttribute("data-lang") || node.getAttribute("data-lang")).toLowerCase();
        } else if (/\bmermaid\b/i.test(cls)) {
          lang = "mermaid";
        }
        var text = (code.textContent || "").replace(/\n$/, "");
        var fence = "```";
        // longer fence if the code itself contains backticks
        while (text.indexOf(fence) !== -1) fence += "`";
        return "\n\n" + fence + lang + "\n" + text + "\n" + fence + "\n\n";
      },
    });
  }

  function makeTurndown() {
    var td = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
      emDelimiter: "*",
    });
    td.remove(["script", "style", "noscript", "form", "svg", "button",
      ".sp-wrapper", ".sp-stack", ".sp-code-editor", "[class*='sandpack']"]);
    addTableRule(td);
    addCodeBlockRule(td);
    return td;
  }

  // Remove elements that are hidden in the live page (CSS class / inline style).
  // Readability only checks inline styles & hidden attrs on the clone, where
  // computed styles are unavailable — so we walk the ORIGINAL document and
  // prune the same-index nodes from the clone. Fixes e.g. python.org's
  // "Notice: this page displays a fallback" banner (hidden via stylesheet).
  function pruneHidden(originalRoot, clonedRoot) {
    try {
      var orig = originalRoot.querySelectorAll("*");
      var clon = clonedRoot.querySelectorAll("*");
      var limit = Math.min(orig.length, clon.length);
      var toRemove = [];
      for (var i = 0; i < limit; i++) {
        var cs = getComputedStyle(orig[i]);
        if (cs.display === "none" || cs.visibility === "hidden") toRemove.push(clon[i]);
      }
      toRemove.forEach(function (n) {
        if (n.parentNode) n.parentNode.removeChild(n);
      });
    } catch (e) { /* best effort — never break extraction over cleanup */ }
  }

  // --- Main entry ----------------------------------------------------------
  window.__wemdExtract = function (opts) {
    opts = opts || {};
    try {
      var rawHtml = document.documentElement.outerHTML || "";
      var title = document.title || "";
      var md = "";
      var basis = "full page";
      var meta = {};

      if (opts.selectionOnly) {
        var sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
          return { ok: false, error: "未选中内容 / no selection" };
        }
        var container = document.createElement("div");
        container.appendChild(sel.getRangeAt(0).cloneContents());
        fixWeChatImages(container);
        var tdSel = makeTurndown();
        md = tdSel.turndown(container.innerHTML);
        title = "selection";
        basis = "selection";
      } else if (isWeChat()) {
        var wx = weChatExtract();
        if (wx) {
          var tdWx = makeTurndown();
          md = wx.header + tdWx.turndown(wx.bodyHtml);
          title = wx.title;
          meta.account = (document.querySelector("#js_name") || {}).textContent || "";
          meta.time = (document.querySelector("#publish_time") || {}).textContent || "";
          basis = "WeChat article (#js_content)";
        }
      }

      if (!md) {
        // Generic path: Readability on a cloned DOM (it mutates its input).
        var clone = document.cloneNode(true);
        // Remove no-JS fallback blocks and CSS-hidden chrome (stylesheets hide
        // elements by class; Readability cannot see that on a detached clone).
        clone.querySelectorAll("noscript").forEach(function (n) { n.remove(); });
        pruneHidden(document.body, clone.body || clone.querySelector("body") || clone);
        // keepClasses: preserve code language-* / lang-* classes so the fenced
        // rule can emit ```python etc. (Readability strips classes by default).
        var parsed = new Readability(clone, { keepClasses: true }).parse();
        if (!parsed || !parsed.content) {
          return { ok: false, error: "Readability 无法提取正文 / no readable content" };
        }
        var tdGen = makeTurndown();
        md = tdGen.turndown(parsed.content);
        title = parsed.title || title;
      }

      var rawTok = tok(rawHtml.length);
      var mdTok = tok(md.length);
      var saved = rawTok - mdTok;
      var pct = rawTok > 0 ? Math.round((saved / rawTok) * 100) : 0;
      // Feed/app-page heuristic: huge page, tiny extraction -> warn the user
      // instead of silently returning a near-empty result.
      var feedLike = md.length < 200 && rawHtml.length > 500000;

      return {
        ok: true,
        title: title,
        md: md,
        url: location.href,
        basis: basis,
        meta: meta,
        feedLike: feedLike,
        stats: {
          rawTok: rawTok,
          mdTok: mdTok,
          savedTok: saved,
          savedPct: pct,
          estimator: "chars/4 heuristic (CJK 偏差较大 / CJK-biased)",
        },
      };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e).slice(0, 160) };
    }
  };
})();
