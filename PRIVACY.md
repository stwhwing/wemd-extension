# Privacy Policy / 隐私政策

**WeMD · Page to Markdown (WeChat-ready)**

_Last updated / 更新: 2026-10-11_

## EN

**WeMD does not collect, transmit, store, or share any of your data. Anywhere. By anyone.**

- All conversion happens **entirely inside your browser**, on your machine.
- **Page content never leaves your browser — conversion is 100% local.** The extension makes no analytics, telemetry, or tracking requests of any kind. The only network call is **Pro license activation**: it sends just your license key and email to `wemd.zyx.pink` for verification — never page content.
- No account, no sign-in, no cloud sync, no advertising, no tracking of any kind.
- Converted Markdown exists only in memory and only for as long as you keep the popup open, until you copy or download it. Nothing is persisted by the extension.
- Permissions explained:
  - `activeTab` + `scripting`: to read and convert the page **you explicitly act on** (popup click / context menu). The extension cannot read any page you have not interacted with through WeMD.
  - `contextMenus`: to provide the right-click "download as Markdown" entries.
  - `clipboardWrite` / `downloads`: to save the converted Markdown to your clipboard or disk when you click Copy / Download.
- The conversion pipeline uses two open-source libraries bundled locally: Mozilla **Readability** (Apache-2.0) and **Turndown** (MIT). They run offline in your browser.

Contact: open an issue at the project repository.

## 中文

**WeMD 不收集、不传输、不存储、不共享您的任何数据——任何情况下、对任何一方。**

- 全部转换**完全在您的浏览器内、您的机器上**完成。
- **网页内容永不离开您的浏览器——转换 100% 本地。** 本扩展不发出任何统计、遥测或追踪请求。唯一的网络调用是 **Pro 许可证激活**：仅将您的许可证密钥和邮箱发送至 `wemd.zyx.pink` 进行验证——绝不发送网页内容。
- 无账号、无登录、无云同步、无广告、无任何跟踪。
- 转换出的 Markdown 仅存在于内存中，弹窗关闭即消失，除非您主动复制或下载。扩展本身不持久化任何内容。
- 权限说明：
  - `activeTab` + `scripting`：仅用于读取并转换**您通过 WeMD 主动操作**的页面（点击弹窗 / 右键菜单）。您未通过 WeMD 操作的页面，扩展无法读取。
  - `contextMenus`：提供右键"下载为 Markdown"菜单项。
  - `clipboardWrite` / `downloads`：在您点击复制 / 下载时，把转换结果写入剪贴板或磁盘。
- 转换管线使用两个本地打包的开源库：Mozilla **Readability**（Apache-2.0）与 **Turndown**（MIT），均在浏览器内离线运行。

联系：在项目仓库提交 Issue。
