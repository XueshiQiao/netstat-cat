# Changelog

## v0.1.0 (2026-01-18 ~ 2026-02-11)

### English

#### New Features
- **Migrate from Electron to Tauri v2 + Rust** — Replaced the Electron shell with Tauri v2, using Rust crates `netstat2` and `sysinfo` for cross-platform network socket enumeration and process resolution. Drops the ~150 MB Chromium bundle in favor of the OS native webview, producing a ~5 MB binary. (#1)
- **macOS network connection support** — Added native process and connection list fetching on macOS, with unified process info types across macOS and Windows.
- **Kill process** — Users can now terminate a process directly from the connection list.
- **In-app update checking** — Added a check-for-updates button that queries GitHub releases for newer versions and offers to download and install them via Tauri v2 updater plugin.
- **Aptabase analytics integration** — Integrated Aptabase web SDK for anonymous usage analytics.
- **CI/CD pipeline** — Added GitHub Actions workflow for automated builds on macOS and Windows, with signed updater artifacts and automatic release publishing.

#### Bug Fixes
- Fix duplicate title bar appearing on Windows by removing native decorations.
- Fix title bar drag region for macOS overlay mode and adapt to native traffic light controls.
- Fix Aptabase startup crash by switching from Rust plugin to web SDK.
- Fix duplicate artifact names in CI release workflow.
- Fix build warnings and macOS icon configuration.

#### Improvements
- Refine window controls and move theme toggle to title area.
- Use arrow-path icon for the update button.
- Extract process fetcher logic to separate files for cleaner architecture.
- Hide UID and FD columns on Windows where those fields are unavailable.
- Add app icon and update product name.

#### Documentation
- Add GNU GPL v3 license.
- Add screenshots and update README with cross-references, security features, and bilingual content.
- Add macOS code-signing process documentation (`CI_SIGN_PROCESS.md`).

---

### 中文

#### 新功能
- **从 Electron 迁移到 Tauri v2 + Rust** — 使用 Tauri v2 替换 Electron，后端改用 Rust 的 `netstat2` 和 `sysinfo` 实现跨平台网络连接枚举和进程解析。去掉了约 150 MB 的 Chromium 内核，改用系统原生 WebView，安装包缩小至约 5 MB。(#1)
- **macOS 网络连接支持** — 新增 macOS 上的进程和网络连接列表获取，统一了 macOS 和 Windows 的进程信息数据结构。
- **终止进程** — 支持在连接列表中直接结束指定进程。
- **应用内更新检查** — 新增更新检查按钮，通过 Tauri v2 updater 插件查询 GitHub Releases 并支持下载安装新版本。
- **Aptabase 匿名统计** — 集成 Aptabase Web SDK，用于匿名使用情况统计。
- **CI/CD 自动化构建** — 新增 GitHub Actions 工作流，支持 macOS 和 Windows 自动构建、签名及发布。

#### 问题修复
- 修复 Windows 上出现重复标题栏的问题。
- 修复 macOS 覆盖模式下标题栏拖拽区域异常，适配原生红绿灯按钮位置。
- 修复 Aptabase Rust 插件导致启动崩溃的问题，改用 Web SDK 方案。
- 修复 CI 发布流程中产物名称重复的问题。
- 修复编译警告和 macOS 图标配置。

#### 改进优化
- 优化窗口控件布局，将主题切换按钮移至标题栏区域。
- 更新按钮使用箭头路径图标，更直观。
- 将进程获取逻辑拆分为独立模块，代码结构更清晰。
- Windows 上自动隐藏不支持的 UID 和 FD 列。
- 添加应用图标，更新产品名称。

#### 文档
- 添加 GNU GPL v3 开源许可证。
- 添加应用截图，更新 README 增加双语内容、功能说明和安全特性介绍。
- 添加 macOS 代码签名流程文档（`CI_SIGN_PROCESS.md`）。
