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

function injectAndExtract(tabId, selectionOnly) {
  return new Promise((resolve) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        files: [
          "content/libs/readability.js",
          "content/libs/turndown.js",
          "content/extractor.js",
        ],
      },
      () => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        chrome.scripting
          .executeScript({
            target: { tabId },
            func: (selOnly) => window.__wemdExtract({ selectionOnly: selOnly }),
            args: [selectionOnly],
          })
          .then((results) => resolve(results && results[0] ? results[0].result : null))
          .catch((e) => resolve({ ok: false, error: String(e).slice(0, 120) }));
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
