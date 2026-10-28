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
    // Lazy-loaded images: WeChat uses data-src; Zhihu uses data-original (full
    // size) / data-actualsrc (preview). Recover the best real URL so links survive.
    var imgs = root.querySelectorAll("img");
    for (var i = 0; i < imgs.length; i++) {
      var im = imgs[i];
      var cur = im.getAttribute("src") || "";
      var cand = im.getAttribute("data-original") || im.getAttribute("data-actualsrc") || im.getAttribute("data-src") || "";
      // Use candidate when current src is missing, a placeholder, or shorter
      // (data-original is the full-size original on Zhihu).
      if (cand && (!cur || /placeholder|loading|blank|lazy|empty/i.test(cur) || cur.length < cand.length)) {
        im.setAttribute("src", cand);
      }
    }
    // drop invisible placeholders / programmatic nodes that pollute markdown
    var junk = root.querySelectorAll("script,style,noscript,svg,mp-common-profiecard,mp-style-type");
    Array.prototype.forEach.call(junk, function (n) { n.remove(); });
  }

  function weChatExtract() {
    var body = document.querySelector("#js_content");
    if (!body) return null;
    var clone = body.cloneNode(true);
    // Index-aligned computed-style pruning MUST run before fixWeChatImages:
    // fixWeChatImages removes junk nodes from the clone, which would shift the
    // positional pairing pruneHidden relies on (original[i] <-> clone[i]).
    pruneHidden(body, clone);
    fixWeChatImages(clone);
    // Attribute-based cleanup is alignment-independent, so it runs after the
    // junk removal: WeChat templates hide duplicated variants with inline
    // display:none (verified in real article HTML 2026-10-28 — both samples
    // carry a hidden <p><mp-style-type></p> inside #js_content), and those
    // subtrees leak images/text into the output otherwise.
    pruneHiddenInline(clone);
    // Author-added promo tails (往期推荐 / 二维码 / book-ad cards) — verified to
    // be the only promo content that lives INSIDE #js_content; everything else
    // (QR block, action bar, "喜欢此内容的人还喜欢") sits outside it.
    stripWeChatPromoTail(clone);

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

  // --- Zhihu adapter -------------------------------------------------------
  // [C] Selectors confirmed structurally against Zhihu parse docs but NOT yet
  // verified on a real logged-in browser — confirm during P1a real-device test.
  var ZHIHU_HOST = /(^|\.)zhihu\.com$/i;
  var ZHIHU_COLUMN_HOST = /(^|\.)zhuanlan\.zhihu\.com$/i;
  // Column HOME page (www.zhihu.com/column/<slug>): intro + article list, not
  // an article. Real-device retest 2026-10-21 showed "No result" here.
  var ZHIHU_COLUMN_HOME = /\/column\/[^\/?#]+\/?$/i;

  function isZhihu() {
    return ZHIHU_HOST.test(location.hostname || "");
  }

  // Column home page -> markdown TOC: column name + intro + linked article list.
  // Selectors are [C] (structural inference) — verify during real-device retest.
  function zhihuColumnHomeExtract() {
    var items = [];
    var seen = {};
    var anchors = document.querySelectorAll('a[href*="/p/"]');
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var href = a.getAttribute("href") || "";
      var m = href.match(/\/p\/(\d+)/);
      if (!m || seen[m[1]]) continue;
      seen[m[1]] = true;
      // Real column pages often use protocol-relative hrefs ("//zhuanlan.zhihu.com/p/…",
      // seen in the 2026-10-21 round-6 retest) — prefixing the host to those doubled
      // the domain. Handle all three forms: absolute, protocol-relative, path-only.
      var abs = /^https?:/i.test(href) ? href
        : href.indexOf("//") === 0 ? "https:" + href
        : "https://zhuanlan.zhihu.com" + (href.charAt(0) === "/" ? "" : "/") + href;
      var titleEl = a.querySelector(".ContentItem-title") || a;
      var ti = (titleEl.textContent || "").replace(/\s+/g, " ").trim();
      if (!ti) continue; // image/meta-only anchor
      // excerpt: nearest list container's RichText (closest missing in some test DOMs)
      var box = a.closest ? (a.closest(".List-item") || a.closest(".Card")) : null;
      if (!box) box = a.parentNode;
      var exEl = box ? box.querySelector(".RichText") : null;
      var excerpt = exEl ? (exEl.textContent || "").replace(/\s+/g, " ").trim().slice(0, 140) : "";
      items.push({ title: ti, url: abs, excerpt: excerpt });
    }
    if (!items.length) return null;

    var colName = "";
    var cn = document.querySelector("h1.ColumnHeader-columnName") ||
             document.querySelector(".ColumnHeader-columnName");
    if (cn) colName = (cn.textContent || "").trim();
    if (!colName) {
      var og = document.querySelector('meta[property="og:title"]');
      if (og) colName = (og.getAttribute("content") || "").trim();
    }
    if (!colName) colName = (document.title || "Zhihu Column").replace(/\s*-\s*知乎\s*$/, "");

    var intro = "";
    var ie = document.querySelector(".ColumnHeader-columnIntro") ||
             document.querySelector("[class*='columnIntro']");
    intro = ie ? (ie.textContent || "").replace(/\s+/g, " ").trim() : "";
    if (!intro) {
      var mdsc = document.querySelector('meta[name="description"]');
      if (mdsc) intro = (mdsc.getAttribute("content") || "").trim();
    }

    var lines = ["# " + (colName || "Zhihu Column"), ""];
    var bits = ["知乎专栏 · " + items.length + " 篇文章"];
    if (intro) bits.push(intro.slice(0, 160));
    lines.push("> " + bits.join(" ｜ "));
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("## 文章列表");
    lines.push("");
    for (var j = 0; j < items.length; j++) {
      lines.push((j + 1) + ". [" + items[j].title + "](" + items[j].url + ")");
      if (items[j].excerpt) lines.push("   > " + items[j].excerpt);
    }
    lines.push("");
    return { directMd: lines.join("\n"), title: colName || document.title, count: items.length };
  }

  function zhihuExtract() {
    if (ZHIHU_COLUMN_HOME.test(location.pathname || "")) {
      return zhihuColumnHomeExtract();
    }
    var isColumn = ZHIHU_COLUMN_HOST.test(location.hostname || "");
    var body = null;
    if (isColumn) {
      // zhuanlan (column) article
      body = document.querySelector(".Post-RichTextContainer") ||
             document.querySelector("article .RichText") ||
             document.querySelector(".RichText");
    } else {
      // question/answer page: take the top answer card's RichText
      body = document.querySelector(".AnswerCard .RichText") ||
             document.querySelector(".AnswerCard") ||
             document.querySelector(".RichText");
    }
    if (!body) return null;
    var clone = body.cloneNode(true);
    fixWeChatImages(clone); // recovers data-src / data-original / data-actualsrc

    // Zhihu wraps entity keywords in "zhida" search-tracking links (500+ char
    // URL each — pure tracking value that bloats the Markdown and wastes AI
    // tokens) and wraps outbound links in link.zhihu.com redirects. Clean both
    // before Turndown. (Real-device retest 2026-10-26, items #5/#6/#8.)
    Array.prototype.forEach.call(clone.querySelectorAll('a[href^="https://zhida.zhihu.com"]'), function (a) {
      var txt = document.createTextNode(a.textContent || "");
      if (a.parentNode) a.parentNode.replaceChild(txt, a);
    });
    Array.prototype.forEach.call(clone.querySelectorAll('a[href^="https://link.zhihu.com/"]'), function (a) {
      var m = /[?&]target=([^&]+)/.exec(a.getAttribute("href") || "");
      if (m) { try { a.setAttribute("href", decodeURIComponent(m[1])); } catch (e) { /* keep original */ } }
    });
    // Zhihu wraps marketplace/ad cards (image + title + price + 去购买) in a
    // single affiliate anchor to union-click.jd.com — pure promo noise, drop.
    // (User-approved 2026-10-26, option C.)
    Array.prototype.forEach.call(clone.querySelectorAll('a[href*="union-click.jd.com"]'), function (a) {
      if (a.parentNode) a.parentNode.removeChild(a);
    });

    // Zhihu injects zero-width chars into text (e.g. trailing U+200B in names).
    function zclean(s) { return String(s || "").replace(/[\u200b\u200c\u200d\ufeff]/g, "").trim(); }
    var title = "";
    var t = document.querySelector(isColumn ? ".Post-Title" : "h1.QuestionHeader-title");
    if (t) title = zclean(t.textContent);
    if (!title) {
      var og = document.querySelector('meta[property="og:title"]');
      if (og) title = zclean(og.getAttribute("content"));
    }

    var author = "";
    var a = document.querySelector(isColumn ? ".Post-Author .AuthorInfo-name" : ".AnswerCard .AuthorInfo-name") ||
             document.querySelector(".AuthorInfo-name");
    if (a) author = zclean(a.textContent);

    var vote = "";
    var v = document.querySelector(".VoteButton--up") || document.querySelector("[itemprop='upvoteCount']");
    if (v) vote = zclean(v.getAttribute("itemprop") ? v.getAttribute("content") : (v.textContent || ""));

    var meaningful = (clone.textContent || "").replace(/\s+/g, "").length;
    if (meaningful < 80) return null; // login wall / shell page

    var header = "# " + (title || document.title || "Zhihu") + "\n\n";
    var bits = [];
    if (author) bits.push("作者 " + author);
    if (vote) bits.push("赞同 " + vote.replace(/^\s*赞同\s*/, ""));
    if (bits.length) header += "> " + bits.join(" ｜ ") + "\n\n---\n\n";
    return { header: header, bodyHtml: clone.innerHTML, title: title || document.title, author: author, vote: vote };
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
        // Priority: our data-wemd-lang (set pre-Readability) > class patterns
        // > data-lang attrs > mermaid container heuristic.
        var sources = [
          code && code.getAttribute("data-wemd-lang"),
          node.getAttribute && node.getAttribute("data-wemd-lang"),
          (code && code.getAttribute("class")) + " " + (node.getAttribute("class") || ""),
          (code && code.getAttribute("data-lang")) || node.getAttribute && node.getAttribute("data-lang")
        ];
        for (var i = 0; i < sources.length && !lang; i++) {
          var src = sources[i];
          if (!src) continue;
          var m = String(src).match(/(?:language|lang|highlight)-([a-z0-9+#]+)/i);
          if (m) lang = m[1].toLowerCase();
          else if (i < 2 && src.length < 20 && /^[a-z0-9+#]+$/.test(src)) lang = src; // data-wemd-lang plain value
          else if (/\bmermaid\b/i.test(src)) lang = "mermaid";
        }
        var text = (code.textContent || "").replace(/\n$/, "");
        var fence = "```";
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

  // Meaningful-text length of an HTML fragment (tags/scripts/styles stripped,
  // whitespace collapsed). Regex-based so it also works on detached clones.
  function meaningfulTextLen(html) {
    return String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, "").length;
  }
  // Shell-page rejection threshold; aligns with the adapters' login-wall check.
  var SHELL_MIN_CHARS = 80;

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

  // Remove subtrees hidden via INLINE style / hidden attribute. pruneHidden()
  // above needs computed styles, which exist only in a live browser; inline
  // styles are readable from any DOM (and from the domino test harness), and
  // inline hiding is exactly how WeChat templates hide duplicate variants.
  function pruneHiddenInline(root) {
    try {
      var all = root.querySelectorAll("[style],[hidden]");
      var toRemove = [];
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        if (el.hasAttribute("hidden")) { toRemove.push(el); continue; }
        var st = el.getAttribute("style") || "";
        if (/display\s*:\s*none|visibility\s*:\s*hidden/i.test(st)) toRemove.push(el);
      }
      toRemove.forEach(function (n) {
        if (n.parentNode) n.parentNode.removeChild(n); // removing an ancestor first makes inner nodes detached; remove() would be a no-op there
      });
    } catch (e) { /* best effort */ }
  }

  // --- shadow-DOM-aware cloning (generic path, v0.4.7) -----------------------
  // Does the live document contain any element with an (open) shadow root?
  function needsShadowClone(root) {
    try {
      var all = root.querySelectorAll("*");
      for (var i = 0; i < all.length; i++) if (all[i].shadowRoot) return true;
    } catch (e) { /* treated as no-shadow */ }
    return false;
  }

  // Deep-copy a document INCLUDING open shadow trees. cloneNode(true) drops
  // shadow content entirely, which is why pages whose article renders inside a
  // custom element (MSN <cp-article> etc.) extracted to nothing. Per host:
  //   * shadow children are copied, STYLE/SCRIPT dropped
  //   * <slot> — at ANY depth of the shadow tree — is replaced by the assigned
  //     light nodes (named or default), or the slot's fallback content when
  //     nothing is assigned (hostCtx carries the owning host through the
  //     recursion; real WeChat/MSN templates nest slots inside wrappers)
  //   * light children are copied only through slot resolution — with slots
  //     they are consumed above, and without slots the browser renders neither
  //     them nor anything else, so copying them would double-count content
  function cloneWithShadow(srcDoc) {
    var out = document.implementation.createHTMLDocument(srcDoc.title || "");
    function copyNode(src, dstParent, hostCtx) {
      if (!src) return;
      if (src.nodeType === 3) {
        dstParent.appendChild(out.createTextNode(src.nodeValue));
        return;
      }
      if (src.nodeType !== 1) return; // comments / PIs / doctype skipped
      if (src.tagName === "SLOT" && hostCtx) {
        copySlot(src, dstParent, hostCtx);
        return;
      }
      // Shadow-scoped rendering instructions are meaningless once flattened
      // (and real templates nest <style> inside wrappers, not only at the
      // shadow root) — drop them at ANY depth of a shadow tree. Light-DOM
      // style/script are left for Readability/Turndown as before.
      if (hostCtx && (src.tagName === "STYLE" || src.tagName === "SCRIPT")) return;
      var el;
      try { el = out.createElement(src.tagName); } catch (e) { return; }
      for (var i = 0; i < src.attributes.length; i++) {
        var a = src.attributes[i];
        try { el.setAttribute(a.name, a.value); } catch (e2) { /* skip bad attr */ }
      }
      if (src.shadowRoot) {
        var sr = src.shadowRoot;
        var sKids = sr.childNodes || [];
        for (var s = 0; s < sKids.length; s++) {
          var sk = sKids[s];
          if (sk.nodeType === 1 && (sk.tagName === "STYLE" || sk.tagName === "SCRIPT")) continue;
          copyNode(sk, el, src);
        }
        dstParent.appendChild(el);
        return;
      }
      var kids = src.childNodes || [];
      for (var k = 0; k < kids.length; k++) copyNode(kids[k], el, hostCtx);
      dstParent.appendChild(el);
    }
    function copySlot(slotEl, dstEl, host) {
      var named = (slotEl.getAttribute && slotEl.getAttribute("name")) || "";
      var assigned = [];
      var hk = host.childNodes || [];
      for (var i = 0; i < hk.length; i++) {
        var k = hk[i];
        if (k.nodeType !== 1 && k.nodeType !== 3) continue;
        if (k.nodeType === 3 && !String(k.nodeValue || "").trim()) continue;
        var kname = k.getAttribute ? (k.getAttribute("slot") || "") : "";
        if (named ? kname === named : !kname) assigned.push(k);
      }
      if (assigned.length) {
        for (var j = 0; j < assigned.length; j++) copyNode(assigned[j], dstEl, null);
      } else {
        var fb = slotEl.childNodes || [];
        for (var f = 0; f < fb.length; f++) copyNode(fb[f], dstEl, null);
      }
    }
    var dstRoot = out.documentElement;
    while (dstRoot.firstChild) dstRoot.removeChild(dstRoot.firstChild);
    var dAttrs = srcDoc.documentElement.attributes || [];
    for (var d = 0; d < dAttrs.length; d++) {
      try { dstRoot.setAttribute(dAttrs[d].name, dAttrs[d].value); } catch (e) {}
    }
    var top = srcDoc.documentElement.childNodes || [];
    for (var t = 0; t < top.length; t++) copyNode(top[t], dstRoot, null);
    return out;
  }

  // Strip AUTHOR-ADDED promo tails at the END of #js_content only — walking
  // backwards over trailing block nodes so clean articles lose nothing.
  // Two strictness tiers keep real content safe:
  //   strong markers (往期推荐/推荐阅读/二维码 CTA…) — block text ≤ 500 chars
  //   weak markers   (推广/广告)                    — block text ≤ 200 chars
  var WX_TAIL_STRONG = /(往期推荐|往期回顾|更多精彩|推荐阅读|延伸阅读|相关阅读|长按识别|长按二维码|扫描二维码|识别二维码|扫码关注|关注公众号|点击.{0,6}关注)/;
  var WX_TAIL_WEAK = /(推广|广告)/;
  function stripWeChatPromoTail(root) {
    var removed = 0;
    var blocks = [];
    for (var n = root.lastChild; n && blocks.length < 8; n = n.previousSibling) {
      if (n.nodeType === 1) blocks.unshift(n);
    }
    // pass 1 — from the end: drop empty spacers and marker-matching blocks
    for (var i = blocks.length - 1; i >= 0; i--) {
      var el = blocks[i];
      var txt = String(el.textContent || "").replace(/\s+/g, "");
      var hasImg = el.querySelector ? !!el.querySelector("img") : false;
      if (!txt && !hasImg) {
        if (el.parentNode) el.parentNode.removeChild(el);
        removed++;
        continue;
      }
      if (txt.length < 500 && WX_TAIL_STRONG.test(txt)) {
        if (el.parentNode) el.parentNode.removeChild(el);
        removed++;
        continue;
      }
      if (txt.length < 200 && WX_TAIL_WEAK.test(txt)) {
        if (el.parentNode) el.parentNode.removeChild(el);
        removed++;
        continue;
      }
      break;
    }
    // pass 2 — promo clusters where the MARKER HEADING and its link list are
    // SIBLING blocks (pass 1 stops at the unmarked list). Cut from the
    // earliest strong-marker block in the tail window through the end, but
    // only when every block in the range stays short (<500 chars) and the
    // whole range is small (<1000 chars) — the fuses that keep real content
    // (long paragraphs, image sections) out of the cut.
    for (var j = 0; j < blocks.length; j++) {
      var el2 = blocks[j];
      if (!el2.parentNode) continue; // already dropped by pass 1
      var t2 = String(el2.textContent || "").replace(/\s+/g, "");
      if (t2 && t2.length < 500 && WX_TAIL_STRONG.test(t2)) {
        var total = 0, ok = true;
        for (var k = j; k < blocks.length; k++) {
          if (!blocks[k].parentNode) continue;
          var tk = String(blocks[k].textContent || "").replace(/\s+/g, "");
          if (tk.length >= 500) { ok = false; break; }
          total += tk.length;
        }
        if (ok && total < 1000) {
          for (var q = j; q < blocks.length; q++) {
            if (blocks[q].parentNode) { blocks[q].parentNode.removeChild(blocks[q]); removed++; }
          }
        }
        break; // at most one promo cluster per article tail
      }
    }
    return removed;
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
      } else if (isZhihu()) {
        var zh = zhihuExtract();
        if (zh) {
          if (zh.directMd) {
            md = zh.directMd; // column home: prebuilt TOC markdown, no Turndown
          } else {
            var tdZh = makeTurndown();
            md = zh.header + tdZh.turndown(zh.bodyHtml);
          }
          title = zh.title;
          meta.author = zh.author || "";
          meta.vote = zh.vote || "";
          if (zh.count) meta.count = zh.count;
          basis = "Zhihu page";
        }
      }

      if (!md) {
        // Generic path: Readability on a cloned DOM (it mutates its input).
        // cloneNode does NOT copy shadow trees, so pages whose article lives
        // inside a custom element (MSN <cp-article> etc.) would extract to
        // nothing — cloneWithShadow flattens open shadow roots instead.
        var useShadow = needsShadowClone(document);
        var clone = useShadow ? cloneWithShadow(document) : document.cloneNode(true);
        // Remove no-JS fallback blocks and CSS-hidden chrome (stylesheets hide
        // elements by class; Readability cannot see that on a detached clone).
        clone.querySelectorAll("noscript") && Array.prototype.forEach.call(clone.querySelectorAll("noscript"), function (n) { n.remove(); });
        // pruneHidden pairs original[i] <-> clone[i] positionally; that pairing
        // only holds for a plain cloneNode (shadow flattening changes counts).
        if (!useShadow) pruneHidden(document.body, clone.body || clone.querySelector("body") || clone);
        // Preserve code language into a data attribute BEFORE Readability:
        // it strips classes (even with keepClasses in some paths) but keeps
        // data-* attributes. The fenced rule reads data-wemd-lang later.
        Array.prototype.forEach.call(clone.querySelectorAll("pre code[class], pre[class], code[class]"), function (c) {
          if (c.getAttribute("data-wemd-lang")) return;
          var cls = c.getAttribute("class") || "";
          var m = cls.match(/(?:language|lang|highlight)-([a-z0-9+#]+)/i);
          if (!m && /\bmermaid\b/i.test(cls)) m = [null, "mermaid"];
          if (m) c.setAttribute("data-wemd-lang", m[1].toLowerCase());
        });
        var parsed = new Readability(clone, { keepClasses: true }).parse();
        if (!parsed || !parsed.content) {
          return { ok: false, error: "Readability 无法提取正文 / no readable content" };
        }
        var tdGen = makeTurndown();
        md = tdGen.turndown(parsed.content);
        title = parsed.title || title;
        // Shell pages (app homes, discovery feeds, login walls that slipped past
        // the site adapters) yield tiny Readability fragments — report a friendly
        // "nothing to extract" instead of junk output. (Real-device 2026-10-26:
        // zhuanlan.zhihu.com discovery page -> 11-tok garbage output.)
        if (meaningfulTextLen(parsed.content) < SHELL_MIN_CHARS) {
          return { ok: false, error: "页面无可提取正文（可能是首页/发现页等导航壳）/ no readable content (app shell page)" };
        }
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
