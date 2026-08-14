# DS-Harness Desktop

**DS-Harness Desktop**（简称 `dsh-desktop`）把官方 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web 体验封装成可直接安装的 macOS 与 Windows 桌面应用。它会启动一份隔离的本地 Harness runtime，确认服务健康后，再把准确的 loopback 地址加载到加固过的 Electron 窗口中。

> 这是非官方的社区维护项目，不是 DeepSeek 官方发布。DeepSeek Harness 仍是上游 runtime 和产品行为的来源。

![DS-Harness Desktop 预览](site/assets/desktop-preview.svg)

[下载最新版](https://github.com/ouyangyipeng/dsh-desktop/releases/latest) · [产品网站](https://ouyangyipeng.github.io/dsh-desktop/) · [English](README.md) · [dsh-plugin 社区](https://github.com/topics/dsh-plugin)

## 为什么做这个项目

官方 Harness 当前更偏开发者工作流：clone 仓库、执行命令，再打开浏览器。DS-Harness Desktop 在官方 runtime 外面增加了一层很薄的分发和生命周期管理：

- 点击应用图标即可启动，不必手动执行命令和打开浏览器；
- 安装包内置确定版本的 Harness runtime，第一次启动也不需要在线 clone；
- 监督绑定在 `127.0.0.1`、由系统分配端口的 `dsh web` 子进程；
- 启动失败时显示恢复页、脱敏诊断和日志入口；
- 分开检查 Desktop 新版本和官方 Harness 新 revision；
- 每个构建都能追溯 Desktop commit 与官方 Harness commit。

这个项目不会复制一套 Harness 行为。官方仓库以 Git submodule 形式固定在 `upstream/deepseek-harness`，每个安装包都记录自己包含的准确上游 commit。

## 安装

### macOS

1. 从 [Releases](https://github.com/ouyangyipeng/dsh-desktop/releases/latest) 下载与你的 Mac 架构匹配的 `.dmg`。
2. 打开磁盘镜像，把 **DS-Harness Desktop** 拖入 **Applications**。
3. 早期社区构建尚未 notarize，macOS 可能要求你先在 **系统设置 → 隐私与安全性** 中确认一次，再重新打开应用。

### Windows

1. 从 [Releases](https://github.com/ouyangyipeng/dsh-desktop/releases/latest) 下载与你电脑架构匹配的 `.exe`。
2. 运行安装器并选择安装目录。
3. 早期社区构建未签名，Microsoft Defender SmartScreen 可能显示未知发布者。请先核对 release checksum；仅当你信任本仓库和该构建产物时，才使用 SmartScreen 的正常审查流程继续。

未签名构建会多一次确认。本项目不会要求用户关闭 Gatekeeper、SmartScreen、杀毒软件或其他操作系统安全机制。

## Runtime 与数据

应用会以如下参数启动安装包内的 `@deepseek-ai/dsh` CLI：

```text
dsh web --host 127.0.0.1 --port 0
```

只有当子进程输出合法的 loopback URL，且 HTTP readiness probe 成功后，renderer 才会加载页面。Desktop 会在 Electron 的用户应用数据目录下分配独立 `DSH_HOME`，不会修改另一份 CLI checkout 或它的 Harness home。凭据和 provider 配置沿用官方 Harness 的行为；具体配置请查看[官方 Harness 文档](https://github.com/deepseek-ai/deepseek-harness#readme)。

可在 **DS-Harness Desktop → About DS-Harness Desktop** 中查看应用版本、Desktop commit、内置上游 commit 和构建目标。启动恢复页提示诊断时，可使用 **Open Logs Folder** 查看日志。

## 更新

应用内故意把两类更新分开：

- **Check for Updates…** 检查 `dsh-desktop` 已发布版本，并可打开经过校验的 release 页面；
- **Check Harness Updates…** 对比安装包内的上游 commit 与官方 Harness 默认分支，并可打开官方 commit 页面。

第二项检查不会在已安装应用中执行 `git pull`。新的上游 revision 必须在本仓库经过 submodule 更新、构建、测试、runtime staging 和目标平台原生打包验证，才会进入下一版安装包。这样能保证已安装内容不可变、构建来源可复现。

## 开发

需要 Git、Node.js `^22.19.0 || >=24.0.0` 和 pnpm `11.21.0`。

```bash
git clone --recursive https://github.com/ouyangyipeng/dsh-desktop.git
cd dsh-desktop
pnpm install --frozen-lockfile
pnpm upstream:bootstrap
pnpm dev
```

常用命令：

```bash
pnpm upstream:status
pnpm upstream:update
pnpm build
pnpm test
pnpm site:check
pnpm runtime:stage -- --development
pnpm pack -- --development --mac --arm64
```

安装包必须在目标平台原生构建：macOS 产物在 macOS 上构建，Windows 产物在 Windows 上构建。修改 staging 或 release 行为前，请阅读[开发说明](docs/development.md)、[架构说明](docs/architecture.md)和[发布说明](docs/releasing.md)。

## 仓库结构

```text
src/main/                 Desktop 生命周期、安全策略、恢复页和更新检查
scripts/                  上游管理、staging、打包和验证命令
site/                     GitHub Pages 静态产品网站
tests/                    单元、集成、快照和策略测试
upstream/deepseek-harness 以 Git submodule 固定的官方 Harness 源码
```

Desktop 壳子是分发 companion，而不是 Harness 进程内插件。Harness 内部仍然是插件系统；这个仓库位于插件图外，才能在 Harness 尚未加载或启动失败时，继续负责进程所有权、安装包更新和恢复体验。

## 安全与校验

- 保持 renderer sandbox 和 context isolation；关闭 Node integration 与 WebView attachment。
- 页面导航仅允许当前 runtime 的准确 origin；允许的 HTTPS 外链交给系统浏览器打开。
- renderer 权限和下载默认拒绝。
- runtime 诊断有长度上限，进入恢复页或剪贴板前会脱敏凭据类文本。
- Release 同时发布 SHA-256 checksum。批准未签名应用前，请用 `SHA256SUMS` 核对下载文件。

安全问题请私下联系仓库所有者，不要在公开 issue 中粘贴凭据或原始诊断日志。

## License

DS-Harness Desktop 使用 [Apache License 2.0](LICENSE)。内置或 staging 的上游组件保留各自的 license 与 notice，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
