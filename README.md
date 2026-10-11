# WeMD · Page to Markdown (WeChat-ready)

> 网页 / 公众号文章一键转干净 Markdown —— 本地转换零外发，实时显示 token 节省估算。
> One-click page-to-Markdown — fully local, zero network requests, with quantified token savings.

**EN** WeMD converts the page you are on — including WeChat official-account articles — into clean, LLM-ready Markdown entirely inside your browser. It shows **how many tokens the conversion saves** (chars/4 heuristic) before you paste anything into an AI chat. The extension makes **zero network requests**: no account, no telemetry, no cloud — all conversion is local.

**中文** WeMD 把你正在看的网页（包括微信公众号文章）在浏览器内一键转换为干净、适合大模型输入的 Markdown，并**实时量化"这次转换帮你省了多少 token"**（chars/4 估算口径）。扩展本身**零网络请求**：无账号、无遥测、无云端——全部转换本地完成。

## Why WeMD / 为什么做它

| | WeMD | 通用转 MD 竞品 |
|---|---|---|
| 微信公众号文章 | ✅ 专化抽取（标题/公众号/时间/`#js_content` 正文 + `data-src` 图片修复） | ❌ Readability 对微信效果差 |
| Token 节省量化 | ✅ 实时显示"省 ≈ X tok（-Y%）" | ❌ 只喊口号 |
| 数据外发 | ✅ 零请求（扩展自身不联网） | 多数也本地，但无此声明强度 |

## Install (developer mode) / 安装（开发者模式）

1. Download / clone this folder.
2. Chrome → `chrome://extensions` → enable **Developer mode**.
3. **Load unpacked** → select the `chrome-ext/` folder.
4. Open any page → click the WeMD icon (or `Alt+Shift+M`).

## Use / 使用

- **Popup**：点图标自动转换当前页 → 预览 / 复制 / 下载 `.md`；勾选"仅转换选中内容"处理选区。
- **右键菜单**：`下载整页为 Markdown` / `下载选中内容为 Markdown`。
- **快捷键**：`Alt+Shift+M` 打开弹窗。

## Privacy / 隐私

See [PRIVACY.md](PRIVACY.md): zero network requests, zero data collection. The only permissions are `activeTab`/`scripting` (convert the page you act on), `contextMenus`, `clipboardWrite`, `downloads`.

## Roadmap / 路线图

- [ ] Options page: front-matter template, image handling (keep links / strip / download)
- [ ] Batch: convert all tabs
- [ ] GFM tables via plugin-quality rules (current rule covers simple tables)
- [ ] Firefox / Edge builds
- [ ] Pro: local companion service bridging the [markitdown-skill](https://github.com/stwhwing/markitdown-skill) CLI for PDF/DOCX

## License / 许可

MIT. Bundled libraries: Mozilla Readability (Apache-2.0), Turndown (MIT).
